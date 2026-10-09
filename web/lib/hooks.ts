import { useCallback, useEffect, useRef, useState } from 'react';
import type { Capabilities, JobInfo, UploadInfo } from '../../shared/types.ts';
import { ApiError, api, fetchBlob, uploadFile } from './api.ts';

let capsPromise: Promise<Capabilities> | null = null;

export function useCapabilities() {
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    capsPromise ??= api.capabilities().catch((e) => {
      capsPromise = null;
      throw e;
    });
    capsPromise.then(
      (c) => alive && setCaps(c),
      () => alive && setError('Can’t reach the studio right now.'),
    );
    return () => {
      alive = false;
    };
  }, []);
  return { caps, error };
}

export type DubPhase = 'empty' | 'uploading' | 'ready' | 'dubbing' | 'done' | 'failed' | 'cancelled';

export interface DubState {
  phase: DubPhase;
  upload: UploadInfo | null;
  uploadProgress: number;
  job: JobInfo | null;
  original: Blob | null;
  dub: Blob | null;
  error: string | null;
}

const initial: DubState = { phase: 'empty', upload: null, uploadProgress: 0, job: null, original: null, dub: null, error: null };

/** The whole take → dub → listen flow, shared by the landing demo and the studio. */
export function useDub() {
  const [state, setState] = useState<DubState>(initial);
  const abortUpload = useRef<AbortController | null>(null);
  const pollTimer = useRef<number | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (pollTimer.current) clearTimeout(pollTimer.current);
      abortUpload.current?.abort();
    };
  }, []);

  const patch = useCallback((p: Partial<DubState>) => {
    if (alive.current) setState((s) => ({ ...s, ...p }));
  }, []);

  const stopPolling = () => {
    if (pollTimer.current) clearTimeout(pollTimer.current);
    pollTimer.current = null;
  };

  const poll = useCallback(
    (jobId: string) => {
      stopPolling();
      const tick = async () => {
        try {
          const { job } = await api.getJob(jobId);
          if (!alive.current) return;
          if (job.state === 'done') {
            const dub = await fetchBlob(`/api/jobs/${job.id}/preview`);
            patch({ job, dub, phase: 'done', error: null });
            return;
          }
          if (job.state === 'failed') return patch({ job, phase: 'failed', error: job.error?.message ?? 'That dub didn’t work.' });
          if (job.state === 'cancelled') return patch({ job, phase: 'cancelled', error: null });
          patch({ job });
          pollTimer.current = window.setTimeout(tick, 900);
        } catch (e) {
          patch({ phase: 'failed', error: (e as Error).message });
        }
      };
      void tick();
    },
    [patch],
  );

  const sendFile = useCallback(
    async (file: Blob, name: string) => {
      stopPolling();
      abortUpload.current?.abort();
      const ctl = new AbortController();
      abortUpload.current = ctl;
      setState({ ...initial, phase: 'uploading', original: file });
      try {
        const upload = await uploadFile(file, name, (f) => patch({ uploadProgress: f }), ctl.signal);
        // Play back what the server actually decoded, so A and B are like-for-like.
        const original = await fetchBlob(`/api/uploads/${upload.id}/preview`).catch(() => file);
        patch({ upload, original, phase: 'ready', uploadProgress: 1 });
      } catch (e) {
        if ((e as ApiError).code === 'aborted') return setState(initial);
        patch({ phase: 'empty', error: (e as Error).message, original: null });
      }
    },
    [patch],
  );

  const cancelUpload = useCallback(() => abortUpload.current?.abort(), []);

  const startDub = useCallback(
    async (accent: string, consent: boolean, strength?: number) => {
      const upload = state.upload;
      if (!upload) return;
      patch({ phase: 'dubbing', dub: null, error: null, job: null });
      try {
        const { job } = await api.startJob({ uploadId: upload.id, accent, consent, strength });
        patch({ job });
        poll(job.id);
      } catch (e) {
        patch({ phase: 'ready', error: (e as Error).message });
      }
    },
    [state.upload, patch, poll],
  );

  const cancelDub = useCallback(async () => {
    if (!state.job) return;
    try {
      await api.cancelJob(state.job.id);
    } catch (e) {
      patch({ error: (e as Error).message });
    }
  }, [state.job, patch]);

  const retryDub = useCallback(async () => {
    if (!state.job) return;
    patch({ phase: 'dubbing', error: null, dub: null });
    try {
      const { job } = await api.retryJob(state.job.id);
      patch({ job });
      poll(job.id);
    } catch (e) {
      patch({ phase: 'failed', error: (e as Error).message });
    }
  }, [state.job, patch, poll]);

  /** Back to "ready" so the user can pick a different accent for the same take. */
  const another = useCallback(() => {
    stopPolling();
    patch({ phase: 'ready', job: null, dub: null, error: null });
  }, [patch]);

  const remove = useCallback(async () => {
    stopPolling();
    const id = state.upload?.id;
    setState(initial);
    if (id) {
      try {
        await api.deleteUpload(id);
      } catch {
        /* already gone */
      }
    }
  }, [state.upload]);

  /** Resume a previous upload in this session (studio "your takes" list). */
  const open = useCallback(
    async (upload: UploadInfo, job?: JobInfo) => {
      stopPolling();
      setState({ ...initial, upload, phase: 'ready' });
      try {
        const original = await fetchBlob(`/api/uploads/${upload.id}/preview`);
        patch({ original });
        if (job) {
          patch({ job, phase: job.state === 'done' ? 'dubbing' : job.state === 'failed' ? 'failed' : job.state === 'cancelled' ? 'cancelled' : 'dubbing', error: job.error?.message ?? null });
          if (job.state !== 'failed' && job.state !== 'cancelled') poll(job.id);
        }
      } catch (e) {
        patch({ phase: 'empty', upload: null, error: (e as Error).message });
      }
    },
    [patch, poll],
  );

  const clearError = useCallback(() => patch({ error: null }), [patch]);

  /** Forget local state only (used after the server has already wiped the session). */
  const reset = useCallback(() => {
    stopPolling();
    abortUpload.current?.abort();
    setState(initial);
  }, []);

  return { state, sendFile, cancelUpload, startDub, cancelDub, retryDub, another, remove, open, clearError, reset };
}
