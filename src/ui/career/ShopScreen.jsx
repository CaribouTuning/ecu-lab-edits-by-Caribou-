/**
 * The career's home: the shop, drawn, with what needs doing today underneath it.
 *
 * The scene is the centrepiece and the panels are the paperwork: today's cars, the
 * customers waiting, what to buy, what to learn, and the books. Everything here is a
 * decision about the shop; the tuning itself happens in the game's own screens, on the
 * customer's car (WORK ON THE CAR), with the job ticket pinned above them.
 */

import { BookOpen, ClipboardList, Hammer, Menu, Users, Wallet } from 'lucide-react';
import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';

import { Button } from '../primitives/Button.jsx';
import { ACTIONS } from '../state/reducer.js';
import { useCareer } from '../state/StoreProvider.jsx';
import { loadSettings } from '../world/settings.js';
import { webglAvailable } from '../world/support.js';

import { repTier } from './catalog.js';
import { isMaster } from './story.js';
import { jobById } from './jobs.js';
import { accept, blockers, board } from './shop.js';
import { LessonDialog, ShopPanel, money } from './ShopPanels.jsx';
import { ShopScene } from './ShopScene.jsx';
import styles from './ShopScreen.module.css';

/**
 * @param {object} props
 * @param {() => void} props.onWork opens the game on the car on the bay
 * @param {() => void} props.onMenu back to the start screen
 * @param {() => void} [props.onLearn] opens the Tuning Course
 * @param {boolean} [props.office] the laptop's Shop app: the paperwork only, since the
 *   shop itself is in front of you (no drawn scene, no menu button: the laptop has both)
 * @returns {React.ReactElement|null}
 */
export function LegacyShop({ onWork, onMenu, onLearn, office = false }) {
  const [career, dispatch] = useCareer();
  const [tab, setTab] = useState('today');
  const [arriving, setArriving] = useState(/** @type {string|null} */ (null));
  const [speech, setSpeech] = useState(/** @type {{text: string, shirt: string}|null} */ (null));
  const [departing, setDeparting] = useState(/** @type {{color: string, body?: string}|null} */ (null));
  const [lesson, setLesson] = useState(/** @type {string|null} */ (null));
  const [confirmReset, setConfirmReset] = useState(false);

  const last = career?.last;
  const unseen = last && last.seq !== career.lastSeen;

  // A car that went home drives out when the shop opens after the hand-back.
  useEffect(() => {
    if (!unseen || !last.leaves) return undefined;
    const job = jobById(last.jobId);
    setDeparting({ color: job.customer.color, body: job.customer.body });
    setTab('today');
    const t = setTimeout(() => setDeparting(null), 2600);
    return () => clearTimeout(t);
  }, [unseen, last]);

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
    update(accept(career, id));
    setArriving(id);
    setSpeech({ text: job.says, shirt: job.customer.color });
    setTab('today');
  };

  const TABS = [
    { id: 'today', label: 'Today', icon: ClipboardList },
    { id: 'customers', label: 'Customers', icon: Users, count: waiting.filter((j) => blockers(career, j).length === 0).length },
    { id: 'upgrades', label: 'Upgrades', icon: Hammer },
    { id: 'training', label: 'Training', icon: BookOpen },
    { id: 'books', label: 'Books', icon: Wallet },
  ];

  return (
    <div className={office ? styles.officeScreen : styles.screen}>
      <header className={styles.top}>
        <div className={styles.brand}>
          <span className={styles.brandMaker}>CAREER</span>
          <span className={styles.brandName}>Your tuning shop</span>
        </div>
        <div className={styles.stats} aria-label="Shop status">
          <span className={styles.stat}><span className={styles.statKey}>Day</span>{career.day}</span>
          <span className={styles.stat} data-testid="shop-money"><span className={styles.statKey}>Cash</span>{money(career.money)}</span>
          <span className={styles.stat} data-testid="shop-rep"><span className={styles.statKey}>Reputation</span>{career.rep}, {isMaster(career) ? 'master tuner' : tier.title.toLowerCase()}</span>
        </div>
        {!office && <Button size="sm" variant="ghost" onClick={onMenu} aria-label="Main menu"><Menu size={15} aria-hidden="true" /> MENU</Button>}
      </header>

      {office ? (
        speech && <p className={styles.office} role="status">“{speech.text}”</p>
      ) : (
        <div className={styles.sceneWrap}>
          <ShopScene career={career} arriving={arriving} departing={departing} speech={speech} />
        </div>
      )}

      <nav className={styles.tabs} aria-label="Shop">
        {TABS.map((t) => (
          <button key={t.id} type="button" className={styles.tab} aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}>
            {!office && <t.icon size={15} aria-hidden="true" />}
            <span>{t.label}</span>
            {t.count > 0 && <span className={styles.count}>{t.count}</span>}
          </button>
        ))}
      </nav>

      <ShopPanel
        tab={tab} career={career} update={update} onWork={onWork} setTab={setTab} takeJob={takeJob}
        setLesson={setLesson} confirmReset={confirmReset} setConfirmReset={setConfirmReset} unseen={!!unseen}
      />

      <LessonDialog lesson={lesson} onClose={() => setLesson(null)} onLearn={onLearn} />
    </div>
  );
}

/**
 * CAREER on the laptop (or phone): the Shop app, the shop's paperwork.
 * @param {{onWork: () => void, onMenu: () => void, onLearn?: () => void}} props
 * @returns {React.ReactElement|null}
 */
export function CareerOffice(props) {
  return <LegacyShop {...props} office />;
}

/** The 3-D world, loaded on demand: three.js is not part of the tuning app's first download. */
export const World = lazy(() => import('../world/World.jsx'));

/**
 * @param {object} props
 * @param {() => void} props.onWork opens the game on the car on the bay
 * @param {() => void} [props.onDyno] opens the dyno on the car on the bay
 * @param {() => void} props.onMenu back to the start screen
 * @param {() => void} [props.onLearn] opens the Tuning Course
 * @param {boolean} [props.flat] draw the old flat shop even where 3-D works
 * @returns {React.ReactElement|null}
 */
export function ShopScreen({ onWork, onDyno, onMenu, onLearn, flat = false }) {
  const [career, dispatch] = useCareer();
  const [fellBack, setFellBack] = useState(false);
  const solid = useMemo(() => !flat && !fellBack && loadSettings().view !== 'flat' && webglAvailable(), [flat, fellBack]);
  if (!solid) return <LegacyShop onWork={onWork} onMenu={onMenu} onLearn={onLearn} />;
  if (!career) return null;
  return (
    <Suspense fallback={<div className={styles.loading}>Opening the shop&hellip;</div>}>
      <World
        career={career} update={(next) => dispatch({ type: ACTIONS.CAREER_UPDATE, career: next })}
        onWork={onWork} onDyno={onDyno} onMenu={onMenu} onLearn={onLearn} onFlat={() => setFellBack(true)}
      />
    </Suspense>
  );
}
