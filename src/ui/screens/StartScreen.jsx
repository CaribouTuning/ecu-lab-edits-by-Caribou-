/** The first screen: the Caribou logo, what this is, and the three ways in. */

import React from 'react';

import { Button } from '../primitives/Button.jsx';

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

/** Pixel pictures for the three ways in, drawn on a 16-unit grid in the text colour. */
const ICONS = {
  // A car side-on: roof, body, two wheels.
  career: (
    <>
      <path d="M4 6h6l2 3h2v4H2v-4h1z" />
      <rect x="5" y="7" width="2" height="2" fill="var(--bg)" />
      <rect x="8" y="7" width="2" height="2" fill="var(--bg)" />
      <rect x="3" y="12" width="3" height="3" />
      <rect x="10" y="12" width="3" height="3" />
    </>
  ),
  // A spanner across a piston: the parts of an engine.
  sandbox: (
    <>
      <rect x="6" y="2" width="6" height="7" />
      <rect x="6" y="3" width="6" height="1" fill="var(--bg)" />
      <rect x="8" y="9" width="2" height="5" />
      <path d="M2 13l6-6 1 1-6 6z" />
      <path d="M1 12h3v3H1z" />
    </>
  ),
  // An open book.
  tutorial: (
    <>
      <path d="M1 3h6l1 1 1-1h6v10H9l-1 1-1-1H1z" />
      <rect x="7.5" y="4" width="1" height="9" fill="var(--bg)" />
      <rect x="2.5" y="5" width="3.5" height="1" fill="var(--bg)" />
      <rect x="2.5" y="7" width="3.5" height="1" fill="var(--bg)" />
      <rect x="10" y="5" width="3.5" height="1" fill="var(--bg)" />
      <rect x="10" y="7" width="3.5" height="1" fill="var(--bg)" />
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
      <path d={CARIBOU_INK} fill="var(--acc)" fillRule="evenodd" />
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
    <div className={styles.screen}>
      <div className={styles.glow} aria-hidden="true" />
      <div className={styles.inner}>
        <LogoMark src={logo} />
        <div className={styles.eyebrow}>CARIBOU TUNING</div>
        <h1 className={styles.title}>ECU Lab</h1>
        <p className={styles.subtitle}>Engine + ECU Simulator</p>
        <div className={styles.actions}>
          {WAYS_IN.map((way) => (
            <div key={way.key} className={styles.way}>
              <svg className={styles.icon} viewBox="0 0 16 16" aria-hidden="true" shapeRendering="crispEdges" fill="currentColor">
                {ICONS[/** @type {keyof typeof ICONS} */ (way.key)]}
              </svg>
              <Button
                size="lg"
                block
                variant={/** @type {'primary'|'ghost'|'quiet'} */ (way.variant)}
                onClick={handlers[way.key]}
              >
                {way.label}
              </Button>
              <div className={styles.caption}>{way.caption}</div>
            </div>
          ))}
        </div>
        <div className={styles.version}>{version}</div>
      </div>
    </div>
  );
}
