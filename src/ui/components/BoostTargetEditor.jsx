/**
 * The boost target: what the engine computer's boost control aims for at each speed, the
 * curve TUNE → BOOST edits (the turbo that makes the boost is BUILD's). One setting,
 * `build.boostCurve`, as every pull, the guide and the advisor read it.
 */

import React from 'react';

import { COMPRESSOR_OPTS, RPM, clamp } from '../../sim/index.js';
import { Button } from '../primitives/Button.jsx';
import { Note } from '../primitives/Note.jsx';
import { Panel } from '../primitives/Panel.jsx';
import { ACTIONS } from '../state/reducer.js';
import { useBuild } from '../state/StoreProvider.jsx';
import { useUnits } from '../units.js';
import { ExpandableInfo } from './ExpandableInfo.jsx';

import styles from '../screens/build/InductionScreen.module.css';

/** @returns {React.ReactElement|null} */
export function BoostTargetEditor() {
  const [build, dispatch] = useBuild();
  const U = useUnits();
  const { boostCurve, boostSel, compressorIdx } = build;
  if (!build.turboOn) return null;
  const ceiling = COMPRESSOR_OPTS[compressorIdx].boostCeiling;
  const peakOverCeiling = Math.max(...boostCurve) > ceiling;
  const selectedOverCeiling = boostCurve[boostSel] > ceiling;
  // Every boost-curve write goes through here. Rebuilding from the RPM axis makes it
  // structurally impossible for the curve to be the wrong length or to contain a
  // non-number, which is what previously let a single edit poison the whole sim.
  const setBoostAt = (i, value) => dispatch({
    type: ACTIONS.SET_BUILD_FIELD,
    field: 'boostCurve',
    value: RPM.map((_, idx) => clamp(Number(idx === i ? value : boostCurve[idx]) || 0, 0, 25)),
  });
  return (
    <section aria-label="Boost target">
      <div className={styles.boostLabel}>Boost target curve</div>

      <Panel tight style={{ marginBottom: 10 }}>
        {/* Tap a bar to select that RPM point, then edit it below with full-width controls. */}
        <div data-testid="boost-columns" className={styles.columns}>
          {RPM.map((r, i) => {
            const on = boostSel === i;
            const over = boostCurve[i] > ceiling;
            return (
              <button
                key={r} onClick={() => dispatch({ type: ACTIONS.SET_BOOST_SEL, value: i })}
                className={styles.col} data-selected={on ? 'true' : 'false'}
              >
                <div className={styles.colValue} data-selected={on ? 'true' : 'false'} data-over={over ? 'true' : 'false'}>
                  {U.metric ? U.boost(boostCurve[i]).toFixed(2) : boostCurve[i]}
                </div>
                <div
                  className={styles.colFill} data-selected={on ? 'true' : 'false'} data-over={over ? 'true' : 'false'}
                  style={{ height: `${(boostCurve[i] / 25) * 72}%`, minHeight: boostCurve[i] > 0 ? 3 : 0 }}
                />
                <div className={styles.colRpm} data-selected={on ? 'true' : 'false'}>
                  {r >= 1000 ? (r / 1000).toFixed(1) + 'k' : r}
                </div>
              </button>
            );
          })}
        </div>
      </Panel>

      <Panel tight style={{ marginBottom: 10 }}>
        <div className={styles.editorHead}>
          <span className={styles.editorRpm}>{RPM[boostSel]} RPM</span>
          <span className={styles.editorValue} data-over={selectedOverCeiling ? 'true' : 'false'}>
            {U.metric ? U.boost(boostCurve[boostSel]).toFixed(2) : boostCurve[boostSel]}<span className={styles.editorUnit}>{U.boostUnit}</span>
          </span>
        </div>
        <input type="range" min={0} max={25} step={1} value={boostCurve[boostSel]}
          onChange={(e) => setBoostAt(boostSel, Number(e.target.value))}
          className={styles.slider} />
        <div className={styles.stepRow}>
          {[-5, -1, 1, 5].map((d) => (
            <button key={d} onClick={() => setBoostAt(boostSel, (boostCurve[boostSel] ?? 0) + d)}
              className={styles.stepButton}>
              {/* The curve is held in whole psi; metric labels each step by what it adds. */}
              {d > 0 ? '+' : ''}{U.metric ? U.boost(d).toFixed(2) : d}
            </button>
          ))}
        </div>
        <div className={styles.presetRow}>
          <Button variant="ghost" size="sm" style={{ flex: 1 }}
            onClick={() => dispatch({ type: ACTIONS.SET_BUILD_FIELD, field: 'boostCurve', value: RPM.map(() => clamp(Number(boostCurve[boostSel]) || 0, 0, 25)) })}>
            Flat across all
          </Button>
          <Button variant="ghost" size="sm" style={{ flex: 1 }}
            onClick={() => { const peak = boostCurve[boostSel]; dispatch({ type: ACTIONS.SET_BUILD_FIELD, field: 'boostCurve', value: RPM.map((r) => Math.round(peak * clamp((r - 1500) / 2600, 0, 1))) }); }}>
            Spool ramp
          </Button>
          {/* Built from RPM so the curve can never be shorter than the
              axis. A hand-written literal previously had seven entries
              for eight breakpoints, and the next edit put NaN through
              the entire simulation. */}
          <Button variant="ghost" size="sm" style={{ flex: 1 }}
            onClick={() => dispatch({ type: ACTIONS.SET_BUILD_FIELD, field: 'boostCurve', value: RPM.map(() => 0) })}>
            Zero
          </Button>
        </div>
        <div className={styles.ceilingWarning} data-over={peakOverCeiling ? 'true' : 'false'}>
          Compressor efficient to ~{U.fmtBoost(ceiling, U.metric ? 2 : 0)}{peakOverCeiling ? ' — you are past it, expect hot inefficient air' : ''}
        </div>
      </Panel>

      <Note tone="warn">Stock calibrations have no real tuning above ~101 kPa. Adding boost without retarding SPARK and richening FUEL in the high-MAP rows will knock hard — run a pull and read the log.</Note>

      <ExpandableInfo title="Why boost costs you timing">
        Boost packs more air and fuel into the same cylinder volume before combustion starts, raising peak pressure and temperature for a given amount of spark advance. The same timing that was safe with no boost becomes knock-prone at 8-10 psi through the same head and pistons — which is why boosted tunes run less initial timing than a naturally aspirated tune, and why timing has to come out further as boost climbs. Set your target here, then dial in SPARK and FUEL to match.
      </ExpandableInfo>
    </section>
  );
}
