# Dub Club — brand system v3

## What the product is now
Record a line, pick British or American, get it back re-voiced in that accent with your words and timing, download it.
It runs entirely in the browser on open-source models. The dub is spoken by an open-source voice, not a clone of the user.
The brand promises only that.

## Core idea
**One take, another accent, nothing uploaded.** Your recording is the original; each accent is another cut of it.

**Tagline.** Your words. New accent. (Replaced "Same voice. New accent.", which the product no longer does.)
**Promise line.** Free · Private · Runs in your browser (hero chip, footer).
**Three promises** (hero cards): Free: no account, no card. Private: runs on your device, nothing is uploaded.
Open source: built on Whisper and Kokoro.
**Main CTA.** Get dubbing / Record a line. **Closer.** Give that take another take.

## Words we use, and don't
- Say "re-voiced", "re-spoken", "your words", "your timing", "British cut / American cut".
- Don't say "your voice in a new accent", "sounds like you", "same voice", "clone", or "accent conversion".
  When it comes up, say it plainly: the voice is an open-source one, matched to your pitch.
- Privacy is a product feature, not fine print: "nothing uploaded" appears in the hero, ticker, studio and results.

## Language system
| Product moment | Creator framing |
|---|---|
| Record / upload | Record a line · Upload a file |
| Choose accent | Pick your cut (British, American) + voice (Match my pitch, Lower, Higher) |
| Process | Dub it. Real stages only: model download in MB, Listening, phrase n of N, Putting it together |
| Compare | Check it: one play button, flip Original / British at the same moment |
| Export | Download WAV |
| Sections | From take to post / Built for creators / What's in the studio / Your voice, your rules / Questions, answered |

Plain English stays plain where trust matters: privacy answers, errors, limits and what the voice is.

## Visual system
- **Colour.** Black `#0C0C0D`, court grey `#17171A`, chalk `#F4F2EC`, electric blue `#3B6CFF`, court green `#39F29A`.
  Blue always means Take B / the dub / the main action. Green is for highlights, "live" and test-mode notes.
  Red `#FF5A5F` is reserved for errors and deletes.
- **Photography.** Real creators from Unsplash (credited in the footer, ids in `web/lib/photos.ts`), framed as
  video thumbnails: one hook line, one label chip, a blue watched-bar. Calmer than YouTube — no giant arrows or faces
  pulling expressions, no invented view counts. The hero is the product itself: the recorder card.
- **Type.** DC Cond (subset of TeX Gyre Heros Condensed) bold italic, uppercase, tight leading for everything loud.
  DC Sans (subset of TeX Gyre Heros) for reading text.
- **Speed trail.** Outlined repeats chase a headline from behind, like a replay ghosting on a jumbotron
  (and a nod to dub delay). Hero, final call, social card only.
- **Shapes.** Slanted parallelograms for primary buttons, step numbers, chips and meters. A big outlined circle in the
  hero. 16:9 thumbnail tiles for accents. One green sticker on the social card ("Free + private").
- **Ticker.** A tilted scoreboard strip under the hero; it shows the two cuts and the three promises.

## Motion
- Load: trails slide out of the headline, sticker slaps on. Ticker scrolls.
- Response: buttons nudge forward, cut tiles lift, fill their watched-bar and get a check when picked, live dot blinks only during real work,
  deck meters follow real audio level.
- `prefers-reduced-motion` turns it all off.
