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

import React from 'react';
import { createPortal } from 'react-dom';

import { useSurfaces } from './Desk.jsx';

import styles from './Station.module.css';

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
 * A computer's screen: its software's menu along the top, and the screen it shows. It is
 * always on.
 *
 * @param {object} props
 * @param {string} props.label what the computer is: "Dyno computer"
 * @param {{id: string, label: string, flag?: boolean}[]} props.screens its software's menu
 * @param {string|null} props.current the screen showing
 * @param {(id: string) => void} props.onScreen a menu item was chosen
 * @param {string} props.title the software's name, in its title bar
 * @param {React.ReactNode} [props.status] the right of the title bar: what it is reading now
 * @param {React.ReactNode} props.children the screen
 * @returns {React.ReactElement}
 */
export function Computer({ label, screens, current, onScreen, title, status = null, children }) {
  // Always on, as a shop's dyno PC and run-stand computer are: no standby screen to click
  // through before the machine can be used.
  return (
    <div className={styles.monitor} data-awake="true">
      <div className={styles.titleBar}>
        <span className={styles.lights} aria-hidden="true">
          <span className={styles.light} data-light="close" />
          <span className={styles.light} data-light="min" />
          <span className={styles.light} data-light="zoom" />
        </span>
        <span className={styles.appName}>{title}</span>
        {status && <span className={styles.titleStatus}>{status}</span>}
      </div>
      {screens.length > 0 && (
        <nav className={styles.menu} aria-label={`${label} screens`}>
          <span className={styles.segments}>
            {screens.map((s) => (
              <button
                key={s.id} type="button" className={styles.menuItem} aria-pressed={current === s.id}
                onClick={() => onScreen(s.id)}
              >
                {s.label}{s.flag && <span className={styles.flagged}> (new findings)</span>}
              </button>
            ))}
          </span>
        </nav>
      )}
      <div className={styles.screen}>
        <div className={styles.screenBody}>{children}</div>
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
