import { MediaError, type ProbeResult } from './ffmpeg.ts';

export const ACCEPTED_EXTENSIONS = ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'opus', 'flac', 'webm', 'mp4', 'mov', 'm4v'] as const;

/** ffprobe format_name values we accept (comma-separated lists from ffprobe are matched by part). */
const ACCEPTED_FORMATS = new Set(['mp3', 'wav', 'mov', 'mp4', 'm4a', '3gp', '3g2', 'mj2', 'aac', 'adts', 'ogg', 'flac', 'matroska', 'webm']);

export function extensionOf(name: string): string {
  const m = /\.([a-z0-9]{1,5})$/i.exec(name.trim());
  return m ? m[1].toLowerCase() : '';
}

/** Display-safe name: strip paths, control chars and odd characters; cap length. Never used on disk. */
export function sanitizeDisplayName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'recording';
  const cleaned = base.replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '').replace(/\s+/g, ' ').trim();
  return (cleaned || 'recording').slice(0, 120);
}

export function checkExtension(name: string) {
  const ext = extensionOf(name);
  if (!ext) throw new MediaError('unsupported_type', 'That file has no extension, so we can’t tell what it is. Try an MP3, WAV, M4A or MP4.');
  if (!(ACCEPTED_EXTENSIONS as readonly string[]).includes(ext)) {
    throw new MediaError('unsupported_type', `.${ext} files aren’t supported. Try ${ACCEPTED_EXTENSIONS.map((e) => e.toUpperCase()).join(', ')}.`);
  }
  return ext;
}

export interface Limits {
  maxDurationSec: number;
  minDurationSec: number;
}

/** Validate what ffprobe actually found — the extension alone is never trusted. */
export function checkProbe(p: ProbeResult, limits: Limits) {
  const parts = p.formatName.split(',');
  if (!parts.some((f) => ACCEPTED_FORMATS.has(f))) {
    throw new MediaError('unsupported_type', 'That file isn’t an audio or video format we support, whatever its extension says.');
  }
  if (!p.hasAudio) {
    throw new MediaError('no_audio', p.hasVideo ? 'That video has no audio track — there’s nothing to dub.' : 'We couldn’t find an audio track in that file.');
  }
  if (!(p.durationSec > 0)) throw new MediaError('unreadable', 'We couldn’t work out how long that recording is. It may be damaged.');
  if (p.durationSec < limits.minDurationSec) {
    throw new MediaError('too_short', `That’s under ${limits.minDurationSec}s. Give us at least a sentence to work with.`);
  }
  if (p.durationSec > limits.maxDurationSec + 0.5) {
    const mins = Math.round(limits.maxDurationSec / 60);
    throw new MediaError('too_long', `That’s longer than our ${mins}-minute limit. Trim it, or split it into parts.`);
  }
}
