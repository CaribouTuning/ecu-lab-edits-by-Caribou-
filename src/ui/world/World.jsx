/**
 * The career's 3-D world, as a React screen.
 *
 * Owns the canvas and the runtime, turns the runtime's events (a prompt in reach, a
 * button pressed, a place entered) into panels and toasts, and puts the shop's save in
 * and out of the scene. Everything about money and customers stays in the career
 * functions: the world only asks for them.
 */

import { BookOpen, Check, ClipboardList, Hammer, MapPin, Shirt, Users, Wallet, X } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { repTier } from '../career/catalog.js';
import { findSpanner, SPANNER_COUNT } from '../career/collectibles.js';
import { inspectCar } from '../career/inspect.js';
import { jobById } from '../career/jobs.js';
import { accept, nextDay, overhead } from '../career/shop.js';
import { LessonDialog, ShopPanel } from '../career/ShopPanels.jsx';
import { Button } from '../primitives/Button.jsx';

import { driveSoundFrame, silenceDriveSound } from './driveSound.js';
import { Dash, Labels, Objective, PromptButton, Toasts, TopBar, TouchControls } from './Hud.jsx';
import { bodyFor, carFor, specForJob } from './levels/common.js';
import { buildGarage } from './levels/garage.js';
import { INTERIORS } from './levels/interior.js';
import { buildTown } from './levels/town.js';
import { PLACES, closedBecause, placeById } from './locations.js';
import { createWorld } from './runtime.js';
import { loadSettings, saveSettings } from './settings.js';
import { tipFor } from './tips.js';
import { driveSetup } from './vehicle.js';
import { WardrobePanel } from './WardrobePanel.jsx';
import styles from './World.module.css';

const LEVELS = { garage: buildGarage, town: buildTown, ...INTERIORS };

const TABS = [
  { id: 'today', label: 'TODAY', icon: ClipboardList, at: null },
  { id: 'customers', label: 'CUSTOMERS', icon: Users, at: 'garage' },
  { id: 'upgrades', label: 'UPGRADES', icon: Hammer, at: 'supply' },
  { id: 'training', label: 'TRAINING', icon: BookOpen, at: 'academy' },
  { id: 'wardrobe', label: 'WARDROBE', icon: Shirt, at: null },
  { id: 'books', label: 'BOOKS', icon: Wallet, at: null },
];

/** Where the tuner was when the screen last closed, so coming back from the laptop puts them by it. */
let lastSpot = null;

const BENCH_LINES = [
  'You sit by the pond. A heron stands perfectly still, like a gauge needle at idle.',
  'Ducks. Not one of them is thinking about air-fuel ratio. You envy them a little.',
  'The water is flat. So is a good idle trace.',
  'You watch the traffic loop and count three that need a retune. You do not say so.',
];

/** @param {{rep: number, phase?: number}} c */
const openPlaces = (c) => PLACES.filter((p) => !closedBecause(c, p));

/**
 * @param {object} props
 * @param {import('../career/shop.js').Career} props.career
 * @param {(c: import('../career/shop.js').Career) => void} props.update
 * @param {() => void} props.onWork opens the tuning screens on the car on the bay
 * @param {() => void} [props.onDyno]
 * @param {() => void} props.onMenu
 * @param {() => void} [props.onLearn]
 * @param {boolean} [props.preserve] keep the drawing buffer (screenshots in tests)
 */
export default function World({ career, update, onWork, onDyno, onMenu, onLearn, preserve = false }) {
  const canvasRef = useRef(null);
  const worldRef = useRef(/** @type {any} */ (null));
  const careerRef = useRef(career);
  careerRef.current = career;
  const [settings, setSettings] = useState(loadSettings);
  const [world, setWorld] = useState(/** @type {any} */ (null));
  const [prompt, setPrompt] = useState(/** @type {any} */ (null));
  const [labels, setLabels] = useState(/** @type {any[]} */ ([]));
  const [toasts, setToasts] = useState(/** @type {{id: number, text: string, tone?: string}[]} */ ([]));
  const [drawer, setDrawer] = useState(/** @type {string|null} */ (null));
  const [sheet, setSheet] = useState(/** @type {any} */ (null));
  const [driving, setDriving] = useState(false);
  const [place, setPlace] = useState('garage');
  const [outJob, setOutJob] = useState(/** @type {string|null} */ (null));
  const [lesson, setLesson] = useState(/** @type {string|null} */ (null));
  const [confirmReset, setConfirmReset] = useState(false);
  const [touch, setTouch] = useState(false);
  const [fade, setFade] = useState(false);
  const [dismissedRotate, setDismissedRotate] = useState(false);
  const toastId = useRef(0);
  const drawerRef = useRef(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const toast = useCallback((text, tone) => {
    const id = (toastId.current += 1);
    setToasts((t) => [...t.slice(-2), { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4600);
  }, []);

  // Touch screens get the on-screen controls; a keyboard player never sees them.
  useEffect(() => {
    if (settings.touch === 'on') { setTouch(true); return undefined; }
    if (settings.touch === 'off') { setTouch(false); return undefined; }
    const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
    setTouch(coarse);
    const onTouch = () => setTouch(true);
    window.addEventListener('touchstart', onTouch, { once: true, passive: true });
    return () => window.removeEventListener('touchstart', onTouch);
  }, [settings.touch]);

  const goPhone = useCallback((tab = 'today') => { setSheet(null); setDrawer(tab); }, []);

  /** Change place behind a quick fade. @param {string} id @param {any} [entry] */
  const travel = useCallback((id, entry = {}) => {
    const w = worldRef.current;
    if (!w) return;
    setDrawer(null);
    setSheet(null);
    setFade(true);
    setTimeout(() => {
      w.loadLevel(id, entry);
      setFade(false);
      if (entry.enterCar) w.enterCar();
    }, 340);
  }, []);

  /** Fast travel from the phone: straight to a place's door. @param {string} id */
  const fastTravel = useCallback((id) => {
    const c = careerRef.current;
    const p = placeById(id);
    const why = p && closedBecause(c, p);
    if (why) { toast(`${p.name} is closed. ${why}`, 'warn'); return; }
    if (id === 'garage') travel('garage', { from: 'town' });
    else if (INTERIORS[id]) travel(id, {});
    else travel('town', { from: id });
  }, [toast, travel]);

  const startDrive = useCallback((bay) => {
    const w = worldRef.current;
    const c = careerRef.current;
    const lift = c.lifts[bay];
    if (!w || !lift) return;
    toast('Warming it up…');
    setTimeout(() => {
      const job = jobById(lift.jobId);
      const setup = driveSetup(lift.car, { body: bodyFor(job) });
      const rig = carFor({ ...specForJob(job, lift.car.build), lowered: 0.3 });
      w.away.add(lift.jobId);
      setOutJob(lift.jobId);
      w.setCar({ rig, pt: setup.pt, setup, boostAt: setup.boostAt, hpAt: setup.hpAt, x: -37, z: -2.4, heading: Math.PI / 2, id: lift.jobId, name: job.customer.car });
      travel('town', { from: 'garage', car: { x: -37, z: -2.4, heading: Math.PI / 2 }, enterCar: true });
    }, 60);
  }, [toast, travel]);

  const onAct = useCallback((e) => {
    const c = careerRef.current;
    const w = worldRef.current;
    switch (e.id) {
      case 'board': goPhone('customers'); break;
      case 'desk':
        if (c.working) onWork();
        else { toast('Take a customer’s car in first: the board is on the left wall.'); goPhone('customers'); }
        break;
      case 'tune': {
        const lift = c.lifts[e.bay];
        if (!lift) break;
        if (c.working !== lift.jobId) update({ ...c, working: lift.jobId });
        onWork();
        break;
      }
      case 'dyno':
        if (c.working) (onDyno ?? onWork)();
        else toast('Put a car on the bay first: walk up to one and open the laptop.');
        break;
      case 'inspect': {
        const lift = c.lifts[e.bay];
        if (lift && e.open) setSheet({ type: 'inspect', jobId: lift.jobId, facts: inspectCar(lift.car.build) });
        else setSheet(null);
        break;
      }
      case 'drive': startDrive(e.bay); break;
      case 'parkCar': {
        if (!w?.drive) break;
        const id = w.drive.id;
        w.exitCar();
        w.dropCar();
        w.away.delete(id);
        setOutJob(null);
        silenceDriveSound();
        travel('garage', { from: 'town' });
        toast('Back on its lift.', 'ok');
        break;
      }
      case 'locker': goPhone('wardrobe'); break;
      case 'bell': setSheet({ type: 'close' }); break;
      case 'coffee': setSheet({ type: 'tip', tip: tipFor(c.day * 7 + c.history.length) }); break;
      case 'dog': toast('Torque wags his whole back end. Good boy.', 'ok'); break;
      case 'trophies': setSheet({ type: 'trophies' }); break;
      case 'door': travel('town', { from: 'garage' }); break;
      case 'go':
        if (e.place === 'town') travel('town', { from: e.from ?? 'garage' });
        else if (e.place === 'garage') travel('garage', { from: 'town' });
        else if (e.place === 'strip') toast('The strip opens in the next update.', 'warn');
        else if (LEVELS[e.place]) travel(e.place, {});
        break;
      case 'shop':
        if (e.place === 'supply') goPhone('upgrades');
        else if (e.place === 'academy') goPhone('training');
        else if (e.place === 'boutique') goPhone('wardrobe');
        else if (e.place === 'diner') setSheet({ type: 'tip', tip: tipFor(c.day * 13 + c.history.length * 3 + c.rep), diner: true });
        else if (e.place === 'dealer') setSheet({ type: 'soon', title: 'Caribou Motors', text: 'Rita is still unpacking the first cars. The showroom opens in the next update.' });
        break;
      case 'found': {
        const r = findSpanner(c, e.n);
        if (r) { update(r.career); toast(r.text, 'ok'); }
        break;
      }
      case 'pump': setSheet({ type: 'pump' }); break;
      case 'meet': setSheet({ type: 'soon', title: 'Car meet', text: 'The crowd is gathering. The meet opens in the next update.' }); break;
      case 'bench': toast(BENCH_LINES[(c.day + c.history.length) % BENCH_LINES.length]); break;
      default: break;
    }
  }, [goPhone, onDyno, onWork, startDrive, toast, travel, update]);

  const onEvent = useCallback((e) => {
    if (e.type === 'prompt') setPrompt(e.prompt);
    else if (e.type === 'labels') setLabels(e.labels.filter((l) => !l.gone));
    else if (e.type === 'act') onAct(e);
    else if (e.type === 'toast') toast(e.text, e.tone);
    else if (e.type === 'level') setPlace(e.id);
    else if (e.type === 'drive') setDriving(e.on);
    else if (e.type === 'bump') { if (e.force > 5) toast('Easy! That cost you a bumper’s worth of pride.', 'warn'); }
    else if (e.type === 'menu') setDrawer((d) => (d ? null : 'today'));
    else if (e.type === 'map') setSheet((s) => (s?.type === 'map' ? null : { type: 'map' }));
    else if (e.type === 'photo') {
      worldRef.current?.snapshot().then((blob) => {
        if (!blob) return;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `ecu-lab-shop-day-${careerRef.current.day}.png`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        toast('Photo saved.', 'ok');
      });
    }
  }, [onAct, toast]);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  // The world: made once, torn down with the screen.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const w = createWorld({
      canvas, preserve, quality: settingsRef.current.quality,
      onEvent: (e) => onEventRef.current(e),
      getCareer: () => careerRef.current,
      getLook: () => ({ ...(careerRef.current.look ?? {}) }),
      levels: LEVELS,
    });
    worldRef.current = w;
    if (window.__ECU_E2E__) window.__ecuWorld = w;
    w.loadLevel('garage', lastSpot ? { from: 'work', at: lastSpot } : { from: 'start' });
    setWorld(w);
    return () => {
      if (w.level?.id === 'garage') lastSpot = { x: w.player.x, z: w.player.z, yaw: w.player.yaw };
      silenceDriveSound();
      w.dispose();
      worldRef.current = null;
      setWorld(null);
    };
    // The world is created once; settings are applied by their own effects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { world?.setQuality(settings.quality); saveSettings(settings); }, [world, settings]);
  useEffect(() => { world?.setPaused(!!drawer || !!sheet); }, [world, drawer, sheet]);
  useEffect(() => { world?.sync(career); }, [world, career]);
  useEffect(() => { world?.setLook(career.look ?? {}); }, [world, career.look]);
  // The wardrobe frames the tuner; everything else puts the camera back.
  useEffect(() => { world?.showcase(drawer === 'wardrobe'); }, [world, drawer]);
  useEffect(() => {
    const el = drawerRef.current;
    const measure = () => world?.setPanel(drawer && el ? el.getBoundingClientRect().width / Math.max(1, window.innerWidth) : 0);
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [world, drawer]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { setDrawer(null); setSheet(null); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // The car's sound, while you drive it.
  useEffect(() => {
    if (!world || !driving) { silenceDriveSound(); return undefined; }
    const mem = { gear: 0 };
    let raf = 0;
    const loop = () => {
      const d = world.drive;
      if (d?.inside && d.setup) driveSoundFrame(d.setup, world.tele, { on: settingsRef.current.sound && !drawer && !sheet, volume: 0.8 }, mem);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); silenceDriveSound(); };
  }, [world, driving, drawer, sheet]);

  const tier = repTier(career.rep);
  const waitingUnseen = career.last && career.last.seq !== career.lastSeen;
  const where = place === 'garage' ? 'Your shop' : place === 'town' ? 'Town' : placeById(place)?.name ?? place;
  const objective = useMemo(() => {
    if (!settings.hints) return null;
    if (driving) return 'Feel what your tune did. When you are done, drive to the shop and park it.';
    if (outJob) return 'The customer’s car is parked outside: walk to it and press E, or drive it back to the shop.';
    if (career.last && career.last.seq !== career.lastSeen) return 'Read what the customer said: open the phone, then TODAY.';
    if (place !== 'garage' && place !== 'town') return null;
    if (career.lifts.length === 0) return place === 'garage' ? 'Walk to the board on the left wall and take a customer’s car.' : 'Head back to your shop on the north side of the main street.';
    if (!career.working) return 'Walk up to the car and open the laptop to start work.';
    return 'Open the laptop at the desk (or at the car) and work out what is wrong.';
  }, [career.last, career.lastSeen, career.lifts.length, career.working, settings.hints, driving, outJob, place]);

  const takeJob = (id) => {
    const job = jobById(id);
    if (worldRef.current) worldRef.current.arrivals.add(id);
    update(accept(career, id));
    toast(`${job.customer.name} is pulling in.`, 'ok');
    setDrawer(null);
  };

  const closeDrawer = () => setDrawer(null);
  const tabInfo = TABS.find((t) => t.id === drawer);
  const gated = tabInfo?.at && place !== tabInfo.at;

  return (
    <div className={styles.root} data-testid="career-world">
      <div className={styles.canvasWrap}>
        <canvas ref={canvasRef} className={styles.canvas} aria-label="Your shop and the town, in 3D. Walk with the arrow keys or WASD, press E to use what is in reach." role="img" />
      </div>
      <div className={styles.fade} data-on={fade ? 'true' : 'false'} aria-hidden="true" />

      <TopBar
        career={career} tierTitle={tier.title} where={where}
        onPhone={() => (drawer ? closeDrawer() : goPhone('today'))}
        onMap={() => setSheet((s) => (s?.type === 'map' ? null : { type: 'map' }))}
        onPhoto={() => world?.input.press('photo')}
        onSettings={() => setSheet((s) => (s?.type === 'settings' ? null : { type: 'settings' }))}
        onMenu={onMenu}
      />
      <Objective text={objective} />
      <Labels labels={labels} />
      <Toasts toasts={toasts} />
      {!drawer && !sheet && <PromptButton prompt={prompt} onUse={() => world?.interact()} />}
      {driving && <Dash world={world} units={settings.units} />}
      {touch && !drawer && !sheet && <TouchControls world={world} driving={driving} />}

      <aside ref={drawerRef} className={styles.drawer} data-open={drawer ? 'true' : 'false'} aria-hidden={drawer ? undefined : 'true'} aria-label="Phone">
        <div className={styles.drawerHead}>
          <h2 className={styles.drawerTitle}>{tabInfo?.label ?? 'PHONE'}</h2>
          <Button size="sm" variant="ghost" onClick={closeDrawer} aria-label="Close"><X size={14} aria-hidden="true" /></Button>
        </div>
        <nav className={styles.drawerTabs} aria-label="Shop">
          {TABS.map((t) => (
            <button key={t.id} type="button" className={styles.drawerTab} aria-current={drawer === t.id ? 'page' : undefined} onClick={() => setDrawer(t.id)}>
              <t.icon size={14} aria-hidden="true" /><span>{t.label}</span>
              {t.id === 'today' && waitingUnseen && <span className={styles.badge}>1</span>}
            </button>
          ))}
        </nav>
        <div className={styles.drawerBody}>
          {gated ? (
            <div className={styles.gate}>
              <MapPin size={22} aria-hidden="true" />
              <h3>{tabInfo.at === 'garage' ? 'The board is at your shop' : `Go to ${placeById(tabInfo.at).name}`}</h3>
              <p>{placeById(tabInfo.at).blurb} {placeById(tabInfo.at).learn}</p>
              <Button size="sm" onClick={() => fastTravel(tabInfo.at)}>TRAVEL THERE</Button>
            </div>
          ) : drawer === 'wardrobe' ? (
            <WardrobePanel career={career} update={update} canBuy={place === 'boutique'} onGo={() => fastTravel('boutique')} />
          ) : drawer ? (
            <ShopPanel
              variant="drawer" tab={drawer} career={career} update={update}
              onWork={() => { closeDrawer(); onWork(); }} setTab={(t) => setDrawer(t)} takeJob={takeJob}
              setLesson={setLesson} confirmReset={confirmReset} setConfirmReset={setConfirmReset} unseen={!!waitingUnseen}
            />
          ) : null}
        </div>
      </aside>
      <LessonDialog lesson={lesson} onClose={() => setLesson(null)} onLearn={onLearn} />

      {sheet && (
        <Sheet
          sheet={sheet} career={career} settings={settings} setSettings={setSettings} onClose={() => setSheet(null)}
          onTravel={fastTravel} place={place}
          onNextDay={() => { update(nextDay(career)); setSheet(null); toast('A new day. Customers are on the board.', 'ok'); }}
        />
      )}

      <div className={styles.rotate} data-dismissed={dismissedRotate ? 'true' : 'false'}>
        <div className={styles.rotateIcon} aria-hidden="true">📱</div>
        <h2 className={styles.sheetTitle}>Turn your phone sideways</h2>
        <p className={styles.lede}>The shop is built for a landscape screen: walking on the left, buttons on the right.</p>
        <Button variant="ghost" size="sm" onClick={() => setDismissedRotate(true)}>PLAY ANYWAY</Button>
      </div>
    </div>
  );
}

/**
 * Cards that fill the middle of the screen: the car's spec sheet, closing up, the
 * trophies, the map and the settings.
 */
function Sheet({ sheet, career, settings, setSettings, onClose, onNextDay, onTravel, place }) {
  if (sheet.type === 'inspect') {
    const job = jobById(sheet.jobId);
    return (
      <div className={styles.sheet} role="dialog" aria-label="Under the bonnet">
        <div className={styles.sheetTag}>UNDER THE BONNET · {job.customer.car}</div>
        <p className={styles.lede}>You lift the bonnet and write down what is fitted. A fact is not a diagnosis: work out what each one does to the air and the fuel.</p>
        <dl className={styles.facts}>
          {sheet.facts.map((f) => (<React.Fragment key={f.label}><dt>{f.label}</dt><dd data-tone={f.tone}>{f.value}</dd></React.Fragment>))}
        </dl>
        <div className={styles.sheetRow}><Button size="sm" onClick={onClose}>GOT IT</Button></div>
      </div>
    );
  }
  if (sheet.type === 'close') {
    return (
      <div className={styles.sheet} role="dialog" aria-label="Close up">
        <div className={styles.sheetTag}>DAY {career.day} · CLOSING UP</div>
        <h2 className={styles.sheetTitle}>Open tomorrow?</h2>
        <p className={styles.lede}>New customers come in every day, and the better your reputation, the bigger their jobs. Cars on the lifts wait overnight. Opening costs the running costs of ${overhead(career).toLocaleString('en-US')}: rent, and what the shop has grown into.</p>
        <div className={styles.sheetRow}>
          <Button size="sm" onClick={onNextDay}>OPEN TOMORROW</Button>
          <Button size="sm" variant="ghost" onClick={onClose}>NOT YET</Button>
        </div>
      </div>
    );
  }
  if (sheet.type === 'tip') {
    return (
      <div className={styles.sheet} role="dialog" aria-label="A tip from Pops">
        <div className={styles.sheetTag}>POPS · {sheet.tip.topic.toUpperCase()}</div>
        <p className={styles.lede}>&ldquo;{sheet.tip.text}&rdquo;</p>
        <div className={styles.sheetRow}><Button size="sm" onClick={onClose}>THANKS, POPS</Button></div>
      </div>
    );
  }
  if (sheet.type === 'trophies') {
    return (
      <div className={styles.sheet} role="dialog" aria-label="Trophies">
        <div className={styles.sheetTag}>TROPHIES · {career.milestones.length}</div>
        <p className={styles.lede}>Each cup on the shelf is a milestone: a first customer paid, the first dyno, a boosted car handed back well.</p>
        <div className={styles.sheetRow}><Button size="sm" onClick={onClose}>NICE</Button></div>
      </div>
    );
  }
  if (sheet.type === 'pump') {
    return (
      <div className={styles.sheet} role="dialog" aria-label="Fuel">
        <div className={styles.sheetTag}>FUEL STOP</div>
        <h2 className={styles.sheetTitle}>Not your tank to fill</h2>
        <p className={styles.lede}>This is a customer&rsquo;s car, and the fuel in it is part of the job: octane is knock resistance, and a car running on the wrong grade is a car running on a tune it was not made for. Your own cars can be filled with any grade here once you have one.</p>
        <div className={styles.sheetRow}><Button size="sm" onClick={onClose}>OK</Button></div>
      </div>
    );
  }
  if (sheet.type === 'soon') {
    return (
      <div className={styles.sheet} role="dialog" aria-label={sheet.title}>
        <div className={styles.sheetTag}>{sheet.title.toUpperCase()}</div>
        <p className={styles.lede}>{sheet.text}</p>
        <div className={styles.sheetRow}><Button size="sm" onClick={onClose}>OK</Button></div>
      </div>
    );
  }
  if (sheet.type === 'settings') {
    const set = (patch) => setSettings({ ...settings, ...patch });
    return (
      <div className={styles.sheet} role="dialog" aria-label="Settings">
        <div className={styles.sheetTag}>SETTINGS</div>
        <div className={styles.sheetRow}>
          <span className={styles.lede}>Pixel size</span>
          {['chunky', 'normal', 'fine'].map((q) => <Button key={q} size="sm" variant={settings.quality === q ? 'primary' : 'ghost'} onClick={() => set({ quality: q })}>{q.toUpperCase()}</Button>)}
        </div>
        <div className={styles.sheetRow}>
          <span className={styles.lede}>Units</span>
          {['mph', 'kph'].map((u) => <Button key={u} size="sm" variant={settings.units === u ? 'primary' : 'ghost'} onClick={() => set({ units: u })}>{u.toUpperCase()}</Button>)}
        </div>
        <div className={styles.sheetRow}>
          <span className={styles.lede}>Engine sound</span>
          <Button size="sm" variant={settings.sound ? 'primary' : 'ghost'} onClick={() => set({ sound: !settings.sound })}>{settings.sound ? <><Check size={13} aria-hidden="true" /> ON</> : 'OFF'}</Button>
        </div>
        <div className={styles.sheetRow}>
          <span className={styles.lede}>Touch controls</span>
          {['auto', 'on', 'off'].map((u) => <Button key={u} size="sm" variant={settings.touch === u ? 'primary' : 'ghost'} onClick={() => set({ touch: u })}>{u.toUpperCase()}</Button>)}
        </div>
        <div className={styles.sheetRow}>
          <span className={styles.lede}>Hints</span>
          <Button size="sm" variant={settings.hints ? 'primary' : 'ghost'} onClick={() => set({ hints: !settings.hints })}>{settings.hints ? <><Check size={13} aria-hidden="true" /> ON</> : 'OFF'}</Button>
        </div>
        <p className={styles.lede}>Keys: WASD or arrows to walk, SHIFT to run, E to use, Q and R to turn the view, P for a photo. Driving: W/S gas and brake, A/D steer, SPACE handbrake, Z/X shift, L lights, BACKSPACE to straighten up.</p>
        <div className={styles.sheetRow}><Button size="sm" onClick={onClose}>DONE</Button></div>
      </div>
    );
  }
  if (sheet.type === 'map') {
    const open = openPlaces(career);
    return (
      <div className={styles.sheet} role="dialog" aria-label="Map">
        <div className={styles.sheetTag}>MAP · {open.length} of {PLACES.length} places open</div>
        <ul className={styles.places}>
          {PLACES.map((p) => {
            const why = closedBecause(career, p);
            return (
              <li key={p.id} data-closed={why ? 'true' : 'false'} data-here={place === p.id ? 'true' : 'false'}>
                <div>
                  <b>{p.name}</b>
                  <span>{why ?? p.blurb}</span>
                </div>
                <Button size="sm" variant="ghost" disabled={!!why || place === p.id} onClick={() => { onClose(); onTravel(p.id); }}>{place === p.id ? 'HERE' : 'GO'}</Button>
              </li>
            );
          })}
        </ul>
        <p className={styles.lede}>Golden spanners found: {(career.found ?? []).length} of {SPANNER_COUNT}. They are lying about the town somewhere.</p>
        <div className={styles.sheetRow}><Button size="sm" onClick={onClose}>CLOSE</Button></div>
      </div>
    );
  }
  return null;
}
