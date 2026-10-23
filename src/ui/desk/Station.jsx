/**
 * A place in the shop you walk up to: the dyno, the engine on its stand, the job board.
 *
 * The shop itself is the picture (ShopBackdrop turns the camera onto the thing), and over
 * it, as real buttons that work by touch and keyboard:
 *
 *   computer   the bench computer, bottom left: a monitor whose screens you switch with the
 *              buttons along its bezel. It sleeps on "Press to start" until you first touch
 *              it, and once there is something on it it nudges you (`nudge`).
 *   controls   the machine's own controls, bottom right: the dyno's RUN button, the
 *              engine's START and throttle.
 *
 * Only the layout lives here; the screens and the controls are the app's (EcuLab.jsx).
 */

import { Zap } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';

import styles from './Station.module.css';

/**
 * Whether the player has ever woken a computer, kept in the browser so it only asks once.
 * @param {string} key
 * @returns {[boolean, () => void]}
 */
export function useWoken(key) {
  const name = `ecu-lab.woken.${key}`;
  const [woken, setWoken] = useState(() => {
    try { return window.localStorage.getItem(name) === '1'; } catch { return false; }
  });
  const wake = () => {
    if (woken) return;
    setWoken(true);
    try { window.localStorage.setItem(name, '1'); } catch { /* private window: it asks again next time */ }
  };
  return [woken, wake];
}

/**
 * @typedef {{id: string, label: string, flag?: boolean}} Screen
 */

/**
 * @param {object} props
 * @param {string} props.label what the computer is, for a screen reader: "Dyno computer"
 * @param {string} props.wakeKey which computer, for remembering it has been woken
 * @param {Screen[]} props.screens the bezel's buttons
 * @param {string|null} props.current the screen showing
 * @param {(id: string) => void} props.onScreen a bezel button was pressed
 * @param {boolean} [props.nudge] there is something to see and it has never been looked at
 * @param {React.ReactNode} props.children the screen
 * @returns {React.ReactElement}
 */
export function Computer({ label, wakeKey, screens, current, onScreen, nudge = false, children }) {
  const [woken, wake] = useWoken(wakeKey);
  const body = useRef(/** @type {HTMLDivElement|null} */ (null));
  // Asleep, what is behind the start screen is out of reach of the keyboard too.
  useEffect(() => { if (body.current) /** @type {any} */ (body.current).inert = !woken; }, [woken]);
  return (
    <section className={styles.computer} aria-label={label}>
      <div className={`${styles.monitor} ink-frame-lg`}>
        <div className={styles.screen}>
          <div ref={body} className={styles.screenBody} aria-hidden={!woken}>{children}</div>
          {!woken && (
            <button type="button" className={styles.wake} data-nudge={nudge ? 'true' : undefined} onClick={wake} aria-label={`Press to start the ${label.toLowerCase()}`}>
              <Zap size={44} aria-hidden="true" />
              <span>Press to start</span>
            </button>
          )}
        </div>
        {screens.length > 0 && (
          <div className={styles.bezel} role="group" aria-label={`${label} screens`}>
            {screens.map((s) => (
              <button
                key={s.id} type="button" className={styles.key} aria-pressed={woken && current === s.id}
                onClick={() => { wake(); onScreen(s.id); }}
              >
                {s.label}
                {s.flag && <span className={styles.flag} aria-hidden="true" />}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className={styles.stand} aria-hidden="true" />
    </section>
  );
}

/**
 * @param {object} props
 * @param {'dyno'|'stand'|'board'} props.kind which place, for its layout
 * @param {React.ReactNode} [props.controls] the machine's own controls
 * @param {string} [props.controlsLabel]
 * @param {React.ReactNode} props.children the computer, or the board
 * @returns {React.ReactElement}
 */
export function Station({ kind, controls = null, controlsLabel = 'Controls', children }) {
  return (
    <div className={styles.station} data-station={kind}>
      {children}
      {controls && (
        <section className={`${styles.controls} ink-frame-lg`} aria-label={controlsLabel}>{controls}</section>
      )}
    </div>
  );
}

/**
 * The job board, close up: the board's paperwork over the picture of it on the wall.
 * @param {{label?: string, children: React.ReactNode}} props
 * @returns {React.ReactElement}
 */
export function Board({ label = 'Job board', children }) {
  return (
    <section className={`${styles.board} ink-frame-lg`} aria-label={label}>
      <div className={styles.boardBody}>{children}</div>
    </section>
  );
}
