/**
 * Progressive disclosure: a 16 px info button beside a label, which opens its explanation
 * in place, under it, and closes it again. The explanation is never removed, only folded:
 * the screen shows what a player acts on, and why is one tap away.
 */

import { Info as InfoIcon } from 'lucide-react';
import React, { useId, useState } from 'react';

import styles from './Info.module.css';

/**
 * @param {object} props
 * @param {string} props.label what the explanation is about, for the button's name ("About faded cells")
 * @param {React.ReactNode} [props.children] the line the button sits at the end of
 * @param {React.ReactNode} props.text the explanation
 * @param {boolean} [props.defaultOpen]
 * @returns {React.ReactElement}
 */
export function Info({ label, children = null, text, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <div className={styles.info}>
      <div className={styles.line}>
        {children}
        <button type="button" className={styles.button} aria-label={label} aria-expanded={open} aria-controls={id}
          onClick={() => setOpen((o) => !o)} data-plain="">
          <InfoIcon size={16} aria-hidden="true" />
        </button>
      </div>
      {open && <div id={id} className={styles.text}>{text}</div>}
    </div>
  );
}
