import { createApp } from './app.ts';
import { loadConfig } from './config.ts';
import { createEngine } from './engines/registry.ts';
import { RemoteEngine } from './engines/remote.ts';
import { log } from './log.ts';

const cfg = loadConfig();
const engine = createEngine(cfg);
if (engine instanceof RemoteEngine) await engine.refresh(true);

const app = await createApp(cfg, engine);
app.server.listen(cfg.port, cfg.host, () => {
  const d = engine.describe();
  log.info('listening', { port: cfg.port, engine: d.id, kind: d.kind, ready: d.ready });
  if (d.kind === 'dev-passthrough') {
    log.warn('dev engine active: pipeline runs but accents are NOT changed. Set ENGINE=remote for real conversion.');
  }
});

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, async () => {
    await app.close();
    process.exit(0);
  });
}
