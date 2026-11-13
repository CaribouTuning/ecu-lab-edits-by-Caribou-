/**
 * CAREER's job board: the shop's paperwork, on the board on the wall and in the laptop's
 * Shop app. Today's cars, the customers waiting, what to buy, what to learn, and the books.
 * Everything here is a decision about the shop; the tuning itself happens at the stations
 * and on the laptop, on the customer's car, with the job ticket above them.
 */

import React, { useEffect, useState } from 'react';

import { ACTIONS } from '../state/reducer.js';
import { useCareer } from '../state/StoreProvider.jsx';
import { warm } from '../sim/warm.js';

import { repTier } from './catalog.js';
import { isMaster } from './story.js';
import { jobById } from './jobs.js';
import { accept, blockers, board } from './shop.js';
import { LessonDialog, ShopPanel, money } from './ShopPanels.jsx';
import styles from './ShopScreen.module.css';

/**
 * @param {object} props
 * @param {() => void} props.onWork opens the game on the car on the bay
 * @returns {React.ReactElement|null}
 */
export function CareerOffice({ onWork }) {
  const [career, dispatch] = useCareer();
  const [tab, setTab] = useState('today');
  const [arriving, setArriving] = useState(/** @type {string|null} */ (null));
  const [speech, setSpeech] = useState(/** @type {string|null} */ (null));
  const [lesson, setLesson] = useState(/** @type {string|null} */ (null));
  const [confirmReset, setConfirmReset] = useState(false);
  // A customer's car is built on its factory calibration, seconds of the gas exchange the first
  // time an engine is seen: the simulator worker builds the waiting cars' engines as soon as the
  // customers are shown (sim/warm.js), and taking one waits for its own, the button saying so.
  const [taking, setTaking] = useState(/** @type {string|null} */ (null));
  const presetOf = (id) => jobById(id)?.car?.preset ?? null;
  useEffect(() => {
    if (tab !== 'customers' || !career) return;
    for (const j of board(career)) { const pr = j.car?.preset; if (pr) warm('preset', { id: pr }); }
  }, [tab, career]);

  const last = career?.last;
  const unseen = last && last.seq !== career.lastSeen;

  // A finished job's result is shown on Today when the board is next opened.
  useEffect(() => { if (unseen) setTab('today'); }, [unseen]);

  useEffect(() => {
    if (!arriving) return undefined;
    const t = setTimeout(() => { setArriving(null); setSpeech(null); }, 5200);
    return () => clearTimeout(t);
  }, [arriving]);

  if (!career) return null;
  const update = (next) => dispatch({ type: ACTIONS.CAREER_UPDATE, career: next });
  const tier = repTier(career.rep);
  const waiting = board(career);

  const takeJob = (id) => {
    const job = jobById(id);
    const go = () => {
      setTaking(null);
      update(accept(career, id));
      setArriving(id);
      setSpeech(job.says);
      setTab('today');
    };
    const ready = presetOf(id) ? warm('preset', { id: presetOf(id) }) : null;
    if (!ready) { go(); return; }
    setTaking(id);
    ready.then(go);
  };

  const TABS = [
    { id: 'today', label: 'Today' },
    { id: 'customers', label: 'Customers', count: waiting.filter((j) => blockers(career, j).length === 0).length },
    { id: 'upgrades', label: 'Upgrades' },
    { id: 'training', label: 'Training' },
    { id: 'books', label: 'Books' },
  ];

  return (
    <div className={styles.officeScreen}>
      <header className={styles.top}>
        <div className={styles.stats} aria-label="Shop status">
          <span className={styles.stat}><span className={styles.statKey}>Day</span>{career.day}</span>
          <span className={styles.stat} data-testid="shop-money"><span className={styles.statKey}>Cash</span>{money(career.money)}</span>
          <span className={styles.stat} data-testid="shop-rep"><span className={styles.statKey}>Reputation</span>{career.rep}, {isMaster(career) ? 'master tuner' : tier.title.toLowerCase()}</span>
        </div>
      </header>

      {speech && <p className={styles.office} role="status">“{speech}”</p>}

      <nav className={styles.tabs} aria-label="Shop">
        {TABS.map((t) => (
          <button key={t.id} type="button" className={styles.tab} aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}>
            <span>{t.label}</span>
            {t.count > 0 && <span className={styles.count}>{t.count}</span>}
          </button>
        ))}
      </nav>

      <ShopPanel
        tab={tab} career={career} update={update} onWork={onWork} setTab={setTab} takeJob={takeJob} taking={taking}
        setLesson={setLesson} confirmReset={confirmReset} setConfirmReset={setConfirmReset} unseen={!!unseen}
      />

      <LessonDialog lesson={lesson} onClose={() => setLesson(null)} />
    </div>
  );
}
