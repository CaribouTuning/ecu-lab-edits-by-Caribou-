/** A single labelled number. The app's unit of measured output. */

import React from 'react';

import styles from './StatTile.module.css';

/**
 * @param {object} props
 * @param {string} props.label
 * @param {string|number} props.value
 * @param {string} [props.unit]
 * @param {'neutral'|'acc'|'alt'|'ok'|'warn'|'danger'} [props.tone] `alt` marks the
 *   second quantity in a paired readout (e.g. torque beside a power figure in `acc`)
 *   so the two can be told apart at a glance. It is never a status.
 * @returns {React.ReactElement}
 */
export function StatTile({ label, value, unit, tone = 'neutral' }) {
  const className = [styles.tile, styles[tone]].filter(Boolean).join(' ');
  return (
    <div className={className}>
      <div className={styles.label}>{label}</div>
      <div className={styles.value}>
        {value}
        {unit && <span className={styles.unit}>{unit}</span>}
      </div>
    </div>
  );
}
