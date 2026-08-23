/**
 * BUILD > Exhaust.
 *
 * Pipe diameter, and how far that sits from the shop-rule ideal for this build.
 *
 * `idealExhaustDia` is the shell's: it also feeds `exhaustDiaError`, which several
 * other consumers (the score breakdown, the dyno payload) read, so the shell keeps
 * owning the one computation rather than this screen recomputing half of it.
 */

import { Flame } from 'lucide-react';
import React from 'react';

import { EXHAUST_DIA_OPTS } from '../../../sim/index.js';
import { BuildSection } from '../../components/BuildSection.jsx';
import { ExpandableInfo } from '../../components/ExpandableInfo.jsx';
import { Seg } from '../../primitives/Seg.jsx';
import { ACTIONS } from '../../state/reducer.js';
import { useBuild } from '../../state/StoreProvider.jsx';
import { T } from '../../theme.js';

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
  const { exhaustDiaIdx, turboOn, boostCurve } = build;

  return (
    <BuildSection
      active={active} onClick={() => onToggle('exhaust')}
      icon={Flame} label="Exhaust"
      sub={EXHAUST_DIA_OPTS[exhaustDiaIdx].label}
    >
      <div style={{ fontSize: 12, color: T.ink2, marginBottom: 6, fontWeight: 600 }}>Exhaust Diameter</div>
      <Seg label="Exhaust Diameter" options={EXHAUST_DIA_OPTS.map((o) => ({ label: o.label, id: o.label }))} value={EXHAUST_DIA_OPTS[exhaustDiaIdx].label} onChange={(v) => dispatch({ type: ACTIONS.SET_BUILD_FIELD, field: 'exhaustDiaIdx', value: EXHAUST_DIA_OPTS.findIndex((o) => o.label === v) })} />
      <div style={{ fontSize: 11, color: T.ink3, marginBottom: 4 }}>
        Estimated ideal for this build: ~{idealExhaustDia.toFixed(2)} in
        {turboOn && Math.max(...boostCurve) > 0 && <span style={{ color: T.accInk }}> (raised by boost)</span>}
      </div>
      <ExpandableInfo title="Why exhaust diameter isn't just 'bigger is better'">
        Undersized piping restricts flow at high RPM, choking VE right when the engine wants air moving fastest. Oversized piping does the opposite at low RPM — exhaust velocity drops, scavenging gets lazy, and low-end response suffers.
        <br /><br />The long-standing shop rule is about <b style={{ color: T.ink }}>one inch of total pipe diameter per 100 crank horsepower</b>. Note that this follows POWER, not just engine size — which is why adding boost raises the ideal diameter for the very same engine. This sandbox estimates that target from your displacement and boost, and shows how far your choice sits from it.
      </ExpandableInfo>
    </BuildSection>
  );
}
