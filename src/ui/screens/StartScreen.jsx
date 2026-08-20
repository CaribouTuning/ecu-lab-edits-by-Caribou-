/** The first screen: what this is, and the two ways in. */

import React from 'react';

import { Button } from '../primitives/Button.jsx';

import styles from './StartScreen.module.css';

/**
 * @param {object} props
 * @param {() => void} props.onStart
 * @param {() => void} props.onTutorial
 * @param {string} props.version
 * @param {React.ReactNode} [props.dial] decorative dial mark
 * @returns {React.ReactElement}
 */
export function StartScreen({ onStart, onTutorial, version, dial }) {
  return (
    <div className={styles.screen}>
      <div className={styles.glow} aria-hidden="true" />
      <div className={styles.inner}>
        {dial && <div className={styles.dial}>{dial}</div>}
        <div className={styles.eyebrow}>CARIBOU TUNING</div>
        <h1 className={styles.title}>Engine Management Sandbox</h1>
        <p className={styles.blurb}>
          Design an engine. Tune it. Log it. Improve it. A free-tune sandbox built to
          teach real engine management, not just move sliders.
        </p>
        <div className={styles.actions}>
          <Button size="lg" onClick={onStart}>START</Button>
          <Button size="lg" variant="ghost" onClick={onTutorial}>TUTORIAL</Button>
        </div>
        <div className={styles.version}>{version}</div>
      </div>
    </div>
  );
}
