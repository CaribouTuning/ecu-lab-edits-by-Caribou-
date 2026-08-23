/**
 * TUNE > ECU (fuel system: octane, injectors, MAF/ECU scaling).
 *
 * Several props here are the shell's rather than this screen's own: `dutyPreview`,
 * `fuel` and `injectorCc` all feed the score breakdown and the dyno payload too, and
 * `needsMafRecal` also drives HOME's health screen — one computation, several
 * readers, so the shell keeps owning it. `chartData` and `result` are the same
 * story, shared with DYNO. `dutyDangerous`, by contrast, has exactly one reader —
 * this screen — so it is computed here, off the shared `dutyPreview`, rather than
 * threaded down as its own prop.
 */

import React from 'react';

import { Fuel, Zap } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { INJECTOR_OPTS, OCTANE_OPTS } from '../../../sim/index.js';
import { ExpandableInfo } from '../../components/ExpandableInfo.jsx';
import { PickList } from '../../components/PickList.jsx';
import { Bar } from '../../primitives/Bar.jsx';
import { Button } from '../../primitives/Button.jsx';
import { Eyebrow } from '../../primitives/Eyebrow.jsx';
import { Note } from '../../primitives/Note.jsx';
import { Panel } from '../../primitives/Panel.jsx';
import { Seg } from '../../primitives/Seg.jsx';
import { ACTIONS } from '../../state/reducer.js';
import { useBuild } from '../../state/StoreProvider.jsx';
import { T, utilisationColor } from '../../theme.js';

/**
 * @typedef {object} FuelSpec
 * @property {string} label
 * @property {number} stoich
 * @property {number} density
 */

/**
 * @param {object} props
 * @param {number} props.dutyPreview injector duty at WOT/6500rpm — the shell's,
 *   also read by the score breakdown and dyno payload
 * @param {FuelSpec} props.fuel the shell's — `OCTANE_OPTS[octaneIdx]`, also read by
 *   several score/dyno computations
 * @param {number} props.injectorCc the shell's — `INJECTOR_OPTS[injIdx].cc`, also
 *   read by the same computations as `fuel`
 * @param {boolean} props.needsMafRecal the shell's — also read by HOME's health screen
 * @param {Array<{rpm: number, trimPct: number}>} props.chartData the shell's,
 *   shared with DYNO's own fuel-trim chart
 * @param {{points: Array<object>}|null} props.result the shell's, shared with DYNO
 * @returns {React.ReactElement}
 */
export function EcuScreen({ dutyPreview, fuel, injectorCc, needsMafRecal, chartData, result }) {
  const [build, dispatch] = useBuild();
  const { turboOn, octaneIdx, injIdx, ecuInjectorCc, mods, mafScalar } = build;
  const dutyDangerous = utilisationColor(dutyPreview) === T.danger;

  return (
    <div style={{ padding: 16 }}>
      <Eyebrow icon={Fuel}>Fuel System</Eyebrow>
      {!turboOn && <Note>Naturally aspirated — no turbo installed. Add one on <b>BUILD</b> if you want boost to tune around.</Note>}
      {turboOn && <Note>Turbo hardware and the boost target curve live on <b>BUILD</b> — this tab is fuel-side tuning: octane, injectors, and MAF/ECU.</Note>}

      <div style={{ fontSize: 12, color: T.ink2, margin: '12px 0 6px', fontWeight: 600 }}>Fuel Octane</div>
      <Seg label="Fuel Octane" options={OCTANE_OPTS.map((o) => ({ label: o.label, id: o.label }))} value={OCTANE_OPTS[octaneIdx].label} onChange={(v) => dispatch({ type: ACTIONS.SET_BUILD_FIELD, field: 'octaneIdx', value: OCTANE_OPTS.findIndex((o) => o.label === v) })} />
      <ExpandableInfo title="What octane actually does — and what E85 costs you">
        Octane measures a fuel's resistance to auto-igniting under heat and pressure before the spark fires it — not energy content or "power." Higher octane tolerates more cylinder pressure and temperature before knock, letting a tuner run more advance or more boost safely. It does not add power on its own; it raises the ceiling for how much timing/boost you can use before knock becomes the limit.
        <br /><br /><b style={{ color: T.ink }}>E85 is not a free upgrade.</b> Its stoichiometric point is about 9.8:1, not gasoline's 14.7:1 — so hitting the same lambda takes roughly <b style={{ color: T.accInk }}>1.43× the fuel volume</b>. Switch to E85 without upsizing injectors and you will run out of duty cycle long before you cash in that knock margin. Watch the duty preview below change the moment you select it.
        <br /><br />That trade — huge knock resistance, huge fuel demand — is exactly why serious E85 builds pair it with bigger injectors and a bigger pump, and why "just run E85" is not a shortcut around a fuel system.
      </ExpandableInfo>

      <div style={{ fontSize: 12, color: T.ink2, margin: '10px 0 6px', fontWeight: 600 }}>Fuel Injectors</div>
      <PickList options={INJECTOR_OPTS.map((o) => ({ label: o.label, value: o.label }))} value={INJECTOR_OPTS[injIdx].label} onChange={(v) => dispatch({ type: ACTIONS.SET_BUILD_FIELD, field: 'injIdx', value: INJECTOR_OPTS.findIndex((o) => o.label === v) })} />
      <div style={{ fontSize: 12, color: T.ink2, margin: '12px 0 6px', fontWeight: 600 }}>
        ECU Injector Scaling <span style={{ color: T.ink3, fontWeight: 400 }}>— what the ECU thinks is fitted</span>
      </div>
      <Seg label="ECU Injector Scaling" options={INJECTOR_OPTS.map((o) => ({ label: `${o.cc}`, id: o.cc }))} value={ecuInjectorCc} onChange={(v) => dispatch({ type: ACTIONS.SET_BUILD_FIELD, field: 'ecuInjectorCc', value: v })} equal />
      {ecuInjectorCc !== injectorCc ? (
        <div style={{ background: T.dangerBg, border: `1px solid ${T.dangerLine}`, borderRadius: 10, padding: '11px 13px', margin: '8px 0', fontSize: 12, color: T.dangerInk, lineHeight: 1.5 }}>
          <b>Scaling mismatch.</b> Hardware is {injectorCc}cc but the ECU is calibrated for {ecuInjectorCc}cc — every pulse delivers about {((injectorCc / ecuInjectorCc) * 100).toFixed(0)}% of the intended fuel, so the engine runs {injectorCc > ecuInjectorCc ? 'far too rich' : 'dangerously lean'} everywhere.
          {/* The wrapper, not the button, is what breaks the line: the button
              sits inside a paragraph and is inline-flex, so without a block
              parent it would run on from the end of the warning text. */}
          <div style={{ marginTop: 9 }}>
            <Button onClick={() => dispatch({ type: ACTIONS.SET_BUILD_FIELD, field: 'ecuInjectorCc', value: injectorCc })}>
              RESCALE ECU TO {injectorCc}cc
            </Button>
          </div>
        </div>
      ) : (
        <div style={{ fontSize: 11, color: T.ok, margin: '6px 0 4px' }}>ECU scaling matches the fitted injectors.</div>
      )}
      <ExpandableInfo title="Injector scaling — the step everyone forgets">
        The ECU never commands "fuel" — it commands a pulse width, calculated for the injector size it has been <i>told</i> is fitted. Bolt in bigger injectors without updating that number and every pulse delivers proportionally more fuel than intended, so the engine runs rich everywhere regardless of what your AFR table says.
        <br /><br />Every real tuning platform has this constant: UpRev calls it the <b style={{ color: T.ink }}>K-fuel multiplier</b> (lower it for bigger injectors), HP Tuners calls it <b style={{ color: T.ink }}>injector flow rate</b>. It is the first thing you change after a fuel system upgrade, before touching any table.
      </ExpandableInfo>

      <ExpandableInfo title="Why injector duty cycle limits everything">
        Injectors flow a rated amount of fuel, and the ECU controls delivery by varying how long each stays open per cycle. As RPM and airflow rise, more fuel is needed in less time, and eventually the injector is open almost the whole cycle — that is duty cycle nearing 100%. Past about 90%, there is no more room to add fuel even if the AFR table calls for it, so the mixture leans out on its own regardless of what you commanded.
      </ExpandableInfo>

      <Panel tight style={{ marginTop: 6, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 10, color: T.ink2, letterSpacing: 1, fontWeight: 700 }}>INJECTOR DUTY PREVIEW · WOT @ 6500 RPM</div>
          {fuel.stoich < 14 && <div style={{ fontSize: 10, color: T.accInk, fontFamily: T.mono, fontWeight: 700 }}>{fuel.label} stoich {fuel.stoich}:1</div>}
        </div>
        <div style={{ marginTop: 8 }}>
          <Bar label="Duty" value={dutyPreview} higherIsBetter={false} />
        </div>
        {/* The figure itself is the Bar's, now that it has a label row of its own —
            restating it here put the same number on screen twice, seven pixels
            apart. What is left is the part the Bar cannot say: what an undersized
            injector is about to do to the mixture. */}
        {dutyDangerous && (
          <div style={{ fontSize: 12, marginTop: 7, color: T.dangerInk }}>
            Undersized for this build — expect forced lean-out
          </div>
        )}
      </Panel>

      <Eyebrow icon={Zap}>Fuel Control &amp; MAF Scaling</Eyebrow>
      <Panel style={{ marginBottom: 13 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: T.ink2, fontWeight: 700 }}>
          <span>MAF RECAL STATUS</span>
          <span style={{ color: needsMafRecal ? T.warn : T.ok, fontWeight: 800 }}>{needsMafRecal ? 'HARDWARE CHANGED' : 'STOCK — OK'}</span>
        </div>
        {needsMafRecal && (
          <div style={{ fontSize: 11.5, color: T.ink2, marginTop: 7 }}>
            {mods.intake && turboOn ? 'Intake + turbo plumbing' : mods.intake ? 'Intake' : 'Turbo plumbing'} changed how air reads across the MAF. Dial in the scalar below, then confirm with a dyno pull.
          </div>
        )}
      </Panel>
      <div style={{ fontSize: 12, color: T.ink2, marginBottom: 7, fontWeight: 600 }}>MAF Scalar</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 6 }}>
        <input type="range" min={0.75} max={1.25} step={0.01} value={mafScalar} onChange={(e) => dispatch({ type: ACTIONS.SET_BUILD_FIELD, field: 'mafScalar', value: Number(e.target.value) })} style={{ flex: 1, accentColor: T.acc }} />
        <div style={{ fontFamily: T.mono, fontWeight: 800, fontSize: 15, width: 52, textAlign: 'right', color: T.ink }}>{mafScalar.toFixed(2)}</div>
      </div>
      <ExpandableInfo title="VE tuning vs. MAF tuning — platforms differ">
        This sandbox exposes a VE table because that is the clearest way to teach airflow. Real platforms split into two camps.
        <br /><br /><b style={{ color: T.ink }}>Speed-density platforms</b> (GM via HP Tuners/EFILive) index a VE table by RPM and MAP — exactly the axes here — and you tune VE directly.
        <br /><br /><b style={{ color: T.ink }}>MAF-based platforms</b> (Nissan via UpRev) barely expose VE at all. Instead you tune a <b style={{ color: T.ink }}>MAF curve indexed by sensor voltage</b>, whose values map to grams per second, plus the K-fuel multiplier and a fuel compensation table. Same physics, different control surface: on a Nissan you correct airflow by reshaping the MAF curve rather than a VE grid.
        <br /><br />Everything you learn here transfers — just expect the knobs to be named differently depending on the platform.
      </ExpandableInfo>

      <ExpandableInfo title="How MAF-based fueling actually works">
        The MAF sensor reports airflow as a voltage, using a curve calibrated for the stock intake's exact diameter. Change the housing size and the same real airflow produces a different voltage, so the ECU's load calculation is wrong even though your fuel/timing tables did not change. At part throttle, closed-loop O2 feedback quietly corrects most of this; at wide-open throttle the ECU usually runs open-loop and blind to the O2 sensor, so the error goes straight through — which is why WOT is where bad MAF scaling shows up hardest.
        <br /><br /><b style={{ color: T.ink }}>As a beginner:</b> do not guess the scalar. Install the part, run a pull, then check the AFR trace and the MAF trim log entry on DYNO — they will tell you which direction and roughly how far to move it.
      </ExpandableInfo>
      {result && (
        <Panel tight style={{ marginTop: 6 }}>
          <div style={{ fontSize: 10, color: T.ink2, letterSpacing: 1, fontWeight: 700, marginBottom: 6 }}>FUEL TRIM — LAST PULL</div>
          <ResponsiveContainer width="100%" height={150}>
            <LineChart data={chartData} margin={{ top: 4, right: 12, left: -14, bottom: 0 }}>
              <CartesianGrid stroke={T.line} />
              <XAxis dataKey="rpm" stroke={T.ink3} fontSize={10} />
              <YAxis stroke={T.ink3} fontSize={10} unit="%" />
              <Tooltip contentStyle={{ background: T.panel2, border: `1px solid ${T.line}`, fontSize: 11 }} />
              <Line dataKey="trimPct" name="MAF trim %" stroke={T.violet} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Panel>
      )}
    </div>
  );
}
