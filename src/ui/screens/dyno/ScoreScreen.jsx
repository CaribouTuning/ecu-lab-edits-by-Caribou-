/**
 * DYNO > SCORE (the scorecard for the last pull).
 *
 * `scores` is the shell's — DASH's StatsScreen renders the same object, so it stays a
 * shell-level read rather than being repeated per screen. It is what the last pull
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
import { Panel } from '../../primitives/Panel.jsx';
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
      <Panel className={styles.pullPanel}>
        <div className={styles.pullLabel}>PULL SCORE</div>
        <div className={styles.pullValue}>{scores.pull}</div>
        {/* NEW BEST is a fact about the run that produced this number, decided when it
            was banked — not a live `pull >= bestScore` comparison, which is true by
            construction on every pull because banking has already folded this pull
            into `bestScore` by the time this renders. `bestScore` is still read here
            for the figure the other branch names. */}
        <div className={styles.pullBest} data-best={scores.wasBest ? 'true' : 'false'}>
          {scores.wasBest ? 'NEW BEST' : `Best: ${bestScore}`}
        </div>
      </Panel>
      <div className={styles.cardsRow}>
        {/** @type {Array<[string, {score: number, label: string}]>} */ (
          [['TUNING SCORE', scores.tuning], ['ENGINEER SCORE', scores.engineer]]
        ).map(([label, s]) => {
          const c = statusColor(s.score);
          return (
            <Panel key={label} className={styles.scoreCard}>
              <div className={styles.scoreLabel}>{label}</div>
              <div className={styles.scoreValue} style={{ color: c }}>{s.score}</div>
              <div className={styles.scoreTag} style={{ color: c }}>{s.label}</div>
            </Panel>
          );
        })}
      </div>
      <Note>Pull Score rewards actual output (peak whp + torque), scaled by how clean (Tuning) and how sound (Engineer) the build is — a big, slightly imperfect pull can still out-score a small, spotless one. It has no ceiling; every pull is a chance to beat your best.</Note>
      {(scores.tuning.deductions.length > 0 || scores.engineer.deductions.length > 0) && (
        <Panel tight className={styles.deductions}>
          {scores.tuning.deductions.map((d, i) => <div key={'t' + i}>{d}</div>)}
          {scores.engineer.deductions.map((d, i) => <div key={'e' + i}>{d}</div>)}
        </Panel>
      )}
      {scores.tuning.advisories?.length > 0 && (
        <div className={styles.advisoriesWrap}>
          <div className={styles.advisoriesLabel}>
            HARDWARE TRADE-OFFS · NOT SCORED
          </div>
          {scores.tuning.advisories.map((a, i) => (
            <div key={i} className={styles.advisory}>{a}</div>
          ))}
        </div>
      )}
    </>
  );
}
