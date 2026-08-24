/**
 * TUNE > FUEL (air-fuel ratio target).
 *
 * `calAdvice` is the shell's — see the note in `TimingScreen.jsx` for why it is a
 * shell-level computation rather than one this screen (or SPARK's) repeats.
 */

import React from 'react';

import { Droplets } from 'lucide-react';

import { SelectionDock } from '../../components/SelectionDock.jsx';
import { TuningGrid } from '../../components/TuningGrid.jsx';
import { ExpandableInfo } from '../../components/ExpandableInfo.jsx';
import { Eyebrow } from '../../primitives/Eyebrow.jsx';
import { ACTIONS } from '../../state/reducer.js';
import { useTune } from '../../state/StoreProvider.jsx';

import styles from './AfrScreen.module.css';

/** @typedef {import('../../components/TuningGrid.jsx').Selection} Selection */
/** @typedef {import('./TimingScreen.jsx').CalAdvice} CalAdvice */

/**
 * @param {object} props
 * @param {CalAdvice} props.calAdvice the shell's — also read by the SPARK screen
 * @returns {React.ReactElement}
 */
export function AfrScreen({ calAdvice }) {
  const [tune, dispatch] = useTune();
  const { afr, selection } = tune;
  /** @param {Selection|null} value */
  const setSelection = (value) => dispatch({ type: ACTIONS.SET_TUNE_FIELD, field: 'selection', value });

  return (
    <>
      <div className={styles.wrap}>
        <Eyebrow icon={Droplets}>Air-Fuel Ratio Target</Eyebrow>
        <div className={styles.intro}>Target air:fuel ratio the ECU aims for. Divide by 14.7 to read it as lambda.</div>
        <TuningGrid data={afr} min={10} max={18} decimals={1} selection={selection} setSelection={setSelection} />
        {calAdvice.wrongMix.length > 0 && (
          <div className={styles.banner}>
            <div className={styles.label}>
              {calAdvice.wrongMix.length} HIGH-LOAD CELLS OFF BEST POWER
            </div>
            <div className={styles.body}>
              Best-power mixture shifts with boost — richer as cylinder pressure rises. These cells are judged on what the engine actually <b className={styles.em}>delivered</b>, not on what the table commanded: if your MAF or injector scaling is off, the two are not the same number, and the delivered one is the one the pistons feel. The suggestion is the value to type into the cell to land on target.
            </div>
            {calAdvice.wrongMix.slice(0, 5).map((c, i) => (
              <div key={i} className={styles.cell} data-richen={c.delta < 0 ? 'true' : 'false'}>
                {c.map} kPa / {c.rpm} RPM: {c.current}:1 → {c.suggested}:1 {c.delta < 0 ? '(richen)' : '(lean out)'} · delivered {c.delivered}, wants {c.target}
              </div>
            ))}
            {calAdvice.wrongMix.length > 5 && <div className={styles.more}>…and {calAdvice.wrongMix.length - 5} more</div>}
          </div>
        )}

        <ExpandableInfo title="Why AFR trades power for safety">
          14.7:1 is stoichiometric — burns all the fuel and oxygen with nothing left over, great for emissions and cruise. Peak power sits richer, because the extra fuel absorbs heat as it vaporizes, cooling combustion enough to make more power before knock becomes the limit. Go leaner than that under load and you lose power and raise both knock risk and exhaust gas temperature at once — which is why lean-under-boost is especially dangerous to valves and pistons.
          <br /><br /><b className={styles.em}>Best power is not one number.</b> Naturally aspirated engines make best torque near lambda 0.85-0.92 (about 12.5-13.5:1 on gasoline). Under boost, best power moves richer — near lambda 0.82-0.85 (about 12.0-12.5:1) — because you are deliberately buying charge cooling to hold off knock. This sandbox moves its best-power target with your boost level, so the same AFR table that was ideal naturally aspirated reads genuinely lean once you are on 8 psi.
          <br /><br /><b className={styles.em}>Reading it in lambda:</b> lambda is AFR divided by the fuel's stoichiometric point, so lambda 0.85 means the same relative richness on any fuel. That is why tuners talk in lambda once E85 enters the picture — 12.5:1 means something completely different on E85 than on pump gas.
          <br /><br /><b className={styles.em}>As a beginner:</b> when in doubt, go richer (a lower number), not leaner. A rich cell costs a little power; a lean cell under load is how you actually damage something.
        </ExpandableInfo>
      </div>
      <div className={styles.spacer} />
      <SelectionDock data={afr} setData={(value) => dispatch({ type: ACTIONS.SET_TABLE, table: 'afr', value })} selection={selection} min={10} max={18} decimals={1} unit=":1" onClose={() => setSelection(null)} kind="afr" />
    </>
  );
}
