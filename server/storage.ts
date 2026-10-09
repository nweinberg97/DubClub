import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import fss from 'node:fs';
import path from 'node:path';
import type { UploadInfo } from '../shared/types.ts';
import { log } from './log.ts';

const ID_RE = /^[a-f0-9]{24}$/;
const HASH_RE = /^[a-f0-9]{64}$/;

export function newId(): string {
  return crypto.randomBytes(12).toString('hex');
}
export function isId(v: unknown): v is string {
  return typeof v === 'string' && ID_RE.test(v);
}
export function newToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export interface UploadRecord extends UploadInfo {
  sessionHash: string;
  ext: string;
  lastAccess: number;
  meanDb: number;
}

/**
 * All user media lives under DATA_DIR/sessions/<sha256(token)>/uploads/<id>/.
 * Paths are only ever built from validated hex ids — user filenames never touch the disk.
 */
export class Storage {
  constructor(public root: string) {}

  async init() {
    await fs.mkdir(path.join(this.root, 'sessions'), { recursive: true, mode: 0o700 });
    await fs.chmod(this.root, 0o700).catch(() => {});
  }

  sessionDir(sessionHash: string): string {
    if (!HASH_RE.test(sessionHash)) throw new Error('bad session');
    return path.join(this.root, 'sessions', sessionHash);
  }
  uploadDir(sessionHash: string, uploadId: string): string {
    if (!isId(uploadId)) throw new Error('bad id');
    return path.join(this.sessionDir(sessionHash), 'uploads', uploadId);
  }
  jobDir(sessionHash: string, uploadId: string, jobId: string): string {
    if (!isId(jobId)) throw new Error('bad id');
    return path.join(this.uploadDir(sessionHash, uploadId), 'jobs', jobId);
  }

  async createUploadDir(sessionHash: string, uploadId: string) {
    const dir = this.uploadDir(sessionHash, uploadId);
    await fs.mkdir(dir, { recursive: true, mode: 0o700 });
    return dir;
  }

  async saveUpload(rec: UploadRecord) {
    const file = path.join(this.uploadDir(rec.sessionHash, rec.id), 'meta.json');
    await fs.writeFile(file, JSON.stringify(rec), { mode: 0o600 });
  }

  async getUpload(sessionHash: string, uploadId: string): Promise<UploadRecord | null> {
    if (!isId(uploadId) || !HASH_RE.test(sessionHash)) return null;
    try {
      const rec = JSON.parse(await fs.readFile(path.join(this.uploadDir(sessionHash, uploadId), 'meta.json'), 'utf8')) as UploadRecord;
      if (rec.sessionHash !== sessionHash) return null;
      return rec;
    } catch {
      return null;
    }
  }

  async touch(rec: UploadRecord) {
    rec.lastAccess = Date.now();
    await this.saveUpload(rec).catch(() => {});
  }

  async listUploads(sessionHash: string): Promise<UploadRecord[]> {
    const dir = path.join(this.sessionDir(sessionHash), 'uploads');
    let names: string[] = [];
    try {
      names = await fs.readdir(dir);
    } catch {
      return [];
    }
    const out: UploadRecord[] = [];
    for (const n of names) {
      const rec = await this.getUpload(sessionHash, n);
      if (rec) out.push(rec);
    }
    return out.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async deleteUpload(sessionHash: string, uploadId: string) {
    await fs.rm(this.uploadDir(sessionHash, uploadId), { recursive: true, force: true });
  }

  async deleteSession(sessionHash: string) {
    await fs.rm(this.sessionDir(sessionHash), { recursive: true, force: true });
  }

  /** Remove uploads (and their outputs) idle longer than the retention window. Returns ids removed. */
  async sweep(retentionMs: number, now = Date.now(), isBusy: (uploadId: string) => boolean = () => false) {
    const removed: string[] = [];
    const sessionsRoot = path.join(this.root, 'sessions');
    let sessions: string[] = [];
    try {
      sessions = await fs.readdir(sessionsRoot);
    } catch {
      return removed;
    }
    for (const s of sessions) {
      if (!HASH_RE.test(s)) continue;
      const uploadsDir = path.join(sessionsRoot, s, 'uploads');
      let ups: string[] = [];
      try {
        ups = await fs.readdir(uploadsDir);
      } catch {
        ups = [];
      }
      for (const u of ups) {
        if (isBusy(u)) continue;
        const rec = await this.getUpload(s, u);
        const dir = path.join(uploadsDir, u);
        // Orphans with no meta (e.g. a crashed upload) are aged by directory mtime.
        const last = rec?.lastAccess ?? (await fs.stat(dir).then((st) => st.mtimeMs).catch(() => 0));
        if (now - last > retentionMs) {
          await fs.rm(dir, { recursive: true, force: true });
          removed.push(u);
        }
      }
      const left = await fs.readdir(uploadsDir).catch(() => [] as string[]);
      if (left.length === 0) {
        const st = await fs.stat(path.join(sessionsRoot, s)).catch(() => null);
        if (!st || now - st.mtimeMs > retentionMs) await fs.rm(path.join(sessionsRoot, s), { recursive: true, force: true });
      }
    }
    if (removed.length) log.info('sweep', { removed: removed.length });
    return removed;
  }

  exists(p: string) {
    return fss.existsSync(p);
  }
}
