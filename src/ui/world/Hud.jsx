/**
 * What is drawn over the picture: the status bar, the button for whatever is in reach,
 * speech bubbles, the dash when driving, and the on-screen controls on a touch screen.
 *
 * The dash and the touch pads read the runtime's live numbers directly, in animation
 * frames, rather than through React state: sixty re-renders a second for a tachometer
 * would cost more than the 3-D scene does.
 */

import { Camera, Gauge, Map as MapIcon, Menu, Moon, Settings, Smartphone, Sun, Sunset, Zap } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';

import { sfx } from './sfx.js';

import styles from './World.module.css';

const PHASE = [
  { name: 'Morning', Icon: Sun }, { name: 'Afternoon', Icon: Sun }, { name: 'Evening', Icon: Sunset }, { name: 'Night', Icon: Moon },
];

const money = (n) => `${n < 0 ? '-' : ''}$${Math.abs(Math.round(n)).toLocaleString('en-US')}`;

/**
 * @param {object} p
 * @param {import('../career/shop.js').Career} p.career
 * @param {string} p.tierTitle
 * @param {string} p.where the name of the place
 * @param {() => void} p.onPhone @param {() => void} p.onMap @param {() => void} p.onPhoto @param {() => void} p.onSettings @param {() => void} p.onMenu
 */
export function TopBar({ career, tierTitle, where, onPhone, onMap, onPhoto, onSettings, onMenu }) {
  const phase = PHASE[Math.min(3, career.phase ?? 0)];
  return (
    <>
      <div className={styles.status} aria-label="Shop status">
        <span className={styles.where}>{where}</span>
        <span className={styles.chip} data-testid="shop-day"><phase.Icon size={13} aria-hidden="true" /><b>DAY {career.day}</b><i>{phase.name}</i></span>
        <span className={styles.chip} data-testid="shop-money"><span className={styles.key}>CASH</span><b>{money(career.money)}</b></span>
        <span className={styles.chip} data-testid="shop-rep"><span className={styles.key}>REP</span><b>{career.rep}</b><i>{tierTitle}</i></span>
      </div>
      <div className={styles.buttons}>
        <button type="button" className={styles.round} onClick={onPhone} aria-label="Open the phone"><Smartphone size={18} aria-hidden="true" /></button>
        <button type="button" className={styles.round} onClick={onMap} aria-label="Map"><MapIcon size={18} aria-hidden="true" /></button>
        <button type="button" className={styles.round} onClick={onPhoto} aria-label="Photo"><Camera size={18} aria-hidden="true" /></button>
        <button type="button" className={styles.round} onClick={onSettings} aria-label="Settings"><Settings size={18} aria-hidden="true" /></button>
        <button type="button" className={styles.round} onClick={onMenu} aria-label="Main menu"><Menu size={18} aria-hidden="true" /></button>
      </div>
    </>
  );
}

/** The button for whatever is within reach. @param {{prompt: any, onUse: () => void}} p */
export function PromptButton({ prompt, onUse }) {
  if (!prompt) return null;
  return (
    <button type="button" className={styles.prompt} onClick={onUse} data-testid="world-prompt">
      <kbd>{prompt.key ?? 'E'}</kbd>
      <span>
        <b>{prompt.label}</b>
        {prompt.hint && <i>{prompt.hint}</i>}
      </span>
    </button>
  );
}

/** Speech bubbles and name tags, placed from the world's own projection. @param {{labels: any[]}} p */
export function Labels({ labels }) {
  return (
    <div className={styles.labels} aria-live="polite">
      {labels.filter((l) => l.visible && l.text).map((l) => (
        <div key={l.id} className={styles.bubble} data-tone={l.tone} style={{ left: `${l.x * 100}%`, top: `${l.y * 100}%` }} role="status">{l.text}</div>
      ))}
    </div>
  );
}

/** @param {{toasts: {id: number, text: string, tone?: string}[]}} p */
export function Toasts({ toasts }) {
  return (
    <div className={styles.toasts} aria-live="polite">
      {toasts.map((t) => <div key={t.id} className={styles.toast} data-tone={t.tone}>{t.text}</div>)}
    </div>
  );
}

/** The one thing to do next, in a line. @param {{text: string|null}} p */
export function Objective({ text }) {
  if (!text) return null;
  return <div className={styles.objective}><Zap size={12} aria-hidden="true" /><span>{text}</span></div>;
}

/**
 * The dash: speed, a tachometer with its redline, the gear, the traction-control light,
 * and the g-forces. Drawn once; the needle and numbers move through refs.
 *
 * @param {{world: any, units: 'mph'|'kph', touch?: boolean}} p
 */
export function Dash({ world, units, touch = false }) {
  const speed = useRef(null);
  const gear = useRef(null);
  const needle = useRef(null);
  const rpmText = useRef(null);
  const tc = useRef(null);
  const lim = useRef(null);
  const knock = useRef(null);
  const lean = useRef(null);
  const throttle = useRef(null);
  const brake = useRef(null);
  const gdot = useRef(null);
  const boost = useRef(null);
  const man = useRef(null);
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const t = world?.tele;
      if (t) {
        const sp = units === 'mph' ? t.speedMph : t.speedKph;
        if (speed.current) speed.current.textContent = String(Math.round(sp));
        if (gear.current) gear.current.textContent = t.gear < 0 ? 'R' : t.shifting ? '–' : String(t.gear);
        const f = Math.max(0, Math.min(1.05, t.rpm / (t.redline * 1.1)));
        if (needle.current) needle.current.style.transform = `rotate(${-120 + f * 240}deg)`;
        if (rpmText.current) rpmText.current.textContent = String(Math.round(t.rpm / 10) * 10);
        if (tc.current) tc.current.dataset.on = t.tcCut > 0.05 ? 'true' : 'false';
        if (lim.current) lim.current.dataset.on = t.limiter || t.rpm > t.redline * 0.96 ? 'true' : 'false';
        if (knock.current) knock.current.dataset.on = t.knock ? 'true' : 'false';
        if (lean.current) lean.current.dataset.on = t.lean ? 'true' : 'false';
        if (throttle.current) throttle.current.style.height = `${t.throttle * 100}%`;
        if (brake.current) brake.current.style.height = `${t.brake * 100}%`;
        if (gdot.current) gdot.current.style.transform = `translate(${Math.max(-1, Math.min(1, t.lat / 1.2)) * 22}px, ${Math.max(-1, Math.min(1, -t.g / 1.0)) * 22}px)`;
        if (boost.current) boost.current.textContent = t.boost > 0.2 ? `${t.boost.toFixed(1)} psi` : '';
        if (man.current) man.current.textContent = t.manual ? 'MAN' : 'AUTO';
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [world, units]);
  // Redline arc: from 0.9 of the way round to the end.
  return (
    <div className={styles.dash} data-touch={touch ? 'true' : 'false'} aria-label="Dashboard">
      <div className={styles.pedals} aria-hidden="true"><span className={styles.pedal}><i ref={brake} data-kind="brake" /></span><span className={styles.pedal}><i ref={throttle} data-kind="gas" /></span></div>
      <div className={styles.tach}>
        <svg viewBox="-60 -60 120 120" aria-hidden="true">
          <circle r="52" className={styles.tachFace} />
          {Array.from({ length: 11 }, (_, i) => {
            const a = ((-120 + (i / 10) * 240) * Math.PI) / 180;
            return <line key={i} x1={Math.sin(a) * 44} y1={-Math.cos(a) * 44} x2={Math.sin(a) * 50} y2={-Math.cos(a) * 50} className={i >= 9 ? styles.tickRed : styles.tick} />;
          })}
          <path d="M 29.4 -38.5 A 48 48 0 0 1 48 0.4" className={styles.redArc} />
        </svg>
        <div className={styles.needle} ref={needle}><i /></div>
        <div className={styles.readout}>
          <b ref={speed}>0</b>
          <span>{units === 'mph' ? 'MPH' : 'KM/H'}</span>
        </div>
        <div className={styles.gearBox}><b ref={gear}>1</b><span ref={man}>AUTO</span></div>
        <div className={styles.rpm}><span ref={rpmText}>0</span> rpm</div>
        <div className={styles.lights}><span ref={tc} data-on="false">TC</span><span ref={lim} data-on="false">LIM</span><span ref={knock} data-on="false" data-bad="true">KNOCK</span><span ref={lean} data-on="false" data-bad="true">LEAN</span></div>
      </div>
      <div className={styles.gmeter} aria-hidden="true"><i ref={gdot} /></div>
      <div className={styles.boost} ref={boost} />
    </div>
  );
}

/**
 * On-screen controls for a touch screen. Walking: a stick on the left and the action
 * buttons on the right. Driving: steering on the left, pedals on the right.
 *
 * @param {{world: any, driving: boolean}} p
 */
export function TouchControls({ world, driving }) {
  const stick = useRef(null);
  const knob = useRef(null);
  const down = useRef({ id: null, ox: 0, oy: 0 });
  const hold = (name, value) => { if (world) world.input.touch[name] = value; };
  const press = (name) => world?.input.press(name);

  const onStickDown = (e) => {
    const r = stick.current.getBoundingClientRect();
    down.current = { id: e.pointerId, ox: r.left + r.width / 2, oy: r.top + r.height / 2 };
    stick.current.setPointerCapture(e.pointerId);
    onStickMove(e);
  };
  const onStickMove = (e) => {
    if (down.current.id !== e.pointerId) return;
    const R = 46;
    let dx = e.clientX - down.current.ox;
    let dy = e.clientY - down.current.oy;
    const d = Math.hypot(dx, dy);
    if (d > R) { dx = (dx / d) * R; dy = (dy / d) * R; }
    knob.current.style.transform = `translate(${dx}px, ${dy}px)`;
    if (world) {
      world.input.touch.x = Math.abs(dx / R) < 0.12 ? 0 : dx / R;
      world.input.touch.y = driving ? 0 : (Math.abs(dy / R) < 0.12 ? 0 : -dy / R);
    }
  };
  const onStickUp = (e) => {
    if (down.current.id !== e.pointerId) return;
    down.current.id = null;
    knob.current.style.transform = 'translate(0, 0)';
    if (world) { world.input.touch.x = 0; world.input.touch.y = 0; }
  };
  useEffect(() => () => { if (world) { world.input.touch.x = 0; world.input.touch.y = 0; world.input.touch.throttle = 0; world.input.touch.brake = 0; world.input.touch.run = false; world.input.touch.handbrake = false; } }, [world]);

  const holdProps = (name) => ({
    onPointerDown: (e) => { e.currentTarget.setPointerCapture(e.pointerId); hold(name, name === 'run' || name === 'handbrake' ? true : 1); },
    onPointerUp: () => hold(name, name === 'run' || name === 'handbrake' ? false : 0),
    onPointerCancel: () => hold(name, name === 'run' || name === 'handbrake' ? false : 0),
    onContextMenu: (e) => e.preventDefault(),
  });
  return (
    <div className={styles.touch} data-driving={driving ? 'true' : 'false'}>
      <div className={styles.stick} ref={stick} onPointerDown={onStickDown} onPointerMove={onStickMove} onPointerUp={onStickUp} onPointerCancel={onStickUp} aria-label={driving ? 'Steering' : 'Move'} role="group">
        <div className={styles.knob} ref={knob} />
        {driving && <><span className={styles.steerL}>◀</span><span className={styles.steerR}>▶</span></>}
      </div>
      {driving ? (
        <div className={styles.pads}>
          <button type="button" className={`${styles.pad} ${styles.padSmall}`} onPointerDown={() => press('view')} aria-label="Change camera">CAM</button>
          <button type="button" className={`${styles.pad} ${styles.padSmall}`} {...holdProps('handbrake')} aria-label="Handbrake">HB</button>
          <button type="button" className={`${styles.pad} ${styles.padSmall}`} onPointerDown={() => press('shiftDown')} aria-label="Shift down">−</button>
          <button type="button" className={`${styles.pad} ${styles.padSmall}`} onPointerDown={() => press('shiftUp')} aria-label="Shift up">+</button>
          <button type="button" className={`${styles.pad} ${styles.padBrake}`} {...holdProps('brake')} aria-label="Brake">BRAKE</button>
          <button type="button" className={`${styles.pad} ${styles.padGas}`} {...holdProps('throttle')} aria-label="Accelerator">GAS</button>
        </div>
      ) : (
        <div className={styles.pads}>
          <button type="button" className={`${styles.pad} ${styles.padSmall}`} {...holdProps('run')} aria-label="Run"><Gauge size={16} aria-hidden="true" /></button>
          <button type="button" className={`${styles.pad} ${styles.padAct}`} onPointerDown={() => press('interact')} aria-label="Action">E</button>
        </div>
      )}
    </div>
  );
}

/**
 * @typedef {object} TalkLine
 * @property {string} [who] the speaker's name; none for a narrator line
 * @property {string} text
 * @property {{label: string, run: () => void}[]} [choices] answers offered on this line (the last one only)
 */

/**
 * The text box along the bottom of the screen, the way a handheld RPG talks: the speaker's
 * name on a tab, the words typed out a letter at a time with a blip, and a blinking arrow
 * when the line is done. E, Space, Enter or a tap finishes the line, then goes to the next.
 * A last line can offer choices.
 *
 * @param {{talk: {lines: TalkLine[]}, onDone: () => void, sound?: boolean}} p
 */
export function Dialogue({ talk, onDone, sound = true }) {
  const [at, setAt] = useState(0);
  const [shown, setShown] = useState(0);
  const [pick, setPick] = useState(0);
  const line = talk.lines[Math.min(at, talk.lines.length - 1)];
  const full = line.text.length;
  const done = shown >= full;
  const choices = done && at === talk.lines.length - 1 ? line.choices ?? [] : [];
  const soundRef = useRef(sound);
  soundRef.current = sound;

  // A new conversation starts at its first line.
  useEffect(() => { setAt(0); setShown(0); setPick(0); }, [talk]);

  // Type the line out: about fifty letters a second, a blip every few.
  useEffect(() => {
    if (shown >= full) return undefined;
    const id = setTimeout(() => {
      setShown((n) => Math.min(full, n + 2));
      if (shown % 6 === 0) sfx('tap', soundRef.current);
    }, 36);
    return () => clearTimeout(id);
  }, [shown, full]);

  const advance = () => {
    if (!done) { setShown(full); return; }
    if (choices.length) { choices[pick]?.run(); return; }
    if (at < talk.lines.length - 1) { setAt(at + 1); setShown(0); return; }
    onDone();
  };
  const advanceRef = useRef(advance);
  advanceRef.current = advance;
  const choicesRef = useRef(choices);
  choicesRef.current = choices;

  useEffect(() => {
    const onKey = (e) => {
      const n = choicesRef.current.length;
      if (n && (e.code === 'ArrowUp' || e.code === 'KeyW')) { setPick((k) => (k + n - 1) % n); e.preventDefault(); return; }
      if (n && (e.code === 'ArrowDown' || e.code === 'KeyS')) { setPick((k) => (k + 1) % n); e.preventDefault(); return; }
      if (e.code === 'KeyE' || e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); if (!e.repeat) advanceRef.current(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className={styles.talk} role="dialog" aria-label={line.who ? `${line.who} says` : 'Message'} aria-live="polite" data-world-sheet="">
      {line.who && <div className={styles.talkName}>{line.who}</div>}
      <button type="button" className={styles.talkBox} onClick={advance} aria-label={done ? 'Continue' : 'Show the whole line'}>
        <span className={styles.talkText} aria-hidden="true">{line.text.slice(0, shown)}</span>
        <span className={styles.srOnly}>{line.text}</span>
        {done && !choices.length && <span className={styles.talkMore} aria-hidden="true">{at < talk.lines.length - 1 ? '\u25BC' : '\u25A0'}</span>}
      </button>
      {choices.length > 0 && (
        <div className={styles.talkChoices} role="menu">
          {choices.map((c, i) => (
            <button key={c.label} type="button" role="menuitem" className={styles.talkChoice} data-on={i === pick ? 'true' : 'false'} onMouseEnter={() => setPick(i)} onClick={c.run}>{c.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The race overlay: the tree's state or the start lights, then the clock, the lap and the
 * position. The tree and the gantry are in the world too; this is the same thing big
 * enough to read on a phone.
 * @param {{hud: any, onRetire: () => void}} p
 */
export function RaceHud({ hud, onRetire }) {
  if (!hud) return null;
  const t = (n) => (n == null ? '--' : n.toFixed(hud.kind === 'drag' ? 3 : 2));
  if (hud.kind === 'drag') {
    const call = hud.foul ? 'RED LIGHT' : hud.phase === 'stage' ? 'STAGED: WAIT FOR THE GREEN' : hud.phase === 'amber' ? 'AMBER…' : hud.phase === 'run' ? 'GO!' : 'FINISHED';
    return (
      <div className={styles.raceHud} data-testid="race-hud" aria-live="polite">
        <div className={styles.raceCall} data-tone={hud.foul ? 'bad' : hud.phase === 'run' ? 'go' : hud.phase === 'amber' ? 'amber' : 'wait'}>{call}</div>
        <div className={styles.raceRow}>
          {hud.rival && <span>vs <b>{hud.rival}</b></span>}
          <span>RT <b>{hud.rt == null ? '--' : hud.rt < 0 ? 'EARLY' : t(hud.rt)}</b></span>
          <span>ET <b>{t(hud.et)}</b></span>
          {hud.rivalEt != null && <span>{hud.rival} <b>{t(hud.rivalEt)}</b></span>}
        </div>
      </div>
    );
  }
  return (
    <div className={styles.raceHud} data-testid="race-hud" aria-live="polite">
      {hud.phase === 'lights' ? (
        <div className={styles.raceLights} aria-label={`${hud.lights} of 5 lights`}>{[0, 1, 2, 3, 4].map((i) => <i key={i} data-on={i < hud.lights ? 'true' : 'false'} />)}</div>
      ) : <div className={styles.raceCall} data-tone="go">LAP {hud.lap}/{hud.laps}{hud.of > 1 ? ` · P${hud.pos}` : ''}</div>}
      <div className={styles.raceRow}>
        {hud.rival && <span>vs <b>{hud.rival}</b></span>}
        <span>TIME <b>{t(hud.time)}</b></span>
        <span>BEST <b>{t(hud.best)}</b></span>
        {hud.gap != null && hud.phase === 'run' && <span>{hud.gap > 0 ? 'BEHIND' : 'AHEAD'} <b>{Math.abs(hud.gap).toFixed(0)} m</b></span>}
        <button type="button" className={styles.raceRetire} onClick={onRetire}>RETIRE</button>
      </div>
    </div>
  );
}

/**
 * The town drawn small: its roads, the places, and you. Read from the level's plan, so it
 * is always the town you are in.
 * @param {{world: any, big?: boolean, onPick?: (place: string) => void}} p
 */
export function MiniMap({ world, big = false, onPick }) {
  const map = world?.level?.map;
  const [me, setMe] = useState({ x: 0, z: 0, h: 0 });
  useEffect(() => {
    if (!world) return undefined;
    const id = setInterval(() => {
      const d = world.drive;
      const p = d?.inside ? { x: d.state.x, z: d.state.z, h: d.state.heading } : { x: world.player.x, z: world.player.z, h: world.player.yaw };
      setMe((m) => (Math.abs(m.x - p.x) + Math.abs(m.z - p.z) + Math.abs(m.h - p.h) > 0.3 ? p : m));
    }, 125);
    return () => clearInterval(id);
  }, [world]);
  if (!map) return null;
  const b = map.bounds;
  const pts = (r) => (r.closed ? [...r.pts, r.pts[0]] : r.pts).map((q) => `${q.x.toFixed(0)},${q.z.toFixed(0)}`).join(' ');
  // The small map follows you; the big one shows the whole town.
  const view = big ? `${b.minX} ${b.minZ} ${b.maxX - b.minX} ${b.maxZ - b.minZ}` : `${me.x - 110} ${me.z - 110} 220 220`;
  return (
    <svg className={big ? styles.mapBig : styles.miniMap} viewBox={view} role="img" aria-label="Map of the town">
      <rect x={b.minX - 400} y={b.minZ - 400} width={b.maxX - b.minX + 800} height={b.maxZ - b.minZ + 800} className={styles.mapGround} />
      {map.roads.map((r) => <polyline key={r.name} points={pts(r)} className={styles.mapRoad} data-kind={r.kind} strokeWidth={Math.max(r.w, big ? 7 : 5)} fill="none" />)}
      {map.places.map((p) => (
        <g key={p.id} transform={`translate(${p.x} ${p.z})`} onClick={onPick ? () => onPick(p.id) : undefined} className={onPick ? styles.mapPick : undefined}>
          <circle r={big ? 7 : 5} className={styles.mapPlace} data-id={p.id} />
          {big && <text y={-11} className={styles.mapLabel}>{p.name}</text>}
        </g>
      ))}
      <g transform={`translate(${me.x} ${me.z}) rotate(${(-me.h * 180) / Math.PI})`}>
        <path d={big ? 'M 0 14 L 9 -9 L 0 -4 L -9 -9 Z' : 'M 0 10 L 6 -6 L 0 -3 L -6 -6 Z'} className={styles.mapMe} />
      </g>
    </svg>
  );
}
