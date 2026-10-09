import { useEffect, useState } from 'react';
import type { Capabilities } from '../../shared/types.ts';
import { BRAND } from '../brand/config.ts';
import { Echo, Wordmark } from '../brand/Echo.tsx';
import { DubDesk } from '../components/DubDesk.tsx';
import { Faq, type QA } from '../components/Faq.tsx';
import { StampPicker } from '../components/Stamps.tsx';
import { useCapabilities, useDub } from '../lib/hooks.ts';
import { Link } from '../router.tsx';

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

  return (
    <>
      <SiteNav />
      <main id="main">
        <Hero caps={caps} onPick={pickFromHero} />
        <section id="try" className="sect sect--sleeve try" aria-labelledby="try-h">
          <div className="wrap">
            <div className="try__intro">
              <h2 id="try-h" className="h2">Try a take.</h2>
              <p className="lede">
                Record ten seconds or drop in a clip. It runs through the real studio pipeline, then you can flip between the
                two takes at the same moment.
              </p>
            </div>
            <DubDesk caps={caps} capsError={error} dub={dub} initialAccent={picked} compact />
            <p className="try__more">
              Working with longer videos or want every export option? <Link to={BRAND.studioPath}>Open the full studio</Link>.
            </p>
          </div>
        </section>
        <HowItWorks />
        <UseCases />
        <Capabilities caps={caps} />
        <Privacy caps={caps} />
        <section id="faq" className="sect sect--sleeve" aria-labelledby="faq-h">
          <div className="wrap wrap--split">
            <h2 id="faq-h" className="h2">Questions, answered straight.</h2>
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
          <a href="/#try" onClick={close}>
            Product
          </a>
          <a href="/#how" onClick={close}>
            How it works
          </a>
          <a href="/#uses" onClick={close}>
            Use cases
          </a>
          <a href="/#privacy" onClick={close}>
            Privacy
          </a>
          <Link to={BRAND.studioPath} className="btn btn--dub nav__cta" onClick={close}>
            Get dubbing
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
      <div className="wrap hero__inner">
        <Echo id="hero-h" className="hero__h">
          <span className="hero__l1">Same voice.</span> <span className="hero__l2">New postcode.</span>
        </Echo>
        <div className="hero__under">
          <p className="hero__lede">
            Drop in a recording you’ve already made and pick where it should sound from. Dub Club re-speaks it in that accent,
            aiming to keep your voice, your words and your timing.
          </p>
          <div className="hero__ctas">
            <Link to={BRAND.studioPath} className="btn btn--dub btn--big">
              Get dubbing
            </Link>
            <a href="#try" className="btn btn--line btn--big">
              Try it on this page
            </a>
          </div>
        </div>
        <div className="hero__stamps">
          <p className="hero__where">
            {!caps
              ? 'Checking which accents are available…'
              : dev
                ? 'Where to? Pick a stamp to try the flow.'
                : 'Where to? These are the accents this studio can do right now.'}
          </p>
          {caps && caps.accents.length > 0 && (
            <StampPicker accents={caps.accents} value={null} onChange={onPick} label="Pick an accent to try" />
          )}
          {dev && (
            <p className="hero__honest">
              Heads up: this build is in test mode, so accents aren’t changed yet. <a href="#desk">Here’s why.</a>
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

const STEPS = [
  { t: 'Drop it in', d: 'Upload audio or video, or record straight from your mic. We check there’s actually someone talking.', v: 'drop' },
  { t: 'Pick your postcode', d: 'Choose a destination accent. You only see accents the engine can genuinely do.', v: 'stamp' },
  { t: 'Let it dub', d: 'We split your take at the pauses, convert each part, and stitch it back in time.', v: 'reels' },
  { t: 'Hear the difference', d: 'Flip between the original and the dub at the exact same moment.', v: 'ab' },
  { t: 'Take it away', d: 'Download WAV, MP3 or M4A — or your video with the new audio dropped in.', v: 'out' },
] as const;

function HowItWorks() {
  return (
    <section id="how" className="sect how" aria-labelledby="how-h">
      <div className="wrap">
        <h2 id="how-h" className="h2">
          Five steps. Two takes.
        </h2>
        <ol className="tape">
          {STEPS.map((s, i) => (
            <li key={s.t} className="tape__step">
              <div className={`mini mini--${s.v}`} aria-hidden="true">
                <MiniVisual kind={s.v} />
              </div>
              <span className="tape__n">{i + 1}</span>
              <h3 className="tape__t">{s.t}</h3>
              <p className="tape__d">{s.d}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function MiniVisual({ kind }: { kind: string }) {
  switch (kind) {
    case 'drop':
      return (
        <>
          <span className="mini__file">take_03.mp4</span>
        </>
      );
    case 'stamp':
      return (
        <>
          <span className="mini__stamp">AU</span>
          <span className="mini__stamp mini__stamp--on">GB</span>
        </>
      );
    case 'reels':
      return (
        <>
          <span className="mini__reel" />
          <span className="mini__reel" />
        </>
      );
    case 'ab':
      return (
        <>
          <span className="mini__bars mini__bars--a" />
          <span className="mini__bars mini__bars--b" />
        </>
      );
    default:
      return <span className="mini__chip">take_03 (en-GB).mp4</span>;
  }
}

const USES: Array<{ who: string; line: string; body: React.ReactNode; caveat?: string }> = [
  {
    who: 'YouTube creators',
    line: 'Give that take another take.',
    body: 'Re-recording a twelve-minute video for a different audience eats a weekend. Dub the take you already have, check it against the original, and export the video with the new track in place.',
  },
  {
    who: 'Faceless channels',
    line: 'A consistent voice that never needs a camera.',
    body: 'Settle on one delivery for the channel and apply it to every upload, so episodes recorded months apart still sound like the same show.',
    caveat:
      'An accent change is not anonymity. Your vocal character, phrasing and what you say can still identify you.',
  },
  {
    who: 'Short-form',
    line: 'Recurring characters, minus the method acting.',
    body: 'Try a bit in three accents before you commit to one. Keep the timing of the joke you actually performed.',
  },
  {
    who: 'Podcasters and voiceover',
    line: 'Audition an accent before you book the session.',
    body: 'Hear a read in another accent using a recording you’ve already got, then decide whether it’s worth a proper re-record.',
  },
  {
    who: 'Educators and course creators',
    line: 'Same lesson, another delivery.',
    body: 'Explore how a recorded tutorial lands in a different accent without rebuilding the course from scratch.',
  },
  {
    who: 'The curious',
    line: 'Hear yourself from somewhere else.',
    body: 'No project required. Record a sentence, send it on tour, flip between A and B, and laugh at the bits that almost work.',
  },
];

function UseCases() {
  return (
    <section id="uses" className="sect sect--ink uses" aria-labelledby="uses-h">
      <div className="wrap">
        <h2 id="uses-h" className="h2">
          Who it’s for.
        </h2>
        <div className="uses__list">
          {USES.map((u) => (
            <article key={u.who} className="use">
              <h3 className="use__who">{u.who}</h3>
              <div className="use__body">
                <p className="use__line">{u.line}</p>
                <p className="use__text">{u.body}</p>
                {u.caveat && <p className="use__caveat">{u.caveat}</p>}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function Capabilities({ caps }: { caps: Capabilities | null }) {
  const e = caps?.engine;
  const accentState: [string, string] = !e
    ? ['Checking', 'Asking the studio which engine it’s running…']
    : e.kind === 'accent-conversion'
      ? [e.ready ? 'Works now' : 'Offline', `${e.name}: converts accent and aims to keep the speaker. ${caps!.accents.length} accent${caps!.accents.length === 1 ? '' : 's'} available.`]
      : e.kind === 'voice-swap'
        ? ['Voice swap', 'Accent comes from a different target voice, so you won’t sound like you.']
        : ['Not yet', 'This build runs the development engine: every stage is real except the accent change itself.'];
  const rows: Array<[string, string, string]> = [
    ['Works now', 'Audio upload', 'MP3, WAV, M4A, AAC, OGG, Opus, FLAC and WebM.'],
    ['Works now', 'Video upload', 'MP4, MOV, M4V and WebM. We pull the audio out and leave the picture alone.'],
    ['Works now', 'Record in the browser', 'Up to a minute from your mic, with a live level meter.'],
    ['Works now', 'A/B at the same moment', 'Flip takes mid-sentence without losing your place.'],
    ['Works now', 'Honest progress', 'Real pipeline stages and a part-by-part count. Cancel or retry any time.'],
    ['Works now', 'Audio export', 'WAV, MP3 or M4A, level-matched to your original.'],
    ['Works now', 'Video export', 'Your original picture with the dubbed audio swapped in.'],
    ['Works now', 'Delete for real', 'Removes the files from disk, not just from the screen.'],
    [accentState[0], 'Accent change', accentState[1]],
    [e?.supportsStrength ? 'Works now' : 'Depends on engine', 'Accent strength', e?.supportsStrength ? 'Dial how far the accent travels.' : 'Shown only when the engine supports it.'],
    ['Not yet', 'Accounts and saved projects', 'Sessions are anonymous and short-lived for now.'],
    ['Not yet', 'Real-time / live calls', 'Dub Club works on recordings, not live audio.'],
  ];
  return (
    <section id="desk" className="sect desk-sect" aria-labelledby="desk-h">
      <div className="wrap wrap--split">
        <div>
          <h2 id="desk-h" className="h2">
            What’s on the desk.
          </h2>
          <p className="lede">
            Everything listed as working has been built and tested end to end. The accent itself comes from whichever engine
            this studio is plugged into, and we say which one, everywhere.
          </p>
          {e && (
            <p className="engine-pill" data-kind={e.kind}>
              Running: <strong>{e.name}</strong>
            </p>
          )}
        </div>
        <ul className="caps">
          {rows.map(([state, name, note]) => (
            <li key={name} className="caps__row" data-state={state === 'Works now' ? 'on' : state === 'Not yet' ? 'off' : 'mid'}>
              <span className="caps__state">{state}</span>
              <span className="caps__name">{name}</span>
              <span className="caps__note">{note}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Privacy({ caps }: { caps: Capabilities | null }) {
  const e = caps?.engine;
  const mins = caps?.limits.retentionMinutes ?? 60;
  const items: Array<[string, React.ReactNode]> = [
    [
      'Where is my recording processed?',
      <>
        On the server running this studio. {e ? e.providerNote : ''}
      </>,
    ],
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
    [
      'Can I delete it?',
      <>Yes. “Delete this take” removes the original and every dub from disk immediately. The studio also has “Delete everything”.</>,
    ],
    ['Do you make transcripts?', <>No. Dub Club doesn’t create or store transcripts.</>],
    ['Do you train on my voice?', <>No. Your recordings aren’t used to train anything.</>],
    [
      'Does a new accent make me anonymous?',
      <>No. Accent conversion changes how you pronounce things, not who you are. People who know your voice may still recognise it.</>,
    ],
    [
      'What am I allowed to upload?',
      <>Your own voice, or recordings you have permission to transform. You confirm that before every dub. Don’t use Dub Club to impersonate anyone.</>,
    ],
  ];
  return (
    <section id="privacy" className="sect sect--sleeve privacy" aria-labelledby="privacy-h">
      <div className="wrap">
        <h2 id="privacy-h" className="h2">
          What happens to your recording.
        </h2>
        <p className="lede">Your voice is personal. Here’s exactly how this studio handles it — no fine print elsewhere.</p>
        <dl className="privacy__list">
          {items.map(([q, a]) => (
            <div key={q} className="privacy__item">
              <dt>{q}</dt>
              <dd>{a}</dd>
            </div>
          ))}
        </dl>
        <p className="privacy__small">
          Server logs record ids, timings and error codes. They never contain file names, audio or what you said.
        </p>
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
      a: e?.kind === 'voice-swap' ? 'Not with the engine running now. It’s a voice swap: your delivery is kept, but the voice belongs to someone else.' : 'That’s the aim, and how close it gets depends on the accent engine. Use the A/B player to judge for yourself before you publish anything.',
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
    { q: 'What if it sounds unnatural?', a: 'Try another accent, adjust the strength if the engine offers it, or retry. Clear, close-mic recordings with one speaker give the best results.' },
    { q: 'How are recordings handled?', a: <>Privately, briefly and deletably. <a href="#privacy">Here are the details.</a></> },
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
        <Link to={BRAND.studioPath} className="btn btn--dub btn--big">
          Open the studio
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
          <a href="/#how">How it works</a>
          <a href="/#privacy">Privacy</a>
          <a href="/#faq">FAQ</a>
        </nav>
        <p className="foot__small">Early build. Terms of service haven’t been published yet. “{BRAND.name}” is a working name.</p>
      </div>
    </footer>
  );
}
