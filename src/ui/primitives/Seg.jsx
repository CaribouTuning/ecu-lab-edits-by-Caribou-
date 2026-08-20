/**
 * A segmented control: pick exactly one of a small set.
 *
 * Plain buttons carrying `aria-pressed` rather than a radio group, because these
 * switch a view rather than submit a value.
 *
 * `equal` exists because the legacy `Seg` in EcuLab.jsx laid every option out at
 * flex:1 (equal width), and its busiest call site — the 6-option injector-size
 * picker — leans on exactly that so a wide picker reads as one even row rather
 * than a ragged content-width wrap. A few-option picker still looks better
 * sitting inline at its content width, which is why `equal` defaults to off.
 */

import React from 'react';

import styles from './Seg.module.css';

/**
 * @param {object} props
 * @param {string} props.label accessible name for the group
 * @param {Array<{id: string, label: string, icon?: React.ElementType}>} props.options
 * @param {string} props.value id of the selected option
 * @param {(id: string) => void} props.onChange
 * @param {boolean} [props.equal] lay options out at equal width, wrapping as needed,
 *   instead of the default content-width row. For pickers with enough options that
 *   an inline row would crowd or wrap raggedly (e.g. injector sizes).
 * @returns {React.ReactElement}
 */
export function Seg({ label, options, value, onChange, equal = false }) {
  return (
    <div
      className={equal ? `${styles.seg} ${styles.equal}` : styles.seg}
      role="group"
      aria-label={label}
    >
      {options.map(({ id, label: text, icon: Icon }) => (
        <button
          key={id}
          type="button"
          className={styles.item}
          aria-pressed={id === value}
          onClick={() => onChange(id)}
        >
          {Icon && <Icon size={13} aria-hidden="true" />}
          {text}
        </button>
      ))}
    </div>
  );
}
