// Production build: bundle the SPA with esbuild, copy public assets into dist/.
import { build, context } from 'esbuild';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const dist = path.join(root, 'dist');
const watch = process.argv.includes('--watch');

await fs.rm(dist, { recursive: true, force: true });
await fs.mkdir(path.join(dist, 'assets'), { recursive: true });
await fs.cp(path.join(root, 'public'), dist, { recursive: true });
// BASE_PATH: "/dubclub" for a GitHub Pages project site; empty when served at a domain root.
// API_ORIGIN: the Dub Club service (e.g. https://dubclub.onrender.com) when the web app is hosted elsewhere.
const basePath = (process.env.BASE_PATH ?? '').replace(/\/+$/, '');
const apiOrigin = (process.env.API_ORIGIN ?? '').replace(/\/+$/, '');
const html = (await fs.readFile(path.join(root, 'web/index.html'), 'utf8')).replaceAll('%BASE%', basePath).replaceAll('%API%', apiOrigin);
await fs.writeFile(path.join(dist, 'index.html'), html);
if (process.env.STATIC_HOST === '1') {
  // Static hosts have no SPA fallback: serve the app shell for /studio and for unknown paths.
  await fs.mkdir(path.join(dist, 'studio'), { recursive: true });
  await fs.writeFile(path.join(dist, 'studio', 'index.html'), html);
  await fs.writeFile(path.join(dist, '404.html'), html);
  await fs.writeFile(path.join(dist, '.nojekyll'), '');
}

// The in-browser engine (web/engine/worker.ts) bundles open-source packages. On machines where they
// aren't installed, build against a stub so the rest of the site still builds; the studio will say so.
const has = (p) => existsSync(path.join(root, 'node_modules', p, 'package.json'));
const engineReal = has('kokoro-js') && has('@huggingface/transformers');
if (engineReal) {
  // ONNX Runtime's WebAssembly files, served from our own origin instead of a CDN.
  const ortSrc = path.join(root, 'node_modules/@huggingface/transformers/dist');
  await fs.mkdir(path.join(dist, 'ort'), { recursive: true });
  for (const f of await fs.readdir(ortSrc)) if (/^ort-wasm.*\.(m?js|wasm)$/.test(f)) await fs.copyFile(path.join(ortSrc, f), path.join(dist, 'ort', f));
} else {
  console.warn('! engine packages not installed: building the engine worker against a stub');
}

const engineOptions = {
  entryPoints: { engine: path.join(root, 'web/engine/worker.ts') },
  outdir: path.join(dist, 'assets'),
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['es2022', 'safari16'],
  minify: !watch,
  sourcemap: false,
  alias: engineReal ? {} : { '@huggingface/transformers': path.join(root, 'web/engine/stub.ts'), 'kokoro-js': path.join(root, 'web/engine/stub.ts') },
  logLevel: 'info',
};

const options = {
  entryPoints: { main: path.join(root, 'web/main.tsx') },
  outdir: path.join(dist, 'assets'),
  bundle: true,
  format: 'esm',
  target: ['es2022', 'safari16'],
  jsx: 'automatic',
  minify: !watch,
  sourcemap: watch ? 'inline' : false,
  // Fonts and other url()s in CSS are served from /fonts; leave them as-is.
  external: ['/fonts/*', '../fonts/*'],
  define: { 'process.env.NODE_ENV': JSON.stringify(watch ? 'development' : 'production') },
  logLevel: 'info',
};

if (watch) {
  await (await context(options)).watch();
  await (await context(engineOptions)).watch();
} else {
  await build(options);
  await build(engineOptions);
}
