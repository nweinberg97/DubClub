// Dev: rebuild the web app on change and run the server with reload.
import { spawn } from 'node:child_process';

const procs = [
  spawn('node', ['scripts/build.mjs', '--watch'], { stdio: 'inherit' }),
  spawn('npx', ['tsx', 'watch', 'server/index.ts'], { stdio: 'inherit' }),
];
const stop = () => procs.forEach((p) => p.kill('SIGTERM'));
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
