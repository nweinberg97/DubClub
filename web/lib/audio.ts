let ctx: AudioContext | null = null;
export function audioContext(): AudioContext {
  ctx ??= new AudioContext();
  return ctx;
}

/** Decode audio and reduce it to `buckets` peak values in 0..1. Runs in the browser — nothing is uploaded. */
export async function peaksFromBlob(blob: Blob, buckets = 240): Promise<{ peaks: number[]; duration: number }> {
  const buf = await blob.arrayBuffer();
  // A throwaway OfflineAudioContext avoids resuming the shared context before a user gesture.
  const decoder = new OfflineAudioContext(1, 1, 44100);
  const audio = await decoder.decodeAudioData(buf);
  const data = audio.getChannelData(0);
  const step = Math.max(1, Math.floor(data.length / buckets));
  const peaks: number[] = [];
  let max = 0;
  for (let i = 0; i < buckets; i++) {
    let p = 0;
    const end = Math.min(data.length, (i + 1) * step);
    for (let j = i * step; j < end; j += 4) {
      const v = Math.abs(data[j]);
      if (v > p) p = v;
    }
    peaks.push(p);
    if (p > max) max = p;
  }
  const norm = max > 0 ? 1 / max : 1;
  return { peaks: peaks.map((p) => Math.pow(p * norm, 0.8)), duration: audio.duration };
}

export function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function prefersReducedMotion() {
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
