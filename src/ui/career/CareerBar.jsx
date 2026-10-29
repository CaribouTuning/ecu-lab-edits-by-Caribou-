/**
 * The job ticket, pinned to the top of the game while a customer's car is on the bay.
 *
 * It says what the customer said and what they want, and what "done" means to them, in
 * their words: never which table to change. HAND BACK sends the car to be graded on the
 * simulator (evaluate.js), and the shop takes it from there.
 */

import { ChevronDown } from 'lucide-react';
import React, { useEffect, useState } from 'react';

import { Button } from '../primitives/Button.jsx';

import styles from './CareerBar.module.css';
import { HOW_TO_SEE } from './evaluate.js';
import { jobById } from './jobs.js';

/**
 * @param {object} props
 * @param {import('./shop.js').Career} props.career
 * @param {() => void} props.onShop back to the shop, the car stays on its lift
 * @param {() => void} props.onHandBack grade the car and give it back
 * @param {number} [props.openAsk] counts up each time the game's next step sends you to
 *   the ticket: it opens, its checks and its Hand back button in view
 * @returns {React.ReactElement|null}
 */
export function CareerBar({ career, onShop, onHandBack, openAsk = 0 }) {
  const [open, setOpen] = useState(false);
  useEffect(() => { if (openAsk > 0) setOpen(true); }, [openAsk]);
  const job = career.working ? jobById(career.working) : null;

  if (!job) {
    return (
      <section className={styles.bar} aria-label="Job ticket">
        <div className={styles.row}>
          <span className={styles.title}>No car on the bay</span>
          <Button size="sm" variant="ghost" onClick={onShop}>Job board</Button>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.bar} aria-label="Job ticket">
      <div className={styles.row}>
        <button type="button" className={styles.head} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          <span className={styles.title}>{job.customer.name}, {job.customer.car}</span>
          <ChevronDown size={15} aria-hidden="true" className={styles.chevron} />
        </button>
        <Button size="sm" variant="ghost" onClick={onShop}>Job board</Button>
      </div>
      {open && (
        <div className={styles.body}>
          <p className={styles.says}>&ldquo;{job.says}&rdquo;</p>
          <p className={styles.wants}><b>They want:</b> {job.wants}</p>
          <div className={styles.sub}>Work order</div>
          <ul className={styles.list}>{job.work.map((w) => <li key={w}>{w}</li>)}</ul>
          <div className={styles.sub}>When it goes home, it has to</div>
          <ul className={styles.list}>
            {job.checks.map((c) => (
              <li key={c.label}>{c.label}{HOW_TO_SEE[c.type] && <span className={styles.how}>{HOW_TO_SEE[c.type]}</span>}</li>
            ))}
          </ul>
          {job.build && <p className={styles.note}>An engine-building job: the engine stand's Build is open, and every part you choose is on the customer. Build to their list, then log and tune what you built.</p>}
          <div className={styles.actions}>
            <Button size="sm" onClick={onHandBack}>Hand back the car</Button>
          </div>
        </div>
      )}
    </section>
  );
}
