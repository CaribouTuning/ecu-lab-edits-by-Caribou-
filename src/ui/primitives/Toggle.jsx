/** An on/off row for a single hardware option. */

import React from 'react';

import styles from './Toggle.module.css';

/**
 * @param {object} props
 * @param {string} props.label
 * @param {string} [props.sub] one line on what the option physically does
 * @param {boolean} props.checked
 * @param {(next: boolean) => void} props.onChange
 * @returns {React.ReactElement}
 */
export function Toggle({ label, sub, checked, onChange }) {
  return (
    <button
      type="button"
      className={styles.row}
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
    >
      <span>
        <span className={styles.label}>{label}</span>
        {sub && <span className={styles.sub} style={{ display: 'block' }}>{sub}</span>}
      </span>
      <span className={styles.track}>
        <span className={styles.knob} />
      </span>
    </button>
  );
}
