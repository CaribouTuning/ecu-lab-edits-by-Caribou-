/** The first screen: the Caribou logo, what this is, and the three ways in. */

import React from 'react';

import { CARIBOU_FILL, CARIBOU_INK, CARIBOU_VIEWBOX } from './caribouLogo.js';
import styles from './StartScreen.module.css';

/**
 * The three ways in, each under a picture of what it is.
 *
 * CAREER is the primary action, because a customer car with a fault in it is the only one
 * of the three that tells you what you are trying to achieve. SANDBOX opens the laptop in
 * your own shop, every tool and no objective. The tutorial is the standard walk through.
 */
const WAYS_IN = [
  { key: 'career', label: 'CAREER', variant: 'primary', caption: 'The 3D career: run a tuning shop in town' },
  { key: 'sandbox', label: 'SANDBOX', variant: 'ghost', caption: 'Your laptop and your shop: build and tune anything' },
  { key: 'tutorial', label: 'TUTORIAL', variant: 'quiet', caption: 'Tuning and the game, in five minutes' },
];

/** The three ways in, as clean line drawings over a flat wash (48-unit square). */
const ICONS = {
  // A car side-on, as drawn on the pad.
  career: (
    <>
      <path className="wash" d="M6 30c2-6 8-8 14-8l6-8h12l5 9c3 1 4 4 4 7z" />
      <path d="M3 33c0-4 1-8 5-9 4-1 9-1 12-2 2-3 4-7 7-8h11c2 3 4 6 5 9 3 1 4 5 4 9-2 .5-4 .3-6 .4M18 33.4h12" />
      <path d="M27 15l-2 7h16" />
      <circle cx="12" cy="34" r="5" /><circle cx="36" cy="34" r="5" />
    </>
  ),
  // The laptop, open, with a spanner across it.
  sandbox: (
    <>
      <path className="wash" d="M10 10h28v20H10z" />
      <path d="M9 9.5c9-.3 21 .3 30 0 .3 7-.2 14 .2 21-10 .3-20-.3-30 0-.2-7 .3-14-.2-21z" />
      <path d="M4 35c13-.6 27 .4 40-.2l-3 4c-11 .3-23-.2-34 .2z" />
      <path d="M16 26l12-12m-2-2c2-2 6-1 6 2l-3 1 1 2 3-1c1 3-3 5-5 3" />
    </>
  ),
  // A sheet of notes.
  tutorial: (
    <>
      <path className="wash" d="M12 9h22l3 31H14z" />
      <path d="M11 6c7 .4 17-.3 26 .3.4 10-.3 24 .5 34-4-3-7 1-10-1s-6 2-9 0-5 1-7-.4C11 28 11.5 16 11 6z" />
      <path d="M15 14c3-2 5 2 8 0s5 2 8 0M15 21c3-2 5 2 8 0s5 2 8 0M15 28c3-2 5 2 8 0" />
    </>
  ),
};

/**
 * The Caribou Tuning badge: an uploaded image when one is passed, the traced badge otherwise.
 * @param {{src?: string|null}} props
 */
function LogoMark({ src }) {
  if (src) return <img className={styles.logo} src={src} alt="Caribou Tuning" />;
  return (
    <svg className={styles.logo} viewBox={CARIBOU_VIEWBOX} role="img" aria-label="Caribou Tuning">
      <path d={CARIBOU_FILL} fill="var(--acc-bg)" fillRule="evenodd" />
      <path d={CARIBOU_INK} fill="var(--ink)" fillRule="evenodd" />
    </svg>
  );
}

/**
 * @param {object} props
 * @param {() => void} props.onCareer open the 3D career
 * @param {() => void} props.onStart open the sandbox laptop
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
      <div className={styles.glow} aria-hidden="true" />
      <div className={styles.inner}>
        <LogoMark src={logo} />
        <div className={styles.eyebrow} data-keep-tracking>CARIBOU TUNING</div>
        <h1 className={styles.title} data-keep-tracking>ECU Lab</h1>
        <p className={styles.subtitle} data-keep-tracking>Engine + ECU Simulator</p>
        <div className={styles.actions}>
          {WAYS_IN.map((way) => (
            <div key={way.key} className={styles.way}>
              <svg className={styles.icon} viewBox="0 0 48 48" aria-hidden="true">
                {ICONS[/** @type {keyof typeof ICONS} */ (way.key)]}
              </svg>
              <button type="button" className={`${styles.btn} ${styles[way.variant]}`} onClick={handlers[way.key]} data-keep-tracking>
                {way.label}
              </button>
              <div className={styles.caption}>{way.caption}</div>
            </div>
          ))}
        </div>
        <div className={styles.version}>{version}</div>
      </div>
    </div>
  );
}
