/**
 * BUILD > Exhaust.
 *
 * Pipe diameter, how far that sits from the shop-rule ideal for this build, and the
 * two bolt-ons whose physics live on the exhaust side (Cat-Back Exhaust, Long-Tube
 * Headers) — the other half of the dissolved BoltonsScreen. See InductionScreen for
 * the third (Cold Air Intake).
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
import { Seg } from '../../primitives/Seg.jsx';
import { ACTIONS } from '../../state/reducer.js';
import { useBuild } from '../../state/StoreProvider.jsx';

import styles from './ExhaustScreen.module.css';

// `boltons` dissolved into InductionScreen and this screen — this is the exhaust
// half. Keep reading label/blurb off MOD_INFO rather than copying the strings, or
// this list forks from the catalogue it is meant to be a view onto.
const MODS_HERE = ['exhaust', 'headers'];

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

  const installMod = (key) => {
    if (mods[key]) return;
    // Fitting a part changes airflow but does NOT edit your logged VE table — the
    // VE tab will show the gap and let you accept it once you understand why.
    dispatch({ type: ACTIONS.SET_BUILD_FIELD, field: 'mods', value: { ...mods, [key]: true } });
  };

  return (
    <BuildSection
      active={active} onClick={() => onToggle('exhaust')}
      icon={Flame} label="Exhaust"
      sub={EXHAUST_DIA_OPTS[exhaustDiaIdx].label}
    >
      <div className={styles.label}>Exhaust Diameter</div>
      <Seg label="Exhaust Diameter" options={EXHAUST_DIA_OPTS.map((o) => ({ label: o.label, id: o.label }))} value={EXHAUST_DIA_OPTS[exhaustDiaIdx].label} onChange={(v) => dispatch({ type: ACTIONS.SET_BUILD_FIELD, field: 'exhaustDiaIdx', value: EXHAUST_DIA_OPTS.findIndex((o) => o.label === v) })} />
      <div className={styles.idealNote}>
        Estimated ideal for this build: ~{idealExhaustDia.toFixed(2)} in
        {turboOn && Math.max(...boostCurve) > 0 && <span className={styles.raisedByBoost}> (raised by boost)</span>}
      </div>
      <ExpandableInfo title="Why exhaust diameter isn't just 'bigger is better'">
        Undersized piping restricts flow at high RPM, choking VE right when the engine wants air moving fastest. Oversized piping does the opposite at low RPM — exhaust velocity drops, scavenging gets lazy, and low-end response suffers.
        <br /><br />The long-standing shop rule is about <b className={styles.em}>one inch of total pipe diameter per 100 crank horsepower</b>. Note that this follows POWER, not just engine size — which is why adding boost raises the ideal diameter for the very same engine. This sandbox estimates that target from your displacement and boost, and shows how far your choice sits from it.
      </ExpandableInfo>

      {/* The card markup below is verbatim out of the dissolved BoltonsScreen: a plain
          `<button disabled={mods[key]}>` where `disabled` means *installed*, switched
          visually with `data-installed` rather than a `Button` variant — see the brief
          for why this stays a plain button. */}
      <div className={styles.list}>
        {MODS_HERE.map((key) => (
          <button
            key={key} onClick={() => installMod(key)} disabled={mods[key]}
            className={styles.card} data-installed={mods[key] ? 'true' : 'false'}
          >
            <div className={styles.cardHead}>
              <span className={styles.cardLabel} data-installed={mods[key] ? 'true' : 'false'}>{MOD_INFO[key].label}</span>
              <span className={styles.cardStatus} data-installed={mods[key] ? 'true' : 'false'}>{mods[key] ? 'INSTALLED' : 'INSTALL'}</span>
            </div>
            <div className={styles.cardBlurb}>{MOD_INFO[key].blurb}</div>
          </button>
        ))}
      </div>
    </BuildSection>
  );
}
