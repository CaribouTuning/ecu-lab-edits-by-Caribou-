/**
 * BUILD > Forced Induction.
 *
 * Turbo kit toggle, turbine and compressor sizing, intercooler, and the boost target
 * curve editor: eight RPM columns as bar buttons, tap one to select it, then edit it
 * below with full-width controls.
 */

import { Wind } from 'lucide-react';
import React from 'react';

import { COMPRESSOR_OPTS, RPM, TURBINE_OPTS, clamp } from '../../../sim/index.js';
import { BuildSection } from '../../components/BuildSection.jsx';
import { ExpandableInfo } from '../../components/ExpandableInfo.jsx';
import { PickList } from '../../components/PickList.jsx';
import { Button } from '../../primitives/Button.jsx';
import { Note } from '../../primitives/Note.jsx';
import { Panel } from '../../primitives/Panel.jsx';
import { Seg } from '../../primitives/Seg.jsx';
import { Toggle } from '../../primitives/Toggle.jsx';
import { ACTIONS } from '../../state/reducer.js';
import { useBuild } from '../../state/StoreProvider.jsx';
import { T } from '../../theme.js';

/**
 * @param {object} props
 * @param {boolean} props.active whether this is BUILD's open section
 * @param {(section: string) => void} props.onToggle opens or closes a BUILD section
 * @returns {React.ReactElement}
 */
export function TurboScreen({ active, onToggle }) {
  const [build, dispatch] = useBuild();
  const {
    turboOn, boostCurve, boostSel, turbineIdx, turbineCount, compressorIdx, mods,
  } = build;

  // Every boost-curve write goes through here. Rebuilding from the RPM axis makes it
  // structurally impossible for the curve to be the wrong length or to contain a
  // non-number, which is what previously let a single edit poison the whole sim.
  const setBoostAt = (i, value) => dispatch({
    type: ACTIONS.SET_BUILD_FIELD,
    field: 'boostCurve',
    value: RPM.map((_, idx) => clamp(Number(idx === i ? value : boostCurve[idx]) || 0, 0, 25)),
  });

  return (
    <BuildSection
      active={active} onClick={() => onToggle('turbo')}
      icon={Wind} label="Forced Induction"
      sub={turboOn ? `On · ${turbineCount > 1 ? `Twin ${TURBINE_OPTS[turbineIdx].label.split(' ')[0].toLowerCase()}` : TURBINE_OPTS[turbineIdx].label.split(' ')[0]} turbine · peak ${Math.max(...boostCurve)} psi` : 'Not installed'}
    >
      <Toggle label="Turbo kit" sub="Adds boost near WOT, with spool lag off idle" checked={turboOn} onChange={(v) => dispatch({ type: ACTIONS.SET_BUILD_FIELD, field: 'turboOn', value: v })} />

      <div style={{ maxHeight: turboOn ? 3000 : 0, opacity: turboOn ? 1 : 0, overflow: 'hidden', transition: 'max-height .4s ease, opacity .3s ease' }}>
        <div style={{ paddingTop: 12 }}>
          <div style={{ fontSize: 12, color: T.ink2, marginBottom: 6, fontWeight: 600 }}>Turbine Size</div>
          <PickList options={TURBINE_OPTS.map((o) => ({ label: o.label, value: o.label }))} value={TURBINE_OPTS[turbineIdx].label} onChange={(v) => dispatch({ type: ACTIONS.SET_TURBINE, value: TURBINE_OPTS.findIndex((o) => o.label === v) })} />
          <div style={{ fontSize: 12, color: T.ink2, marginBottom: 6, marginTop: 4, fontWeight: 600 }}>Compressor Size</div>
          <Seg label="Compressor Size" options={COMPRESSOR_OPTS.map((o) => ({ label: o.label, id: o.label }))} value={COMPRESSOR_OPTS[compressorIdx].label} onChange={(v) => dispatch({ type: ACTIONS.SET_BUILD_FIELD, field: 'compressorIdx', value: COMPRESSOR_OPTS.findIndex((o) => o.label === v) })} />
          <div style={{ fontSize: 11, color: T.ink3, marginBottom: 10, marginTop: 4 }}>Ceiling before it runs outside its efficient range: ~{COMPRESSOR_OPTS[compressorIdx].boostCeiling} psi</div>
          <ExpandableInfo title="Turbine vs. compressor — different jobs">
            The turbine sits in the exhaust and spins from exhaust energy — its size sets how quickly it spools (small = fast but chokes exhaust flow up top; large = laggy but flows more at redline). The compressor sits in the intake and does the actual pressurizing — its size sets a practical boost ceiling before it's forced outside its efficient operating range, making hot, inefficient, knock-prone air.
            <br /><br />Real turbo shops size compressors by required <b style={{ color: T.ink }}>airflow</b>, not boost pressure. The industry rule of thumb is about <b style={{ color: T.ink }}>10 crank horsepower per lb/min of air</b> (roughly 8.5 whp after drivetrain loss) — so a 400 whp target needs a compressor good for roughly 47 lb/min, which you then check against the manufacturer's compressor map.
            <br /><br />Note that this figure barely changes with fuel. E85 needs far more fuel by volume, but it also releases almost exactly the same energy per unit of <i>air</i> as gasoline, so airflow — not fuel type — sets the power ceiling. Octane still helps, but through better timing, not through a bigger number here.
          </ExpandableInfo>

          <div style={{ marginTop: 4, marginBottom: 14 }}>
            <Toggle label="Intercooler" sub="Cools charge air, buys knock margin under boost" checked={mods.intercooler} onChange={(v) => dispatch({ type: ACTIONS.SET_BUILD_FIELD, field: 'mods', value: { ...mods, intercooler: v } })} />
          </div>

          <div style={{ fontSize: 12, color: T.ink2, marginBottom: 8, fontWeight: 600 }}>Boost Target Curve</div>

          <Panel tight style={{ marginBottom: 10 }}>
            {/* Tap a bar to select that RPM point, then edit it below with full-width controls. */}
            <div data-testid="boost-columns" style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: 104 }}>
              {RPM.map((r, i) => {
                const on = boostSel === i;
                const ceiling = COMPRESSOR_OPTS[compressorIdx].boostCeiling;
                const over = boostCurve[i] > ceiling;
                return (
                  <button key={r} onClick={() => dispatch({ type: ACTIONS.SET_BOOST_SEL, value: i })} style={{
                    flex: 1, height: '100%', padding: 0, borderRadius: 7,
                    border: `1px solid ${on ? T.acc : T.line}`,
                    background: on ? T.accBg : T.panel,
                    display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', overflow: 'hidden',
                  }}>
                    <div style={{ fontSize: 10, fontFamily: T.mono, fontWeight: 800, color: over ? T.danger : on ? T.accInk : T.ink2, paddingBottom: 2 }}>
                      {boostCurve[i]}
                    </div>
                    <div style={{
                      height: `${(boostCurve[i] / 25) * 72}%`, minHeight: boostCurve[i] > 0 ? 3 : 0,
                      background: over ? T.danger : on ? T.acc : T.lineHi,
                      borderRadius: '3px 3px 0 0', transition: 'height .12s',
                    }} />
                    <div style={{ fontSize: 8, color: on ? T.accInk : T.ink3, fontFamily: T.mono, padding: '3px 0' }}>
                      {r >= 1000 ? (r / 1000).toFixed(1) + 'k' : r}
                    </div>
                  </button>
                );
              })}
            </div>
          </Panel>

          <Panel tight style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
              <span style={{ fontSize: 10.5, letterSpacing: 1, color: T.ink2, fontWeight: 700 }}>{RPM[boostSel]} RPM</span>
              <span style={{ fontFamily: T.mono, fontSize: 24, fontWeight: 800, color: boostCurve[boostSel] > COMPRESSOR_OPTS[compressorIdx].boostCeiling ? T.danger : T.accInk }}>
                {boostCurve[boostSel]}<span style={{ fontSize: 12, color: T.ink2, marginLeft: 3 }}>psi</span>
              </span>
            </div>
            <input type="range" min={0} max={25} step={1} value={boostCurve[boostSel]}
              onChange={(e) => setBoostAt(boostSel, Number(e.target.value))}
              style={{ width: '100%', accentColor: T.acc }} />
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              {[-5, -1, 1, 5].map((d) => (
                <button key={d} onClick={() => setBoostAt(boostSel, (boostCurve[boostSel] ?? 0) + d)}
                  style={{ flex: 1, padding: '11px 0', borderRadius: 8, border: `1px solid ${T.line}`, background: T.panel,
                    color: T.accInk, fontWeight: 800, fontFamily: T.mono, fontSize: 14 }}>
                  {d > 0 ? '+' : ''}{d}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <Button variant="ghost" size="sm" style={{ flex: 1 }}
                onClick={() => dispatch({ type: ACTIONS.SET_BUILD_FIELD, field: 'boostCurve', value: RPM.map(() => clamp(Number(boostCurve[boostSel]) || 0, 0, 25)) })}>
                FLAT ACROSS ALL
              </Button>
              <Button variant="ghost" size="sm" style={{ flex: 1 }}
                onClick={() => { const peak = boostCurve[boostSel]; dispatch({ type: ACTIONS.SET_BUILD_FIELD, field: 'boostCurve', value: RPM.map((r) => Math.round(peak * clamp((r - 1500) / 2600, 0, 1))) }); }}>
                SPOOL RAMP
              </Button>
              {/* Built from RPM so the curve can never be shorter than the
                  axis. A hand-written literal previously had seven entries
                  for eight breakpoints, and the next edit put NaN through
                  the entire simulation. */}
              <Button variant="ghost" size="sm" style={{ flex: 1 }}
                onClick={() => dispatch({ type: ACTIONS.SET_BUILD_FIELD, field: 'boostCurve', value: RPM.map(() => 0) })}>
                ZERO
              </Button>
            </div>
            <div style={{ fontSize: 10.5, color: Math.max(...boostCurve) > COMPRESSOR_OPTS[compressorIdx].boostCeiling ? T.danger : T.ink3, marginTop: 8 }}>
              Compressor efficient to ~{COMPRESSOR_OPTS[compressorIdx].boostCeiling} psi{Math.max(...boostCurve) > COMPRESSOR_OPTS[compressorIdx].boostCeiling ? ' — you are past it, expect hot inefficient air' : ''}
            </div>
          </Panel>

          <Note tone="warn">Stock calibrations have no real tuning above ~101 kPa. Adding boost without retarding SPARK and richening FUEL in the high-MAP rows will knock hard — run a pull and read the log.</Note>

          <ExpandableInfo title="Why boost costs you timing">
            Boost packs more air and fuel into the same cylinder volume before combustion starts, raising peak pressure and temperature for a given amount of spark advance. The same timing that was safe with no boost becomes knock-prone at 8-10 psi through the same head and pistons — which is why boosted tunes run less initial timing than a naturally aspirated tune, and why timing has to come out further as boost climbs. Set your target here, then dial in TIMING and AFR to match.
          </ExpandableInfo>
        </div>
      </div>
    </BuildSection>
  );
}
