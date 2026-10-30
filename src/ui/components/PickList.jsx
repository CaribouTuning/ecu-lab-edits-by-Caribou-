/**
 * Descriptive rows for a choice that needs a subtitle (turbine size, injector size, pump)
 * — a `Seg` reads as a compact row of chips, and neither the turbine housing names nor the
 * injector flow figures fit that shape without wrapping.
 *
 * A ruled list, not a stack of boxes: hairlines between the rows, and the chosen one marked
 * by a bar on its edge and its text brought up. Shared by BUILD's Forced Induction and Fuel
 * system screens and TUNE's ECU screen, which is why it lives here rather than beside any
 * one of them — see this folder's README for what that distinction means.
 */

import React from 'react';

import styles from './PickList.module.css';

/**
 * @param {object} props
 * @param {Array<{value: string, label: string, sub?: string}>} props.options
 * @param {string} props.value
 * @param {(value: string) => void} props.onChange
 * @returns {React.ReactElement}
 */
export function PickList({ options, value, onChange }) {
  return (
    <div className={styles.list} data-plain="">
      {options.map((o) => (
        <button key={o.value} type="button" className={styles.option} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          <span className={styles.label}>{o.label}</span>
          {o.sub && <span className={styles.sub}>{o.sub}</span>}
        </button>
      ))}
    </div>
  );
}
