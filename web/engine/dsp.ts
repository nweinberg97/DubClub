// Pure audio helpers for the in-browser engine. No DOM, no models — unit-tested in Node.

export interface Word {
  text: string;
  start: number;
  end: number;
}

export interface Phrase {
  text: string;
  start: number;
  end: number;
}

/** Whisper word chunks → clean words (drops [Music], (laughs), empty tokens, missing times). */
export function cleanWords(chunks: { text: string; timestamp: [number, number | null] }[], durationSec: number): Word[] {
  const out: Word[] = [];
  for (const c of chunks) {
    const text = c.text.replace(/\[[^\]]*\]|\([^)]*\)|\*[^*]*\*/g, '').trim();
    if (!text || !/[a-z0-9]/i.test(text)) continue;
    const start = Math.max(0, c.timestamp[0] ?? 0);
    const end = Math.min(durationSec, c.timestamp[1] ?? durationSec);
    out.push({ text, start, end: Math.max(end, start + 0.05) });
  }
  return out;
}

/** Group words into phrases at pauses and sentence ends, so each phrase can be re-spoken in its own slot. */
export function groupPhrases(words: Word[], { gap = 0.35, maxWords = 14 } = {}): Phrase[] {
  const phrases: Phrase[] = [];
  let cur: Word[] = [];
  const flush = () => {
    if (!cur.length) return;
    phrases.push({ text: cur.map((w) => w.text).join(' '), start: cur[0].start, end: cur[cur.length - 1].end });
    cur = [];
  };
  for (const w of words) {
    const prev = cur[cur.length - 1];
    if (prev) {
      const pause = w.start - prev.end;
      const sentenceEnd = /[.?!]["')]?$/.test(prev.text);
      const softBreak = /[,;:]$/.test(prev.text) && cur.length >= 4;
      if (pause > gap || sentenceEnd || softBreak || cur.length >= maxWords) flush();
    }
    cur.push(w);
  }
  flush();
  return phrases;
}

/** Trim leading/trailing near-silence, keeping a short pad. */
export function trimSilence(x: Float32Array, rate: number, threshold = 0.01, padSec = 0.03): Float32Array {
  let a = 0;
  let b = x.length - 1;
  while (a < x.length && Math.abs(x[a]) < threshold) a++;
  while (b > a && Math.abs(x[b]) < threshold) b--;
  if (a >= b) return new Float32Array(0);
  const pad = Math.round(padSec * rate);
  return x.slice(Math.max(0, a - pad), Math.min(x.length, b + pad + 1));
}

/** Speed that makes a phrase of `natural` seconds fit `target` seconds, within a range that still sounds natural. */
export function fitSpeed(natural: number, target: number, min = 0.85, max = 1.3): number {
  if (target <= 0) return 1;
  return Math.min(max, Math.max(min, natural / target));
}

export function rms(x: Float32Array, gate = 0): number {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < x.length; i++) {
    const v = x[i];
    if (Math.abs(v) < gate) continue;
    sum += v * v;
    n++;
  }
  return n ? Math.sqrt(sum / n) : 0;
}

/** Median fundamental frequency (Hz) over voiced frames, by autocorrelation. Returns 0 if nothing voiced. */
export function medianPitch(x: Float32Array, rate: number): number {
  const frame = Math.round(rate * 0.04);
  const hop = Math.round(rate * 0.02);
  const minLag = Math.floor(rate / 400);
  const maxLag = Math.ceil(rate / 70);
  const peak = x.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  if (!peak) return 0;
  const pitches: number[] = [];
  for (let s = 0; s + frame + maxLag < x.length; s += hop) {
    let energy = 0;
    for (let i = 0; i < frame; i++) energy += x[s + i] * x[s + i];
    if (Math.sqrt(energy / frame) < peak * 0.08) continue;
    const r = new Float32Array(maxLag + 2);
    let best = 0;
    for (let lag = minLag; lag <= maxLag + 1; lag++) {
      let c = 0;
      let e2 = 0;
      for (let i = 0; i < frame; i++) {
        c += x[s + i] * x[s + i + lag];
        e2 += x[s + i + lag] * x[s + i + lag];
      }
      r[lag] = c / Math.sqrt(energy * e2 + 1e-12);
      if (lag <= maxLag) best = Math.max(best, r[lag]);
    }
    if (best < 0.6) continue;
    // Shortest lag that's a local peak close to the best one (avoids octave-down errors).
    for (let lag = minLag + 1; lag <= maxLag; lag++) {
      if (r[lag] >= best * 0.9 && r[lag] >= r[lag - 1] && r[lag] >= r[lag + 1]) {
        pitches.push(rate / lag);
        break;
      }
    }
  }
  if (pitches.length < 3) return 0;
  pitches.sort((a, b) => a - b);
  return pitches[Math.floor(pitches.length / 2)];
}

/** Linear resample (only used for analysis and for measuring, never for the delivered audio's main path). */
export function resample(x: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return x;
  const n = Math.round((x.length * to) / from);
  const out = new Float32Array(n);
  const ratio = from / to;
  for (let i = 0; i < n; i++) {
    const p = i * ratio;
    const j = Math.floor(p);
    const f = p - j;
    out[i] = (x[j] ?? 0) * (1 - f) + (x[j + 1] ?? x[j] ?? 0) * f;
  }
  return out;
}

/** 16-bit PCM mono WAV. */
export function encodeWav(x: Float32Array, rate: number): ArrayBuffer {
  const buf = new ArrayBuffer(44 + x.length * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + x.length * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, x.length * 2, true);
  for (let i = 0; i < x.length; i++) {
    const s = Math.max(-1, Math.min(1, x[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buf;
}

export interface Placed {
  audio: Float32Array;
  start: number; // seconds
}

/**
 * Lay re-spoken phrases on a timeline at their original start times (never overlapping),
 * then match the original's loudness without clipping.
 */
export function assemble(parts: Placed[], rate: number, minDuration: number, targetRms: number): Float32Array {
  let cursor = 0;
  const at: number[] = [];
  for (const p of parts) {
    const s = Math.max(p.start, cursor + (cursor ? 0.04 : 0));
    at.push(s);
    cursor = s + p.audio.length / rate;
  }
  const total = Math.max(minDuration, cursor + 0.15);
  const out = new Float32Array(Math.ceil(total * rate));
  parts.forEach((p, i) => out.set(p.audio, Math.round(at[i] * rate)));
  const cur = rms(out, 0.01);
  let gain = cur && targetRms ? targetRms / cur : 1;
  const peak = out.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  if (peak * gain > 0.95) gain = 0.95 / peak;
  if (gain !== 1) for (let i = 0; i < out.length; i++) out[i] *= gain;
  // 8 ms fades at the edges
  const f = Math.round(rate * 0.008);
  for (let i = 0; i < f && i < out.length; i++) {
    out[i] *= i / f;
    out[out.length - 1 - i] *= i / f;
  }
  return out;
}
