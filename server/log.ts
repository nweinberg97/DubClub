// Minimal structured logging. Rule: log ids, states, timings and error codes.
// Never log file names, transcripts, audio, tokens or request bodies.

type Fields = Record<string, string | number | boolean | null | undefined>;

function emit(level: 'info' | 'warn' | 'error', msg: string, fields: Fields = {}) {
  if (process.env.DUBCLUB_SILENT === '1') return;
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...fields });
  (level === 'error' ? console.error : console.log)(line);
}

export const log = {
  info: (msg: string, f?: Fields) => emit('info', msg, f),
  warn: (msg: string, f?: Fields) => emit('warn', msg, f),
  error: (msg: string, f?: Fields) => emit('error', msg, f),
};
