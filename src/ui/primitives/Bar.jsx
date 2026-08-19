/**
 * A horizontal meter for a 0-max quantity: component health, injector duty.
 *
 * The fill colour comes from `statusColor`, so it is a STATUS, never decoration.
 * Do not use this for a value that has no good/bad reading.
 */

import React from 'react';

import { clamp } from '../../sim/index.js';
import { statusColor } from '../theme.js';

import styles from './Bar.module.css';

/**
 * @param {object} props
 * @param {string} props.label
 * @param {number} props.value
 * @param {number} [props.max]
 * @returns {React.ReactElement}
 */
export function Bar({ label, value, max = 100 }) {
  const pct = clamp((value / max) * 100, 0, 100);
  return (
    <div className={styles.wrap}>
      <div className={styles.label}>
        <span>{label}</span>
        <span className={styles.pct} style={{ color: statusColor(pct) }}>
          {Math.round(pct)}%
        </span>
      </div>
      <div
        className={styles.track}
        role="meter"
        aria-label={label}
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
      >
        <div
          data-fill=""
          className={styles.fill}
          style={{ width: `${pct}%`, background: statusColor(pct) }}
        />
      </div>
    </div>
  );
}
