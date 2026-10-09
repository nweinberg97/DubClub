// Deployment settings baked into index.html at build time (see scripts/build.mjs), read from
// <meta name="dubclub-base"> and <meta name="dubclub-api"> so no inline script is needed (strict CSP).
//   base: path prefix when hosted under a subpath (GitHub Pages project sites use "/<repo>").
//   api:  origin of the Dub Club service when the web app is hosted separately (Pages + Render).
const meta = (name: string) =>
  (typeof document !== 'undefined' && document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)?.content) || '';

export const BASE = meta('dubclub-base').replace(/\/+$/, '');
export const API = meta('dubclub-api').replace(/\/+$/, '');

/** Prefix an /api/... path with the service origin when the app is hosted elsewhere. */
export const apiUrl = (p: string) => API + p;
