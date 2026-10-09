import type { JobInfo } from '../../shared/types.ts';

const STAGES: Array<{ id: JobInfo['stage']; label: string }> = [
  { id: 'waiting', label: 'In the queue' },
  { id: 'preparing', label: 'Finding the pauses' },
  { id: 'converting', label: 'Dubbing' },
  { id: 'stitching', label: 'Stitching it back together' },
];

/**
 * Honest status: each label is a real pipeline stage reported by the server.
 * The bar only fills from real segment counts — never a timer.
 */
export function DubStatus({ job, onCancel }: { job: JobInfo | null; onCancel: () => void }) {
  const stage = job?.state === 'queued' ? 'waiting' : job?.stage ?? 'waiting';
  const idx = STAGES.findIndex((s) => s.id === stage);
  const seg = job?.segments;
  const frac = seg && seg.total ? seg.done / seg.total : null;
  const label = STAGES[Math.max(0, idx)]?.label ?? 'Working';
  return (
    <div className="status" aria-busy="true">
      <div className="reels" aria-hidden="true">
        <span className="reel" />
        <span className="reel__tape" />
        <span className="reel" />
      </div>
      <div className="status__body">
        <p className="status__now" role="status" aria-live="polite">
          {label}
          {stage === 'converting' && seg ? ` — part ${Math.min(seg.done + 1, seg.total)} of ${seg.total}` : ''}
          {job?.queuePosition ? ` — you’re number ${job.queuePosition}` : ''}
        </p>
        <ol className="status__steps">
          {STAGES.map((s, i) => (
            <li key={s.id} className={i < idx ? 'is-done' : i === idx ? 'is-now' : ''}>
              {s.label}
            </li>
          ))}
        </ol>
        {frac !== null && stage === 'converting' && (
          <div className="meter" role="progressbar" aria-label="Parts dubbed" aria-valuemin={0} aria-valuemax={seg!.total} aria-valuenow={seg!.done}>
            <span style={{ width: `${Math.max(3, frac * 100)}%` }} />
          </div>
        )}
      </div>
      <button type="button" className="btn btn--ghost" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}
