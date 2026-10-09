# Accent engine contract (v1)

Dub Club talks to an accent-conversion model through this small HTTP contract (`ENGINE=remote`).
Implement it in front of any model — a self-hosted research model on a GPU, or an adapter for a vendor —
and the whole studio (upload, segmentation, progress, A/B, export, deletion) works unchanged.

A reference **echo** implementation lives in `scripts/mock-engine.mjs`; the contract is enforced by
`tests/engines.test.ts`.

## Auth

If `REMOTE_ENGINE_KEY` is set, every request carries `Authorization: Bearer <key>`.
The key never reaches the browser.

## `GET /v1/capabilities`

```json
{
  "name": "Your model name",
  "changesAccent": true,
  "preservesSpeaker": true,
  "supportsStrength": true,
  "maxSegmentSec": 30,
  "external": false,
  "providerNote": "Plain-language sentence about where audio goes and whether it's kept.",
  "accents": [
    { "id": "en-GB", "note": "Southern English", "previewUrl": "https://…/gb.mp3" },
    { "id": "en-AU" }
  ]
}
```

| Field | Meaning |
|---|---|
| `accents` (required) | Only accents the model can **genuinely** produce. The UI shows exactly these. Known ids get labels from `shared/accents.ts`. |
| `changesAccent` | Set `false` for test servers. The UI then shows "test mode" everywhere. |
| `preservesSpeaker` | `false` if output is a different voice. Changes UI and FAQ copy. |
| `supportsStrength` | Shows the "how far to travel" slider; `strength` is then sent (0–1). |
| `maxSegmentSec` | Dub Club splits recordings at pauses so no segment exceeds this (min 5, default 30). |
| `external` / `providerNote` | Drive the privacy section. Be accurate: if audio goes to a third party, say so. |

Capabilities are cached for 60 s. If the endpoint is unreachable, the studio still accepts uploads but
disables dubbing and says the engine is offline.

## `POST /v1/convert?accent=en-GB&strength=0.7`

- Body: `audio/wav`, mono, 16-bit PCM, 44.1 kHz. One segment, ≤ `maxSegmentSec`.
- Response `200`: the converted audio. Any format ffmpeg can decode (WAV preferred). Dub Club normalizes it.
- Should keep roughly the same duration so video stays in sync. Large changes are padded/trimmed at export.
- Errors: non-2xx with `{"error":{"code":"…","message":"…"}}`. The message is shown to the user, so write it for humans.
  - `429` / `5xx` → retried up to twice with backoff.
  - `4xx` → not retried; the job fails with your message.
- Must not retain audio after responding (or `providerNote` must say otherwise).
- Timeout: `REMOTE_ENGINE_TIMEOUT_SEC` (default 600) per segment.

## Choosing a model to put behind it

See `docs/DECISIONS.md` §3. Before switching `changesAccent` to `true`, run the listening protocol in
`docs/AUDIO_QA.md` and record the results.
