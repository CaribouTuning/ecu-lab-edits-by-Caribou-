/**
 * The Learn app: four shelves down the side (Sources, ECU, Engine, How it works) and the
 * shelf's articles beside them. The articles are the guide's own (LearnScreen), each on
 * its shelf (learnShelf.jsx).
 */

import React from 'react';

import { LearnScreen } from '../screens/dash/LearnScreen.jsx';
import { SHELVES } from '../screens/dash/learnShelf.jsx';

import styles from './Apps.module.css';

/**
 * @param {object} props
 * @param {string|null} props.shelf the shelf open (a LEARN section), or null for the default
 * @param {(id: string) => void} props.onShelf
 * @returns {React.ReactElement}
 */
export function LearnApp({ shelf, onShelf }) {
  const open = shelf ?? 'how';
  const noop = React.useCallback(() => {}, []);
  return (
    <div className={styles.split}>
      <nav className={styles.side} aria-label="Learn shelves">
        {SHELVES.map((s) => (
          <button key={s.id} type="button" className={styles.sideBtn} aria-current={open === s.id ? 'page' : undefined} onClick={() => onShelf(s.id)}>
            {s.label}
          </button>
        ))}
      </nav>
      <div className={styles.sideBody}>
        <LearnScreen active onToggle={noop} shelf={open} bare />
      </div>
    </div>
  );
}
