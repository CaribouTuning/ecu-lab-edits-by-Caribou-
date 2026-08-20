/**
 * A segmented control: pick exactly one of a small set.
 *
 * Plain buttons carrying `aria-pressed` rather than a radio group, because these
 * switch a view rather than submit a value.
 */

import React from 'react';

import styles from './Seg.module.css';

/**
 * @param {object} props
 * @param {string} props.label accessible name for the group
 * @param {Array<{id: string, label: string, icon?: React.ElementType}>} props.options
 * @param {string} props.value id of the selected option
 * @param {(id: string) => void} props.onChange
 * @returns {React.ReactElement}
 */
export function Seg({ label, options, value, onChange }) {
  return (
    <div className={styles.seg} role="group" aria-label={label}>
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
