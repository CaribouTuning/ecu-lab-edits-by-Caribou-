/**
 * A group's name, set plainly: the body face a step smaller. It used to be tracked
 * capitals behind an accent rule and an icon, the label every generated page wears; the
 * words do the labelling. `icon` is accepted and ignored, so call sites need not change.
 */

import React from 'react';

import styles from './Eyebrow.module.css';

/**
 * @param {object} props
 * @param {React.ReactNode} props.children
 * @param {React.ElementType} [props.icon] ignored
 * @returns {React.ReactElement}
 */
export function Eyebrow({ children }) {
  return <div className={styles.eyebrow}>{children}</div>;
}
