/**
 * DYNO > SCORE (the scorecard for the last pull).
 *
 * `scores` is the shell's, a shell-level read rather than one this screen repeats. It is what the last pull
 * MEASURED, banked at pull time (BANK_PULL) and never recomputed; `stale` is the
 * shell's answer to whether the setup has moved since, which needs the live store
 * state this screen deliberately does not reach for.
 *
 * `bestScore` is plain session state with readers in both this screen and the
 * shell's own `doRun` (which banks a new best), so it is read straight off the
 * store here rather than threaded down as a prop.
 */

import React from 'react';

import { Trophy } from 'lucide-react';

import { Eyebrow } from '../../primitives/Eyebrow.jsx';
import { Note } from '../../primitives/Note.jsx';
import { useSession } from '../../state/StoreProvider.jsx';
import { statusColor } from '../../theme.js';

import styles from './ScoreScreen.module.css';

/**
 * @typedef {object} Scores
 * @property {number} pull
 * @property {boolean} wasBest whether this run beat the standing best when it landed
 * @property {{score: number, label: string, deductions: string[], advisories?: string[]}} tuning
 * @property {{score: number, label: string, deductions: string[]}} engineer
 */

/**
 * @param {object} props
 * @param {Scores} props.scores the shell's — see file header
 * @param {boolean} [props.stale] the setup has changed since this pull was run
 * @returns {React.ReactElement}
 */
export function ScoreScreen({ scores, stale = false }) {
  const [session] = useSession();
  const { bestScore } = session;

  return (
    <>
      <Eyebrow icon={Trophy}>Scorecard</Eyebrow>
      {stale && (
        <Note tone="warn">
          <b>This is the last pull, from before your latest change.</b> The setup on
          screen — build, calibration and dyno load — is not the one these numbers were
          measured on, so they have been left exactly as they were rather than re-graded
          against a run that never happened. Run another pull to score what you have now.
        </Note>
      )}
      {/* One scorecard, read left to right: what the pull scored, then the two grades
          that scale it. Ruled columns, not three boxes and a banner. */}
      <section className={styles.sheet} aria-label="Scores for the last pull">
        <div className={styles.cell} data-primary="">
          <div className={styles.label}>Pull score</div>
          <div className={styles.value}>{scores.pull}</div>
          {/* "New best" is a fact about the run that produced this number, decided when it
              was banked — not a live `pull >= bestScore` comparison, which is true by
              construction on every pull because banking has already folded this pull
              into `bestScore` by the time this renders. */}
          <div className={styles.sub} data-best={scores.wasBest ? 'true' : 'false'}>
            {scores.wasBest ? 'New best' : `Best: ${bestScore}`}
          </div>
        </div>
        {/** @type {Array<[string, {score: number, label: string}]>} */ (
          [['Tuning score', scores.tuning], ['Engineer score', scores.engineer]]
        ).map(([label, sc]) => {
          const c = statusColor(sc.score);
          return (
            <div key={label} className={styles.cell}>
              <div className={styles.label}>{label}</div>
              <div className={styles.value}>{sc.score}<span className={styles.of}> / 100</span></div>
              <div className={styles.sub}><i className={styles.dot} style={{ background: c }} aria-hidden="true" />{sc.label}</div>
            </div>
          );
        })}
      </section>
      <p className={styles.explain}>Pull score rewards actual output (peak whp plus torque), scaled by how clean (Tuning) and how sound (Engineer) the build is, so a big, slightly imperfect pull can still out-score a small, spotless one. It has no ceiling: every pull is a chance to beat your best.</p>
      {(scores.tuning.deductions.length > 0 || scores.engineer.deductions.length > 0) && (
        <section className={styles.list} aria-label="What cost points">
          <h3 className={styles.listHead}>What cost points</h3>
          {[...scores.tuning.deductions, ...scores.engineer.deductions].map((d, i) => {
            // "-8 Exhaust diameter..." : the points in their own column, so they line up.
            const m = /^([+\-−]?\d+(?:\.\d+)?)\s+(.*)$/.exec(d);
            return (
              <div key={i} className={styles.row}>
                <span className={styles.pts}>{m ? m[1].replace('-', '−') : ''}</span>
                <span>{m ? m[2] : d}</span>
              </div>
            );
          })}
        </section>
      )}
      {scores.tuning.advisories?.length > 0 && (
        <section className={styles.list} aria-label="Hardware trade-offs">
          <h3 className={styles.listHead}>Hardware trade-offs, not scored</h3>
          {scores.tuning.advisories.map((a, i) => (
            <div key={i} className={styles.row} data-plain-row=""><span>{a}</span></div>
          ))}
        </section>
      )}
    </>
  );
}
