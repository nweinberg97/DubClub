# Dub Club — Decision Record

_Last updated: 2026-10-09. Owner: founding team. Status: v0.1, first working build._

This is the short, honest record of what we assumed, what we found, and what we chose.
If something here stops being true, change this file in the same PR that changes the code.

---

## 1. Product assumptions

- **First user:** a solo creator with a recording they already made (YouTube, Shorts, podcast, course).
  Not a team, not an enterprise, not a live call.
- **Core loop:** drop a take → pick a target accent → dub → A/B against the original → export.
- **File, not live.** Creators edit after the fact, so offline file processing is the right shape.
  Real-time conversion is a different product.
- **English first.** Every credible accent-conversion system we found targets English varieties.
- **Play matters.** Comparing takes is the product, so the A/B player is a first-class component, not an afterthought.

## 2. Naming risk

"Dub Club" is a working name. Findings from a light search (not legal advice, not a trademark clearance):

- The brief flags an existing audiobook-dubbing product using "Dub Club", and Dub-Dub.ai operating in AI dubbing.
- App stores contain many "Dub AI" / "Dub Studio" / "Dubbing AI" voice and translation apps. "Dub" is crowded in this category.
- **Risk:** medium. Fine for building and testing; get a proper trademark search before spending on paid acquisition or a domain.
- **Mitigation built in:** the brand name lives in one place (`web/brand/config.ts` and `BRAND_NAME` on the server).
  Changing it does not require touching components.

## 3. The core technical question: can anything do identity-preserving accent conversion today?

What we compared (research done 2026-10):

| Approach | Accent actually changes? | Keeps the speaker? | Words preserved? | Access | Verdict for v0.1 |
|---|---|---|---|---|---|
| **Dedicated accent conversion (commercial)** — e.g. Sanas Accent Translation | Yes (output US / UK English) | Vendor claims yes | Yes (speech-to-speech) | Enterprise SDK, real-time call focus, no public self-serve pricing found | Best fit in principle. Not self-serve. Needs a sales conversation. |
| **Research accent-conversion models** — e.g. FAC-FACodec (2025), "Voice-preserving zero-shot multiple accent conversion" (2022) | Yes, per papers | Papers report good identity preservation | Yes | Code / weights / licence not confirmed; GPU needed | Promising. Needs hands-on evaluation on a GPU before we promise anything. |
| **Voice changer / speech-to-speech into a target voice** — e.g. ElevenLabs Voice Changer | Only because the *target voice* has that accent | **No** — you become the target voice | Yes, performance carried | Self-serve API, ~5 min per request | Real and available, but it's voice replacement, not accent conversion. Offered only as a clearly labelled "voice swap" engine. |
| **Transcribe → regenerate (TTS / clone)** | Depends on the TTS voice | Partially (clones tend to carry the *source* accent) | Mostly, but timing, emphasis and emotion change | Many APIs | Worst match to the promise. Not implemented. |
| **DSP (pitch / formant shift)** | No | n/a | Yes | Free | Does not change accent. Rejected. |
| **In-browser inference** | — | — | — | — | No accent-conversion model small enough exists that we could verify. Rejected for now. |

### Decision

**No single engine available to us today honestly delivers "same person, different accent" on a self-serve basis.**
So v0.1 ships the full product around a **replaceable engine layer** and three engines:

1. `remote` — **the intended production path.** A small, documented HTTP contract (`docs/ENGINE_CONTRACT.md`)
   that any accent-conversion model server can implement: a self-hosted research model on a GPU,
   or an adapter in front of a commercial vendor. The engine reports its own accents and whether it supports a
   strength control. The UI only shows what the engine says it can do.
2. `elevenlabs` — **voice swap, labelled as such.** Real, available today with an API key, useful for creators
   who want an accented *character* voice. The UI and marketing state plainly that it does not keep you sounding like you.
3. `passthrough` — **the dev engine.** Runs the whole real pipeline (validation, segmentation, processing, export)
   but only level-matches the audio. It reports `changesAccent: false` and the UI shows a permanent banner saying so.
   It exists so the product can be built and tested end to end without a GPU or keys. It is never presented as a dub.

Every job records which engine and configuration produced it.

## 4. Architecture

Chosen: **one Node 22 TypeScript service** (zero-framework `node:http`), serving a React SPA built with esbuild,
with an in-process job queue and private local disk storage. `ffmpeg` does all media work.

Why:
- Uploads, probing, segmenting and exporting are I/O and ffmpeg work. A single small service does this well.
- The heavy model lives behind the `remote` engine, on hardware suited to it. We do **not** put a speech model
  in a serverless function.
- Very few dependencies (React, esbuild, TypeScript, tsx). Less to break, less to audit.

Desktop app? Considered. It would only win if a strong model could run locally on a laptop CPU. None we found can,
so a desktop wrapper adds install friction without improving privacy or quality. Revisit if that changes.

```
Browser (SPA) ──HTTPS──> Dub Club service (Node)
                           ├── uploads: streamed to private disk, size-capped, probed by ffprobe
                           ├── jobs: in-process queue → segment at silences → engine → stitch → loudness match
                           ├── engines: passthrough | remote (your GPU model) | elevenlabs (voice swap)
                           ├── exports: WAV / MP3 / M4A, and MP4/WebM with the audio track replaced
                           └── sweeper: deletes everything after RETENTION_MINUTES idle
```

## 5. Key limitations (v0.1)

- **Accent quality depends entirely on the engine you plug in.** The default dev engine does not change accents.
- Single instance: the queue and storage are local. Horizontal scaling needs a shared queue + object storage.
- Sessions are anonymous browser tokens (no accounts). Losing the tab's session token means losing access
  to your files (they're then swept on schedule).
- The "speech present?" check is a loudness/silence check, not a true voice-activity detector.
- No demo dub audio ships with the site, because we don't have an engine that produces an honest one yet.
  The landing page says so, and the demo plays your own take locally instead.

## 6. Infrastructure and cost (estimates, Oct 2026 — verify before relying on them)

| Item | Option | Rough cost |
|---|---|---|
| Web service | 1 small container (1 vCPU / 1–2 GB) on Fly.io / Render / Railway, with a persistent volume | ~$5–15 / month |
| Accent model (`remote`) | GPU on demand (Modal, RunPod, Replicate-style) | Usage-based. Typically cents per minute of audio on a mid-range GPU, plus cold starts. Measure on your model. |
| ElevenLabs voice swap | Paid plan; billed by the provider per minute of processed audio | See provider pricing |
| Repository / CI | GitHub free tier | $0 |

Free static hosting can host the marketing page, but the studio needs the service. Free compute will not reliably run a speech model.

## 7. Definition of done for v0.1

- [x] Landing page and studio share one brand system.
- [x] Upload (file or mic) → validate → choose accent from engine capabilities → process via the real pipeline → A/B → export audio and video.
- [x] Honest status (real stages, real per-segment progress), cancel, retry, delete, automatic expiry.
- [x] Engine layer swappable without UI changes; engine recorded per job.
- [x] Automated tests including real ffmpeg processing and a contract test for the `remote` engine.
- [ ] A real accent-conversion engine evaluated on a GPU with the listening protocol in `docs/AUDIO_QA.md`. **Not done — needs hardware and a model choice.**
