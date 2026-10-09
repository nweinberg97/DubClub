import { useEffect, useState } from 'react';
import type { Capabilities } from '../../shared/types.ts';
import { BRAND } from '../brand/config.ts';
import { Echo, Ticker, Wordmark } from '../brand/Echo.tsx';
import { DubDesk } from '../components/DubDesk.tsx';
import { Faq, type QA } from '../components/Faq.tsx';
import { StampPicker } from '../components/Stamps.tsx';
import { FeedCard, HeroThumb, ShortCard, type FeedItem } from '../components/Thumbs.tsx';
import { PHOTOS } from '../lib/photos.ts';
import { useCapabilities, useDub } from '../lib/hooks.ts';
import { Link, href } from '../router.tsx';

export function Landing() {
  const { caps, error } = useCapabilities();
  const dub = useDub();
  const [picked, setPicked] = useState<string | null>(null);

  useEffect(() => {
    document.title = `${BRAND.name} — ${BRAND.tagline}`;
  }, []);

  const pickFromHero = (id: string) => {
    setPicked(id);
    document.getElementById('try')?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  };

  const dev = caps?.engine.kind === 'dev-passthrough';
  const places = caps?.accents.map((a) => a.place.split(',')[0]) ?? [];

  return (
    <>
      <SiteNav />
      <main id="main">
        <Hero caps={caps} onPick={pickFromHero} />
        <Ticker
          items={
            dev
              ? ['Test mode', 'Accent engine not connected yet', 'Everything else is live', 'Test mode', 'Accent engine not connected yet', 'Everything else is live']
              : places.length
                ? [...places.map((p) => `${p} cut`), 'No re-records', 'No voice actors', ...places.map((p) => `${p} cut`), 'No booth']
                : ['No re-records', 'No voice actors', 'No booth', 'No re-records', 'No voice actors', 'No booth']
          }
          tone={dev ? 'pop' : 'accent'}
        />
        <section id="try" className="sect sect--court try" aria-labelledby="try-h">
          <div className="wrap">
            <div className="sect__head">
              <h2 id="try-h" className="h2">
                Try it on your voice.
              </h2>
              <p className="lede">
                Record ten seconds or drop in a clip. It runs through the real studio, then you flip between the original and
                the new cut at the same moment.
              </p>
            </div>
            <DubDesk caps={caps} capsError={error} dub={dub} initialAccent={picked} compact />
            <p className="try__more">
              Longer videos or every export option? <Link to={BRAND.studioPath}>Open the full studio</Link>.
            </p>
          </div>
        </section>
        <HowItWorks />
        <UseCases />
        <StatSheet caps={caps} />
        <HouseRules caps={caps} />
        <section id="faq" className="sect sect--chalk" aria-labelledby="faq-h">
          <div className="wrap wrap--split">
            <h2 id="faq-h" className="h2">
              Questions, answered.
            </h2>
            <Faq items={faqItems(caps)} />
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

function Hero({ caps, onPick }: { caps: Capabilities | null; onPick: (id: string) => void }) {
  const dev = caps?.engine.kind === 'dev-passthrough';
  return (
    <section className="hero" aria-labelledby="hero-h">
      <div className="hero__court" aria-hidden="true">
        <span className="hero__circle" />
      </div>
      <div className="wrap hero__inner">
        <div className="hero__grid">
          <div className="hero__copy">
            <span className="chip chip--accent hero__live">
              <span className="chip__dot" /> New: dub the take you already posted
            </span>
            <h1 id="hero-h" className="hero__h">
              <span className="hero__l1 tt">Same voice.</span>
              <span className="hero__l2 tt tt--accent">New accent.</span>
            </h1>
            <p className="hero__lede">
              Your video’s done and your voice is on it. Drop it in, pick an accent, and get a new cut that aims to still
              sound like you — same words, same timing. No re-records, no voice actor.
            </p>
            <div className="hero__ctas">
              <Link to={BRAND.studioPath} className="btn btn--accent btn--big">
                <span>Start dubbing</span>
              </Link>
              <a href="#try" className="btn btn--line btn--big">
                <span>Try it here</span>
              </a>
            </div>
          </div>
          <div className="hero__media">
            <HeroThumb />
            <ShortCard />
          </div>
        </div>
        <div className="hero__pick">
          <h2 className="hero__pickh">One take. Every version.</h2>
          {!caps && <p className="hero__note">Checking which accents are available…</p>}
          {caps && caps.accents.length > 0 && (
            <div className="versions">
              <div className="versions__orig" aria-hidden="true">
                <span className="cut__thumb cut__thumb--orig">
                  <span className="cut__code">You</span>
                  <span className="cut__tag">Original</span>
                </span>
                <span className="cut__label">Your take</span>
                <span className="cut__place">As recorded</span>
              </div>
              <span className="versions__arrow" aria-hidden="true" />
              <StampPicker accents={caps.accents} value={null} onChange={onPick} label="Pick an accent to try" />
            </div>
          )}
          {dev && (
            <p className="hero__note hero__note--pop">
              Test mode: the accent engine isn’t connected yet, so accents aren’t changed. <a href="#stats">Here’s why.</a>
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

const STEPS = [
  { t: 'Drop your take', d: 'Upload the video or audio you already made, or record straight from your mic.', v: 'drop' },
  { t: 'Pick your cut', d: 'Choose an accent. You only see accents the engine can genuinely do.', v: 'jersey' },
  { t: 'Dub it', d: 'We split your take at the pauses, convert each part and stitch it back in time.', v: 'run' },
  { t: 'Check it', d: 'Flip between the original and the new cut at the exact same moment.', v: 'ab' },
  { t: 'Post it', d: 'Download the video with the new audio dropped in, or WAV / MP3 / M4A for your editor.', v: 'out' },
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
          <span className="pv-jersey">AU</span>
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
      return <span className="pv-chip">TAKE_03 (en-GB).MP4</span>;
  }
}

const USES: FeedItem[] = [
  {
    photo: PHOTOS.vlogger,
    hook: ['No re-record.', 'New audience.'],
    label: 'British cut',
    title: 'Give that take another take',
    who: 'YouTube creators',
    body: 'Re-recording a twelve-minute video for a different audience eats a weekend. Dub the take you already have, check it against the original, and export the video with the new track in place.',
  },
  {
    photo: PHOTOS.editor,
    hook: ['No face.', 'Same voice.'],
    label: 'Every upload',
    title: 'One voice. No camera. Every upload.',
    who: 'faceless channels',
    body: 'Settle on one delivery for the channel and apply it to every upload, so episodes recorded months apart still sound like the same show.',
    caveat: 'Pinned: an accent change is not anonymity. Your vocal character, phrasing and what you say can still identify you.',
  },
  {
    photo: PHOTOS.hoodie,
    hook: ['1 take.', '3 accents.'],
    label: 'Shorts',
    title: 'Recurring characters, no method acting',
    who: 'Shorts, Reels and TikTok',
    body: 'Try the bit in three accents before you commit to one. Keep the timing of the joke you actually performed.',
  },
  {
    photo: PHOTOS.voiceover,
    hook: ['Hear it', 'before the booth.'],
    label: 'Voiceover',
    title: 'Audition the accent before you book the booth',
    who: 'podcast clips and voiceover',
    body: 'Hear a read in another accent using a recording you’ve already got, then decide whether it’s worth a proper re-record.',
  },
  {
    photo: PHOTOS.teacher,
    hook: ['Same lesson.', 'New delivery.'],
    label: 'Course',
    title: 'Same lesson. New delivery.',
    who: 'courses and tutorials',
    body: 'Explore how a recorded tutorial lands in a different accent without rebuilding the course from scratch.',
  },
  {
    photo: PHOTOS.glasses,
    hook: ['Wait…', 'is that me?'],
    label: 'Just for fun',
    title: 'Hear yourself from somewhere else',
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

function StatSheet({ caps }: { caps: Capabilities | null }) {
  const e = caps?.engine;
  const accentState: [string, string] = !e
    ? ['Checking', 'Asking the studio which engine it’s running…']
    : e.kind === 'accent-conversion'
      ? [e.ready ? 'Live' : 'Offline', `${e.name}: converts accent and aims to keep the speaker. ${caps!.accents.length} accent${caps!.accents.length === 1 ? '' : 's'} available.`]
      : e.kind === 'voice-swap'
        ? ['Voice swap', 'Accent comes from a different target voice, so you won’t sound like you.']
        : ['Not yet', 'This build runs the development engine. Every step is real except the accent change itself.'];
  const rows: Array<[string, string, string]> = [
    ['Live', 'Audio upload', 'MP3, WAV, M4A, AAC, OGG, Opus, FLAC and WebM.'],
    ['Live', 'Video upload', 'MP4, MOV, M4V and WebM. We pull the audio out and leave the picture alone.'],
    ['Live', 'Record in the browser', 'Up to a minute from your mic, with a live level meter.'],
    ['Live', 'A/B check', 'Flip between versions mid-sentence without losing your place.'],
    ['Live', 'Real progress', 'Real stages and a part-by-part count. Cancel or retry any time.'],
    ['Live', 'Audio export', 'WAV, MP3 or M4A, level-matched to your original.'],
    ['Live', 'Video export', 'Your original picture with the dubbed audio swapped in.'],
    ['Live', 'Delete for real', 'Removes the files from the server, not just from the screen.'],
    [accentState[0], 'Accent change', accentState[1]],
    [e?.supportsStrength ? 'Live' : 'Depends', 'Accent strength', e?.supportsStrength ? 'Dial how far the accent travels.' : 'Shown only when the engine supports it.'],
    ['Not yet', 'Accounts + saved projects', 'Sessions are anonymous and short-lived for now.'],
    ['Not yet', 'Live calls', 'Dub Club works on recordings, not live audio.'],
  ];
  return (
    <section id="stats" className="sect sect--court stats" aria-labelledby="stats-h">
      <div className="wrap wrap--split">
        <div>
          <h2 id="stats-h" className="h2">
            What’s in the studio.
          </h2>
          <p className="lede">
            Everything marked live is built and tested end to end. The accent itself comes from whichever engine the studio is
            plugged into — and we always tell you which one.
          </p>
          {e && (
            <p className="engine-pill" data-kind={e.kind}>
              Engine: <strong>{e.name}</strong>
            </p>
          )}
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

function HouseRules({ caps }: { caps: Capabilities | null }) {
  const e = caps?.engine;
  const mins = caps?.limits.retentionMinutes ?? 60;
  const items: Array<[string, React.ReactNode]> = [
    ['Where is my recording processed?', <>On the server running this studio. {e ? e.providerNote : ''}</>],
    [
      'Is it sent to anyone else?',
      e?.external ? (
        <>Yes. The current engine uses an outside provider, which handles your audio under its own terms and retention policy.</>
      ) : (
        <>Not with the engine this studio is running now. If that changes, this answer changes with it.</>
      ),
    ],
    [
      'How long is it kept?',
      <>
        Your original and your dubs sit in private storage tied to this browser tab. They’re deleted automatically after {mins}{' '}
        minutes without activity, or straight away when you delete them.
      </>,
    ],
    ['Can I delete it?', <>Yes. “Delete this take” removes the original and every dub immediately. The studio also has “Delete everything”.</>],
    ['Do you make transcripts?', <>No. Dub Club doesn’t create or store transcripts.</>],
    ['Do you train on my voice?', <>No. Your recordings aren’t used to train anything.</>],
    ['Does a new accent make me anonymous?', <>No. It changes how you pronounce things, not who you are. People who know your voice may still recognise it.</>],
    ['What can I upload?', <>Your own voice, or recordings you have permission to transform. You confirm that before every dub. No impersonation.</>],
  ];
  return (
    <section id="privacy" className="sect sect--chalk rules" aria-labelledby="privacy-h">
      <div className="wrap">
        <h2 id="privacy-h" className="h2">
          Your voice. Your rules.
        </h2>
        <p className="lede">Your voice is personal. Here’s exactly how this studio handles it. No fine print anywhere else.</p>
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
        <p className="rules__small">Server logs record ids, timings and error codes. Never file names, audio or what you said.</p>
      </div>
    </section>
  );
}

function faqItems(caps: Capabilities | null): QA[] {
  const e = caps?.engine;
  const accentList = caps?.accents.map((a) => a.label).join(', ');
  const dev = e?.kind === 'dev-passthrough';
  return [
    { q: 'What does Dub Club do?', a: 'It takes a recording of someone speaking and re-speaks it in a different accent, aiming to keep the same voice, words and timing. Then you compare the two and export the one you want.' },
    { q: 'How is that different from a voice changer?', a: 'A voice changer swaps who you sound like — robot, monster, someone else. Accent conversion tries to keep who you are and change where you sound from.' },
    {
      q: 'Will I still sound like myself?',
      a: e?.kind === 'voice-swap' ? 'Not with the engine running now. It’s a voice swap: your delivery is kept, but the voice belongs to someone else.' : 'That’s the aim, and how close it gets depends on the accent engine. Use the A/B check to judge for yourself before you publish anything.',
    },
    { q: 'Will the words I say change?', a: 'No. Dub Club converts your speech directly. It doesn’t transcribe and rewrite it, so the words should stay yours.' },
    {
      q: 'Which accents are supported?',
      a: dev
        ? `This build runs in test mode, so none are actually converted yet. The studio shows ${accentList} so you can try the full flow.`
        : accentList
          ? `Right now: ${accentList}. We only list accents the engine can actually produce.`
          : 'It depends on the engine connected to the studio. The studio only lists what that engine can do.',
    },
    { q: 'Can I upload video?', a: 'Yes — MP4, MOV, M4V and WebM. We take the audio out to dub it and keep your picture untouched.' },
    { q: 'Can I export the transformed video?', a: 'Yes. You get your original video with the dubbed audio in place. If the picture can’t be rebuilt, the dubbed audio is still there to download.' },
    { q: 'What file formats work?', a: `Audio: MP3, WAV, M4A, AAC, OGG, Opus, FLAC, WebM. Video: MP4, MOV, M4V, WebM. Up to ${caps ? Math.round(caps.limits.maxDurationSec / 60) : 10} minutes and ${caps?.limits.maxUploadMb ?? 200} MB.` },
    { q: 'How long does processing take?', a: 'It depends on the length of your take and the engine. You’ll see which stage it’s at and how many parts are done — no made-up countdowns.' },
    { q: 'What if it sounds off?', a: 'Pick another accent, adjust the strength if the engine offers it, or run it again. Clear, close-mic recordings with one speaker give the best results.' },
    { q: 'How are recordings handled?', a: <>Privately, briefly and deletably. <a href="#privacy">Here’s exactly how.</a></> },
    { q: 'Does changing my accent make me anonymous?', a: 'No. Your vocal character and what you say can still identify you. Don’t rely on Dub Club for anonymity.' },
    { q: 'Can I use the output commercially?', a: 'Your recording is yours. Whether a dub can be used commercially depends on the licence of the accent engine running the studio, so check that before you publish.' },
    { q: 'Is there a free option?', a: 'There’s no pricing yet. Dub Club is in early testing.' },
  ];
}

function FinalCta() {
  return (
    <section className="final" aria-labelledby="final-h">
      <div className="wrap final__inner">
        <Echo as="h2" id="final-h" className="final__h">
          Give that take another take.
        </Echo>
        <p className="final__sub">No re-records. No voice actors. Just another version of you.</p>
        <Link to={BRAND.studioPath} className="btn btn--black btn--big">
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
