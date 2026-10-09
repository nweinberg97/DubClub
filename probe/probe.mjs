import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const pkg = (p) => JSON.parse(fs.readFileSync(`node_modules/${p}/package.json`, 'utf8'));
for (const p of ['kokoro-js', '@huggingface/transformers', 'onnxruntime-web', 'phonemizer']) {
  try { const j = pkg(p); console.log('PKG', p, j.version, j.license, JSON.stringify(j.exports ?? j.main).slice(0, 600)); } catch (e) { console.log('PKG', p, 'missing'); }
}
console.log(execFileSync('bash', ['-c', 'ls node_modules/kokoro-js node_modules/kokoro-js/dist node_modules/onnxruntime-web/dist | head -80; ls node_modules/@huggingface/transformers/dist; cat node_modules/kokoro-js/README.md | head -120; ls node_modules/kokoro-js/types 2>/dev/null; cat node_modules/kokoro-js/types/kokoro.d.ts 2>/dev/null | head -150; grep -o "\"[ab][fm]_[a-z]*\"" -r node_modules/kokoro-js/dist/kokoro.js | sort -u | head -60']).toString());

const { KokoroTTS } = await import('kokoro-js');
const t0 = Date.now();
const tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'q8', device: 'cpu' });
console.log('kokoro load ms', Date.now() - t0, 'voices', Object.keys(tts.voices ?? {}).join(','));
for (const v of ['bm_george', 'am_michael']) {
  const t1 = Date.now();
  const a = await tts.generate('Hello, my name is John, and welcome back to the channel.', { voice: v, speed: 1 });
  console.log('gen', v, Object.keys(a), a.sampling_rate, a.audio.length / a.sampling_rate, 'ms', Date.now() - t1);
  await a.save(`out_${v}.wav`);
}
execFileSync('espeak-ng', ['-v', 'en-us', '-s', '150', '-w', 'in.wav', 'Hello, my name is John. Today I want to see if I can pull off a British accent.']);
const { pipeline } = await import('@huggingface/transformers');
const t2 = Date.now();
const asr = await pipeline('automatic-speech-recognition', 'onnx-community/whisper-base_timestamped', { dtype: 'q8' });
console.log('whisper load ms', Date.now() - t2);
const { WaveFile } = await import('wavefile').catch(() => ({}));
// decode with ffmpeg to f32 16k
const raw = execFileSync('ffmpeg', ['-loglevel', 'error', '-i', 'in.wav', '-f', 'f32le', '-ac', '1', '-ar', '16000', '-']);
const f32 = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
const out = await asr(f32, { return_timestamps: 'word', chunk_length_s: 30, language: 'english', task: 'transcribe' });
console.log('ASR', JSON.stringify(out));
const raw2 = execFileSync('ffmpeg', ['-loglevel', 'error', '-i', 'out_bm_george.wav', '-f', 'f32le', '-ac', '1', '-ar', '16000', '-']);
console.log('ASR kokoro', JSON.stringify(await asr(new Float32Array(raw2.buffer, raw2.byteOffset, raw2.length / 4), { return_timestamps: 'word', language: 'english' })));
