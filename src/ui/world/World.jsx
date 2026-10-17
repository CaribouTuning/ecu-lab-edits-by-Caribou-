/**
 * The career's 3-D world, as a React screen.
 *
 * Owns the canvas and the runtime, turns the runtime's events (a prompt in reach, a
 * button pressed, a place entered) into panels and toasts, and puts the shop's save in
 * and out of the scene. Everything about money and customers stays in the career
 * functions: the world only asks for them.
 */

import { BookOpen, Car, Check, ClipboardList, Cog, Hammer, MapPin, Paintbrush, Shirt, Users, Wallet, X } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { repTier } from '../career/catalog.js';
import { ACHIEVEMENTS, collect } from '../career/achievements.js';
import { findSpanner, SPANNER_COUNT } from '../career/collectibles.js';
import { bump, claim, claimed, goalsFor, progressOf } from '../career/daily.js';
import { DIG_COST, PILES, cannotDig, digsLeft, dig } from '../career/junk.js';
import { inspectCar } from '../career/inspect.js';
import { jobById } from '../career/jobs.js';
import { accept, advancePhase, nextDay, overhead } from '../career/shop.js';
import { lookOf } from '../career/wardrobe.js';
import { computeTuningScore } from '../../sim/index.js';
import { FUELS, cannotFill, carState, ownJobId, refuel } from '../career/ownedCars.js';
import { cannotEnter, entrants, judge, placing, settleMeet } from '../career/meet.js';
import { RIVALS, cannotRace, decide, playerReaction, rivalById, rivalState, settleRace, sliptalk } from '../career/races.js';
import { LessonDialog, ShopPanel } from '../career/ShopPanels.jsx';
import { Button } from '../primitives/Button.jsx';
import { world as W } from '../tokens.js';

import { driveSoundFrame, silenceDriveSound } from './driveSound.js';
import { CarsPanel } from './CarsPanel.jsx';
import { DecorPanel } from './DecorPanel.jsx';
import { Dash, Dialogue, Labels, Objective, PromptButton, Toasts, TopBar, TouchControls } from './Hud.jsx';
import { engineBayOf } from './models/car.js';
import { bodyFor, carFor, specForJob } from './levels/common.js';
import { buildGarage } from './levels/garage.js';
import { INTERIORS } from './levels/interior.js';
import { buildStrip } from './levels/strip.js';
import { buildTown } from './levels/town.js';
import { PLACES, closedBecause, placeById } from './locations.js';
import { createWorld } from './runtime.js';
import { loadSettings, saveSettings } from './settings.js';
import { sfx, toastSound } from './sfx.js';
import { tipFor } from './tips.js';
import { driveSetup } from './vehicle.js';
import { PartsPanel } from './PartsPanel.jsx';
import { WardrobePanel } from './WardrobePanel.jsx';
import styles from './World.module.css';

const LEVELS = { garage: buildGarage, town: buildTown, strip: buildStrip, ...INTERIORS };

const TABS = [
  { id: 'today', label: 'TODAY', icon: ClipboardList, at: null },
  { id: 'customers', label: 'CUSTOMERS', icon: Users, at: 'garage' },
  { id: 'upgrades', label: 'UPGRADES', icon: Hammer, at: 'supply' },
  { id: 'training', label: 'TRAINING', icon: BookOpen, at: 'academy' },
  { id: 'cars', label: 'CARS', icon: Car, at: null },
  { id: 'parts', label: 'PARTS', icon: Cog, at: null },
  { id: 'wardrobe', label: 'WARDROBE', icon: Shirt, at: null },
  { id: 'decor', label: 'SHOP DECOR', icon: Paintbrush, at: null },
  { id: 'books', label: 'BOOKS', icon: Wallet, at: null },
];

/** The text box's colours, from the world palette, for the stylesheet. */
const TALK_VARS = /** @type {React.CSSProperties} */ ({
  '--talk-paper': W.talk.paper, '--talk-ink': W.talk.ink, '--talk-frame': W.talk.frame,
  '--talk-frame-hi': W.talk.frameHi, '--talk-name': W.talk.name, '--talk-choice': W.talk.choice,
});

/**
 * Who stands behind each counter, what they say when you walk up, and the answer that
 * opens the counter. Every line is something true about the trade.
 * @type {Record<string, {yes: string, lines: (c: any) => import('./Hud.jsx').TalkLine[]}>}
 */
const CLERKS = {
  supply: {
    yes: 'SHOW ME',
    lines: (c) => [
      { who: 'Gus', text: c.rep < 10 ? 'New shop on Main Street, huh? Welcome. Lifts, a dyno, a wideband: tools first, then the clever stuff.' : 'Back again. Kit is restocked.' },
      { who: 'Gus', text: 'A tuner is only as good as what they can measure. A wideband reads the real air-fuel ratio. Guessing does not.' },
    ],
  },
  academy: {
    yes: 'ENROL',
    lines: () => [
      { who: 'Prof. Okoye', text: 'Every course here is one page of a real engine computer: fuel, spark, boost, protection.' },
      { who: 'Prof. Okoye', text: 'Learn why a cell does what it does, and the car will tell you the rest on the dyno.' },
    ],
  },
  boutique: {
    yes: 'BROWSE',
    lines: () => [{ who: 'Mina', text: 'Welcome to Threads! Nothing here adds a single horsepower. It does win car meets.' }],
  },
  diner: {
    yes: 'TODAY\u2019S GOALS',
    lines: (c) => {
      const tip = tipFor(c.day * 13 + c.history.length * 3 + c.rep);
      return [{ who: 'Pops', text: 'Sit down, kid. Coffee is on me.' }, { who: `Pops \u00b7 ${tip.topic}`, text: tip.text }];
    },
  },
  dealer: {
    yes: 'SEE THE CARS',
    lines: () => [{ who: 'Rita', text: 'Every car on this lot is a real engine with real numbers. Pick one you want to learn, not just one that is fast.' }],
  },
  strip: {
    yes: 'RACE',
    lines: () => [{ who: 'Marshal', text: 'Quarter mile, two lanes, one tree. Launch, gearing and grip decide it, not just power. Want to run?' }],
  },
};

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
 * @param {() => void} [props.onFlat] fall back to the flat shop (no WebGL, or the user asked)
 * @param {boolean} [props.preserve] keep the drawing buffer (screenshots in tests)
 */
export default function World({ career, update, onWork, onDyno, onMenu, onLearn, onFlat, preserve = false }) {
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
  /** A conversation in the text box: lines, and what to do when it ends. */
  const [talk, setTalk] = useState(/** @type {{lines: import('./Hud.jsx').TalkLine[], onDone?: () => void}|null} */ (null));
  const talkRef = useRef(talk);
  talkRef.current = talk;
  const endTalk = useCallback(() => { const t = talkRef.current; setTalk(null); t?.onDone?.(); }, []);
  /** Say something in the text box. @param {import('./Hud.jsx').TalkLine[]} lines @param {() => void} [onDone] */
  const say = useCallback((lines, onDone) => { setSheet(null); setDrawer(null); setTalk({ lines, onDone }); }, []);
  const [driving, setDriving] = useState(false);
  const [place, setPlace] = useState('garage');
  const [outJob, setOutJob] = useState(/** @type {string|null} */ (null));
  const [focusCar, setFocusCar] = useState(/** @type {string|null} */ (null));
  const [racing, setRacing] = useState(false);
  const [lesson, setLesson] = useState(/** @type {string|null} */ (null));
  const [confirmReset, setConfirmReset] = useState(false);
  const [touch, setTouch] = useState(false);
  const [fade, setFade] = useState(false);
  const [dismissedRotate, setDismissedRotate] = useState(false);
  const toastId = useRef(0);
  const drawerRef = useRef(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // Test hook: a browser test can read and change the save.
  useEffect(() => { if (window.__ECU_E2E__) { window.__ecuUpdate = update; window.__ecuCareer = career; } });

  const toast = useCallback((text, tone) => {
    const id = (toastId.current += 1);
    setToasts((t) => [...t.slice(-2), { id, text, tone }]);
    sfx(toastSound(tone), settingsRef.current.sound);
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
    else if (INTERIORS[id] || id === 'strip') travel(id, {});
    else travel('town', { from: id });
  }, [toast, travel]);

  /** Take a car out for a drive: a customer's from its lift, or one of your own from the apron. @param {{bay?: number, ownId?: string}} what */
  const startDrive = useCallback((what) => {
    const w = worldRef.current;
    const c = careerRef.current;
    const lift = what.ownId ? null : c.lifts[what.bay ?? 0];
    const ownId = what.ownId;
    if (!w || (!lift && !ownId)) return;
    toast('Warming it up\u2026');
    setTimeout(() => {
      const jobId = ownId ? ownJobId(ownId) : lift.jobId;
      const job = jobById(jobId);
      const state = ownId ? carState(c, ownId) : lift.car;
      if (!job || !state) return;
      const own = ownId ? c.cars.find((x) => x.id === ownId) : null;
      const setup = driveSetup(state, { body: bodyFor(job), drag: own ? { ...own.drag, lowered: own.look.lowered } : { lowered: 0.3 } });
      const rig = carFor({ ...specForJob(job, state.build), ...(own ? {} : { lowered: 0.3 }) });
      w.away.add(jobId);
      setOutJob(jobId);
      w.setCar({ rig, pt: setup.pt, setup, boostAt: setup.boostAt, hpAt: setup.hpAt, x: -37, z: -2.4, heading: Math.PI / 2, id: jobId, name: job.customer.car });
      travel('town', { from: 'garage', car: { x: -37, z: -2.4, heading: Math.PI / 2 }, enterCar: true });
    }, 60);
  }, [toast, travel]);

  /** Run a race: measure both cars on the simulator, replay both runs on the strip, then settle up. */
  const startRace = useCallback((rivalId, carId) => {
    const w = worldRef.current;
    const c = careerRef.current;
    const rival = rivalById(rivalId);
    const why = rival && cannotRace(c, rival, carId);
    if (!w || !rival || why) { if (why) toast(why, 'warn'); return; }
    setSheet(null);
    toast('Staging\u2026');
    setTimeout(() => {
      const own = c.cars.find((x) => x.id === carId);
      const state = carState(c, carId);
      const job = jobById(ownJobId(carId));
      const psetup = driveSetup(state, { body: bodyFor(job), drag: { ...own.drag, lowered: own.look.lowered } });
      const prun = psetup.strip();
      const rstate = rivalState(rival);
      const rsetup = driveSetup(rstate, { body: rival.body, drag: rival.drag });
      const rrun = rsetup.strip();
      const prt = playerReaction(c.seed, c.day);
      const res = decide(prun, rrun, { playerRt: prt, rivalRt: rival.rt });
      const prig = carFor({ ...specForJob(job, state.build), lowered: own.look.lowered });
      const rrig = carFor({ body: rival.body, color: rival.color, wheels: 'mesh', plate: rival.name.slice(0, 7).toUpperCase(), engine: engineBayOf(rstate.build) });
      w.cmd('race', {
        player: { rig: prig, run: prun, rt: prt, setup: psetup },
        rival: { rig: rrig, run: rrun, rt: rival.rt },
        onDone: () => {
          let after = settleRace(careerRef.current, rival, carId, { won: res.won, et: prun.et });
          if (res.won) after = bump(after, 'race');
          update(after);
          setSheet({ type: 'raceResult', rival, own, res, prun, rrun, prt, paid: after.money - c.money, repGain: after.rep - c.rep, talk: sliptalk(prun, own.drag, psetup.car.gearCount) });
        },
      });
    }, 80);
  }, [toast, update]);

  /** Show a car at the meet: measure it, put it on the turntable, and let the crowd judge. */
  const startMeet = useCallback((carId) => {
    const w = worldRef.current;
    const c = careerRef.current;
    const why = cannotEnter(c, carId);
    if (!w || why) { if (why) toast(why, 'warn'); return; }
    setSheet(null);
    toast('Rolling it onto the turntable\u2026');
    setTimeout(() => {
      const own = c.cars.find((x) => x.id === carId);
      const state = carState(c, carId);
      const job = jobById(ownJobId(carId));
      const setup = driveSetup(state, { body: bodyFor(job), drag: { ...own.drag, lowered: own.look.lowered } });
      const wear = setup.result.wear ?? {};
      const health = Math.max(0, 100 - Math.max(wear.piston ?? 0, wear.bearing ?? 0, wear.valve ?? 0));
      const score = judge({ peakHp: setup.peakHp, massKg: setup.car.massKg, tuningScore: computeTuningScore(setup.result).score, health }, own.look, lookOf(c));
      const others = entrants(c);
      const place = placing(score.total, others);
      const rig = carFor({ ...specForJob(job, state.build), lowered: own.look.lowered });
      w.cmd('present', rig);
      setTimeout(() => {
        update(place.place <= 3 ? bump(settleMeet(careerRef.current, place), 'meet') : settleMeet(careerRef.current, place));
        setSheet({ type: 'meetResult', own, score, others, place });
      }, 3200);
    }, 80);
  }, [toast, update]);

  /** The person behind a counter says hello, then the counter opens. @param {string} id */
  const greet = useCallback((id) => {
    const c = careerRef.current;
    const open = {
      supply: () => goPhone('upgrades'),
      academy: () => goPhone('training'),
      boutique: () => goPhone('wardrobe'),
      diner: () => { update(bump(careerRef.current, 'tip')); setSheet({ type: 'diner' }); },
      dealer: () => { setFocusCar(null); goPhone('cars'); },
      strip: () => setSheet({ type: 'race' }),
    }[id];
    const clerk = CLERKS[id];
    if (!open) return;
    if (!clerk) { open(); return; }
    const lines = clerk.lines(c);
    const last = lines[lines.length - 1];
    say([...lines.slice(0, -1), { ...last, choices: [{ label: clerk.yes, run: () => { setTalk(null); open(); } }, { label: 'NOT NOW', run: () => setTalk(null) }] }]);
  }, [goPhone, say, update]);

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
      case 'drive': startDrive({ bay: e.bay }); break;
      case 'ownCar': setFocusCar(e.car); goPhone('cars'); break;
      case 'parkCar': {
        if (!w?.drive) break;
        const id = w.drive.id;
        const km = (w.drive.state.odo ?? 0) / 1000;
        if (km > 0.05) update(bump(c, 'drive', km));
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
      case 'coffee': {
        update(bump(c, 'tip'));
        const tip = tipFor(c.day * 7 + c.history.length);
        say([{ text: 'You pour a coffee. Pops left a note taped to the machine.' }, { who: `Pops \u00b7 ${tip.topic}`, text: tip.text }]);
        break;
      }
      case 'dog': say([{ who: 'Torque', text: 'Woof!' }, { text: 'Torque wags his whole back end. He has never once asked about boost.' }]); break;
      case 'trophies': setSheet({ type: 'trophies' }); break;
      case 'door': travel('town', { from: 'garage' }); break;
      case 'go':
        if (e.place === 'town') travel('town', { from: e.from ?? 'garage' });
        else if (e.place === 'junk') setSheet({ type: 'junk', result: null });
        else if (e.place === 'garage') travel('garage', { from: 'town' });
        else if (LEVELS[e.place]) travel(e.place, {});
        break;
      case 'shop':
        greet(e.place);
        break;
      case 'found': {
        const r = findSpanner(c, e.n);
        if (r) { update(bump(r.career, 'spanner')); toast(r.text, 'ok'); }
        break;
      }
      case 'pump': setSheet({ type: 'pump', carId: w?.drive?.id?.startsWith('own:') ? w.drive.id.slice(4) : null }); break;
      case 'meet': setSheet({ type: 'meet' }); break;
      case 'bench': say([{ text: BENCH_LINES[(c.day + c.history.length) % BENCH_LINES.length] }]); break;
      default: break;
    }
  }, [goPhone, greet, onDyno, onWork, say, startDrive, toast, travel, update]);

  const onEvent = useCallback((e) => {
    if (e.type === 'prompt') setPrompt(e.prompt);
    else if (e.type === 'labels') setLabels(e.labels.filter((l) => !l.gone));
    else if (e.type === 'act') onAct(e);
    else if (e.type === 'talk') say(e.lines, e.onDone);
    else if (e.type === 'toast') toast(e.text, e.tone);
    else if (e.type === 'level') setPlace(e.id);
    else if (e.type === 'drive') setDriving(e.on);
    else if (e.type === 'race') setRacing(e.on);
    else if (e.type === 'bump') { if (e.force > 5) toast('Easy! That cost you a bumper’s worth of pride.', 'warn'); }
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
  }, [onAct, say, toast]);
  const onFlatRef = useRef(onFlat);
  onFlatRef.current = onFlat;
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  // The world: made once, torn down with the screen.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    /** @type {any} */
    let w;
    try {
      w = createWorld({
      canvas, preserve, quality: settingsRef.current.quality,
      onEvent: (e) => onEventRef.current(e),
      getCareer: () => careerRef.current,
      getLook: () => ({ ...(careerRef.current.look ?? {}) }),
      levels: LEVELS,
      });
    } catch {
      // No usable WebGL after all: fall back to the flat shop rather than a blank screen.
      onFlatRef.current?.();
      return undefined;
    }
    const lost = (/** @type {Event} */ ev) => { ev.preventDefault(); onFlatRef.current?.(); };
    canvas.addEventListener('webglcontextlost', lost);
    worldRef.current = w;
    if (window.__ECU_E2E__) window.__ecuWorld = w;
    w.loadLevel('garage', lastSpot ? { from: 'work', at: lastSpot } : { from: 'start' });
    setWorld(w);
    return () => {
      canvas.removeEventListener('webglcontextlost', lost);
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
  useEffect(() => { world?.setShake(settings.shake); }, [world, settings.shake]);
  useEffect(() => { world?.setPaused(!!drawer || !!sheet || !!talk); }, [world, drawer, sheet, talk]);
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
    // Escape is one key with one meaning: close whatever is open, or open the phone when
    // nothing is. (The runtime also reports it, but only this handler acts on it, so the two
    // never fight over the same press.)
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      const open = drawerRef.current?.dataset.open === 'true' || !!document.querySelector('[data-world-sheet]');
      if (talkRef.current) { endTalk(); return; }
      if (open) { setDrawer(null); setSheet(null); } else setDrawer('today');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [endTalk]);

  // Medals: noticed whenever the save changes, paid once.
  useEffect(() => {
    const { career: next, earned } = collect(career);
    if (!earned.length) return;
    update(next);
    for (const a of earned) toast(`Achievement: ${a.title}${a.reward ? ` (+$${a.reward})` : ''}`, 'ok');
  }, [career, toast, update]);
  // The welcome, once.
  useEffect(() => {
    if (!world || careerRef.current.introDone) return;
    setTalk({
      lines: INTRO.map((l) => ({ who: 'Pops', text: l.text })),
      onDone: () => { update({ ...careerRef.current, introDone: true }); },
    });
    // Once, when the world first opens on a new career.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world]);

  // The car's sound, while you drive it.
  useEffect(() => {
    if (!world || !(driving || racing)) { silenceDriveSound(); return undefined; }
    const mem = { gear: 0 };
    let raf = 0;
    const loop = () => {
      const d = world.drive;
      const on = settingsRef.current.sound && !drawer && !sheet;
      if (d?.inside && d.setup) driveSoundFrame(d.setup, world.tele, { on, volume: 0.8 }, mem);
      else if (world.raceTele) driveSoundFrame(world.raceTele.setup, world.raceTele, { on, volume: 0.9 }, mem);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); silenceDriveSound(); };
  }, [world, driving, racing, drawer, sheet]);

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
    <div className={styles.root} data-testid="career-world" style={TALK_VARS}>
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
      {talk && <Dialogue talk={talk} onDone={endTalk} sound={settings.sound} />}
      {!drawer && !sheet && !racing && <PromptButton prompt={prompt} onUse={() => world?.interact()} />}
      {(driving || racing) && <Dash world={world} units={settings.units} touch={touch} />}
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
          ) : drawer === 'cars' ? (
            <CarsPanel career={career} update={update} place={place} focus={focusCar} onDrive={(id) => { setDrawer(null); startDrive({ ownId: id }); }} onGo={fastTravel} onTab={setDrawer} />
          ) : drawer === 'parts' ? (
            <PartsPanel career={career} update={update} canBuy={place === 'supply'} onGo={() => fastTravel('supply')} />
          ) : drawer === 'decor' ? (
            <DecorPanel career={career} update={update} canBuy={place === 'supply'} onGo={() => fastTravel('supply')} />
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
          onFlat={onFlat} sheet={sheet} career={career} settings={settings} setSettings={setSettings} onClose={() => { if (sheet.type === 'raceResult') worldRef.current?.cmd('endRace'); if (sheet.type === 'meetResult') worldRef.current?.cmd('endPresent'); setSheet(null); }}
          onTravel={fastTravel} place={place} update={update} onRace={startRace} onMeet={startMeet} onWait={() => { update(advancePhase(career)); setSheet(null); toast('A few hours pass.'); }}
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
function Sheet({ onFlat, sheet, career, settings, setSettings, onClose, onNextDay, onTravel, place, update, onRace, onMeet, onWait }) {
  if (sheet.type === 'inspect') {
    const job = jobById(sheet.jobId);
    return (
      <div className={styles.sheet} data-world-sheet="" role="dialog" aria-label="Under the bonnet">
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
      <div className={styles.sheet} data-world-sheet="" role="dialog" aria-label="Close up">
        <div className={styles.sheetTag}>DAY {career.day} · CLOSING UP</div>
        <h2 className={styles.sheetTitle}>Open tomorrow?</h2>
        <p className={styles.lede}>New customers come in every day, and the better your reputation, the bigger their jobs. Cars on the lifts wait overnight. Opening costs the running costs of ${overhead(career).toLocaleString('en-US')}: rent, and what the shop has grown into.</p>
        <div className={styles.sheetRow}>
          <Button size="sm" onClick={onNextDay}>OPEN TOMORROW</Button>
          {(career.phase ?? 0) < 3 && <Button size="sm" variant="ghost" onClick={onWait}>WAIT A FEW HOURS</Button>}
          <Button size="sm" variant="ghost" onClick={onClose}>NOT YET</Button>
        </div>
        <p className={styles.lede}>{['It is morning.', 'It is afternoon.', 'It is evening: the car meet is on.', 'It is night.'][Math.min(3, career.phase ?? 0)]} Handing a car back moves the day along; so does waiting.</p>
      </div>
    );
  }
  if (sheet.type === 'trophies') {
    const have = new Set(career.ach ?? []);
    return (
      <div className={styles.sheet} data-world-sheet="" role="dialog" aria-label="Trophies">
        <div className={styles.sheetTag}>TROPHIES · {career.milestones.length} milestones · {have.size} of {ACHIEVEMENTS.length} medals</div>
        <ul className={styles.places}>
          {ACHIEVEMENTS.map((a) => (
            <li key={a.id} data-closed={have.has(a.id) ? 'false' : 'true'}>
              <div><b>{have.has(a.id) ? '\u2605' : '\u2606'} {a.title}</b><span>{a.text}{a.reward ? ` $${a.reward}` : ''}</span></div>
            </li>
          ))}
        </ul>
        <div className={styles.sheetRow}><Button size="sm" onClick={onClose}>NICE</Button></div>
      </div>
    );
  }
  if (sheet.type === 'pump') {
    if (!sheet.carId) {
      return (
        <div className={styles.sheet} data-world-sheet="" role="dialog" aria-label="Fuel">
          <div className={styles.sheetTag}>FUEL STOP</div>
          <h2 className={styles.sheetTitle}>Not your tank to fill</h2>
          <p className={styles.lede}>This is a customer&rsquo;s car, and the fuel in it is part of the job: octane is knock resistance, and a car running on the wrong grade is a car running on a tune it was not made for. Your own cars can be filled with any grade here.</p>
          <div className={styles.sheetRow}><Button size="sm" onClick={onClose}>OK</Button></div>
        </div>
      );
    }
    const st = carState(career, sheet.carId);
    const car = career.cars.find((x) => x.id === sheet.carId);
    return (
      <div className={styles.sheet} data-world-sheet="" role="dialog" aria-label="Fuel">
        <div className={styles.sheetTag}>FUEL STOP · {car?.name}</div>
        <p className={styles.lede}>Pick what goes in the tank. The calibration does not change when the fuel does: a different grade moves the knock limit and the mixture the car wants, so retune after switching.</p>
        <ul className={styles.places}>
          {FUELS.map((f) => {
            const why = cannotFill(career, f.idx);
            const here = st?.build.octaneIdx === f.idx;
            return (
              <li key={f.idx} data-closed={why ? 'true' : 'false'} data-here={here ? 'true' : 'false'}>
                <div><b>{f.label} · ${f.price}</b><span>{why ?? f.note}</span></div>
                <Button size="sm" variant={here ? 'ghost' : 'primary'} disabled={!!why || here} onClick={() => update(refuel(career, sheet.carId, f.idx))}>{here ? 'IN THE TANK' : 'FILL'}</Button>
              </li>
            );
          })}
        </ul>
        <div className={styles.sheetRow}><Button size="sm" onClick={onClose}>DONE</Button></div>
      </div>
    );
  }
  if (sheet.type === 'diner') return <DinerSheet career={career} update={update} onClose={onClose} />;
  if (sheet.type === 'junk') return <JunkSheet career={career} update={update} onClose={onClose} />;
  if (sheet.type === 'meet') return <MeetSheet career={career} onClose={onClose} onMeet={onMeet} />;
  if (sheet.type === 'meetResult') return <MeetResult r={sheet} onClose={onClose} />;
  if (sheet.type === 'race') return <RaceSheet career={career} onClose={onClose} onRace={onRace} />;
  if (sheet.type === 'raceResult') return <RaceResult r={sheet} onClose={onClose} />;
  if (sheet.type === 'soon') {
    return (
      <div className={styles.sheet} data-world-sheet="" role="dialog" aria-label={sheet.title}>
        <div className={styles.sheetTag}>{sheet.title.toUpperCase()}</div>
        <p className={styles.lede}>{sheet.text}</p>
        <div className={styles.sheetRow}><Button size="sm" onClick={onClose}>OK</Button></div>
      </div>
    );
  }
  if (sheet.type === 'settings') {
    const set = (patch) => setSettings({ ...settings, ...patch });
    return (
      <div className={styles.sheet} data-world-sheet="" role="dialog" aria-label="Settings">
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
        <div className={styles.sheetRow}>
          <span className={styles.lede}>Camera shake</span>
          <Button size="sm" variant={settings.shake ? 'primary' : 'ghost'} onClick={() => set({ shake: !settings.shake })}>{settings.shake ? <><Check size={13} aria-hidden="true" /> ON</> : 'OFF'}</Button>
        </div>
        {onFlat && (
          <div className={styles.sheetRow}>
            <span className={styles.lede}>Shop view</span>
            <Button size="sm" variant="ghost" onClick={() => { setSettings({ ...settings, view: 'flat' }); onFlat(); }}>USE THE FLAT SHOP</Button>
          </div>
        )}
        <p className={styles.lede}>Keys: WASD or arrows to walk, SHIFT to run, E to use, Q and R to turn the view, P for a photo. Driving: W/S gas and brake, A/D steer, SPACE handbrake, Z/X shift, L lights, BACKSPACE to straighten up.</p>
        <div className={styles.sheetRow}><Button size="sm" onClick={onClose}>DONE</Button></div>
      </div>
    );
  }
  if (sheet.type === 'map') {
    const open = openPlaces(career);
    return (
      <div className={styles.sheet} data-world-sheet="" role="dialog" aria-label="Map">
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

/** Choose a rival and a car. @param {{career: import('../career/shop.js').Career, onClose: () => void, onRace: (rival: string, car: string) => void}} p */
function RaceSheet({ career, onClose, onRace }) {
  const cars = career.cars ?? [];
  const [carId, setCarId] = useState(cars.find((c) => !career.lifts.some((l) => l.jobId === ownJobId(c.id)))?.id ?? null);
  const best = (id) => career.races?.best?.[id];
  return (
    <div className={styles.sheet} data-world-sheet="" role="dialog" aria-label="Race">
      <div className={styles.sheetTag}>THE DRAG STRIP · {career.raceDay?.day === career.day ? career.raceDay.n : 0} of 3 races today</div>
      <p className={styles.lede}>Races are run on the strip&rsquo;s own physics, the same quarter-mile model as the DRAG screen. Your car goes down the strip as you tuned it; a rival goes down as it was built. Elapsed time from the green light decides it.</p>
      {cars.length === 0 ? <p className={styles.lede}>You need a car of your own to race. Caribou Motors has them from $2,400.</p> : (
        <div className={styles.sheetRow}>
          <span className={styles.lede}>Your car</span>
          {cars.map((c) => <Button key={c.id} size="sm" variant={carId === c.id ? 'primary' : 'ghost'} onClick={() => setCarId(c.id)}>{c.name}{best(c.id) ? ` · best ${best(c.id).toFixed(2)}s` : ''}</Button>)}
        </div>
      )}
      <ul className={styles.places}>
        {RIVALS.map((r) => {
          const why = cars.length ? cannotRace(career, r, carId) : 'Needs a car of your own.';
          const beaten = career.races?.won?.includes(r.id);
          return (
            <li key={r.id} data-closed={why ? 'true' : 'false'}>
              <div>
                <b>{r.name} · {r.car}{beaten ? ' ✓' : ''}</b>
                <span>{why ?? `\u201c${r.says}\u201d Entry $${r.fee}, prize $${r.prize.toLocaleString('en-US')}.`}</span>
              </div>
              <Button size="sm" disabled={!!why} onClick={() => onRace(r.id, carId)}>RACE</Button>
            </li>
          );
        })}
      </ul>
      <div className={styles.sheetRow}><Button size="sm" variant="ghost" onClick={onClose}>CLOSE</Button></div>
    </div>
  );
}

/** The time slip. @param {{r: any, onClose: () => void}} p */
function RaceResult({ r, onClose }) {
  const { rival, res, prun, rrun, prt, paid, repGain, talk } = r;
  const f = (n) => (n == null ? '--' : n.toFixed(3));
  return (
    <div className={styles.sheet} data-world-sheet="" role="dialog" aria-label="Time slip">
      <div className={styles.sheetTag}>TIME SLIP · {res.won ? 'YOU WIN' : 'YOU LOSE'} BY {Math.abs(res.margin).toFixed(3)} s</div>
      <p className={styles.lede}>&ldquo;{res.won ? rival.loses : rival.wins}&rdquo; &mdash; {rival.name}</p>
      <table className={styles.slip}>
        <thead><tr><th /><th>YOU</th><th>{rival.name.toUpperCase()}</th></tr></thead>
        <tbody>
          <tr><td>Reaction</td><td>{f(prt)}</td><td>{f(rival.rt)}</td></tr>
          <tr><td>60 ft</td><td>{f(prun.sixtyFootT)}</td><td>{f(rrun.sixtyFootT)}</td></tr>
          <tr><td>1/8 mile</td><td>{f(prun.eighthET)}</td><td>{f(rrun.eighthET)}</td></tr>
          <tr><td>1/4 mile</td><td>{f(prun.et)}</td><td>{f(rrun.et)}</td></tr>
          <tr><td>Trap speed</td><td>{prun.trapMph.toFixed(1)} mph</td><td>{rrun.trapMph.toFixed(1)} mph</td></tr>
        </tbody>
      </table>
      <p className={styles.lede}>{paid >= 0 ? 'Won' : 'Lost'} <b>${Math.abs(paid).toLocaleString('en-US')}</b>{repGain > 0 ? `, and reputation +${repGain} for beating ${rival.name} for the first time` : ''}.</p>
      <ul className={styles.facts2}>{talk.map((t) => <li key={t}>{t}</li>)}</ul>
      <div className={styles.sheetRow}><Button size="sm" onClick={onClose}>BACK TO THE PITS</Button></div>
    </div>
  );
}

/** Choose a car for the meet. @param {{career: import('../career/shop.js').Career, onClose: () => void, onMeet: (car: string) => void}} p */
function MeetSheet({ career, onClose, onMeet }) {
  const cars = career.cars ?? [];
  const [carId, setCarId] = useState(cars.find((c) => !career.lifts.some((l) => l.jobId === ownJobId(c.id)))?.id ?? null);
  const why = cannotEnter(career, carId);
  return (
    <div className={styles.sheet} data-world-sheet="" role="dialog" aria-label="Car meet">
      <div className={styles.sheetTag}>CAR MEET · {career.meets ?? 0} shown so far</div>
      <p className={styles.lede}>The crowd judges three things, and each is yours to change: <b>build</b> (power for the weight, on the dyno), <b>tune</b> (how clean the pull log is) and <b>style</b> (the car&rsquo;s looks and your own outfit). First place pays $800 and a name.</p>
      {cars.length === 0 ? <p className={styles.lede}>You need a car of your own to show.</p> : (
        <div className={styles.sheetRow}>
          {cars.map((c) => <Button key={c.id} size="sm" variant={carId === c.id ? 'primary' : 'ghost'} onClick={() => setCarId(c.id)}>{c.name}</Button>)}
        </div>
      )}
      {why && <p className={styles.lede}>{why}</p>}
      <div className={styles.sheetRow}>
        <Button size="sm" disabled={!!why} onClick={() => onMeet(carId)}>SHOW THE CAR</Button>
        <Button size="sm" variant="ghost" onClick={onClose}>CLOSE</Button>
      </div>
    </div>
  );
}

/** The scoreboard. @param {{r: any, onClose: () => void}} p */
function MeetResult({ r, onClose }) {
  const { own, score, others, place } = r;
  const ORD = ['1st', '2nd', '3rd', '4th'];
  return (
    <div className={styles.sheet} data-world-sheet="" role="dialog" aria-label="Meet results">
      <div className={styles.sheetTag}>{own.name.toUpperCase()} · {ORD[place.place - 1] ?? `${place.place}th`} PLACE</div>
      <table className={styles.slip}>
        <thead><tr><th /><th>SCORE</th></tr></thead>
        <tbody>
          <tr><td>Build</td><td>{score.build}</td></tr>
          <tr><td>Tune</td><td>{score.tune}</td></tr>
          <tr><td>Style</td><td>{score.style}</td></tr>
          <tr><td><b>Total</b></td><td><b>{score.total}</b></td></tr>
          {others.map((o) => <tr key={o.name + o.car}><td>{o.name}&rsquo;s {o.car}</td><td>{o.total}</td></tr>)}
        </tbody>
      </table>
      <p className={styles.lede}>{place.prize > 0 ? `Prize $${place.prize.toLocaleString('en-US')}${place.rep ? `, reputation +${place.rep}` : ''}.` : 'No prize tonight.'}</p>
      <ul className={styles.facts2}>{score.notes.map((n) => <li key={n}>{n}</li>)}</ul>
      <div className={styles.sheetRow}><Button size="sm" onClick={onClose}>DONE</Button></div>
    </div>
  );
}

/** What Pops says on the first morning. */
const INTRO = [
  { title: 'Welcome to the shop', text: 'I am Pops. I ran this garage for thirty years and I am handing you the keys. Customers will bring cars that do not run right. Your job is to work out why, and fix it properly: the real way, with real physics.' },
  { title: 'How it works', text: 'Walk with WASD or the arrows (or the stick on a phone). Press E near something to use it. Take a customer from the board on the left wall, look under their bonnet, open the laptop and tune. When it is right, hand the car back and get paid.' },
  { title: 'Then spend it', text: 'Money buys instruments, courses, a car of your own, parts for it, and a look. The town has a parts counter, a school, a boutique, a scrapyard, a drag strip and a car meet. Nothing you buy adds power by magic: every part changes the air, the fuel, the grip or the weight, and the tune has to catch up.' },
];

/** Pops at the counter: the day's goals. @param {{career: import('../career/shop.js').Career, update: (c: any) => void, onClose: () => void}} p */
function DinerSheet({ career, update, onClose }) {
  const goals = goalsFor(career);
  return (
    <div className={styles.sheet} data-world-sheet="" role="dialog" aria-label="Pops' Diner">
      <div className={styles.sheetTag}>TODAY&rsquo;S GOALS{career.streak ? ` · ${career.streak}-day streak` : ''}</div>
      <ul className={styles.places}>
        {goals.map((g) => {
          const n = progressOf(career, g);
          const done = n >= g.target;
          const got = claimed(career, g.id);
          return (
            <li key={g.id} data-closed={got ? 'true' : 'false'}>
              <div><b>{g.text}</b><span>{g.kind === 'earn' ? `$${n} of $${g.target}` : g.kind === 'drive' ? `${n} of ${g.target} km` : `${n} of ${g.target}`} · ${g.reward}</span></div>
              <Button size="sm" variant={done && !got ? 'primary' : 'ghost'} disabled={!done || got} onClick={() => update(claim(career, g.id))}>{got ? 'PAID' : 'CLAIM'}</Button>
            </li>
          );
        })}
      </ul>
      <p className={styles.lede}>All three in one day pays a bonus of $150 and a point of reputation.</p>
      <div className={styles.sheetRow}><Button size="sm" onClick={onClose}>THANKS, POPS</Button></div>
    </div>
  );
}

/** Sparky's yard. @param {{career: import('../career/shop.js').Career, update: (c: any) => void, onClose: () => void}} p */
function JunkSheet({ career, update, onClose }) {
  const [found, setFound] = useState(/** @type {any} */ (null));
  const why = cannotDig(career);
  return (
    <div className={styles.sheet} data-world-sheet="" role="dialog" aria-label="Scrapyard">
      <div className={styles.sheetTag}>SPARKY&rsquo;S SCRAPYARD · {digsLeft(career)} digs left today</div>
      <p className={styles.lede}>A dig costs ${DIG_COST}. Pick a pile: what is in it depends on what the pile is.</p>
      {found && <p className={styles.lede}><b>{found.text}</b></p>}
      <ul className={styles.places}>
        {PILES.map((p) => (
          <li key={p.id}>
            <div><b>{p.name}</b><span>{p.hint}</span></div>
            <Button size="sm" disabled={!!why} onClick={() => { const r = dig(career, p.id); update(bump(r.career, 'junk')); setFound(r.find); }}>DIG</Button>
          </li>
        ))}
      </ul>
      {why && <p className={styles.lede}>{why}</p>}
      <div className={styles.sheetRow}><Button size="sm" variant="ghost" onClick={onClose}>LEAVE</Button></div>
    </div>
  );
}
