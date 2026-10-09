import { useEffect, useRef, useState } from 'react';
import { ACCENT_CATALOG } from '../../shared/accents.ts';
import { PHOTOS, unsplash, type Photo } from '../lib/photos.ts';
import { loadVoices, pickVoice, speak, type SpeakHandle } from '../lib/speech.ts';

/**
 * Creator-feed pieces: a before/after video thumbnail, a vertical short, and feed cards.
 * Thumbnail-style, but calmer than YouTube: one hook line, one label, real people.
 * They illustrate the product — no invented view counts, comments or dub results.
 */

function Img({ photo, w, h, className = '' }: { photo: Photo; w: number; h: number; className?: string }) {
  return (
    <img
      className={`ph ${className}`}
      src={unsplash(photo, w, h)}
      srcSet={`${unsplash(photo, w, h)} 1x, ${unsplash(photo, w * 2, h * 2)} 2x`}
      width={w}
      height={h}
      alt=""
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={(e) => ((e.currentTarget.style.visibility = 'hidden'))}
    />
  );
}

export function Avatar({ small }: { small?: boolean }) {
  return (
    <span className={`avatar ${small ? 'avatar--sm' : ''}`} aria-hidden="true">
      DC
    </span>
  );
}

/** Hero: a fun creator-vlog thumbnail. Hook on a blue panel, the creator on the right. */
export function HeroThumb() {
  const p = PHOTOS.surprised;
  return (
    <figure className="hthumb">
      <div className="hthumb__frame" aria-hidden="true">
        <div className="hthumb__photo">
          <Img photo={p} w={720} h={720} />
        </div>
        <div className="hthumb__panel">
          <p className="hthumb__hook">
            <span>Can I pull off</span>
            <span>
              a <mark>British</mark>
            </span>
            <span>accent?</span>
          </p>
        </div>
        <svg className="hthumb__arrow" viewBox="0 0 120 70">
          <path d="M6 52 C 30 64, 70 60, 104 26" />
          <path d="M86 22 L 106 22 L 104 42" />
        </svg>
        <span className="hthumb__sticker">GB</span>
        <span className="hthumb__dur">14:52</span>
        <span className="hthumb__watched" />
      </div>
      <figcaption className="vmeta">
        <Avatar />
        <span>
          <span className="vmeta__title">I tried a British accent for an entire video</span>
          <span className="vmeta__sub">Illustration · Photo: {p.by} / Unsplash</span>
        </span>
      </figcaption>
    </figure>
  );
}

/** A vertical short with word-by-word captions. */
export function ShortCard() {
  const p = PHOTOS.pointing;
  const words = ['Day', 'one', 'as', 'an', 'Aussie'];
  return (
    <div className="short" aria-hidden="true">
      <Img photo={p} w={360} h={640} />
      <span className="short__scrim" />
      <span className="short__top">
        <span className="chip chip--accent">Australian cut</span>
      </span>
      <p className="short__caps">
        {words.map((w, i) => (
          <span key={w} style={{ '--w': i } as React.CSSProperties}>
            {w}
          </span>
        ))}
      </p>
      <span className="short__rail">
        <Icon d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z" />
        <Icon d="M4 5h16v11H9l-5 4z" />
        <Icon d="M14 4l6 6-6 6M20 10H9a5 5 0 0 0-5 5v3" />
      </span>
      <span className="short__foot">
        <span className="short__handle">@yourchannel</span>
        <span className="short__audio">Original audio → Australian cut</span>
      </span>
    </div>
  );
}

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24">
      <path d={d} />
    </svg>
  );
}

export interface FeedItem {
  photo: Photo;
  hook: [string, string];
  label: string;
  title: string;
  who: string;
  body: string;
  caveat?: string;
  /** A line this creator might say, previewed in `lang` with a browser sample voice. */
  say: string;
  lang: string;
  gender?: 'male' | 'female';
}

/** A use case drawn as a video in a creator's feed. */
export function FeedCard({ item }: { item: FeedItem }) {
  const [voice, setVoice] = useState<SpeechSynthesisVoice | null>(null);
  const [on, setOn] = useState(false);
  const h = useRef<SpeakHandle | null>(null);
  useEffect(() => {
    let alive = true;
    loadVoices().then((v) => alive && setVoice(pickVoice(v, item.lang, item.gender)));
    return () => {
      alive = false;
      h.current?.stop();
    };
  }, [item.lang, item.gender]);
  const accent = ACCENT_CATALOG[item.lang]?.label ?? item.lang;
  const toggle = () => {
    if (!voice) return;
    if (on) {
      h.current?.stop();
      return;
    }
    setOn(true);
    h.current = speak(item.say, voice, () => {}, () => setOn(false));
  };
  return (
    <article className="vcard">
      {voice && (
        <button
          type="button"
          className={`vplay ${on ? 'is-on' : ''}`}
          onClick={toggle}
          aria-pressed={on}
          aria-label={`Hear “${item.say}” in a ${accent} accent (browser sample voice)`}
        >
          {on ? (
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path d="M6 5h4v14H6zM14 5h4v14h-4z" fill="currentColor" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path d="M8 5v14l11-7z" fill="currentColor" />
            </svg>
          )}
          <span className="vplay__say">“{item.say}”</span>
        </button>
      )}
      <div className="vthumb" aria-hidden="true">
        <Img photo={item.photo} w={640} h={360} />
        <span className="vthumb__scrim" />
        <span className="chip chip--accent vthumb__label">{item.label}</span>
        <p className="vthumb__hook">
          <span className="tt">{item.hook[0]}</span>
          <span className="tt tt--accent">{item.hook[1]}</span>
        </p>
        <span className="vthumb__watched" />
      </div>
      <div className="vmeta">
        <Avatar small />
        <span>
          <h3 className="vmeta__title">{item.title}</h3>
          <span className="vmeta__sub">For {item.who}</span>
        </span>
      </div>
      <p className="vcard__body">{item.body}</p>
      {item.caveat && <p className="vcard__pin">{item.caveat}</p>}
    </article>
  );
}
