/** A place in the shop you walk up to: the dyno, the engine on its stand, the build bench. */

import React from 'react';
import { createPortal } from 'react-dom';
import { Activity, Gauge } from 'lucide-react';

import { useSurfaces } from './Desk.jsx';

import styles from './Station.module.css';

/**
 * One face of a thing in the shop, and what is on it.
 * @param {{name: string, label: string, kind: 'monitor'|'console', children: React.ReactNode}} props
 * @returns {React.ReactElement}
 */
export function Surface({ name, label, kind, children }) {
  const { surfaces } = useSurfaces();
  const el = surfaces?.[name] ?? null;
  const face = (
    // A machine's screen and a sheet of paper are not hand-drawn: no wobble, no pen line.
    <section className={styles.face} data-kind={kind} aria-label={label} data-plain="">
      {children}
    </section>
  );
  return el ? createPortal(face, el) : face;
}

/** Each machine's software mark, so the dyno and the stand read as two programs, not two windows. */
const MARKS = { dyno: Gauge, stand: Activity };

/**
 * A computer's screen: its software's toolbar (its mark and name, its screens as tabs, a lamp
 * and what it reads now) over the screen it shows. It is always on.
 *
 * @param {object} props
 * @param {string} props.label what the computer is: "Dyno computer"
 * @param {{id: string, label: string, flag?: boolean}[]} props.screens its software's menu
 * @param {string|null} props.current the screen showing
 * @param {(id: string) => void} props.onScreen a menu item was chosen
 * @param {string} props.title the software's name
 * @param {'dyno'|'stand'} [props.look] whose software it is
 * @param {React.ReactNode} [props.status] what it is reading now
 * @param {boolean|null} [props.live] the lamp, lit while the machine runs (null: the status draws its own)
 * @param {React.ReactNode} props.children the screen
 * @returns {React.ReactElement}
 */
export function Computer({ label, screens, current, onScreen, title, look = 'dyno', status = null, live = null, children }) {
  const Mark = MARKS[look] ?? Gauge;
  return (
    <div className={styles.monitor} data-awake="true" data-look={look}>
      <div className={styles.titleBar}>
        <span className={styles.appName}><Mark size={14} strokeWidth={2} aria-hidden="true" className={styles.mark} />{title}</span>
        {screens.length > 0 && (
          <nav className={styles.menu} aria-label={`${label} screens`}>
            {screens.map((s) => (
              <button
                key={s.id} type="button" className={styles.menuItem} aria-pressed={current === s.id}
                onClick={() => onScreen(s.id)}
              >
                {s.label}{s.flag && <span className={styles.flagged}> (new findings)</span>}
              </button>
            ))}
          </nav>
        )}
        {status && <span className={styles.titleStatus}>{live !== null && <span data-led={live ? 'on' : 'off'} aria-hidden="true" />}{status}</span>}
      </div>
      <div className={styles.screen}>
        <div className={styles.screenBody}>{children}</div>
      </div>
    </div>
  );
}

/**
 * A place in the shop: its surfaces, in the room or (with no room) one after the other.
 * @param {{kind: 'dyno'|'stand'|'build', children: React.ReactNode}} props
 * @returns {React.ReactElement}
 */
export function Station({ kind, children }) {
  const { surfaces } = useSurfaces();
  return <div className={styles.station} data-station={kind} data-flat={!surfaces ? 'true' : undefined}>{children}</div>;
}
