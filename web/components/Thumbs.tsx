/**
 * Social-feed brand pieces: a video thumbnail, a vertical short, and feed cards.
 * These are illustrations of the product's world — they are labelled as such and never show
 * invented view counts, comments or results.
 */

function Bars({ n = 28, seed = 3 }: { n?: number; seed?: number }) {
  const bars = Array.from({ length: n }, (_, i) => {
    const v = Math.abs(Math.sin(i * 0.9 + seed) * 0.6 + Math.sin(i * 0.37 + seed * 2) * 0.4);
    return 0.18 + v * 0.82;
  });
  return (
    <span className="bars" aria-hidden="true">
      {bars.map((h, i) => (
        <span key={i} style={{ '--h': h.toFixed(2) } as React.CSSProperties} />
      ))}
    </span>
  );
}

export function Avatar({ small }: { small?: boolean }) {
  return (
    <span className={`avatar ${small ? 'avatar--sm' : ''}`} aria-hidden="true">
      DC
    </span>
  );
}

/** The hero thumbnail: before/after split, outlined hook text, a circle, an arrow, a duration badge. */
export function HeroThumb() {
  return (
    <figure className="hthumb">
      <div className="hthumb__frame" aria-hidden="true">
        <div className="hthumb__half hthumb__half--a">
          <span className="chip chip--chalk">Before</span>
          <Bars seed={1} />
        </div>
        <div className="hthumb__half hthumb__half--b">
          <span className="chip chip--black">After</span>
          <Bars seed={4} />
        </div>
        <p className="hthumb__hook">
          <span className="tt">I went</span>
          <span className="tt tt--gold hthumb__circled">British</span>
        </p>
        <svg className="hthumb__arrow" viewBox="0 0 120 80">
          <path d="M6 70 C 40 66, 70 50, 96 20" />
          <path d="M78 18 L 100 14 L 98 38" />
        </svg>
        <span className="hthumb__dur">0:47</span>
        <span className="hthumb__watched" />
      </div>
      <figcaption className="vmeta">
        <Avatar />
        <span>
          <span className="vmeta__title">I dubbed my own video into a British accent (no re-record)</span>
          <span className="vmeta__sub">Dub Club · illustration</span>
        </span>
      </figcaption>
    </figure>
  );
}

/** A vertical short with word-by-word captions — the format half your audience scrolls. */
export function ShortCard() {
  const words = ['Same', 'voice.', 'New', 'accent.'];
  return (
    <div className="short" aria-hidden="true">
      <span className="short__top">
        <span className="chip chip--red">
          <span className="chip__dot" /> Rec
        </span>
      </span>
      <Bars n={18} seed={7} />
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
        <span className="short__audio">Original audio → British cut</span>
      </span>
    </div>
  );
}

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26">
      <path d={d} />
    </svg>
  );
}

export interface FeedItem {
  hook: string[];
  tone: 'red' | 'gold' | 'chalk' | 'court';
  prop: 'circle' | 'arrow' | 'badge' | 'split';
  title: string;
  who: string;
  body: string;
  caveat?: string;
}

/** A use case drawn as a video in a feed. */
export function FeedCard({ item }: { item: FeedItem }) {
  return (
    <article className="vcard">
      <div className={`vthumb vthumb--${item.tone}`} aria-hidden="true">
        {item.prop === 'split' && <span className="vthumb__split" />}
        <p className="vthumb__hook">
          {item.hook.map((h, i) => (
            <span key={i} className={`tt ${i === item.hook.length - 1 ? 'tt--pop' : ''}`}>
              {h}
            </span>
          ))}
        </p>
        {item.prop === 'circle' && <span className="vthumb__circle" />}
        {item.prop === 'arrow' && (
          <svg className="vthumb__arrow" viewBox="0 0 120 80">
            <path d="M8 12 C 40 16, 70 34, 96 62" />
            <path d="M74 64 L 98 64 L 96 40" />
          </svg>
        )}
        {item.prop === 'badge' && <span className="vthumb__badge">New</span>}
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
