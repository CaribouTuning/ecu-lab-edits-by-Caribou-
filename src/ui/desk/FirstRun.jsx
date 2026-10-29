/**
 * The first time the shop opens in a mode, a few short cards over the 3D shop say how the
 * game goes: in SANDBOX the build, run, pull and fix loop and how to experiment; in CAREER
 * the job board's customers and how a job is done and handed back. Shown once per mode
 * (remembered in this browser), skippable, and never a screen of its own.
 */

import React, { useState } from 'react';

import styles from './FirstRun.module.css';

const STEPS = {
  sandbox: [
    { title: 'This is your shop', text: 'Everything here is real equipment. Click or tap a thing to use it: the build bench, the engine stand, the dyno, or the laptop on the desk.' },
    { title: '1. Build an engine', text: 'At the build bench, pick a factory engine or enter your own. Then go part by part: block, heads and cam, induction, fuel, exhaust.' },
    { title: '2. Start it', text: 'On the engine stand, start it and listen. Hold the throttle to rev it, and watch the sensors and the ECU work live.' },
    { title: '3. Pull it on the dyno', text: 'Run a pull. The curves show the power, and the pull log says what went wrong, in the order to fix it.' },
    { title: '4. Fix it on the laptop', text: 'Open the laptop, change the tables the log points at, and pull again to see what your change did.' },
    { title: 'Experiment', text: 'Nothing adds horsepower by magic. Try a bigger cam, boost or another fuel, and see what the physics says. The bar at the top always shows the next step.' },
  ],
  career: [
    { title: 'Ray’s shop is yours', text: 'You run a tuning shop. The dyno, the stands and the laptop are all here. Click or tap a thing to use it.' },
    { title: '1. Take a job', text: 'The job board on the wall lists today’s customers. Each says what their car does, never what is wrong with it. Take one, and the car goes on the dyno.' },
    { title: '2. Find the fault', text: 'Pull the car on the dyno. The pull log points at what is wrong.' },
    { title: '3. Fix it, prove it', text: 'Fix it on the laptop, then pull again. Power bought with knock or a lean top end does not pass.' },
    { title: '4. Hand it back', text: 'When the pull is clean, hand the car back from its ticket and get paid. Money buys lifts and tools, training opens more of the ECU, and new customers come every day.' },
    { title: 'Pops will text you', text: 'Your uncle sends lessons and goals to the laptop. Read them first: the bar at the top always shows the next step.' },
  ],
};

/** @param {string} key */
// Not under the test runner: the UI tests drive the shop and would find a card over it.
const seen = (key) => { if (/** @type {any} */ (import.meta).env?.MODE === 'test') return true; try { return localStorage.getItem(key) === '1'; } catch { return false; } };

/**
 * @param {{career: boolean}} props
 * @returns {React.ReactElement|null}
 */
export function FirstRun({ career }) {
  const mode = career ? 'career' : 'sandbox';
  const key = `ecu-lab-first-run-${mode}`;
  const [shown, setShown] = useState(() => (seen(key) ? null : mode));
  const [i, setI] = useState(0);
  if (shown !== mode) return null;
  const steps = STEPS[mode];
  const step = steps[i];
  const done = () => { try { localStorage.setItem(key, '1'); } catch { /* private mode: shown again next time */ } setShown(null); };
  const last = i === steps.length - 1;
  return (
    <div className={styles.card} role="dialog" aria-label={`How ${mode === 'career' ? 'CAREER' : 'SANDBOX'} works`}>
      <div className={styles.count}>{i + 1} of {steps.length}</div>
      <h2 className={styles.title}>{step.title}</h2>
      <p className={styles.text}>{step.text}</p>
      <div className={styles.row}>
        <button type="button" className={styles.skip} onClick={done}>{last ? 'Close' : 'Skip'}</button>
        {i > 0 && <button type="button" className={styles.back} onClick={() => setI(i - 1)}>Back</button>}
        <button type="button" className={styles.go} onClick={last ? done : () => setI(i + 1)}>{last ? 'Start' : 'Next'}</button>
      </div>
    </div>
  );
}
