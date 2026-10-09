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
 * Accents as "cuts" — each one is another version of your video, shown as a thumbnail tile.
 * Radio group: arrow keys move; the picked cut gets the red watched-bar and a check.
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
    <div className={`cuts cuts--${size}`} role="radiogroup" aria-label={label} onKeyDown={onKey}>
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
            className="cut"
            disabled={disabled}
            onClick={() => onChange(a.id)}
            title={a.note}
          >
            <span className="cut__thumb" aria-hidden="true">
              <span className="cut__code">{a.stampCode}</span>
              <span className="cut__tag">{a.stampCode} cut</span>
              <span className="cut__bar" />
              {on && <span className="cut__check" />}
            </span>
            <span className="cut__label">{a.label}</span>
            <span className="cut__place">{a.place}</span>
          </button>
        );
      })}
    </div>
  );
}
