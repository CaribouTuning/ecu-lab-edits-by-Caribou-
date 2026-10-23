/**
 * A place in the shop you walk up to: the dyno, the engine on its stand, the job board.
 *
 * Its controls are not a panel laid over the picture: they are on the things in the room
 * (ShopBackdrop.jsx lays each `Surface` onto its face). The dyno's software is on its
 * computer's monitor and the RUN button on the cart's console; the engine stand's cart has
 * its own screen and its start switch and throttle; the job board's tickets are pinned on
 * the board. From across the room a face may be too small to read: the first tap on it
 * leans you in, and Step back (the page bar) leans you out again.
 *
 * Where there is no WebGL (an old browser, a test runner) there is no room to put them in,
 * and the same controls are laid out flat, one after the other.
 */

import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

import { useSurfaces } from './Desk.jsx';

import styles from './Station.module.css';

/**
 * Whether the player has ever woken a computer, kept in the browser so it only asks once.
 * @param {string} key
 * @returns {[boolean, () => void]}
 */
export function useWoken(key) {
  const name = `ecu-lab.woken.${key}`;
  const [woken, setWoken] = React.useState(() => {
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
 * One face of a thing in the shop, and what is on it.
 * @param {{name: string, label: string, kind: 'monitor'|'console'|'board', children: React.ReactNode}} props
 * @returns {React.ReactElement}
 */
export function Surface({ name, label, kind, children }) {
  const { surfaces, legible, focus, setFocus } = useSurfaces();
  const el = surfaces?.[name] ?? null;
  const face = (
    <section
      className={styles.face} data-kind={kind} aria-label={label}
      // A machine's screen and a sheet of paper are not hand-drawn: no wobble, no pen line.
      data-plain=""
      // Too small to use from here: the tap leans in instead of pressing what is under it.
      onClickCapture={(e) => {
        if (!el || legible[name] === true || focus === name) return;
        e.preventDefault();
        e.stopPropagation();
        setFocus(name);
      }}
    >
      {children}
    </section>
  );
  return el ? createPortal(face, el) : face;
}

/**
 * A computer's screen: its software's menu along the top, and the screen it shows. Until
 * someone presses its power button it is asleep, its standby light on; once there is
 * something new to see on it (`nudge`) and nobody has looked, the light flashes three
 * times and stays lit.
 *
 * @param {object} props
 * @param {string} props.label what the computer is: "Dyno computer"
 * @param {string} props.wakeKey which computer, for remembering it has been woken
 * @param {{id: string, label: string, flag?: boolean}[]} props.screens its software's menu
 * @param {string|null} props.current the screen showing
 * @param {(id: string) => void} props.onScreen a menu item was chosen
 * @param {string} props.title the software's name, in its title bar
 * @param {React.ReactNode} [props.status] the right of the title bar: what it is reading now
 * @param {boolean} [props.nudge]
 * @param {React.ReactNode} props.children the screen
 * @returns {React.ReactElement}
 */
export function Computer({ label, wakeKey, screens, current, onScreen, title, status = null, nudge = false, children }) {
  const [woken, wake] = useWoken(wakeKey);
  const body = useRef(/** @type {HTMLDivElement|null} */ (null));
  // Asleep, what is behind the standby screen is out of reach of the keyboard too.
  useEffect(() => { if (body.current) /** @type {any} */ (body.current).inert = !woken; }, [woken]);
  return (
    <div className={styles.monitor} data-awake={woken ? 'true' : 'false'}>
      <div className={styles.titleBar}>
        <span className={styles.appName}>{title}</span>
        {status && <span className={styles.titleStatus}>{status}</span>}
      </div>
      {screens.length > 0 && (
        <nav className={styles.menu} aria-label={`${label} screens`}>
          {screens.map((s) => (
            <button
              key={s.id} type="button" className={styles.menuItem} aria-pressed={woken && current === s.id}
              onClick={() => { wake(); onScreen(s.id); }}
            >
              {s.label}{s.flag && <span className={styles.flagged}> (new findings)</span>}
            </button>
          ))}
        </nav>
      )}
      <div className={styles.screen}>
        <div ref={body} className={styles.screenBody} aria-hidden={!woken}>{children}</div>
        {!woken && (
          <button type="button" className={styles.standby} data-nudge={nudge ? 'true' : undefined} onClick={wake} aria-label={`Switch on the ${label.toLowerCase()}`}>
            <svg viewBox="0 0 24 24" className={styles.power} aria-hidden="true">
              <path d="M12 3v8" /><path d="M6.6 6.6a7.5 7.5 0 1 0 10.8 0" />
            </svg>
            <span>Press to start</span>
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * A place in the shop: its surfaces, in the room or (with no room) one after the other.
 * @param {{kind: 'dyno'|'stand'|'board', children: React.ReactNode}} props
 * @returns {React.ReactElement}
 */
export function Station({ kind, children }) {
  const { surfaces } = useSurfaces();
  return <div className={styles.station} data-station={kind} data-flat={surfaces ? undefined : 'true'}>{children}</div>;
}
