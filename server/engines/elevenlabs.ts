import fs from 'node:fs/promises';
import path from 'node:path';
import { accentOption } from '../../shared/accents.ts';
import { EngineError, type Engine, type SegmentRequest } from './types.ts';

/**
 * VOICE SWAP — not accent conversion.
 * ElevenLabs speech-to-speech re-voices your performance as a target voice. If that target voice
 * has a British accent, the output sounds British — but it also sounds like *that* voice, not you.
 * The accent→voice mapping comes from ELEVENLABS_VOICES. UI and copy say this plainly.
 */
export class ElevenLabsEngine implements Engine {
  readonly id = 'elevenlabs';
  readonly maxSegmentSec = 240; // provider limit is 5 minutes per request; stay well under

  constructor(
    private apiKey: string,
    private modelId: string,
    private voices: Record<string, string>,
    private fetchImpl: typeof fetch = fetch,
  ) {}

  describe() {
    const ready = !!this.apiKey && Object.keys(this.voices).length > 0;
    return {
      id: this.id,
      name: 'Voice swap (ElevenLabs)',
      kind: 'voice-swap' as const,
      changesAccent: true,
      preservesSpeaker: false,
      external: true,
      providerNote:
        'Audio is sent to ElevenLabs for processing and handled under their terms and retention policy. Dub Club does not control their retention.',
      supportsStrength: false,
      ready,
      readyNote: ready
        ? 'Voice swap: your delivery is kept, but the voice becomes a different (accented) voice.'
        : 'Set ELEVENLABS_API_KEY and ELEVENLABS_VOICES to enable this engine.',
    };
  }

  async accents() {
    return Object.keys(this.voices).map((id) =>
      accentOption(id, { note: 'Voice swap — you won’t sound like you' }),
    );
  }

  configSummary(accent: string) {
    return { model: this.modelId, voiceId: this.voices[accent] ?? 'unmapped' };
  }

  async transformSegment(req: SegmentRequest): Promise<string> {
    const voice = this.voices[req.accent];
    if (!voice) throw new EngineError('unsupported_accent', 'That accent isn’t configured for this engine.', false);
    const audio = await fs.readFile(req.inputWav);
    const form = new FormData();
    form.append('audio', new Blob([audio], { type: 'audio/wav' }), 'segment.wav');
    form.append('model_id', this.modelId);
    const url = `https://api.elevenlabs.io/v1/speech-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`;
    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method: 'POST',
        headers: { 'xi-api-key': this.apiKey },
        body: form,
        signal: AbortSignal.any([req.signal, AbortSignal.timeout(300_000)]),
      });
    } catch {
      if (req.signal.aborted) throw new EngineError('cancelled', 'Cancelled', false);
      throw new EngineError('engine_unreachable', 'We couldn’t reach the voice provider.');
    }
    if (!res.ok) {
      const retryable = res.status >= 500 || res.status === 429;
      throw new EngineError('engine_error', `The voice provider returned an error (${res.status}).`, retryable);
    }
    const out = path.join(req.outDir, 'eleven.mp3');
    await fs.writeFile(out, Buffer.from(await res.arrayBuffer()));
    return out;
  }
}
