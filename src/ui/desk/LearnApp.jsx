/**
 * The Learn app: the guide as pages, laid out as the Physics app is. One page at a time,
 * chosen from a list on a phone and a row of tabs where there is room; each page opens with
 * what you can do after it, then its articles as open sections (learnShelf.jsx). The pages
 * run in the order a tuner learns the job, and the last button on each goes to the next.
 */

import { ChevronLeft, ChevronRight } from 'lucide-react';
import React, { useEffect, useState } from 'react';

import { PagePicker } from '../components/PagePicker.jsx';
import { LearnScreen } from '../screens/dash/LearnScreen.jsx';
import { LEARN_PAGES } from '../screens/dash/learnShelf.jsx';
import { warm } from '../sim/warm.js';

import styles from './Apps.module.css';

/**
 * @param {object} props
 * @param {string|null} props.shelf the page open (a LEARN section), or null for the first
 * @param {(id: string) => void} props.onShelf
 * @returns {React.ReactElement}
 */
/**
 * The articles whose worked examples are the game's own engine, built and pulled when they
 * open (LearnDeep.jsx), and the scenarios they build (tutorial/scenarios.js).
 */
const DEMO_ARTICLES = [37, 38, 40, 41];
const DEMOS = ['stock', 'intakeFitted', 'intakeMafOnly', 'intakeRetuned', 'veHalfPasses'];

export function LearnApp({ shelf, onShelf }) {
  const at = Math.max(0, LEARN_PAGES.findIndex((pg) => pg.id === shelf));
  const page = LEARN_PAGES[at];
  // A page with a worked example builds its demo engines off the drawing thread first
  // (sim/warm.js): the page turns at once, and the example appears when it is worked out.
  const needs = page.articles.some((n) => DEMO_ARTICLES.includes(/** @type {number} */ (n)));
  const [ready, setReady] = useState(/** @type {Record<string, boolean>} */ ({}));
  useEffect(() => {
    if (!needs || ready[page.id]) return undefined;
    let alive = true;
    const p = warm('demo', { names: DEMOS });
    const done = () => { if (alive) setReady((r) => ({ ...r, [page.id]: true })); };
    if (p) p.then(done); else done();
    return () => { alive = false; };
  }, [needs, page.id, ready]);
  const shown = !needs || ready[page.id];
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
      {shown ? <LearnScreen active onToggle={noop} shelf={page.id} bare />
        : <p className={styles.learnWorking} role="status">Working out this page&apos;s worked examples on the game&apos;s own engine…</p>}
      <nav className={styles.learnTurn} aria-label="Turn the page" data-plain="">
        {prev ? <button type="button" onClick={() => go(prev.id)}><ChevronLeft size={16} aria-hidden="true" /><span><small>Previous</small>{prev.name}</span></button> : <span />}
        {next && <button type="button" data-next="" onClick={() => go(next.id)}><span><small>Next</small>{next.name}</span><ChevronRight size={16} aria-hidden="true" /></button>}
      </nav>
    </div>
  );
}
