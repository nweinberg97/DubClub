import fs from 'node:fs/promises';
import path from 'node:path';
import type { JobInfo } from '../../shared/types.ts';
import * as ff from '../media/ffmpeg.ts';
import { EngineError, type Engine } from '../engines/types.ts';
import { log } from '../log.ts';
import { newId, type Storage, type UploadRecord } from '../storage.ts';

export interface JobRecord extends JobInfo {
  sessionHash: string;
}

interface Running {
  controller: AbortController;
}

export class JobQueue {
  private jobs = new Map<string, JobRecord>();
  private waiting: string[] = [];
  private running = new Map<string, Running>();

  constructor(
    private storage: Storage,
    private engine: Engine,
    private concurrency: number,
  ) {}

  /** Restore persisted jobs after a restart. In-flight work is marked failed (retryable). */
  async restore() {
    const root = path.join(this.storage.root, 'sessions');
    const sessions = await fs.readdir(root).catch(() => [] as string[]);
    for (const s of sessions) {
      const ups = await fs.readdir(path.join(root, s, 'uploads')).catch(() => [] as string[]);
      for (const u of ups) {
        const jobs = await fs.readdir(path.join(root, s, 'uploads', u, 'jobs')).catch(() => [] as string[]);
        for (const j of jobs) {
          try {
            const rec = JSON.parse(await fs.readFile(path.join(root, s, 'uploads', u, 'jobs', j, 'job.json'), 'utf8')) as JobRecord;
            if (rec.state === 'queued' || rec.state === 'running') {
              rec.state = 'failed';
              rec.error = { code: 'interrupted', message: 'The server restarted while this was processing. Try again.' };
              rec.finishedAt = new Date().toISOString();
            }
            this.jobs.set(rec.id, rec);
          } catch {
            /* ignore unreadable job */
          }
        }
      }
    }
  }

  get(sessionHash: string, id: string): JobRecord | null {
    const j = this.jobs.get(id);
    return j && j.sessionHash === sessionHash ? j : null;
  }

  listForUpload(sessionHash: string, uploadId: string) {
    return [...this.jobs.values()].filter((j) => j.sessionHash === sessionHash && j.uploadId === uploadId);
  }

  activeCount(sessionHash: string) {
    return [...this.jobs.values()].filter((j) => j.sessionHash === sessionHash && (j.state === 'queued' || j.state === 'running')).length;
  }

  isUploadBusy(uploadId: string) {
    return [...this.jobs.values()].some((j) => j.uploadId === uploadId && (j.state === 'queued' || j.state === 'running'));
  }

  public(job: JobRecord): JobInfo {
    const { sessionHash: _s, ...rest } = job;
    const pos = this.waiting.indexOf(job.id);
    return { ...rest, queuePosition: pos >= 0 ? pos + 1 : null };
  }

  async enqueue(upload: UploadRecord, accent: string, strength: number | null): Promise<JobRecord> {
    const job: JobRecord = {
      id: newId(),
      uploadId: upload.id,
      sessionHash: upload.sessionHash,
      state: 'queued',
      stage: 'waiting',
      segments: null,
      queuePosition: null,
      accent,
      strength,
      engine: { id: this.engine.id, kind: this.engine.describe().kind, config: this.engine.configSummary(accent) },
      error: null,
      createdAt: new Date().toISOString(),
      finishedAt: null,
      output: null,
    };
    await fs.mkdir(this.storage.jobDir(job.sessionHash, job.uploadId, job.id), { recursive: true, mode: 0o700 });
    this.jobs.set(job.id, job);
    this.waiting.push(job.id);
    await this.persist(job);
    log.info('job.queued', { job: job.id, engine: this.engine.id, accent });
    this.pump();
    return job;
  }

  cancel(job: JobRecord) {
    if (job.state === 'queued') {
      this.waiting = this.waiting.filter((id) => id !== job.id);
      this.finish(job, 'cancelled', null);
      return true;
    }
    const r = this.running.get(job.id);
    if (r) {
      r.controller.abort();
      return true;
    }
    return false;
  }

  /** Forget jobs belonging to a deleted upload (cancelling any in flight). */
  dropUpload(sessionHash: string, uploadId: string) {
    for (const j of this.listForUpload(sessionHash, uploadId)) {
      this.cancel(j);
      this.jobs.delete(j.id);
    }
  }

  dropSession(sessionHash: string) {
    for (const j of [...this.jobs.values()]) {
      if (j.sessionHash === sessionHash) {
        this.cancel(j);
        this.jobs.delete(j.id);
      }
    }
  }

  /** Forget in-memory jobs whose files were swept. */
  forgetUploads(uploadIds: string[]) {
    const set = new Set(uploadIds);
    for (const j of [...this.jobs.values()]) if (set.has(j.uploadId)) this.jobs.delete(j.id);
  }

  async idle() {
    while (this.running.size || this.waiting.length) await new Promise((r) => setTimeout(r, 25));
  }

  private pump() {
    while (this.running.size < this.concurrency && this.waiting.length) {
      const id = this.waiting.shift()!;
      const job = this.jobs.get(id);
      if (!job || job.state !== 'queued') continue;
      const controller = new AbortController();
      this.running.set(id, { controller });
      job.state = 'running';
      job.stage = 'preparing';
      void this.persist(job);
      this.process(job, controller.signal)
        .then(() => this.finish(job, 'done', null))
        .catch((err) => {
          if (controller.signal.aborted) return this.finish(job, 'cancelled', null);
          const code = (err as EngineError | ff.MediaError).code ?? 'internal';
          const message =
            err instanceof EngineError || err instanceof ff.MediaError
              ? err.message
              : 'Something went wrong while processing. Your original is safe — try again.';
          log.error('job.failed', { job: job.id, code });
          this.finish(job, 'failed', { code, message });
        })
        .finally(() => {
          this.running.delete(id);
          this.pump();
        });
    }
  }

  private finish(job: JobRecord, state: 'done' | 'failed' | 'cancelled', error: JobRecord['error']) {
    job.state = state;
    job.error = error;
    job.finishedAt = new Date().toISOString();
    if (state === 'done') job.stage = 'finished';
    void this.persist(job);
    log.info('job.' + state, { job: job.id });
  }

  private async persist(job: JobRecord) {
    try {
      const dir = this.storage.jobDir(job.sessionHash, job.uploadId, job.id);
      await fs.writeFile(path.join(dir, 'job.json'), JSON.stringify(job), { mode: 0o600 });
    } catch {
      /* upload deleted mid-flight */
    }
  }

  /** The real pipeline. Every stage reported to the UI corresponds to work happening here. */
  private async process(job: JobRecord, signal: AbortSignal) {
    const upDir = this.storage.uploadDir(job.sessionHash, job.uploadId);
    const dir = this.storage.jobDir(job.sessionHash, job.uploadId, job.id);
    const work = path.join(upDir, 'work.wav');
    const levels = JSON.parse(await fs.readFile(path.join(upDir, 'levels.json'), 'utf8')) as ff.LevelReport & { durationSec: number };

    // 1. Prepare: split at silences so segments fit the engine without slicing words.
    const plan = ff.planSegments(levels.durationSec, levels.silences, this.engine.maxSegmentSec);
    job.segments = { done: 0, total: plan.length };
    await this.persist(job);
    const segDir = path.join(dir, 'segments');
    await fs.mkdir(segDir, { recursive: true, mode: 0o700 });
    const inputs: string[] = [];
    for (let i = 0; i < plan.length; i++) {
      const p = path.join(segDir, `in-${i}.wav`);
      await ff.cutWav(work, plan[i][0], plan[i][1], p, signal);
      inputs.push(p);
    }

    // 2. Convert each segment with the engine (bounded retries for transient failures).
    job.stage = 'converting';
    await this.persist(job);
    const outputs: string[] = [];
    for (let i = 0; i < inputs.length; i++) {
      const outDir = path.join(segDir, `out-${i}`);
      await fs.mkdir(outDir, { recursive: true, mode: 0o700 });
      let produced = '';
      for (let attempt = 1; ; attempt++) {
        try {
          produced = await this.engine.transformSegment({
            inputWav: inputs[i],
            outDir,
            accent: job.accent,
            strength: job.strength,
            signal,
          });
          break;
        } catch (err) {
          if (signal.aborted) throw err;
          const retryable = err instanceof EngineError ? err.retryable : false;
          if (!retryable || attempt >= 3) throw err;
          await new Promise((r) => setTimeout(r, 500 * attempt));
        }
      }
      const norm = path.join(segDir, `norm-${i}.wav`);
      await ff.normalizeWav(produced, norm, signal);
      outputs.push(norm);
      job.segments = { done: i + 1, total: plan.length };
      await this.persist(job);
    }

    // 3. Stitch, level-match to the original, make a playback preview.
    job.stage = 'stitching';
    await this.persist(job);
    const joined = path.join(dir, 'joined.wav');
    await ff.concatWavs(outputs, joined, signal);
    const dub = path.join(dir, 'dub.wav');
    await ff.matchLevel(joined, levels.meanDb, dub, signal);
    await ff.toPreview(dub, path.join(dir, 'preview.m4a'), signal);
    const probe = await ff.probe(dub);
    job.output = { durationSec: probe.durationSec };
    await fs.rm(segDir, { recursive: true, force: true });
    await fs.rm(joined, { force: true });
  }
}
