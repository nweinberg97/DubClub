// Production build: bundle the SPA with esbuild, copy public assets into dist/.
import { build, context } from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const dist = path.join(root, 'dist');
const watch = process.argv.includes('--watch');

await fs.rm(dist, { recursive: true, force: true });
await fs.mkdir(path.join(dist, 'assets'), { recursive: true });
await fs.cp(path.join(root, 'public'), dist, { recursive: true });
await fs.copyFile(path.join(root, 'web/index.html'), path.join(dist, 'index.html'));

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
  external: ['/fonts/*'],
  define: { 'process.env.NODE_ENV': JSON.stringify(watch ? 'development' : 'production') },
  logLevel: 'info',
};

if (watch) {
  const ctx = await context(options);
  await ctx.watch();
} else {
  await build(options);
}
