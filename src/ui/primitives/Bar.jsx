/**
 * A horizontal meter for a 0-max quantity: component health, injector duty.
 *
 * Those two use cases run in opposite directions: high component health is good,
 * but high injector duty is the dangerous end. `higherIsBetter` is how a caller
 * says which way this particular value reads. Each direction has its own colour
 * scale rather than one mirrored around the other — `statusColor` for health,
 * `utilisationColor` for how much of a capacity is spent — because they are
 * different judgements about different quantities, not reflections of each other.
 *
 * The fill colour comes from one of those two scales, so it is a STATUS, never
 * decoration. Do not use this for a value that has no good/bad reading.
 */

import React from 'react';

import { clamp } from '../../sim/index.js';
import { statusColor, utilisationColor } from '../theme.js';

import styles from './Bar.module.css';

/**
 * @param {object} props
 * @param {string} props.label
 * @param {number} props.value
 * @param {number} [props.max]
 * @param {boolean} [props.higherIsBetter] true when a high value is healthy
 *   (component wear); false when a high value is the dangerous end (injector duty cycle)
 * @returns {React.ReactElement}
 */
export function Bar({ label, value, max = 100, higherIsBetter = true }) {
  const pct = clamp((value / max) * 100, 0, 100);
  const shown = clamp(value, 0, max);
  const tone = higherIsBetter ? statusColor(pct) : utilisationColor(pct);
  return (
    <div className={styles.wrap}>
      <div className={styles.label}>
        <span>{label}</span>
        <span className={styles.pct} style={{ color: tone }}>
          {Math.round(pct)}%
        </span>
      </div>
      <div
        className={styles.track}
        role="meter"
        aria-label={label}
        aria-valuenow={shown}
        aria-valuemin={0}
        aria-valuemax={max}
      >
        <div
          data-fill=""
          className={styles.fill}
          style={{ width: `${pct}%`, background: tone }}
        />
      </div>
    </div>
  );
}
