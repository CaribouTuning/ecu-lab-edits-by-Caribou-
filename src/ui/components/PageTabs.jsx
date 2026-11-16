/**
 * On a phone, the pages of an app as a grid of small tabs, every page in sight and one tap
 * away: an icon over a short name, the open one keyed. Where the app has room, its sidebar
 * does this job and the grid is not drawn (`when`).
 *
 * It replaced a drop-down ("All pages"), which hid the pages behind a press, and before
 * that a row of tabs that ran off the right edge of the screen.
 */

import { Lock } from 'lucide-react';
import React, { useEffect, useState } from 'react';

import styles from './PageTabs.module.css';

/**
 * @typedef {{id: string, name: string, short?: string, icon?: React.ElementType, locked?: boolean, flagged?: number}} TabPage
 */

/**
 * Whether a media query matches, kept current. With no matchMedia (a test runner) nothing
 * matches.
 * @param {string|undefined} q
 * @returns {boolean}
 */
function useMatches(q) {
  const test = () => !q || (typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(q).matches);
  const [on, setOn] = useState(test);
  useEffect(() => {
    if (!q || typeof window.matchMedia !== 'function') return undefined;
    const mq = window.matchMedia(q);
    const change = () => setOn(mq.matches);
    change();
    mq.addEventListener?.('change', change);
    return () => mq.removeEventListener?.('change', change);
  }, [q]);
  return on;
}

/**
 * @param {object} props
 * @param {string} [props.when] a media query: shown only while it matches (where the app's
 *   sidebar or tabs have no room), so the two never sit on the page together
 * @param {string} props.label what the pages are ("Tuning pages")
 * @param {TabPage[]} props.pages
 * @param {string} props.current the open page's id
 * @param {(id: string) => void} props.onPick
 * @returns {React.ReactElement|null}
 */
export function PageTabs({ when, label, pages, current, onPick }) {
  const shown = useMatches(when);
  if (!shown) return null;
  return (
    <div className={styles.grid} role="group" aria-label={label} data-plain="">
      {pages.map((p) => {
        const Icon = p.locked ? Lock : p.icon;
        const on = p.id === current;
        return (
          <button key={p.id} type="button" className={styles.tab} aria-current={on ? 'page' : undefined}
            data-locked={p.locked || undefined} onClick={() => onPick(p.id)}
            aria-label={p.locked ? `${p.name}, locked until the shop trains for it`
              : p.flagged ? `${p.name}, named by ${p.flagged} ${p.flagged === 1 ? 'entry' : 'entries'} in the last pull's log` : p.name}>
            {Icon && <Icon size={16} aria-hidden="true" />}
            <span className={styles.name} aria-hidden="true">{p.short ?? p.name}</span>
            {(p.flagged ?? 0) > 0 && <span className={styles.flag} aria-hidden="true">{p.flagged}</span>}
          </button>
        );
      })}
    </div>
  );
}
