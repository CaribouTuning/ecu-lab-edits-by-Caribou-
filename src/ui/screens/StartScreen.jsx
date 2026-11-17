/** The first screen: what this is, and the three ways in. */

import React from 'react';
import { ChevronRight, GraduationCap, Store, Wrench } from 'lucide-react';

import { CARIBOU_FILL, CARIBOU_INK } from './caribouLogo.js';
import styles from './StartScreen.module.css';

/**
 * The three ways in, in the order a newcomer should meet them.
 *
 * CAREER is first and is the primary action, because a customer car with a fault in it
 * is the only one of the three that tells you what you are trying to achieve: it is a
 * tuning shop of your own, with its own save, apart from SANDBOX. A sandbox
 * with no objective is the right tool once you know what you are doing and a poor place
 * to start, and the tutorial is a detour a returning player does not want.
 */
const WAYS_IN = [
  { key: 'career', label: 'Career', Icon: Store, caption: 'Run a tuning shop: customers, real faults, your reputation.' },
  { key: 'sandbox', label: 'Sandbox', Icon: Wrench, caption: 'Build any engine and tune it. No objectives.' },
  { key: 'tutorial', label: 'Tutorial', Icon: GraduationCap, caption: 'Tuning and the game, in five minutes.' },
];

/** The Caribou Tuning badge, drawn from its traced paths so it is sharp at any size. */
function Badge() {
  return (
    <svg className={styles.badge} viewBox="0 0 984 1046" aria-hidden="true">
      <defs>
        <linearGradient id="start-chrome" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--chrome-hi)' }} />
          <stop offset="0.45" style={{ stopColor: 'var(--chrome-mid)' }} />
          <stop offset="0.5" style={{ stopColor: 'var(--chrome-lo)' }} />
          <stop offset="0.7" style={{ stopColor: 'var(--chrome-mid)' }} />
          <stop offset="1" style={{ stopColor: 'var(--chrome-hi)' }} />
        </linearGradient>
      </defs>
      <path d={CARIBOU_FILL} fill="url(#start-chrome)" fillRule="evenodd" stroke="var(--badge-ink)" strokeWidth="10" />
      <path d={CARIBOU_INK} fill="var(--badge-ink)" fillRule="evenodd" />
    </svg>
  );
}

/**
 * @param {object} props
 * @param {() => void} props.onCareer open the shop
 * @param {() => void} props.onStart open the sandbox
 * @param {() => void} props.onTutorial
 * @param {string} props.version
 * @param {boolean} [props.enter] rise into view (false: it replaces one already showing)
 * @returns {React.ReactElement}
 */
export function StartScreen({ onCareer, onStart, onTutorial, version, enter = true }) {
  const handlers = { career: onCareer, sandbox: onStart, tutorial: onTutorial };
  return (
    <div className={styles.screen} data-plain>
      <main className={styles.window} data-enter={enter ? 'true' : undefined} aria-labelledby="start-title">
        <section className={styles.identity}>
          <Badge />
          <h1 id="start-title" className={styles.title}>ECU Lab</h1>
          <p className={styles.subtitle}>Engine simulation and tuning</p>
          <p className={styles.blurb}>
            Build an engine from real parts, run it on a dyno that solves the gas exchange
            and the burn, and tune its ECU the way a shop does: from the log.
          </p>
          <span className={styles.version}>Caribou Tuning · Version {String(version).replace(/^v/, '')}</span>
        </section>
        <nav className={styles.ways} aria-label="Start">
          <h2 className={styles.waysTitle}>Start</h2>
          <ul className={styles.list}>
            {WAYS_IN.map(({ key, label, Icon, caption }, i) => (
              <li key={key}>
                <button type="button" className={styles.way} data-primary={i === 0 ? 'true' : undefined} onClick={handlers[key]}>
                  <span className={styles.wayIcon} aria-hidden="true"><Icon size={18} strokeWidth={1.75} /></span>
                  <span className={styles.wayBody}>
                    <span className={styles.wayName}>{label}</span>
                    <span className={styles.wayCaption}>{caption}</span>
                  </span>
                  <ChevronRight size={16} aria-hidden="true" className={styles.wayChev} />
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </main>
    </div>
  );
}
