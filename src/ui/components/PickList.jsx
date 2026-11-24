/**
 * Descriptive rows for a choice that needs a subtitle (turbine size, injector size, pump) — a
 * `Seg` reads as a compact row of chips, and neither the turbine housing names nor the
 * injector flow figures fit that shape without wrapping.
 */

import React from 'react';

import styles from './PickList.module.css';

/**
 * @param {object} props
 * @param {Array<{value: string, label: string, sub?: string}>} props.options
 * @param {string} props.value
 * @param {(value: string) => void} props.onChange
 * @param {number} [props.columns] lay short choices out as a grid of this many columns
 *   (injector sizes), rather than one ruled row each
 * @param {string} [props.label] the choice's name, for the group
 * @returns {React.ReactElement}
 */
export function PickList({ options, value, onChange, columns = 0, label }) {
  return (
    <div className={styles.list} data-plain="" data-grid={columns > 0 || undefined} role={label ? 'group' : undefined} aria-label={label}
      style={columns > 0 ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : undefined}>
      {options.map((o) => (
        <button key={o.value} type="button" className={styles.option} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          <span className={styles.label}>{o.label}</span>
          {o.sub && <span className={styles.sub}>{o.sub}</span>}
        </button>
      ))}
    </div>
  );
}
