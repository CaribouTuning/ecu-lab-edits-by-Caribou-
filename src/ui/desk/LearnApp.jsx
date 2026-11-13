/**
 * The Learn app: the guide as pages, laid out as the Physics app is. One page at a time,
 * chosen from a list on a phone and a row of tabs where there is room; each page opens with
 * what you can do after it, then its articles as open sections (learnShelf.jsx). The pages
 * run in the order a tuner learns the job, and the last button on each goes to the next.
 */

import { ChevronLeft, ChevronRight } from 'lucide-react';
import React from 'react';

import { PagePicker } from '../components/PagePicker.jsx';
import { LearnScreen } from '../screens/dash/LearnScreen.jsx';
import { LEARN_PAGES } from '../screens/dash/learnShelf.jsx';

import styles from './Apps.module.css';

/**
 * @param {object} props
 * @param {string|null} props.shelf the page open (a LEARN section), or null for the first
 * @param {(id: string) => void} props.onShelf
 * @returns {React.ReactElement}
 */
export function LearnApp({ shelf, onShelf }) {
  const at = Math.max(0, LEARN_PAGES.findIndex((pg) => pg.id === shelf));
  const page = LEARN_PAGES[at];
  const prev = LEARN_PAGES[at - 1];
  const next = LEARN_PAGES[at + 1];
  const noop = React.useCallback(() => {}, []);
  const go = (id) => {
    onShelf(id);
    // A new page starts at its top, as turning a page does.
    if (typeof document !== 'undefined') document.querySelector('[data-learn-top]')?.scrollIntoView?.({ block: 'start' });
  };
  return (
    <div className={styles.pad} data-learn-top="">
      <div className={styles.physPicker}>
        <PagePicker label="Learn pages" current={page.id} onPick={go} pages={LEARN_PAGES.map((pg) => ({ id: pg.id, name: pg.name, icon: pg.icon }))} />
      </div>
      <nav className={styles.physTabs} aria-label="Learn pages" data-plain="">
        {LEARN_PAGES.map((pg) => {
          const Icon = pg.icon;
          return (
            <button key={pg.id} type="button" aria-current={page.id === pg.id ? 'page' : undefined} onClick={() => go(pg.id)}>
              <Icon size={14} aria-hidden="true" />{pg.name}
            </button>
          );
        })}
      </nav>
      <header className={styles.learnHead}>
        <small>Page {at + 1} of {LEARN_PAGES.length}</small>
        <h2>{page.name}</h2>
        <p>{page.goal}</p>
      </header>
      <LearnScreen active onToggle={noop} shelf={page.id} bare />
      <nav className={styles.learnTurn} aria-label="Turn the page" data-plain="">
        {prev ? <button type="button" onClick={() => go(prev.id)}><ChevronLeft size={16} aria-hidden="true" /><span><small>Previous</small>{prev.name}</span></button> : <span />}
        {next && <button type="button" data-next="" onClick={() => go(next.id)}><span><small>Next</small>{next.name}</span><ChevronRight size={16} aria-hidden="true" /></button>}
      </nav>
    </div>
  );
}
