export interface QA {
  q: string;
  a: React.ReactNode;
}

/** Native <details> gives keyboard + screen-reader support for free. */
export function Faq({ items }: { items: QA[] }) {
  return (
    <div className="faq">
      {items.map((it) => (
        <details key={it.q} className="faq__item">
          <summary className="faq__q">
            <span>{it.q}</span>
            <span className="faq__icon" aria-hidden="true" />
          </summary>
          <div className="faq__a">{it.a}</div>
        </details>
      ))}
    </div>
  );
}
