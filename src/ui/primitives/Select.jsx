/**
 * A grouped dropdown built on a real `<select>`.
 *
 * Deliberately native: keyboard navigation, type-ahead and screen-reader semantics
 * come free, and on a phone it opens the platform picker. Only the chevron is ours.
 */

import { ChevronDown } from 'lucide-react';
import React from 'react';

import styles from './Select.module.css';

/**
 * @param {object} props
 * @param {string} props.label accessible name
 * @param {Array<{label: string, options: Array<{value: string, label: string}>}>} props.groups
 * @param {Array<{value: string, label: string}>} [props.extra] ungrouped options, appended last
 * @param {string} props.value
 * @param {(value: string) => void} props.onChange
 * @returns {React.ReactElement}
 */
export function Select({ label, groups, extra = [], value, onChange }) {
  return (
    <div className={styles.wrap}>
      <select
        className={styles.select}
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {groups.map((g) => (
          <optgroup key={g.label} label={g.label}>
            {g.options.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </optgroup>
        ))}
        {extra.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <ChevronDown size={16} className={styles.chevron} aria-hidden="true" />
    </div>
  );
}
