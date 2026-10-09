# Dub Club

**Your words. New accent.** Record a line, pick British or American, and hear it come back re-spoken in that accent with your timing. Compare the two, then download the WAV.

**Live:** https://nweinberg97.github.io/DubClub/

It's free, open source, and it runs entirely in the visitor's browser. There's no server that receives audio and nothing for users to install.

## How it works

```
mic / file ──► decode to 16 kHz (Web Audio) ──► Web Worker:
                 1. Whisper base (word timestamps)  → "Hello," 0.00–0.40 · "my" 0.72–0.88 …
                 2. group words into phrases at pauses and sentence ends
                 3. Kokoro-82M re-speaks each phrase in a British or American voice,
                    speed-fitted (0.85–1.3×) so it lands in the original phrase's slot
                 4. lay phrases on the original timeline, match loudness, encode WAV
               ◄── compare A/B · download WAV
```

- **Listening:** [Whisper](https://github.com/openai/whisper) base, `onnx-community/whisper-base_timestamped` (MIT).
- **Speaking:** [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) via [`kokoro-js`](https://www.npmjs.com/package/kokoro-js), `onnx-community/Kokoro-82M-v1.0-ONNX` (Apache-2.0). Voices: George / Emma (British), Michael / Heart (American). Picked from the speaker's median pitch, or by the user.
- **Runtime:** [Transformers.js](https://github.com/huggingface/transformers.js) 3.8.1 + ONNX Runtime Web (WebAssembly, q8). The JS and WASM are bundled into the site; only the model weights (≈172 MB, measured in CI) are fetched from Hugging Face on first use, then cached by the browser.

**What it isn't (yet):** the dub is spoken by an open-source voice, not a clone of yours. The UI says so on every result. Only British and American English are offered, because those are what the open model does well.

## Privacy

- The recording is decoded, transcribed and re-spoken on the user's device. It is never uploaded.
- CI proves this on every push: the end-to-end test fails if the page sends any non-GET request or talks to anything other than its own origin and the model host.
- The transcript is shown to the user and lives only in the tab.

## Tests

```bash
npm install
npm run typecheck && npm test   # 50 unit + integration tests (DSP helpers, server, real ffmpeg)
npm run build && npm start &    # then, with ffmpeg + espeak-ng installed and network to huggingface.co:
npm run e2e                     # 19 checks in Chromium with the REAL models
```

The e2e test plays espeak-ng speech into a fake microphone, records it in the page, dubs it British and American in the browser, downloads the WAVs, then transcribes the download independently in Node and checks the words survived. Latest CI run: first dub (including the 172 MB model download) 39 s, next dub 21 s, for a 7.5 s take, on a 2-core runner without WebAssembly threads.

CI publishes the run's audio (input, both dubs) and results to the `ci-results` branch so they can be listened to.

## Run locally

```bash
npm install
npm run build
npm start          # http://localhost:8787 — serves the site (the engine still runs in your browser)
```

Without the engine packages installed (`kokoro-js`, `@huggingface/transformers`), the build uses a stub and the studio says the engine isn't included.

## Deploy

GitHub Pages: `.github/workflows/pages.yml` builds with `BASE_PATH=/<repo>` and publishes `dist/`. Settings → Pages → Source: "GitHub Actions". Any static host works the same way; copy `dist/`.

## Repository layout

```
web/engine/   The in-browser engine: worker.ts (models), dsp.ts (phrasing, pitch, timing, WAV), client.ts (React hook)
web/          React SPA (landing + studio), esbuild bundle, no CSS framework
scripts/      build, e2e (real models), make-demo (landing sample via the real pipeline)
server/       Optional Node service: serves the site locally with a strict CSP. Also contains the earlier
              server-side pipeline (upload → ffmpeg segmentation → pluggable engine → export) and its tests,
              kept for a future engine that needs a GPU. The live site doesn't use it.
```

## Licences

Dub Club's own code: not yet licensed (all rights reserved by the repo owner). Third-party components and their licences are listed in [NOTICE.md](NOTICE.md).

## Next steps

1. **Keep the speaker's voice.** Add an open voice-conversion pass (e.g. a small timbre converter) so the dub sounds like the user, not a stock voice.
2. **Faster on capable devices.** Use WebGPU when available; enable WASM threads on hosts that can send COOP/COEP headers.
3. **More accents** as open multi-accent TTS models appear.
4. **Video in, video out:** mux the dub back onto the user's video in the browser.
