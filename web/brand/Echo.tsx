import { BRAND } from './config.ts';

/**
 * Speed trail — Dub Club's signature. Outlined repeats chase the line from behind, like a
 * replay ghosting across a jumbotron (or a phrase thrown into a dub delay). Decorative only.
 */
export function Echo({
  children,
  as: Tag = 'h1',
  repeats = 3,
  className = '',
  id,
}: {
  children: React.ReactNode;
  as?: 'h1' | 'h2' | 'p' | 'span';
  repeats?: number;
  className?: string;
  id?: string;
}) {
  return (
    <Tag className={`echo ${className}`} id={id}>
      {Array.from({ length: repeats }, (_, i) => (
        <span key={i} className="echo__repeat" aria-hidden="true" style={{ '--i': repeats - i } as React.CSSProperties}>
          {children}
        </span>
      ))}
      <span className="echo__line">{children}</span>
    </Tag>
  );
}

/** Wordmark: DUB in chalk, CLUB knocked out of a blue slab, both italic condensed. */
export function Wordmark({ className = '' }: { className?: string }) {
  const [first, ...rest] = BRAND.name.toUpperCase().split(' ');
  return (
    <span className={`wordmark ${className}`} aria-label={BRAND.name}>
      <span className="wordmark__a" aria-hidden="true">
        {first}
      </span>
      {rest.length > 0 && (
        <span className="wordmark__b" aria-hidden="true">
          {rest.join(' ')}
        </span>
      )}
    </span>
  );
}

/** Scrolling scoreboard ticker. Content is duplicated so the loop is seamless. */
export function Ticker({ items, tone = 'accent' }: { items: string[]; tone?: 'accent' | 'pop' | 'chalk' }) {
  const row = items.map((t, i) => (
    <span key={i} className="ticker__item">
      {t}
    </span>
  ));
  return (
    <div className={`ticker ticker--${tone}`} aria-hidden="true">
      <div className="ticker__track">
        <div className="ticker__run">{row}</div>
        <div className="ticker__run">{row}</div>
      </div>
    </div>
  );
}
