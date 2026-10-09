import { useEffect, useRef, useState } from 'react';
import { ACCENT_CATALOG } from '../../shared/accents.ts';
import { BASE } from '../lib/env.ts';
import { PHOTOS, unsplash } from '../lib/photos.ts';
import { loadVoices, pickVoice, speak, speechSupported, type SpeakHandle } from '../lib/speech.ts';

/**
 * The hero sampler: one line, heard in each accent.
 *
 * Real mode: if public/demo/manifest.json exists, plays genuine Dub Club output
 * (an original recording and its dubbed cuts) and says so.
 * Preview mode: otherwise uses the sample voices built into the visitor's browser,
 * clearly labelled — they are different synthetic speakers, not Dub Club output.
 */

interface Manifest {
  speaker: string;
  text: string;
  original: string;
  cuts: Record<string, string>;
}

interface Option {
  id: string; // 'original' or accent id
  label: string;
  voice?: SpeechSynthesisVoice;
  src?: string;
}

const LINE = 'Hey, my name is John — and welcome back to the channel.';

export function Sampler() {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [options, setOptions] = useState<Option[] | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [word, setWord] = useState(-1);
  const handle = useRef<SpeakHandle | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);

  // Real samples, if the team has added them.
  useEffect(() => {
    fetch(`${BASE}/demo/manifest.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((m: Manifest | null) => m && m.original && setManifest(m))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const accentIds = ['en-GB'];
    if (manifest) {
      setOptions([
        { id: 'original', label: 'Original', src: `${BASE}/demo/${manifest.original}` },
        ...Object.entries(manifest.cuts).map(([id, file]) => ({
          id,
          label: ACCENT_CATALOG[id]?.label ?? id,
          src: `${BASE}/demo/${file}`,
        })),
      ]);
      return;
    }
    let alive = true;
    loadVoices().then((voices) => {
      if (!alive) return;
      const original = pickVoice(voices, 'en-US');
      const list: Option[] = [];
      if (original) list.push({ id: 'original', label: 'Original', voice: original });
      for (const id of accentIds) {
        const v = pickVoice(voices, id);
        if (v) list.push({ id, label: ACCENT_CATALOG[id]?.label ?? id, voice: v });
      }
      setOptions(list);
    });
    return () => {
      alive = false;
    };
  }, [manifest]);

  useEffect(() => () => stop(), []); // eslint-disable-line react-hooks/exhaustive-deps

  function stop() {
    handle.current?.stop();
    handle.current = null;
    audio.current?.pause();
    setPlaying(null);
    setWord(-1);
  }

  function play(opt: Option) {
    if (playing === opt.id) return stop();
    stop();
    setPlaying(opt.id);
    if (opt.src) {
      const a = new Audio(opt.src);
      audio.current = a;
      a.onended = stop;
      void a.play().catch(stop);
      return;
    }
    if (opt.voice) {
      handle.current = speak(manifest?.text ?? LINE, opt.voice, setWord, () => {
        setPlaying(null);
        setWord(-1);
      });
    }
  }

  const text = manifest?.text ?? LINE;
  const words = text.split(/\s+/);
  const speaker = manifest?.speaker ?? 'John';
  const real = !!manifest;
  const unavailable = !real && options !== null && options.length === 0;
  const activeIsCut = playing && playing !== 'original';

  return (
    <div className={`sampler ${playing ? 'is-playing' : ''} ${activeIsCut ? 'is-cut' : ''}`}>
      <div className="sampler__head">
        <img className="sampler__avatar" src={unsplash(PHOTOS.surprised, 96, 96)} alt="" width={48} height={48} referrerPolicy="no-referrer" />
        <div>
          <p className="sampler__name">{speaker}</p>
          <p className="sampler__sub">Recorded once. Hear it in other accents.</p>
        </div>
        <span className={`chip ${real ? 'chip--pop' : 'chip--chalk'} sampler__badge`}>{real ? 'Real Dub Club output' : 'Sample voices'}</span>
      </div>

      <p className="sampler__line" aria-live="off">
        {words.map((w, i) => (
          <span key={i} className={i === word ? 'is-on' : i < word ? 'is-said' : ''}>
            {w}{' '}
          </span>
        ))}
      </p>

      <div className="sampler__bars" aria-hidden="true">
        {Array.from({ length: 36 }, (_, i) => (
          <span key={i} style={{ '--d': `${(i * 53) % 700}ms`, '--h': `${30 + ((i * 37) % 70)}%` } as React.CSSProperties} />
        ))}
      </div>

      {unavailable ? (
        <p className="sampler__note">Your browser doesn’t have sample voices to play. Try Chrome, Safari or Edge — or jump into the studio.</p>
      ) : (
        <div className="sampler__opts" role="group" aria-label="Hear this line in">
          {(options ?? []).map((o) => (
            <button
              key={o.id}
              type="button"
              className={`sampler__opt ${o.id === 'original' ? 'is-orig' : ''}`}
              aria-pressed={playing === o.id}
              onClick={() => play(o)}
            >
              <span className="sampler__icon" aria-hidden="true">
                {playing === o.id ? (
                  <svg viewBox="0 0 24 24" width="14" height="14">
                    <path d="M6 5h4v14H6zM14 5h4v14h-4z" fill="currentColor" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" width="14" height="14">
                    <path d="M8 5v14l11-7z" fill="currentColor" />
                  </svg>
                )}
              </span>
              {o.label}
            </button>
          ))}
          {options === null && <span className="sampler__note">Loading voices…</span>}
        </div>
      )}

      {!unavailable && (
      <p className="sampler__note">
        {real
          ? `One recording of ${speaker}, dubbed by Dub Club into each accent.`
          : 'Preview using sample voices built into your browser, so they won’t sound like John. Your dub keeps your own voice.'}
      </p>
      )}
      {!speechSupported() && !real && <span className="sr-only">Sample voices are not supported in this browser.</span>}
    </div>
  );
}
