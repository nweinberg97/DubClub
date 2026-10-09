import type { Capabilities, JobInfo, UploadInfo } from '../../shared/types.ts';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

const TOKEN_KEY = 'dubclub.session';

function readToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}
function writeToken(t: string | null) {
  try {
    if (t) sessionStorage.setItem(TOKEN_KEY, t);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private mode: token lives in memory only */
  }
}

let memToken: string | null = null;
let pending: Promise<string> | null = null;

/** Anonymous per-tab session. Your files are only reachable with this token. */
export async function session(): Promise<string> {
  memToken ??= readToken();
  if (memToken) return memToken;
  pending ??= (async () => {
    const r = await fetch('/api/session', { method: 'POST' });
    if (!r.ok) throw await toError(r);
    const { token } = (await r.json()) as { token: string };
    memToken = token;
    writeToken(token);
    return token;
  })().finally(() => (pending = null));
  return pending;
}

export function hasSession() {
  return !!(memToken ?? readToken());
}

export function forgetSession() {
  memToken = null;
  writeToken(null);
}

async function toError(r: Response): Promise<ApiError> {
  try {
    const j = (await r.json()) as { error?: { code: string; message: string } };
    if (j.error) return new ApiError(r.status, j.error.code, j.error.message);
  } catch {
    /* not json */
  }
  return new ApiError(r.status, 'http_' + r.status, 'Something went wrong. Try again.');
}

async function call<T>(path: string, init: RequestInit = {}, retried = false): Promise<T> {
  const token = await session();
  let r: Response;
  try {
    r = await fetch(path, {
      ...init,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(init.headers ?? {}) },
    });
  } catch {
    throw new ApiError(0, 'offline', 'Can’t reach Dub Club. Check your connection and try again.');
  }
  if (r.status === 401 && !retried) {
    forgetSession();
    return call<T>(path, init, true);
  }
  if (!r.ok) throw await toError(r);
  return (await r.json()) as T;
}

export const api = {
  capabilities: async (): Promise<Capabilities> => {
    const r = await fetch('/api/capabilities');
    if (!r.ok) throw await toError(r);
    return r.json();
  },
  listUploads: () => call<{ uploads: UploadInfo[] }>('/api/uploads'),
  getUpload: (id: string) => call<{ upload: UploadInfo; jobs: JobInfo[] }>(`/api/uploads/${id}`),
  deleteUpload: (id: string) => call<{ deleted: boolean }>(`/api/uploads/${id}`, { method: 'DELETE' }),
  deleteEverything: async () => {
    const r = await call<{ deleted: boolean }>('/api/session', { method: 'DELETE' });
    forgetSession();
    return r;
  },
  startJob: (body: { uploadId: string; accent: string; strength?: number; consent: boolean }) =>
    call<{ job: JobInfo }>('/api/jobs', { method: 'POST', body: JSON.stringify(body) }),
  getJob: (id: string) => call<{ job: JobInfo }>(`/api/jobs/${id}`),
  cancelJob: (id: string) => call<{ job: JobInfo }>(`/api/jobs/${id}/cancel`, { method: 'POST' }),
  retryJob: (id: string) => call<{ job: JobInfo }>(`/api/jobs/${id}/retry`, { method: 'POST' }),
};

/** Upload with real byte progress (XHR, because fetch has no upload progress). */
export function uploadFile(
  file: Blob,
  name: string,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<UploadInfo> {
  return session().then(
    (token) =>
      new Promise<UploadInfo>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', '/api/uploads');
        xhr.setRequestHeader('authorization', `Bearer ${token}`);
        xhr.setRequestHeader('x-file-name', encodeURIComponent(name));
        xhr.setRequestHeader('content-type', 'application/octet-stream');
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) onProgress(e.loaded / e.total);
        };
        xhr.onload = () => {
          let body: any = null;
          try {
            body = JSON.parse(xhr.responseText);
          } catch {
            /* ignore */
          }
          if (xhr.status === 201 && body?.upload) return resolve(body.upload);
          if (xhr.status === 401) forgetSession();
          reject(new ApiError(xhr.status, body?.error?.code ?? 'upload_failed', body?.error?.message ?? 'Upload failed. Try again.'));
        };
        xhr.onerror = () => reject(new ApiError(0, 'offline', 'The upload was interrupted. Check your connection and try again.'));
        xhr.onabort = () => reject(new ApiError(0, 'aborted', 'Upload cancelled.'));
        signal?.addEventListener('abort', () => xhr.abort(), { once: true });
        xhr.send(file);
      }),
  );
}

/** Fetch private media with the session token and return a Blob. */
export async function fetchBlob(path: string, signal?: AbortSignal): Promise<Blob> {
  const token = await session();
  const r = await fetch(path, { headers: { authorization: `Bearer ${token}` }, signal });
  if (!r.ok) throw await toError(r);
  return r.blob();
}

/** Download an export: fetch with auth, then hand the browser a named file. */
export async function download(path: string, fallbackName: string) {
  const token = await session();
  const r = await fetch(path, { headers: { authorization: `Bearer ${token}` } });
  if (!r.ok) throw await toError(r);
  const cd = r.headers.get('content-disposition') ?? '';
  const star = /filename\*=UTF-8''([^;]+)/.exec(cd)?.[1];
  const name = star ? decodeURIComponent(star) : fallbackName;
  const url = URL.createObjectURL(await r.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
