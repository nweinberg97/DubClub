# Dub Club

**Same voice. New accent.** Upload a recording you've already made, pick an accent, and run it back in that accent — aiming to keep your voice, your words and your timing. Then flip between the original and the dub at the same moment, and export audio or your video with the new track.

> **Status: v0.1.** The whole product works end to end — landing page, studio, upload, mic recording, processing pipeline, A/B deck, audio and video export, deletion and expiry. **The accent model itself is not connected yet.** By default the studio runs a development engine that passes audio through unchanged, and the UI says so everywhere. See [Connecting a real accent engine](#connecting-a-real-accent-engine).

## What works today

| | |
|---|---|
| Upload audio (MP3, WAV, M4A, AAC, OGG, Opus, FLAC, WebM) or video (MP4, MOV, M4V, WebM) | ✅ tested |
| Record a take from the mic in the browser (incl. header-less MediaRecorder WebM) | ✅ tested |
| Validation by content, not extension: no audio, silence, too long/short/large, corrupt | ✅ tested |
| Accent picker driven by what the engine reports | ✅ tested |
| Real pipeline: silence-aware segmentation → engine → stitch → level-match | ✅ tested |
| Honest status: real stages + per-segment count, queue position, cancel, retry | ✅ tested |
| A/B deck: one transport, flip takes mid-playback at the same timestamp, live level meter | ✅ tested |
| Export WAV / MP3 / M4A; video with audio replaced (picture stream copied) | ✅ tested |
| Delete a take, delete everything, automatic expiry after idle time | ✅ tested |
| Session isolation, traversal-proof storage, no secrets in the client | ✅ tested |
| **Actual accent conversion** | ⛔ needs an engine — see below |

## Quick start

Requirements: **Node 22+** and **ffmpeg/ffprobe** on your PATH. No GPU needed for the app itself.

```bash
git clone https://github.com/nweinberg97/dubclub && cd dubclub
npm install
cp .env.example .env        # defaults run the dev engine
npm run build
npm start                   # http://localhost:8787
```

Development with rebuild-on-save: `npm run dev`.

## Tests

```bash
npm run typecheck   # server, shared code, tests
npm test            # 43 unit + integration tests, using real ffmpeg (no mocks for media)
npm run build && npm start &   # then:
npm run e2e         # 26 browser checks in Chromium: real uploads, mic, dubbing, A/B, downloads, mobile, keyboard
```

Playwright needs Chromium: `npx playwright install chromium`.

## Architecture

```
web/            React SPA (landing + studio), bundled by esbuild. No CSS framework.
  brand/        Wordmark, Echo type treatment, brand name config
  components/   ABPlayer (deck), Stamps, TakeInput (drop + mic), DubDesk (whole flow), DubStatus, Faq
  lib/          api client (session token, XHR upload progress), audio peaks, useDub state machine
server/         Node `http` service, no framework
  app.ts        Routes, auth, upload streaming + validation, exports
  jobs/queue.ts In-process queue: segment → engine → stitch → level-match → preview
  engines/      The replaceable layer: passthrough | remote | elevenlabs
  media/        ffmpeg/ffprobe wrappers, validation
  storage.ts    Private on-disk storage keyed by sha256(session token), sweeper
shared/         Types and accent catalog used by both sides
tests/          node:test suites
scripts/        build, dev, e2e, mock-engine
docs/           DECISIONS, ENGINE_CONTRACT, AUDIO_QA, BRAND
```

Key decisions and the research behind them are in **[docs/DECISIONS.md](docs/DECISIONS.md)**.

## Configuration

All settings are environment variables (see `.env.example`):

| Variable | Default | Notes |
|---|---|---|
| `PORT`, `HOST` | `8787`, `0.0.0.0` | |
| `DATA_DIR` | `./data` | Private storage. Must not be web-served. Use a persistent volume in production. |
| `BRAND_NAME` | `Dub Club` | Also change `web/brand/config.ts`. |
| `MAX_UPLOAD_MB` / `MAX_DURATION_SEC` / `MIN_DURATION_SEC` | 200 / 600 / 1 | |
| `RETENTION_MINUTES` | 60 | Idle time before an upload and all its outputs are deleted. |
| `WORKER_CONCURRENCY` | 1 | Parallel jobs per instance. |
| `MAX_UPLOADS_PER_SESSION` | 5 | |
| `ENGINE` | `passthrough` | `passthrough`, `remote`, or `elevenlabs`. |
| `REMOTE_ENGINE_URL` / `_KEY` / `_TIMEOUT_SEC` | | For `remote`. |
| `ELEVENLABS_API_KEY` / `_MODEL_ID` / `_VOICES` | | For `elevenlabs` (voice swap). `_VOICES=en-GB:voiceId,…` |
| `ALLOWED_ORIGINS` | unset | Comma-separated origins allowed to call the API (e.g. the GitHub Pages site). |
| `TRUST_PROXY` | unset | Set `1` behind a reverse proxy so rate limits use `X-Forwarded-For`. |

## Connecting a real accent engine

1. Pick and evaluate a model (candidates and trade-offs in `docs/DECISIONS.md` §3). It needs a GPU.
2. Wrap it in the tiny HTTP contract in **[docs/ENGINE_CONTRACT.md](docs/ENGINE_CONTRACT.md)** — two endpoints.
3. Run the listening protocol in **[docs/AUDIO_QA.md](docs/AUDIO_QA.md)**. Only then report `changesAccent: true`.
4. Set `ENGINE=remote` and `REMOTE_ENGINE_URL`. Nothing else in the app changes.

Try the plumbing now with the echo server: `npm run mock-engine`, then `ENGINE=remote REMOTE_ENGINE_URL=http://localhost:8790 npm start`. It reports itself as a test engine, so the UI stays in test mode.

**ElevenLabs** (`ENGINE=elevenlabs`) works today with a key, but it is **voice swap**: delivery kept, speaker replaced by an accented target voice. It's labelled that way in the UI. It has been tested against a mocked API only.

## Going live (no downloads for users — it's a website)

Two pieces, both driven from this repo:

| Piece | What it serves | Where |
|---|---|---|
| **Dub Club service** | API + the full site (landing and studio) | **Render**, from `render.yaml` |
| **GitHub Pages copy** (optional) | The same site at `nweinberg97.github.io/dubclub`, calling the Render service | `.github/workflows/pages.yml` |

**1. Render (required — this is what makes the studio work)**
1. Sign in at render.com with GitHub.
2. New → **Blueprint** → choose `nweinberg97/dubclub`. Render reads `render.yaml` and creates the service with a 1 GB disk.
3. Apply. The site is live at the URL Render shows (e.g. `https://dubclub.onrender.com`). Every push to `main` redeploys.

The Starter instance (~$7/mo) is needed because uploads live on a persistent disk.

**2. GitHub Pages (optional)**
GitHub Pages only serves static files, so on its own it can show the landing page but cannot process audio.
The workflow builds the site so its studio talks to the Render service:
1. Repo Settings → Pages → Source: **GitHub Actions**.
2. If your Render URL isn't `https://dubclub.onrender.com`, add an Actions variable `API_ORIGIN` with the real URL.
3. Make sure `ALLOWED_ORIGINS` on Render includes `https://nweinberg97.github.io` (it does by default).

Self-hosting elsewhere: `docker build -t dubclub . && docker run -p 8787:8787 -v dubclub-data:/data --env-file .env dubclub`.
Don't run the studio on serverless functions — uploads, ffmpeg and long jobs need a long-running process.

## Privacy and security, as built

- Anonymous per-tab session token (256-bit). Storage paths use sha256(token) and random hex ids; user file names never touch the disk.
- Every private endpoint checks ownership; other sessions get 404. Dot-segments and encoded traversal are refused before routing.
- Uploads are streamed with a hard byte cap and probed with ffprobe; the extension is never trusted. Rejected uploads leave nothing behind.
- Files are written `0600` in `0700` directories, served only via authenticated endpoints with `Cache-Control: no-store`.
- Strict CSP, `nosniff`, `frame-ancestors 'none'`, no third-party scripts or fonts.
- Logs contain ids, timings and error codes — never file names, audio or tokens.
- Deletion removes files from disk immediately; the sweeper removes idle uploads after `RETENTION_MINUTES`.
- Consent is required for every dub. Accent change is not presented as anonymity.

## Cost (estimates, Oct 2026 — verify)

| Piece | Rough monthly cost |
|---|---|
| Web service (1 small container + 1–10 GB volume) | ~$5–15 |
| Accent model on on-demand GPU | usage-based; measure per minute of audio on your model |
| ElevenLabs (if used) | provider pricing, per minute of audio |
| GitHub + CI | $0 on the free tier |

## Known limitations

- **No accent model connected.** Default engine changes nothing; this is stated in the UI.
- Single instance: local queue and disk. Scaling out needs a shared queue and private object storage with lifecycle rules.
- No accounts; closing the tab loses access to your files (they then expire).
- "Speech present" is a level/silence check, not a voice-activity detector.
- No genuine demo dub audio on the landing page yet — visitors try it with their own voice instead.
- No lockfile is committed (the build environment had no registry access). Run `npm install` and commit `package-lock.json`.
- Web-code typecheck (`npm run typecheck:web`) hasn't been run yet; CI runs it as non-blocking.
- Fonts are subsets of TeX Gyre Heros / Heros Condensed under the GUST Font License (`public/fonts/`).
- "Dub Club" has naming conflicts to clear before a public launch (see DECISIONS §2).

## Next steps (in priority order)

1. Choose and evaluate an accent-conversion model on a GPU; wrap it in the engine contract; run `AUDIO_QA.md`.
2. Record authorised before/after samples and add a genuine demo to the landing hero.
3. Commit a lockfile and get CI green, including the web typecheck.
4. Trademark/domain check for the name.
5. Accounts + saved projects; object storage with lifecycle policies; shared queue for multiple workers.
6. Per-segment re-dub (fix one bad sentence without redoing the take).
7. Usage limits and pricing once inference costs are measured.
