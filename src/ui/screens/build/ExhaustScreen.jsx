/**
 * BUILD > Bolt-ons (the route keeps its old id, `exhaust`).
 *
 * The parts that bolt on without changing what the engine is: the cold air intake, the
 * long-tube headers and the cat-back, then the exhaust pipe's diameter and how far that
 * sits from the shop-rule ideal for this build. Induction keeps what forces air in: the
 * turbo, the supercharger, their intercooler, and nitrous.
 *
 * `idealExhaustDia` is the shell's: it also feeds `exhaustDiaError`, which several
 * other consumers (the score breakdown, the dyno payload) read, so the shell keeps
 * owning the one computation rather than this screen recomputing half of it.
 */

import { Flame } from 'lucide-react';
import React from 'react';

import { EXHAUST_DIA_OPTS, MOD_INFO } from '../../../sim/index.js';
import { BuildSection } from '../../components/BuildSection.jsx';
import { ExpandableInfo } from '../../components/ExpandableInfo.jsx';
import { PartRow } from '../../components/PartRow.jsx';
import { Seg } from '../../primitives/Seg.jsx';
import { ACTIONS } from '../../state/reducer.js';
import { useBuild } from '../../state/StoreProvider.jsx';

import styles from './ExhaustScreen.module.css';

// Keep reading label/blurb off MOD_INFO rather than copying the strings, or
// this list forks from the catalogue it is meant to be a view onto.
const MODS_HERE = ['intake', 'headers', 'exhaust'];

/**
 * @param {object} props
 * @param {boolean} props.active whether this is BUILD's open section
 * @param {(section: string) => void} props.onToggle opens or closes a BUILD section
 * @param {number} props.idealExhaustDia the shop-rule ideal diameter for this
 *   build's displacement and boost, in inches
 * @returns {React.ReactElement}
 */
export function ExhaustScreen({ active, onToggle, idealExhaustDia }) {
  const [build, dispatch] = useBuild();
  const { exhaustDiaIdx, turboOn, boostCurve, mods } = build;

  // Fitting a part (or taking it off) changes airflow but does NOT edit your logged VE
  // table: TUNE › AIRFLOW shows the gap, and you correct it from a log once you know why.
  const toggleMod = (key) => dispatch({ type: ACTIONS.SET_BUILD_FIELD, field: 'mods', value: { ...mods, [key]: !mods[key] } });

  return (
    <BuildSection
      active={active} onClick={() => onToggle('exhaust')}
      icon={Flame} label="Bolt-ons"
      sub={[EXHAUST_DIA_OPTS[exhaustDiaIdx].label, ...MODS_HERE.filter((k) => mods[k]).map((k) => MOD_INFO[k].label.toLowerCase())].join(', ')}
    >
      <div className={styles.list}>
        {MODS_HERE.map((key) => (
          <PartRow key={key} label={MOD_INFO[key].label} blurb={MOD_INFO[key].blurb} fitted={!!mods[key]} onToggle={() => toggleMod(key)} />
        ))}
      </div>

      <div className={styles.label}>Exhaust Diameter</div>
      <Seg variant="rule" equal label="Exhaust Diameter" options={EXHAUST_DIA_OPTS.map((o) => ({ label: o.label, id: o.label }))} value={EXHAUST_DIA_OPTS[exhaustDiaIdx].label} onChange={(v) => dispatch({ type: ACTIONS.SET_BUILD_FIELD, field: 'exhaustDiaIdx', value: EXHAUST_DIA_OPTS.findIndex((o) => o.label === v) })} />
      <div className={styles.idealNote}>
        Estimated ideal for this build: ~{idealExhaustDia.toFixed(2)} in
        {turboOn && Math.max(...boostCurve) > 0 && <span className={styles.raisedByBoost}> (raised by boost)</span>}
      </div>
      <ExpandableInfo title="Why exhaust diameter isn't just 'bigger is better'">
        Undersized piping restricts flow at high RPM, choking VE right when the engine wants air moving fastest. Oversized piping does the opposite at low RPM — exhaust velocity drops, scavenging gets lazy, and low-end response suffers.
        <br /><br />The long-standing shop rule is about <b className={styles.em}>one inch of total pipe diameter per 100 crank horsepower</b>. Note that this follows POWER, not just engine size — which is why adding boost raises the ideal diameter for the very same engine. This sandbox estimates that target from your displacement and boost, and shows how far your choice sits from it.
      </ExpandableInfo>
    </BuildSection>
  );
}
