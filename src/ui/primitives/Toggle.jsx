/**
 * An on/off row for a single hardware option.
 *
 * Known migration gap: the legacy `ToggleRow` this replaces has a `color` prop,
 * used non-default at one call site (the intercooler toggle, `color={T.cyan}`).
 * This primitive has no equivalent. Migrating that call site needs a decision:
 * either add the prop here, or accept the default accent colour there.
 */

import React, { useId } from 'react';

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
  const subId = useId();
  return (
    <button
      type="button"
      className={styles.row}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-describedby={sub ? subId : undefined}
      onClick={() => onChange(!checked)}
    >
      <span>
        <span className={styles.label}>{label}</span>
        {sub && <span id={subId} className={styles.sub}>{sub}</span>}
      </span>
      <span className={styles.track}>
        <span className={styles.knob} />
      </span>
    </button>
  );
}
