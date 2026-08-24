/**
 * TUNE > SPARK (ignition timing).
 *
 * `calAdvice` is the shell's: it also feeds the FUEL screen (the wrong-mixture
 * advisory there reads a different slice of the same object), so the shell keeps
 * owning the one computation rather than each screen recomputing its own half.
 */

import React from 'react';

import { Zap } from 'lucide-react';

import { SPARK_MAX_DEG, SPARK_MIN_DEG } from '../../../sim/index.js';
import { AdvisorPanel } from '../../components/AdvisorPanel.jsx';
import { SelectionDock } from '../../components/SelectionDock.jsx';
import { TuningGrid } from '../../components/TuningGrid.jsx';
import { ExpandableInfo } from '../../components/ExpandableInfo.jsx';
import { Eyebrow } from '../../primitives/Eyebrow.jsx';
import { Panel } from '../../primitives/Panel.jsx';
import { ACTIONS } from '../../state/reducer.js';
import { useTune } from '../../state/StoreProvider.jsx';

import styles from './SparkScreen.module.css';

/** @typedef {import('../../components/TuningGrid.jsx').Selection} Selection */

/**
 * @typedef {object} CalAdvice
 * @property {Array<{map: number, rpm: number, current: number, suggested: number}>} overAdvanced
 * @property {Array<object>} underAdvanced
 * @property {Array<object>} pastMbt
 * @property {Array<{map: number, rpm: number, current: number, suggested: number, delta: number, delivered: number, target: number}>} wrongMix
 */

/**
 * @param {object} props
 * @param {CalAdvice} props.calAdvice the shell's — also read by the FUEL screen
 * @returns {React.ReactElement}
 */
export function SparkScreen({ calAdvice }) {
  const [tune, dispatch] = useTune();
  const { timing, selection } = tune;
  /** @param {Selection|null} value */
  const setSelection = (value) => dispatch({ type: ACTIONS.SET_TUNE_FIELD, field: 'selection', value });

  return (
    <>
      <div className={styles.wrap}>
        <div className={styles.main}>
          <Eyebrow icon={Zap}>Ignition Timing</Eyebrow>
          <div className={styles.intro}>Degrees of spark advance before top dead center (° BTDC).</div>
          <TuningGrid data={timing} min={SPARK_MIN_DEG} max={SPARK_MAX_DEG} decimals={0} selection={selection} setSelection={setSelection} />
          {calAdvice.overAdvanced.length > 0 ? (
            <div className={styles.dangerBanner}>
              <div className={styles.dangerLabel}>
                {calAdvice.overAdvanced.length} CELLS BEYOND THE KNOCK LIMIT
              </div>
              <div className={styles.dangerBody}>
                Your current hardware will not tolerate this much advance here. These cells are asking for more timing than the charge, octane and compression allow:
              </div>
              {calAdvice.overAdvanced.slice(0, 5).map((c, i) => (
                <div key={i} className={styles.dangerCell}>
                  {c.map} kPa / {c.rpm} RPM: {c.current}° → {c.suggested}°
                </div>
              ))}
              {calAdvice.overAdvanced.length > 5 && <div className={styles.dangerMore}>…and {calAdvice.overAdvanced.length - 5} more</div>}
              <div className={styles.dangerFooter}>Edit them yourself — a calibration is yours to make, not something the app should silently rewrite.</div>
            </div>
          ) : calAdvice.underAdvanced.length > 4 ? (
            <Panel tight className={styles.advisoryPanel}>
              <b className={styles.em}>Timing left on the table.</b> {calAdvice.underAdvanced.length} cells are more than 3° below what this build would tolerate. Safe, but you are giving away torque — advance them a little at a time and pull between each change.
            </Panel>
          ) : calAdvice.pastMbt.length > 0 ? (
            <Panel tight className={styles.advisoryPanel}>
              <b className={styles.em}>Past peak torque.</b> {calAdvice.pastMbt.length} cells command more advance than the burn can use — the charge is already finishing where it should, so the extra degrees are working against the piston on its way up rather than adding torque. Not dangerous here — these cells are inside the knock limit — but pulling them back gains a little power and buys margin.
            </Panel>
          ) : (
            <div className={styles.okBanner}>
              Spark table sits within the knock limit for this hardware.
            </div>
          )}

          <ExpandableInfo title="Why the app never rewrites your spark or fuel tables">
            The VE table auto-syncs because volumetric efficiency is a <b className={styles.emInk}>measurement of the hardware</b> — swap a cam and a tuner simply re-logs airflow, and the numbers are what they are.
            <br /><br />Spark and fuel are different: they are <b className={styles.emInk}>your calibration</b>, a set of judgement calls about how much risk to take for how much power. A real ECU does not retune itself when you bolt on a turbo — it keeps running the old numbers into the new hardware, which is exactly how engines get hurt.
            <br /><br />So the app tells you what the hardware will now tolerate, and leaves the editing to you. That gap between "what the engine can take" and "what your table asks for" is the entire job.
          </ExpandableInfo>

          <ExpandableInfo title="Why timing has a sweet spot (MBT)">
            Combustion is not instant — the flame front takes time to burn through the mixture. Timing decides when the burn starts so peak cylinder pressure lands just after top dead center, where it does useful work. Advance too far and pressure peaks before the piston is ready, fighting the crank and risking knock; retard too far and you are burning fuel after the piston has already started down, wasting it as heat. MBT is the earliest timing that still lands the burn right — past it, more advance buys almost nothing, only risk.
            <br /><br /><b className={styles.emInk}>As a beginner:</b> nudge one cell 1-2° at a time, run a pull, and read the log. If it comes back clean with no knock event, you probably still have room. If you see a knock warning, that cell is your new ceiling — back off to what the log suggests and move on.
          </ExpandableInfo>
        </div>
        <AdvisorPanel headline="Advisor" tone="info">
          <p>Placeholder — filled in by the next task.</p>
        </AdvisorPanel>
      </div>
      <div className={styles.spacer} />
      <SelectionDock data={timing} setData={(value) => dispatch({ type: ACTIONS.SET_TABLE, table: 'timing', value })} selection={selection} min={SPARK_MIN_DEG} max={SPARK_MAX_DEG} decimals={0} unit="°" onClose={() => setSelection(null)} kind="timing" />
    </>
  );
}
