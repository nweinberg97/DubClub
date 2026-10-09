import type { Config } from '../config.ts';
import { ElevenLabsEngine } from './elevenlabs.ts';
import { PassthroughEngine } from './passthrough.ts';
import { RemoteEngine } from './remote.ts';
import type { Engine } from './types.ts';

export function createEngine(cfg: Config): Engine {
  switch (cfg.engine) {
    case 'remote':
      return new RemoteEngine(cfg.remote.url, cfg.remote.key, cfg.remote.timeoutSec);
    case 'elevenlabs':
      return new ElevenLabsEngine(cfg.elevenlabs.apiKey, cfg.elevenlabs.modelId, cfg.elevenlabs.voices);
    case 'passthrough':
      return new PassthroughEngine();
    default:
      throw new Error(`Unknown ENGINE "${cfg.engine}". Use passthrough, remote or elevenlabs.`);
  }
}
