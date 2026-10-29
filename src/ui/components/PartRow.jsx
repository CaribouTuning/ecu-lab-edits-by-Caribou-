/**
 * A bolt-on part on the engine stand's parts list: what it is, whether it is on the
 * engine, and the one thing to do with it, fit it or take it off. The whole row is the
 * button, as a part on a parts board is the thing you reach for.
 *
 * `data-installed` says which way it is, for the tests and the stylesheet alike; the
 * catalogue's own label and blurb (MOD_INFO) are what it says, so the list cannot fork
 * from the parts it is a view onto.
 */

import React from 'react';

import styles from './PartRow.module.css';

/**
 * @param {object} props
 * @param {string} props.label the part's name
 * @param {string} props.blurb what it does to the engine
 * @param {boolean} props.fitted whether it is on the engine now
 * @param {() => void} props.onToggle fit it, or take it off
 * @returns {React.ReactElement}
 */
export function PartRow({ label, blurb, fitted, onToggle }) {
  return (
    <button type="button" className={styles.row} data-installed={fitted ? 'true' : 'false'} aria-pressed={fitted} onClick={onToggle}>
      <span className={styles.state} aria-hidden="true" />
      <span className={styles.text}>
        <span className={styles.name}>{label}</span>
        <span className={styles.blurb}>{blurb}</span>
      </span>
      <span className={styles.action}>{fitted ? 'Remove' : 'Fit'}</span>
    </button>
  );
}
