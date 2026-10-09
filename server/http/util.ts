import fs from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';

export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export function securityHeaders(res: ServerResponse) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), geolocation=(), microphone=(self)');
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "img-src 'self' data: blob: https://images.unsplash.com",
      "media-src 'self' blob:",
      "style-src 'self' 'unsafe-inline'",
      "font-src 'self'",
      // 'wasm-unsafe-eval' lets the in-browser engine run ONNX Runtime's WebAssembly (no JS eval).
      "script-src 'self' 'wasm-unsafe-eval'",
      "worker-src 'self' blob:",
      // Open model files are fetched from Hugging Face (and its CDN hosts). Audio never goes this way.
      "connect-src 'self' https://huggingface.co https://*.huggingface.co https://*.hf.co",
      "frame-ancestors 'none'",
      "base-uri 'none'",
      "form-action 'self'",
    ].join('; '),
  );
}

export function json(res: ServerResponse, status: number, body: unknown) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(data),
  });
  res.end(data);
}

export function sendError(res: ServerResponse, err: HttpError) {
  json(res, err.status, { error: { code: err.code, message: err.message } });
}

export async function readJson<T>(req: IncomingMessage, maxBytes = 16 * 1024): Promise<T> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > maxBytes) throw new HttpError(413, 'too_large', 'Request body too large.');
    chunks.push(chunk as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as T;
  } catch {
    throw new HttpError(400, 'bad_json', 'Request body must be JSON.');
  }
}

/** Stream a private file with Range support (so long previews can seek). */
export function sendFile(
  req: IncomingMessage,
  res: ServerResponse,
  file: string,
  mime: string,
  opts: { download?: string; cache?: string } = {},
) {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(file);
  } catch {
    throw new HttpError(404, 'not_found', 'That file isn’t available any more.');
  }
  const headers: Record<string, string | number> = {
    'content-type': mime,
    'accept-ranges': 'bytes',
    'cache-control': opts.cache ?? 'private, no-store',
  };
  if (opts.download) {
    const ascii = opts.download.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '');
    headers['content-disposition'] = `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(opts.download)}`;
  }
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
  if (range && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : stat.size - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : stat.size - 1;
    start = Math.max(0, start);
    end = Math.min(stat.size - 1, end);
    if (start > end) {
      res.writeHead(416, { 'content-range': `bytes */${stat.size}` });
      return res.end();
    }
    res.writeHead(206, { ...headers, 'content-range': `bytes ${start}-${end}/${stat.size}`, 'content-length': end - start + 1 });
    fs.createReadStream(file, { start, end }).pipe(res);
    return;
  }
  res.writeHead(200, { ...headers, 'content-length': stat.size });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file).pipe(res);
}

/** Tiny fixed-window rate limiter keyed by string. */
export class RateLimiter {
  private hits = new Map<string, { n: number; reset: number }>();
  constructor(private limit: number, private windowMs: number) {}
  allow(key: string, now = Date.now()) {
    const h = this.hits.get(key);
    if (!h || now > h.reset) {
      this.hits.set(key, { n: 1, reset: now + this.windowMs });
      if (this.hits.size > 10_000) this.hits.clear();
      return true;
    }
    h.n++;
    return h.n <= this.limit;
  }
}

export function clientIp(req: IncomingMessage) {
  // Only trust X-Forwarded-For when explicitly told we're behind a proxy.
  if (process.env.TRUST_PROXY === '1') {
    const xf = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim();
    if (xf) return xf;
  }
  return req.socket.remoteAddress ?? 'unknown';
}
