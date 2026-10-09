# Dub Club — brand system

## Strategy
Creators already have the take. Dub Club gives that take a second life somewhere else — same person, same words,
different accent. We sell experimentation, not "AI". The product is the comparison: hearing A and B at the same moment.

**Positioning.** For creators who have already recorded it, Dub Club changes where it sounds from while aiming to keep it you.
Unlike voice changers, it's about accent, not becoming someone else. Unlike TTS, it starts from your real performance.

**Tagline.** Same voice. New postcode.

**Personality.** The studio friend with good taste: dry, quick, knows the gear, never oversells. Plays with ideas, not with the user.

## Visual idea: the Echo and the Stamp
- **The Echo.** In dub, a phrase is thrown into a delay and comes back fainter each time. We do that to type: the line,
  then outlined repeats stepping down-right in orange. Used on the two biggest headlines, the wordmark ghost and the social card. Nowhere else.
- **Two takes.** Everything that comes in pairs is colour-coded: Take A is paper-white, Take B is orange. The A/B deck draws A up and B down from one line.
- **The Stamp.** Accents are postage stamps — you're sending your voice somewhere. Selecting one franks it with a postmark.
- **Gear.** Buttons are hardware keys with real travel (hard offset shadow, press-down). Progress uses tape reels.

## Colour
| Token | Hex | Use |
|---|---|---|
| Cobalt | `#1D3BC4` | The room: hero, nav, final call. |
| Ink | `#17181F` | Text, rules, the deck, hardware keys. |
| Sleeve | `#EEF0EA` | Default page — cool liner-note paper. |
| Paper | `#F8F8F3` | Raised surfaces: stamps, drop zone, panels. |
| Orange | `#FF5B1A` | Take B, the dub, and the actions that make one. Never body text. |
| Mint / Butter | `#8FE0BE` / `#FFE48A` | Status only: works now / test mode. |

## Type
- **DC Adventor** (subset of TeX Gyre Adventor, a geometric in the Avant Garde mould) — display, UI, labels. Tight tracking at size.
- **DC Schola** (subset of TeX Gyre Schola, a Century Schoolbook) — reading text. Liner notes.
- The 1970s record-sleeve pairing, on purpose. No monospace, no all-caps labels.
- Scale: 14 / 17 / 21 / 28 / 32–44 / 40–68 / hero 54–148 px.

## Voice
- Wit in headlines and empty states. Plain, exact English in privacy, errors and limits.
- Errors say what happened and what to do: "That video has no audio track — there's nothing to dub."
- Never claim what the engine can't do. Test mode is announced, not hidden.
- Verbs on buttons say what happens: "Dub it British", "Download video with new audio", "Delete everything".

## Motion
- One orchestrated moment: echoes throw out of the headline on load.
- Everything else answers an action: keys press down, stamps lift and get franked, reels spin only while work is happening, the deck meter follows real audio level.
- `prefers-reduced-motion` disables all of it.
