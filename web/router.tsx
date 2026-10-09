import { useEffect, useState } from 'react';
import { BASE } from './lib/env.ts';

/** App path → URL including the deployment base (e.g. "/studio" → "/dubclub/studio"). */
export const href = (to: string) => BASE + (to.startsWith('/') ? to : '/' + to);
const current = () => {
  const p = location.pathname;
  // GitHub Pages serves the repo path case-insensitively (/DubClub and /dubclub), so match the same way.
  const stripped = BASE && p.toLowerCase().startsWith(BASE.toLowerCase()) ? p.slice(BASE.length) : p;
  return stripped || '/';
};

type Listener = () => void;
const listeners = new Set<Listener>();

export function navigate(to: string) {
  const url = href(to);
  if (url === location.pathname + location.hash) return;
  history.pushState(null, '', url);
  listeners.forEach((l) => l());
  const hash = to.split('#')[1];
  if (hash) requestAnimationFrame(() => document.getElementById(hash)?.scrollIntoView());
  else window.scrollTo(0, 0);
}

export function usePath() {
  const [path, setPath] = useState(current());
  useEffect(() => {
    const update = () => setPath(current());
    listeners.add(update);
    window.addEventListener('popstate', update);
    return () => {
      listeners.delete(update);
      window.removeEventListener('popstate', update);
    };
  }, []);
  return path;
}

export function Link({ to, onClick, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) {
  return (
    <a
      href={href(to)}
      {...rest}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        navigate(to);
      }}
    />
  );
}
