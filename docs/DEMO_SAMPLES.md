# Real demo samples for the homepage sampler

The hero sampler ("Hey, my name is John…") plays **sample voices built into the visitor's browser** until real
recordings exist. Those are different synthetic speakers and are labelled "Sample voices" on the page.

To switch it to genuine Dub Club output:

1. Record one person (with their written permission to use it on the site) saying a short line.
2. Run it through the studio with a real accent engine and export each cut as MP3.
3. Put the files in `public/demo/` and add `public/demo/manifest.json`:

```json
{
  "speaker": "John",
  "text": "Hey, my name is John — and welcome back to the channel.",
  "original": "john-original.mp3",
  "cuts": { "en-GB": "john-en-GB.mp3", "en-AU": "john-en-AU.mp3" }
}
```

4. Push. The sampler detects the manifest, plays the real files, and its badge changes to "Real Dub Club output".

Only do step 4 with real output from the real pipeline. Never put voice-swapped or text-to-speech audio here.
