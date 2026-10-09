import { useCallback, useEffect, useRef, useState } from 'react';
import type { UploadInfo } from '../../shared/types.ts';
import { BRAND } from '../brand/config.ts';
import { DubDesk } from '../components/DubDesk.tsx';
import { api, hasSession } from '../lib/api.ts';
import { formatTime } from '../lib/audio.ts';
import { useCapabilities, useDub } from '../lib/hooks.ts';
import { SiteFooter, SiteNav } from './Landing.tsx';

export function Studio() {
  const { caps, error } = useCapabilities();
  const dub = useDub();
  const [takes, setTakes] = useState<UploadInfo[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [wiping, setWiping] = useState(false);

  useEffect(() => {
    document.title = `Studio — ${BRAND.name}`;
  }, []);

  const refresh = useCallback(async () => {
    if (!hasSession()) return setTakes([]);
    try {
      const { uploads } = await api.listUploads();
      setTakes(uploads);
      setListError(null);
    } catch (e) {
      setListError((e as Error).message);
    }
  }, []);

  // Keep the list in step with the desk (new upload, deletion, finished dub).
  useEffect(() => {
    void refresh();
  }, [refresh, dub.state.upload?.id, dub.state.phase]);

  const openTake = async (u: UploadInfo) => {
    try {
      const { upload, jobs } = await api.getUpload(u.id);
      const latest = [...jobs].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      await dub.open(upload, latest);
      document.getElementById('desk-top')?.scrollIntoView({ block: 'start' });
    } catch (e) {
      setListError((e as Error).message);
      void refresh();
    }
  };

  const deleteTake = async (u: UploadInfo) => {
    if (dub.state.upload?.id === u.id) await dub.remove();
    else await api.deleteUpload(u.id).catch(() => {});
    void refresh();
  };

  const wipe = async () => {
    setWiping(true);
    try {
      await api.deleteEverything();
      dub.reset();
      setTakes([]);
      dialog.current?.close();
    } catch (e) {
      setListError((e as Error).message);
    } finally {
      setWiping(false);
    }
  };

  return (
    <>
      <SiteNav />
      <main id="main" className="studio">
        <div className="wrap studio__head" id="desk-top">
          <div>
            <h1 className="studio__h">The studio</h1>
            <p className="lede">One take in, a new accent out. Everything here is private to this browser tab.</p>
          </div>
          {caps && (
            <p className="engine-pill" data-kind={caps.engine.kind}>
              Engine: <strong>{caps.engine.name}</strong>
            </p>
          )}
        </div>
        <div className="wrap studio__grid">
          <DubDesk caps={caps} capsError={error} dub={dub} />
          <aside className="takes" aria-labelledby="takes-h">
            <h2 id="takes-h" className="takes__h">
              Your takes
            </h2>
            {takes.length === 0 ? (
              <p className="desk__muted">Nothing here yet. Takes you add show up here until they expire.</p>
            ) : (
              <ul className="takes__list">
                {takes.map((t) => (
                  <li key={t.id} className={`takes__item ${dub.state.upload?.id === t.id ? 'is-open' : ''}`}>
                    <button type="button" className="takes__open" onClick={() => void openTake(t)}>
                      <span className="takes__name">{t.name}</span>
                      <span className="takes__meta">
                        {t.kind === 'video' ? 'Video' : 'Audio'}, {formatTime(t.durationSec)}
                      </span>
                    </button>
                    <button type="button" className="takes__del" onClick={() => void deleteTake(t)} aria-label={`Delete ${t.name}`}>
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {listError && (
              <p className="notice notice--error" role="alert">
                {listError}
              </p>
            )}
            {caps && <p className="desk__muted">Auto-deleted after {caps.limits.retentionMinutes} minutes idle.</p>}
            <button type="button" className="btn btn--ghost btn--danger" onClick={() => dialog.current?.showModal()}>
              Delete everything
            </button>
          </aside>
        </div>
        <dialog ref={dialog} className="dialog" aria-labelledby="wipe-h">
          <h2 id="wipe-h">Delete everything?</h2>
          <p>Every take and dub in this session is removed from the server now. This can’t be undone.</p>
          <div className="row">
            <button type="button" className="btn btn--ghost" onClick={() => dialog.current?.close()} autoFocus>
              Keep them
            </button>
            <button type="button" className="btn btn--danger-solid" onClick={() => void wipe()} disabled={wiping}>
              {wiping ? 'Deleting…' : 'Delete everything'}
            </button>
          </div>
        </dialog>
      </main>
      <SiteFooter />
    </>
  );
}
