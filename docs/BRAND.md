# Dub Club — brand system v2 ("League")

## Direction
The energy of sports-culture creative (the kind of work agencies like Victory Creative Group make for Nike and the NBA) —
loud, confident, italic, fast — pointed at creators. The core idea: **one take, every version.** Your recording is the
original; each accent is another cut of it, like versions of a video.

**Tagline.** Same voice. New accent.
**Main CTA.** Start dubbing. **Closer.** Give that take another take.

## Language system
| Product moment | Creator framing |
|---|---|
| Upload | Drop your take |
| Choose accent | Pick your cut — accents are thumbnail tiles ("GB cut") with a red watched-bar when picked |
| Process | Dub it — status is a render queue (Queued, Prep, Dub, Export), real stages only |
| Compare | Check it — A/B check, Before vs After |
| Export | Post it |
| Sections | From take to post / Built for creators / What's in the studio / Your voice, your rules / Questions, answered |

Plain English stays plain where trust matters: privacy answers, errors, limits and the test-mode notice.

## Visual system
- **Colour.** Black `#0C0C0D`, court grey `#17171A`, chalk `#F4F2EC`, electric blue `#3B6CFF`, court green `#39F29A`.
  Blue always means Take B / the dub / the main action. Green is for highlights, "live" and test-mode notes.
  Red `#FF5A5F` is reserved for errors and deletes.
- **Photography.** Real creators from Unsplash (credited in the footer, ids in `web/lib/photos.ts`), framed as
  video thumbnails: one hook line, one label chip, a blue watched-bar. Calmer than YouTube — no giant arrows or faces
  pulling expressions, no invented view counts. The hero shows one creator split down the middle, original vs dubbed cut.
- **Type.** DC Cond (subset of TeX Gyre Heros Condensed) bold italic, uppercase, tight leading for everything loud.
  DC Sans (subset of TeX Gyre Heros) for reading text.
- **Speed trail.** Outlined repeats chase a headline from behind, like a replay ghosting on a jumbotron
  (and a nod to dub delay). Hero, final call, social card only.
- **Shapes.** Slanted parallelograms for primary buttons, step numbers, chips and meters. A big outlined circle in the
  hero. 16:9 thumbnail tiles for accents. One gold sticker ("No re-records").
- **Ticker.** A tilted scoreboard strip under the hero; it shows real accents, or "test mode" when no engine is connected.

## Motion
- Load: trails slide out of the headline, sticker slaps on. Ticker scrolls.
- Response: buttons nudge forward, cut tiles lift, fill their watched-bar and get a check when picked, live dot blinks only during real work,
  deck meters follow real audio level.
- `prefers-reduced-motion` turns it all off.
