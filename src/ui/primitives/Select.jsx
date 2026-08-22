/**
 * A grouped dropdown built on a real `<select>`.
 *
 * Deliberately native: keyboard navigation, type-ahead and screen-reader semantics
 * come free, and on a phone it opens the platform picker. Only the chevron is ours.
 *
 * Sizing is the caller's. The legacy `GroupedSelect` this replaces was `width: 100%`
 * with a bottom margin; this wrapper is `inline-block` with a `min-width`, so a bare
 * swap makes the control shrink to its content. Anything not named here — `style`,
 * `className`, `id` — lands on the wrapper, which is how a caller sizes and spaces it.
 * Without that passthrough the instruction to "size it yourself" had no mechanism
 * behind it.
 */

import { ChevronDown } from 'lucide-react';
import React from 'react';

import styles from './Select.module.css';

/**
 * @typedef {Object} SelectProps
 * @property {string} label accessible name
 * @property {Array<{label: string, options: Array<{value: string, label: string}>}>} groups
 * @property {Array<{value: string, label: string}>} [extra] ungrouped options, appended last
 * @property {string} value
 * @property {(value: string) => void} onChange
 */

/**
 * @param {SelectProps & React.HTMLAttributes<HTMLDivElement>} props
 * @returns {React.ReactElement}
 */
export function Select({ label, groups, extra = [], value, onChange, ...rest }) {
  return (
    <div className={styles.wrap} {...rest}>
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
