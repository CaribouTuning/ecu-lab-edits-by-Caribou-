/**
 * The control plates on the shop's two carts (Station.jsx): the dyno's, with its load
 * switch, the nitrous arming switch and the button that makes a pull; and the engine
 * stand's, with the start switch, the throttle and the volume.
 *
 * They are drawn as the hardware they stand for: a row of latching keys, a big round
 * button, a lever you hold open. The numbers on them are what the machine is reading.
 */

import React from 'react';

import { clamp } from '../../sim/index.js';
import { ACTIONS } from '../state/reducer.js';
import { useSession } from '../state/StoreProvider.jsx';

import styles from './Consoles.module.css';

/**
 * @param {object} props
 * @param {boolean} props.roadTest the shop has no dyno: a pull is a run up through the gears
 * @param {number} props.loadKpa @param {(kpa: number) => void} props.onLoad
 * @param {{shotHp: number, kit: string}|null} props.nitrous the kit fitted, if any
 * @param {boolean} props.nitrousArmed @param {(on: boolean) => void} props.onNitrous
 * @param {boolean} props.running @param {string} props.phase the pull's phase while it runs
 * @param {number} props.rpm the engine speed the dyno reads now
 * @param {() => void} props.onRun
 * @returns {React.ReactElement}
 */
export function DynoConsole({ roadTest, loadKpa, onLoad, nitrous, nitrousArmed, onNitrous, running, phase, rpm, onRun }) {
  const label = !running ? (roadTest ? 'Run a road test' : 'Run a pull')
    : phase === 'settle' ? 'Idling…' : phase === 'sweep' ? 'Sweeping…' : phase === 'spooldown' ? 'Coming back down…' : 'Settling…';
  return (
    <div className={styles.plate}>
      <div className={styles.group}>
        {/* A road test is one full-throttle pull: there is no load to choose. */}
        {!roadTest && (
          <>
            <span className={styles.engraved} aria-hidden="true">Load, kPa</span>
            {/* The number on the key, the unit engraved above: three keys fit one row. */}
            <div className={styles.keys} role="group" aria-label="Load (manifold pressure)">
              {[100, 70, 40].map((k) => (
                <button key={k} type="button" className={styles.key} aria-pressed={loadKpa === k} onClick={() => onLoad(k)} disabled={running} aria-label={`${k} kPa`}>{k}</button>
              ))}
            </div>
          </>
        )}
        {roadTest && <span className={styles.engraved}>Full throttle to redline</span>}
        {nitrous && (
          <button type="button" className={styles.toggle} aria-pressed={nitrousArmed} onClick={() => onNitrous(!nitrousArmed)} disabled={running}>
            Nitrous {nitrousArmed ? 'armed' : 'off'} <small>{nitrous.shotHp} shot, {nitrous.kit}</small>
          </button>
        )}
      </div>
      <div className={styles.readout} role="status" aria-label="Dyno engine speed">
        <b>{Math.round(rpm)}</b><span>rpm</span>
      </div>
      <button type="button" className={styles.bigButton} data-tone="go" onClick={onRun} disabled={running}>
        <span className={styles.cap} aria-hidden="true" />
        <span className={styles.bigLabel}>{label}</span>
      </button>
    </div>
  );
}

/**
 * @param {object} props
 * @param {() => void} props.onStart @param {() => void} props.onStop
 * @param {() => void} props.onToggleSound @param {() => void} props.onTestSound
 * @param {(percent: number) => void} props.onThrottle driver throttle input, 0 or 100
 * @returns {React.ReactElement}
 */
export function StandConsole({ onStart, onStop, onToggleSound, onTestSound, onThrottle }) {
  const [session, dispatch] = useSession();
  const { soundOn, throttleInput, volume, audioStatus } = session;
  const live = /** @type {Record<string, any>} */ (session.live);
  const on = live.running || live.cranking;
  return (
    <div className={styles.plate} data-kind="stand">
      <button type="button" className={styles.bigButton} data-tone={on ? 'stop' : 'go'} onClick={on ? onStop : onStart}>
        <span className={styles.cap} aria-hidden="true" />
        <span className={styles.bigLabel}>{on ? 'Stop' : 'Start engine'}</span>
      </button>
      <div
        className={styles.lever}
        data-open={throttleInput > 0 ? 'true' : 'false'}
        data-running={live.running ? 'true' : 'false'}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture?.(e.pointerId); onThrottle(100); }}
        onPointerUp={() => onThrottle(0)}
        onPointerCancel={() => onThrottle(0)}
      >
        <div className={styles.leverFill} style={{ height: `${clamp(live.effThrottle ?? 0, 0, 100)}%` }} />
        <span className={styles.leverLabel}>
          {!live.running ? 'Start the engine first' : throttleInput > 0 ? 'Wide open throttle' : 'Press and hold to rev'}
        </span>
      </div>
      <div className={styles.group}>
        <label className={styles.engraved} htmlFor="stand-volume">Volume</label>
        <input
          id="stand-volume" type="range" min={0} max={2} step={0.05} value={volume} className={styles.slider}
          onChange={(e) => dispatch({ type: ACTIONS.SET_SESSION_FIELD, field: 'volume', value: Number(e.target.value) })}
          aria-label="Engine volume"
        />
        <div className={styles.keys}>
          <button type="button" className={styles.key} aria-pressed={soundOn} onClick={onToggleSound}>Sound {soundOn ? 'on' : 'off'}</button>
          <button type="button" className={styles.key} onClick={onTestSound}>Test sound</button>
        </div>
        {audioStatus && (
          <p className={styles.note} data-ok={audioStatus === 'ok' ? 'true' : undefined}>
            {audioStatus === 'ok' ? 'Audio is running. If you heard the test note but not the engine, start it and hold the throttle.' : audioStatus === 'blocked'
              ? 'The browser is blocking sound. Press Start engine, then Test sound again. On an iPhone the silent switch mutes it too.'
              : 'This browser has no Web Audio, so there is no engine sound.'}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * The engine computer's title bar: off, cranking, or the speed it is turning at.
 * @returns {React.ReactElement}
 */
export function StandStatus() {
  const [session] = useSession();
  const live = /** @type {Record<string, any>} */ (session.live);
  if (live.cranking && !live.running) return <span>Cranking…</span>;
  if (!live.running) return <span>Engine off</span>;
  return <span><span role="status" aria-label="Engine speed">{Math.round(live.sensedRpm)}</span> rpm</span>;
}
