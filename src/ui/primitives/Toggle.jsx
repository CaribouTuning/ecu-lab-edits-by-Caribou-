/**
 * An on/off row for a single hardware option.
 *
 * There is deliberately no `color` prop. The legacy `ToggleRow` this replaces had one,
 * used at a single call site to paint the intercooler switch `T.cyan` — a chart-series
 * token, documented in `tokens.js` as the "secondary data hue, for charts that must plot
 * two series at once". One control wearing a colour that means something else elsewhere
 * is the rule this design system is built on being broken: the accent is never a status,
 * and a status is never decoration. That call site now uses the accent like every other
 * toggle, and the decision is closed — do not re-add the prop.
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
