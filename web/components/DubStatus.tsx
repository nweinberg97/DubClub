import type { JobInfo } from '../../shared/types.ts';

const STAGES: Array<{ id: JobInfo['stage']; q: string; label: string }> = [
  { id: 'waiting', q: 'Queued', label: 'Waiting for a slot' },
  { id: 'preparing', q: 'Prep', label: 'Finding the pauses' },
  { id: 'converting', q: 'Dub', label: 'Dubbing your take' },
  { id: 'stitching', q: 'Export', label: 'Stitching it back' },
];

/**
 * Render-queue status. Every step is a real pipeline stage reported by the server,
 * and the bar only moves on real segment counts — never a timer.
 */
export function DubStatus({ job, onCancel }: { job: JobInfo | null; onCancel: () => void }) {
  const stage = job?.state === 'queued' ? 'waiting' : job?.stage ?? 'waiting';
  const idx = Math.max(0, STAGES.findIndex((s) => s.id === stage));
  const seg = job?.segments;
  const frac = seg && seg.total ? seg.done / seg.total : null;
  const now = STAGES[idx];
  return (
    <div className="board" aria-busy="true">
      <div className="board__top">
        <span className="board__live">
          <span className="board__dot" aria-hidden="true" /> Rendering
        </span>
        <p className="board__now" role="status" aria-live="polite">
          {now.label}
          {stage === 'converting' && seg ? ` — part ${Math.min(seg.done + 1, seg.total)} of ${seg.total}` : ''}
          {job?.queuePosition ? ` — you’re number ${job.queuePosition}` : ''}
        </p>
        <button type="button" className="btn btn--ghost btn--onblack" onClick={onCancel}>
          Cancel
        </button>
      </div>
      <ol className="board__qs">
        {STAGES.map((s, i) => (
          <li key={s.id} className={i < idx ? 'is-done' : i === idx ? 'is-now' : ''}>
            <span className="board__q">{s.q}</span>
            <span className="board__l">{s.label}</span>
          </li>
        ))}
      </ol>
      {frac !== null && stage === 'converting' && (
        <div className="meter" role="progressbar" aria-label="Parts dubbed" aria-valuemin={0} aria-valuemax={seg!.total} aria-valuenow={seg!.done}>
          <span style={{ width: `${Math.max(3, frac * 100)}%` }} />
        </div>
      )}
    </div>
  );
}
