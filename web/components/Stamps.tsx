import { useRef } from 'react';
import type { AccentOption } from '../../shared/types.ts';

interface Props {
  accents: AccentOption[];
  value: string | null;
  onChange: (id: string) => void;
  disabled?: boolean;
  label?: string;
  size?: 'lg' | 'sm';
}

/**
 * Accents as postage stamps — you're sending your voice somewhere new.
 * Behaves as a radio group: arrow keys move, the selected stamp gets franked.
 */
export function StampPicker({ accents, value, onChange, disabled, label = 'Target accent', size = 'lg' }: Props) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const idx = Math.max(0, accents.findIndex((a) => a.id === value));

  const onKey = (e: React.KeyboardEvent) => {
    const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const next = (idx + dir + accents.length) % accents.length;
    onChange(accents[next].id);
    refs.current[next]?.focus();
  };

  return (
    <div className={`stamps stamps--${size}`} role="radiogroup" aria-label={label} onKeyDown={onKey}>
      {accents.map((a, i) => {
        const on = a.id === value;
        return (
          <button
            key={a.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on || (!value && i === 0) ? 0 : -1}
            className="stamp"
            disabled={disabled}
            onClick={() => onChange(a.id)}
            title={a.note}
          >
            <span className="stamp__face">
              <span className="stamp__code" aria-hidden="true">
                {a.stampCode}
              </span>
              <span className="stamp__label">{a.label}</span>
              <span className="stamp__place">{a.place}</span>
            </span>
            <Postmark place={a.place} />
          </button>
        );
      })}
    </div>
  );
}

function Postmark({ place }: { place: string }) {
  const id = `pm-${place.replace(/[^a-z]/gi, '')}`;
  return (
    <svg className="postmark" viewBox="0 0 120 120" aria-hidden="true">
      <defs>
        <path id={id} d="M60 60 m-41 0 a41 41 0 1 1 82 0 a41 41 0 1 1 -82 0" />
      </defs>
      <circle cx="60" cy="60" r="52" fill="none" stroke="currentColor" strokeWidth="3" />
      <circle cx="60" cy="60" r="31" fill="none" stroke="currentColor" strokeWidth="2" />
      <text fontSize="11" fill="currentColor" letterSpacing="2">
        <textPath href={`#${id}`}>{`DUBBED IN ${place.toUpperCase()} · DUBBED IN ${place.toUpperCase()}`}</textPath>
      </text>
      <text x="60" y="66" textAnchor="middle" fontSize="18" fill="currentColor" fontWeight="700">
        DUB
      </text>
      <path d="M118 44c-10 4-20 4-30 0s-20-4-30 0M118 58c-10 4-20 4-30 0s-20-4-30 0M118 72c-10 4-20 4-30 0s-20-4-30 0" fill="none" stroke="currentColor" strokeWidth="2.5" />
    </svg>
  );
}
