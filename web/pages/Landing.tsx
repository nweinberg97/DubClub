import { useEffect, useState } from 'react';
import { BRAND } from '../brand/config.ts';
import { Echo, Ticker, Wordmark } from '../brand/Echo.tsx';
import { QuickDub } from '../components/QuickDub.tsx';
import { Faq, type QA } from '../components/Faq.tsx';
import { StampPicker } from '../components/Stamps.tsx';
import { FeedCard, type FeedItem } from '../components/Thumbs.tsx';
import { Sampler } from '../components/Sampler.tsx';
import { PHOTOS } from '../lib/photos.ts';
import { Link, href } from '../router.tsx';

export function Landing() {
  useEffect(() => {
    document.title = `${BRAND.name} — ${BRAND.tagline}`;
  }, []);

  return (
    <>
      <SiteNav />
      <main id="main">
        <Hero />
        <Ticker items={['British cut', 'American cut', 'Free', 'Nothing uploaded', 'Open source', 'No re-records', 'British cut', 'American cut', 'Free', 'Nothing uploaded', 'Open source', 'No re-records']} tone="accent" />
        <section className="sect sect--court hear" aria-labelledby="hear-h">
          <div className="wrap sect__head hear__inner">
            <div>
              <h2 id="hear-h" className="h2">
                Hear the accents.
              </h2>
              <p className="lede">Not sure which one fits? Play the same line in each before you dub.</p>
            </div>
            <Sampler />
          </div>
        </section>
        <HowItWorks />
        <UseCases />
        <StatSheet />
        <HouseRules />
        <section id="faq" className="sect sect--chalk" aria-labelledby="faq-h">
          <div className="wrap wrap--split">
            <h2 id="faq-h" className="h2">
              Questions, answered.
            </h2>
            <Faq items={FAQ} />
          </div>
        </section>
        <FinalCta />
      </main>
      <SiteFooter />
    </>
  );
}

export function SiteNav() {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <header className="nav" data-open={open}>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <div className="nav__inner wrap">
        <Link to="/" className="nav__brand" aria-label={`${BRAND.name} home`}>
          <Wordmark />
        </Link>
        <button type="button" className="nav__toggle" aria-expanded={open} aria-controls="nav-links" onClick={() => setOpen((o) => !o)}>
          <span className="sr-only">Menu</span>
          <span className="nav__burger" aria-hidden="true" />
        </button>
        <nav id="nav-links" className="nav__links" aria-label="Main">
          <a href={href('/#try')} onClick={close}>
            Product
          </a>
          <a href={href('/#how')} onClick={close}>
            How it works
          </a>
          <a href={href('/#uses')} onClick={close}>
            Use cases
          </a>
          <a href={href('/#privacy')} onClick={close}>
            Privacy
          </a>
          <Link to={BRAND.studioPath} className="btn btn--accent nav__cta" onClick={close}>
            <span>Get dubbing</span>
          </Link>
        </nav>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="hero" aria-labelledby="hero-h">
      <div className="hero__court" aria-hidden="true">
        <span className="hero__circle" />
      </div>
      <div className="wrap hero__inner">
        <div className="hero__grid">
          <div className="hero__copy">
            <span className="chip chip--accent hero__live">
              <span className="chip__dot" /> {BRAND.promise}
            </span>
            <h1 id="hero-h" className="hero__h">
              <span className="hero__l1 tt">Your words.</span>
              <span className="hero__l2 tt tt--accent">New accent.</span>
            </h1>
            <p className="hero__lede">
              Record a line, pick British or American, and hear it re-voiced in that accent — your words, your timing, no re-record. It all happens in your browser, so your
              recording never leaves your device.
            </p>
            <ul className="promises" aria-label="What you get">
              {PROMISES.map((p) => (
                <li key={p.t}>
                  <strong>{p.t}</strong>
                  <span>{p.d}</span>
                </li>
              ))}
            </ul>
            <div className="hero__ctas hero__mobilecta">
              <a href="#try" className="btn btn--accent btn--big">
                Record a line
              </a>
            </div>
          </div>
          <div className="hero__media" id="try">
            <QuickDub />
          </div>
        </div>
      </div>
    </section>
  );
}

const PROMISES = [
  { t: 'Free', d: 'No account, no card, no limits to unlock.' },
  { t: 'Private', d: 'Runs on your device. Nothing is uploaded.' },
  { t: 'Open source', d: 'Built on Whisper and Kokoro.' },
];

const STEPS = [
  { t: 'Record a take', d: 'Hit record and say a line or two, or drop in an audio or video file you already have.', v: 'drop' },
  { t: 'Pick your cut', d: 'British or American, with a lower or higher voice. Those are the accents the engine does well today.', v: 'jersey' },
  { t: 'Dub it', d: 'Your browser writes down each word with its timing, then re-speaks every phrase in the new accent, in the same slot.', v: 'run' },
  { t: 'Check it', d: 'Flip between the original and the new cut at the exact same moment.', v: 'ab' },
  { t: 'Download', d: 'Save the dub as a WAV, ready for your editor.', v: 'out' },
] as const;

function HowItWorks() {
  return (
    <section id="how" className="sect sect--chalk how" aria-labelledby="how-h">
      <div className="wrap">
        <h2 id="how-h" className="h2">
          From take to post.
        </h2>
        <div className="chapters" aria-hidden="true">
          {STEPS.map((st, i) => (
            <span key={st.t} className={i < 3 ? 'is-watched' : ''}>
              <i>{st.t}</i>
            </span>
          ))}
        </div>
        <ol className="plays">
          {STEPS.map((s, i) => (
            <li key={s.t} className="play">
              <span className="play__n" aria-hidden="true">
                {String(i + 1).padStart(2, '0')}
              </span>
              <div className={`play__vis play__vis--${s.v}`} aria-hidden="true">
                <PlayVisual kind={s.v} />
              </div>
              <h3 className="play__t">{s.t}</h3>
              <p className="play__d">{s.d}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function PlayVisual({ kind }: { kind: string }) {
  switch (kind) {
    case 'drop':
      return <span className="pv-file">TAKE_03.MP4</span>;
    case 'jersey':
      return (
        <>
          <span className="pv-jersey">US</span>
          <span className="pv-jersey pv-jersey--on">GB</span>
        </>
      );
    case 'run':
      return (
        <span className="pv-segs">
          <span className="is-done" />
          <span className="is-done" />
          <span className="is-now" />
          <span />
          <span />
        </span>
      );
    case 'ab':
      return (
        <>
          <span className="pv-bars pv-bars--a" />
          <span className="pv-bars pv-bars--b" />
        </>
      );
    default:
      return <span className="pv-chip">TAKE_03 (British).WAV</span>;
  }
}

const USES: FeedItem[] = [
  {
    photo: PHOTOS.camera,
    say: 'Hey everyone, welcome back to the channel.',
    lang: 'en-GB',
    gender: 'male',
    hook: ['One take.', 'Two countries.'],
    label: 'UK cut',
    title: 'Give that take another take',
    who: 'YouTube creators',
    body: 'Re-recording a line for a different audience eats an afternoon. Dub the take you already have, check it against the original, and drop the new track into your edit.',
  },
  {
    photo: PHOTOS.editor,
    say: 'Three things nobody tells you about saving money.',
    lang: 'en-US',
    gender: 'male',
    hook: ['No face.', 'One voice.'],
    label: 'Every upload',
    title: 'One voice. No camera. Every upload.',
    who: 'faceless channels',
    body: 'Settle on one narrator voice for the channel and run every script through it, so episodes recorded months apart still sound like the same show.',
    caveat: 'Pinned: the dub is re-spoken by an open-source voice, but what you say and how you phrase it can still identify you.',
  },
  {
    photo: PHOTOS.excited,
    say: 'Okay, wait for it… that was way too much fun.',
    lang: 'en-US',
    gender: 'female',
    hook: ['Wait for', 'the accent…'],
    label: 'Short',
    title: 'Recurring characters, no method acting',
    who: 'Shorts, Reels and TikTok',
    body: 'Try the bit in three accents before you commit to one. Keep the timing of the joke you actually performed.',
  },
  {
    photo: PHOTOS.podcaster,
    say: 'Welcome to the show. I’m your host, and today we’re talking travel.',
    lang: 'en-US',
    gender: 'female',
    hook: ['Pod, but', 'make it British'],
    label: 'Podcast clip',
    title: 'Audition the accent before you book the booth',
    who: 'podcast clips and voiceover',
    body: 'Hear a read in another accent using a recording you’ve already got, then decide whether it’s worth a proper re-record.',
  },
  {
    photo: PHOTOS.presenter,
    say: 'In this lesson, we’ll set up your very first project.',
    lang: 'en-GB',
    gender: 'male',
    hook: ['Lesson 4,', 'now in British'],
    label: 'Course',
    title: 'Same lesson. New delivery.',
    who: 'courses and tutorials',
    body: 'Explore how a recorded tutorial lands in a different accent without rebuilding the course from scratch.',
  },
  {
    photo: PHOTOS.curly,
    say: 'Okay. Now say that again, but British.',
    lang: 'en-GB',
    gender: 'female',
    hook: ['Say it again,', 'but British'],
    label: 'Just for fun',
    title: 'Hear your line from somewhere else',
    who: 'anyone curious',
    body: 'No project required. Record a sentence, send it on tour, flip between A and B, and laugh at the bits that almost work.',
  },
];

function UseCases() {
  return (
    <section id="uses" className="sect uses" aria-labelledby="uses-h">
      <div className="wrap">
        <h2 id="uses-h" className="h2">
          Built for creators.
        </h2>
        <p className="lede uses__lede">Whatever you post, wherever it goes. Pick the one that sounds like you.</p>
        <div className="feed">
          {USES.map((u) => (
            <FeedCard key={u.title} item={u} />
          ))}
        </div>
      </div>
    </section>
  );
}

function StatSheet() {
  const rows: Array<[string, string, string]> = [
    ['Live', 'Record in the browser', 'Up to a minute from your mic, with a live level meter.'],
    ['Live', 'Upload a file', 'Any audio or video your browser can play: MP3, WAV, M4A, WebM, MP4, MOV and more.'],
    ['Live', 'British + American', 'Each phrase re-spoken by an open-source voice in that accent, placed where you said it.'],
    ['Live', 'Voice choice', 'Matched to your pitch automatically, or pick lower or higher.'],
    ['Live', 'A/B check', 'Flip between versions mid-sentence without losing your place.'],
    ['Live', 'Real progress', 'Model download in MB, then phrase by phrase. Cancel any time.'],
    ['Live', 'WAV download', 'Level-matched to your original.'],
    ['Live', 'Private by design', 'Runs on your device. Your recording is never uploaded.'],
    ['Not yet', 'Your own voice', 'The dub uses an open-source voice, not a clone of yours. Keeping your timbre is the next big step.'],
    ['Not yet', 'More accents', 'Australian, Irish, Scottish and more need open models that don’t exist yet at this quality.'],
    ['Not yet', 'Video export', 'Download the audio and drop it into your editor for now.'],
  ];
  return (
    <section id="stats" className="sect sect--court stats" aria-labelledby="stats-h">
      <div className="wrap wrap--split">
        <div>
          <h2 id="stats-h" className="h2">
            What’s in the studio.
          </h2>
          <p className="lede">Everything marked live works today, in your browser, for free. What isn’t ready yet says so.</p>
          <p className="engine-pill" data-kind="accent-conversion">
            Engine: <strong>Whisper + Kokoro, on your device</strong>
          </p>
        </div>
        <ul className="sheet">
          {rows.map(([state, name, note]) => (
            <li key={name} className="sheet__row" data-state={state === 'Live' ? 'on' : state === 'Not yet' ? 'off' : 'mid'}>
              <span className="sheet__state">{state}</span>
              <span className="sheet__name">{name}</span>
              <span className="sheet__note">{note}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function HouseRules() {
  const items: Array<[string, React.ReactNode]> = [
    ['Where is my recording processed?', <>In your browser, on your device. Dub Club has no server that receives your audio.</>],
    ['Is it sent to anyone?', <>No. The only thing downloaded is the open-source voice models, fetched once from Hugging Face and cached by your browser. Your audio never goes the other way.</>],
    ['How long is it kept?', <>Only while this tab is open. Close it, or record a new take, and it’s gone. Nothing is stored anywhere else.</>],
    ['Do you make transcripts?', <>Your browser writes one down so it knows what to re-speak, and shows it to you. It stays on your device and disappears with the tab.</>],
    ['Do you train on my voice?', <>No. We never receive it, so we couldn’t.</>],
    ['Is it my voice in the dub?', <>No. Your words and timing are re-spoken by an open-source voice in the accent you pick. We say that plainly on every result.</>],
    ['Does it make me anonymous?', <>Don’t rely on it. What you say and how you phrase it can still identify you.</>],
    ['What can I use?', <>Your own voice, or recordings you have permission to use. You confirm that before every dub. No impersonation.</>],
  ];
  return (
    <section id="privacy" className="sect sect--chalk rules" aria-labelledby="privacy-h">
      <div className="wrap">
        <h2 id="privacy-h" className="h2">
          Your voice. Your rules.
        </h2>
        <p className="lede">Your voice is personal, so it never leaves your device. Here’s exactly how that works.</p>
        <dl className="rules__list">
          {items.map(([q, a], i) => (
            <div key={q} className="rules__item">
              <dt>
                <span className="rules__n" aria-hidden="true">
                  {String(i + 1).padStart(2, '0')}
                </span>
                {q}
              </dt>
              <dd>{a}</dd>
            </div>
          ))}
        </dl>
        <p className="rules__small">
          Built on open-source models: Whisper (MIT) for listening and Kokoro (Apache-2.0) for speaking, run with Transformers.js and ONNX Runtime.
        </p>
      </div>
    </section>
  );
}

const FAQ: QA[] = [
  { q: 'What does Dub Club do?', a: 'You record a line, pick British or American, and it comes back re-spoken in that accent with the same words and timing. Compare the two, then download the one you want.' },
  { q: 'Will it sound like me?', a: 'Not yet. The new version is spoken by an open-source voice in that accent, matched to your pitch range. Your words and timing are kept; your voice isn’t. We’re working on keeping your timbre.' },
  { q: 'Will the words change?', a: 'They shouldn’t. Your browser writes down what you said and shows it to you, and the new voice says exactly that. Mumbled or noisy takes can be misheard, so check the “Heard” line.' },
  { q: 'Which accents are supported?', a: 'British and American English. We only list accents the engine does well.' },
  { q: 'Is it really free?', a: 'Yes. Everything runs on your own device with open-source models, so there’s no server bill to pass on.' },
  { q: 'Why does the first dub take longer?', a: 'Your browser downloads the voice models once (about 170 MB), then keeps them. After that, dubs start straight away, even with a slow connection.' },
  { q: 'How long does a dub take?', a: 'Usually somewhere between a few seconds and a minute, depending on your device and how long the take is. You’ll see the real stage and a phrase-by-phrase count.' },
  { q: 'What can I upload?', a: 'Any audio or video your browser can play — MP3, WAV, M4A, WebM, MP4, MOV and more — up to a minute long.' },
  { q: 'What do I get?', a: 'A WAV file of the dub, level-matched to your original, ready to drop into your editor.' },
  { q: 'Is my recording uploaded?', a: <>No. It never leaves your device. <a href="#privacy">Here’s exactly how.</a></> },
  { q: 'Can I use the output commercially?', a: 'Kokoro’s voices are released under Apache-2.0, which allows commercial use. Your words are yours. Only dub voices you have the right to use.' },
];

function FinalCta() {
  return (
    <section className="final" aria-labelledby="final-h">
      <div className="wrap final__inner">
        <Echo as="h2" id="final-h" className="final__h">
          Give that take another take.
        </Echo>
        <p className="final__sub">No re-records. No booth. Nothing uploaded.</p>
        <Link to={BRAND.studioPath} className="btn btn--ink btn--big">
          <span>Start dubbing</span>
        </Link>
      </div>
    </section>
  );
}

export function SiteFooter() {
  return (
    <footer className="foot">
      <div className="wrap foot__inner">
        <div>
          <Wordmark />
          <p className="foot__tag">{BRAND.tagline}</p>
          <p className="foot__promise">{BRAND.promise}</p>
        </div>
        <nav className="foot__links" aria-label="Footer">
          <Link to={BRAND.studioPath}>Studio</Link>
          <a href={href('/#how')}>How it works</a>
          <a href={href('/#privacy')}>Privacy</a>
          <a href={href('/#faq')}>FAQ</a>
        </nav>
        <p className="foot__credits">
          Photos from Unsplash by {Array.from(new Set(Object.values(PHOTOS).map((p) => p.by))).join(', ')}. People shown are
          illustrative and not Dub Club users.
        </p>
        <p className="foot__small">Early build. Terms of service haven’t been published yet. “{BRAND.name}” is a working name.</p>
      </div>
    </footer>
  );
}
