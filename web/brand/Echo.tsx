import { BRAND } from './config.ts';

/**
 * The Echo — Dub Club's signature. In dub, a phrase is thrown into a delay and comes back
 * again and again, fainter each time. We do that to type: the line, then its repeats.
 * Repeats are decorative and hidden from assistive tech.
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

export function Wordmark({ className = '' }: { className?: string }) {
  const [first, ...rest] = BRAND.name.split(' ');
  return (
    <span className={`wordmark ${className}`} aria-label={BRAND.name}>
      <span className="wordmark__dub" aria-hidden="true">
        {first}
        <span className="wordmark__ghost">{first}</span>
      </span>
      {rest.length > 0 && (
        <span className="wordmark__club" aria-hidden="true">
          {rest.join(' ')}
        </span>
      )}
    </span>
  );
}
