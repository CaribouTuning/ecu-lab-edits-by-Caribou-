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
import React, { useMemo } from 'react';

import { CUSTOM_ENGINE_LIMITS, EXHAUST_DIA_OPTS, MOD_INFO, catalystLossShare, headDefaultsOf } from '../../../sim/index.js';
import { BuildSection } from '../../components/BuildSection.jsx';
import { ExpandableInfo } from '../../components/ExpandableInfo.jsx';
import { PartRow } from '../../components/PartRow.jsx';
import { Seg } from '../../primitives/Seg.jsx';
import { SpecField, SpecSlider } from '../../primitives/Spec.jsx';
import { ACTIONS } from '../../state/reducer.js';
import { useBuild } from '../../state/StoreProvider.jsx';

import styles from './BoltonsScreen.module.css';
import { useUnits } from '../../units.js';

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
export function BoltonsScreen({ active, onToggle, idealExhaustDia }) {
  const [build, dispatch] = useBuild();
  const U = useUnits();
  const { exhaustDiaIdx, turboOn, boostCurve, mods, engineConfig } = build;
  // The headers' tube where the engine does not set it: what the sliders start from.
  const defaults = useMemo(() => headDefaultsOf(engineConfig), [engineConfig]);
  const setCfg = (patch) => dispatch({ type: ACTIONS.SET_BUILD_FIELD, field: 'engineConfig', value: { ...engineConfig, ...patch } });
  const catalyst = mods.catalyst ?? 'ceramic';

  // Fitting a part (or taking it off) changes airflow but does NOT edit your logged VE
  // table: TUNE › AIRFLOW shows the gap, and you correct it from a log once you know why.
  const toggleMod = (key) => dispatch({ type: ACTIONS.SET_BUILD_FIELD, field: 'mods', value: { ...mods, [key]: !mods[key] } });

  return (
    <BuildSection
      active={active} onClick={() => onToggle('boltons')}
      icon={Flame} label="Bolt-ons"
      sub={[U.metric ? U.fmtLength(EXHAUST_DIA_OPTS[exhaustDiaIdx].dia) : EXHAUST_DIA_OPTS[exhaustDiaIdx].label, ...MODS_HERE.filter((k) => mods[k]).map((k) => MOD_INFO[k].label.toLowerCase())].join(', ')}
    >
      <div className={styles.list}>
        {MODS_HERE.map((key) => (
          <PartRow key={key} label={MOD_INFO[key].label} blurb={MOD_INFO[key].blurb} fitted={!!mods[key]} onToggle={() => toggleMod(key)} />
        ))}
      </div>

      <div className={styles.specs}>
      {mods.headers && (
        <>
          <SpecSlider label="Header primary length" unit=" mm" value={engineConfig.headerPrimaryMm ?? defaults.headerPrimaryMm}
            stock={defaults.headerPrimaryMm} min={CUSTOM_ENGINE_LIMITS.headerPrimaryMm.min} max={CUSTOM_ENGINE_LIMITS.headerPrimaryMm.max} step={CUSTOM_ENGINE_LIMITS.headerPrimaryMm.step}
            onChange={(v) => setCfg({ headerPrimaryMm: v })} lo="short: tuned high" hi="long: tuned low"
            aside={U.metric ? undefined : `${((engineConfig.headerPrimaryMm ?? defaults.headerPrimaryMm) / 25.4).toFixed(0)} in`} ariaLabel="Header primary length" />
          <SpecSlider label="Header primary bore" unit=" mm" decimals={1} value={engineConfig.headerPrimaryIdMm ?? defaults.headerPrimaryIdMm}
            stock={defaults.headerPrimaryIdMm} min={CUSTOM_ENGINE_LIMITS.headerPrimaryIdMm.min} max={CUSTOM_ENGINE_LIMITS.headerPrimaryIdMm.max} step={0.5}
            onChange={(v) => setCfg({ headerPrimaryIdMm: v })} lo="small: strong, quick waves" hi="big: free-flowing up top"
            aside={U.metric ? `about ${((engineConfig.headerPrimaryIdMm ?? defaults.headerPrimaryIdMm) + 1.65).toFixed(1)} mm tube` : `about ${(((engineConfig.headerPrimaryIdMm ?? defaults.headerPrimaryIdMm) + 1.65) / 25.4).toFixed(2)} in tube`} ariaLabel="Header primary bore" />
          <ExpandableInfo title="What a header's tubes tune">
            Each primary is a pipe the blowdown pulse runs down. At the collector it meets the other primaries and the collector&apos;s outlet, much more area together, and comes back as a <b className={styles.em}>suction wave</b>. Where that suction arrives at the valve during overlap, it pulls the last exhaust out and draws the fresh charge in behind it. The round trip takes a fixed time, about 2L/a, so a <b className={styles.em}>longer primary</b> lands its suction at a lower RPM and a shorter one higher. A <b className={styles.em}>smaller tube</b> makes the wave stronger at low flow, while a bigger one flows more at the top. The Physics page shows this wave and when it arrives.
          </ExpandableInfo>
        </>
      )}

      <SpecField label="Catalytic converter" aside={catalyst === 'none' ? 'off-road only' : `${catalyst === 'metallic' ? '200-cell metallic' : '400-cell ceramic'}, ${Math.round(catalystLossShare(catalyst) * 100)}% of stock restriction`}>
        <Seg variant="rule" equal label="Catalytic converter" value={catalyst}
          options={[{ id: 'ceramic', label: 'Stock' }, { id: 'metallic', label: 'High-flow' }, { id: 'none', label: 'Test pipe' }]}
          onChange={(v) => dispatch({ type: ACTIONS.SET_BUILD_FIELD, field: 'mods', value: { ...mods, catalyst: v === 'ceramic' ? undefined : v } })} />
      </SpecField>
      <ExpandableInfo title="Why a high-flow cat flows more">
        A converter is a honeycomb of square channels, about a millimetre across, coated with the catalyst. The gas moves through them slowly enough to flow smoothly, so the pressure it loses goes as one over the open area times the channel width squared. A stock converter has 400 cells per square inch with walls 0.0065 in thick. A high-flow one has 200 cells on metal foil 0.002 in thick: wider channels, more open area, and about a third of the restriction. A test pipe removes it altogether, which is not legal on the road.
      </ExpandableInfo>
      </div>

      <div className={styles.label}>Exhaust Diameter</div>
      <Seg variant="rule" equal label="Exhaust Diameter" options={EXHAUST_DIA_OPTS.map((o) => ({ label: U.metric ? U.fmtLength(o.dia) : o.label, id: o.label }))} value={EXHAUST_DIA_OPTS[exhaustDiaIdx].label} onChange={(v) => dispatch({ type: ACTIONS.SET_BUILD_FIELD, field: 'exhaustDiaIdx', value: EXHAUST_DIA_OPTS.findIndex((o) => o.label === v) })} />
      <div className={styles.idealNote}>
        Estimated ideal for this build: ~{U.metric ? U.fmtLength(idealExhaustDia) : `${idealExhaustDia.toFixed(2)} in`}
        {turboOn && Math.max(...boostCurve) > 0 && <span className={styles.raisedByBoost}> (raised by boost)</span>}
      </div>
      <ExpandableInfo title="Why bigger stops paying">
        The pipe costs pressure in proportion to the speed of the gas through it squared, so an undersized pipe holds back-pressure on the cylinders at high RPM, where the flow is greatest, and the engine loses top end. Past the size the power needs, the loss left is already small: a bigger pipe gains almost nothing and costs more. The pressure waves that scavenge the cylinder live in the header primaries, not in the pipe after the collector, so this sim gives an oversized cat-back no low-RPM penalty either.
        <br /><br />The long-standing shop rule is about <b className={styles.em}>one inch of total pipe diameter per 100 crank horsepower</b>. Note that this follows POWER, not just engine size — which is why adding boost raises the ideal diameter for the very same engine. This sandbox estimates that target from your displacement and boost, and shows how far your choice sits from it.
      </ExpandableInfo>
    </BuildSection>
  );
}
