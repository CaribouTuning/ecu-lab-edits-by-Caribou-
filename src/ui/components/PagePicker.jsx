/**
 * On a phone, the pages of an app as one button naming the open page; pressing it lists
 * every page, and choosing one opens it. A row of tabs that ran off the right edge of the
 * screen hid most of TUNE's pages from anyone who did not think to scroll it sideways.
 */

import { Check, ChevronDown, Lock } from 'lucide-react';
import React, { useEffect, useId, useRef, useState } from 'react';

import styles from './PagePicker.module.css';

/**
 * @typedef {{id: string, name: string, icon?: React.ElementType, locked?: boolean, flagged?: number}} PickerPage
 */

/**
 * @param {object} props
 * @param {string} props.label what the pages are, for the list's name ("Tuning pages")
 * @param {PickerPage[]} props.pages
 * @param {string} props.current the open page's id
 * @param {(id: string) => void} props.onPick
 * @returns {React.ReactElement}
 */
export function PagePicker({ label, pages, current, onPick }) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const root = useRef(/** @type {HTMLDivElement|null} */ (null));
  const here = pages.find((p) => p.id === current) ?? pages[0];
  const flaggedElsewhere = pages.filter((p) => p.id !== current && (p.flagged ?? 0) > 0).length;

  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (root.current && !root.current.contains(/** @type {Node} */ (e.target))) setOpen(false); };
    const key = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', key); };
  }, [open]);

  const Icon = here?.icon;
  return (
    <div className={styles.picker} ref={root}>
      <button type="button" className={styles.button} aria-expanded={open} aria-controls={listId}
        aria-label={`Choose from the ${label.toLowerCase()} (${here?.name ?? ''} is open)`} onClick={() => setOpen((o) => !o)}>
        {Icon && <Icon size={16} aria-hidden="true" />}
        <span className={styles.name}>{here?.name}</span>
        {flaggedElsewhere > 0 && !open && <span className={styles.more} aria-hidden="true">{flaggedElsewhere} flagged</span>}
        <span className={styles.all} aria-hidden="true">All pages</span>
        <ChevronDown size={16} aria-hidden="true" className={styles.chev} data-open={open || undefined} />
      </button>
      {open && (
        <ul id={listId} className={styles.list} aria-label={label} data-plain="">
          {pages.map((p) => {
            const PIcon = p.icon;
            const on = p.id === current;
            return (
              <li key={p.id}>
                <button type="button" className={styles.row} aria-current={on ? 'page' : undefined}
                  onClick={() => { setOpen(false); onPick(p.id); }}
                  aria-label={p.locked ? `${p.name}, locked until the shop trains for it`
                    : p.flagged ? `${p.name}, named by ${p.flagged} ${p.flagged === 1 ? 'entry' : 'entries'} in the last pull's log` : p.name}>
                  {p.locked ? <Lock size={16} aria-hidden="true" /> : PIcon ? <PIcon size={16} aria-hidden="true" /> : null}
                  <span className={styles.rowName}>{p.name}</span>
                  {(p.flagged ?? 0) > 0 && <span className={styles.flag} aria-hidden="true">{p.flagged}</span>}
                  {on && <Check size={16} aria-hidden="true" className={styles.check} />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
