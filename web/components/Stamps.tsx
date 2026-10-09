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

/** Stable "squad number" per accent so each jersey has its own identity. */
function numberFor(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 97;
  return String((h % 89) + 2).padStart(2, '0');
}

/**
 * Pick your side: each accent is a jersey. Radio group — arrow keys move, the picked jersey goes red.
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
    <div className={`jerseys jerseys--${size}`} role="radiogroup" aria-label={label} onKeyDown={onKey}>
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
            className="jersey"
            disabled={disabled}
            onClick={() => onChange(a.id)}
            title={a.note}
          >
            <svg className="jersey__shirt" viewBox="0 0 120 132" aria-hidden="true">
              <path
                className="jersey__body"
                d="M34 4c4 12 14 18 26 18S82 16 86 4l22 8c-6 16-8 28-6 42l4 74H14l4-74c2-14 0-26-6-42z"
              />
              <path className="jersey__trim" d="M34 4c4 12 14 18 26 18S82 16 86 4" />
              <text className="jersey__code" x="60" y="66" textAnchor="middle">
                {a.stampCode}
              </text>
              <text className="jersey__num" x="60" y="108" textAnchor="middle">
                {numberFor(a.id)}
              </text>
            </svg>
            <span className="jersey__label">{a.label}</span>
            <span className="jersey__place">{a.place}</span>
          </button>
        );
      })}
    </div>
  );
}
