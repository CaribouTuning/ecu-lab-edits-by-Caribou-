// @ts-nocheck
/*
 * This file opts out of type checking, deliberately and temporarily.
 *
 * `tsconfig.json` leaves EcuLab.jsx out of `include` because it is still one large
 * untyped component. That keeps it from being checked as a ROOT file — but `include`
 * and `exclude` only choose root files. tsc still checks anything a root file imports
 * transitively, so the moment a test under `tests/` imports this module, its ~26
 * pre-existing type errors fail `npm run typecheck`.
 *
 * This directive is what actually holds the line the tsconfig comment describes, and it
 * lets the characterisation tests import the component normally instead of hiding it
 * from tsc behind a dynamic import.
 *
 * It disappears with the file: PR 3 splits this component into typed screens.
 */
/**
 * ECU LAB — the application shell and screens.
 *
 * WHAT THIS FILE IS
 * Presentation only. It reads the simulation's output but contains no physics — if
 * you find yourself doing engineering maths in here, it belongs in `src/sim/`
 * instead. That separation is what keeps the physics testable in plain Node.
 *
 * LAYOUT
 * Shared primitives first, then the screens. Screens are plain conditional blocks
 * inside one component, each marked with a banner comment.
 *
 * KNOWN WORK IN PROGRESS
 * This file is still the original single-component app. Decomposing it into
 * `ui/primitives/` and `ui/screens/` is tracked as follow-up work — see CONTRIBUTING.
 */

import React, { useMemo, useEffect, useRef, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import {
  Gauge, Grid3x3, Zap, Droplets, Wind, Activity, RotateCcw, Play, AlertTriangle, Info,
  Wrench, Settings, Package, Flame, Trophy, TrendingUp, Fuel,
} from 'lucide-react';

import {
  BARO_KPA, COMPRESSOR_OPTS, CONFIG_OPTS, CYL_COUNT,
  DEFAULT_MODS, ENGINE_PRESETS, EXHAUST_DIA_OPTS,
  INJ_DEADTIME_MS, INJECTOR_OPTS, LOAD, MATERIAL_OPTS, MOD_INFO, OCTANE_OPTS,
  PRESET_GROUPS, PSI_TO_KPA, SPARK_MAX_DEG, SPARK_MIN_DEG,
  R_AIR, RPM, TURBINE_OPTS, applyPreset, calibrationAdvice, chargeTempK, clamp, clone2D,
  computeEngineerScore, computeHardwareVE, computePullScore, computeTuningScore,
  deriveEngine, idealExhaustDiameter, interp2, presetById,
  simulateSweep, turbineWithCount, veRecommendations
} from '../sim/index.js';
import { T, deltaHeat, heat, shadowAlpha, statusColor, utilisationColor } from './theme.js';
import { BUILD_VERSION } from '../version.js';
import { loadCareer, saveCareer } from '../storage.js';
import { StartScreen } from './screens/StartScreen.jsx';
import { TutorialScreen } from './screens/TutorialScreen.jsx';
import { StoreProvider, useBuild, useSession, useTune } from './state/StoreProvider.jsx';
import { ROUTES } from './routing.js';
import { useRoute } from './useRoute.js';
import { ACTIONS } from './state/reducer.js';
import { Button } from './primitives/Button.jsx';
import { Eyebrow } from './primitives/Eyebrow.jsx';
import { Note } from './primitives/Note.jsx';
import { Panel } from './primitives/Panel.jsx';
import { StatTile } from './primitives/StatTile.jsx';
import { Bar } from './primitives/Bar.jsx';
import { Seg } from './primitives/Seg.jsx';
import { Select } from './primitives/Select.jsx';
import { Toggle } from './primitives/Toggle.jsx';
import { BuildSection } from './primitives/BuildSection.jsx';
import { DialMark } from './primitives/DialMark.jsx';
import { ExpandableInfo } from './primitives/ExpandableInfo.jsx';
import { HealthScreen } from './screens/dash/HealthScreen.jsx';
import { LearnScreen } from './screens/dash/LearnScreen.jsx';
import { LiveScreen } from './screens/dash/LiveScreen.jsx';
import { StatsScreen } from './screens/dash/StatsScreen.jsx';

// Full-width descriptive rows for choices that need a subtitle (turbine, injectors).
function PickList({ options, value, onChange }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 4 }}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button key={o.value} onClick={() => onChange(o.value)} style={{
            textAlign: 'left', padding: '11px 13px', borderRadius: 9, fontWeight: 600, fontSize: 13,
            border: `1px solid ${active ? T.acc : T.line}`, background: active ? T.accBg : T.panel2,
            color: active ? T.accInk : T.inkSoft,
          }}>{o.label}{o.sub && <div style={{ fontSize: 11, color: T.ink2, marginTop: 2, fontWeight: 400 }}>{o.sub}</div>}</button>
        );
      })}
    </div>
  );
}

// Guided first run. Walks a new player through the actual working order a tuner
// uses — build the engine, calibrate it, hear it run, then measure it — and then
// gets out of the way. Purely navigational: it never changes the simulation.
const JOURNEY = [
  { tab: 'build', title: 'Step 1 · Build the engine',
    body: 'Open Engine Architecture and design a short block: bore, stroke, compression, cam, springs. Then fit parts under Bolt-Ons. Nothing here is cosmetic — every choice changes how the engine breathes.',
    cta: 'Done building — go tune it', next: 'tune' },
  { tab: 'tune', title: 'Step 2 · Calibrate it',
    body: 'AIR is your airflow log — if it is stale after your build, accept the re-logged values. Then SPARK sets ignition timing and FUEL sets the mixture. The advisories tell you what your hardware will tolerate; the editing is yours.',
    cta: 'Calibration set — start the engine', next: 'dash' },
  { tab: 'dash', title: 'Step 3 · Start it and listen',
    body: 'Open Live Engine and press START. Watch it idle, hold the throttle to rev it, and watch the sensors and fuel trims respond in real time. This is your calibration actually running.',
    cta: 'Sounds good — put it on the dyno', next: 'dyno' },
  { tab: 'dyno', title: 'Step 4 · Measure it',
    body: 'Run a pull. Then read the Pull Log before you look at the power number — it explains anything that went wrong and what to change. From here the loop is: adjust, pull again, compare.',
    cta: 'Finish — let me explore freely', next: null },
];

function JourneyBanner({ step, onAdvance, onDismiss }) {
  const j = JOURNEY[step];
  if (!j) return null;
  return (
    <div style={{ background: T.accBg, border: `1px solid ${T.acc}`, borderRadius: 12, padding: '13px 14px', margin: '0 0 14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ fontSize: 11, letterSpacing: 1, color: T.accInk, fontWeight: 800 }}>{j.title.toUpperCase()}</div>
        <Button variant="quiet" size="sm" style={{ flexShrink: 0 }} onClick={onDismiss}>SKIP GUIDE</Button>
      </div>
      <div style={{ fontSize: 12.5, color: T.inkSoft, lineHeight: 1.55, marginTop: 7 }}>{j.body}</div>
      <div style={{ display: 'flex', gap: 5, marginTop: 11, marginBottom: 10 }}>
        {JOURNEY.map((_, i) => (
          <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= step ? T.acc : T.line }} />
        ))}
      </div>
      {/* The closest thing this file has to a justified `block`, and still not one.
          The card looks bounded, but nothing bounds it: index.html lays the app out
          mobile-first and neither the shell nor any tab body sets a max-width, so
          this banner is as wide as the window. `block` here would put a 2500px-wide
          "Done building — go tune it" on a desktop monitor, which is the complaint
          this PR exists to answer. Give the app a max-width first; `block` becomes
          honest the moment a container is genuinely narrow. */}
      <Button onClick={onAdvance}>
        {j.cta}
      </Button>
    </div>
  );
}

function Tach({ rpm, cylinders, running, fullScaleRpm }) {
  const pct = clamp(rpm / fullScaleRpm, 0, 1);
  // fullScaleRpm is redline * 1.1 (see tachFullScaleRpm), so redline itself always
  // sits at pct ≈ 0.909 regardless of engine — the red zone has to start at or just
  // below that, not above it, or the needle never shows red at the engine's own redline.
  const zoneColor = utilisationColor(pct * 100);
  return (
    <Panel style={{ textAlign: 'center', background: T.panel }}>
      <style>{`@keyframes cylpulse{0%,100%{opacity:.25;transform:scaleY(.6)}50%{opacity:1;transform:scaleY(1)}}`}</style>
      <div style={{ position: 'relative', display: 'inline-block' }}>
        <DialMark size={168} pct={pct} live={running} />
        <div style={{ position: 'absolute', top: '58%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center' }}>
          <div style={{ fontSize: 26, fontWeight: 800, fontFamily: T.mono, color: T.ink }}>{Math.round(rpm)}</div>
          <div style={{ fontSize: 8.5, color: T.ink3, letterSpacing: 1.5, fontWeight: 700 }}>RPM</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 4, justifyContent: 'center', marginTop: 8, height: 26 }}>
        {Array.from({ length: cylinders }).map((_, i) => (
          <div key={i} style={{
            width: 8, height: 24, borderRadius: 2, background: zoneColor,
            // Duration then delay, both inside the shorthand: `animation` resets
            // `animation-delay`, so declaring the longhand beside it left the
            // per-cylinder stagger dependent on property order.
            animation: running ? `cylpulse ${Math.max(0.12, 50 / Math.max(rpm, 500))}s ${i * (0.5 / cylinders)}s ease-in-out infinite` : 'none',
            opacity: running ? undefined : 0.3,
          }} />
        ))}
      </div>
    </Panel>
  );
}

// ============================================================
function TuningGrid({ data, min, max, decimals, selection, setSelection }) {
  const fmt = (v) => (decimals ? v.toFixed(decimals) : Math.round(v));
  const selectCell = (row, col) => setSelection({ type: 'cell', row, col });
  const selectRow = (row) => setSelection({ type: 'row', row });
  const selectCol = (col) => setSelection({ type: 'col', col });
  const isSelected = (row, col) => {
    if (!selection) return false;
    if (selection.type === 'cell') return selection.row === row && selection.col === col;
    if (selection.type === 'row') return selection.row === row;
    if (selection.type === 'col') return selection.col === col;
    return false;
  };
  return (
    <div data-testid="tuning-grid">
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9.5, color: T.ink3, fontWeight: 700, letterSpacing: 0.8, marginBottom: 4 }}>
      <span>MAP kPa &darr;</span><span>RPM &rarr;</span>
    </div>
    <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', border: `1px solid ${T.line}`, borderRadius: 10 }}>
      <div style={{ display: 'inline-block', minWidth: '100%' }}>
        <div style={{ display: 'flex' }}>
          <div style={{ width: 44, flexShrink: 0, background: T.panel }} />
          {RPM.map((r, ci) => (
            <button key={r} onClick={() => selectCol(ci)} style={{
              width: 51, height: 30, flexShrink: 0, border: 'none', borderBottom: `1px solid ${T.line}`, borderLeft: `1px solid ${T.line}`,
              background: selection?.type === 'col' && selection.col === ci ? T.acc : T.panel,
              color: selection?.type === 'col' && selection.col === ci ? T.accOn : T.ink2,
              fontFamily: T.mono, fontSize: 10, fontWeight: 700,
            }}>{r}</button>
          ))}
        </div>
        {LOAD.map((load, ri) => (
          <div key={load} style={{ display: 'flex' }}>
            <button onClick={() => selectRow(ri)} style={{
              width: 44, height: 37, flexShrink: 0, border: 'none', borderRight: `1px solid ${T.line}`, borderTop: `1px solid ${T.line}`,
              background: selection?.type === 'row' && selection.row === ri ? T.acc : T.panel,
              color: selection?.type === 'row' && selection.row === ri ? T.accOn : T.ink2,
              fontFamily: T.mono, fontSize: 10, fontWeight: 700,
            }}>{load}</button>
            {data[ri].map((val, ci) => (
              <button key={ci} onClick={() => selectCell(ri, ci)} style={{
                width: 51, height: 37, flexShrink: 0,
                border: isSelected(ri, ci) ? `2px solid ${T.ink}` : `1px solid ${shadowAlpha(0.35)}`,
                background: heat(val, min, max), color: T.ink,
                fontFamily: T.mono, fontSize: 12, fontWeight: 700,
              }}>{fmt(val)}</button>
            ))}
          </div>
        ))}
      </div>
    </div>
    </div>
  );
}

// Reference data for a selected cell. Deliberately DESCRIPTIVE, not predictive:
// it tells you what this parameter does and what range is normal here, but never
// simulates an outcome — only a real dyno pull produces results in this sandbox.
function cellReference(kind, row, col, value) {
  const rpm = RPM[col], map = LOAD[row];
  const boosted = map > 105, wot = map >= 95, cruise = map <= 70;
  const highRpm = rpm >= 5500, lowRpm = rpm <= 2500;
  if (kind === 've') {
    const typical = boosted ? '95-110%' : wot ? (highRpm ? '80-95%' : lowRpm ? '60-75%' : '90-100%') : (cruise ? '55-80%' : '75-90%');
    return {
      what: 'Cylinder filling efficiency at this manifold pressure — how completely the cylinder fills relative to the pressure available.',
      typical: `Typical here: ${typical}.`,
      affects: 'Feeds the air-mass calculation (airCharge = VE x V_cyl x MAP/RT). Raising it raises fuel demand and pulse width at this point.',
      note: boosted ? 'Above ~105 kPa you are in boost — these rows only get used once a turbo is fitted.' : null,
    };
  }
  if (kind === 'timing') {
    const typical = boosted ? '14-24°' : wot ? (lowRpm ? '12-20°' : highRpm ? '28-38°' : '22-32°') : '32-45°';
    return {
      what: 'Spark advance before top dead center, aiming to land peak cylinder pressure ~16° after TDC.',
      typical: `Typical here: ${typical}. Low manifold pressure tolerates far more advance; boost tolerates much less.`,
      affects: 'Torque rises toward MBT then flattens. Beyond the knock limit the ECU pulls it back during the pull.',
      note: boosted && value > 28 ? 'Aggressive for a boosted cell — cylinder pressure is already high here.' : null,
    };
  }
  const typical = boosted ? '11.5-12.3:1' : wot ? '12.5-13.2:1' : cruise ? '14.7:1 (stoich, closed loop)' : '13.5-14.5:1';
  return {
    what: 'Commanded air:fuel ratio, gasoline-equivalent. Divide by 14.7 for lambda.',
    typical: `Typical here: ${typical}.`,
    affects: 'Sets fuel mass, and therefore pulse width and duty cycle. Richer cools combustion and resists knock; leaner raises EGT and knock risk.',
    note: boosted && value > 12.8 ? 'Lean for a boosted cell — this is where lean mixtures burn pistons.' : cruise && value < 14 ? 'Richer than needed for cruise — wastes fuel with no power gain at this load.' : null,
  };
}

function SelectionDock({ data, setData, selection, min, max, decimals, unit, onClose, kind }) {
  if (!selection) return null;
  let current;
  if (selection.type === 'cell') current = data[selection.row][selection.col];
  else if (selection.type === 'row') current = data[selection.row].reduce((a, b) => a + b, 0) / data[selection.row].length;
  else current = data.reduce((a, r) => a + r[selection.col], 0) / data.length;

  const apply = (delta) => {
    const next = clone2D(data);
    if (selection.type === 'cell') next[selection.row][selection.col] = Number(clamp(next[selection.row][selection.col] + delta, min, max).toFixed(2));
    else if (selection.type === 'row') next[selection.row] = next[selection.row].map((v) => Number(clamp(v + delta, min, max).toFixed(2)));
    else next.forEach((r) => { r[selection.col] = Number(clamp(r[selection.col] + delta, min, max).toFixed(2)); });
    setData(next);
  };
  const setAbs = (v) => {
    const next = clone2D(data);
    if (selection.type === 'cell') next[selection.row][selection.col] = clamp(v, min, max);
    else if (selection.type === 'row') next[selection.row] = next[selection.row].map(() => clamp(v, min, max));
    else next.forEach((r) => { r[selection.col] = clamp(v, min, max); });
    setData(next);
  };
  const smallStep = decimals ? 0.1 : 1;
  const bigStep = decimals ? 1 : 5;
  let sel = 'Cell';
  if (selection.type === 'row') sel = `Row · ${LOAD[selection.row]} kPa MAP`;
  else if (selection.type === 'col') sel = `Column · ${RPM[selection.col]} RPM`;
  else sel = `${RPM[selection.col]} RPM · ${LOAD[selection.row]} kPa MAP`;

  return (
    <div data-testid="selection-dock" style={{ position: 'sticky', bottom: 0, background: T.panel, borderTop: `1px solid ${T.line}`, padding: '11px 14px 13px', boxShadow: `0 -8px 20px ${shadowAlpha(0.45)}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 }}>
        <div>
          <div style={{ fontSize: 10, letterSpacing: 1, color: T.ink2, textTransform: 'uppercase', fontWeight: 700 }}>{sel}</div>
          <div style={{ fontFamily: T.mono, fontSize: 23, fontWeight: 800, color: T.ink }}>
            {decimals ? current.toFixed(decimals) : Math.round(current)}<span style={{ fontSize: 12, color: T.ink2, marginLeft: 4 }}>{unit}</span>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>DONE</Button>
      </div>
      {selection.type === 'cell' && kind && (() => {
        const ref = cellReference(kind, selection.row, selection.col, current);
        return (
          <Panel tight style={{ marginBottom: 9, fontSize: 11.5, lineHeight: 1.55, color: T.ink2 }}>
            <div style={{ fontSize: 9.5, letterSpacing: 1, color: T.cyan, fontWeight: 800, marginBottom: 5 }}>REFERENCE · {RPM[selection.col]} RPM / {LOAD[selection.row]} kPa</div>
            <div>{ref.what}</div>
            <div style={{ marginTop: 4, color: T.ink }}>{ref.typical}</div>
            <div style={{ marginTop: 4 }}><b style={{ color: T.inkSoft }}>Affects: </b>{ref.affects}</div>
            {ref.note && <div style={{ marginTop: 4, color: T.warn }}>{ref.note}</div>}
          </Panel>
        );
      })()}
      <input type="range" min={min} max={max} step={smallStep} value={current} onChange={(e) => setAbs(Number(e.target.value))} style={{ width: '100%', accentColor: T.acc }} />
      <div style={{ display: 'flex', gap: 7, marginTop: 9 }}>
        {/* One colour for all four: the +/- is already in the label. Painting the
            positive steps with the status green said "raising this cell is good", which
            is not something a stepper can know — and spending the status scale on a sign
            is what teaches a player to ignore it where it means something. */}
        {[-bigStep, -smallStep, smallStep, bigStep].map((d, i) => (
          <button key={i} onClick={() => apply(d)} style={{
            flex: 1, padding: '11px 0', borderRadius: 8, border: `1px solid ${T.line}`, background: T.panel2,
            color: T.accInk, fontWeight: 800, fontFamily: T.mono, fontSize: 13,
          }}>{d > 0 ? '+' : ''}{d}</button>
        ))}
      </div>
    </div>
  );
}

const TUTORIAL_STEPS = [
  { title: 'This is an air pump',
    body: 'An engine makes power by burning fuel, and it can only burn as much fuel as it has air to burn it with. So everything starts with airflow. The ECU measures the air, decides how much fuel to inject, and picks the moment to light it. Tuning is adjusting those last two decisions.' },
  { title: 'Design it on BUILD',
    body: 'Bore, stroke, compression, cam duration, valve springs, materials, turbo, exhaust. None of it is cosmetic — every choice feeds the physics. Change the cam and watch the VE table on TUNE redraw itself, because that is genuinely what changing a cam does to an engine.' },
  { title: 'Three tables, three jobs',
    body: 'On TUNE: AIR (volumetric efficiency — how well each cylinder fills), SPARK (ignition timing in degrees before top dead center), FUEL (target air-fuel ratio). Rows are manifold pressure in kPa, columns are RPM — the same axes real speed-density tuning software uses.' },
  { title: 'Nothing is simulated until you pull',
    body: 'No preview, no live guess. Press RUN DYNO PULL on DYNO and the engine sweeps 1500 RPM to its own redline, producing a real datalog. That is the only way to find out what your changes did — exactly like a real dyno session.' },
  { title: 'Read the log before touching anything',
    body: 'Every pull produces a Pull Log. Each problem gets a plain-language Why (what physically caused it) and a Try (what to change). The datalog next to it shows commanded vs. actual for timing and mixture. A gap between those two columns is the ECU telling you something.' },
  { title: 'Change one thing, then pull again',
    body: 'This is the entire method: one change, one pull, read the log, adjust. The VS. LAST PULL line tells you whether it actually helped. Tuners who change three things at once cannot tell which one worked — and tuners who guess instead of logging break engines.' },
  { title: 'Know what you cannot tune away',
    body: 'Knock, mixture and MAF errors are calibration faults — tables fix them completely. Injectors out of duty cycle, valve float, a compressor past its range: those are physical limits, and the log will tell you so. Recognising which kind you are looking at is most of the skill.' },
  { title: 'Chase the score',
    body: 'Every pull grades Tuning (how clean the calibration is) and Engineer (how sound the hardware choices are), then combines them with actual output into an uncapped Pull Score. A big, slightly dirty pull can beat a small spotless one — the same tension a real tuner balances.' },
];

// ============================================================
/**
 * The application body. Exported so a caller can mount it inside its OWN
 * `<StoreProvider>` and share the store with it — which is how the tests reach
 * build states this component's own guards cannot produce on their own (see
 * tests/ui/build-store.test.jsx). The default export below is the same component
 * with a provider already around it, and is what the app and most tests use.
 * @returns {React.ReactElement}
 */
export function EcuLabApp() {
  // Navigation lives in the URL, not in state. `appView`, `tab` and the four section
  // hooks that used to sit here are all one `route` now — see src/ui/routing.js.
  const [route, navigate] = useRoute();
  const appView = route.view;
  const tab = route.tab;
  // The BUILD slice — hardware and ECU configuration — lives in the store. Destructured
  // so every READ site below stays a bare `engineConfig` / `mods` / ...; only the WRITES
  // changed, from setters to dispatches. All three domain slices are in the store now.
  const [build, dispatch] = useBuild();
  const {
    engineConfig, mods, turboOn, boostCurve, octaneIdx, injIdx, mafScalar,
    turbineIdx, turbineCount, compressorIdx, exhaustDiaIdx, ecuInjectorCc,
    presetId, presetPrompt, boostSel,
  } = build;
  // The TUNE slice — calibration tables, the unsaved-work flag, and the grid cursor.
  // Same destructuring shape as `build` above; `dispatch` is the SAME function
  // useBuild() returned (one reducer, one useReducer call — see StoreProvider.jsx),
  // so it is not re-bound here.
  const [tune] = useTune();
  const { ve, timing, afr, tablesDirty, selection } = tune;
  // The SESSION slice — everything about the current run and career progress that is
  // neither hardware nor calibration. Same destructuring shape again, same `dispatch`.
  // What is left as local `useState` below is deliberate: `appView`, `tab`,
  // `buildSection`, `tuneView`, `dynoView` and `dashSection` are VIEW state (which
  // screen and which accordion panel is open), which PR 3 moves when it splits this
  // component into screens.
  const [session] = useSession();
  const {
    loadKpa, soundOn, journeyStep, throttleInput, histogram, health,
    result, prevResult, running, revealCount, bestScore, totalScore, pullCount,
    live,
  } = session;
  // One `route.section` serves all four tabs, narrowed per tab so every call site below
  // keeps reading the name it always read — and so a later task can move a tab's markup
  // into a screen file without renaming anything. The narrowing is not decorative:
  // `tab` is the only thing that says which tab a section belongs to.
  //
  // `null` is a REAL value here, not "unset". Each of these is null while that tab's
  // accordion is fully collapsed, which is the state clicking an open section's own
  // header produces (see `toggleSection`) and the state `#/build` — a tab with no
  // section segment — spells. Defaulting it to a section would make closing impossible,
  // and no existing test would fail.
  const buildSection = tab === 'build' ? route.section : null;
  const tuneView = tab === 'tune' ? route.section : null;
  const dynoView = tab === 'dyno' ? route.section : null;
  const dashSection = tab === 'dash' ? route.section : null;
  const revealTimer = useRef(null);
  const liveTimer = useRef(null);
  const liveCfgRef = useRef(null);
  const throttleRef = useRef(0);
  const audioRef = useRef(null);

  // `withPresetField` is gone: SET_BUILD_FIELD clears `presetId` itself, so the
  // invalidation now happens inside the reducer rather than in a wrapper each new
  // hardware field had to remember to be threaded through. The one hand-edit path that
  // used to cross the build/tune boundary in two local calls (`clearPresetId` then
  // `setTablesDirty(true)`) is now the single SET_TABLE action, which clears `presetId`
  // and flags unsaved work in the SAME reducer pass — see reducer.js. `withTableEdit`
  // and its three derived setters (`setVeEdited`/`setTimingEdited`/`setAfrEdited`) are
  // gone; every table-edit call site below dispatches SET_TABLE directly.
  //
  // `clearPresetId` itself survives with a narrower job: CLEAR_PRESET_ID touches
  // `presetId` alone, with no `tablesDirty` side effect, for the one caller that wants
  // exactly that — the preset picker's "Custom build" option, below.
  const clearPresetId = () => dispatch({ type: ACTIONS.CLEAR_PRESET_ID });
  // The build-side analogue of a table edit is a cursor, not a calibration edit:
  // `SET_TUNE_FIELD` deliberately does NOT clear `presetId` or flag `tablesDirty`
  // (see reducer.js), so moving the highlighted grid cell never disowns a loaded
  // preset.
  const setSelection = (value) => dispatch({ type: ACTIONS.SET_TUNE_FIELD, field: 'selection', value });

  const octaneBonus = OCTANE_OPTS[octaneIdx].bonus;
  const engineDerived = useMemo(() => deriveEngine(engineConfig), [engineConfig]);
  // The live tach needle and the dyno chart's RPM axis both used to top out at a
  // hardcoded 7500 — correct only for the one preset whose redline happened to match
  // it. Key them off this engine's own redline instead, each with headroom sized for
  // what it actually needs to show: the tach has to leave room for the rev limiter's
  // overshoot bounce (liveStep cuts fuel at redline + 100 RPM) without pegging, while
  // the dyno chart's sweep data never exceeds redline at all, so it only needs enough
  // padding that the last point isn't jammed against the axis edge.
  const tachFullScaleRpm = engineDerived.redline * 1.1;
  const dynoChartMaxRpm = engineDerived.redline * 1.05;
  const idealExhaustDia = useMemo(() => idealExhaustDiameter(engineDerived.displacementL, turboOn ? Math.max(...boostCurve) : 0), [engineDerived, turboOn, boostCurve]);
  const exhaustDiaError = EXHAUST_DIA_OPTS[exhaustDiaIdx].dia - idealExhaustDia;
  const mafErrorBase = useMemo(() => {
    let e = 1.0;
    if (mods.intake) e *= 0.90;
    if (turboOn) e *= 0.92;
    return e;
  }, [mods.intake, turboOn]);

  const fuel = OCTANE_OPTS[octaneIdx];
  const injectorCc = INJECTOR_OPTS[injIdx].cc;

  // Every hardware choice that physically changes how the engine breathes feeds the
  // VE table: bore/stroke, cylinder count, compression, cam duration, valve springs,
  // head material, bolt-ons, exhaust diameter, turbine backpressure, and the fuel's
  // charge-cooling effect.
  //
  // The table is NEVER rewritten silently. Changing hardware leaves your logged VE
  // stale — exactly as it would in a real shop, where the old log does not update
  // itself because you bolted something on. The VE tab shows what changed and by how
  // much, and you choose when to accept it.
  // The turbine as actually fitted, count included. EVERY consumer below reads this
  // rather than indexing TURBINE_OPTS directly, so a twin-turbo preset cannot be
  // simulated as a single housing.
  const turbine = useMemo(
    () => turbineWithCount(TURBINE_OPTS[turbineIdx], turbineCount),
    [turbineIdx, turbineCount],
  );

  const hwForVe = useMemo(() => ({
    turboOn,
    turbine: turboOn ? turbine : null,
    exhaustDia: EXHAUST_DIA_OPTS[exhaustDiaIdx].dia,
    fuel,
    peakBoostPsi: turboOn ? Math.max(...boostCurve) : 0,
  }), [turboOn, turbine, exhaustDiaIdx, fuel, boostCurve]);

  // TRUE cylinder filling for the hardware as currently built. The player's `ve` table
  // is only the ECU's BELIEF about this; the gap between the two is what makes the
  // mixture drift off target and what the fuel-trim histogram measures and corrects.
  const veTruth = useMemo(
    () => computeHardwareVE(engineConfig, mods, hwForVe),
    [engineConfig, mods, hwForVe],
  );

  const recalcVE = () => dispatch({ type: ACTIONS.SET_TABLE, table: 've', value: veTruth });

  // Every boost-curve write goes through here. Rebuilding from the RPM axis makes it
  // structurally impossible for the curve to be the wrong length or to contain a
  // non-number, which is what previously let a single edit poison the whole sim.
  const setBoostAt = (i, value) => dispatch({
    type: ACTIONS.SET_BUILD_FIELD,
    field: 'boostCurve',
    value: RPM.map((_, idx) => clamp(Number(idx === i ? value : boostCurve[idx]) || 0, 0, 25)),
  });
  const calAdvice = useMemo(() => calibrationAdvice({
    ve, veTruth, timing, afr, derived: engineDerived, octaneBonus, fuel, mods, turboOn, boostCurve,
    compressor: COMPRESSOR_OPTS[compressorIdx],
    injectorCc, ecuInjectorCc, mafScalar, mafErrorBase,
  }), [ve, veTruth, timing, afr, engineDerived, octaneBonus, fuel, mods, turboOn, boostCurve,
       compressorIdx, injectorCc, ecuInjectorCc, mafScalar, mafErrorBase]);

  const veAdvice = useMemo(
    () => veRecommendations(ve, engineConfig, mods, hwForVe),
    [ve, engineConfig, mods, hwForVe]
  );

  // Same real-units chain the sim uses, evaluated at WOT / 6500 RPM as a preview.
  const dutyPreview = useMemo(() => {
    const rpm = 6500;
    const boostPsi = turboOn ? boostCurve[RPM.indexOf(6500)] : 0;
    const mapKpa = BARO_KPA + boostPsi * PSI_TO_KPA;
    const chargeK = chargeTempK(boostPsi, mods.intercooler);
    const vCylM3 = (engineDerived.displacementL / engineDerived.cyl) / 1000;
    const airDensity = (mapKpa * 1000) / (R_AIR * chargeK);
    const airChargeG = (interp2(ve, rpm, mapKpa) / 100) * vCylM3 * airDensity * 1000;
    const lambda = interp2(afr, rpm, mapKpa) / 14.7;
    const fuelMassG = airChargeG / (lambda * fuel.stoich);
    const pw = fuelMassG / ((ecuInjectorCc * fuel.density) / 60000) + INJ_DEADTIME_MS;
    return clamp((pw / (120000 / rpm)) * 100, 0, 220);
  }, [ve, afr, turboOn, boostCurve, ecuInjectorCc, fuel, mods.intercooler, engineDerived]);
  // Single source of truth for the "no headroom left" cutoff is utilisationColor's
  // own >90 band — comparing its output rather than re-testing dutyPreview keeps this
  // caption from becoming a fourth copy of the threshold.
  const dutyDangerous = utilisationColor(dutyPreview) === T.danger;

  const needsMafRecal = mods.intake || turboOn;
  /** Open a tab at its first section — what a tab button means. */
  const goTab = (t) => navigate({ view: 'app', tab: t, section: ROUTES[t][0] });
  /** Open a specific section of a tab. */
  const goSection = (t, sec) => navigate({ view: 'app', tab: t, section: sec });
  /** Toggle a section: clicking the open one closes it, leaving the tab with none. */
  const toggleSection = (t, sec) => navigate({ view: 'app', tab: t, section: route.section === sec ? null : sec });
  // HOME's screens live in their own files and one of them is memoised, so its
  // props have to be referentially stable or the memo never bails out. `toggleSection`
  // above closes over `route.section`, which makes it a new function on every render —
  // including the twenty a second the live engine causes. Reading the current section
  // from a ref instead pins the identity for the life of the component. The ref is
  // written during render, like `liveCfgRef` and `throttleRef` below, and read only
  // from a click handler, so it cannot be stale by the time it is used.
  const sectionRef = useRef(route.section);
  sectionRef.current = route.section;
  const toggleDashSection = useCallback(
    (sec) => navigate({ view: 'app', tab: 'dash', section: sectionRef.current === sec ? null : sec }),
    [navigate],
  );
  const goTutorial = () => navigate({ view: 'tutorial', tab: null, section: null });
  const changeTab = (t) => { goTab(t); setSelection(null); };

  const installMod = (key) => {
    if (mods[key]) return;
    // Fitting a part changes airflow but does NOT edit your logged VE table — the
    // VE tab will show the gap and let you accept it once you understand why.
    dispatch({ type: ACTIONS.SET_BUILD_FIELD, field: 'mods', value: { ...mods, [key]: true } });
  };
  const resetToStock = () => {
    // Wipes the calibration back to a generic stock baseline — which, if a factory
    // preset was loaded, is NOT that preset's validated tables, so RESET_TO_STOCK
    // drops the preset label with it and pins tablesDirty back to false in the same
    // pass: a reset baseline is not unsaved player work.
    //
    // The reducer does NOT compute the stock VE table; the caller does, and the mix of
    // arguments is the point: DEFAULT_MODS (the bolt-ons come off) against the CURRENT
    // `hwForVe` (the turbo does not — resetting the calibration is not uninstalling the
    // hardware). Either half swapped for the other yields a perfectly plausible table
    // that is wrong.
    const stockVe = computeHardwareVE(engineConfig, DEFAULT_MODS, hwForVe);
    dispatch({ type: ACTIONS.RESET_TO_STOCK, ve: stockVe });
  };
  // The REPAIR button's only handler. Before the extraction this wrote a local
  // `health` that the store never saw, while REPAIR_ENGINE sat in the reducer with no
  // caller at all — so this is an ADDED dispatch, not a converted one. Drop it and the
  // button goes inert with nothing raising an error: see tests/ui/session-store.test.jsx.
  const repairEngine = () => dispatch({ type: ACTIONS.REPAIR_ENGINE });
  // Actions cannot carry functions, so the old functional update becomes a patch the
  // reducer merges into the engineConfig it already holds. It invalidates the preset
  // label like every other hardware write.
  const setCfg = (patch) => dispatch({ type: ACTIONS.SET_ENGINE_CONFIG_PATCH, patch });

  /** Whether the player has unsaved calibration work — hand-edited VE/spark/fuel —
   *  that loading a preset would silently overwrite. Tracked directly via
   *  `tablesDirty` rather than pull count: pullCount is restored from career
   *  storage on load, so it nags a returning player on an untouched default
   *  engine, and it misses a player who edited every table but never pulled. */
  const hasTuningWork = () => tablesDirty;

  const applyEnginePreset = (preset) => {
    const p = applyPreset(preset);
    // The whole BUILD slice — including `mafScalar` back to 1.0, and `presetId` SET
    // rather than cleared — lands in ONE pass. That is what the original's comment
    // about not routing these writes through the invalidating setters was working
    // around: there is no longer a "last call" whose ordering decides the outcome.
    //
    // NOTE the payload is applyPreset()'s OUTPUT, not the raw catalogue entry — the
    // raw entry has no `engineConfig`, so passing it builds an engine with no short
    // block.
    // APPLY_PRESET writes all three slices in that one pass — including clearing
    // `session.result` and `session.prevResult`, so that a factory rating from the
    // newly loaded engine never sits next to a pull logged on whatever was running
    // before it. The two local `setResult(null)`/`setPrevResult(null)` calls that used
    // to follow this line were mirroring writes the reducer already made.
    dispatch({ type: ACTIONS.APPLY_PRESET, preset: p });
  };

  const choosePreset = (preset) => {
    if (hasTuningWork()) dispatch({ type: ACTIONS.SET_PRESET_PROMPT, value: preset });
    else applyEnginePreset(preset);
  };

  const ensureAudio = () => {
    if (audioRef.current) return audioRef.current;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    try {
      const ctx = new Ctx();
      const master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);

      // An exhaust note is a PULSE TRAIN, not a smooth wave — each cylinder fires a
      // sharp pressure spike. Building a periodic wave with many harmonics falling
      // off ~1/n gives that pulse character, which sounds far more like an engine
      // than a raw sawtooth does.
      const N = 24;
      const re = new Float32Array(N), im = new Float32Array(N);
      for (let n = 1; n < N; n++) { re[n] = 0; im[n] = (1 / n) * Math.exp(-n / 14); }
      const pulseWave = ctx.createPeriodicWave(re, im, { disableNormalization: false });

      // Two slightly detuned pulse oscillators — real engines never hold a perfectly
      // pure pitch, and the beating between them is what stops it sounding synthetic.
      const oscA = ctx.createOscillator(); oscA.setPeriodicWave(pulseWave); oscA.frequency.value = 40;
      const oscB = ctx.createOscillator(); oscB.setPeriodicWave(pulseWave); oscB.frequency.value = 40; oscB.detune.value = 9;
      const oscG = ctx.createGain(); oscG.gain.value = 0.5;
      const sub = ctx.createOscillator(); sub.type = 'sine'; sub.frequency.value = 20;
      const subG = ctx.createGain(); subG.gain.value = 0.35;

      // Exhaust system: a resonant body plus an overall lowpass.
      const body = ctx.createBiquadFilter(); body.type = 'bandpass'; body.frequency.value = 320; body.Q.value = 0.9;
      const bodyG = ctx.createGain(); bodyG.gain.value = 0.8;
      const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 900; filter.Q.value = 2;
      filter.connect(master); body.connect(bodyG); bodyG.connect(master);
      oscA.connect(oscG); oscB.connect(oscG); oscG.connect(filter); oscG.connect(body);
      sub.connect(subG); subG.connect(filter);

      const bufLen = 2 * ctx.sampleRate;
      const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
      const dch = buf.getChannelData(0);
      for (let i = 0; i < bufLen; i++) dch[i] = (Math.random() * 2 - 1) * 0.35;

      // Combustion roughness, amplitude-modulated at the firing rate so the noise
      // arrives in pulses rather than as constant hiss.
      const noise = ctx.createBufferSource(); noise.buffer = buf; noise.loop = true;
      const ng = ctx.createGain(); ng.gain.value = 0.04;
      const pulseLfo = ctx.createOscillator(); pulseLfo.type = 'sawtooth'; pulseLfo.frequency.value = 40;
      const pulseDepth = ctx.createGain(); pulseDepth.gain.value = 0.03;
      pulseLfo.connect(pulseDepth); pulseDepth.connect(ng.gain);
      noise.connect(ng); ng.connect(filter);

      // LOPE: valve overlap makes combustion inconsistent cylinder-to-cylinder at
      // idle, so output surges and dips at a slow sub-multiple of the firing rate.
      // That uneven pulsing is the classic cammed idle.
      const lopeLfo = ctx.createOscillator(); lopeLfo.type = 'triangle'; lopeLfo.frequency.value = 6;
      const lopeDepth = ctx.createGain(); lopeDepth.gain.value = 0;
      lopeLfo.connect(lopeDepth); lopeDepth.connect(master.gain);
      lopeLfo.start();

      const indG = ctx.createGain(); indG.gain.value = 0;
      const indFilt = ctx.createBiquadFilter(); indFilt.type = 'bandpass'; indFilt.frequency.value = 1800; indFilt.Q.value = 1.2;
      const noise2 = ctx.createBufferSource(); noise2.buffer = buf; noise2.loop = true;
      noise2.connect(indFilt); indFilt.connect(indG); indG.connect(master);

      const whistle = ctx.createOscillator(); whistle.type = 'sine'; whistle.frequency.value = 3000;
      const whistleG = ctx.createGain(); whistleG.gain.value = 0;
      whistle.connect(whistleG); whistleG.connect(master);
      const bovFilt = ctx.createBiquadFilter(); bovFilt.type = 'bandpass'; bovFilt.frequency.value = 2600; bovFilt.Q.value = 0.8;
      const bovG = ctx.createGain(); bovG.gain.value = 0;
      const noise3 = ctx.createBufferSource(); noise3.buffer = buf; noise3.loop = true;
      noise3.connect(bovFilt); bovFilt.connect(bovG); bovG.connect(master);

      oscA.start(); oscB.start(); sub.start(); noise.start(); noise2.start(); noise3.start(); pulseLfo.start();
      audioRef.current = { ctx, oscA, oscB, oscG, sub, subG, master, filter, body, bodyG, ng, pulseLfo, lopeLfo, lopeDepth, indG, whistle, whistleG, bovG };
      return audioRef.current;
    } catch { return null; }
  };

  // The live panel's sound button. The audio context has to be resumed from the same
  // user gesture that switches sound on — browsers will not start one otherwise — so
  // this cannot live in the screen: `ensureAudio` and the context it builds are the
  // shell's.
  const toggleSound = () => {
    if (!soundOn) ensureAudio()?.ctx.resume();
    dispatch({ type: ACTIONS.SET_SESSION_FIELD, field: 'soundOn', value: !soundOn });
  };

  // Persistence goes through the storage adapter, which picks whichever backend is
  // available (artifact host, localStorage, or in-memory) so career stats survive a
  // refresh wherever the app is deployed.
  const persistCareer = (best, total, pulls) => saveCareer({ best, total, pulls });

  const doRun = () => {
    const a = ensureAudio();
    if (a && a.ctx.state === 'suspended') a.ctx.resume();
    // The reveal animation's own state: `running` gates the RUN button's label and the
    // partial chart, `revealCount` is how much of the sweep has been drawn so far.
    // Neither has an ordering hazard (unlike the banking tail below, which BANK_PULL
    // owns), so they stay plain field writes.
    dispatch({ type: ACTIONS.SET_SESSION_FIELD, field: 'running', value: true });
    dispatch({ type: ACTIONS.SET_SESSION_FIELD, field: 'revealCount', value: 0 });
    const r = simulateSweep({
      loadKpa, ve, veTruth, timing, afr, turboOn, boostCurve, octaneBonus, octaneLabel: OCTANE_OPTS[octaneIdx].label,
      fuel, injectorCc, ecuInjectorCc, injectorLabel: INJECTOR_OPTS[injIdx].label, mods, mafScalar, derived: engineDerived,
      turbine, compressor: COMPRESSOR_OPTS[compressorIdx],
    });
    const ts = computeTuningScore(r);
    const es = computeEngineerScore({
      engineConfig, turboOn, peakBoostPsi: turboOn ? Math.max(...boostCurve) : 0,
      turbine, compressor: COMPRESSOR_OPTS[compressorIdx],
      exhaustDiaError, dutyPreview, displacementL: engineDerived.displacementL, fuel, mods,
    });
    const pull = computePullScore({ peakHp: r.peakHp, peakTq: r.peakTq, tuningScore: ts.score, engineerScore: es.score });
    // Banking the pull — prevResult rotation, wear, scores, pull count — lands in the
    // store in one pass. `result` and `pullScore` are precomputed here because the
    // reducer has no access to the useMemo-derived hardware `computePullScore` needs.
    // The local `setPrevResult`/`setResult`/`setHealth` calls that used to sit above
    // this line, and the `setBestScore`/`setTotalScore`/`setPullCount` trio below it,
    // were all mirroring writes this one action already makes — including the
    // prevResult-before-result rotation whose ordering it exists to own.
    dispatch({ type: ACTIONS.BANK_PULL, result: r, pullScore: pull });
    // BANK_PULL writes bestScore/totalScore/pullCount itself, from the same three
    // expressions. They are still computed here because `persistCareer` needs the new
    // values NOW: reading them back off `session` would read this render's stale ones.
    const nextBest = Math.max(bestScore, pull);
    const nextTotal = totalScore + pull;
    const nextPulls = pullCount + 1;
    persistCareer(nextBest, nextTotal, nextPulls);
    const total = r.points.length;
    let i = 0;
    revealTimer.current = setInterval(() => {
      i += Math.ceil(total / 30);
      // `i` is the interval's own counter, not a read of `revealCount`, so there is no
      // stale-closure hazard in carrying the value on the action.
      dispatch({ type: ACTIONS.SET_SESSION_FIELD, field: 'revealCount', value: Math.min(i, total) });
      if (i >= total) { clearInterval(revealTimer.current); dispatch({ type: ACTIONS.SET_SESSION_FIELD, field: 'running', value: false }); }
    }, 55);
  };
  useEffect(() => () => { if (revealTimer.current) clearInterval(revealTimer.current); }, []);

  // Keep the live-engine config in a ref so the loop always uses current tuning
  // without needing to restart the interval every time a table changes.
  liveCfgRef.current = {
    ve, veTruth, timing, afr, derived: engineDerived, fuel, injectorCc, ecuInjectorCc, mods, mafScalar, mafErrorBase,
    turboOn, boostCurve, octaneBonus, turbine,
    compressor: COMPRESSOR_OPTS[compressorIdx], exhaustDiaError,
  };
  throttleRef.current = throttleInput;

  // The engine runs continuously in the background at 20 Hz, integrating real
  // crankshaft dynamics and running one ECU control pass per step.
  //
  // The step itself happens in the REDUCER, not here. This interval is installed once
  // and never re-created, so its callback closes over the `live` of the first render
  // forever — computing `liveStep(live, ...)` here and dispatching the result would
  // integrate from a permanently frozen engine-off state, and the readout would sit
  // dead or jitter between two adjacent steps. That reads as a physics bug, not a
  // state bug. The old `setLive((prev) => ...)` functional form has no action
  // equivalent (actions must not carry functions), so LIVE_STEP carries only the two
  // things the reducer cannot see — the driver input and the current tune — and
  // resolves `prev` against the store. Both come from REFS, which are current at every
  // tick, so nothing stale reaches the engine.
  useEffect(() => {
    liveTimer.current = setInterval(() => {
      dispatch({
        type: ACTIONS.LIVE_STEP,
        dt: 0.05,
        input: { throttle: throttleRef.current, load: 0 },
        cfg: liveCfgRef.current,
      });
    }, 50);
    return () => clearInterval(liveTimer.current);
    // Stable for the life of the store, so the interval is still installed exactly once
    // — re-creating it would restart the engine's 20 Hz clock on every render.
  }, [dispatch]);

  // The throttle pad's three pointer handlers. `throttleRef` is what the 20 Hz loop
  // actually reads (the interval is installed once and never sees a re-render), so the
  // dispatch and the ref write are one operation and belong together in the shell that
  // owns the ref.
  const setThrottleInput = (value) => {
    dispatch({ type: ACTIONS.SET_SESSION_FIELD, field: 'throttleInput', value });
    throttleRef.current = value;
  };

  // ---- Engine audio -------------------------------------------------------
  // Synthesised from the firing frequency: a 4-stroke fires cyl/2 times per
  // crank revolution, so pitch tracks RPM and cylinder count exactly. A lowpass
  // that opens with throttle gives the "load" character — closed throttle is
  // muffled, wide open is bright and raspy.
  const startEngine = () => {
    const a = ensureAudio();
    if (a && a.ctx.state === 'suspended') a.ctx.resume();
    dispatch({ type: ACTIONS.LIVE_PATCH, patch: { cranking: true } });
  };
  const stopEngine = () => {
    setThrottleInput(0);
    dispatch({ type: ACTIONS.LIVE_PATCH, patch: { running: false, cranking: false } });
  };

  // Safety net: if a pointerup/cancel is missed (scroll, app switch, lost focus)
  // the throttle must still close, or the engine would hang at redline.
  useEffect(() => {
    const release = () => { dispatch({ type: ACTIONS.SET_SESSION_FIELD, field: 'throttleInput', value: 0 }); throttleRef.current = 0; };
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    window.addEventListener('blur', release);
    document.addEventListener('visibilitychange', release);
    return () => {
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', release);
      window.removeEventListener('blur', release);
      document.removeEventListener('visibilitychange', release);
    };
    // `dispatch` is stable for the life of the store (useReducer guarantees it), so
    // this effect still installs its listeners exactly once — the dependency is here
    // to satisfy exhaustive-deps honestly rather than to make the effect re-run.
  }, [dispatch]);

  // Career stats persist across sessions so the high score is worth chasing.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const c = await loadCareer();
      if (cancelled) return;
      dispatch({ type: ACTIONS.SET_SESSION_FIELD, field: 'bestScore', value: c.best });
      dispatch({ type: ACTIONS.SET_SESSION_FIELD, field: 'totalScore', value: c.total });
      dispatch({ type: ACTIONS.SET_SESSION_FIELD, field: 'pullCount', value: c.pulls });
    })();
    return () => { cancelled = true; };
    // Stable for the life of the store, so this still loads career stats exactly once.
  }, [dispatch]);

  const chartData = useMemo(() => {
    if (!result) return [];
    return result.points.slice(0, running ? revealCount : result.points.length).map((p, i) => ({
      rpm: p.rpm, hp: p.hp, torque: p.torque, afr: p.afr, afrCommanded: p.afrCommanded,
      timing: p.timing, commandedTiming: p.commandedTiming, duty: p.duty, trimPct: p.trimPct,
      prevHp: prevResult?.points?.[i]?.hp, prevTorque: prevResult?.points?.[i]?.torque,
    }));
  }, [result, prevResult, running, revealCount]);

  // HISTOGRAM — the core real-world tuning workflow. A pull's lambda error is
  // binned onto the same RPM x MAP grid as the VE table, so the correction can be
  // applied cell-for-cell. This is what HP Tuners' scanner histogram does.
  const buildHistogram = () => {
    if (!result) return;
    const cells = LOAD.map(() => RPM.map(() => ({ sum: 0, n: 0 })));
    result.points.forEach((p) => {
      let ri = 0, best = Infinity;
      LOAD.forEach((m, i) => { const d = Math.abs(m - p.map); if (d < best) { best = d; ri = i; } });
      let ci = 0, bc = Infinity;
      RPM.forEach((r, i) => { const d = Math.abs(r - p.rpm); if (d < bc) { bc = d; ci = i; } });
      // Airflow error % = how far the ACTUAL mixture sat from what was commanded.
      //
      // Sign convention, because getting it backwards makes the tool teach the exact
      // wrong reflex: the ECU fuels from the VE table, so
      //     actualAfr / commandedAfr  =  trueVE / tableVE
      // A positive number therefore means the engine ran LEANER than commanded, which
      // means it swallowed MORE air than the table claimed, which means the table is
      // reading low and must come UP by that percentage. Multiplying the cell by
      // (1 + err/100) drives the table onto the truth in one pass.
      const err = ((p.afr / p.afrCommanded) - 1) * 100;
      cells[ri][ci].sum += err; cells[ri][ci].n += 1;
    });
    dispatch({ type: ACTIONS.SET_SESSION_FIELD, field: 'histogram', value: cells.map((row) => row.map((c) => (c.n ? c.sum / c.n : null))) });
  };
  const applyHistogram = () => {
    if (!histogram) return;
    // SET_TABLE carries a value, not a function, so the old functional update
    // (`setVeEdited((prev) => ...)`) is resolved here against the CURRENT `ve` — the
    // one already in scope from the store — before dispatching.
    const nextVe = ve.map((row, ri) => row.map((v, ci) => {
      const e = histogram[ri][ci];
      return e == null ? v : Number(clamp(v * (1 + e / 100), 10, 130).toFixed(1));
    }));
    dispatch({ type: ACTIONS.SET_TABLE, table: 've', value: nextVe });
    dispatch({ type: ACTIONS.SET_SESSION_FIELD, field: 'histogram', value: null });
  };

  const currentRpm = result ? (result.points[Math.min(revealCount, result.points.length - 1)]?.rpm ?? 1500) : 1500;
  const scores = useMemo(() => {
    if (!result || running) return null;
    const tuning = computeTuningScore(result);
    const engineer = computeEngineerScore({
      engineConfig, turboOn, peakBoostPsi: turboOn ? Math.max(...boostCurve) : 0,
      turbine, compressor: COMPRESSOR_OPTS[compressorIdx],
      exhaustDiaError, dutyPreview, displacementL: engineDerived.displacementL, fuel, mods,
    });
    const pull = computePullScore({ peakHp: result.peakHp, peakTq: result.peakTq, tuningScore: tuning.score, engineerScore: engineer.score });
    return { tuning, engineer, pull };
  }, [result, running, engineConfig, turboOn, turbine, compressorIdx, exhaustDiaError, dutyPreview, engineDerived, fuel, mods, boostCurve]);

  // Drive the audio from whichever engine is actually turning — and only while the
  // relevant page is open, so sound stops the moment you navigate away.
  const prevBoostRef = useRef(0);
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const t = a.ctx.currentTime;

    const onDyno = tab === 'dyno' && running && result;
    const onLive = tab === 'dash' && (live.running || live.cranking);
    const audible = onDyno || onLive;

    const rpm = onDyno ? currentRpm : live.rpm;
    const dynoPt = onDyno ? result.points[Math.min(revealCount, result.points.length - 1)] : null;
    const load = onDyno ? 1 : clamp((live.effThrottle ?? 0) / 100, 0, 1);
    const boostNow = onDyno ? (dynoPt?.boostPsi ?? 0) : (live.live?.boostPsi ?? 0);
    const cut = onLive ? live.fuelCut : false;

    const cyl = engineDerived.cyl;
    const fire = Math.max(6, (rpm / 60) * (cyl / 2));
    a.oscA.frequency.setTargetAtTime(fire, t, 0.02);
    a.oscB.frequency.setTargetAtTime(fire, t, 0.02);
    a.sub.frequency.setTargetAtTime(fire / 2, t, 0.02);
    a.pulseLfo.frequency.setTargetAtTime(fire, t, 0.02);

    // Layout character. A four is rough and buzzy (wider detune, more upper content);
    // a V8 leans on its low-order rumble; a six sits between.
    const isFour = cyl === 4, isEight = cyl === 8;
    a.oscB.detune.setTargetAtTime(isFour ? 16 : isEight ? 6 : 9, t, 0.2);
    a.oscG.gain.setTargetAtTime(isFour ? 0.55 : isEight ? 0.42 : 0.50, t, 0.1);
    a.subG.gain.setTargetAtTime(isFour ? 0.20 : isEight ? 0.58 : 0.35, t, 0.1);
    a.body.frequency.setTargetAtTime(isEight ? 240 : isFour ? 420 : 320, t, 0.15);

    // Exhaust diameter: a bigger pipe is louder, deeper and less restricted.
    const dia = EXHAUST_DIA_OPTS[exhaustDiaIdx].dia;
    const diaOpen = 0.72 + (dia - 2.5) * 0.20;
    const catBack = mods.exhaust || mods.headers;
    a.filter.frequency.setTargetAtTime((300 + fire * 7 + load * 2400) * diaOpen, t, 0.05);
    a.filter.Q.setTargetAtTime(isFour ? 3.2 : isEight ? 1.8 : 2.4, t, 0.1);
    a.bodyG.gain.setTargetAtTime(0.5 + (dia - 2.5) * 0.22, t, 0.15);

    a.indG.gain.setTargetAtTime(mods.intake && audible ? load * 0.055 * (rpm / 7500 + 0.3) : 0, t, 0.06);

    if (turboOn) {
      a.whistle.frequency.setTargetAtTime(1400 + (rpm / 7500) * 5200, t, 0.08);
      a.whistleG.gain.setTargetAtTime(audible ? Math.min(0.05, boostNow * 0.006) * load : 0, t, 0.08);
      if (prevBoostRef.current > 3 && load < 0.15 && audible) {
        a.bovG.gain.cancelScheduledValues(t);
        a.bovG.gain.setValueAtTime(0.09, t);
        a.bovG.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
      }
      prevBoostRef.current = boostNow;
    } else {
      a.whistleG.gain.setTargetAtTime(0, t, 0.1);
      prevBoostRef.current = 0;
    }

    // Lope is loudest at idle and washes out as revs rise and combustion evens up.
    const overlap = engineDerived.overlapDeg || 0;
    const lopeRate = clamp(fire / 6, 2.5, 14);
    a.lopeLfo.frequency.setTargetAtTime(lopeRate, t, 0.15);
    const lopeStrength = audible && overlap > 2 && rpm < 2200
      ? Math.min(0.085, overlap * 0.0022) * clamp(1 - (rpm - 800) / 1600, 0.15, 1)
      : 0;
    a.lopeDepth.gain.setTargetAtTime(lopeStrength, t, 0.12);

    a.ng.gain.setTargetAtTime(live.cranking && onLive ? 0.12 : 0.03 + load * 0.045, t, 0.05);
    const vol = cut ? 0.012 : 0.05 + load * 0.11;
    a.master.gain.setTargetAtTime(audible && soundOn ? vol * (catBack ? 1.18 : 1) : 0, t, cut ? 0.015 : 0.06);
  }, [live.rpm, live.running, live.cranking, live.effThrottle, live.fuelCut, live.live, soundOn,
      engineDerived.cyl, exhaustDiaIdx, mods.intake, mods.exhaust, mods.headers, turboOn,
      running, currentRpm, revealCount, result, tab, engineDerived.overlapDeg]);

  // Hard-stop audio on unmount or when the tab changes away from a sounding page.
  useEffect(() => {
    return () => {
      const a = audioRef.current;
      if (a) { try { a.master.gain.setTargetAtTime(0, a.ctx.currentTime, 0.02); } catch { /* noop */ } }
    };
  }, [tab]);

  const overallHealth = Math.min(health.piston, health.bearing, health.valve);
  const overallColor = statusColor(overallHealth);
  const activePreset = presetId ? presetById(presetId) : null;
  const engineName = activePreset
    ? activePreset.name
    : `${engineDerived.displacementL.toFixed(1)}L ${engineConfig.configuration}`;

  // Four top-level destinations instead of seven. The three tuning tables and the
  // fuel/ECU controls now live under TUNE as sub-views — same depth, far less to
  // scan, and much bigger touch targets.
  const TABS = [
    { id: 'dash', label: 'HOME', icon: Gauge },
    { id: 'build', label: 'BUILD', icon: Settings },
    { id: 'tune', label: 'TUNE', icon: Grid3x3 },
    { id: 'dyno', label: 'DYNO', icon: Activity },
  ];
  const TUNE_VIEWS = [
    { id: 've', label: 'AIR', icon: Grid3x3 },
    { id: 'timing', label: 'SPARK', icon: Zap },
    { id: 'afr', label: 'FUEL', icon: Droplets },
    { id: 'ecu', label: 'ECU', icon: Fuel },
  ];
  const gridProps = { selection, setSelection };

  if (appView === 'start') {
    return (
      <StartScreen
        onStart={() => goTab('build')}
        onTutorial={goTutorial}
        version={BUILD_VERSION}
        dial={<DialMark size={92} pct={0.62} />}
      />
    );
  }
  if (appView === 'tutorial') {
    return (
      <TutorialScreen
        steps={TUTORIAL_STEPS}
        onDone={() => { goTab('build'); dispatch({ type: ACTIONS.SET_SESSION_FIELD, field: 'journeyStep', value: 0 }); }}
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', maxHeight: '100dvh', background: T.bg, color: T.ink, fontFamily: T.sans, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '13px 16px 12px', borderBottom: `1px solid ${T.line}`, background: T.panel }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 10, letterSpacing: 2, color: T.accInk, fontWeight: 800 }}>CARIBOU TUNING</div>
            <div style={{ fontSize: 16.5, fontWeight: 800, letterSpacing: 0.2 }}>ECU Lab</div>
            <div style={{ fontSize: 11, color: T.ink2, marginTop: 3, fontFamily: T.mono }}>
              {engineName} · {turboOn ? 'Turbo' : 'N/A'} · {OCTANE_OPTS[octaneIdx].label} oct · {INJECTOR_OPTS[injIdx].label} · {BUILD_VERSION}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            {/* Icon-only, so the label has to be spelled out: `title` alone leaves a
                button whose accessible name depends on the tooltip surviving. Note
                the lower-case names — the start screen's TUTORIAL button is queried
                by exact name and must stay the only match. */}
            <Button variant="ghost" size="sm" title="Tutorial" aria-label="Tutorial" onClick={goTutorial}>
              <Info size={16} aria-hidden="true" />
            </Button>
            <Button variant="ghost" size="sm" title="Repair engine" aria-label="Repair engine" onClick={repairEngine}>
              <Wrench size={16} aria-hidden="true" />
            </Button>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 9 }}>
          <div style={{ flex: 1, height: 4, background: T.panel2, borderRadius: 2, overflow: 'hidden', border: `1px solid ${T.line}` }}>
            <div style={{ width: `${overallHealth}%`, height: '100%', background: overallColor, transition: 'width .4s' }} />
          </div>
          <span style={{ fontSize: 10, color: overallColor, fontWeight: 800, fontFamily: T.mono }}>{Math.round(overallHealth)}%</span>
          {live.running && <span style={{ fontSize: 9.5, color: T.ok, fontWeight: 800, letterSpacing: 0.5 }}>● RUNNING</span>}
        </div>
      </div>

      {/* Content */}
      {/* Capped so a wide display doesn't stretch every button and paragraph to the
          screen edge (see tokens.js's contentMax comment for the 1100px reasoning).
          Capped here, not on the root at the top of this render, so the header above
          and the bottom nav below stay full-width chrome rather than letterboxing. */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', width: '100%', maxWidth: 'var(--content-max)', margin: '0 auto' }}>
        {/* ---------- HOME: live engine, career stats, health, learning ---------- */}
        {/* One component per section, each reading the store for itself. `live` is read
            ONLY inside LiveScreen: the 20 Hz LIVE_STEP re-render stops there rather than
            passing through a HOME-level parent that would drag the other three with it. */}
        {tab === 'dash' && (
          <div style={{ padding: 16 }}>
            {journeyStep === 2 && <JourneyBanner step={2} onAdvance={() => { dispatch({ type: ACTIONS.SET_SESSION_FIELD, field: 'journeyStep', value: 3 }); changeTab('dyno'); }} onDismiss={() => dispatch({ type: ACTIONS.SET_SESSION_FIELD, field: 'journeyStep', value: 99 })} />}
            <LiveScreen
              active={dashSection === 'live'} onToggle={toggleDashSection}
              tachFullScaleRpm={tachFullScaleRpm}
              onStart={startEngine} onStop={stopEngine}
              onToggleSound={toggleSound} onThrottle={setThrottleInput}
            />
            <StatsScreen
              active={dashSection === 'stats'} onToggle={toggleDashSection}
              scores={scores}
            />
            <HealthScreen
              active={dashSection === 'health'} onToggle={toggleDashSection}
              overallHealth={overallHealth} needsMafRecal={needsMafRecal}
            />
            <LearnScreen active={dashSection === 'learn'} onToggle={toggleDashSection} />
          </div>
        )}

        {/* ---------- BUILD: engine architecture, parts, forced induction ---------- */}
        {tab === 'build' && (
          <div style={{ padding: 16 }}>
            {journeyStep === 0 && <JourneyBanner step={0} onAdvance={() => { dispatch({ type: ACTIONS.SET_SESSION_FIELD, field: 'journeyStep', value: 1 }); changeTab('tune'); }} onDismiss={() => dispatch({ type: ACTIONS.SET_SESSION_FIELD, field: 'journeyStep', value: 99 })} />}
            <Eyebrow icon={Settings}>Garage</Eyebrow>
            <p style={{ fontSize: 12.5, color: T.ink2, lineHeight: 1.6, marginTop: 0, marginBottom: 14 }}>
              Design the car before you tune it. Tap a section to open it — every choice inside changes real physics elsewhere in the sandbox.
            </p>

            <BuildSection
              active={buildSection === 'engine'} onClick={() => toggleSection('build', 'engine')}
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

            <BuildSection
              active={buildSection === 'boltons'} onClick={() => toggleSection('build', 'boltons')}
              icon={Package} label="Bolt-On Parts"
              sub={`${Object.values(mods).filter((v) => v).length}/4 installed`}
            >
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 9 }}>
                <Button variant="quiet" size="sm" onClick={resetToStock}>
                  <RotateCcw size={12} aria-hidden="true" /> RESET ALL TO STOCK
                </Button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {Object.keys(MOD_INFO).map((key) => (
                  <button key={key} onClick={() => installMod(key)} disabled={mods[key]} style={{
                    textAlign: 'left', padding: '11px 13px', borderRadius: 10,
                    border: `1px solid ${mods[key] ? T.okLine : T.line}`,
                    background: mods[key] ? T.okBg : T.panel2,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 700, fontSize: 13, color: mods[key] ? T.ok : T.ink }}>{MOD_INFO[key].label}</span>
                      <span style={{ fontSize: 10.5, fontWeight: 800, color: mods[key] ? T.ok : T.accInk }}>{mods[key] ? 'INSTALLED' : 'INSTALL'}</span>
                    </div>
                    <div style={{ fontSize: 11.5, color: T.ink2, marginTop: 3 }}>{MOD_INFO[key].blurb}</div>
                  </button>
                ))}
              </div>

            </BuildSection>

            <BuildSection
              active={buildSection === 'turbo'} onClick={() => toggleSection('build', 'turbo')}
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

            <BuildSection
              active={buildSection === 'exhaust'} onClick={() => toggleSection('build', 'exhaust')}
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
          </div>
        )}

        {/* ---------- TUNE: sub-view switcher for the calibration tables ---------- */}
        {tab === 'tune' && (
          <div style={{ display: 'flex', gap: 6, padding: '14px 16px 0' }}>
            {TUNE_VIEWS.map((v) => {
              const on = tuneView === v.id;
              const Icon = v.icon;
              return (
                <button key={v.id} onClick={() => { goSection('tune', v.id); setSelection(null); }} style={{
                  flex: 1, padding: '10px 0 9px', borderRadius: 10, display: 'flex', flexDirection: 'column',
                  alignItems: 'center', gap: 4, fontWeight: 800, fontSize: 10, letterSpacing: 0.4,
                  border: `1px solid ${on ? T.acc : T.line}`, background: on ? T.accBg : T.panel2,
                  color: on ? T.accInk : T.ink2,
                }}>
                  <Icon size={15} />{v.label}
                </button>
              );
            })}
          </div>
        )}

        {tab === 'tune' && journeyStep === 1 && (
          <div style={{ padding: '14px 16px 0' }}>
            <JourneyBanner step={1} onAdvance={() => { dispatch({ type: ACTIONS.SET_SESSION_FIELD, field: 'journeyStep', value: 2 }); changeTab('dash'); }} onDismiss={() => dispatch({ type: ACTIONS.SET_SESSION_FIELD, field: 'journeyStep', value: 99 })} />
          </div>
        )}

        {tab === 'tune' && tuneView === 've' && (
          <>
            <div style={{ padding: '16px 16px 0' }}>
              <Eyebrow icon={Grid3x3}>Volumetric Efficiency</Eyebrow>
              <div style={{ fontSize: 12.5, color: T.ink2, marginBottom: 12, lineHeight: 1.5 }}>How completely the cylinder fills at each engine speed and load. Rows are manifold pressure (MAP kPa &mdash; about 100 is wide open, higher is boost); columns are RPM. Tap any cell for reference data.</div>
              <TuningGrid data={ve} min={10} max={130} decimals={0} {...gridProps} />

              {veAdvice && (
                veAdvice.inSync ? (
                  <div style={{ display: 'flex', gap: 8, background: T.okBg, border: `1px solid ${T.okLine}`, borderRadius: 10, padding: '11px 13px', margin: '10px 0', fontSize: 12.5, color: T.ok, lineHeight: 1.5 }}>
                    <Info size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                    <div>VE table matches your current hardware. Nothing to correct.</div>
                  </div>
                ) : (
                  <div style={{ background: T.panel2, border: `1px solid ${T.acc}`, borderRadius: 10, padding: '12px 13px', margin: '10px 0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <div style={{ fontSize: 10, letterSpacing: 1, color: T.accInk, fontWeight: 800 }}>VE OUT OF SYNC WITH HARDWARE</div>
                      <div style={{ fontSize: 11, fontFamily: T.mono, color: T.accInk, fontWeight: 700 }}>{veAdvice.maxAbs.toFixed(0)}% max gap</div>
                    </div>
                    <div style={{ fontSize: 12, color: T.ink2, lineHeight: 1.55, marginBottom: 9 }}>
                      Your hardware changed but this table is still the old log. Here is what re-logging airflow on the dyno would actually show:
                    </div>
                    {veAdvice.recs.map((r, i) => (
                      <div key={i} style={{ marginBottom: 9 }}>
                        <div style={{ fontSize: 12, color: T.ink, fontWeight: 700 }}>{r.rpmText}</div>
                        <div style={{ fontSize: 11.5, color: T.ink2, lineHeight: 1.5, marginTop: 2 }}>{r.text}</div>
                        <div style={{ fontSize: 10.5, color: T.cyan, fontFamily: T.mono, marginTop: 3 }}>{r.cells.join('   ')}</div>
                      </div>
                    ))}
                    {/* Was width:100%. It is the only action in this advisory box and
                        reads as one at its own width; the box is already the full
                        content column, so stretching it only made it wider. */}
                    <Button onClick={recalcVE} style={{ marginTop: 4 }}>
                      ACCEPT RE-LOGGED VALUES
                    </Button>
                    <div style={{ fontSize: 10.5, color: T.ink3, textAlign: 'center', marginTop: 6 }}>Or type them in yourself — these are the measured targets, not a suggestion.</div>
                  </div>
                )
              )}

              <ExpandableInfo title="What VE actually means">
                VE compares the air trapped in the cylinder to the theoretical maximum the swept volume could hold. It rises with RPM as intake tuning matches resonance, then falls as the valves cannot flow fast enough — that fall is why every N/A engine has a torque peak. More air here means more fuel needed to hit a given AFR and more potential torque; VE is really the master variable, and timing/AFR are how you extract power from whatever air is already there.
                <br /><br /><b style={{ color: T.ink }}>As a beginner:</b> leave VE alone at first. It is set by real hardware (intake, heads, cams) — the Bolt-Ons on BUILD already move it for you when you install parts. Spend your early pulls learning TIMING and AFR before you start hand-editing VE.
              </ExpandableInfo>
            </div>
            <div style={{ flex: 1 }} />
            <SelectionDock data={ve} setData={(value) => dispatch({ type: ACTIONS.SET_TABLE, table: 've', value })} selection={selection} min={10} max={130} decimals={0} unit="%" onClose={() => setSelection(null)} kind="ve" />
          </>
        )}

        {tab === 'tune' && tuneView === 'timing' && (
          <>
            <div style={{ padding: '16px 16px 0' }}>
              <Eyebrow icon={Zap}>Ignition Timing</Eyebrow>
              <div style={{ fontSize: 12.5, color: T.ink2, marginBottom: 12 }}>Degrees of spark advance before top dead center (° BTDC).</div>
              <TuningGrid data={timing} min={SPARK_MIN_DEG} max={SPARK_MAX_DEG} decimals={0} {...gridProps} />
              {calAdvice.overAdvanced.length > 0 ? (
                <div style={{ background: T.dangerBg, border: `1px solid ${T.dangerLine}`, borderRadius: 10, padding: '12px 13px', margin: '10px 0' }}>
                  <div style={{ fontSize: 10, letterSpacing: 1, color: T.dangerInk, fontWeight: 800, marginBottom: 7 }}>
                    {calAdvice.overAdvanced.length} CELLS BEYOND THE KNOCK LIMIT
                  </div>
                  <div style={{ fontSize: 12, color: T.ink2, lineHeight: 1.55, marginBottom: 8 }}>
                    Your current hardware will not tolerate this much advance here. These cells are asking for more timing than the charge, octane and compression allow:
                  </div>
                  {calAdvice.overAdvanced.slice(0, 5).map((c, i) => (
                    <div key={i} style={{ fontSize: 11, fontFamily: T.mono, color: T.cyan, marginBottom: 2 }}>
                      {c.map} kPa / {c.rpm} RPM: {c.current}° → {c.suggested}°
                    </div>
                  ))}
                  {calAdvice.overAdvanced.length > 5 && <div style={{ fontSize: 10.5, color: T.ink3, marginTop: 3 }}>…and {calAdvice.overAdvanced.length - 5} more</div>}
                  <div style={{ fontSize: 11, color: T.ink3, marginTop: 8 }}>Edit them yourself — a calibration is yours to make, not something the app should silently rewrite.</div>
                </div>
              ) : calAdvice.underAdvanced.length > 4 ? (
                <Panel tight style={{ margin: '10px 0', fontSize: 12, color: T.ink2, lineHeight: 1.5 }}>
                  <b style={{ color: T.accInk }}>Timing left on the table.</b> {calAdvice.underAdvanced.length} cells are more than 3° below what this build would tolerate. Safe, but you are giving away torque — advance them a little at a time and pull between each change.
                </Panel>
              ) : calAdvice.pastMbt.length > 0 ? (
                <Panel tight style={{ margin: '10px 0', fontSize: 12, color: T.ink2, lineHeight: 1.5 }}>
                  <b style={{ color: T.accInk }}>Past peak torque.</b> {calAdvice.pastMbt.length} cells command more advance than the burn can use — the charge is already finishing where it should, so the extra degrees are working against the piston on its way up rather than adding torque. Not dangerous here — these cells are inside the knock limit — but pulling them back gains a little power and buys margin.
                </Panel>
              ) : (
                <div style={{ background: T.okBg, border: `1px solid ${T.okLine}`, borderRadius: 10, padding: '11px 13px', margin: '10px 0', fontSize: 12.5, color: T.ok }}>
                  Spark table sits within the knock limit for this hardware.
                </div>
              )}

              <ExpandableInfo title="Why the app never rewrites your spark or fuel tables">
                The VE table auto-syncs because volumetric efficiency is a <b style={{ color: T.ink }}>measurement of the hardware</b> — swap a cam and a tuner simply re-logs airflow, and the numbers are what they are.
                <br /><br />Spark and fuel are different: they are <b style={{ color: T.ink }}>your calibration</b>, a set of judgement calls about how much risk to take for how much power. A real ECU does not retune itself when you bolt on a turbo — it keeps running the old numbers into the new hardware, which is exactly how engines get hurt.
                <br /><br />So the app tells you what the hardware will now tolerate, and leaves the editing to you. That gap between "what the engine can take" and "what your table asks for" is the entire job.
              </ExpandableInfo>

              <ExpandableInfo title="Why timing has a sweet spot (MBT)">
                Combustion is not instant — the flame front takes time to burn through the mixture. Timing decides when the burn starts so peak cylinder pressure lands just after top dead center, where it does useful work. Advance too far and pressure peaks before the piston is ready, fighting the crank and risking knock; retard too far and you are burning fuel after the piston has already started down, wasting it as heat. MBT is the earliest timing that still lands the burn right — past it, more advance buys almost nothing, only risk.
                <br /><br /><b style={{ color: T.ink }}>As a beginner:</b> nudge one cell 1-2° at a time, run a pull, and read the log. If it comes back clean with no knock event, you probably still have room. If you see a knock warning, that cell is your new ceiling — back off to what the log suggests and move on.
              </ExpandableInfo>
            </div>
            <div style={{ flex: 1 }} />
            <SelectionDock data={timing} setData={(value) => dispatch({ type: ACTIONS.SET_TABLE, table: 'timing', value })} selection={selection} min={SPARK_MIN_DEG} max={SPARK_MAX_DEG} decimals={0} unit="°" onClose={() => setSelection(null)} kind="timing" />
          </>
        )}

        {tab === 'tune' && tuneView === 'afr' && (
          <>
            <div style={{ padding: '16px 16px 0' }}>
              <Eyebrow icon={Droplets}>Air-Fuel Ratio Target</Eyebrow>
              <div style={{ fontSize: 12.5, color: T.ink2, marginBottom: 12, lineHeight: 1.5 }}>Target air:fuel ratio the ECU aims for. Divide by 14.7 to read it as lambda.</div>
              <TuningGrid data={afr} min={10} max={18} decimals={1} {...gridProps} />
              {calAdvice.wrongMix.length > 0 && (
                <div style={{ background: T.panel2, border: `1px solid ${T.acc}`, borderRadius: 10, padding: '12px 13px', margin: '10px 0' }}>
                  <div style={{ fontSize: 10, letterSpacing: 1, color: T.accInk, fontWeight: 800, marginBottom: 7 }}>
                    {calAdvice.wrongMix.length} HIGH-LOAD CELLS OFF BEST POWER
                  </div>
                  <div style={{ fontSize: 12, color: T.ink2, lineHeight: 1.55, marginBottom: 8 }}>
                    Best-power mixture shifts with boost — richer as cylinder pressure rises. These cells are judged on what the engine actually <b style={{ color: T.ink }}>delivered</b>, not on what the table commanded: if your MAF or injector scaling is off, the two are not the same number, and the delivered one is the one the pistons feel. The suggestion is the value to type into the cell to land on target.
                  </div>
                  {calAdvice.wrongMix.slice(0, 5).map((c, i) => (
                    <div key={i} style={{ fontSize: 11, fontFamily: T.mono, color: c.delta < 0 ? T.dangerInk : T.cyan, marginBottom: 2 }}>
                      {c.map} kPa / {c.rpm} RPM: {c.current}:1 → {c.suggested}:1 {c.delta < 0 ? '(richen)' : '(lean out)'} · delivered {c.delivered}, wants {c.target}
                    </div>
                  ))}
                  {calAdvice.wrongMix.length > 5 && <div style={{ fontSize: 10.5, color: T.ink3, marginTop: 3 }}>…and {calAdvice.wrongMix.length - 5} more</div>}
                </div>
              )}

              <ExpandableInfo title="Why AFR trades power for safety">
                14.7:1 is stoichiometric — burns all the fuel and oxygen with nothing left over, great for emissions and cruise. Peak power sits richer, because the extra fuel absorbs heat as it vaporizes, cooling combustion enough to make more power before knock becomes the limit. Go leaner than that under load and you lose power and raise both knock risk and exhaust gas temperature at once — which is why lean-under-boost is especially dangerous to valves and pistons.
                <br /><br /><b style={{ color: T.ink }}>Best power is not one number.</b> Naturally aspirated engines make best torque near lambda 0.85-0.92 (about 12.5-13.5:1 on gasoline). Under boost, best power moves richer — near lambda 0.82-0.85 (about 12.0-12.5:1) — because you are deliberately buying charge cooling to hold off knock. This sandbox moves its best-power target with your boost level, so the same AFR table that was ideal naturally aspirated reads genuinely lean once you are on 8 psi.
                <br /><br /><b style={{ color: T.ink }}>Reading it in lambda:</b> lambda is AFR divided by the fuel's stoichiometric point, so lambda 0.85 means the same relative richness on any fuel. That is why tuners talk in lambda once E85 enters the picture — 12.5:1 means something completely different on E85 than on pump gas.
                <br /><br /><b style={{ color: T.ink }}>As a beginner:</b> when in doubt, go richer (a lower number), not leaner. A rich cell costs a little power; a lean cell under load is how you actually damage something.
              </ExpandableInfo>
            </div>
            <div style={{ flex: 1 }} />
            <SelectionDock data={afr} setData={(value) => dispatch({ type: ACTIONS.SET_TABLE, table: 'afr', value })} selection={selection} min={10} max={18} decimals={1} unit=":1" onClose={() => setSelection(null)} kind="afr" />
          </>
        )}

        {tab === 'tune' && tuneView === 'ecu' && (
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
        )}

        {/* ---------- DYNO: run a pull, then curves / log / datalog / score ---------- */}
        {tab === 'dyno' && (
          <div style={{ padding: 16 }}>
            {journeyStep === 3 && <JourneyBanner step={3} onAdvance={() => dispatch({ type: ACTIONS.SET_SESSION_FIELD, field: 'journeyStep', value: 99 })} onDismiss={() => dispatch({ type: ACTIONS.SET_SESSION_FIELD, field: 'journeyStep', value: 99 })} />}
            <Eyebrow icon={Activity}>Dyno Cell</Eyebrow>
            <div style={{ fontSize: 12, color: T.ink2, marginBottom: 8, fontWeight: 600 }}>Manifold pressure for the pull (load)</div>
            <Seg label="Manifold pressure for the pull (load)" options={[100, 70, 40].map((l) => ({ label: `${l} kPa`, id: l }))} value={loadKpa} onChange={(v) => dispatch({ type: ACTIONS.SET_SESSION_FIELD, field: 'loadKpa', value: v })} />
            <div style={{ fontSize: 10.5, color: T.ink3, marginTop: 4, marginBottom: 4 }}>
              ~100 kPa is wide-open throttle naturally aspirated. Boost adds on top and walks the tables into the higher-MAP rows automatically.
            </div>

            <div style={{ margin: '14px 0' }}><Tach rpm={running || result ? currentRpm : 1500} cylinders={engineDerived.cyl} running={running} fullScaleRpm={tachFullScaleRpm} /></div>

            {/* The app's most important control, and the one PR 1's review caught
                rendering its label at 1.14:1 while running — panel3 fill under ink2
                text. `disabled` now dims the whole button instead of recolouring the
                label, so the contrast between fill and label never changes.

                Deliberately NOT `block`. This sits in the main content column, which
                on a desktop window is the window; the hand-rolled width:100% here is
                the literal button that spanned the screen. `lg` gives it its weight
                instead. */}
            <div style={{ marginBottom: 16 }}>
              <Button size="lg" onClick={doRun} disabled={running}>
                <Play size={16} aria-hidden="true" />
                {running ? 'SWEEPING…' : 'RUN DYNO PULL'}
              </Button>
            </div>

            {result && (
              <>
                <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
                  <StatTile label="PEAK WHP" value={result.peakHp} tone="acc" />
                  <StatTile label="PEAK TQ" value={result.peakTq} unit="lb-ft" tone="alt" />
                </div>

                {prevResult && !running && (() => {
                  const dHp = result.peakHp - prevResult.peakHp;
                  const dTq = result.peakTq - prevResult.peakTq;
                  const knockNow = result.events.filter((e) => e.type === 'knock').length;
                  const knockPrev = prevResult.events.filter((e) => e.type === 'knock').length;
                  const dKnock = knockNow - knockPrev;
                  const fmtDelta = (v, unit) => `${v > 0 ? '+' : ''}${v}${unit}`;
                  return (
                    <Panel tight style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <TrendingUp size={15} color={T.ink2} style={{ flexShrink: 0 }} />
                      <div style={{ display: 'flex', gap: 14, fontSize: 12.5, flexWrap: 'wrap' }}>
                        <span style={{ color: dHp === 0 ? T.ink2 : dHp > 0 ? T.ok : T.dangerInk, fontFamily: T.mono, fontWeight: 800 }}>{fmtDelta(dHp, ' whp')}</span>
                        <span style={{ color: dTq === 0 ? T.ink2 : dTq > 0 ? T.ok : T.dangerInk, fontFamily: T.mono, fontWeight: 800 }}>{fmtDelta(dTq, ' lb-ft')}</span>
                        <span style={{ color: dKnock === 0 ? T.ink2 : dKnock < 0 ? T.ok : T.dangerInk, fontFamily: T.mono, fontWeight: 800 }}>{knockNow} knock{knockNow === 1 ? '' : 's'} {dKnock !== 0 ? `(${fmtDelta(dKnock, '')})` : ''}</span>
                      </div>
                    </Panel>
                  );
                })()}

                {!running && (
                  <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
                    {[['result', 'CURVES'], ['log', 'PULL LOG'], ['data', 'DATALOG'], ['score', 'SCORE']].map(([id, label]) => {
                      const on = dynoView === id;
                      const flag = id === 'log' && result.events.length > 0;
                      return (
                        <button key={id} onClick={() => goSection('dyno', id)} style={{
                          flex: 1, padding: '9px 0', borderRadius: 9, fontWeight: 800, fontSize: 10, letterSpacing: 0.3,
                          border: `1px solid ${on ? T.acc : T.line}`, background: on ? T.accBg : T.panel2,
                          color: on ? T.accInk : T.ink2, position: 'relative',
                        }}>
                          {label}
                          {flag && <span style={{ position: 'absolute', top: 5, right: 7, width: 5, height: 5, borderRadius: 3, background: T.danger }} />}
                        </button>
                      );
                    })}
                  </div>
                )}

                {(running || dynoView === 'result') && (
                <>
                <Panel tight style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 10, color: T.ink2, letterSpacing: 1, fontWeight: 700, padding: '2px 0 8px' }}>POWER &amp; TORQUE</div>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={chartData} margin={{ top: 4, right: 12, left: -14, bottom: 0 }}>
                      <CartesianGrid stroke={T.line} />
                      <XAxis dataKey="rpm" stroke={T.ink3} fontSize={10} type="number" domain={[1500, dynoChartMaxRpm]} />
                      <YAxis stroke={T.ink3} fontSize={10} />
                      <Tooltip contentStyle={{ background: T.panel2, border: `1px solid ${T.line}`, fontSize: 11 }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      {prevResult && <Line dataKey="prevHp" name="Prev WHP" stroke={T.ink3} strokeDasharray="4 3" dot={false} isAnimationActive={false} />}
                      {prevResult && <Line dataKey="prevTorque" name="Prev TQ" stroke={T.ink3} strokeDasharray="4 3" dot={false} isAnimationActive={false} />}
                      <Line dataKey="hp" name="WHP" stroke={T.acc} strokeWidth={2} dot={false} isAnimationActive={false} />
                      <Line dataKey="torque" name="Torque" stroke={T.cyan} strokeWidth={2} dot={false} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </Panel>

                <Panel tight style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 10, color: T.ink2, letterSpacing: 1, fontWeight: 700, padding: '2px 0 8px' }}>AFR (COMMANDED VS ACTUAL) / TIMING</div>
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart data={chartData} margin={{ top: 4, right: 12, left: -14, bottom: 0 }}>
                      <CartesianGrid stroke={T.line} />
                      <XAxis dataKey="rpm" stroke={T.ink3} fontSize={10} type="number" domain={[1500, dynoChartMaxRpm]} />
                      <YAxis stroke={T.ink3} fontSize={10} />
                      <Tooltip contentStyle={{ background: T.panel2, border: `1px solid ${T.line}`, fontSize: 11 }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Line dataKey="afrCommanded" name="AFR commanded" stroke={T.ink3} strokeDasharray="3 3" dot={false} isAnimationActive={false} />
                      {/* Series identity colours, not status: both lines are on screen for
                          every pull, so green and amber here reported a health this chart
                          never measures. */}
                      <Line dataKey="afr" name="AFR actual" stroke={T.cyan} strokeWidth={2} dot={false} isAnimationActive={false} />
                      <Line dataKey="timing" name="Timing used" stroke={T.violet} strokeWidth={2} dot={false} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </Panel>
                </>
                )}

                {!running && dynoView === 'data' && (
                  <>
                    <Eyebrow icon={Info}>Datalog</Eyebrow>
                    <div style={{ fontSize: 12, color: T.ink2, lineHeight: 1.55, marginBottom: 10 }}>
                      One card per RPM breakpoint. Each line pairs <b style={{ color: T.ink }}>what you asked for</b> with <b style={{ color: T.ink }}>what the engine actually did</b> — a mismatch is the ECU telling you something.
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                      {RPM.map((r) => {
                        const p = result.points.find((pt) => pt.rpm === r);
                        if (!p) return null;
                        const bad = p.knock || p.fuelLimited || p.leanRisk || p.richRisk || p.pressureRisk;
                        const warn = !bad && (p.duty > 85 || p.egtRisk);
                        const edge = bad ? T.danger : warn ? T.warn : T.line;

                        // Each row: label, what was asked, what happened, and a verdict.
                        const rows = [
                          { k: 'Airflow', asked: p.veTable !== p.ve ? `${p.veTable}% VE` : null, got: `${p.maf} g/s`,
                            note: p.veTable !== p.ve
                              ? `${p.map} kPa manifold · table says ${p.veTable}% VE, engine actually flowed ${p.ve}%`
                              : `${p.map} kPa manifold · ${p.ve}% VE`,
                            ok: Math.abs(p.veTable - p.ve) / Math.max(1, p.ve) < 0.03 },
                          { k: 'Timing', asked: `${p.commandedTiming}°`, got: `${p.timing}°`,
                            note: p.knock ? `ECU pulled ${p.knockPull.toFixed(1)}° — too advanced for this cylinder pressure` : 'ran your commanded value',
                            ok: !p.knock },
                          { k: 'Mixture', asked: `${p.afrCommanded}:1`, got: `${p.afr}:1`,
                            note: p.fuelLimited ? 'injectors out of time — mixture leaned out on its own'
                              : p.richRisk ? 'far richer than commanded — check injector scaling'
                              : `lambda ${p.lambda} · best power here is ${p.bestAfr}:1`,
                            ok: !p.fuelLimited && !p.richRisk && !p.leanRisk },
                          // Same "no headroom left" cutoff as the build tab's duty preview,
                          // asked the same way: utilisationColor owns the band, and this
                          // reads its verdict rather than restating >90 twice more.
                          { k: 'Injectors', asked: null, got: `${p.duty}% duty`,
                            note: `${p.pw} ms of the ${(120000 / p.rpm).toFixed(1)} ms available${utilisationColor(p.duty) === T.danger ? ' — at the limit' : ''}`,
                            ok: utilisationColor(p.duty) !== T.danger },
                          { k: 'Heat', asked: null, got: `${p.egt}°C`,
                            note: `intake charge ${p.iat}°C${p.egtRisk ? ' · exhaust running hot — retard and lean mixture are what put it there' : ''}`,
                            ok: !p.egtRisk },
                          { k: 'Pressure', asked: null, got: `${p.peakPressure} bar`,
                            note: p.pressureRisk
                              ? 'past what stock pistons and rods take — a mechanical limit, not detonation'
                              : `what ${p.map} kPa becomes at the top of the stroke, burning at ${p.timing}°`,
                            ok: !p.pressureRisk },
                        ];

                        return (
                          <div key={r} style={{ border: `1px solid ${edge}`, borderRadius: 10, background: T.panel2, overflow: 'hidden' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 12px', background: bad ? T.dangerBg : warn ? T.warnBg : T.panel }}>
                              <span style={{ fontFamily: T.mono, fontWeight: 800, fontSize: 14, color: T.ink }}>{r} RPM</span>
                              <span style={{ fontFamily: T.mono, fontSize: 12, fontWeight: 700, color: bad ? T.danger : warn ? T.warn : T.ok }}>
                                {p.hp} whp · {p.torque} lb-ft{bad ? '  ⚠' : warn ? '  !' : '  ✓'}
                              </span>
                            </div>
                            <div style={{ padding: '4px 12px 10px' }}>
                              {rows.map((row, i) => (
                                <div key={i} style={{ paddingTop: 7 }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                                    <span style={{ fontSize: 11.5, color: T.ink2, fontWeight: 600, minWidth: 62 }}>{row.k}</span>
                                    <span style={{ fontFamily: T.mono, fontSize: 12, color: row.ok ? T.ink : T.danger, fontWeight: 700, textAlign: 'right' }}>
                                      {row.asked != null && <span style={{ color: T.ink3, fontWeight: 400 }}>{row.asked} → </span>}
                                      {row.got}
                                    </span>
                                  </div>
                                  <div style={{ fontSize: 10.5, color: row.ok ? T.ink3 : T.dangerInk, lineHeight: 1.4, marginTop: 1 }}>{row.note}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <ExpandableInfo title="How to read a datalog">
                      Diagnosis happens in the <b style={{ color: T.ink }}>asked → got</b> pairs, not in the power number.
                      <br /><br /><b style={{ color: T.ink }}>Timing</b>: if the two differ, the ECU overrode you. That is knock retard, and the gap is how far past the limit your table was. Tuners treat anything sustained above ~2° as damaging.
                      <br /><br /><b style={{ color: T.ink }}>Mixture</b>: if actual is not what you commanded, the cause is upstream of the fuel table — usually injectors out of duty cycle, MAF scaling, or an ECU injector size that does not match the hardware. Do not paper over it by editing fuel cells; fix the cause.
                      <br /><br /><b style={{ color: T.ink }}>Injectors</b>: duty is a time budget. At 7500 RPM there are only 16 ms in an engine cycle. Past about 90% there is no room left and the mixture goes lean regardless of what you asked for.
                      <br /><br /><b style={{ color: T.ink }}>Heat</b>: exhaust temperature rises with retarded timing and lean mixtures. Sustained above ~950°C cooks turbines and valves.
                      <br /><br /><b style={{ color: T.ink }}>Pressure</b>: peak cylinder pressure is what the piston, rod and bearings physically carry, and it is set by compression ratio multiplied by manifold pressure, not by boost alone. A naturally aspirated engine peaks near 50 bar; a factory turbo engine near 90-110. Past that, stock pistons and rods start failing <i>without</i> any detonation to warn you — which is exactly what high-octane fuel hides, because octane buys knock margin and nothing else.
                    </ExpandableInfo>

                    <Eyebrow icon={Grid3x3}>Fuel Trim Histogram</Eyebrow>
                    <ExpandableInfo title="How real tuners actually correct a VE table">
                      This is the workflow every professional platform is built around. You log a pull, bin the difference between commanded and actual mixture onto the same RPM x MAP grid as your VE table, then apply that error back into the cells.
                      <br /><br />A cell reading <b style={{ color: T.ink }}>+6%</b> means the engine ran 6% leaner than you commanded, which can only happen if it actually pulled 6% <i>more</i> air than your VE table claimed — so that cell should go <b style={{ color: T.ink }}>up</b> 6%. A negative cell means the opposite: the table is over-reporting airflow, the ECU is over-fuelling, and the number should come down.
                      <br /><br />The ECU has no way to measure cylinder filling directly. It fuels from your table and nothing else, so a wrong table means wrong fuel, every time. Blue cells are within tolerance; red means your table is lying to the ECU at that point. Correct, re-pull, repeat until it is flat. A cell you hit squarely lands on the truth in one pass; the rest take a couple, because every logged point is interpolated between four cells.
                    </ExpandableInfo>
                    {!histogram ? (
                      /* Was a cyan-outlined width:100% bar. Cyan is the chart-series
                         hue — the same borrowed colour Task 6 took off the intercooler
                         toggle — so this takes the accent like every other action. */
                      <div style={{ marginBottom: 16 }}>
                        <Button onClick={buildHistogram}>
                          BUILD HISTOGRAM FROM THIS PULL
                        </Button>
                      </div>
                    ) : (
                      <div style={{ marginBottom: 16 }}>
                        <div style={{ overflowX: 'auto', border: `1px solid ${T.line}`, borderRadius: 10, marginBottom: 8 }}>
                          <div style={{ display: 'inline-block', minWidth: '100%' }}>
                            <div style={{ display: 'flex' }}>
                              <div style={{ width: 44, flexShrink: 0, background: T.panel }} />
                              {RPM.map((r) => (
                                <div key={r} style={{ width: 51, height: 26, flexShrink: 0, background: T.panel, color: T.ink2, fontFamily: T.mono, fontSize: 9.5, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', borderLeft: `1px solid ${T.line}` }}>{r}</div>
                              ))}
                            </div>
                            {LOAD.map((m, ri) => (
                              <div key={m} style={{ display: 'flex' }}>
                                <div style={{ width: 44, height: 32, flexShrink: 0, background: T.panel, color: T.ink2, fontFamily: T.mono, fontSize: 9.5, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', borderTop: `1px solid ${T.line}` }}>{m}</div>
                                {RPM.map((_, ci) => {
                                  const e = histogram[ri][ci];
                                  const bg = e == null ? T.panel2 : deltaHeat(e);
                                  return (
                                    <div key={ci} style={{ width: 51, height: 32, flexShrink: 0, background: bg, color: e == null ? T.ink3 : T.ink, fontFamily: T.mono, fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${shadowAlpha(0.35)}` }}>
                                      {e == null ? '—' : `${e > 0 ? '+' : ''}${e.toFixed(1)}`}
                                    </div>
                                  );
                                })}
                              </div>
                            ))}
                          </div>
                        </div>
                        <div style={{ fontSize: 10.5, color: T.ink3, marginBottom: 8 }}>Cells show % airflow error (blank = not visited during this pull). Rows are MAP kPa, columns RPM.</div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <Button style={{ flex: 2 }} onClick={applyHistogram}>
                            APPLY CORRECTIONS TO VE
                          </Button>
                          {/* Not `danger`: discarding throws away a histogram that
                              BUILD HISTOGRAM regenerates from the same pull. */}
                          <Button variant="ghost" style={{ flex: 1 }} onClick={() => dispatch({ type: ACTIONS.SET_SESSION_FIELD, field: 'histogram', value: null })}>
                            DISCARD
                          </Button>
                        </div>
                      </div>
                    )}

                  </>
                )}

                {!running && dynoView === 'log' && (
                  <>
                    <Eyebrow icon={AlertTriangle}>Pull Log</Eyebrow>
                    {result.events.length === 0 ? (
                      <div style={{ fontSize: 12.5, color: T.ok, background: T.okBg, border: `1px solid ${T.okLine}`, borderRadius: 10, padding: 12 }}>
                        Clean pull — no knock, fueling, or trim issues across the sweep.
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {result.events.map((e, i) => {
                          // The tone comes from the severity the sim already assigns, not from a
                          // hand-kept list of type names. Those lists named eleven of the twelve
                          // types `src/sim` emits: `bearing` matched none of them and fell through
                          // to the chart-series cyan, so the one warning about accumulating
                          // bottom-end stress rendered as decoration while `pressure`, its acute
                          // sibling, rendered red. Deriving it means a thirteenth event type gets a
                          // tone the day it is added instead of silently becoming a chart colour.
                          //
                          // `maf` is the one genuine special case: it is a calibration observation
                          // rather than damage, and violet is the token reserved for that.
                          const isViolet = e.type === 'maf';
                          const isDanger = !isViolet && e.severity >= 3;
                          const isWarn = !isViolet && !isDanger;
                          const bg = isDanger ? T.dangerBg : isWarn ? T.warnBg : isViolet ? T.violetBg : T.panel2;
                          const bd = isDanger ? T.dangerLine : isWarn ? T.warnLine : isViolet ? T.violetLine : T.line;
                          const fg = isDanger ? T.dangerInk : isWarn ? T.warnInk : isViolet ? T.violet : T.cyan;
                          return (
                            <div key={i} style={{ padding: '11px 12px', borderRadius: 10, background: bg, border: `1px solid ${bd}` }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                                <div style={{ display: 'flex', gap: 8, fontSize: 12.5, fontWeight: 700, color: fg }}>
                                  <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                                  <span>{e.msg}</span>
                                </div>
                                {e.impact != null && <span style={{ fontSize: 11, fontFamily: T.mono, fontWeight: 800, color: fg, flexShrink: 0 }}>-{e.impact}</span>}
                              </div>
                              {e.cause && <div style={{ fontSize: 11.5, color: T.ink2, marginTop: 6, paddingLeft: 22 }}><b style={{ color: T.inkSoft }}>Why: </b>{e.cause}</div>}
                              {e.fix && <div style={{ fontSize: 11.5, color: T.ink2, marginTop: 4, paddingLeft: 22 }}><b style={{ color: T.inkSoft }}>Try: </b>{e.fix}</div>}
                            </div>
                          );
                        })}
                      </div>
                    )}

                  </>
                )}

                {!running && dynoView === 'score' && scores && (
                      <>
                        <Eyebrow icon={Trophy}>Scorecard</Eyebrow>
                        <Panel style={{ marginBottom: 10, background: T.accBg, border: `1px solid ${T.acc}`, textAlign: 'center' }}>
                          <div style={{ fontSize: 10, color: T.accInk, letterSpacing: 1.5, fontWeight: 800 }}>PULL SCORE</div>
                          <div style={{ fontSize: 40, fontWeight: 800, fontFamily: T.mono, color: T.accInk, lineHeight: 1.1 }}>{scores.pull}</div>
                          <div style={{ fontSize: 11.5, color: scores.pull >= bestScore ? T.ok : T.ink2, fontWeight: 700, marginTop: 2 }}>
                            {scores.pull >= bestScore ? 'NEW BEST' : `Best: ${bestScore}`}
                          </div>
                        </Panel>
                        <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                          {[['TUNING SCORE', scores.tuning], ['ENGINEER SCORE', scores.engineer]].map(([label, s]) => {
                            const c = statusColor(s.score);
                            return (
                              <Panel key={label} style={{ flex: 1 }}>
                                <div style={{ fontSize: 9.5, color: T.ink2, letterSpacing: 1, fontWeight: 700 }}>{label}</div>
                                <div style={{ fontSize: 28, fontWeight: 800, fontFamily: T.mono, color: c, marginTop: 2 }}>{s.score}</div>
                                <div style={{ fontSize: 11, color: c, fontWeight: 700 }}>{s.label}</div>
                              </Panel>
                            );
                          })}
                        </div>
                        <Note>Pull Score rewards actual output (peak whp + torque), scaled by how clean (Tuning) and how sound (Engineer) the build is — a big, slightly imperfect pull can still out-score a small, spotless one. It has no ceiling; every pull is a chance to beat your best.</Note>
                        {(scores.tuning.deductions.length > 0 || scores.engineer.deductions.length > 0) && (
                          <Panel tight style={{ marginBottom: 16, fontSize: 11.5, color: T.ink2, fontFamily: T.mono, lineHeight: 1.8 }}>
                            {scores.tuning.deductions.map((d, i) => <div key={'t' + i}>{d}</div>)}
                            {scores.engineer.deductions.map((d, i) => <div key={'e' + i}>{d}</div>)}
                          </Panel>
                        )}
                        {scores.tuning.advisories?.length > 0 && (
                          <div style={{ marginTop: 8 }}>
                            <div style={{ fontSize: 10, letterSpacing: 1, color: T.ink3, fontWeight: 800, marginBottom: 4 }}>
                              HARDWARE TRADE-OFFS · NOT SCORED
                            </div>
                            {scores.tuning.advisories.map((a, i) => (
                              <div key={i} style={{ fontSize: 11.5, color: T.ink2, lineHeight: 1.5 }}>{a}</div>
                            ))}
                          </div>
                        )}
                  </>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Bottom nav */}
      <div style={{ display: 'flex', borderTop: `1px solid ${T.line}`, background: T.panel, paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => changeTab(t.id)} style={{
              flex: 1, padding: '10px 0 9px', background: 'none', border: 'none', position: 'relative',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              color: active ? T.accInk : T.ink3,
            }}>
              {active && <div style={{ position: 'absolute', top: 0, left: '30%', right: '30%', height: 2, background: T.acc, borderRadius: '0 0 2px 2px' }} />}
              <Icon size={17} />
              <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: 0.3 }}>{t.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The app shell: the store, then the app inside it.
 *
 * The provider is mounted HERE rather than in `main.jsx` because the store is this
 * module's own state — every consumer of it lives inside this file (and, after PR 3,
 * inside the screens this file splits into). Mounting it at the module boundary means
 * `<EcuLab />` is self-contained: `main.jsx` stays the thin "mount the app in an error
 * boundary" entry point it documents itself as, and a test that renders `<EcuLab />`
 * gets the same single store the browser does instead of having to reconstruct the
 * app's root providers by hand.
 *
 * @returns {React.ReactElement}
 */
export default function EcuLab() {
  return (
    <StoreProvider>
      <EcuLabApp />
    </StoreProvider>
  );
}
