/**
 * TUNE > AIR (volumetric efficiency).
 *
 * `veAdvice` is the shell's: it also feeds BUILD's Engine Architecture screen (the
 * stale-VE callout there), so the shell keeps owning the one computation rather than
 * this screen recomputing half of it. `veTruth` is the same story — it also feeds
 * the shell's `calAdvice` and the dyno payload — so it is passed down purely as the
 * value ACCEPT RE-LOGGED VALUES writes into the table, not recomputed here.
 */

import React from 'react';

import { Grid3x3, Info } from 'lucide-react';

import { SelectionDock } from '../../components/SelectionDock.jsx';
import { TuningGrid } from '../../components/TuningGrid.jsx';
import { ExpandableInfo } from '../../components/ExpandableInfo.jsx';
import { Button } from '../../primitives/Button.jsx';
import { Eyebrow } from '../../primitives/Eyebrow.jsx';
import { ACTIONS } from '../../state/reducer.js';
import { useTune } from '../../state/StoreProvider.jsx';

import styles from './VeScreen.module.css';

/** @typedef {import('../../components/TuningGrid.jsx').Selection} Selection */

/**
 * @typedef {object} VeAdvice
 * @property {boolean} inSync
 * @property {number} maxAbs
 * @property {Array<{rpmText: string, text: string, cells: string[]}>} recs
 */

/**
 * @param {object} props
 * @param {VeAdvice|null} props.veAdvice the shell's — also read by BUILD's Engine
 *   Architecture screen, so it stays a shell-level computation
 * @param {number[][]} props.veTruth the hardware's true VE, as currently built —
 *   the shell's, also read by `calAdvice` and the dyno payload
 * @returns {React.ReactElement}
 */
export function VeScreen({ veAdvice, veTruth }) {
  const [tune, dispatch] = useTune();
  const { ve, selection } = tune;
  /** @param {Selection|null} value */
  const setSelection = (value) => dispatch({ type: ACTIONS.SET_TUNE_FIELD, field: 'selection', value });
  const recalcVE = () => dispatch({ type: ACTIONS.SET_TABLE, table: 've', value: veTruth });

  return (
    <>
      <div className={styles.wrap}>
        <Eyebrow icon={Grid3x3}>Volumetric Efficiency</Eyebrow>
        <div className={styles.intro}>How completely the cylinder fills at each engine speed and load. Rows are manifold pressure (MAP kPa &mdash; about 100 is wide open, higher is boost); columns are RPM. Tap any cell for reference data.</div>
        <TuningGrid data={ve} min={10} max={130} decimals={0} selection={selection} setSelection={setSelection} />

        {veAdvice && (
          veAdvice.inSync ? (
            <div className={styles.inSyncBanner}>
              <Info size={15} className={styles.inSyncIcon} />
              <div>VE table matches your current hardware. Nothing to correct.</div>
            </div>
          ) : (
            <div className={styles.staleBanner}>
              <div className={styles.staleHead}>
                <div className={styles.staleLabel}>VE OUT OF SYNC WITH HARDWARE</div>
                <div className={styles.staleGap}>{veAdvice.maxAbs.toFixed(0)}% max gap</div>
              </div>
              <div className={styles.staleBody}>
                Your hardware changed but this table is still the old log. Here is what re-logging airflow on the dyno would actually show:
              </div>
              {veAdvice.recs.map((r, i) => (
                <div key={i} className={styles.rec}>
                  <div className={styles.recTitle}>{r.rpmText}</div>
                  <div className={styles.recText}>{r.text}</div>
                  <div className={styles.recCells}>{r.cells.join('   ')}</div>
                </div>
              ))}
              {/* Was width:100%. It is the only action in this advisory box and
                  reads as one at its own width; the box is already the full
                  content column, so stretching it only made it wider. */}
              <Button onClick={recalcVE} style={{ marginTop: 4 }}>
                ACCEPT RE-LOGGED VALUES
              </Button>
              <div className={styles.acceptNote}>Or type them in yourself — these are the measured targets, not a suggestion.</div>
            </div>
          )
        )}

        <ExpandableInfo title="What VE actually means">
          VE compares the air trapped in the cylinder to the theoretical maximum the swept volume could hold. It rises with RPM as intake tuning matches resonance, then falls as the valves cannot flow fast enough — that fall is why every N/A engine has a torque peak. More air here means more fuel needed to hit a given AFR and more potential torque; VE is really the master variable, and timing/AFR are how you extract power from whatever air is already there.
          <br /><br /><b className={styles.em}>As a beginner:</b> leave VE alone at first. It is set by real hardware (intake, heads, cams) — the Bolt-Ons on BUILD already move it for you when you install parts. Spend your early pulls learning TIMING and AFR before you start hand-editing VE.
        </ExpandableInfo>
      </div>
      <div className={styles.spacer} />
      <SelectionDock data={ve} setData={(value) => dispatch({ type: ACTIONS.SET_TABLE, table: 've', value })} selection={selection} min={10} max={130} decimals={0} unit="%" onClose={() => setSelection(null)} kind="ve" />
    </>
  );
}
