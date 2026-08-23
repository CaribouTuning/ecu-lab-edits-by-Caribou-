/**
 * DYNO > SCORE (the scorecard for the last pull).
 *
 * `scores` is the shell's — DASH's StatsScreen renders the same memo, so it
 * stays a shell-level computation rather than being repeated per screen.
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
import { statusColor, T } from '../../theme.js';

/**
 * @typedef {object} Scores
 * @property {number} pull
 * @property {{score: number, label: string, deductions: string[], advisories?: string[]}} tuning
 * @property {{score: number, label: string, deductions: string[]}} engineer
 */

/**
 * @param {object} props
 * @param {Scores} props.scores the shell's — see file header
 * @returns {React.ReactElement}
 */
export function ScoreScreen({ scores }) {
  const [session] = useSession();
  const { bestScore } = session;

  return (
    <>
      <Eyebrow icon={Trophy}>Scorecard</Eyebrow>
      <Panel style={{ marginBottom: 10, background: T.accBg, border: `1px solid ${T.acc}`, textAlign: 'center' }}>
        <div style={{ fontSize: 10, color: T.accInk, letterSpacing: 1.5, fontWeight: 800 }}>PULL SCORE</div>
        <div style={{ fontSize: 40, fontWeight: 800, fontFamily: T.mono, color: T.accInk, lineHeight: 1.1 }}>{scores.pull}</div>
        <div style={{ fontSize: 11.5, color: scores.pull >= bestScore ? T.ok : T.ink2, fontWeight: 700, marginTop: 2 }}>
          {scores.pull >= bestScore ? 'NEW BEST' : `Best: ${bestScore}`}
        </div>
      </Panel>
      <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
        {/** @type {Array<[string, {score: number, label: string}]>} */ (
          [['TUNING SCORE', scores.tuning], ['ENGINEER SCORE', scores.engineer]]
        ).map(([label, s]) => {
          const c = statusColor(s.score);
          return (
            <Panel key={label} style={{ flex: 1 }}>
              <div style={{ fontSize: 9.5, color: T.ink2, letterSpacing: 1, fontWeight: 700 }}>{label}</div>
              <div style={{ fontSize: 28, fontWeight: 800, fontFamily: T.mono, color: c, marginTop: 2 }}>{s.score}</div>
              <div style={{ fontSize: 11, color: c, fontWeight: 700 }}>{s.label}</div>
            </Panel>
          );
        })}
      </div>
      <Note>Pull Score rewards actual output (peak whp + torque), scaled by how clean (Tuning) and how sound (Engineer) the build is — a big, slightly imperfect pull can still out-score a small, spotless one. It has no ceiling; every pull is a chance to beat your best.</Note>
      {(scores.tuning.deductions.length > 0 || scores.engineer.deductions.length > 0) && (
        <Panel tight style={{ marginBottom: 16, fontSize: 11.5, color: T.ink2, fontFamily: T.mono, lineHeight: 1.8 }}>
          {scores.tuning.deductions.map((d, i) => <div key={'t' + i}>{d}</div>)}
          {scores.engineer.deductions.map((d, i) => <div key={'e' + i}>{d}</div>)}
        </Panel>
      )}
      {scores.tuning.advisories?.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 10, letterSpacing: 1, color: T.ink3, fontWeight: 800, marginBottom: 4 }}>
            HARDWARE TRADE-OFFS · NOT SCORED
          </div>
          {scores.tuning.advisories.map((a, i) => (
            <div key={i} style={{ fontSize: 11.5, color: T.ink2, lineHeight: 1.5 }}>{a}</div>
          ))}
        </div>
      )}
    </>
  );
}
