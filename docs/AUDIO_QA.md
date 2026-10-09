# Audio quality protocol

Returning a file is not the same as working. Use this before claiming any engine "does" an accent.

**Status (2026-10-09): not yet run against a real accent model.** The only engines exercised so far are the
dev passthrough and the contract echo, neither of which changes accent. No quality scores exist, and none should be invented.

## Test set

Use only recordings you have explicit permission to process. Store them outside the repo (see `.gitignore`).
Aim for 12–20 clips covering:

| Axis | Cover |
|---|---|
| Length | 5–10 s conversational, 30–60 s monologue, one 5–10 min piece (segmentation + drift) |
| Pace | slow and deliberate, normal, fast/excited |
| Source accent | at least General American, one UK, one non-native English speaker |
| Voice | low and high pitch, at least two speakers of each |
| Conditions | close mic clean, laptop mic in a room, mild background noise (fan, café) |
| Delivery | flat read, expressive with laughter/emphasis |

## Per clip, per target accent

Listen on headphones, A/B in the studio at the same timestamps. Record in a sheet:

1. **Accent audible?** Would a listener from that place recognise it? (no / partly / yes)
2. **Intelligible?** Every word understood on first listen? Note dropped or garbled words.
3. **Still them?** Would someone who knows the speaker recognise them? (no / partly / yes)
4. **Prosody kept?** Emphasis, pauses and emotion in the same places?
5. **Artifacts?** Clicks at segment joins, metallic tone, breaths lost, level jumps.
6. **Timing drift** (video clips): output duration vs input, lip-sync judged by eye.
7. **Usable?** Would a creator publish this as-is?

Optional objective checks, as support rather than verdicts:
- Word error rate of an ASR transcript of output vs input (meaning preservation).
- Speaker-embedding cosine similarity input vs output (identity).
- Accent-ID classifier confidence on output (accent fidelity).

Have at least two listeners, ideally including someone native to each target accent. Write up limitations
plainly in this file and in the FAQ copy if they affect users.
