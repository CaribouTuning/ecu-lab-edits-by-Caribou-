/**
 * BUILD > Engine Architecture.
 *
 * Start from a real factory engine or build a custom short block: configuration,
 * bore/stroke, compression, cam duration, valve springs, block/head material.
 *
 * `engineDerived`, `activePreset` and `veAdvice` are the shell's, not this screen's:
 * `engineDerived` also feeds the tach and the dyno chart's RPM axis, `activePreset`
 * also names the header's engine label, and `veAdvice` also drives the AIR screen's
 * advisory panel. One definition each, passed in.
 */

import { Settings } from 'lucide-react';
import React from 'react';

import {
  CONFIG_OPTS, CYL_COUNT, ENGINE_PRESETS, MATERIAL_OPTS, PRESET_GROUPS, applyPreset,
} from '../../../sim/index.js';
import { BuildSection } from '../../components/BuildSection.jsx';
import { ExpandableInfo } from '../../components/ExpandableInfo.jsx';
import { Button } from '../../primitives/Button.jsx';
import { Note } from '../../primitives/Note.jsx';
import { Panel } from '../../primitives/Panel.jsx';
import { Seg } from '../../primitives/Seg.jsx';
import { Select } from '../../primitives/Select.jsx';
import { ACTIONS } from '../../state/reducer.js';
import { useBuild, useSession, useTune } from '../../state/StoreProvider.jsx';
import { T } from '../../theme.js';

/**
 * @typedef {object} EngineDerived
 * @property {number} displacementL
 * @property {number} ratio
 * @property {string} character
 * @property {number} overlapDeg
 * @property {number} floatRpm
 * @property {number} redline
 */

/**
 * @typedef {object} VeAdvice
 * @property {boolean} inSync
 * @property {number} maxAbs
 */

/**
 * @param {object} props
 * @param {boolean} props.active whether this is BUILD's open section
 * @param {(section: string) => void} props.onToggle opens or closes a BUILD section
 * @param {EngineDerived} props.engineDerived
 * @param {object|null} props.activePreset the catalogue entry `presetId` names, or null
 * @param {VeAdvice} props.veAdvice
 * @returns {React.ReactElement}
 */
export function EngineScreen({ active, onToggle, engineDerived, activePreset, veAdvice }) {
  const [build, dispatch] = useBuild();
  const { engineConfig, presetId, presetPrompt } = build;
  const [tune] = useTune();
  const { tablesDirty } = tune;
  const [session] = useSession();
  const { result } = session;

  const setCfg = (patch) => dispatch({ type: ACTIONS.SET_ENGINE_CONFIG_PATCH, patch });
  const clearPresetId = () => dispatch({ type: ACTIONS.CLEAR_PRESET_ID });

  /** Whether the player has unsaved calibration work — hand-edited VE/spark/fuel —
   *  that loading a preset would silently overwrite. Tracked directly via
   *  `tablesDirty` rather than pull count: pullCount is restored from career
   *  storage on load, so it nags a returning player on an untouched default
   *  engine, and it misses a player who edited every table but never pulled. */
  const hasTuningWork = () => tablesDirty;

  const applyEnginePreset = (preset) => {
    const p = applyPreset(preset);
    // The whole BUILD slice — including `mafScalar` back to 1.0, and `presetId` SET
    // rather than cleared — lands in ONE pass; see APPLY_PRESET in reducer.js.
    dispatch({ type: ACTIONS.APPLY_PRESET, preset: p });
  };

  const choosePreset = (preset) => {
    if (hasTuningWork()) dispatch({ type: ACTIONS.SET_PRESET_PROMPT, value: preset });
    else applyEnginePreset(preset);
  };

  return (
    <BuildSection
      active={active} onClick={() => onToggle('engine')}
      icon={Settings} label="Engine Architecture"
      sub={`${engineDerived.displacementL.toFixed(1)}L ${engineConfig.configuration} · ${engineConfig.compression.toFixed(1)}:1 · ${engineConfig.camDuration}° cam`}
    >
      <div style={{ fontSize: 12, color: T.ink2, marginBottom: 6, fontWeight: 600 }}>Start From a Real Engine</div>
      <Select
        // The primitive is inline-block with a 200px floor, so it must be told
        // to fill this column — the legacy control was width:100% and the
        // section is a single narrow stack. The margin is the 13px the old one
        // carried; nothing after it should close up.
        style={{ display: 'block', marginBottom: 13 }}
        label="Start From a Real Engine"
        groups={PRESET_GROUPS.map((g) => ({
          label: g.manufacturer,
          // The heading carries the manufacturer, so strip it off the option
          // where the name spells it the same way: "BMW B58B30M0" under a "BMW"
          // heading becomes "B58B30M0". The two Volkswagens are deliberately
          // left alone — they are named "VW EA888.3 (...)" against a
          // "Volkswagen" heading, so this replace finds nothing and they keep
          // their prefix. That reads fine (VW is the badge, Volkswagen the
          // maker) and is not worth an abbreviation table in the UI layer.
          options: g.presets.map((p) => ({
            label: `${p.name.replace(`${p.manufacturer} `, '')} · ${p.factory.crankHp} hp`,
            value: p.id,
          })),
        }))}
        extra={[{ label: 'Custom build', value: '__custom__' }]}
        value={presetId ?? '__custom__'}
        onChange={(v) => {
          if (v === '__custom__') { clearPresetId(); return; }
          const p = ENGINE_PRESETS.find((e) => e.id === v);
          if (p) choosePreset(p);
        }}
      />
      {activePreset && (
        <Panel tight style={{ marginBottom: 13 }}>
          <div style={{ fontSize: 11.5, color: T.ink2, lineHeight: 1.55, marginBottom: 8 }}>{activePreset.blurb}</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: T.ink2, marginBottom: 4, fontWeight: 600 }}>
            <span>FACTORY RATING</span>
            <span style={{ color: T.ink, fontWeight: 800, fontFamily: T.mono }}>
              {activePreset.factory.crankHp} hp · {activePreset.factory.crankTq} lb-ft
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: T.ink2, fontWeight: 600 }}>
            <span>YOUR LAST PULL</span>
            <span style={{ color: result ? T.accInk : T.ink3, fontWeight: 800, fontFamily: T.mono }}>
              {result ? `${result.peakHp} whp · ${result.peakTq} lb-ft` : 'no pull logged'}
            </span>
          </div>
          <div style={{ fontSize: 10.5, color: T.ink3, marginTop: 7, lineHeight: 1.5 }}>
            Factory figures are at the crank; the dyno here reads at the wheels, so expect roughly 15% less. The factory calibration is deliberately conservative — beating it is the exercise.
          </div>
        </Panel>
      )}
      {!presetId && (
        <Note>Custom build — every value below is yours to set. Pick a real engine above to start from a known-good factory configuration instead.</Note>
      )}
      {presetPrompt && (
        <div style={{ background: T.panel2, border: `1px solid ${T.acc}`, borderRadius: 10, padding: '11px 13px', margin: '4px 0 10px' }}>
          <div style={{ fontSize: 12, color: T.ink2, lineHeight: 1.5, marginBottom: 9 }}>
            <b style={{ color: T.accInk }}>This replaces your current tune.</b> Loading {presetPrompt.name} overwrites your VE, spark and fuel tables with its factory calibration. Your career stats are kept.
          </div>
          <div style={{ display: 'flex', gap: 7 }}>
            {/* The one `danger` in the app. This prompt is raised ONLY when
                `hasTuningWork()` is true, so confirming it always destroys
                hand-edited VE/spark/fuel tables that nothing can restore. */}
            <Button variant="danger" style={{ flex: 1 }} onClick={() => applyEnginePreset(presetPrompt)}>
              LOAD {presetPrompt.name.toUpperCase()}
            </Button>
            <Button variant="ghost" style={{ flex: 1 }} onClick={() => dispatch({ type: ACTIONS.SET_PRESET_PROMPT, value: null })}>
              CANCEL
            </Button>
          </div>
        </div>
      )}
      <Panel tight style={{ marginBottom: 13 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: T.ink2, marginBottom: 5, fontWeight: 600 }}><span>DISPLACEMENT</span><span style={{ color: T.ink, fontWeight: 800, fontFamily: T.mono }}>{engineDerived.displacementL.toFixed(2)} L</span></div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: T.ink2, marginBottom: 5, fontWeight: 600 }}><span>BORE : STROKE</span><span style={{ color: T.ink, fontWeight: 800, fontFamily: T.mono }}>{engineDerived.ratio.toFixed(3)}</span></div>
        <div style={{ fontSize: 11.5, color: T.accInk, fontWeight: 600 }}>{engineDerived.character}</div>
      </Panel>

      {!veAdvice.inSync && (
        <div style={{ background: T.panel2, border: `1px solid ${T.acc}`, borderRadius: 10, padding: '11px 13px', margin: '4px 0 10px', fontSize: 12, color: T.ink2, lineHeight: 1.5 }}>
          <b style={{ color: T.accInk }}>Your VE table is now stale.</b> This hardware breathes differently than what you last logged — up to {veAdvice.maxAbs.toFixed(0)}% off. Head to <b style={{ color: T.ink }}>TUNE &rsaquo; AIR</b> to see which cells changed and why, then accept it there.
        </div>
      )}
      <ExpandableInfo title="Why changing hardware does not update your VE table">
        Everything that physically changes how this engine breathes feeds volumetric efficiency: bore/stroke ratio, cylinder count, compression, cam duration, valve springs, head material, intake/headers/exhaust, pipe diameter, turbine backpressure, even fuel choice (E85 evaporates cold enough to measurably densify the charge).
        <br /><br />But your VE table is a <b style={{ color: T.ink }}>log</b> — a record of what the engine actually flowed last time it was measured. Bolt on a cam and that log does not rewrite itself; it just becomes wrong. In a real shop you would go back to the dyno and re-log airflow before trusting any of it.
        <br /><br />So this app never edits it silently. It tells you what changed, by how much, and in which RPM range — and lets you accept it once you understand why it moved.
        <br /><br />Note that <b style={{ color: T.ink }}>boost is not part of VE</b>. VE measures how well the cylinder fills relative to the pressure available; boost raises that pressure (MAP) separately. That is why adding boost does not change these numbers, but adding a turbine does — the turbine is a restriction in the exhaust.
      </ExpandableInfo>

      <div style={{ fontSize: 12, color: T.ink2, marginBottom: 6, marginTop: 10, fontWeight: 600 }}>Configuration</div>
      <Seg label="Configuration" options={CONFIG_OPTS.map((c) => ({ label: `${c} · ${CYL_COUNT[c]}cyl`, id: c }))} value={engineConfig.configuration} onChange={(v) => setCfg({ configuration: v })} />
      <ExpandableInfo title="Why cylinder count and layout matter">
        For the same total displacement, spreading it across more, smaller cylinders means each one needs less peak pressure to make the same overall torque — a small real knock-margin benefit and smoother delivery. More cylinders also means more bearings and friction, so it is a trade-off, not a free upgrade.
      </ExpandableInfo>

      <div style={{ fontSize: 12, color: T.ink2, margin: '10px 0 6px', fontWeight: 600 }}>Bore: {engineConfig.bore.toFixed(1)} mm</div>
      <input type="range" min={75} max={105} step={0.5} value={engineConfig.bore} onChange={(e) => setCfg({ bore: Number(e.target.value) })} style={{ width: '100%', accentColor: T.acc }} />
      <div style={{ fontSize: 12, color: T.ink2, margin: '10px 0 6px', fontWeight: 600 }}>Stroke: {engineConfig.stroke.toFixed(1)} mm</div>
      <input type="range" min={65} max={100} step={0.5} value={engineConfig.stroke} onChange={(e) => setCfg({ stroke: Number(e.target.value) })} style={{ width: '100%', accentColor: T.acc }} />
      <ExpandableInfo title="Bore, stroke, and engine character">
        Bore is cylinder diameter, stroke is how far the piston travels; together with cylinder count they set displacement. But the ratio between them shapes character independent of displacement: big-bore/short-stroke ("oversquare") tends to breathe and rev higher; small-bore/long-stroke ("undersquare") tends toward stronger low-end torque. This sandbox shifts your VE curve's effective bias toward high or low RPM based on what you set here.
      </ExpandableInfo>

      <div style={{ fontSize: 12, color: T.ink2, margin: '10px 0 6px', fontWeight: 600 }}>Compression Ratio: {engineConfig.compression.toFixed(1)}:1</div>
      <input type="range" min={8.5} max={13.0} step={0.1} value={engineConfig.compression} onChange={(e) => setCfg({ compression: Number(e.target.value) })} style={{ width: '100%', accentColor: T.acc }} />
      <ExpandableInfo title="Compression ratio's trade-off">
        Higher compression squeezes the mixture tighter before ignition, extracting more work from the same fuel — genuinely more efficient and torquey. The same squeeze also raises end-gas temperature and pressure, which is what causes knock. That is exactly why turbocharged engines usually run lower static compression than naturally aspirated ones: boost already adds cylinder pressure on its own.
      </ExpandableInfo>

      <div style={{ fontSize: 12, color: T.ink2, margin: '10px 0 6px', fontWeight: 600 }}>
        Camshaft Duration: {engineConfig.camDuration}° <span style={{ color: T.ink3, fontWeight: 400 }}>· overlap {Math.round(engineDerived.overlapDeg)}°</span>
      </div>
      <input type="range" min={180} max={300} step={2} value={engineConfig.camDuration} onChange={(e) => setCfg({ camDuration: Number(e.target.value) })} style={{ width: '100%', accentColor: T.acc }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9.5, color: T.ink3, marginTop: 2 }}>
        <span>mild · low-end torque</span><span>wild · top-end power</span>
      </div>
      <ExpandableInfo title="What camshaft duration actually does">
        Duration is how long, in crank degrees, a valve stays open. Hold the intake valve open longer and at <b style={{ color: T.ink }}>low RPM</b> some charge gets pushed back out during compression — you lose bottom end. But at <b style={{ color: T.ink }}>high RPM</b> there is barely time to fill the cylinder at all, and that extra open time is exactly what keeps it breathing.
        <br /><br />So a bigger cam does not add power everywhere — it <i>moves</i> the power. Watch the VE table and the dyno curve: the peak slides up the RPM range and the low-RPM cells drop. This sandbox models it by sampling the breathing curve at a cam-shifted engine speed, which is the honest way to represent it.
        <br /><br /><b style={{ color: T.ink }}>Overlap</b> is the window where both valves are open together. It grows with duration, and it is why cammed engines idle lumpy, pull weak manifold vacuum, and sound the way they do.
      </ExpandableInfo>

      <div style={{ fontSize: 12, color: T.ink2, margin: '10px 0 6px', fontWeight: 600 }}>
        Valve Spring Rate: {engineConfig.springRate} <span style={{ color: engineDerived.floatRpm < engineDerived.redline ? T.danger : T.ink3, fontWeight: 400 }}>· float at {Math.round(engineDerived.floatRpm)} RPM</span>
      </div>
      <input type="range" min={20} max={100} step={1} value={engineConfig.springRate} onChange={(e) => setCfg({ springRate: Number(e.target.value) })} style={{ width: '100%', accentColor: engineDerived.floatRpm < engineDerived.redline ? T.danger : T.cyan }} />
      {engineDerived.floatRpm < engineDerived.redline && (
        <div style={{ fontSize: 11.5, color: T.danger, marginTop: 5 }}>
          Springs float below redline — cylinder filling collapses above {Math.round(engineDerived.floatRpm)} RPM. Stiffen them or fit a milder cam.
        </div>
      )}
      <ExpandableInfo title="Why springs decide how far a cam can go">
        The cam pushes the valve open; only the spring closes it. As RPM rises the valve has less and less time to follow the closing ramp, and past the spring's limit it stops following the lobe entirely — <b style={{ color: T.ink }}>valve float</b>. The cylinder cannot fill, and power falls off a cliff rather than tapering.
        <br /><br />Bigger cams open valves further and faster, so they need stiffer springs. That is why "cam and springs" are sold together: fit an aggressive cam on stock springs and you will make <i>less</i> power than stock up top, because you float before you reach the RPM the cam was designed for.
        <br /><br />Stiffness is not free either — every cycle the engine compresses those springs, and that parasitic loss shows up in FMEP. Over-spring a mild cam and you simply lose a little power for nothing.
      </ExpandableInfo>

      <div style={{ fontSize: 12, color: T.ink2, marginBottom: 6, fontWeight: 600 }}>Block Material</div>
      <Seg label="Block Material" options={MATERIAL_OPTS.map((m) => ({ label: m, id: m }))} value={engineConfig.blockMaterial} onChange={(v) => setCfg({ blockMaterial: v })} />
      <div style={{ fontSize: 12, color: T.ink2, margin: '10px 0 6px', fontWeight: 600 }}>Head Material</div>
      <Seg label="Head Material" options={MATERIAL_OPTS.map((m) => ({ label: m, id: m }))} value={engineConfig.headMaterial} onChange={(v) => setCfg({ headMaterial: v })} />
      <ExpandableInfo title="Why block and head material matter">
        Aluminum conducts heat roughly three times faster than cast iron, so an aluminum head pulls heat away from the combustion chamber faster — a real, measurable knock-margin benefit. Cast iron is heavier and a worse conductor, but stiffer under heat, which is part of why some high-output blocks still use it.
      </ExpandableInfo>
      <Note>Changing bore, stroke, or configuration does not retroactively rewrite your VE/timing/AFR tables — you will feel the shift on your next dyno pull and can re-tune from there, just like swapping a real short block.</Note>
    </BuildSection>
  );
}
