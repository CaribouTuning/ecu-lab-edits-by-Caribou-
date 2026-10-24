/**
 * CAREER: going outside. Which car do you take? Your own, from the apron, or the customer's
 * from its lift for a road test. Whichever it is, you are driving it out of the door.
 */

import { Car, X } from 'lucide-react';
import React, { useEffect } from 'react';

import { jobById } from '../career/jobs.js';

import styles from './Desk.module.css';

/**
 * @param {object} props
 * @param {import('../career/shop.js').Career} props.career
 * @param {(car: {ownId?: string, bay?: number}) => void} props.onPick
 * @param {() => void} props.onClose
 * @returns {React.ReactElement}
 */
export function CarPicker({ career, onPick, onClose }) {
  useEffect(() => {
    const key = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);
  const own = career.cars ?? [];
  const lifts = career.lifts ?? [];
  const none = own.length === 0 && lifts.length === 0;
  return (
    <div className={styles.pickBack} onClick={onClose} role="presentation">
      <div className={`${styles.pick} ink-frame-lg`} role="dialog" aria-modal="true" aria-label="Which car?" onClick={(e) => e.stopPropagation()}>
        <header className={styles.pickHead}>
          <h2>Which car are you taking out?</h2>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Stay in the shop"><X size={15} aria-hidden="true" /></button>
        </header>
        {none && <p className={styles.pickNone}>No car to take: buy one at the dealer from the Shop app, or take a customer&apos;s car in.</p>}
        <div className={styles.pickList}>
          {own.map((c) => (
            <button key={c.id} type="button" className={`${styles.pickCar} ink-frame`} onClick={() => onPick({ ownId: c.id })}>
              <span className={styles.pickSwatch} style={{ background: c.look?.color }} aria-hidden="true"><Car size={18} /></span>
              <span><b>{c.name}</b><small>Yours, {c.plate}, {Math.round(c.km ?? 0)} km</small></span>
            </button>
          ))}
          {lifts.map((l, i) => {
            const job = jobById(l.jobId);
            if (!job) return null;
            return (
              <button key={l.jobId} type="button" className={`${styles.pickCar} ink-frame`} onClick={() => onPick({ bay: i })}>
                <span className={styles.pickSwatch} style={{ background: job.customer.color }} aria-hidden="true"><Car size={18} /></span>
                <span><b>{job.customer.car}</b><small>{job.customer.name}&apos;s, on lift {i + 1}</small></span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
