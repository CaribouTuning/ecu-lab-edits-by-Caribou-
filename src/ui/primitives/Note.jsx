/**
 * An inline explanatory box.
 *
 * `warn` and `danger` carry engine meaning, so they are not emphasis levels — do not
 * reach for `danger` to make a paragraph louder.
 */

import { Info } from 'lucide-react';
import React from 'react';

import styles from './Note.module.css';

/**
 * @param {object} props
 * @param {React.ReactNode} props.children
 * @param {'info'|'warn'|'danger'} [props.tone]
 * @returns {React.ReactElement}
 */
export function Note({ children, tone = 'info' }) {
  // A warning or a fault is a scribbled wash in its own colour (sketch.css).
  const className = [styles.note, styles[tone] ?? styles.info, (tone === 'warn' || tone === 'danger') && 'scribble'].filter(Boolean).join(' ');
  return (
    <div className={className} role={tone === 'danger' ? 'alert' : 'note'}>
      <Info size={15} className={styles.icon} aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}
