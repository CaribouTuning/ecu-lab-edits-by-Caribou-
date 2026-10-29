/**
 * The first screen: what ECU Lab is, and the three ways in.
 *
 * Built from the same parts as the rest of the app, so it reads as the program's own front
 * page rather than a landing page: the stations' page bar along the top, and the ways in
 * as one list, the way the engine bench offers its two starts. CAREER carries the app's key
 * (the white button the next step uses everywhere else), because a customer's car with a
 * fault in it is the only one of the three that tells a newcomer what to aim for.
 */

import { ChevronRight } from 'lucide-react';
import React, { useId } from 'react';

import { CARIBOU_FILL, CARIBOU_INK, CARIBOU_VIEWBOX } from './caribouLogo.js';
import styles from './StartScreen.module.css';

/**
 * The three ways in. `does` says what the player will actually do there, in one sentence;
 * `note` is the one fact that tells them apart at a glance.
 */
const WAYS_IN = [
  {
    key: 'career', label: 'Career', note: 'Start here', go: 'Open the shop',
    does: 'Run a tuning shop. Customers bring cars with real faults: find them on the dyno, fix the calibration, hand the car back and get paid.',
  },
  {
    key: 'sandbox', label: 'Sandbox', note: 'Free play',
    does: 'Your own shop with every tool and no customers. Build any engine, tune it and measure it.',
  },
  {
    key: 'tutorial', label: 'Tutorial', note: '5 minutes',
    does: 'The game and the basics of tuning: the three tables, a dyno pull, and reading its log.',
  },
];

/**
 * The Caribou Tuning badge: an uploaded image when one is passed, the traced badge otherwise.
 * @param {{src?: string|null}} props
 */
function LogoMark({ src }) {
  if (src) return <img className={styles.logo} src={src} alt="Caribou Tuning" />;
  return (
    <svg className={styles.logo} viewBox={CARIBOU_VIEWBOX} role="img" aria-label="Caribou Tuning">
      <path d={CARIBOU_FILL} fill="var(--panel3)" fillRule="evenodd" />
      <path d={CARIBOU_INK} fill="var(--ink)" fillRule="evenodd" />
    </svg>
  );
}

/**
 * One way in: a row of the list. Its accessible name is the label alone; what it does is
 * its description.
 * @param {{way: typeof WAYS_IN[number], onOpen: () => void}} props
 */
function WayIn({ way, onOpen }) {
  const id = useId();
  return (
    <li>
      <button
        type="button" className={styles.way} data-way={way.key} onClick={onOpen}
        aria-labelledby={`${id}-name`} aria-describedby={`${id}-does`}
      >
        <span className={styles.wayHead}>
          <span id={`${id}-name`} className={styles.wayName}>{way.label}</span>
          <span className={styles.wayNote}>{way.note}</span>
        </span>
        <span id={`${id}-does`} className={styles.wayDoes}>{way.does}</span>
        {way.go
          ? <span className={styles.key} aria-hidden="true">{way.go}<ChevronRight size={14} /></span>
          : <ChevronRight className={styles.chevron} size={18} aria-hidden="true" />}
      </button>
    </li>
  );
}

/**
 * @param {object} props
 * @param {() => void} props.onCareer open the career's shop
 * @param {() => void} props.onStart open the sandbox
 * @param {() => void} props.onTutorial
 * @param {string} props.version
 * @param {string|null} [props.logo] the logo image, when there is one
 * @param {React.ReactNode} [props.dial] unused; kept so older call sites still render
 * @returns {React.ReactElement}
 */
export function StartScreen({ onCareer, onStart, onTutorial, version, logo = null }) {
  const handlers = { career: onCareer, sandbox: onStart, tutorial: onTutorial };
  return (
    <div className={styles.screen} data-plain>
      <header className={styles.bar}>
        <span className={styles.mark}><small>Caribou Tuning</small>ECU Lab</span>
        <span className={styles.version}>{version}</span>
      </header>
      <main className={styles.body}>
        <section className={styles.about}>
          <LogoMark src={logo} />
          <div>
            <h1 className={styles.title}>ECU Lab</h1>
            <p className={styles.subtitle}>Engine and ECU simulator</p>
          </div>
          <p className={styles.blurb}>
            Build an engine, edit the calibration tables a real tuner edits, and measure the
            result on the dyno. Every figure comes from the engine model, and the pull log
            says why it went the way it did.
          </p>
        </section>
        <nav className={styles.start} aria-label="Ways in">
          <h2 className={styles.startHead}>Start</h2>
          <ul className={styles.list}>
            {WAYS_IN.map((way) => <WayIn key={way.key} way={way} onOpen={handlers[way.key]} />)}
          </ul>
        </nav>
      </main>
    </div>
  );
}
