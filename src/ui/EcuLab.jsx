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

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import {
  Gauge, Grid3x3, Zap, Droplets, Wind, Activity, RotateCcw, Play, AlertTriangle, Info,
  Wrench, Settings, Package, Flame, ChevronDown, Trophy, TrendingUp, BookOpen, Fuel, Flag,
} from 'lucide-react';

import {
  BARO_KPA, CAR_BODIES, COMPRESSOR_OPTS, CONFIG_OPTS, CYL_COUNT, DEFAULT_AFR, DEFAULT_BOOST,
  DEFAULT_CAR, DEFAULT_ENGINE_CONFIG, DEFAULT_MODS, DEFAULT_TIMING, DRIVETRAIN_OPTS,
  ENGINE_PRESETS, EXHAUST_DIA_OPTS, GEARBOX_OPTS, INJ_DEADTIME_MS, INJECTOR_OPTS, LOAD,
  MATERIAL_OPTS, MOD_INFO, MPH_PER_MS, OCTANE_OPTS, PRESET_GROUPS, PSI_TO_KPA, QUARTER_MILE_M,
  R_AIR, RPM, SIXTY_FEET_M, SPARK_MAX_DEG, SPARK_MIN_DEG, TIRE_GRIP, TURBINE_OPTS,
  acousticDrive, applyPreset, calibrationAdvice, chargeTempK, clamp, clone2D,
  computeEngineerScore, computeHardwareVE, computePullScore, computeTuningScore, deriveEngine,
  exhaustGeometry, idealExhaustDiameter, interp2, liveStep, makeLiveState, presetById,
  roadSpeedMs, simulateDragRun, simulateSweep, torqueCurveFromSweep, turbineWithCount,
  veRecommendations
} from '../sim/index.js';
import {
  beepEngineAudio, createEngineAudio, silenceEngineAudio,
  updateEngineAudio,
} from './audio/engineAudio.js';
import {
  T, accAlpha, deltaHeat, heat, horizonGlowAlpha, shadowAlpha, smokeAlpha, statusColor, strip,
} from './theme.js';
import { BUILD_VERSION } from '../version.js';
import { loadCareer, saveCareer } from '../storage.js';
import { StartScreen } from './screens/StartScreen.jsx';
import { TutorialScreen } from './screens/TutorialScreen.jsx';

const Eyebrow = ({ children, icon: Icon }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
    <div style={{ width: 3, height: 13, background: T.acc, borderRadius: 2 }} />
    {Icon && <Icon size={13} color={T.accInk} />}
    <span style={{ fontSize: 10.5, letterSpacing: 1.6, color: T.accInk, textTransform: 'uppercase', fontWeight: 800 }}>{children}</span>
  </div>
);

const Panel = ({ children, style, tight }) => (
  <div style={{ background: T.panel2, border: `1px solid ${T.line}`, borderRadius: 12, padding: tight ? '10px 12px' : 14, ...style }}>
    {children}
  </div>
);

const Note = ({ children, tone = 'info' }) => {
  const colors = { info: [T.ink2, T.line, T.panel2], warn: [T.warn, T.warnLine, T.warnBg] };
  const [fg, bd, bgc] = colors[tone] || colors.info;
  return (
    <div style={{ display: 'flex', gap: 9, background: bgc, border: `1px solid ${bd}`, borderRadius: 10, padding: '11px 13px', margin: '10px 0', fontSize: 12.5, color: fg === T.ink2 ? T.inkSoft : fg, lineHeight: 1.55 }}>
      <Info size={15} style={{ flexShrink: 0, marginTop: 1, color: fg }} />
      <div>{children}</div>
    </div>
  );
};

function ExpandableInfo({ title, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ margin: '10px 0', border: `1px solid ${T.line}`, borderRadius: 10, overflow: 'hidden', background: T.panel }}>
      <button onClick={() => setOpen((o) => !o)} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 13px', background: 'none', border: 'none' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 9, color: T.ink, fontSize: 12.5, fontWeight: 700, textAlign: 'left' }}>
          <Info size={14} style={{ color: T.acc, flexShrink: 0 }} />{title}
        </span>
        <ChevronDown size={15} style={{ color: T.ink3, flexShrink: 0, marginLeft: 8, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
      </button>
      <div style={{ maxHeight: open ? 900 : 0, opacity: open ? 1 : 0, overflow: 'hidden', transition: 'max-height .3s ease, opacity .2s ease' }}>
        <div style={{ padding: '0 13px 13px', fontSize: 12.5, color: T.ink2, lineHeight: 1.65 }}>{children}</div>
      </div>
    </div>
  );
}

// Segmented row of equal-width option buttons — replaces the repeated
// flex-row-of-buttons pattern used all over the tuning screens.
function Seg({ options, value, onChange, wrap }) {
  return (
    <div style={{ display: 'flex', gap: 7, marginBottom: 4, flexWrap: wrap ? 'wrap' : 'nowrap' }}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button key={o.value} onClick={() => onChange(o.value)} style={{
            flex: wrap ? '1 1 30%' : 1, padding: '11px 4px', borderRadius: 9, fontWeight: 700, fontSize: 12.5,
            border: `1px solid ${active ? T.acc : T.line}`, background: active ? T.accBg : T.panel2,
            color: active ? T.accInk : T.ink2, transition: 'all .15s',
          }}>{o.label}</button>
        );
      })}
    </div>
  );
}

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

// A native <select> with optgroup headings, styled to the theme. Native rather than a
// custom panel so that keyboard navigation, type-ahead and screen-reader semantics come
// from the platform instead of being reimplemented, and so a phone gets its own picker
// wheel. Used where a list has grown past what a stack of PickList buttons can carry.
//
// `groups` is [{ label, options: [{ label, value }] }]; `extra` holds options that
// belong to no group and render after all of them.
function GroupedSelect({ groups, extra = [], value, onChange }) {
  return (
    <div style={{ position: 'relative', marginBottom: 13 }}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: '100%', appearance: 'none', WebkitAppearance: 'none',
          padding: '11px 34px 11px 13px', borderRadius: 9,
          border: `1px solid ${T.line}`, background: T.panel2, color: T.ink,
          fontFamily: T.sans, fontSize: 13, fontWeight: 600,
        }}
      >
        {groups.map((g) => (
          <optgroup key={g.label} label={g.label} style={{ background: T.panel, color: T.ink2 }}>
            {g.options.map((o) => (
              <option key={o.value} value={o.value} style={{ background: T.panel2, color: T.ink }}>{o.label}</option>
            ))}
          </optgroup>
        ))}
        {extra.map((o) => (
          <option key={o.value} value={o.value} style={{ background: T.panel2, color: T.ink }}>{o.label}</option>
        ))}
      </select>
      <ChevronDown
        size={16}
        style={{
          position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
          color: T.ink2, pointerEvents: 'none',
        }}
      />
    </div>
  );
}

function ToggleRow({ label, sub, checked, onChange, color = T.acc }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: T.panel2, border: `1px solid ${T.line}`, borderRadius: 10, padding: 13 }}>
      <div style={{ marginRight: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 13.5, color: T.ink }}>{label}</div>
        {sub && <div style={{ fontSize: 11.5, color: T.ink2, marginTop: 1 }}>{sub}</div>}
      </div>
      <button onClick={() => onChange(!checked)} style={{ width: 48, height: 27, borderRadius: 14, border: 'none', position: 'relative', flexShrink: 0, background: checked ? color : T.panel3, transition: 'background .2s' }}>
        <div style={{ position: 'absolute', top: 3, left: checked ? 24 : 3, width: 21, height: 21, borderRadius: 11, background: T.ink, transition: 'left .2s', boxShadow: `0 1px 3px ${shadowAlpha(0.4)}` }} />
      </button>
    </div>
  );
}

function StatTile({ label, value, unit, color = T.ink, flex = 1 }) {
  return (
    <div style={{ flex, background: T.panel2, border: `1px solid ${T.line}`, borderRadius: 11, padding: 13 }}>
      <div style={{ fontSize: 9.5, color: T.ink2, letterSpacing: 1, fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, fontFamily: T.mono, color, marginTop: 2 }}>{value}<span style={{ fontSize: 11.5, color: T.ink2, marginLeft: 3, fontWeight: 600 }}>{unit}</span></div>
    </div>
  );
}

function HealthBar({ label, value }) {
  const c = statusColor(value);
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: T.ink2, marginBottom: 4, fontWeight: 600 }}>
        <span>{label}</span><span style={{ color: c, fontWeight: 800 }}>{Math.round(value)}%</span>
      </div>
      <div style={{ height: 7, background: T.panel, borderRadius: 4, overflow: 'hidden', border: `1px solid ${T.line}` }}>
        <div style={{ width: `${value}%`, height: '100%', background: c, borderRadius: 4, transition: 'width .4s', boxShadow: `0 0 8px ${c}66` }} />
      </div>
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
    cta: 'Calibration set — start the engine', next: 'live' },
  { tab: 'live', title: 'Step 3 · Start it and listen',
    body: 'Open Live Engine and press START. Watch it idle, hold the throttle to rev it, and watch the sensors and fuel trims respond in real time. This is your calibration actually running.',
    cta: 'Sounds good — put it on the dyno', next: 'dyno' },
  { tab: 'dyno', title: 'Step 4 · Measure it',
    body: 'Run a pull. Then read the Pull Log before you look at the power number — it explains anything that went wrong and what to change. From here the loop is: adjust, pull again, compare.',
    cta: 'Measured — now race it', next: 'drag' },
  { tab: 'drag', title: 'Step 5 · Race it',
    body: 'Put that torque curve in a car and run a quarter mile. Body, gearing, tyres and driven wheels all change the time without touching the engine — because a torque curve is only half of acceleration. Read the 60-foot time for traction and the trap speed for power.',
    cta: 'Finish — let me explore freely', next: null },
];

function JourneyBanner({ step, onAdvance, onDismiss }) {
  const j = JOURNEY[step];
  if (!j) return null;
  return (
    <div style={{ background: T.accBg, border: `1px solid ${T.acc}`, borderRadius: 12, padding: '13px 14px', margin: '0 0 14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ fontSize: 11, letterSpacing: 1, color: T.accInk, fontWeight: 800 }}>{j.title.toUpperCase()}</div>
        <button onClick={onDismiss} style={{ background: 'none', border: 'none', color: T.ink3, fontSize: 10.5, fontWeight: 700, flexShrink: 0 }}>SKIP GUIDE</button>
      </div>
      <div style={{ fontSize: 12.5, color: T.inkSoft, lineHeight: 1.55, marginTop: 7 }}>{j.body}</div>
      <div style={{ display: 'flex', gap: 5, marginTop: 11, marginBottom: 10 }}>
        {JOURNEY.map((_, i) => (
          <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= step ? T.acc : T.line }} />
        ))}
      </div>
      <button onClick={onAdvance} style={{ width: '100%', padding: '11px 0', borderRadius: 9, border: 'none', background: T.acc, color: T.accOn, fontWeight: 800, fontSize: 12.5 }}>
        {j.cta}
      </button>
    </div>
  );
}

function BuildSection({ active, onClick, icon: Icon, label, sub, children }) {
  return (
    <div style={{ marginBottom: 9 }}>
      <button onClick={onClick} style={{
        width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 14px',
        borderRadius: 11, border: `1px solid ${active ? T.acc : T.line}`, background: active ? T.accBg : T.panel2,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, textAlign: 'left' }}>
          <div style={{ width: 32, height: 32, borderRadius: 9, background: active ? accAlpha(0.18) : T.panel, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon size={16} color={active ? T.accInk : T.ink2} />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 13.5, color: active ? T.accInk : T.ink }}>{label}</div>
            {sub && <div style={{ fontSize: 10.5, color: T.ink2, marginTop: 1 }}>{sub}</div>}
          </div>
        </div>
        <ChevronDown size={16} style={{ color: active ? T.accInk : T.ink3, flexShrink: 0, marginLeft: 8, transform: active ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
      </button>
      <div style={{ maxHeight: active ? 3000 : 0, opacity: active ? 1 : 0, overflow: 'hidden', transition: 'max-height .35s ease, opacity .25s ease' }}>
        <div style={{ padding: '13px 2px 2px' }}>{children}</div>
      </div>
    </div>
  );
}

// Signature visual motif: a dial/gauge, used both as the static brand mark
// (Start screen) and as the live, RPM-driven readout (Dyno tab).
function DialMark({ size = 64, pct = 0.62, live = false }) {
  const angle = -120 + pct * 240;
  return (
    <svg viewBox="0 0 100 100" width={size} height={size}>
      <circle cx="50" cy="50" r="44" fill={T.panel2} stroke={T.line} strokeWidth="1.5" />
      {Array.from({ length: 13 }).map((_, i) => {
        const a = (-120 + (i / 12) * 240) * (Math.PI / 180);
        const inner = 34, outer = i % 3 === 0 ? 28 : 31;
        return (
          <line key={i}
            x1={50 + inner * Math.sin(a)} y1={50 - inner * Math.cos(a)}
            x2={50 + outer * Math.sin(a)} y2={50 - outer * Math.cos(a)}
            stroke={i > 9 ? T.danger : T.line === T.line ? T.ink3 : T.line} strokeWidth={i % 3 === 0 ? 1.6 : 1} />
        );
      })}
      <g style={{ transition: live ? 'none' : 'transform .6s cubic-bezier(.34,1.4,.64,1)' }} transform={`rotate(${angle} 50 50)`}>
        <line x1="50" y1="50" x2="50" y2="20" stroke={T.acc} strokeWidth="3" strokeLinecap="round" />
      </g>
      <circle cx="50" cy="50" r="5" fill={T.acc} />
    </svg>
  );
}

function Tach({ rpm, cylinders, running, fullScaleRpm }) {
  const pct = clamp(rpm / fullScaleRpm, 0, 1);
  // fullScaleRpm is redline * 1.1 (see tachFullScaleRpm), so redline itself always
  // sits at pct ≈ 0.909 regardless of engine — the red zone has to start at or just
  // below that, not above it, or the needle never shows red at the engine's own redline.
  const zoneColor = pct > 0.9 ? T.danger : pct > 0.75 ? T.warn : T.ok;
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
            animation: running ? `cylpulse ${Math.max(0.12, 50 / Math.max(rpm, 500))}s ease-in-out infinite` : 'none',
            animationDelay: `${i * (0.5 / cylinders)}s`, opacity: running ? undefined : 0.3,
          }} />
        ))}
      </div>
    </Panel>
  );
}

// ============================================================
function TuningGrid({ data, min, max, decimals, selection, setSelection, rangeMode }) {
  const fmt = (v) => (decimals ? v.toFixed(decimals) : Math.round(v));
  // Real tuning software almost never edits one cell at a time — you grab a region and
  // move it together, because airflow and spark errors come in bands, not points. First
  // tap sets an anchor, second tap completes the rectangle.
  const selectCell = (row, col) => {
    if (!rangeMode) { setSelection({ type: 'cell', row, col }); return; }
    if (!selection || selection.type !== 'range' || selection.complete) {
      setSelection({ type: 'range', r1: row, c1: col, r2: row, c2: col, complete: false });
    } else {
      setSelection({ ...selection, r2: row, c2: col, complete: true });
    }
  };
  const selectRow = (row) => setSelection({ type: 'row', row });
  const selectCol = (col) => setSelection({ type: 'col', col });
  const isSelected = (row, col) => {
    if (!selection) return false;
    if (selection.type === 'cell') return selection.row === row && selection.col === col;
    if (selection.type === 'row') return selection.row === row;
    if (selection.type === 'col') return selection.col === col;
    if (selection.type === 'range') {
      const [ra, rb] = [Math.min(selection.r1, selection.r2), Math.max(selection.r1, selection.r2)];
      const [ca, cb] = [Math.min(selection.c1, selection.c2), Math.max(selection.c1, selection.c2)];
      return row >= ra && row <= rb && col >= ca && col <= cb;
    }
    return false;
  };
  return (
    <div>
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

function SelectionDock({ data, setData, selection, min, max, decimals, unit, onClose, kind, rangeMode }) {
  if (!selection) return null;
  // Resolve whatever shape the selection has to the list of cells it covers, so every
  // operation below is written once and works identically for one cell or a hundred.
  const cellsIn = () => {
    const out = [];
    if (selection.type === 'cell') out.push([selection.row, selection.col]);
    else if (selection.type === 'row') data[selection.row].forEach((_, c) => out.push([selection.row, c]));
    else if (selection.type === 'col') data.forEach((_, r) => out.push([r, selection.col]));
    else if (selection.type === 'range') {
      const [ra, rb] = [Math.min(selection.r1, selection.r2), Math.max(selection.r1, selection.r2)];
      const [ca, cb] = [Math.min(selection.c1, selection.c2), Math.max(selection.c1, selection.c2)];
      for (let r = ra; r <= rb; r++) for (let c = ca; c <= cb; c++) out.push([r, c]);
    }
    return out;
  };
  const cells = cellsIn();
  const current = cells.reduce((sum, [r, c]) => sum + data[r][c], 0) / Math.max(cells.length, 1);

  /** Adds a fixed amount to every selected cell. */
  const apply = (delta) => {
    const next = clone2D(data);
    cells.forEach(([r, c]) => { next[r][c] = Number(clamp(next[r][c] + delta, min, max).toFixed(2)); });
    setData(next);
  };
  /**
   * Scales every selected cell by a percentage. This is the operation a tuner uses most
   * on a VE table, because airflow error is proportional rather than absolute — a
   * histogram correction is a percentage, so the edit that answers it should be too.
   */
  const scale = (pct) => {
    const next = clone2D(data);
    cells.forEach(([r, c]) => { next[r][c] = Number(clamp(next[r][c] * (1 + pct / 100), min, max).toFixed(2)); });
    setData(next);
  };
  const setAbs = (v) => {
    const next = clone2D(data);
    cells.forEach(([r, c]) => { next[r][c] = clamp(v, min, max); });
    setData(next);
  };
  /**
   * Pulls the selection halfway toward its own average. A histogram correction is applied
   * cell by cell from data that had different sample counts in each, so it can leave
   * spikes behind; smoothing them out is the same tool real scanners provide.
   */
  const smooth = () => {
    const next = clone2D(data);
    const avg = cells.reduce((sum, [r, c]) => sum + data[r][c], 0) / Math.max(cells.length, 1);
    cells.forEach(([r, c]) => { next[r][c] = Number(clamp(data[r][c] * 0.5 + avg * 0.5, min, max).toFixed(2)); });
    setData(next);
  };
  const smallStep = decimals ? 0.1 : 1;
  const bigStep = decimals ? 1 : 5;
  let sel = 'Cell';
  if (selection.type === 'row') sel = `Row · ${LOAD[selection.row]} kPa MAP`;
  else if (selection.type === 'col') sel = `Column · ${RPM[selection.col]} RPM`;
  else if (selection.type === 'range') {
    const [ra, rb] = [Math.min(selection.r1, selection.r2), Math.max(selection.r1, selection.r2)];
    const [ca, cb] = [Math.min(selection.c1, selection.c2), Math.max(selection.c1, selection.c2)];
    sel = selection.complete
      ? `${cells.length} cells · ${RPM[ca]}-${RPM[cb]} RPM · ${LOAD[rb]}-${LOAD[ra]} kPa`
      : 'Tap a second cell to complete the range';
  } else sel = `${RPM[selection.col]} RPM · ${LOAD[selection.row]} kPa MAP`;

  return (
    <div style={{ position: 'sticky', bottom: 0, background: T.panel, borderTop: `1px solid ${T.line}`, padding: '11px 14px 13px', boxShadow: `0 -8px 20px ${shadowAlpha(0.45)}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 }}>
        <div>
          <div style={{ fontSize: 10, letterSpacing: 1, color: T.ink2, textTransform: 'uppercase', fontWeight: 700 }}>{sel}</div>
          <div style={{ fontFamily: T.mono, fontSize: 23, fontWeight: 800, color: T.ink }}>
            {decimals ? current.toFixed(decimals) : Math.round(current)}<span style={{ fontSize: 12, color: T.ink2, marginLeft: 4 }}>{unit}</span>
          </div>
        </div>
        <button onClick={onClose} style={{ color: T.ink2, background: T.panel2, border: `1px solid ${T.line}`, borderRadius: 7, fontSize: 11.5, fontWeight: 700, padding: '8px 14px' }}>DONE</button>
      </div>
      {selection.type === 'cell' && kind && (() => {
        const ref = cellReference(kind, selection.row, selection.col, current);
        return (
          <div style={{ background: T.panel2, border: `1px solid ${T.line}`, borderRadius: 9, padding: '9px 11px', marginBottom: 9, fontSize: 11.5, lineHeight: 1.55, color: T.ink2 }}>
            <div style={{ fontSize: 9.5, letterSpacing: 1, color: T.cyan, fontWeight: 800, marginBottom: 5 }}>REFERENCE · {RPM[selection.col]} RPM / {LOAD[selection.row]} kPa</div>
            <div>{ref.what}</div>
            <div style={{ marginTop: 4, color: T.ink }}>{ref.typical}</div>
            <div style={{ marginTop: 4 }}><b style={{ color: T.inkSoft }}>Affects: </b>{ref.affects}</div>
            {ref.note && <div style={{ marginTop: 4, color: T.warn }}>{ref.note}</div>}
          </div>
        );
      })()}
      <input type="range" min={min} max={max} step={smallStep} value={current} onChange={(e) => setAbs(Number(e.target.value))} style={{ width: '100%', accentColor: T.acc }} />
      <div style={{ display: 'flex', gap: 7, marginTop: 9 }}>
        {[-bigStep, -smallStep, smallStep, bigStep].map((d, i) => (
          <button key={i} onClick={() => apply(d)} style={{
            flex: 1, padding: '11px 0', borderRadius: 8, border: `1px solid ${T.line}`, background: T.panel2,
            color: d < 0 ? T.accInk : T.ok, fontWeight: 800, fontFamily: T.mono, fontSize: 13,
          }}>{d > 0 ? '+' : ''}{d}</button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 7, marginTop: 7 }}>
        {[-5, -2, 2, 5].map((pct) => (
          <button key={pct} onClick={() => scale(pct)} style={{
            flex: 1, padding: '10px 0', borderRadius: 8, border: `1px solid ${T.line}`, background: T.panel,
            color: pct < 0 ? T.accInk : T.cyan, fontWeight: 800, fontFamily: T.mono, fontSize: 12,
          }}>{pct > 0 ? '+' : ''}{pct}%</button>
        ))}
        <button onClick={smooth} style={{
          flex: 1, padding: '10px 0', borderRadius: 8, border: `1px solid ${T.line}`, background: T.panel,
          color: T.violet, fontWeight: 800, fontSize: 11,
        }}>SMOOTH</button>
      </div>
      {rangeMode && selection.type === 'range' && !selection.complete && (
        <div style={{ fontSize: 10.5, color: T.ink3, marginTop: 7 }}>
          Anchor set. Tap the opposite corner to select everything between.
        </div>
      )}
    </div>
  );
}

// ============================================================
// CAREER JOBS
// ------------------------------------------------------------
// Each job hands the player a car with a specific, diagnosable fault and a target.
// The faults are the real ones the simulation already models — nothing is scripted, and
// every job is solved by actually understanding what the pull log is telling you.
//
// `setup` returns the state overrides applied when the job is taken on.
// `goal(result, ctx)` decides whether the job is complete after a pull.
// `teaches` is shown once it is, because the point is the lesson and not the tick.
// ============================================================
const CAREER_JOBS = [
  {
    id: 'rich-injectors',
    title: 'Runs terrible since the fuel upgrade',
    customer: 'Owner fitted bigger injectors himself. Says it now stinks of fuel, fouls plugs and feels gutless.',
    brief: 'Something is delivering far more fuel than the tables ask for. Run a pull, read the log, and find the cause rather than bending the fuel table around it.',
    target: 'Reach Tuning Score 90+ without touching the AFR table.',
    setup: { injIdx: 4, ecuInjectorCc: 315 },
    goal: (r, ctx) => ctx.tuningScore >= 90 && !r.events.some((e) => e.type === 'rich' || e.type === 'injscale'),
    teaches: 'The ECU calculates pulse width for the injector size it has been told is fitted. Hardware changed; the ECU was never told.',
  },
  {
    id: 'stale-ve',
    title: 'Cam swap, never re-logged',
    customer: 'Shop fitted a big cam and handed it back on the old calibration. Customer says it runs rough and lean up top.',
    brief: 'The engine breathes differently now. The VE table is still describing the old engine, so the ECU is fuelling for air that is not there.',
    target: 'Get the mixture back on target and reach Tuning Score 85+.',
    setup: { camDuration: 268, springRate: 78, staleVe: true },
    goal: (r, ctx) => ctx.tuningScore >= 85 && !r.events.some((e) => e.type === 'lean' || e.type === 'rich'),
    teaches: 'A VE table is a log of measured airflow. Change the hardware and that log is simply out of date.',
  },
  {
    id: 'untuned-turbo',
    title: 'Turbo kit, stock calibration',
    customer: 'Customer bolted on a turbo and drove it home. Says it pulls hard then goes flat and rattles under load.',
    brief: 'A factory naturally-aspirated calibration has nothing meaningful above atmospheric pressure. Everything above 101 kPa is your job.',
    target: 'Survive 8 psi with Tuning Score 85+ and no knock events.',
    setup: { turboOn: true, boostCurve: [0, 0, 3, 6, 8, 8, 8, 7], injIdx: 2, ecuInjectorCc: 550, octaneIdx: 1 },
    goal: (r, ctx) => ctx.tuningScore >= 85 && !r.events.some((e) => e.type === 'knock'),
    teaches: 'Boost raises cylinder pressure enormously. Spark has to come out and mixture has to come richer, in the boost rows specifically.',
  },
  {
    id: 'lean-intake',
    title: 'Intake fitted, now it hesitates',
    customer: 'Aftermarket intake went on last week. Customer reports poor economy and a stumble at part throttle.',
    brief: 'The airflow sensor is reading against a housing it was never calibrated for. Watch the fuel trims, not just the power number.',
    target: 'Clear the trim fault and reach Tuning Score 95+.',
    setup: { intake: true },
    goal: (r, ctx) => ctx.tuningScore >= 95 && !r.events.some((e) => e.type === 'maf'),
    teaches: 'Closed loop hides small airflow errors at cruise. At wide open throttle the ECU stops listening to the O2 sensor and the error passes straight through.',
  },
  {
    id: 'full-session',
    title: 'Fresh build, no calibration at all',
    customer: 'Engine shop finished a build and handed it over with the factory file still loaded. Nothing on it has been tuned.',
    brief: 'This is a complete session, and the order matters. Verify what is actually fitted, set the scaling constants, correct airflow, then set fuel, then spark — last and in small steps. Skip a step and you will be tuning on a wrong foundation.',
    target: 'Tuning 90+ with no knock, no mixture faults and no scaling errors. The cam advisory will remain — that is a hardware trade-off, not something calibration can remove.',
    setup: { camDuration: 252, springRate: 76, injIdx: 3, ecuInjectorCc: 315, intake: true, staleVe: true, octaneIdx: 1 },
    goal: (r, ctx) => ctx.tuningScore >= 90
      && !r.events.some((e) => ['knock', 'lean', 'rich', 'injscale', 'maf', 'fuel'].includes(e.type)),
    teaches: 'Real tuning is a sequence, not a set of independent knobs. Scaling first, then airflow, then fuel, then spark — because each step assumes the one before it is already right.',
  },
  {
    id: 'power-goal',
    title: 'Customer wants 320 whp, safely',
    customer: 'Track day car. Owner wants real power but has to finish the weekend — reliability matters more than a headline number.',
    brief: 'Build and calibrate whatever it takes. The constraint is that it has to be clean: no knock, no lean cells, nothing running out of fuel.',
    target: '320+ whp with Tuning Score 90+ and zero knock.',
    setup: {},
    goal: (r, ctx) => r.peakHp >= 320 && ctx.tuningScore >= 90 && !r.events.some((e) => e.type === 'knock'),
    teaches: 'Power is easy. Power that survives a weekend is the actual job.',
  },
];
const TUTORIAL_STEPS = [
  { title: 'This is an air pump',
    body: 'An engine makes power by burning fuel, and it can only burn as much fuel as it has air to burn it with. So everything starts with airflow. The ECU measures the air, decides how much fuel to inject, and picks the moment to light it. Tuning is adjusting those last two decisions.' },
  { title: 'The one equation everything rests on',
    body: 'The ECU works out how much air is in the cylinder using the ideal gas law:\n\n    ρ = MAP ÷ (R × T)\n    airCharge = VE × V_cylinder × ρ\n\nMAP is manifold pressure, T is charge temperature in kelvin, R is a constant for air. VE — volumetric efficiency — is how completely the cylinder fills. That last number is the one you tune on the AIR table.' },
  { title: 'Fuel follows from air, not the other way round',
    body: 'Once air mass is known, fuel is pure arithmetic:\n\n    fuelMass = airCharge ÷ (λ × stoichRatio)\n\nλ (lambda) is your mixture target from the FUEL table. Best power is about λ0.87, richer under boost. stoichRatio is a property of the fuel: 14.7 for gasoline, 9.8 for E85 — which is why E85 needs roughly 1.5× the fuel mass for the same lambda.' },
  { title: 'The ECU commands time, not fuel',
    body: 'It converts fuel mass into an injector pulse width:\n\n    PW = fuelMass ÷ (injectorCC × density ÷ 60000) + deadtime\n    cycleTime = 120000 ÷ RPM\n    duty% = PW ÷ cycleTime × 100\n\nAt 7500 RPM a cycle is only 16 ms. Past about 90% duty there is no time left, and the mixture goes lean no matter what your FUEL table says. That is a physical wall, not a calibration choice.' },
  { title: 'Spark decides how much of that energy you keep',
    body: 'Fuel burns over a few milliseconds, so you light it before top dead center and aim for peak pressure just after. Too early and pressure fights the rising piston; too late and you are burning into an escaping piston.\n\n    timingEff = 1 − 0.0016 × (yourTiming − MBT)²\n\nThat is why the SPARK table changes power without changing a single thing about airflow — it changes how much of the same burn reaches the crank.' },
  { title: 'Where the horsepower number actually comes from',
    body: 'Nothing in this sim adds horsepower directly. Torque is derived last:\n\n    IMEP = fuelMass × LHV × η × timingEff × afrEff ÷ V_cyl\n    BMEP = IMEP − FMEP\n    torque = BMEP × Vd ÷ 4π\n\nη comes from your compression ratio. FMEP is what the engine spends on friction, pumping and valve springs. Change anything upstream and the dyno number changes — exactly like a real engine.' },
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
  { title: 'You can hear the physics too',
    body: 'Engine sound here is generated from the same numbers, not sampled. Each cylinder firing schedules an exhaust pulse:\n\n    firingHz = RPM ÷ 60 × cylinders ÷ 2\n\nA cross-plane V8 is even at the crank but not down either pipe — each bank fires at 180, 270, 180 and 90 degrees — and that irregular spacing is what makes it rumble. A V6 fires evenly and rings hard and hornlike. A four fires only twice per revolution, so you hear each pulse separately.\n\nRetard the timing and it turns raspy, because the charge is still burning into the exhaust. Richen it and it softens. Fit a big cam and it lopes. Add a turbo to a small engine and induction noise takes over. Tuners diagnose by ear for a reason — the sound is data.' },
  { title: 'Where this physics comes from',
    body: 'Every relation in this simulator is standard published engineering, and each figure has been checked against a source rather than assumed.\n\nMIT OpenCourseWare 8.21 gives the Otto-cycle efficiency and, critically, the value of gamma to use: about 1.3 for combustion products at cycle temperature, which yields 50% ideal efficiency at a 10:1 compression ratio. This app originally used 1.35 and was corrected to match.\n\nNASA Glenn provides the underlying pressure and temperature relations that efficiency formula derives from. x-engineer.org confirms the foundation the whole model rests on: one engine cycle is two crank rotations, and only the power stroke produces energy.\n\nEvery formula was also checked for unit consistency. Air density resolves to 1.185 kg/m3 at sea level and 25 C against a published 1.184, and injector cycle time derives exactly from two crank revolutions.\n\nThe full source list, including what checking them changed, is under Learn on the HOME tab. If a number here looks wrong to you, go and check it — that instinct has already corrected real errors in this simulator.' },
  { title: 'Chase the score',
    body: 'Every pull grades Tuning (how clean the calibration is) and Engineer (how sound the hardware choices are), then combines them with actual output into an uncapped Pull Score. A big, slightly dirty pull can beat a small spotless one — the same tension a real tuner balances.' },
  { title: 'Then put it in a car',
    body: 'On DRAG the engine goes into a car and runs a quarter mile. Gearing multiplies torque and divides speed by the same factor. Grip sets a ceiling no amount of power passes. Drag rises with the square of speed. That is why trap speed measures power while sixty-foot time measures traction, and why the fastest engine does not always win.' },
];

function LiveGauge({ label, value, unit, color = T.ink, warn }) {
  return (
    <div style={{ flex: 1, minWidth: 68, background: T.panel, border: `1px solid ${warn ? T.danger : T.line}`, borderRadius: 9, padding: '8px 9px' }}>
      <div style={{ fontSize: 8.5, color: T.ink2, letterSpacing: 0.8, fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 800, fontFamily: T.mono, color: warn ? T.danger : color }}>
        {value}<span style={{ fontSize: 9, color: T.ink3, marginLeft: 2 }}>{unit}</span>
      </div>
    </div>
  );
}

function TrimBar({ label, value }) {
  const pct = clamp((value + 25) / 50, 0, 1) * 100;
  const c = Math.abs(value) > 15 ? T.danger : Math.abs(value) > 8 ? T.warn : T.ok;
  return (
    <div style={{ marginBottom: 7 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9.5, color: T.ink2, fontWeight: 700, marginBottom: 3 }}>
        <span>{label}</span><span style={{ color: c, fontFamily: T.mono }}>{value > 0 ? '+' : ''}{value.toFixed(1)}%</span>
      </div>
      <div style={{ height: 5, background: T.panel, borderRadius: 3, position: 'relative', border: `1px solid ${T.line}` }}>
        <div style={{ position: 'absolute', left: '50%', top: -1, bottom: -1, width: 1, background: T.lineHi }} />
        <div style={{ position: 'absolute', left: `${Math.min(50, pct)}%`, width: `${Math.abs(pct - 50)}%`, top: 0, bottom: 0, background: c, borderRadius: 2 }} />
      </div>
    </div>
  );
}

// ============================================================
// DRAG STRIP PRESENTATION
// Everything below draws the run. The numbers all come from
// `simulateDragRun`; nothing here computes physics.
// ============================================================

// Body outlines. Each is drawn to the same 420x168 box with the wheels on a common
// ground line, so bodies can be swapped without the strip layout shifting.
const BODY_PATHS = [
  // Sports coupe — low nose, cab rearward, fastback
  { body: 'M 22 104 L 44 92 L 92 84 L 132 82 L 168 52 L 246 46 L 300 62 L 352 76 L 388 88 L 400 100 L 400 116 L 22 116 Z',
    glass: 'M 176 56 L 244 51 L 292 65 L 300 78 L 150 80 Z', wheels: [112, 316], wr: 30 },
  // Supercar — very low, long tail, cab far forward
  { body: 'M 16 106 L 40 96 L 96 88 L 140 60 L 214 52 L 268 58 L 340 70 L 396 84 L 406 102 L 406 116 L 16 116 Z',
    glass: 'M 150 62 L 212 56 L 258 62 L 268 78 L 132 80 Z', wheels: [104, 320], wr: 30 },
  // Sedan — three-box, taller greenhouse, longer roof
  { body: 'M 20 100 L 44 88 L 96 82 L 128 54 L 258 50 L 300 76 L 372 82 L 400 94 L 402 116 L 20 116 Z',
    glass: 'M 136 58 L 254 54 L 288 76 L 126 78 Z', wheels: [106, 322], wr: 29 },
  // Van — tall box, flat face, short nose
  { body: 'M 24 108 L 30 60 L 60 36 L 300 32 L 384 44 L 402 74 L 404 116 L 24 116 Z',
    glass: 'M 46 62 L 66 42 L 172 40 L 172 62 Z M 186 40 L 292 38 L 300 62 L 186 62 Z', wheels: [96, 330], wr: 31 },
  // Truck — cab plus open bed
  { body: 'M 20 104 L 34 66 L 74 44 L 196 42 L 226 68 L 236 78 L 236 62 L 400 62 L 404 116 L 20 116 Z',
    glass: 'M 52 66 L 80 50 L 190 48 L 206 66 Z', wheels: [98, 332], wr: 32 },
];

function CarSprite({ w = 190, squat = 0, spinning = false, bodyIdx = 0 }) {
  const B = BODY_PATHS[bodyIdx] || BODY_PATHS[0];
  return (
    // The car travels left to right, so the nose must point right. The artwork is
    // drawn nose-left, so the whole thing is mirrored here.
    <svg width={w} height={w * 0.40} viewBox="0 0 420 168" aria-hidden="true"
      style={{ display: 'block', overflow: 'visible', transform: 'scaleX(-1)' }}>
      <defs>
        <linearGradient id="dragpaint" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={strip.paintHi} />
          <stop offset="38%" stopColor={strip.paint} />
          <stop offset="72%" stopColor={strip.paintMid} />
          <stop offset="100%" stopColor={strip.paintLow} />
        </linearGradient>
        <linearGradient id="dragwin" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={strip.glassHi} />
          <stop offset="100%" stopColor={strip.glassLow} />
        </linearGradient>
      </defs>

      {/* Squat: the body rotates about the rear axle under acceleration, which is the
          visible half of the weight transfer the physics is already computing. */}
      <g transform={`rotate(${-squat * 1.5} 300 128)`}>
        <path d={B.body} fill="url(#dragpaint)" stroke={strip.paintEdge} strokeWidth="2" strokeLinejoin="round" />
        <path d={B.glass} fill="url(#dragwin)" />
        <path d="M 96 96 L 384 92" stroke={strip.paintLine} strokeWidth="1.6" opacity="0.65" />
        <path d="M 244 80 L 240 114" stroke={strip.paintLine} strokeWidth="1.6" opacity="0.5" />
        <path d="M 24 98 L 54 94 L 54 102 L 24 104 Z" fill={strip.headlight} opacity="0.92" />
        <path d="M 372 88 L 396 96 L 394 104 L 370 98 Z" fill={strip.taillight} />
        <rect x="120" y="112" width="180" height="6" rx="3" fill={strip.paintShadow} opacity="0.75" />
      </g>

      {/* Wheels sit on the road regardless of body attitude. */}
      {B.wheels.map((cx, i) => (
        <g key={cx}>
          <circle cx={cx} cy={122} r={B.wr} fill={strip.tyre} stroke={strip.tyreWall} strokeWidth="3" />
          <circle cx={cx} cy={122} r="17" fill={strip.rim} stroke={spinning && i === 1 ? T.acc : strip.rimEdge} strokeWidth="3" />
          {[0, 45, 90, 135].map((ang) => (
            <line key={ang}
              x1={cx - 14 * Math.cos((ang * Math.PI) / 180)} y1={122 - 14 * Math.sin((ang * Math.PI) / 180)}
              x2={cx + 14 * Math.cos((ang * Math.PI) / 180)} y2={122 + 14 * Math.sin((ang * Math.PI) / 180)}
              stroke={strip.spoke} strokeWidth="2.5" />
          ))}
        </g>
      ))}
      {B.wheels.map((cx) => (
        <path key={cx} d={`M ${cx - B.wr} 116 A ${B.wr} ${B.wr} 0 0 1 ${cx + B.wr} 116`}
          fill="none" stroke={strip.paintLine} strokeWidth="3" />
      ))}
    </svg>
  );
}

/** Christmas tree: pre-stage and stage bulbs, three ambers, then green. */
function LightTree({ phase }) {
  const bulb = (on, color, size = 15) => (
    <div style={{
      width: size, height: size, borderRadius: '50%', margin: '3px auto',
      background: on ? color : strip.bulbOff,
      boxShadow: on ? `0 0 10px ${color}, 0 0 20px ${color}` : 'none',
      border: `1px solid ${on ? color : strip.bulbRim}`,
    }} />
  );
  return (
    <div style={{ width: 34, padding: '6px 4px', background: T.bg, borderRadius: 8, border: `1px solid ${T.line}` }}>
      {bulb(phase >= 1, strip.stage, 9)}
      {bulb(phase >= 1, strip.stage, 9)}
      {bulb(phase === 2, T.warn)}
      {bulb(phase === 3, T.warn)}
      {bulb(phase === 4, T.warn)}
      {bulb(phase >= 5, T.ok)}
    </div>
  );
}

/** Tyre smoke: puffs spawn at the rear wheel while it spins, then drift and expand. */
function Smoke({ puffs }) {
  return puffs.map((p) => (
    <div key={p.id} aria-hidden="true" style={{
      position: 'absolute', left: p.x, bottom: p.y,
      width: p.r * 2, height: p.r * 2, borderRadius: '50%',
      background: `${smokeAlpha(p.a)}`, filter: 'blur(4px)', pointerEvents: 'none',
    }} />
  ));
}

/**
 * The strip itself. `tNow` scrubs the completed run's trace, so playback is a replay
 * of physics that has already been solved rather than a second, different simulation.
 */
function DragStrip({ res, tNow, running, treePhase, bodyIdx }) {
  const [puffs, setPuffs] = useState([]);
  const puffId = useRef(0);

  let frac = 0, mph = 0, gear = 1, spinning = false, rpm = 0, accel = 0;
  if (res) {
    const pt = res.trace.find((p) => p.t >= tNow) || res.trace[res.trace.length - 1];
    frac = clamp(pt.x / QUARTER_MILE_M, 0, 1);
    mph = pt.v * MPH_PER_MS; gear = pt.gear; spinning = pt.spinning; rpm = pt.rpm; accel = pt.a;
  }

  useEffect(() => {
    if (!running) { setPuffs([]); return undefined; }
    const id = setInterval(() => {
      setPuffs((prev) => {
        const moved = prev
          .map((p) => ({ ...p, x: p.x - 4, y: p.y + 1.2, r: p.r + 1.8, a: p.a - 0.05 }))
          .filter((p) => p.a > 0.02);
        if (spinning) {
          for (let i = 0; i < 3; i++) {
            moved.push({ id: puffId.current++, x: 26 + Math.random() * 30, y: 2 + Math.random() * 10,
              r: 6 + Math.random() * 6, a: 0.45 + Math.random() * 0.25 });
          }
        }
        return moved.slice(-45);
      });
    }, 40);
    return () => clearInterval(id);
  }, [running, spinning]);

  return (
    <Panel tight style={{ marginBottom: 12, overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: T.ink3, fontFamily: T.mono, marginBottom: 5, letterSpacing: 0.6 }}>
        <span>START</span><span>60 FT</span><span>1/8</span><span>1/4 MILE</span>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <LightTree phase={treePhase} />

        <div style={{
          position: 'relative', flex: 1, height: 150, borderRadius: 10, overflow: 'hidden',
          border: `1px solid ${T.line}`,
          background: `linear-gradient(180deg,${strip.sky} 0%,${strip.skyLow} 34%,${strip.horizon} 36%,${strip.ground} 62%,${strip.groundLow} 100%)`,
        }}>
          <div style={{ position: 'absolute', left: 0, right: 0, top: 42, height: 14,
            background: `linear-gradient(180deg,${horizonGlowAlpha(0.10)},transparent)` }} />
          <div style={{ position: 'absolute', left: 0, right: 0, top: 50, height: 10, background: strip.wall, borderTop: `1px solid ${strip.wallTop}` }} />
          {[...Array(16)].map((_, i) => (
            <div key={i} style={{ position: 'absolute', top: 50, height: 10, width: 2, background: strip.wallPost,
              left: `${(i * 6.6 - ((frac * 260) % 6.6))}%` }} />
          ))}
          <div style={{ position: 'absolute', left: 0, right: 0, top: 60, bottom: 0, background: strip.surface }} />
          <div style={{ position: 'absolute', left: 0, right: 0, top: 92, height: 1, background: strip.groove }} />
          {/* Moving surface texture conveys speed. */}
          {[...Array(20)].map((_, i) => (
            <div key={i} style={{
              position: 'absolute', bottom: 10, height: 2, width: 22, background: strip.texture, borderRadius: 1,
              left: `${(((i * 6) - ((frac * 340) % 6)) % 108 + 108) % 108}%`,
            }} />
          ))}
          {/* Distance boards, placed at the real fractions of the strip. */}
          {[[SIXTY_FEET_M / QUARTER_MILE_M, '60'], [0.5, '660']].map(([f, lbl]) => (
            <div key={lbl} style={{ position: 'absolute', left: `${f * 92}%`, top: 34, fontSize: 8, color: T.ink3, fontFamily: T.mono }}>{lbl}</div>
          ))}
          <div style={{ position: 'absolute', right: 4, top: 58, bottom: 6, width: 6,
            background: `repeating-linear-gradient(180deg,${strip.stripeLight} 0 5px,${strip.stripeDark} 5px 10px)` }} />

          <div style={{ position: 'absolute', bottom: 14, left: `calc(${frac * 78}% + 4px)`, transition: 'left .04s linear' }}>
            <div style={{ position: 'relative' }}>
              <Smoke puffs={puffs} />
              <div style={{ filter: mph > 100 ? 'blur(0.5px)' : 'none' }}>
                <CarSprite w={132} squat={clamp(accel / 8, 0, 1)} spinning={spinning} bodyIdx={bodyIdx} />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 9, fontFamily: T.mono, fontSize: 12.5 }}>
        <span style={{ color: T.ink, fontWeight: 700 }}>{mph.toFixed(0)}<span style={{ color: T.ink3, fontSize: 10 }}> MPH</span></span>
        <span style={{ color: spinning ? T.danger : T.ink2, fontWeight: 700 }}>{spinning ? 'WHEELSPIN' : `GEAR ${gear}`}</span>
        <span style={{ color: T.ink2 }}>{Math.round(rpm)}<span style={{ color: T.ink3, fontSize: 10 }}> RPM</span></span>
      </div>
    </Panel>
  );
}

// ============================================================
export default function EngineManagementSandbox() {
  const [appView, setAppView] = useState('start');
  const [tab, setTab] = useState('dash');
  const [engineConfig, setEngineConfig] = useState(DEFAULT_ENGINE_CONFIG);
  const [mods, setMods] = useState(DEFAULT_MODS);
  const [ve, setVe] = useState(() => computeHardwareVE(DEFAULT_ENGINE_CONFIG, DEFAULT_MODS));
  const [timing, setTiming] = useState(clone2D(DEFAULT_TIMING));
  const [afr, setAfr] = useState(clone2D(DEFAULT_AFR));
  const [turboOn, setTurboOn] = useState(false);
  const [boostCurve, setBoostCurve] = useState([...DEFAULT_BOOST]);
  const [octaneIdx, setOctaneIdx] = useState(0);
  const [injIdx, setInjIdx] = useState(0);
  const [mafScalar, setMafScalar] = useState(1.0);
  const [loadKpa, setLoadKpa] = useState(100);
  const [health, setHealth] = useState({ piston: 100, bearing: 100, valve: 100 });
  const [selection, setSelection] = useState(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [prevResult, setPrevResult] = useState(null);
  // The scores as measured on the pull that produced `result`, banked at pull time.
  const [pullScores, setPullScores] = useState(null);
  const [revealCount, setRevealCount] = useState(0);
  const [bestScore, setBestScore] = useState(0);
  const [totalScore, setTotalScore] = useState(0);
  const [pullCount, setPullCount] = useState(0);
  const [turbineIdx, setTurbineIdx] = useState(1);
  // How many of that housing are fitted. Only a preset can set this above 1 — the picker
  // below fits one turbo, so choosing from it resets the count.
  const [turbineCount, setTurbineCount] = useState(1);
  const [compressorIdx, setCompressorIdx] = useState(1);
  // Which factory preset (if any) is currently loaded stock. Cleared the moment any
  // Engine Architecture control is hand-edited, and offered as a warning prompt
  // before a loaded tune with logged pulls gets overwritten.
  const [presetId, setPresetId] = useState(null);
  const [presetPrompt, setPresetPrompt] = useState(null);
  // True once the player has hand-edited VE/spark/fuel since the last preset load
  // or reset-to-stock. This — not pull count — is what the overwrite-confirmation
  // prompt keys off; see hasTuningWork below.
  const [tablesDirty, setTablesDirty] = useState(false);
  // Pinned by diameter, not by position: adding sizes to the catalogue must not
  // silently change which pipe a new build starts with.
  const [exhaustDiaIdx, setExhaustDiaIdx] = useState(
    () => EXHAUST_DIA_OPTS.findIndex((o) => o.dia === 3.0),
  );
  const [buildSection, setBuildSection] = useState('engine');
  const [ecuInjectorCc, setEcuInjectorCc] = useState(315);
  const [tuneView, setTuneView] = useState('ve');
  const [boostSel, setBoostSel] = useState(4);
  const [dynoView, setDynoView] = useState('result');
  const [histogram, setHistogram] = useState(null);
  const [live, setLive] = useState(() => makeLiveState());
  const [throttleInput, setThrottleInput] = useState(0);
  const [dashSection, setDashSection] = useState('stats');
  const [rangeMode, setRangeMode] = useState(false);
  // CAREER. A job is a customer car with one diagnosable fault and a target; taking one
  // resets the build and applies that fault. Nothing is scripted — every job is solved by
  // reading the pull log and fixing the actual cause.
  const [activeJob, setActiveJob] = useState(null);
  const [completedJobs, setCompletedJobs] = useState([]);
  const [jobResult, setJobResult] = useState(null);
  // --- Drag strip ---
  // `dragResult` is the whole solved run; `dragT` scrubs through it for playback, so
  // what you watch is a replay of the physics rather than a second simulation of it.
  const [car, setCar] = useState({ ...DEFAULT_CAR });
  const [dragResult, setDragResult] = useState(null);
  const [dragRunning, setDragRunning] = useState(false);
  const [dragT, setDragT] = useState(0);
  const [treePhase, setTreePhase] = useState(0); // 0 idle, 1 staged, 2-4 ambers, 5 green
  const [dragSection, setDragSection] = useState('body');
  const dragTimer = useRef(null);   // playback interval
  const treeTimers = useRef([]);    // pending christmas-tree timeouts
  // Guided first run: BUILD -> TUNE -> LIVE -> DYNO, then free play (step 4).
  const [journeyStep, setJourneyStep] = useState(0);
  const revealTimer = useRef(null);
  const liveTimer = useRef(null);
  const liveCfgRef = useRef(null);
  const throttleRef = useRef(0);
  const audioRef = useRef(null);
  const [soundOn, setSoundOn] = useState(true);
  const [volume, setVolume] = useState(1);
  // null until the player runs the self-test; then 'ok' | 'blocked' | 'unavailable'.
  const [audioStatus, setAudioStatus] = useState(null);
  // A dyno pull is a sequence, not just a sweep: settle at idle, load it and sweep to
  // redline, let it spin back down on engine braking, settle again. Those bookends are
  // most of what a pull SOUNDS like, and without them the whole run is a 1.6 s blip.
  const [dynoPhase, setDynoPhase] = useState(null);
  const [dynoRpm, setDynoRpm] = useState(820);

  // Every field applyPreset() owns funnels its hand-edit path through one of these
  // two wrappers instead of sprinkling `setPresetId(null)` at each call site — a
  // wrapper is what stops the next field from being forgotten. `withPresetField`
  // covers hardware/ECU fields that only invalidate the preset label;
  // `withTableEdit` additionally flags the calibration tables as having unsaved
  // work, which is what the overwrite-confirmation prompt (hasTuningWork) keys off.
  // `applyEnginePreset` itself must NOT use these — it needs to end with `presetId`
  // SET, and routing its own writes through invalidation would race that.
  const withPresetField = (setter) => (...args) => { setter(...args); setPresetId(null); };
  const withTableEdit = (setter) => (...args) => { setter(...args); setPresetId(null); setTablesDirty(true); };

  const setEngineConfigInvalidating = withPresetField(setEngineConfig);
  const setModsInvalidating = withPresetField(setMods);
  const setTurboOnInvalidating = withPresetField(setTurboOn);
  const setBoostCurveInvalidating = withPresetField(setBoostCurve);
  // Fitting a turbine by hand fits ONE of it; the twin-turbo count belongs to a preset.
  const setTurbineIdxInvalidating = withPresetField((idx) => {
    setTurbineIdx(idx);
    setTurbineCount(1);
  });
  const setCompressorIdxInvalidating = withPresetField(setCompressorIdx);
  const setInjIdxInvalidating = withPresetField(setInjIdx);
  const setOctaneIdxInvalidating = withPresetField(setOctaneIdx);
  const setExhaustDiaIdxInvalidating = withPresetField(setExhaustDiaIdx);
  const setEcuInjectorCcInvalidating = withPresetField(setEcuInjectorCc);
  const setMafScalarInvalidating = withPresetField(setMafScalar);

  const setVeEdited = withTableEdit(setVe);
  const setTimingEdited = withTableEdit(setTiming);
  const setAfrEdited = withTableEdit(setAfr);

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

  const recalcVE = () => setVeEdited(veTruth);

  /**
   * Takes on a career job: resets the car to stock, then applies that customer's fault.
   *
   * @param {number} i index into {@link CAREER_JOBS}
   */
  const takeJob = (i) => {
    const job = CAREER_JOBS[i];
    const cfg = { ...DEFAULT_ENGINE_CONFIG };
    if (job.setup.camDuration) cfg.camDuration = job.setup.camDuration;
    if (job.setup.springRate) cfg.springRate = job.setup.springRate;
    const nextMods = { ...DEFAULT_MODS, intake: !!job.setup.intake };
    const nextTurbo = !!job.setup.turboOn;
    const hw = {
      turboOn: nextTurbo,
      turbine: nextTurbo ? turbineWithCount(TURBINE_OPTS[1], 1) : null,
      exhaustDia: EXHAUST_DIA_OPTS[exhaustDiaIdx].dia,
      fuel: OCTANE_OPTS[job.setup.octaneIdx ?? 0],
    };
    setPresetId(null);
    setEngineConfig(cfg);
    setMods(nextMods);
    setTurboOn(nextTurbo);
    setBoostCurve(job.setup.boostCurve ? [...job.setup.boostCurve] : [...DEFAULT_BOOST]);
    setOctaneIdx(job.setup.octaneIdx ?? 0);
    setInjIdx(job.setup.injIdx ?? 0);
    setEcuInjectorCc(job.setup.ecuInjectorCc ?? INJECTOR_OPTS[job.setup.injIdx ?? 0].cc);
    setTiming(clone2D(DEFAULT_TIMING));
    setAfr(clone2D(DEFAULT_AFR));
    setMafScalar(1.0);
    // A "stale VE" job hands you the OLD log against new hardware, which is the whole
    // point of it: the table is a record of what the engine used to flow.
    setVe(job.setup.staleVe
      ? computeHardwareVE(DEFAULT_ENGINE_CONFIG, DEFAULT_MODS, {
        turboOn: false, turbine: null, exhaustDia: EXHAUST_DIA_OPTS[exhaustDiaIdx].dia,
        fuel: OCTANE_OPTS[0],
      })
      : computeHardwareVE(cfg, nextMods, hw));
    setHealth({ piston: 100, bearing: 100, valve: 100 });
    setResult(null); setPrevResult(null); setHistogram(null); setJobResult(null);
    setActiveJob(i);
    changeTab('dyno');
  };

  // Every boost-curve write goes through here. Rebuilding from the RPM axis makes it
  // structurally impossible for the curve to be the wrong length or to contain a
  // non-number, which is what previously let a single edit poison the whole sim.
  const setBoostAt = (i, value) => setBoostCurveInvalidating(
    RPM.map((_, idx) => clamp(Number(idx === i ? value : boostCurve[idx]) || 0, 0, 25)),
  );
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

  const needsMafRecal = mods.intake || turboOn;
  const changeTab = (t) => {
    // Browsers only let audio start from inside a user gesture, so take every tap on the
    // nav as another chance to unlock it. Without this a player who never presses START
    // first can navigate the whole app and hear nothing.
    const a = audioRef.current;
    if (a && a.ctx.state === 'suspended') a.ctx.resume();
    setTab(t); setSelection(null);
  };

  const installMod = (key) => {
    if (mods[key]) return;
    if (key === 'intercooler') { setModsInvalidating((m) => ({ ...m, intercooler: true })); return; }
    // Fitting a part changes airflow but does NOT edit your logged VE table — the
    // VE tab will show the gap and let you accept it once you understand why.
    setModsInvalidating({ ...mods, [key]: true });
  };
  const resetToStock = () => {
    // Wipes the calibration back to a generic stock baseline — which, if a factory
    // preset was loaded, is NOT that preset's validated tables. Route every write
    // through the invalidating setters so the header stops claiming a factory
    // calibration this just deleted, and the last call pins tablesDirty back to
    // false: a reset baseline is not unsaved player work.
    setVeEdited(computeHardwareVE(engineConfig, DEFAULT_MODS, hwForVe));
    setTimingEdited(clone2D(DEFAULT_TIMING)); setAfrEdited(clone2D(DEFAULT_AFR));
    setModsInvalidating(DEFAULT_MODS); setMafScalarInvalidating(1.0);
    setTablesDirty(false);
  };
  const repairEngine = () => setHealth({ piston: 100, bearing: 100, valve: 100 });
  const setCfg = (patch) => setEngineConfigInvalidating((c) => ({ ...c, ...patch }));

  /** Whether the player has unsaved calibration work — hand-edited VE/spark/fuel —
   *  that loading a preset would silently overwrite. Tracked directly via
   *  `tablesDirty` rather than pull count: pullCount is restored from career
   *  storage on load, so it nags a returning player on an untouched default
   *  engine, and it misses a player who edited every table but never pulled. */
  const hasTuningWork = () => tablesDirty;

  const applyEnginePreset = (preset) => {
    // Deliberately writes through the RAW setters, not the invalidating wrappers
    // above — this function's whole job is to SET presetId at the end, and
    // routing its own writes through setPresetId(null) would make that order-
    // dependent on React's batching instead of explicit here.
    const p = applyPreset(preset);
    setEngineConfig(p.engineConfig);
    setMods(p.mods);
    setTurboOn(p.turboOn);
    setBoostCurve(p.boostCurve);
    setTurbineIdx(p.turbineIdx);
    setTurbineCount(p.turbineCount);
    setCompressorIdx(p.compressorIdx);
    setInjIdx(p.injIdx);
    setEcuInjectorCc(p.ecuInjectorCc);
    setOctaneIdx(p.octaneIdx);
    setExhaustDiaIdx(p.exhaustDiaIdx);
    setVe(p.ve);
    setTiming(p.timing);
    setAfr(p.afr);
    // The preset's AFR table already bakes in a correction for the MAF error that
    // the mod set implies (see factoryCalibration in src/sim/presets.js) — that
    // correction is only valid at the neutral scalar. Loading a preset while a
    // player has this dragged away from 1.0 would otherwise silently double-correct
    // the mixture the very next pull.
    setMafScalar(1.0);
    setPresetId(p.presetId);
    setSelection(null);
    setPresetPrompt(null);
    // A factory rating from the newly loaded engine must never sit next to a pull
    // logged on whatever was running before it.
    setResult(null);
    setPrevResult(null);
    setPullScores(null);
    // Fresh factory calibration is not unsaved player work.
    setTablesDirty(false);
  };

  const choosePreset = (preset) => {
    if (hasTuningWork()) setPresetPrompt(preset);
    else applyEnginePreset(preset);
  };

  const ensureAudio = () => {
    if (audioRef.current) return audioRef.current;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    try {
      audioRef.current = createEngineAudio(new Ctx());
      return audioRef.current;
    } catch { return null; }
  };

  // A deliberately obvious beep. If this is silent, the problem is the device or the
  // browser — on an iPhone the physical ring/silent switch mutes web audio even at full
  // volume — and not the engine model. Worth being able to prove.
  const testSound = () => {
    const a = ensureAudio();
    if (!a) { setAudioStatus('unavailable'); return; }
    a.ctx.resume();
    beepEngineAudio(a, { hz: 220, seconds: 0.45, gain: 0.35 });
    setAudioStatus(a.ctx.state === 'running' ? 'ok' : 'blocked');
  };

  // Persistence goes through the storage adapter, which picks whichever backend is
  // available (artifact host, localStorage, or in-memory) so career stats survive a
  // refresh wherever the app is deployed.
  // What the Engineer Score is a function of. Snapshotted at pull time so the panel can
  // say "this grade is for the build you measured, not the one on screen" — the honest
  // half of the fix. Deliberately a signature rather than a deep compare: it only has to
  // detect that something scored has moved, not what.
  const buildSignature = useMemo(() => JSON.stringify([
    engineConfig, turboOn, turboOn ? Math.max(...boostCurve) : 0,
    turbine?.size, COMPRESSOR_OPTS[compressorIdx].size,
    Number(exhaustDiaError.toFixed(3)), Math.round(dutyPreview),
    Number(engineDerived.displacementL.toFixed(4)), fuel.label, mods,
  ]), [engineConfig, turboOn, boostCurve, turbine, compressorIdx, exhaustDiaError,
       dutyPreview, engineDerived.displacementL, fuel, mods]);

  const persistCareer = (best, total, pulls) => saveCareer({ best, total, pulls });

  const doRun = () => {
    const a = ensureAudio();
    if (a && a.ctx.state === 'suspended') a.ctx.resume();
    setRunning(true);
    setRevealCount(0);
    const r = simulateSweep({
      loadKpa, ve, veTruth, timing, afr, turboOn, boostCurve, octaneBonus, octaneLabel: OCTANE_OPTS[octaneIdx].label,
      fuel, injectorCc, ecuInjectorCc, injectorLabel: INJECTOR_OPTS[injIdx].label, mods, mafScalar, derived: engineDerived,
      turbine, compressor: COMPRESSOR_OPTS[compressorIdx],
    });
    setPrevResult(result);
    setResult(r);
    setHealth((h) => ({
      piston: clamp(h.piston - r.wear.piston, 0, 100),
      bearing: clamp(h.bearing - r.wear.bearing, 0, 100),
      valve: clamp(h.valve - r.wear.valve, 0, 100),
    }));
    const ts = computeTuningScore(r);
    const es = computeEngineerScore({
      engineConfig, turboOn, peakBoostPsi: turboOn ? Math.max(...boostCurve) : 0,
      turbine, compressor: COMPRESSOR_OPTS[compressorIdx],
      exhaustDiaError, dutyPreview, displacementL: engineDerived.displacementL, fuel, mods,
    });
    const pull = computePullScore({ peakHp: r.peakHp, peakTq: r.peakTq, tuningScore: ts.score, engineerScore: es.score });
    // A career job is graded against the pull that was just measured, not against the
    // build as it stands — same rule as the scores themselves.
    if (activeJob != null) {
      const passed = CAREER_JOBS[activeJob].goal(r, { tuningScore: ts.score, engineerScore: es.score });
      setJobResult(passed ? 'pass' : 'fail');
      if (passed && !completedJobs.includes(activeJob)) setCompletedJobs((c) => [...c, activeJob]);
    }
    const nextBest = Math.max(bestScore, pull);
    const nextTotal = totalScore + pull;
    const nextPulls = pullCount + 1;
    // Whether THIS run beat the standing best, decided against the best as it stood
    // BEFORE this pull was banked. Reading it back off `bestScore` afterwards always
    // says yes, because by then this pull is the best — which is how the old NEW BEST
    // badge came to fire on every pull, and on builds that had never been run at all.
    const wasBest = pull > bestScore;
    setBestScore(nextBest); setTotalScore(nextTotal); setPullCount(nextPulls);
    persistCareer(nextBest, nextTotal, nextPulls);
    // Bank the scores this pull actually produced, with the build they were measured on.
    setPullScores({ tuning: ts, engineer: es, pull, wasBest, signature: buildSignature });
    // ---- The pull, as a sequence -----------------------------------------------
    //   settle     hold idle, so you hear it running before it is loaded
    //   sweep      load it and take it to redline, drawing the graph as it goes
    //   spooldown  throttle shut; revs fall on the engine's own friction and pumping
    //   rest       settle at idle again, and the pull is over
    // The bookends are not decoration. A pull that teleports from nothing to redline and
    // stops gives the ear no reference for what changed, and never lets you hear the
    // overrun — which is where a boosted engine vents.
    const total = r.points.length;
    const SETTLE_MS = 1400, SWEEP_MS = 1900, DOWN_MS = 2100, REST_MS = 900;
    const idleRpm = 820;
    const topRpm = r.points[total - 1].rpm;
    const t0 = Date.now();
    setDynoPhase('settle');
    setDynoRpm(idleRpm);
    setRevealCount(0);

    revealTimer.current = setInterval(() => {
      const el = Date.now() - t0;
      if (el < SETTLE_MS) {
        setDynoPhase('settle');
        setDynoRpm(idleRpm + Math.sin(el / 90) * 14);
      } else if (el < SETTLE_MS + SWEEP_MS) {
        const f = (el - SETTLE_MS) / SWEEP_MS;
        const idx = Math.min(total, Math.round(f * total));
        setDynoPhase('sweep');
        setRevealCount(idx);
        setDynoRpm(r.points[Math.min(total - 1, Math.max(0, idx - 1))].rpm);
      } else if (el < SETTLE_MS + SWEEP_MS + DOWN_MS) {
        // Engine braking: fast at first, easing as friction and pumping fall away with
        // engine speed.
        const f = (el - SETTLE_MS - SWEEP_MS) / DOWN_MS;
        setDynoPhase('spooldown');
        setRevealCount(total);
        setDynoRpm(idleRpm + (topRpm - idleRpm) * Math.pow(1 - f, 2.2));
      } else if (el < SETTLE_MS + SWEEP_MS + DOWN_MS + REST_MS) {
        setDynoPhase('rest');
        setDynoRpm(idleRpm + Math.sin(el / 90) * 12);
      } else {
        clearInterval(revealTimer.current);
        setDynoPhase(null);
        setRunning(false);
      }
    }, 55);
  };
  useEffect(() => () => { if (revealTimer.current) clearInterval(revealTimer.current); }, []);

  // The drag run needs a torque curve, and there is no torque curve until the engine
  // has actually been measured — so a pull is a hard prerequisite, exactly as in life.
  const torqueCurveNm = useMemo(() => (result ? torqueCurveFromSweep(result) : null), [result]);

  const runDrag = () => {
    if (!torqueCurveNm || dragRunning) return;
    const a = ensureAudio();
    if (a && a.ctx.state === 'suspended') a.ctx.resume();

    // Solve the whole run first, then play it back. Doing it this way means the
    // animation can never disagree with the time slip.
    const res = simulateDragRun({
      car, torqueCurveNm,
      redline: engineDerived.redline,
      displacementL: engineDerived.displacementL,
      peakHp: result.peakHp,
    });
    setDragResult(res);
    setDragT(0);

    const beep = (freq, dur, vol) => {
      const au = audioRef.current;
      if (!au || !soundOn) return;
      const t0 = au.ctx.currentTime;
      const o = au.ctx.createOscillator(); o.type = 'sine'; o.frequency.value = freq;
      const g = au.ctx.createGain(); g.gain.value = 0;
      o.connect(g); g.connect(au.ctx.destination);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.start(t0); o.stop(t0 + dur + 0.05);
    };

    // A sportsman tree: staged, then three ambers half a second apart, then green.
    const GREEN_MS = 1900;
    setTreePhase(1);
    treeTimers.current.forEach(clearTimeout);
    treeTimers.current = [
      setTimeout(() => { setTreePhase(2); beep(660, 0.18, 0.08); }, 400),
      setTimeout(() => { setTreePhase(3); beep(660, 0.18, 0.08); }, 900),
      setTimeout(() => { setTreePhase(4); beep(660, 0.18, 0.08); }, 1400),
      setTimeout(() => {
        setTreePhase(5); beep(990, 0.35, 0.10);
        setDragRunning(true);
        const t0 = Date.now();
        clearInterval(dragTimer.current);
        dragTimer.current = setInterval(() => {
          const el = (Date.now() - t0) / 1000;
          setDragT(el);
          // Hold on the finish for a moment so the time slip is readable.
          if (el > res.et + 1.2) {
            clearInterval(dragTimer.current);
            setDragRunning(false);
            setTreePhase(0);
          }
        }, 40);
      }, GREEN_MS),
    ];
  };
  useEffect(() => () => {
    clearInterval(dragTimer.current);
    treeTimers.current.forEach(clearTimeout);
  }, []);

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
  useEffect(() => {
    liveTimer.current = setInterval(() => {
      setLive((prev) => (prev.running || prev.cranking || prev.rpm > 1)
        ? liveStep(prev, 0.05, { throttle: throttleRef.current, load: 0 }, liveCfgRef.current)
        : prev);
    }, 50);
    return () => clearInterval(liveTimer.current);
  }, []);

  // ---- Engine audio -------------------------------------------------------
  // Synthesised from the firing frequency: a 4-stroke fires cyl/2 times per
  // crank revolution, so pitch tracks RPM and cylinder count exactly. A lowpass
  // that opens with throttle gives the "load" character — closed throttle is
  // muffled, wide open is bright and raspy.
  const startEngine = () => {
    const a = ensureAudio();
    if (a && a.ctx.state === 'suspended') a.ctx.resume();
    setLive((p) => ({ ...p, cranking: true }));
  };
  const stopEngine = () => {
    setThrottleInput(0); throttleRef.current = 0;
    setLive((p) => ({ ...p, running: false, cranking: false }));
  };

  // Safety net: if a pointerup/cancel is missed (scroll, app switch, lost focus)
  // the throttle must still close, or the engine would hang at redline.
  useEffect(() => {
    const release = () => { setThrottleInput(0); throttleRef.current = 0; };
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
  }, []);

  // Career stats persist across sessions so the high score is worth chasing.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const c = await loadCareer();
      if (cancelled) return;
      setBestScore(c.best); setTotalScore(c.total); setPullCount(c.pulls);
    })();
    return () => { cancelled = true; };
  }, []);

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
    setHistogram(cells.map((row) => row.map((c) => (c.n ? c.sum / c.n : null))));
  };
  const applyHistogram = () => {
    if (!histogram) return;
    setVeEdited((prev) => prev.map((row, ri) => row.map((v, ci) => {
      const e = histogram[ri][ci];
      return e == null ? v : Number(clamp(v * (1 + e / 100), 10, 130).toFixed(1));
    })));
    setHistogram(null);
  };

  // During a pull the RPM comes from the pull SEQUENCE, not from the point being drawn:
  // the settle and spooldown bookends have no measured point behind them.
  const currentRpm = running
    ? dynoRpm
    : (result ? (result.points[Math.min(revealCount, result.points.length - 1)]?.rpm ?? 1500) : 1500);
  // A SCORE IS A MEASUREMENT, SO IT IS TAKEN ONCE AND KEPT.
  //
  // This used to be a memo that recomputed the Engineer and Pull scores from whatever
  // hardware was selected RIGHT NOW, against the last pull's dyno output. Change a turbo
  // after a pull and the old run was re-graded as though it had been made on the new
  // build — a number the engine never produced, on a dyno session that never happened.
  // Worse, the Pull Score moved with it and could climb past `bestScore` without anyone
  // running anything, lighting up NEW BEST for a figure that was never banked.
  //
  // So `doRun` banks the scores it actually computed, and this holds them unchanged. The
  // app's whole method is change one thing, MEASURE, revert; a score that moves without a
  // measurement contradicts the thing it is teaching.
  const scores = pullScores;

  // True when the build has moved since the pull these scores came from.
  const scoresStale = !!scores && scores.signature !== buildSignature;

  // Drive the audio from whichever engine is actually turning — and only while the
  // relevant page is open, so sound stops the moment you navigate away.
  //
  // Nothing here decides what the engine sounds like. `acousticDrive` turns the operating
  // point into the physical properties of the exhaust note, and `updateEngineAudio`
  // renders them; this effect only says which engine is running and how hard.
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;

    const onDyno = tab === 'dyno' && running && result;
    // LIVE is its own screen now, so the live engine is audible on it rather than on HOME.
    const onLive = tab === 'live' && (live.running || live.cranking);
    // The drag run drives the same engine sound: RPM sweeps within each gear and drops
    // on every shift, so the whole pass is audible.
    const onDrag = tab === 'drag' && dragRunning && dragResult;
    const dragPt = onDrag
      ? (dragResult.trace.find((p) => p.t >= dragT) || dragResult.trace[dragResult.trace.length - 1])
      : null;
    const audible = Boolean((onDyno || onLive || onDrag) && soundOn);

    const rpm = onDrag ? (dragPt?.rpm ?? 0) : onDyno ? currentRpm : live.rpm;
    const dynoPt = onDyno ? result.points[Math.min(revealCount, result.points.length - 1)] : null;
    const point = onDyno ? dynoPt : (live.running ? live.live : null);
    // The driver's actual throttle position is what shapes the note, which is why a car
    // being feathered off a spinning tyre sounds different from one that hooked.
    //
    // Through a pull it comes from the pull SEQUENCE: the sweep is wide open, the bookends
    // are not, and the overrun is a closed throttle — which is what makes the blow-off fire
    // when the pull ends, exactly where you would hear it on a real dyno.
    const load = onDrag
      ? (dragPt?.throttle ?? 1)
      : onDyno
        ? (dynoPhase === 'sweep' ? 1 : dynoPhase === 'spooldown' ? 0.04 : 0.10)
        : clamp((live.effThrottle ?? 0) / 100, 0, 1);
    const cut = onLive
      ? live.fuelCut
      : onDrag ? !!dragPt?.limiter : Boolean(onDyno && dynoPhase === 'spooldown');

    const drive = acousticDrive({
      rpm, derived: engineDerived, point, configuration: engineConfig.configuration,
      pipeDiaIn: EXHAUST_DIA_OPTS[exhaustDiaIdx].dia, turboOn,
      compressor: COMPRESSOR_OPTS[compressorIdx],
      // The sweep only ever measures wide-open points, so the idle and overrun either
      // side of it have to borrow the nearest one and scale it by throttle.
      throttle: onDyno ? load : 1,
      // No injectors, no combustion, so the cylinder reaches the exhaust valve at motored
      // pressure. The renderer does not need to know what a rev limiter is.
      fuelCut: cut,
    });
    const frame = {
      drive,
      // The exhaust system as tubes, for the waveguide. Everything the player can change
      // about the hardware arrives here: cylinder count and layout set the firing order
      // and how many primaries meet at each collector, displacement sets their length and
      // bore, the pipe menu sets the tailpipe, and the gas temperature the cycle computed
      // sets the speed of sound that every one of those lengths is divided by.
      geometry: exhaustGeometry({
        displacementL: engineDerived.displacementL, cyl: engineDerived.cyl,
        bore: engineConfig.bore, compression: engineConfig.compression,
        configuration: engineConfig.configuration,
        pipeDiaIn: EXHAUST_DIA_OPTS[exhaustDiaIdx].dia, gasTempK: drive.gasTempK,
        headers: Boolean(mods.headers), turboFitted: Boolean(turboOn),
      }),
      rpm,
      configuration: engineConfig.configuration,
      load,
      audible,
      cut,
      cranking: Boolean(onLive && live.cranking),
      pipeDiaIn: EXHAUST_DIA_OPTS[exhaustDiaIdx].dia,
      openExhaust: Boolean(mods.exhaust || mods.headers),
      intakeFitted: Boolean(mods.intake),
      // Boost only counts while the throttle is open; dropping it on the overrun is what
      // the renderer watches for to vent.
      boostPsi: onDrag || (onDyno && dynoPhase !== 'sweep') ? 0 : (point?.boostPsi ?? 0),
      volume,
    };

    // One call. The crank now turns inside the audio worklet at sample resolution, so
    // nothing about the exhaust's timing depends on how often React gets around to this.
    updateEngineAudio(a, frame);
  }, [live.rpm, live.running, live.cranking, live.effThrottle, live.fuelCut, live.live, soundOn,
      engineDerived, engineConfig.configuration, engineConfig.bore, engineConfig.compression,
      exhaustDiaIdx, compressorIdx,
      mods.intake, mods.exhaust, mods.headers, turboOn, volume, dynoPhase,
      running, currentRpm, revealCount, result, tab, dragRunning, dragResult, dragT]);

  // HARD SILENCE. Scheduled ramps (a blow-off, a flutter burst) can leave a gain parked
  // open if a run ends mid-ramp, so stopping is its own operation rather than something
  // the smoothed targets above eventually get around to.
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const sounding = (tab === 'live' && (live.running || live.cranking))
      || (tab === 'dyno' && running)
      || (tab === 'drag' && dragRunning);
    if (sounding && soundOn) return;
    silenceEngineAudio(a);
  }, [tab, live.running, live.cranking, running, dragRunning, soundOn]);

  // Hard-stop audio on unmount or when the tab changes away from a sounding page.
  useEffect(() => {
    return () => {
      const a = audioRef.current;
      if (a) { try { silenceEngineAudio(a); } catch { /* noop */ } }
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
  // Nav follows the real working order: design it, calibrate it, HEAR IT RUN, then
  // measure it. The live engine used to be a collapsed section on HOME, several taps
  // down and easy to never find — which is a poor place for the one screen that shows
  // your calibration actually running.
  const TABS = [
    { id: 'dash', label: 'HOME', icon: Gauge },
    { id: 'build', label: 'BUILD', icon: Settings },
    { id: 'tune', label: 'TUNE', icon: Grid3x3 },
    { id: 'live', label: 'LIVE', icon: Flame },
    { id: 'dyno', label: 'DYNO', icon: Activity },
    { id: 'drag', label: 'DRAG', icon: Flag },
  ];
  const TUNE_VIEWS = [
    { id: 've', label: 'AIR', icon: Grid3x3 },
    { id: 'timing', label: 'SPARK', icon: Zap },
    { id: 'afr', label: 'FUEL', icon: Droplets },
    { id: 'ecu', label: 'ECU', icon: Fuel },
  ];
  const gridProps = { selection, setSelection, rangeMode };

  // Shown above each table. Single mode edits one cell; range mode lets you tap two
  // corners and move everything between them at once, which is how a band of cells
  // actually gets corrected.
  const SelectModeBar = () => (
    <div style={{ display: 'flex', gap: 7, alignItems: 'center', marginBottom: 8 }}>
      {[[false, 'SINGLE CELL'], [true, 'SELECT RANGE']].map(([mode, label]) => (
        <button key={label} onClick={() => { setRangeMode(mode); setSelection(null); }} style={{
          flex: 1, padding: '9px 0', borderRadius: 8, fontWeight: 800, fontSize: 11,
          border: `1px solid ${rangeMode === mode ? T.acc : T.line}`,
          background: rangeMode === mode ? T.accBg : T.panel2,
          color: rangeMode === mode ? T.accInk : T.ink2,
        }}>{label}</button>
      ))}
      <button
        onClick={() => setSelection({
          type: 'range', r1: 0, c1: 0, r2: LOAD.length - 1, c2: RPM.length - 1, complete: true,
        })}
        style={{
          padding: '9px 12px', borderRadius: 8, fontWeight: 800, fontSize: 11,
          border: `1px solid ${T.line}`, background: T.panel2, color: T.ink2,
        }}
      >ALL</button>
    </div>
  );

  if (appView === 'start') {
    return (
      <StartScreen
        onCareer={() => { setAppView('app'); setTab('dash'); }}
        onStart={() => { setAppView('app'); setTab('build'); }}
        onTutorial={() => setAppView('tutorial')}
        version={BUILD_VERSION}
        dial={<DialMark size={92} pct={0.62} />}
      />
    );
  }
  if (appView === 'tutorial') {
    return (
      <TutorialScreen
        steps={TUTORIAL_STEPS}
        onDone={() => { setAppView('app'); setTab('build'); setJourneyStep(0); }}
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
            <button onClick={() => setAppView('tutorial')} title="Tutorial" style={{ background: T.panel2, border: `1px solid ${T.line}`, borderRadius: 9, padding: 9, color: T.ink2 }}>
              <Info size={16} />
            </button>
            <button onClick={repairEngine} title="Repair engine" style={{ background: T.panel2, border: `1px solid ${T.line}`, borderRadius: 9, padding: 9, color: T.ink2 }}>
              <Wrench size={16} />
            </button>
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
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        {/* ---------- HOME: live engine, career stats, health, learning ---------- */}
        {tab === 'dash' && (
          <div style={{ padding: 16 }}>
            <BuildSection
              active={dashSection === 'jobs'} onClick={() => setDashSection(dashSection === 'jobs' ? null : 'jobs')}
              icon={Wrench} label="Customer Cars"
              sub={`${completedJobs.length}/${CAREER_JOBS.length} completed`}
            >
              <div style={{ fontSize: 12, color: T.ink2, lineHeight: 1.55, marginBottom: 10 }}>
                Each car comes in with one real fault. Nothing is scripted — take a job, run a
                pull, and read the log. The cause is always something the simulation genuinely
                models, and the tables are what fix it.
              </div>

              {activeJob != null && (
                <Panel style={{ marginBottom: 12, borderColor: T.acc }}>
                  <div style={{ fontSize: 10, letterSpacing: 1, color: T.accInk, fontWeight: 800 }}>CURRENT JOB</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: T.ink, marginTop: 3 }}>{CAREER_JOBS[activeJob].title}</div>
                  <div style={{ fontSize: 12, color: T.ink2, lineHeight: 1.55, marginTop: 7 }}>{CAREER_JOBS[activeJob].brief}</div>
                  <div style={{ fontSize: 12, color: T.accInk, marginTop: 8, fontWeight: 700 }}>Target: {CAREER_JOBS[activeJob].target}</div>
                  <button onClick={() => { setActiveJob(null); setJobResult(null); }} style={{
                    marginTop: 10, width: '100%', padding: '9px 0', borderRadius: 8,
                    border: `1px solid ${T.line}`, background: T.panel, color: T.ink2, fontWeight: 700, fontSize: 11.5,
                  }}>ABANDON JOB</button>
                </Panel>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {CAREER_JOBS.map((j, i) => {
                  const done = completedJobs.includes(i);
                  const current = activeJob === i;
                  return (
                    <button key={j.id} onClick={() => takeJob(i)} style={{
                      textAlign: 'left', padding: '11px 13px', borderRadius: 10,
                      border: `1px solid ${current ? T.acc : done ? T.okLine : T.line}`,
                      background: current ? T.accBg : done ? T.okBg : T.panel2,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 700, fontSize: 13, color: done ? T.ok : T.ink }}>{j.title}</span>
                        <span style={{ fontSize: 10, fontWeight: 800, flexShrink: 0, color: done ? T.ok : current ? T.accInk : T.ink3 }}>
                          {done ? 'COMPLETE' : current ? 'ACTIVE' : 'TAKE JOB'}
                        </span>
                      </div>
                      <div style={{ fontSize: 11.5, color: T.ink2, marginTop: 4, lineHeight: 1.45 }}>{j.customer}</div>
                    </button>
                  );
                })}
              </div>
            </BuildSection>

            <BuildSection
              active={dashSection === 'stats'} onClick={() => setDashSection(dashSection === 'stats' ? null : 'stats')}
              icon={Trophy} label="Career & Last Pull"
              sub={result ? `Best ${bestScore} · ${pullCount} pulls logged` : `${pullCount} pulls logged`}
            >
              <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                <StatTile label="BEST PULL" value={bestScore} color={T.accInk} />
                <StatTile label="CAREER TOTAL" value={totalScore} color={T.cyan} />
                <StatTile label="PULLS" value={pullCount} color={T.ink} />
              </div>
              {result && scores ? (
                <>
                  <div style={{ fontSize: 10, letterSpacing: 1, color: scoresStale ? T.warnInk : T.ink3, fontWeight: 800, marginBottom: 6 }}>
                    {scoresStale ? 'LAST PULL · BUILD HAS CHANGED SINCE' : 'LAST PULL'}
                  </div>
                  <div style={{ display: 'flex', gap: 10, marginBottom: 10, opacity: scoresStale ? 0.55 : 1 }}>
                    <StatTile label="PEAK POWER" value={result.peakHp} unit="whp" color={T.accInk} />
                    <StatTile label="PEAK TORQUE" value={result.peakTq} unit="lb-ft" color={T.cyan} />
                  </div>
                  <div style={{ display: 'flex', gap: 10, opacity: scoresStale ? 0.55 : 1 }}>
                    <StatTile label="PULL SCORE" value={scores.pull} color={T.accInk} />
                    <StatTile label="TUNING" value={scores.tuning.score} color={statusColor(scores.tuning.score)} />
                    <StatTile label="ENGINEER" value={scores.engineer.score} color={statusColor(scores.engineer.score)} />
                  </div>
                </>
              ) : <Note>No dyno pull logged yet — head to DYNO and run one.</Note>}
            </BuildSection>

            <BuildSection
              active={dashSection === 'health'} onClick={() => setDashSection(dashSection === 'health' ? null : 'health')}
              icon={Wrench} label="Engine Health"
              sub={`${Math.round(overallHealth)}% overall`}
            >
              <Panel>
                <HealthBar label="PISTON / RINGS · knock, detonation" value={health.piston} />
                <HealthBar label="BEARINGS · sustained cylinder pressure" value={health.bearing} />
                <HealthBar label="VALVES · lean-under-boost heat" value={health.valve} />
              </Panel>
              {needsMafRecal && <Note tone="warn">Your intake and/or turbo plumbing changed the MAF reading — head to <b>FUEL</b> to rescale it before your next pull.</Note>}
            </BuildSection>

            <BuildSection
              active={dashSection === 'learn'} onClick={() => setDashSection(dashSection === 'learn' ? null : 'learn')}
              icon={BookOpen} label="Learn How It Works"
              sub="Plain-language guide to engine tuning"
            >
              <div style={{ fontSize: 12, color: T.ink3, marginBottom: 10, lineHeight: 1.5 }}>Read in order. Each explains a piece of what the live engine is doing right now.</div>

              <div style={{ fontSize: 11, letterSpacing: 1, color: T.accInk, fontWeight: 800, margin: '4px 0 8px' }}>PART 1 · FUNDAMENTALS</div>

              <ExpandableInfo title="1. The whole thing in one paragraph">
                An engine is an air pump. However much air it swallows decides how much fuel can be burned, and burning fuel is what makes power. The ECU's entire job is to measure the air, add the right amount of fuel, and light it at the right moment. Tuning is adjusting those last two decisions.
                <br /><br />Everything else in this app — cams, turbos, exhaust diameter, compression — exists to change how much air gets in, or how much of that fuel's energy you can safely extract.
              </ExpandableInfo>

              <ExpandableInfo title="2. Volumetric efficiency — the master number">
                VE is how completely a cylinder fills compared to its own swept volume. At 100% VE the cylinder takes in exactly its displacement worth of air at the pressure available. Naturally aspirated engines typically peak around 85–100%; the peak sits at the RPM where the intake and exhaust tuning line up best, which is also where peak torque lands.
                <br /><br />VE falls off at high RPM because there simply is not enough time to fill the cylinder, and it falls at very low RPM because gas velocity is too low to help. That curve is the shape of your torque curve.
                <br /><br /><b style={{ color: T.ink }}>Every hardware choice on BUILD moves this table</b> — cam duration slides the peak up or down the RPM range, headers and exhaust add flow up top, bore/stroke ratio biases the whole curve. That is why VE is where hardware becomes visible.
              </ExpandableInfo>

              <ExpandableInfo title="3. Lambda — the only mixture number that matters">
                Gasoline burns completely at about 14.7 parts air to 1 part fuel. Divide any AFR by its fuel's stoichiometric ratio and you get <b style={{ color: T.ink }}>lambda</b>: 1.00 is exactly complete combustion, below 1 is rich, above 1 is lean.
                <br /><br />Lambda matters because it means the same thing on every fuel. E85 is stoichiometric at about 9.8:1, so 12.5:1 means something completely different on E85 than on pump gas — but lambda 0.85 is lambda 0.85 on both.
                <br /><br />Best power is slightly rich: around <b style={{ color: T.ink }}>lambda 0.87</b> naturally aspirated, and richer still under boost — near 0.83 — because the extra fuel evaporating cools the charge and buys knock margin. Leaner than that under load and you lose power while raising both knock risk and exhaust temperature.
              </ExpandableInfo>

              <ExpandableInfo title="4. Why timing makes torque, and where it stops">
                Fuel does not explode instantly — it burns over a few milliseconds. So the spark fires <i>before</i> top dead center, timed so peak cylinder pressure arrives around 16° after TDC, where the crank has the best leverage.
                <br /><br />Too retarded and you are still burning while the piston runs away: wasted energy, hot exhaust. Too advanced and pressure peaks while the piston is still rising, fighting the crank and building the heat and pressure that cause knock. The best point is <b style={{ color: T.ink }}>MBT</b> — minimum spark for best torque. Past MBT you gain almost nothing and risk everything.
                <br /><br />MBT moves: higher RPM needs more advance because there is less time for the burn; higher load needs less because the denser charge burns faster.
              </ExpandableInfo>

              <ExpandableInfo title="5. Knock — what actually destroys engines">
                Knock is the end gas — the mixture farthest from the spark plug — igniting on its own from heat and pressure before the flame front reaches it. Two flame fronts collide and the pressure spike hammers the piston and ring lands.
                <br /><br />It is driven by <b style={{ color: T.ink }}>trapped charge mass</b>, not just boost: more air in the cylinder means higher peak pressure. That is why a big cam that breathes better also needs a little less timing, and why the same tune that is safe at part throttle knocks at wide open.
                <br /><br />What makes it worse: more timing, more boost, more compression, hotter intake air, leaner mixture, lower octane. What buys margin: higher octane, richer mixture, cooler charge (intercooler), aluminium head, less compression.
                <br /><br /><b style={{ color: T.ink }}>How much is too much?</b> Tuners treat anything sustained above about 2° of retard as damaging, not as an operating point. Zero is the target.
              </ExpandableInfo>

              <div style={{ fontSize: 11, letterSpacing: 1, color: T.accInk, fontWeight: 800, margin: '14px 0 8px' }}>PART 2 · WHAT THE ECU CALCULATES</div>
              <ExpandableInfo title="Symbol key — plain-English version">
                Read this once and the formulas below stop looking like maths and start looking like a description of what the engine is doing.
                <br /><br />
                <b style={{ color: T.accInk }}>AIR SIDE</b><br />
                <b style={{ fontFamily: T.mono, color: T.cyan, fontSize: 11.5 }}>MAP</b> — manifold absolute pressure. <i>How hard the air is being pushed toward the cylinder.</i> ~101 kPa is atmospheric; ~20-30 kPa at idle (the throttle is shut so the engine pulls vacuum); above 101 means a turbo is pushing. Formulas need it in pascals, so kPa × 1000.<br /><br />
                <b style={{ fontFamily: T.mono, color: T.cyan, fontSize: 11.5 }}>T</b> — charge temperature in <b style={{ color: T.ink }}>kelvin</b>, not celsius. Add 273.15 to your °C. It must be absolute because at 0 K a gas has zero volume; celsius has no such meaning and the formula would break.<br /><br />
                <b style={{ fontFamily: T.mono, color: T.cyan, fontSize: 11.5 }}>R</b> — gas constant for air, 287 J/(kg·K). <i>A property of air itself.</i> Never a tuning value; it is the same on every engine on earth.<br /><br />
                <b style={{ fontFamily: T.mono, color: T.cyan, fontSize: 11.5 }}>ρ</b> (rho) — air density in kg/m³. <i>How much air is actually packed into a given space.</i> Cold dense air = more oxygen = more possible power. This is why the same car makes more power on a cold night.<br /><br />
                <b style={{ fontFamily: T.mono, color: T.cyan, fontSize: 11.5 }}>VE</b> — volumetric efficiency, as a fraction. <i>How good the engine is at filling its own cylinders.</i> A 95% cell means the cylinder took in 95% of what its volume could theoretically hold at that pressure.<br /><br />
                <b style={{ fontFamily: T.mono, color: T.cyan, fontSize: 11.5 }}>V_cyl</b> — swept volume of ONE cylinder in m³ (total displacement ÷ number of cylinders). <b style={{ fontFamily: T.mono, color: T.cyan, fontSize: 11.5 }}>Vd</b> — the whole engine's displacement in m³. A 3.5 L engine is 0.0035 m³.
                <br /><br /><b style={{ color: T.accInk }}>FUEL SIDE</b><br />
                <b style={{ fontFamily: T.mono, color: T.cyan, fontSize: 11.5 }}>stoichRatio</b> — the air:fuel mass ratio at which fuel and oxygen exactly consume each other. <i>A chemical property of the fuel, not a choice.</i> 14.7:1 for gasoline, 9.8:1 for E85.<br /><br />
                <b style={{ fontFamily: T.mono, color: T.cyan, fontSize: 11.5 }}>λ</b> (lambda) — measured AFR ÷ that fuel's stoichRatio. <i>How rich or lean you are, expressed so it means the same thing on any fuel.</i> 1.00 = exactly balanced, 0.85 = about 18% more fuel than strictly needed (rich, and where power lives), 1.10 = lean.<br /><br />
                <b style={{ fontFamily: T.mono, color: T.cyan, fontSize: 11.5 }}>LHV</b> — lower heating value, J/kg. <i>How much energy is in a kilogram of the fuel.</i> Gasoline ~44 MJ/kg, E85 ~29.2 MJ/kg. E85 has less energy per kg but you burn far more kg, which is why power comes out similar.<br /><br />
                <b style={{ fontFamily: T.mono, color: T.cyan, fontSize: 11.5 }}>PW</b> — injector pulse width, milliseconds. <i>How long the injector is held open.</i> The ECU does not command fuel; it commands time.
                <br /><br /><b style={{ color: T.accInk }}>OUTPUT SIDE</b><br />
                <b style={{ fontFamily: T.mono, color: T.cyan, fontSize: 11.5 }}>CR</b> — compression ratio, e.g. 10.3 means the mixture is squeezed into 1/10.3 of its original volume.<br /><br />
                <b style={{ fontFamily: T.mono, color: T.cyan, fontSize: 11.5 }}>η</b> (eta) — thermal efficiency, a fraction between 0 and 1. <i>The share of the fuel's chemical energy that becomes useful work instead of heat out the exhaust.</i> Around 0.35 is typical; most of the fuel's energy is genuinely wasted as heat.<br /><br />
                <b style={{ fontFamily: T.mono, color: T.cyan, fontSize: 11.5 }}>MEP</b> — mean effective pressure. <i>The single average pressure that, applied to the piston for one stroke, would do the same work the real varying pressure does.</i> It is a way of comparing engines of different sizes fairly, and it comes in three flavours:<br />
                &nbsp;&nbsp;<b style={{ fontFamily: T.mono, color: T.cyan, fontSize: 11.5 }}>IMEP</b> what combustion produced on the piston<br />
                &nbsp;&nbsp;<b style={{ fontFamily: T.mono, color: T.cyan, fontSize: 11.5 }}>FMEP</b> what the engine spends on itself (rubbing friction, pumping air past a closed throttle, compressing valve springs)<br />
                &nbsp;&nbsp;<b style={{ fontFamily: T.mono, color: T.cyan, fontSize: 11.5 }}>BMEP</b> what is left and reaches the crank = IMEP − FMEP<br />
                A healthy naturally aspirated engine peaks around 11-13 bar BMEP. Below zero means the engine cannot even overcome its own losses — which is exactly what engine braking is.<br /><br />
                <b style={{ fontFamily: T.mono, color: T.cyan, fontSize: 11.5 }}>MBT</b> — minimum spark advance for best torque. <i>The least amount of advance that still makes maximum power.</i> "Minimum" matters: past MBT you gain nothing and only add knock risk.
                <br /><br /><b style={{ color: T.accInk }}>TWO CONSTANTS THAT LOOK ARBITRARY</b><br />
                <b style={{ fontFamily: T.mono, color: T.cyan, fontSize: 11.5 }}>4π</b> in the torque formula: a four-stroke fires once every <b style={{ color: T.ink }}>two</b> crank revolutions. Work per cycle is MEP × Vd, and two revolutions is 4π radians, so torque = work ÷ angle = MEP × Vd ÷ 4π. A two-stroke fires every revolution and uses 2π.<br /><br />
                <b style={{ fontFamily: T.mono, color: T.cyan, fontSize: 11.5 }}>120000</b> in the duty cycle formula: one injection per two revolutions. Two revolutions at N rpm takes 2 ÷ (N/60) seconds = 120/N seconds = <b style={{ color: T.ink }}>120000/N milliseconds</b>. At 7500 rpm that is 16 ms — the entire time budget the injector has.
              </ExpandableInfo>

              <ExpandableInfo title="6. The control loop, in order">
                Thousands of times a minute, the ECU runs the same sequence:
                <br /><br />read sensors → calculate cylinder air mass → decide open or closed loop → work out required fuel mass → convert that to an injector pulse width → apply fuel trims → look up ignition timing → check for knock → retard if needed → fire injectors and coils → update learned values.
                <br /><br />Everything you edit in this app is one of the lookups inside that loop. The ECU is not deciding anything creative — it is doing arithmetic against your tables, very fast.
              </ExpandableInfo>

              <ExpandableInfo title="7. Step 1 — how much air is in the cylinder?">
                This is the ideal gas law, and it is the foundation of every speed-density calculation:
                <br /><br /><span style={{ fontFamily: T.mono, color: T.cyan, fontSize: 11.5 }}>ρ = MAP ÷ (R × T)</span><br />
                <span style={{ fontFamily: T.mono, color: T.cyan, fontSize: 11.5 }}>airCharge = VE × V_cylinder × ρ</span>
                <br /><br />MAP is manifold pressure (about 101 kPa at wide open naturally aspirated, higher with boost, down to ~20 kPa at idle). R is the gas constant for air, 287 J/(kg·K). T is charge temperature.
                <br /><br />Two consequences worth internalising. <b style={{ color: T.ink }}>Boost raises MAP</b>, so it directly multiplies air mass. And <b style={{ color: T.ink }}>compressing air heats it</b>, which lowers density and gives some of that gain back — which is the entire reason intercoolers exist. You can watch both in the datalog's MAP and IAT columns.
              </ExpandableInfo>

              <ExpandableInfo title="8. Step 2 — how much fuel does that need?">
                Fuel mass follows directly from air mass and your lambda target:
                <br /><br /><span style={{ fontFamily: T.mono, color: T.cyan, fontSize: 11.5 }}>fuelMass = airCharge ÷ (λ × stoichRatio)</span>
                <br /><br />Nothing is fudged here. Because E85's stoichiometric ratio is 9.8 instead of 14.7, the same lambda target automatically demands about 1.5× the fuel mass — it falls straight out of the chemistry, which is why E85 needs a much bigger fuel system for the same power.
              </ExpandableInfo>

              <ExpandableInfo title="9. Step 3 — pulse width, and the hard time limit">
                The ECU never commands "fuel" — it commands a number of milliseconds. That comes from the required fuel mass and the injector's flow rating, plus deadtime (the ~1 ms an injector takes to physically open):
                <br /><br /><span style={{ fontFamily: T.mono, color: T.cyan, fontSize: 11.5 }}>PW = fuelMass ÷ (injectorCC × density ÷ 60000) + deadtime</span><br />
                <span style={{ fontFamily: T.mono, color: T.cyan, fontSize: 11.5 }}>cycleTime = 120000 ÷ RPM&nbsp;&nbsp;(ms per 720° cycle)</span><br />
                <span style={{ fontFamily: T.mono, color: T.cyan, fontSize: 11.5 }}>duty% = PW ÷ cycleTime × 100</span>
                <br /><br />A four-stroke injects once every two crank revolutions, so at 7500 RPM there are only 16 ms in a cycle. An injector needing 15 of them is at 94% duty. Past about 90% there is no time left, and the mixture goes lean <i>no matter what your AFR table says</i>. This is a physical wall, not a calibration choice.
                <br /><br /><b style={{ color: T.ink }}>Critical:</b> the ECU calculates that pulse width for the injector size it has been <i>told</i> is fitted. Fit bigger injectors without updating the ECU Injector Size on FUEL and every pulse delivers proportionally more fuel than intended — the engine runs rich everywhere regardless of your tables.
              </ExpandableInfo>

              <ExpandableInfo title="10. Step 4 — open loop, closed loop, and fuel trims">
                At part throttle the ECU runs <b style={{ color: T.ink }}>closed loop</b>: it reads the oxygen sensor and corrects fuelling in real time. <b style={{ color: T.ink }}>Short term fuel trim (STFT)</b> is that instant correction; <b style={{ color: T.ink }}>long term fuel trim (LTFT)</b> is what it has learned and stored over time. Watch both on the HOME gauges — fit an intake without rescaling the MAF and you can see STFT swing, then hand off to LTFT as it learns.
                <br /><br />Above roughly 85 kPa the ECU switches to <b style={{ color: T.ink }}>open loop</b> and stops listening to the O2 sensor entirely, following your tables blind. That is deliberate — at wide open throttle you want a rich power mixture, not stoichiometric.
                <br /><br />It is also why <b style={{ color: T.ink }}>wide open throttle is where a bad tune bites</b>. Errors that closed loop quietly papers over at cruise pass straight through at full load.
              </ExpandableInfo>

              <ExpandableInfo title="11. Step 5 — from combustion to torque at the wheels">
                Fuel energy becomes indicated work on the piston, then the engine pays its own bills. The work is not estimated — the simulator integrates one cylinder through the closed part of its cycle, two crank degrees at a time:
                <br /><br /><span style={{ fontFamily: T.mono, color: T.cyan, fontSize: 11.5 }}>dQ = Wiebe burn fraction × fuel energy</span><br />
                <span style={{ fontFamily: T.mono, color: T.cyan, fontSize: 11.5 }}>dp = (γ−1)/V × dQ − γ × p/V × dV</span><br />
                <span style={{ fontFamily: T.mono, color: T.cyan, fontSize: 11.5 }}>IMEP = ∮ p dV ÷ V_cyl</span><br />
                <span style={{ fontFamily: T.mono, color: T.cyan, fontSize: 11.5 }}>PMEP = exhaust pressure − intake pressure</span><br />
                <span style={{ fontFamily: T.mono, color: T.cyan, fontSize: 11.5 }}>BMEP = IMEP − friction − PMEP</span><br />
                <span style={{ fontFamily: T.mono, color: T.cyan, fontSize: 11.5 }}>torque = BMEP × Vd ÷ 4π</span>
                <br /><br /><b style={{ color: T.ink }}>Why integrate instead of multiply?</b> Because spark timing does not scale the work done — it moves <i>when</i> the heat arrives relative to a piston that is somewhere different at every crank angle. Burn too early and rising pressure fights the piston still coming up. Too late and the burn happens into a cylinder already expanding. MBT is where those two losses balance, and it falls out of the integration rather than being looked up.
                <br /><br />Raising compression makes power the honest way here: a smaller clearance volume means a longer expansion, and the integral simply comes out bigger.
                <br /><br /><b style={{ color: T.ink }}>Pumping loss</b> is the one people forget: at part throttle the engine is working hard to breathe against a closed throttle, and that shows up as wasted work. Under boost it flips — if the turbine is not choking the exhaust harder than the compressor is filling the intake, the gas-exchange loop can actually hand work back.
              </ExpandableInfo>

              <div style={{ fontSize: 11, letterSpacing: 1, color: T.accInk, fontWeight: 800, margin: '14px 0 8px' }}>PART 3 · THE TUNING PROCESS</div>

              <ExpandableInfo title="12. The loop: change → pull → read → adjust">
                This is the whole method, and it is not a simplification:
                <br /><br /><b style={{ color: T.ink }}>1. Change one thing.</b> One table region, one hardware item. Change three and you will not know which one mattered.
                <br /><br /><b style={{ color: T.ink }}>2. Run a pull.</b> Nothing is known until it is measured. There is no preview in this app on purpose.
                <br /><br /><b style={{ color: T.ink }}>3. Read the log first.</b> Before looking at the power number, read the Pull Log and check the datalog for gaps between commanded and actual. Power that came with 6° of knock retard is not power you keep.
                <br /><br /><b style={{ color: T.ink }}>4. Adjust and repeat.</b> The VS. LAST PULL line tells you whether the change helped. Small logged steps beat big guesses, every time.
              </ExpandableInfo>

              <ExpandableInfo title="13. A worked example — first turbo tune">
                Fit a turbo on BUILD and run a pull without touching anything. It will score terribly, and here is why: a factory naturally-aspirated calibration has no real tuning above 101 kPa, so the boost rows are just a flat continuation of the wide-open-throttle row — far too much timing and far too lean for the cylinder pressure you have just created.
                <br /><br /><b style={{ color: T.ink }}>Read the log.</b> It will report knock across most of the range, with the RPM band and how many degrees the ECU pulled.
                <br /><br /><b style={{ color: T.ink }}>Fix the spark first.</b> On SPARK, pull the 150 and 200 kPa rows down. Roughly 2° per 20 kPa of extra pressure is a sane starting point. Pull again.
                <br /><br /><b style={{ color: T.ink }}>Then the mixture.</b> On FUEL, richen those same rows toward lambda 0.83 (about 12.2:1). Pull again — you should see knock margin improve as well, because a richer charge resists knock.
                <br /><br /><b style={{ color: T.ink }}>Then check the fuel system.</b> If the log reports injectors maxed, that is hardware: fit bigger injectors and set the matching ECU Injector Size, or ask for less boost. Nothing in the tables can create fuel that the injectors have no time to deliver.
              </ExpandableInfo>

              <ExpandableInfo title="14. How to read the datalog columns">
                The datalog is where diagnosis actually happens. Read it in pairs:
                <br /><br /><b style={{ color: T.ink }}>Timing: asked → got</b> — if they differ, the ECU overrode you. That is knock retard, and the gap is how far past the limit your table was.
                <br /><br /><b style={{ color: T.ink }}>Mixture: asked → got</b> — if actual is not what you commanded, the cause is upstream of the fuel table: usually MAF scaling or injectors out of duty. Do not "fix" it by editing fuel cells; fix the cause.
                <br /><br /><b style={{ color: T.ink }}>Airflow</b> — around 200 g/s is typical at redline for an engine near 300 hp, which is a quick sanity check on whether your VE table is plausible.
                <br /><br /><b style={{ color: T.ink }}>Injectors</b> — duty above 90% is the wall. <b style={{ color: T.ink }}>Heat</b> — sustained EGT above ~980°C cooks turbines and valves; it rises hard with retarded timing and lean mixtures, and a rich mixture is what pulls it back down.
              </ExpandableInfo>

              <ExpandableInfo title="15. What tuning can fix, and what it can't">
                <b style={{ color: T.ink }}>Calibration faults — tables fix these completely:</b> knock (pull timing), lean or rich mixture (AFR table), MAF drift after an intake change (MAF scalar), injector mismatch (set the ECU injector size). Fix the cause and the score returns to 100.
                <br /><br /><b style={{ color: T.ink }}>Physical limits — no table touches these:</b> injectors out of duty cycle, valve float, a compressor past its efficient range, a cam that has moved the powerband somewhere you did not want. The Pull Log always names both routes when you hit one: change the hardware, or ask less of it.
                <br /><br />Knowing which kind of problem you are looking at is most of what separates a tuner from someone guessing at numbers.
              </ExpandableInfo>

              <ExpandableInfo title="16. Habits that keep engines alive">
                Target zero knock, not "acceptable" knock. Stay on the rich side of best power until you have confirmed margin. Never chase a number you have not measured. When something looks wrong, find the cause rather than compensating for it downstream — a MAF error corrected by bending the AFR table will be wrong again the moment load changes.
                <br /><br />And watch engine health on HOME. Damage here accumulates the way it does in reality: a few destructive pulls, not one dramatic failure.
              </ExpandableInfo>

              <div style={{ fontSize: 11, letterSpacing: 1, color: T.accInk, fontWeight: 800, margin: '14px 0 8px' }}>PART 4 · GETTING IT TO THE GROUND</div>

              <ExpandableInfo title="17. A torque curve is only half of acceleration">
                Everything up to here has been about making torque. The DRAG page is about what happens to it next, and it runs on four equations:
                <br /><br /><span style={{ fontFamily: T.mono, color: T.cyan, fontSize: 11.5 }}>wheelTorque = engineTorque × gearRatio × finalDrive</span><br />
                <span style={{ fontFamily: T.mono, color: T.cyan, fontSize: 11.5 }}>F_max = μ × N</span><br />
                <span style={{ fontFamily: T.mono, color: T.cyan, fontSize: 11.5 }}>ΔN = m × a × h ÷ L</span><br />
                <span style={{ fontFamily: T.mono, color: T.cyan, fontSize: 11.5 }}>F_aero = ½ × ρ × Cd × A × v²</span>
                <br /><br />Gearing multiplies torque and divides speed by exactly the same factor. Grip sets a hard ceiling no amount of power can pass. Weight transfer raises that ceiling as you accelerate. Aerodynamic drag rises with the square of speed, so it is nothing at the line and everything at the trap.
                <br /><br />This is why two engines with the same peak horsepower can run very different times, and why the <i>shape</i> of a powerband — how much area is under the curve, and where — matters more than its highest point.
              </ExpandableInfo>

              <ExpandableInfo title="18. Gearing — torque multiplication, and what it costs">
                A 3.79 first gear with a 3.54 final drive multiplies engine torque by <b style={{ color: T.ink }}>13.4×</b> before it reaches the tyre. Nothing about the engine changed; that multiplication is why first gear lights the tyres and sixth cannot.
                <br /><br />The trade is exact. The same ratio divides road speed by 13.4, so you run out of revs almost immediately. Gearing never creates energy — it trades force against speed:
                <br /><br /><span style={{ fontFamily: T.mono, color: T.cyan, fontSize: 11.5 }}>v = RPM × 2π × tyreRadius ÷ (60 × gearRatio × finalDrive)</span>
                <br /><br />There is a second cost people forget. The engine, gearbox and wheels have to be spun up as well as pushed along, so they act as extra mass — and referred to the road that inertia scales with the <b style={{ color: T.ink }}>square</b> of the ratio. A very short first gear can add twenty per cent to a car's effective weight while it is engaged, and by top gear that penalty has almost vanished. It is also why lighter wheels help more than the same weight taken out of the boot: wheel inertia is geared to the road at 1:1 in every gear.
                <br /><br />Choosing ratios is really choosing where in the rev range you spend your time. Keep the engine near peak torque as much as possible and you will beat a car with more peak power that falls out of its band on every shift.
              </ExpandableInfo>

              <ExpandableInfo title="19. Grip — the ceiling nothing gets past">
                Torque you cannot transmit is just smoke:
                <br /><br /><span style={{ fontFamily: T.mono, color: T.cyan, fontSize: 11.5 }}>F_max = μ × N</span>
                <br /><br />Measured values: street tyres <b style={{ color: T.ink }}>0.8–0.9</b>, good summer tyres near <b style={{ color: T.ink }}>1.0</b>, racing slicks <b style={{ color: T.ink }}>1.7–1.9</b>, prepared drag surfaces higher again. Since F = ma, μ is directly a ceiling on acceleration in g — and on a rear-drive car only about 47% of the weight sits over the driven axle at rest, so the real launch limit is far below even that.
                <br /><br /><b style={{ color: T.ink }}>Weight transfer is what rescues it.</b> Accelerating shifts load rearward by ΔN = m·a·h ÷ L, so grip grows with the very acceleration it enables. That is why a rear-drive car out-launches its static weight distribution, why a taller centre of gravity genuinely helps at the strip even though it hurts everywhere else, and why all-wheel drive wins anyway — it starts with every kilogram already over a driven wheel.
                <br /><br /><b style={{ color: T.ink }}>One result surprises people.</b> When the tyre is the limit, every term carries the mass and it cancels:
                <br /><br /><span style={{ fontFamily: T.mono, color: T.cyan, fontSize: 11.5 }}>a = μ·g·f ÷ (1 − μ·h/L)</span>
                <br /><br />Adding weight to a car that is already spinning its tyres does not slow the launch at all. It slows everything after it, once grip stops being what is holding the car back. You can watch this on the DRAG page: put a huge engine on street tyres, then change the body, and the 60-foot time barely moves while the ET does.
              </ExpandableInfo>

              <ExpandableInfo title="20. What actually slows the car down">
                Three forces oppose you, and they dominate at different points on the strip.
                <br /><br /><span style={{ fontFamily: T.mono, color: T.cyan, fontSize: 11.5 }}>F_aero = ½ × ρ × Cd × A × v²</span>
                <br /><br />Aerodynamic drag rises with the <b style={{ color: T.ink }}>square</b> of speed — double the speed, quadruple the force. It is almost nothing at launch and enormous at the trap, which is exactly why trap speed is a far better measure of power than elapsed time, and why elapsed time is dominated by traction and gearing instead. The ρ here is the same air density the engine model uses, from the same gas law.
                <br /><br /><span style={{ fontFamily: T.mono, color: T.cyan, fontSize: 11.5 }}>F_roll = Crr × m × g</span>
                <br /><br />Rolling resistance is roughly constant, typically 1–1.5% of weight, and matters most where drag does not.
                <br /><br />And whatever is left over is acceleration: <span style={{ fontFamily: T.mono, color: T.cyan, fontSize: 11.5 }}>a = (F_tractive − F_aero − F_roll) ÷ m_effective</span>
              </ExpandableInfo>

              <ExpandableInfo title="21. Reading a time slip">
                A time slip is a datalog, and it is read the same way — in pairs, looking for which number disagrees with which.
                <br /><br /><b style={{ color: T.ink }}>Sixty-foot time</b> is the launch: traction, gearing, and how well the car left the line. It is the single biggest lever on elapsed time for most street cars, and it has almost nothing to do with peak power.
                <br /><br /><b style={{ color: T.ink }}>Trap speed</b> is power to weight, because at the far end drag dominates and only sustained power holds speed against it. Two cars can share an elapsed time with very different trap speeds — the one trapping faster has more power and launched worse.
                <br /><br /><b style={{ color: T.ink }}>Elapsed time</b> is the combination, so improving it means working out which half is costing you. High trap but poor ET means grip and gearing, not more boost. Low trap means you actually need power. That is the same diagnostic habit as reading a pull log: find the cause, do not compensate for it downstream.
              </ExpandableInfo>

              <div style={{ fontSize: 11, letterSpacing: 1, color: T.accInk, fontWeight: 800, margin: '14px 0 8px' }}>PART 5 · BEYOND THE SIMULATOR</div>
              <ExpandableInfo title="Why the engine sounds the way it does">
                The sound here is not a recording — it is generated from the same numbers the physics produces, so every change is audible for a real reason.
                <br /><br /><b style={{ color: T.ink }}>Sound is a train of exhaust pulses.</b> Each cylinder firing vents a pressure wave. Those discrete pulses, and the spacing between them, are the sound:
                <br /><br /><span style={{ fontFamily: T.mono, color: T.cyan, fontSize: 11.5 }}>firingHz = RPM ÷ 60 × cylinders ÷ 2</span>
                <br /><br />A four-stroke fires each cylinder once per two revolutions, hence the ÷2. At 3000 RPM a V8 produces 200 pulses per second and an inline four only 100 — which is why a four sounds hollow and separated while a V8 sounds continuous.
                <br /><br /><b style={{ color: T.ink }}>The V8 rumble is uneven firing, not EQ.</b> A cross-plane V8 fires evenly at the crank — every 90° — but its two banks do not. Each bank fires at 180°, 270°, 180°, 90°, which at 3000 RPM is gaps of 10, 15, 10 and 5 milliseconds down one pipe while the other does the same thing out of step. The two trains merge downstream, and because they arrive down collectors of different length they pair up rather than interleaving evenly: the gaps you actually hear alternate roughly 6.4 and 3.6 ms against an even 5.0. That irregularity <i>is</i> the rumble — flat-plane the same engine, so both banks fire evenly, and it stops sounding like a V8 and starts sounding like two fours. A 60° or 120° V6 is even in both banks, so its pulses ring the exhaust cleanly and it sounds hard and hornlike.
                <br /><br /><b style={{ color: T.ink }}>What each change does:</b><br />
                <b style={{ color: T.ink }}>Cylinder count</b> — pulse rate and spacing pattern. The biggest single factor.<br />
                <b style={{ color: T.ink }}>Displacement</b> — bigger cylinders vent longer pressure pulses, so the resonance sits lower and the note deepens.<br />
                <b style={{ color: T.ink }}>Cam duration</b> — overlap makes combustion inconsistent at idle, so output surges and dips. That is lope.<br />
                <b style={{ color: T.ink }}>Exhaust diameter</b> — a bigger pipe restricts less and resonates lower: louder and deeper.<br />
                <b style={{ color: T.ink }}>Intake</b> — induction noise rising with airflow.<br />
                <b style={{ color: T.ink }}>Turbo</b> — the whistle is blade-pass frequency tracking shaft speed; the rush is broadband noise from real mass airflow. On a small engine that induction noise dominates the exhaust, which is why a turbo four whooshes rather than barks.<br />
                <b style={{ color: T.ink }}>Ignition timing</b> — retarded means the charge is still burning as the exhaust valve opens, dumping energy into the exhaust. Heard as a harder, raspier note; measured as higher EGT.<br />
                <b style={{ color: T.ink }}>Mixture</b> — rich burns slower and softer, lean is sharp and thin.<br />
                <b style={{ color: T.ink }}>Compression</b> — faster pressure rise gives a harder crack per pulse.<br />
                <b style={{ color: T.ink }}>Knock</b> — a rattly edge, because that is literally what knock is: a shockwave ringing the cylinder.
                <br /><br />This matters beyond the game. Tuners diagnose by ear constantly — a lumpy idle, a lean rasp, a knock rattle. The sound is data.
              </ExpandableInfo>
              <ExpandableInfo title="What the tables are called on real software">
                The concepts here are universal; only the names change. If you open a real title, this is the translation:
                <br /><br /><b style={{ color: T.ink }}>Airflow</b> — HP Tuners and EFILive call it the <i>VE table</i> on RPM × MAP, exactly as here. COBB and EcuTek often expose <i>Load</i> or <i>Airmass</i>. UpRev on Nissan barely exposes VE at all; you correct airflow through the <i>MAF curve</i> (indexed by sensor voltage) plus the <i>K-fuel multiplier</i>. Different knob, same job: tell the ECU how much air is really there.
                <br /><br /><b style={{ color: T.ink }}>Fuel target</b> — <i>Commanded AFR</i>, <i>AFR target</i>, <i>Lambda target</i>, or <i>Equivalence ratio</i> (which is 1/λ, so it reads inverted — check which one you have before you edit anything).
                <br /><br /><b style={{ color: T.ink }}>Spark</b> — <i>Ignition timing</i>, <i>Spark advance</i>, or <i>Base spark</i>, usually with separate <i>knock retard</i> and <i>intake-air-temperature correction</i> tables layered on top. This app folds those corrections into one number for clarity; real software separates them.
                <br /><br /><b style={{ color: T.ink }}>Injector scaling</b> — <i>Injector flow rate</i> (HP Tuners), <i>K-fuel multiplier</i> (UpRev), <i>injector constant</i> elsewhere. Always the first thing you change after a fuel system upgrade.
                <br /><br />If you can say what a table <i>does</i> physically, you can find it in any software in about five minutes. That is the transferable skill.
              </ExpandableInfo>
              <ExpandableInfo title="A real tuning session, in order">
                This is the sequence a professional follows. It is deliberately boring, because the boring order is what stops engines being destroyed.
                <br /><br /><b style={{ color: T.ink }}>1. Verify the hardware before touching software.</b> Confirm what injectors, turbo, cam and fuel are actually fitted — not what the customer says. Check for boost and exhaust leaks. An exhaust leak upstream of the oxygen sensor makes a wideband read lean, and you will chase that error forever.
                <br /><br /><b style={{ color: T.ink }}>2. Read and save the stock file.</b> Always keep an unmodified copy you can flash back to. Every tuner has needed this.
                <br /><br /><b style={{ color: T.ink }}>3. Set scaling constants first.</b> Injector size, MAF housing, fuel pressure. These shift everything downstream, so doing them after you tune tables means redoing the tables.
                <br /><br /><b style={{ color: T.ink }}>4. Get it idling and driving, safely rich.</b> Cold start, idle, light cruise. Nothing aggressive.
                <br /><br /><b style={{ color: T.ink }}>5. Correct airflow before anything else.</b> Log, build the histogram, apply, re-log. Until the ECU knows how much air is present, every fuel and spark number you set is built on a wrong foundation.
                <br /><br /><b style={{ color: T.ink }}>6. Set the fuel targets.</b> Now that airflow is right, the commanded mixture is actually delivered.
                <br /><br /><b style={{ color: T.ink }}>7. Spark last, in small steps, on a dyno or a safe road.</b> Advance a couple of degrees, pull, check for knock, repeat. Stop when torque stops rising — that is MBT, and going past it is pure risk.
                <br /><br /><b style={{ color: T.ink }}>8. Verify across conditions.</b> Hot engine, cold engine, high gear, low gear. A tune that is only safe on a cool dyno is not finished.
              </ExpandableInfo>
              <ExpandableInfo title="Reading a real log — it is messier than this one">
                The datalog in this app is clean because the simulation is deterministic. A real log is not, and knowing the difference matters:
                <br /><br /><b style={{ color: T.ink }}>Only trust steady-state cells.</b> During a fast transient the fuel film on the port walls and the sensor lag mean the wideband is reporting something that happened a moment ago. Professional software lets you filter for stable conditions; use it, and discard cells the engine only touched briefly.
                <br /><br /><b style={{ color: T.ink }}>Widebands lag.</b> Typically 100–200 ms including transport time down the pipe. At 6000 RPM that is many combustion events. Align your log or accept the smear.
                <br /><br /><b style={{ color: T.ink }}>Widebands lie when the exhaust leaks.</b> Any air drawn in ahead of the sensor reads as lean. If a correction seems impossibly large, suspect the plumbing before the calibration.
                <br /><br /><b style={{ color: T.ink }}>Knock sensors hear other things.</b> Injector noise, valvetrain rattle and drivetrain clunks can all register as knock, particularly at high RPM. Real tuners correlate with an audio knock detector before pulling timing, rather than trusting the count blindly.
                <br /><br /><b style={{ color: T.ink }}>One clean pull beats five rushed ones.</b> Let the engine cool between runs, watch coolant and intake temperatures, and stop if anything moves the wrong way.
              </ExpandableInfo>
              <ExpandableInfo title="What this simulator cannot teach you">
                Being straight with you, because a false sense of readiness is genuinely dangerous around engines.
                <br /><br />This app can give you the mental model: what the ECU calculates, why each table exists, how a change propagates to torque, and the diagnostic habit of reading a log before touching a number. That transfers completely and it is most of the theory.
                <br /><br />It cannot give you: the feel of a real dyno session, the sound of genuine detonation (a sharp metallic rattle you learn by hearing it next to someone experienced), the specific quirks of any individual platform, flashing procedure and the risk of bricking an ECU, or the judgement that comes from having seen an engine let go.
                <br /><br /><b style={{ color: T.ink }}>So the honest advice:</b> use this to understand the physics thoroughly, then start on someone else's spare engine or a cheap car you can afford to lose, tune conservatively, and get a second opinion on your first few calibrations. The theory here is sound. The consequences of a mistake are not simulated.
              </ExpandableInfo>
              <ExpandableInfo title="Sources — and what checking them changed">
                None of the physics here is invented, and the numbers have been checked against published sources rather than assumed. Where a source disagreed with this simulation, the simulation was changed.
                <br /><br /><b style={{ color: T.accInk }}>MIT OpenCourseWare 8.21, The Physics of Energy, Lecture 11</b><br />
                Gives the Otto cycle efficiency as <span style={{ fontFamily: T.mono, color: T.cyan, fontSize: 11.5 }}>η = 1 − 1/r^(γ−1)</span>, and — critically — the value of γ to use: at 1500–2500 K the combustion products have <b style={{ color: T.ink }}>γ ≈ 1.3</b>, giving η ≈ 0.50 at a compression ratio near 10.
                <br /><br />This app originally used γ = 1.35. That was corrected to 1.3 to match. The textbook γ = 1.4 is the <i>cold</i>-air-standard value and would overstate efficiency by about 20% here. The lecture also states real spark-ignition engines reach 35–40% at best, which is why ideal efficiency is scaled down before it reaches the dyno.
                <br /><br /><b style={{ color: T.accInk }}>NASA Glenn, Beginners Guide to Aeronautics</b><br />
                "Internal Combustion Engine (Otto Cycle)" and "Engine Thermodynamic Analysis" give the underlying relations <span style={{ fontFamily: T.mono, color: T.cyan, fontSize: 11.5 }}>T₃/T₂ = r^(γ−1)</span> and <span style={{ fontFamily: T.mono, color: T.cyan, fontSize: 11.5 }}>p₃/p₂ = r^γ</span> that the efficiency formula derives from.
                <br /><br /><b style={{ color: T.accInk }}>x-engineer.org, Internal Combustion Engines</b><br />
                Confirms the foundation the whole model rests on: one engine cycle is <b style={{ color: T.ink }}>two complete crankshaft rotations (720°)</b>, and only the power stroke produces energy — intake, compression and exhaust all consume it. That is exactly what the <span style={{ fontFamily: T.mono, color: T.cyan, fontSize: 11.5 }}>120000 ÷ RPM</span> injector cycle time and the <span style={{ fontFamily: T.mono, color: T.cyan, fontSize: 11.5 }}>÷ 4π</span> in the torque equation encode, and why pumping loss is subtracted rather than ignored.
                <br /><br /><b style={{ color: T.accInk }}>Other figures cross-checked</b><br />
                Stoichiometric gasoline ≈ 14.7:1 (MIT) — matches. Slightly rich giving a small power increase (MIT) — matches the best-power target near λ0.87. Compression limited to about 10:1 by knock on pump fuel (MIT) — matches the knock model's behaviour. Part-throttle running at roughly 0.5 atm intake pressure raising pumping loss (MIT) — matches the load rows and the rise in fuel consumption at light load.
                <br /><br /><b style={{ color: T.accInk }}>Hot Rod, "Basic Engine Physics &amp; Math"</b><br />
                Listed as further reading for the same arithmetic worked longhand. Its specific figures have not been individually cross-checked here.
                <br /><br />Every formula was also verified for dimensional consistency: air density resolves to 1.185 kg/m³ at sea level and 25°C against a 1.184 reference, and injector cycle time derives exactly from two crank revolutions.
                <br /><br />If a figure in this app looks wrong to you, check it against these rather than taking it on trust. That is the correct instinct, and it has already caught several real errors here — including the γ value above.
              </ExpandableInfo>

            </BuildSection>
          </div>
        )}

        {/* ---------- LIVE: the engine running in real time ---------- */}
        {tab === 'live' && (
          <div style={{ padding: 16 }}>
            {journeyStep === 2 && <JourneyBanner step={2} onAdvance={() => { setJourneyStep(3); changeTab('dyno'); }} onDismiss={() => setJourneyStep(99)} />}
            <Eyebrow icon={Flame}>Live Engine</Eyebrow>
            <div style={{ fontSize: 12.5, color: T.ink2, lineHeight: 1.55, marginBottom: 12 }}>
              Your calibration, actually running. Start it, hold the throttle, and watch the
              sensors and fuel trims respond the way they would on a running car. Nothing here
              is scripted — it is the same physics the dyno uses, integrated in real time.
            </div>
          <Panel style={{ background: T.panel, marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <DialMark size={104} pct={clamp(live.sensedRpm / tachFullScaleRpm, 0, 1)} live />
                <div style={{ position: 'absolute', top: '58%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center' }}>
                  <div style={{ fontSize: 17, fontWeight: 800, fontFamily: T.mono, color: live.fuelCut ? T.danger : T.ink }}>{Math.round(live.sensedRpm)}</div>
                  <div style={{ fontSize: 7, color: T.ink3, letterSpacing: 1, fontWeight: 700 }}>RPM</div>
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: T.ink2, marginBottom: 8, lineHeight: 1.5 }}>
                  {live.running
                    ? (live.limiterCut ? 'Rev limiter — fuel cut to protect the engine.'
                      : live.dfco ? 'Overrun fuel cut — injectors off while coasting down. Real ECUs do this; it costs nothing to spin.'
                      : live.coolantC < 70 ? 'Warming up — the ECU is running extra fuel until it reaches temperature.'
                      : live.closedLoop ? 'Warm and in closed loop — the ECU is trimming fuel against the O2 sensor.'
                      : 'Open loop — the ECU is following your tables directly, ignoring O2 feedback.')
                    : live.cranking ? 'Starter engaged…' : 'Engine off. Start it to watch the ECU work in real time.'}
                </div>
                <div style={{ display: 'flex', gap: 7 }}>
                  <button onClick={live.running || live.cranking ? stopEngine : startEngine} style={{
                    flex: 1, padding: '11px 0', borderRadius: 9, border: 'none', fontWeight: 800, fontSize: 12.5,
                    background: live.running || live.cranking ? T.panel2 : T.ok, color: live.running || live.cranking ? T.ink : T.okBg,
                    borderWidth: 1, borderStyle: 'solid', borderColor: live.running || live.cranking ? T.line : T.ok,
                  }}>{live.running || live.cranking ? 'STOP' : 'START ENGINE'}</button>
                  <button onClick={testSound} title="Test sound" style={{
                    width: 46, padding: '11px 0', borderRadius: 9, fontWeight: 800, fontSize: 10.5,
                    border: `1px solid ${T.line}`, background: T.panel2, color: T.ink2,
                  }}>TEST</button>
                  <button onClick={() => { if (!soundOn) ensureAudio()?.ctx.resume(); setSoundOn((v) => !v); }} title="Engine sound" style={{
                    width: 46, padding: '11px 0', borderRadius: 9, fontWeight: 800, fontSize: 13,
                    border: `1px solid ${soundOn ? T.acc : T.line}`, background: soundOn ? T.accBg : T.panel2,
                    color: soundOn ? T.accInk : T.ink3,
                  }}>{soundOn ? '♪' : '✕'}</button>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
              <span style={{ fontSize: 10, color: T.ink2, fontWeight: 700, letterSpacing: 0.5 }}>VOL</span>
              <input
                type="range" min={0} max={2} step={0.05} value={volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                aria-label="Engine volume"
                style={{ flex: 1, accentColor: T.acc }}
              />
              <span style={{ fontFamily: T.mono, fontSize: 11, color: T.ink2, width: 34, textAlign: 'right' }}>
                {Math.round(volume * 100)}%
              </span>
            </div>

            {audioStatus && (
              <div style={{ fontSize: 11, color: audioStatus === 'ok' ? T.ok : T.warn, marginTop: 8, lineHeight: 1.5 }}>
                {audioStatus === 'ok'
                  ? 'Audio is running. If you heard the test beep but not the engine, start it and hold the throttle.'
                  : audioStatus === 'blocked'
                    ? 'The browser is still blocking audio — tap START, or any tab, then try TEST again.'
                    : 'This browser did not provide Web Audio, so engine sound is unavailable.'}
                <br />On iPhone the physical ring/silent switch mutes web audio even at full volume.
              </div>
            )}

            <div
              onPointerDown={(e) => { e.currentTarget.setPointerCapture?.(e.pointerId); setThrottleInput(100); throttleRef.current = 100; }}
              onPointerUp={() => { setThrottleInput(0); throttleRef.current = 0; }}
              onPointerCancel={() => { setThrottleInput(0); throttleRef.current = 0; }}
              style={{
                position: 'relative', overflow: 'hidden',
                marginTop: 12, padding: '18px 0', borderRadius: 12, textAlign: 'center', userSelect: 'none',
                WebkitUserSelect: 'none', WebkitTouchCallout: 'none',
                border: `1px solid ${throttleInput > 0 ? T.acc : T.line}`,
                background: throttleInput > 0 ? T.accBg : T.panel2,
                color: throttleInput > 0 ? T.accInk : T.ink2, fontWeight: 800, fontSize: 13.5, letterSpacing: 0.5,
                touchAction: 'none', opacity: live.running ? 1 : 0.4,
                transition: 'background .1s, border-color .1s',
              }}
            >
              <div style={{
                position: 'absolute', left: 0, top: 0, bottom: 0,
                width: `${clamp(live.effThrottle ?? 0, 0, 100)}%`,
                background: accAlpha(0.16), transition: 'width .12s',
              }} />
              <span style={{ position: 'relative' }}>
                {!live.running ? 'START THE ENGINE FIRST' : throttleInput > 0 ? 'WIDE OPEN THROTTLE' : 'PRESS AND HOLD TO REV'}
              </span>
            </div>

            <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
              <LiveGauge label="MAF" value={live.sensedMaf.toFixed(1)} unit="g/s" color={T.cyan} />
              <LiveGauge label="MAP" value={Math.round(live.sensedMap)} unit="kPa" />
              <LiveGauge label="IAT" value={Math.round(live.sensedIat)} unit="°C" warn={live.sensedIat > 65} />
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
              <LiveGauge label="LAMBDA" value={live.sensedLambda.toFixed(2)} unit="λ" color={T.violet} />
              <LiveGauge label="COOLANT" value={Math.round(live.sensedCoolant)} unit="°C" warn={live.sensedCoolant > 105} />
              <LiveGauge label="TIMING" value={live.live ? live.live.timing : '—'} unit="°" color={T.warn} warn={!!(live.live && live.live.knock)} />
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
              <LiveGauge label="INJ PW" value={live.live ? live.live.pw : '—'} unit="ms" />
              <LiveGauge label="DUTY" value={live.live ? live.live.duty : '—'} unit="%" warn={!!(live.live && live.live.duty > 90)} />
              <LiveGauge label="IDLE AIR" value={Math.round(live.idleTrim)} unit="%" />
              <LiveGauge label="FUEL" value={live.fuelCut ? 'CUT' : 'ON'} unit="" color={live.fuelCut ? T.warn : T.ok} />
            </div>

            <div style={{ marginTop: 12 }}>
              <TrimBar label="SHORT TERM FUEL TRIM (STFT)" value={live.stft} />
              <TrimBar label="LONG TERM FUEL TRIM (LTFT)" value={live.ltft} />
            </div>
          </Panel>
          <ExpandableInfo title="Why these gauges jitter">
            Every value above is a simulated sensor reading, with real noise and lag — not the exact internal number. That is what a tuner actually sees on a scan tool, and why real logs never look perfectly smooth.
          </ExpandableInfo>
          </div>
        )}

        {/* ---------- BUILD: engine architecture, parts, forced induction ---------- */}
        {tab === 'build' && (
          <div style={{ padding: 16 }}>
            {journeyStep === 0 && <JourneyBanner step={0} onAdvance={() => { setJourneyStep(1); changeTab('tune'); }} onDismiss={() => setJourneyStep(99)} />}
            <Eyebrow icon={Settings}>Garage</Eyebrow>
            <p style={{ fontSize: 12.5, color: T.ink2, lineHeight: 1.6, marginTop: 0, marginBottom: 14 }}>
              Design the car before you tune it. Tap a section to open it — every choice inside changes real physics elsewhere in the sandbox.
            </p>

            <BuildSection
              active={buildSection === 'engine'} onClick={() => setBuildSection(buildSection === 'engine' ? null : 'engine')}
              icon={Settings} label="Engine Architecture"
              sub={`${engineDerived.displacementL.toFixed(1)}L ${engineConfig.configuration} · ${engineConfig.compression.toFixed(1)}:1 · ${engineConfig.camDuration}° cam`}
            >
              <div style={{ fontSize: 12, color: T.ink2, marginBottom: 6, fontWeight: 600 }}>Start From a Real Engine</div>
              <GroupedSelect
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
                  if (v === '__custom__') { setPresetId(null); return; }
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
                    <button onClick={() => applyEnginePreset(presetPrompt)} style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: 'none', background: T.acc, color: T.accOn, fontWeight: 800, fontSize: 12 }}>
                      LOAD {presetPrompt.name.toUpperCase()}
                    </button>
                    <button onClick={() => setPresetPrompt(null)} style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: `1px solid ${T.line}`, background: T.panel, color: T.ink2, fontWeight: 700, fontSize: 12 }}>
                      CANCEL
                    </button>
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
              <Seg options={CONFIG_OPTS.map((c) => ({ label: `${c} · ${CYL_COUNT[c]}cyl`, value: c }))} value={engineConfig.configuration} onChange={(v) => setCfg({ configuration: v })} />
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
              <Seg options={MATERIAL_OPTS.map((m) => ({ label: m, value: m }))} value={engineConfig.blockMaterial} onChange={(v) => setCfg({ blockMaterial: v })} />
              <div style={{ fontSize: 12, color: T.ink2, margin: '10px 0 6px', fontWeight: 600 }}>Head Material</div>
              <Seg options={MATERIAL_OPTS.map((m) => ({ label: m, value: m }))} value={engineConfig.headMaterial} onChange={(v) => setCfg({ headMaterial: v })} />
              <ExpandableInfo title="Why block and head material matter">
                Aluminum conducts heat roughly three times faster than cast iron, so an aluminum head pulls heat away from the combustion chamber faster — a real, measurable knock-margin benefit. Cast iron is heavier and a worse conductor, but stiffer under heat, which is part of why some high-output blocks still use it.
              </ExpandableInfo>
              <Note>Changing bore, stroke, or configuration does not retroactively rewrite your VE/timing/AFR tables — you will feel the shift on your next dyno pull and can re-tune from there, just like swapping a real short block.</Note>
            </BuildSection>

            <BuildSection
              active={buildSection === 'boltons'} onClick={() => setBuildSection(buildSection === 'boltons' ? null : 'boltons')}
              icon={Package} label="Bolt-On Parts"
              sub={`${Object.values(mods).filter((v) => v).length}/4 installed`}
            >
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 9 }}>
                <button onClick={resetToStock} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: T.ink2, fontSize: 11, fontWeight: 600 }}>
                  <RotateCcw size={12} /> RESET ALL TO STOCK
                </button>
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
              active={buildSection === 'turbo'} onClick={() => setBuildSection(buildSection === 'turbo' ? null : 'turbo')}
              icon={Wind} label="Forced Induction"
              sub={turboOn ? `On · ${turbineCount > 1 ? `Twin ${TURBINE_OPTS[turbineIdx].label.split(' ')[0].toLowerCase()}` : TURBINE_OPTS[turbineIdx].label.split(' ')[0]} turbine · peak ${Math.max(...boostCurve)} psi` : 'Not installed'}
            >
              <ToggleRow label="Turbo kit" sub="Adds boost near WOT, with spool lag off idle" checked={turboOn} onChange={setTurboOnInvalidating} />

              <div style={{ maxHeight: turboOn ? 3000 : 0, opacity: turboOn ? 1 : 0, overflow: 'hidden', transition: 'max-height .4s ease, opacity .3s ease' }}>
                <div style={{ paddingTop: 12 }}>
                  <div style={{ fontSize: 12, color: T.ink2, marginBottom: 6, fontWeight: 600 }}>Turbine Size</div>
                  <PickList options={TURBINE_OPTS.map((o) => ({ label: o.label, value: o.label }))} value={TURBINE_OPTS[turbineIdx].label} onChange={(v) => setTurbineIdxInvalidating(TURBINE_OPTS.findIndex((o) => o.label === v))} />
                  <div style={{ fontSize: 12, color: T.ink2, marginBottom: 6, marginTop: 4, fontWeight: 600 }}>Compressor Size</div>
                  <Seg options={COMPRESSOR_OPTS.map((o) => ({ label: o.label, value: o.label }))} value={COMPRESSOR_OPTS[compressorIdx].label} onChange={(v) => setCompressorIdxInvalidating(COMPRESSOR_OPTS.findIndex((o) => o.label === v))} />
                  <div style={{ fontSize: 11, color: T.ink3, marginBottom: 10, marginTop: 4 }}>Ceiling before it runs outside its efficient range: ~{COMPRESSOR_OPTS[compressorIdx].boostCeiling} psi</div>
                  <ExpandableInfo title="Turbine vs. compressor — different jobs">
                    The turbine sits in the exhaust and spins from exhaust energy — its size sets how quickly it spools (small = fast but chokes exhaust flow up top; large = laggy but flows more at redline). The compressor sits in the intake and does the actual pressurizing — its size sets a practical boost ceiling before it's forced outside its efficient operating range, making hot, inefficient, knock-prone air.
                    <br /><br />Real turbo shops size compressors by required <b style={{ color: T.ink }}>airflow</b>, not boost pressure. The industry rule of thumb is about <b style={{ color: T.ink }}>10 crank horsepower per lb/min of air</b> (roughly 8.5 whp after drivetrain loss) — so a 400 whp target needs a compressor good for roughly 47 lb/min, which you then check against the manufacturer's compressor map.
                    <br /><br />Note that this figure barely changes with fuel. E85 needs far more fuel by volume, but it also releases almost exactly the same energy per unit of <i>air</i> as gasoline, so airflow — not fuel type — sets the power ceiling. Octane still helps, but through better timing, not through a bigger number here.
                  </ExpandableInfo>

                  <div style={{ marginTop: 4, marginBottom: 14 }}>
                    <ToggleRow label="Intercooler" sub="Cools charge air, buys knock margin under boost" checked={mods.intercooler} onChange={(v) => setModsInvalidating((m) => ({ ...m, intercooler: v }))} color={T.cyan} />
                  </div>

                  <div style={{ fontSize: 12, color: T.ink2, marginBottom: 8, fontWeight: 600 }}>Boost Target Curve</div>

                  <Panel tight style={{ marginBottom: 10 }}>
                    {/* Tap a bar to select that RPM point, then edit it below with full-width controls. */}
                    <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: 104 }}>
                      {RPM.map((r, i) => {
                        const on = boostSel === i;
                        const ceiling = COMPRESSOR_OPTS[compressorIdx].boostCeiling;
                        const over = boostCurve[i] > ceiling;
                        return (
                          <button key={r} onClick={() => setBoostSel(i)} style={{
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
                            color: d < 0 ? T.accInk : T.ok, fontWeight: 800, fontFamily: T.mono, fontSize: 14 }}>
                          {d > 0 ? '+' : ''}{d}
                        </button>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                      <button onClick={() => setBoostCurveInvalidating(RPM.map(() => clamp(Number(boostCurve[boostSel]) || 0, 0, 25)))}
                        style={{ flex: 1, padding: '9px 0', borderRadius: 8, border: `1px solid ${T.line}`, background: T.panel, color: T.ink2, fontWeight: 700, fontSize: 11 }}>
                        FLAT ACROSS ALL
                      </button>
                      <button onClick={() => { const peak = boostCurve[boostSel]; setBoostCurveInvalidating(RPM.map((r) => Math.round(peak * clamp((r - 1500) / 2600, 0, 1)))); }}
                        style={{ flex: 1, padding: '9px 0', borderRadius: 8, border: `1px solid ${T.line}`, background: T.panel, color: T.ink2, fontWeight: 700, fontSize: 11 }}>
                        SPOOL RAMP
                      </button>
                      {/* Built from RPM so the curve can never be shorter than the
                          axis. A hand-written literal previously had seven entries
                          for eight breakpoints, and the next edit put NaN through
                          the entire simulation. */}
                      <button onClick={() => setBoostCurveInvalidating(RPM.map(() => 0))}
                        style={{ flex: 1, padding: '9px 0', borderRadius: 8, border: `1px solid ${T.line}`, background: T.panel, color: T.ink2, fontWeight: 700, fontSize: 11 }}>
                        ZERO
                      </button>
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
              active={buildSection === 'exhaust'} onClick={() => setBuildSection(buildSection === 'exhaust' ? null : 'exhaust')}
              icon={Flame} label="Exhaust"
              sub={EXHAUST_DIA_OPTS[exhaustDiaIdx].label}
            >
              <div style={{ fontSize: 12, color: T.ink2, marginBottom: 6, fontWeight: 600 }}>Exhaust Diameter</div>
              <Seg options={EXHAUST_DIA_OPTS.map((o) => ({ label: o.label, value: o.label }))} value={EXHAUST_DIA_OPTS[exhaustDiaIdx].label} onChange={(v) => setExhaustDiaIdxInvalidating(EXHAUST_DIA_OPTS.findIndex((o) => o.label === v))} />
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
                <button key={v.id} onClick={() => { setTuneView(v.id); setSelection(null); }} style={{
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
            <JourneyBanner step={1} onAdvance={() => { setJourneyStep(2); changeTab('live'); }} onDismiss={() => setJourneyStep(99)} />
          </div>
        )}

        {tab === 'tune' && tuneView === 've' && (
          <>
            <div style={{ padding: '16px 16px 0' }}>
              <Eyebrow icon={Grid3x3}>Volumetric Efficiency</Eyebrow>
              <div style={{ fontSize: 12.5, color: T.ink2, marginBottom: 12, lineHeight: 1.5 }}>How completely the cylinder fills at each engine speed and load. Rows are manifold pressure (MAP kPa &mdash; about 100 is wide open, higher is boost); columns are RPM. Tap any cell for reference data.</div>
              <SelectModeBar />
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
                    <button onClick={recalcVE} style={{ width: '100%', marginTop: 4, padding: '11px 0', borderRadius: 9, border: 'none', background: T.acc, color: T.accOn, fontWeight: 800, fontSize: 12.5 }}>
                      ACCEPT RE-LOGGED VALUES
                    </button>
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
            <SelectionDock data={ve} setData={setVeEdited} selection={selection} min={10} max={130} decimals={0} unit="%" onClose={() => setSelection(null)} kind="ve" rangeMode={rangeMode} />
          </>
        )}

        {tab === 'tune' && tuneView === 'timing' && (
          <>
            <div style={{ padding: '16px 16px 0' }}>
              <Eyebrow icon={Zap}>Ignition Timing</Eyebrow>
              <div style={{ fontSize: 12.5, color: T.ink2, marginBottom: 12 }}>Degrees of spark advance before top dead center (° BTDC).</div>
              <SelectModeBar />
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
                <div style={{ background: T.panel2, border: `1px solid ${T.line}`, borderRadius: 10, padding: '11px 13px', margin: '10px 0', fontSize: 12, color: T.ink2, lineHeight: 1.5 }}>
                  <b style={{ color: T.accInk }}>Timing left on the table.</b> {calAdvice.underAdvanced.length} cells are more than 3° below what this build would tolerate. Safe, but you are giving away torque — advance them a little at a time and pull between each change.
                </div>
              ) : calAdvice.pastMbt.length > 0 ? (
                <div style={{ background: T.panel2, border: `1px solid ${T.line}`, borderRadius: 10, padding: '11px 13px', margin: '10px 0', fontSize: 12, color: T.ink2, lineHeight: 1.5 }}>
                  <b style={{ color: T.accInk }}>Past peak torque.</b> {calAdvice.pastMbt.length} cells command more advance than the burn can use — the charge is already finishing where it should, so the extra degrees are working against the piston on its way up rather than adding torque. Not dangerous here — these cells are inside the knock limit — but pulling them back gains a little power and buys margin.
                </div>
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
            <SelectionDock data={timing} setData={setTimingEdited} selection={selection} min={SPARK_MIN_DEG} max={SPARK_MAX_DEG} decimals={0} unit="°" onClose={() => setSelection(null)} kind="timing" rangeMode={rangeMode} />
          </>
        )}

        {tab === 'tune' && tuneView === 'afr' && (
          <>
            <div style={{ padding: '16px 16px 0' }}>
              <Eyebrow icon={Droplets}>Air-Fuel Ratio Target</Eyebrow>
              <div style={{ fontSize: 12.5, color: T.ink2, marginBottom: 12, lineHeight: 1.5 }}>Target air:fuel ratio the ECU aims for. Divide by 14.7 to read it as lambda.</div>
              <SelectModeBar />
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
            <SelectionDock data={afr} setData={setAfrEdited} selection={selection} min={10} max={18} decimals={1} unit=":1" onClose={() => setSelection(null)} kind="afr" rangeMode={rangeMode} />
          </>
        )}

        {tab === 'tune' && tuneView === 'ecu' && (
          <div style={{ padding: 16 }}>
            <Eyebrow icon={Fuel}>Fuel System</Eyebrow>
            {!turboOn && <Note>Naturally aspirated — no turbo installed. Add one on <b>BUILD</b> if you want boost to tune around.</Note>}
            {turboOn && <Note>Turbo hardware and the boost target curve live on <b>BUILD</b> — this tab is fuel-side tuning: octane, injectors, and MAF/ECU.</Note>}

            <div style={{ fontSize: 12, color: T.ink2, margin: '12px 0 6px', fontWeight: 600 }}>Fuel Octane</div>
            <Seg options={OCTANE_OPTS.map((o) => ({ label: o.label, value: o.label }))} value={OCTANE_OPTS[octaneIdx].label} onChange={(v) => setOctaneIdxInvalidating(OCTANE_OPTS.findIndex((o) => o.label === v))} />
            <ExpandableInfo title="What octane actually does — and what E85 costs you">
              Octane measures a fuel's resistance to auto-igniting under heat and pressure before the spark fires it — not energy content or "power." Higher octane tolerates more cylinder pressure and temperature before knock, letting a tuner run more advance or more boost safely. It does not add power on its own; it raises the ceiling for how much timing/boost you can use before knock becomes the limit.
              <br /><br /><b style={{ color: T.ink }}>E85 is not a free upgrade.</b> Its stoichiometric point is about 9.8:1, not gasoline's 14.7:1 — so hitting the same lambda takes roughly <b style={{ color: T.accInk }}>1.43× the fuel volume</b>. Switch to E85 without upsizing injectors and you will run out of duty cycle long before you cash in that knock margin. Watch the duty preview below change the moment you select it.
              <br /><br />That trade — huge knock resistance, huge fuel demand — is exactly why serious E85 builds pair it with bigger injectors and a bigger pump, and why "just run E85" is not a shortcut around a fuel system.
            </ExpandableInfo>

            <div style={{ fontSize: 12, color: T.ink2, margin: '10px 0 6px', fontWeight: 600 }}>Fuel Injectors</div>
            <PickList options={INJECTOR_OPTS.map((o) => ({ label: o.label, value: o.label }))} value={INJECTOR_OPTS[injIdx].label} onChange={(v) => setInjIdxInvalidating(INJECTOR_OPTS.findIndex((o) => o.label === v))} />
            <div style={{ fontSize: 12, color: T.ink2, margin: '12px 0 6px', fontWeight: 600 }}>
              ECU Injector Scaling <span style={{ color: T.ink3, fontWeight: 400 }}>— what the ECU thinks is fitted</span>
            </div>
            <Seg options={INJECTOR_OPTS.map((o) => ({ label: `${o.cc}`, value: o.cc }))} value={ecuInjectorCc} onChange={setEcuInjectorCcInvalidating} wrap />
            {ecuInjectorCc !== injectorCc ? (
              <div style={{ background: T.dangerBg, border: `1px solid ${T.dangerLine}`, borderRadius: 10, padding: '11px 13px', margin: '8px 0', fontSize: 12, color: T.dangerInk, lineHeight: 1.5 }}>
                <b>Scaling mismatch.</b> Hardware is {injectorCc}cc but the ECU is calibrated for {ecuInjectorCc}cc — every pulse delivers about {((injectorCc / ecuInjectorCc) * 100).toFixed(0)}% of the intended fuel, so the engine runs {injectorCc > ecuInjectorCc ? 'far too rich' : 'dangerously lean'} everywhere.
                <button onClick={() => setEcuInjectorCcInvalidating(injectorCc)} style={{ display: 'block', width: '100%', marginTop: 9, padding: '10px 0', borderRadius: 8, border: 'none', background: T.acc, color: T.accOn, fontWeight: 800, fontSize: 12.5 }}>
                  RESCALE ECU TO {injectorCc}cc
                </button>
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
              <div style={{ height: 8, background: T.panel, borderRadius: 4, marginTop: 8, overflow: 'hidden', border: `1px solid ${T.line}` }}>
                <div style={{ width: `${Math.min(100, dutyPreview)}%`, height: '100%', background: dutyPreview > 90 ? T.danger : dutyPreview > 75 ? T.warn : T.ok }} />
              </div>
              <div style={{ fontSize: 12, marginTop: 7, color: dutyPreview > 90 ? T.dangerInk : T.inkSoft }}>
                {dutyPreview.toFixed(0)}% duty {dutyPreview > 90 ? '— undersized for this build, expect forced lean-out' : ''}
              </div>
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
              <input type="range" min={0.75} max={1.25} step={0.01} value={mafScalar} onChange={(e) => setMafScalarInvalidating(Number(e.target.value))} style={{ flex: 1, accentColor: T.acc }} />
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
            {activeJob != null && (
              <div style={{
                background: jobResult === 'pass' ? T.okBg : jobResult === 'fail' ? T.dangerBg : T.panel2,
                border: `1px solid ${jobResult === 'pass' ? T.okLine : jobResult === 'fail' ? T.dangerLine : T.line}`,
                borderRadius: 11, padding: '12px 13px', marginBottom: 14,
              }}>
                <div style={{
                  fontSize: 10, letterSpacing: 1, fontWeight: 800,
                  color: jobResult === 'pass' ? T.ok : jobResult === 'fail' ? T.danger : T.ink2,
                }}>
                  {jobResult === 'pass' ? 'JOB COMPLETE' : jobResult === 'fail' ? 'NOT THERE YET' : 'JOB IN PROGRESS'}
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.ink, marginTop: 3 }}>{CAREER_JOBS[activeJob].title}</div>
                <div style={{ fontSize: 11.5, color: T.ink2, marginTop: 5 }}>Target: {CAREER_JOBS[activeJob].target}</div>
                {jobResult === 'pass' && (
                  <div style={{ fontSize: 12, color: T.ink2, lineHeight: 1.5, marginTop: 8, paddingTop: 8, borderTop: `1px solid ${T.line}` }}>
                    <b style={{ color: T.ok }}>What this job taught: </b>{CAREER_JOBS[activeJob].teaches}
                  </div>
                )}
                {jobResult === 'fail' && (
                  <div style={{ fontSize: 11.5, color: T.dangerInk, marginTop: 7 }}>
                    Read the Pull Log below — it names the cause and what to change.
                  </div>
                )}
              </div>
            )}
            {journeyStep === 3 && <JourneyBanner step={3} onAdvance={() => { setJourneyStep(4); changeTab('drag'); }} onDismiss={() => setJourneyStep(99)} />}
            <Eyebrow icon={Activity}>Dyno Cell</Eyebrow>
            <div style={{ fontSize: 12, color: T.ink2, marginBottom: 8, fontWeight: 600 }}>Manifold pressure for the pull (load)</div>
            <Seg options={[100, 70, 40].map((l) => ({ label: `${l} kPa`, value: l }))} value={loadKpa} onChange={setLoadKpa} />
            <div style={{ fontSize: 10.5, color: T.ink3, marginTop: 4, marginBottom: 4 }}>
              ~100 kPa is wide-open throttle naturally aspirated. Boost adds on top and walks the tables into the higher-MAP rows automatically.
            </div>

            <div style={{ margin: '14px 0' }}><Tach rpm={running || result ? currentRpm : 1500} cylinders={engineDerived.cyl} running={running} fullScaleRpm={tachFullScaleRpm} /></div>

            <button onClick={doRun} disabled={running} style={{
              width: '100%', padding: '15px 0', borderRadius: 12, border: 'none', marginBottom: 16,
              background: running ? T.panel3 : T.acc, color: running ? T.ink2 : T.accOn, fontWeight: 800, fontSize: 14.5,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, letterSpacing: 0.3,
              boxShadow: running ? 'none' : `0 6px 18px ${accAlpha(0.22)}`,
            }}>
              <Play size={16} />
              {!running ? 'RUN DYNO PULL'
                : dynoPhase === 'settle' ? 'IDLING…'
                  : dynoPhase === 'sweep' ? 'SWEEPING…'
                    : dynoPhase === 'spooldown' ? 'COMING BACK DOWN…'
                      : 'SETTLING…'}
            </button>

            {result && (
              <>
                <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
                  <StatTile label="PEAK WHP" value={result.peakHp} color={T.accInk} />
                  <StatTile label="PEAK TQ" value={result.peakTq} unit="lb-ft" color={T.cyan} />
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
                        <button key={id} onClick={() => setDynoView(id)} style={{
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
                      <Line dataKey="afr" name="AFR actual" stroke={T.ok} strokeWidth={2} dot={false} isAnimationActive={false} />
                      <Line dataKey="timing" name="Timing used" stroke={T.warn} strokeWidth={2} dot={false} isAnimationActive={false} />
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
                          { k: 'Injectors', asked: null, got: `${p.duty}% duty`,
                            note: `${p.pw} ms of the ${(120000 / p.rpm).toFixed(1)} ms available${p.duty > 90 ? ' — at the limit' : ''}`,
                            ok: p.duty <= 90 },
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
                      <button onClick={buildHistogram} style={{ width: '100%', padding: '12px 0', borderRadius: 10, border: `1px solid ${T.cyan}`, background: T.cyanBg, color: T.cyan, fontWeight: 800, fontSize: 12.5, marginBottom: 16 }}>
                        BUILD HISTOGRAM FROM THIS PULL
                      </button>
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
                          <button onClick={applyHistogram} style={{ flex: 2, padding: '12px 0', borderRadius: 10, border: 'none', background: T.acc, color: T.accOn, fontWeight: 800, fontSize: 12.5 }}>
                            APPLY CORRECTIONS TO VE
                          </button>
                          <button onClick={() => setHistogram(null)} style={{ flex: 1, padding: '12px 0', borderRadius: 10, border: `1px solid ${T.line}`, background: T.panel2, color: T.ink2, fontWeight: 700, fontSize: 12.5 }}>
                            DISCARD
                          </button>
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
                          const isDanger = e.type === 'knock' || e.type === 'valve' || e.type === 'rich' || e.type === 'injscale' || e.type === 'float' || e.type === 'pressure';
                          const isWarn = e.type === 'lean' || e.type === 'fuel' || e.type === 'compressor' || e.type === 'cam';
                          const isViolet = e.type === 'maf';
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
                        {scoresStale && (
                          <Note tone="warn">
                            <b>This is the last pull, before your latest change.</b> The build on
                            screen is not the one these numbers were measured on, so they have been
                            left exactly as they were rather than re-graded against hardware that
                            never ran. Run another pull to score what you have now.
                          </Note>
                        )}
                        <Panel style={{ marginBottom: 10, background: T.accBg, border: `1px solid ${T.acc}`, textAlign: 'center' }}>
                          <div style={{ fontSize: 10, color: T.accInk, letterSpacing: 1.5, fontWeight: 800 }}>PULL SCORE</div>
                          <div style={{ fontSize: 40, fontWeight: 800, fontFamily: T.mono, color: T.accInk, lineHeight: 1.1 }}>{scores.pull}</div>
                          {/* NEW BEST is now a fact about the run that produced this
                              number, decided when it was banked — not a live comparison
                              that any hardware change could win without measuring. */}
                          <div style={{ fontSize: 11.5, color: scores.wasBest ? T.ok : T.ink2, fontWeight: 700, marginTop: 2 }}>
                            {scores.wasBest ? 'NEW BEST' : `Best: ${bestScore}`}
                          </div>
                        </Panel>
                        <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                          {[['TUNING SCORE', scores.tuning], ['ENGINEER SCORE', scores.engineer]].map(([label, s]) => {
                            const c = statusColor(s.score);
                            return (
                              <div key={label} style={{ flex: 1, background: T.panel2, border: `1px solid ${T.line}`, borderRadius: 12, padding: 14 }}>
                                <div style={{ fontSize: 9.5, color: T.ink2, letterSpacing: 1, fontWeight: 700 }}>{label}</div>
                                <div style={{ fontSize: 28, fontWeight: 800, fontFamily: T.mono, color: c, marginTop: 2 }}>{s.score}</div>
                                <div style={{ fontSize: 11, color: c, fontWeight: 700 }}>{s.label}</div>
                              </div>
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

        {/* ---------- DRAG: put the engine in a car and run the quarter ---------- */}
        {tab === 'drag' && (
          <div style={{ padding: 16 }}>
            {journeyStep === 4 && <JourneyBanner step={4} onAdvance={() => setJourneyStep(99)} onDismiss={() => setJourneyStep(99)} />}
            <Eyebrow icon={Flag}>Drag Strip</Eyebrow>
            <div style={{ fontSize: 12.5, color: T.ink2, lineHeight: 1.55, marginBottom: 12 }}>
              A torque curve is only half of acceleration. Gearing, tyre size, grip, weight transfer and aerodynamic drag decide what actually reaches the road — which is why the powerband&apos;s <i>shape</i> matters here and not just its peak.
            </div>

            {!result ? (
              <Note tone="warn">Run a dyno pull first — there is no torque curve to drive with until the engine has been measured.</Note>
            ) : (
              <>
                <DragStrip res={dragResult} tNow={dragT} running={dragRunning} treePhase={treePhase} bodyIdx={car.bodyIdx} />

                <button onClick={runDrag} disabled={dragRunning} style={{
                  width: '100%', padding: '15px 0', borderRadius: 12, border: 'none', marginBottom: 14,
                  background: dragRunning ? T.panel2 : T.acc, color: dragRunning ? T.ink2 : T.accOn,
                  fontWeight: 800, fontSize: 14, letterSpacing: 0.5,
                }}>{dragRunning ? 'RUNNING…' : 'RUN THE QUARTER MILE'}</button>

                {dragResult && !dragRunning && (
                  <Panel style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 10, letterSpacing: 1, color: T.ink2, fontWeight: 700, marginBottom: 9 }}>TIME SLIP</div>
                    {dragResult.finished ? (
                      <>
                        <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                          <StatTile label="1/4 MILE ET" value={dragResult.et.toFixed(2)} unit="s" color={T.accInk} />
                          <StatTile label="TRAP SPEED" value={dragResult.trapMph.toFixed(1)} unit="mph" color={T.cyan} />
                        </div>
                        <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                          <StatTile label="60 FOOT" value={dragResult.sixtyFootT ? dragResult.sixtyFootT.toFixed(2) : '—'} unit="s" color={T.violet} />
                          <StatTile label="0-60 MPH" value={dragResult.zeroToSixty ? dragResult.zeroToSixty.toFixed(2) : '—'} unit="s" />
                        </div>
                        <div style={{ display: 'flex', gap: 10 }}>
                          <StatTile label="1/8 MILE" value={dragResult.eighthET ? dragResult.eighthET.toFixed(2) : '—'} unit="s" />
                          <StatTile label="1/8 TRAP" value={dragResult.eighthMph ? dragResult.eighthMph.toFixed(1) : '—'} unit="mph" />
                          <StatTile label="GEARS" value={dragResult.topGearUsed} />
                        </div>
                      </>
                    ) : (
                      <Note tone="warn">
                        The car never reached the stripe. With {result.peakHp} whp against {Math.round(car.massKg)} kg it either has too little torque to overcome drag and rolling resistance, or it spent the whole run spinning its tyres. Check the wheelspin note below, then look at gearing.
                      </Note>
                    )}
                    {dragResult.wheelspun && (
                      <Note tone="warn">
                        Wheelspin off the line. The engine asked for more force than μ×N allowed, and everything past that limit went into turning the tyres instead of the car. More grip, more static weight over the driven axle, a taller first gear, or all-wheel drive.
                      </Note>
                    )}
                    <div style={{ fontSize: 11.5, color: T.ink2, lineHeight: 1.55, marginTop: 10 }}>
                      Read it in two halves. <b style={{ color: T.ink }}>Trap speed</b> is a measure of power against drag, because at the far end aerodynamic resistance dominates and only sustained power holds speed against it. <b style={{ color: T.ink }}>Sixty-foot time</b> is a measure of traction and launch. If the trap is high but the ET poor, the answer is grip and gearing, not more boost.
                    </div>
                  </Panel>
                )}

                <BuildSection active={dragSection === 'body'} onClick={() => setDragSection(dragSection === 'body' ? null : 'body')}
                  icon={Package} label="Car Body"
                  sub={`${CAR_BODIES[car.bodyIdx].label} · ${CAR_BODIES[car.bodyIdx].massKg} kg · Cd ${CAR_BODIES[car.bodyIdx].cd.toFixed(2)}`}>
                  <Seg options={CAR_BODIES.map((b, i) => ({ label: b.label, value: i }))}
                    value={car.bodyIdx}
                    onChange={(i) => setCar({ ...car, bodyIdx: i, ...CAR_BODIES[i] })} wrap />
                  <div style={{ fontSize: 11.5, color: T.ink3, marginTop: 6, lineHeight: 1.5 }}>{CAR_BODIES[car.bodyIdx].note}</div>

                  <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                    <StatTile label="MASS" value={CAR_BODIES[car.bodyIdx].massKg} unit="kg" />
                    <StatTile label="Cd" value={CAR_BODIES[car.bodyIdx].cd.toFixed(2)} />
                    <StatTile label="FRONTAL" value={CAR_BODIES[car.bodyIdx].frontalAreaM2.toFixed(2)} unit="m²" />
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                    <StatTile label="CG HEIGHT" value={CAR_BODIES[car.bodyIdx].cgHeightM.toFixed(2)} unit="m" />
                    <StatTile label="WHEELBASE" value={CAR_BODIES[car.bodyIdx].wheelbaseM.toFixed(2)} unit="m" />
                    <StatTile label="REAR WEIGHT" value={Math.round(CAR_BODIES[car.bodyIdx].rearFrac * 100)} unit="%" />
                  </div>

                  <ExpandableInfo title="Why the same engine is not the same car">
                    Nothing here is a handicap number — every figure is a term in an equation that is already running.
                    <br /><br /><b style={{ color: T.ink }}>Mass</b> divides straight into acceleration (a = F ÷ m), and it also has to be spun up through the gearing, so it costs twice.
                    <br /><br /><b style={{ color: T.ink }}>Cd × frontal area</b> is drag, and it grows with the square of speed. Almost nothing at the line, everything at the trap — which is why a van gives up far more trap speed than ET against a coupe.
                    <br /><br /><b style={{ color: T.ink }}>Centre of gravity height and wheelbase</b> set weight transfer, ΔN = m·a·h ÷ L. A tall van transfers more load rearward than a low supercar, which genuinely helps it hook up — one of the few things working in its favour.
                    <br /><br /><b style={{ color: T.ink }}>Static rear weight</b> is how much grip you start with before any transfer at all. A mid-engined supercar begins with 57% over the driven axle; a pickup has 38%.
                  </ExpandableInfo>
                </BuildSection>

                <BuildSection active={dragSection === 'gearing'} onClick={() => setDragSection(dragSection === 'gearing' ? null : 'gearing')}
                  icon={Settings} label="Gearbox"
                  sub={`${car.gearCount}-speed ${GEARBOX_OPTS[car.boxIdx].label} · ${car.finalDrive.toFixed(2)} final`}>
                  <div style={{ fontSize: 12, color: T.ink2, marginBottom: 6, fontWeight: 600 }}>Transmission</div>
                  <Seg options={GEARBOX_OPTS.map((o, i) => ({ label: o.label, value: i }))} value={car.boxIdx} onChange={(v) => setCar({ ...car, boxIdx: v })} />
                  <div style={{ fontSize: 11, color: T.ink3, marginTop: 4 }}>{GEARBOX_OPTS[car.boxIdx].note}</div>

                  <div style={{ fontSize: 12, color: T.ink2, margin: '12px 0 6px', fontWeight: 600 }}>Number of gears: {car.gearCount}</div>
                  <input type="range" min={4} max={6} step={1} value={car.gearCount} aria-label="Number of gears"
                    onChange={(e) => setCar({ ...car, gearCount: Number(e.target.value) })} style={{ width: '100%', accentColor: T.acc }} />

                  <div style={{ fontSize: 12, color: T.ink2, margin: '12px 0 6px', fontWeight: 600 }}>Final drive: {car.finalDrive.toFixed(2)}:1</div>
                  <input type="range" min={2.8} max={4.8} step={0.05} value={car.finalDrive} aria-label="Final drive ratio"
                    onChange={(e) => setCar({ ...car, finalDrive: Number(e.target.value) })} style={{ width: '100%', accentColor: T.acc }} />
                  <div style={{ fontSize: 11, color: T.ink3, marginTop: 4 }}>Numerically higher multiplies torque but runs out of road speed sooner.</div>

                  <div style={{ fontSize: 12, color: T.ink2, margin: '12px 0 6px', fontWeight: 600 }}>First gear: {car.gears[0].toFixed(2)}:1</div>
                  <input type="range" min={2.4} max={4.6} step={0.05} value={car.gears[0]} aria-label="First gear ratio"
                    onChange={(e) => { const g = [...car.gears]; g[0] = Number(e.target.value); setCar({ ...car, gears: g }); }}
                    style={{ width: '100%', accentColor: T.acc }} />

                  <Panel tight style={{ marginTop: 12, fontFamily: T.mono, fontSize: 11.5, color: T.ink2, lineHeight: 1.8 }}>
                    <div style={{ fontFamily: T.sans, fontSize: 10, letterSpacing: 1, color: T.ink3, fontWeight: 800, marginBottom: 5 }}>
                      WHAT THIS GEARING DOES
                    </div>
                    <div>First gear multiplies torque <span style={{ color: T.cyan }}>{(car.gears[0] * car.finalDrive).toFixed(1)}×</span></div>
                    <div>Top gear multiplies torque <span style={{ color: T.cyan }}>{(car.gears[car.gearCount - 1] * car.finalDrive).toFixed(2)}×</span></div>
                    <div>Redline in first is <span style={{ color: T.cyan }}>{(roadSpeedMs(engineDerived.redline, car.gears[0], car) * MPH_PER_MS).toFixed(0)} mph</span></div>
                    <div>Redline in top is <span style={{ color: T.cyan }}>{(roadSpeedMs(engineDerived.redline, car.gears[car.gearCount - 1], car) * MPH_PER_MS).toFixed(0)} mph</span></div>
                  </Panel>

                  <ExpandableInfo title="How gearing multiplies torque">
                    Every gear is a torque multiplier and a speed divider by exactly the same factor:
                    <br /><br /><span style={{ fontFamily: T.mono, color: T.cyan, fontSize: 11.5 }}>wheelTorque = engineTorque × gearRatio × finalDrive</span><br />
                    <span style={{ fontFamily: T.mono, color: T.cyan, fontSize: 11.5 }}>force = wheelTorque ÷ tyreRadius</span>
                    <br /><br />So this box multiplies engine torque {(car.gears[0] * car.finalDrive).toFixed(1)}× in first before it reaches the tyre. That is why first gear lights the tyres and top gear cannot — the engine has not changed, the multiplication has.
                    <br /><br />The cost is exact and unavoidable: the same ratio divides road speed by the same {(car.gears[0] * car.finalDrive).toFixed(1)}×, so you run out of revs almost immediately. Gearing never creates energy; it trades force against speed. Choosing ratios is really choosing where in the rev range you spend your time, and the answer is: as near peak torque as you can, as often as you can.
                    <br /><br />There is a second cost that is easy to miss. The engine and gearbox have to be spun up as well as the car moved, and referred to the road that inertia scales with the <i>square</i> of the ratio — so a very short first gear carries a real weight penalty that a tall one does not.
                  </ExpandableInfo>
                </BuildSection>

                <BuildSection active={dragSection === 'tires'} onClick={() => setDragSection(dragSection === 'tires' ? null : 'tires')}
                  icon={Activity} label="Tyres &amp; Drive"
                  sub={`${TIRE_GRIP[car.gripIdx].label} · ${DRIVETRAIN_OPTS[car.driveIdx].label} · ${car.tireDiameterIn}in`}>
                  <div style={{ fontSize: 12, color: T.ink2, marginBottom: 6, fontWeight: 600 }}>Grip level</div>
                  <Seg options={TIRE_GRIP.map((o, i) => ({ label: o.label, value: i }))} value={car.gripIdx} onChange={(v) => setCar({ ...car, gripIdx: v })} wrap />
                  <div style={{ fontSize: 11, color: T.ink3, marginTop: 4 }}>
                    {TIRE_GRIP[car.gripIdx].note} — coefficient of friction μ = {TIRE_GRIP[car.gripIdx].mu.toFixed(2)}
                  </div>

                  <div style={{ fontSize: 12, color: T.ink2, margin: '12px 0 6px', fontWeight: 600 }}>Driven wheels</div>
                  <Seg options={DRIVETRAIN_OPTS.map((o, i) => ({ label: o.label, value: i }))} value={car.driveIdx} onChange={(v) => setCar({ ...car, driveIdx: v })} />
                  <div style={{ fontSize: 11, color: T.ink3, marginTop: 4 }}>{DRIVETRAIN_OPTS[car.driveIdx].note}</div>

                  <div style={{ fontSize: 12, color: T.ink2, margin: '12px 0 6px', fontWeight: 600 }}>Tyre diameter: {car.tireDiameterIn} in</div>
                  <input type="range" min={22} max={32} step={1} value={car.tireDiameterIn} aria-label="Tyre diameter in inches"
                    onChange={(e) => setCar({ ...car, tireDiameterIn: Number(e.target.value) })} style={{ width: '100%', accentColor: T.cyan }} />
                  <div style={{ fontSize: 11, color: T.ink3, marginTop: 4 }}>A taller tyre is a longer lever against the engine — it acts like a numerically lower final drive, and raises the speed reached at any given RPM.</div>

                  <ExpandableInfo title="Why grip is a hard ceiling on acceleration">
                    However much torque you make, the tyre can only transmit what friction allows:
                    <br /><br /><span style={{ fontFamily: T.mono, color: T.cyan, fontSize: 11.5 }}>F_max = μ × N</span>
                    <br /><br />μ is the coefficient of friction, N the load pressing the driven tyres onto the road. Measured values: street tyres 0.8–0.9, good summer tyres about 1.0, racing slicks 1.7–1.9, prepared drag surfaces higher again.
                    <br /><br />Divide by mass and μ is directly a ceiling on acceleration in g. At μ = 0.85 the very best possible is 0.85 g <i>if every kilogram sat on the driven wheels</i> — and on a rear-drive car only about 47% does at rest. Past that point, more power simply makes smoke.
                    <br /><br /><b style={{ color: T.ink }}>Weight transfer is what rescues it.</b> Accelerating shifts load rearward by <span style={{ fontFamily: T.mono, color: T.cyan }}>ΔN = m × a × h ÷ L</span>, so grip grows with the very acceleration it enables. That is why a rear-drive car out-launches its static weight distribution, and why all-wheel drive wins anyway: it starts with all of it.
                    <br /><br />There is one more consequence worth noticing, because it surprises people. When the tyre is the limit, a = μ·g·f ÷ (1 − μ·h/L) — the mass cancels out entirely. Adding weight to a car that is already spinning its tyres does not slow the launch at all. It slows everything after it.
                  </ExpandableInfo>
                </BuildSection>
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
