/**
 * What is drawn over the picture: the status bar, the button for whatever is in reach,
 * speech bubbles, the dash when driving, and the on-screen controls on a touch screen.
 *
 * The dash and the touch pads read the runtime's live numbers directly, in animation
 * frames, rather than through React state: sixty re-renders a second for a tachometer
 * would cost more than the 3-D scene does.
 */

import { Camera, Gauge, Map as MapIcon, Menu, Moon, Settings, Smartphone, Sun, Sunset, Zap } from 'lucide-react';
import React, { useEffect, useRef } from 'react';

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
        <button type="button" className={styles.round} onClick={onPhone} aria-label="Phone: jobs, shop, wardrobe, books"><Smartphone size={18} aria-hidden="true" /></button>
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
 * @param {{world: any, units: 'mph'|'kph'}} p
 */
export function Dash({ world, units }) {
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
    <div className={styles.dash} aria-label="Dashboard">
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
