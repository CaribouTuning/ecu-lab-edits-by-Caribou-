/**
 * HOME > Career & Last Pull.
 *
 * Career totals, and the headline figures from the most recent dyno pull. Nothing
 * here is computed: `scores` is the shell's, because the DYNO tab's score panel reads
 * the same object and computing it twice would be two answers to one question.
 */

import { Trophy } from 'lucide-react';
import React from 'react';

import { BuildSection } from '../../primitives/BuildSection.jsx';
import { Note } from '../../primitives/Note.jsx';
import { StatTile } from '../../primitives/StatTile.jsx';
import { useSession } from '../../state/StoreProvider.jsx';
import { statusTone } from '../../theme.js';

/**
 * @typedef {object} Scores
 * @property {number} pull
 * @property {{score: number}} tuning
 * @property {{score: number}} engineer
 */

/**
 * @param {object} props
 * @param {boolean} props.active whether this is HOME's open section
 * @param {(section: string) => void} props.onToggle opens or closes a HOME section
 * @param {Scores|null} props.scores null until a pull has finished
 * @returns {React.ReactElement}
 */
export function StatsScreen({ active, onToggle, scores }) {
  const [session] = useSession();
  const { bestScore, totalScore, pullCount } = session;
  // `SessionState.result` is typed `object` — see the note on the same cast in
  // LiveScreen.jsx.
  const result = /** @type {Record<string, any>|null} */ (session.result);

  return (
    <BuildSection
      active={active} onClick={() => onToggle('stats')}
      icon={Trophy} label="Career & Last Pull"
      sub={result ? `Best ${bestScore} · ${pullCount} pulls logged` : `${pullCount} pulls logged`}
    >
      <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
        <StatTile label="BEST PULL" value={bestScore} tone="acc" />
        <StatTile label="CAREER TOTAL" value={totalScore} tone="alt" />
        <StatTile label="PULLS" value={pullCount} />
      </div>
      {result && scores ? (
        <>
          <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
            <StatTile label="PEAK POWER" value={result.peakHp} unit="whp" tone="acc" />
            <StatTile label="PEAK TORQUE" value={result.peakTq} unit="lb-ft" tone="alt" />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <StatTile label="PULL SCORE" value={scores.pull} tone="acc" />
            <StatTile label="TUNING" value={scores.tuning.score} tone={statusTone(scores.tuning.score)} />
            <StatTile label="ENGINEER" value={scores.engineer.score} tone={statusTone(scores.engineer.score)} />
          </div>
        </>
      ) : <Note>No dyno pull logged yet — head to DYNO and run one.</Note>}
    </BuildSection>
  );
}
