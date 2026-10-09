// Sample voices built into the visitor's browser (Web Speech API).
// Used ONLY to preview what an accent sounds like before a real Dub Club sample exists.
// These are different synthetic speakers, never presented as Dub Club output.

export const speechSupported = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

let voicesPromise: Promise<SpeechSynthesisVoice[]> | null = null;

export function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  if (!speechSupported()) return Promise.resolve([]);
  voicesPromise ??= new Promise((resolve) => {
    const now = speechSynthesis.getVoices();
    if (now.length) return resolve(now);
    const done = () => resolve(speechSynthesis.getVoices());
    speechSynthesis.addEventListener('voiceschanged', done, { once: true });
    setTimeout(done, 1500);
  });
  return voicesPromise;
}

const MALE = /\b(male|daniel|arthur|oliver|ryan|lee|william|guy|fred|alex|tom|aaron|rishi|george|thomas|james|liam|connor|luke|gordon|reed|eddy|rocko|grandpa)\b/i;
const FEMALE = /\b(female|samantha|karen|moira|tessa|serena|victoria|kate|susan|zira|hazel|libby|sonia|natasha|catherine|fiona|veena|allison|ava|nicky|martha|flo|sandy|shelley)\b/i;
const NOVELTY = /bells|bubbles|boing|cellos|whisper|zarvox|trinoids|organ|jester|bahh|albert|bad news|good news|hysterical|superstar|wobble/i;

/** Best voice for a language: exact locale first, then prefer a natural-sounding voice of the wanted gender. */
export function pickVoice(voices: SpeechSynthesisVoice[], lang: string, gender: 'male' | 'female' = 'male') {
  const norm = (l: string) => l.replace('_', '-').toLowerCase();
  const want = norm(lang);
  const pool = voices.filter((v) => norm(v.lang) === want && !NOVELTY.test(v.name));
  if (!pool.length) return null;
  const score = (v: SpeechSynthesisVoice) => {
    let s = 0;
    if (gender === 'male' ? MALE.test(v.name) : FEMALE.test(v.name)) s += 4;
    if (gender === 'male' ? FEMALE.test(v.name) : MALE.test(v.name)) s -= 3;
    if (/natural|neural|enhanced|premium|online/i.test(v.name)) s += 2;
    if (/google/i.test(v.name)) s += 1;
    return s;
  };
  return [...pool].sort((a, b) => score(b) - score(a))[0];
}

export interface SpeakHandle {
  stop: () => void;
}

/**
 * Speak a line and report which word is being said. Some voices never fire word boundaries,
 * so we fall back to an estimated pace to keep the highlight moving.
 */
export function speak(
  text: string,
  voice: SpeechSynthesisVoice,
  onWord: (wordIndex: number) => void,
  onEnd: () => void,
): SpeakHandle {
  speechSynthesis.cancel();
  const starts: number[] = [];
  text.replace(/\S+/g, (_m, offset: number) => {
    starts.push(offset);
    return _m;
  });
  const u = new SpeechSynthesisUtterance(text);
  u.voice = voice;
  u.lang = voice.lang;
  u.rate = 0.98;
  let gotBoundary = false;
  let timer: number | null = null;
  let ended = false;
  const finish = () => {
    if (ended) return;
    ended = true;
    if (timer) clearInterval(timer);
    onEnd();
  };
  u.onboundary = (e) => {
    if (e.name && e.name !== 'word') return;
    gotBoundary = true;
    let idx = 0;
    for (let i = 0; i < starts.length; i++) if (starts[i] <= e.charIndex) idx = i;
    onWord(idx);
  };
  u.onstart = () => {
    onWord(0);
    let i = 0;
    timer = window.setInterval(() => {
      if (gotBoundary) {
        if (timer) clearInterval(timer);
        return;
      }
      i = Math.min(starts.length - 1, i + 1);
      onWord(i);
    }, 330);
  };
  u.onend = finish;
  u.onerror = finish;
  speechSynthesis.speak(u);
  return {
    stop: () => {
      speechSynthesis.cancel();
      finish();
    },
  };
}
