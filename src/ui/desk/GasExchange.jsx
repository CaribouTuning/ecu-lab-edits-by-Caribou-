/**
 * The Physics app's breathing, cut away and running, drawn as the combustion cutaway is
 * (EngineCutaway.jsx, the same parts and colours): the airbox and its filter, the throttle
 * body's butterfly, the plenum and the intake runner; the cylinder with its head, valves on
 * their springs and cams, piston, rod and crank; and the exhaust port, header primary,
 * collector, catalytic converter, muffler and tailpipe. Gas is drawn as gas: fresh charge in
 * blue, burned gas in grey running to orange where it is hot and under pressure, each pipe's
 * fill lighter where its pressure wave is high and darker in its suction, and the charge
 * itself streaming through at the rate the model flows it.
 *
 * Every number and every colour is the model's, at the speed and throttle the page is set to:
 *   - the gas exchange (`gasExchangeTrace`, breathing.js), from the exhaust valve opening to
 *     the intake valve closing: cylinder pressure, each port's pressure (the wave arriving
 *     plus the one leaving), each valve's flow and open area, the fresh share;
 *   - the closed cycle (the pull's own `cycleTrace`, cycle.js): compression, burn, expansion;
 *   - each pipe's wave down its length, read from its port end's record: what is x along the
 *     pipe left the port x / a seconds ago.
 *
 * It runs only while it is on screen and the tab is showing, and holds still when the system
 * asks for less motion (the crank-angle slider still moves it).
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';

import { COEFF, gasExchangeTrace } from '../../sim/index.js';

import cut from './Apps.module.css';
import styles from './GasExchange.module.css';
import { useUnits } from '../units.js';

/** Seconds one engine cycle takes on screen, whatever the engine speed. */
const CYCLE_SECONDS = 3.6;
const RAD = Math.PI / 180;

/** @param {number} v @param {number} [d] */
const f = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '—');
/** @param {number} x */
const clamp01 = (x) => Math.max(0, Math.min(1, x));

/**
 * Reads a record (`xs` ascending crank degrees) at `deg`, linearly; null outside it.
 * @param {number[]} xs @param {number[]} ys @param {number} deg
 */
function readAt(xs, ys, deg) {
  if (!xs?.length || deg < xs[0] || deg > xs[xs.length - 1]) return null;
  let lo = 0; let hi = xs.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (xs[mid] <= deg) lo = mid; else hi = mid; }
  const t = xs[hi] === xs[lo] ? 0 : (deg - xs[lo]) / (xs[hi] - xs[lo]);
  return ys[lo] + (ys[hi] - ys[lo]) * t;
}

/** Wraps a crank angle into [-360, 360): 0 is TDC on the overlap, +/-360 firing TDC. @param {number} d */
const wrap = (d) => ((((d + 360) % 720) + 720) % 720) - 360;

/** A crank angle as a cam card says it. @param {number} d */
function cardAngle(d) {
  if (d < -180) return `${f(-180 - d, 0)}° BBDC`;
  if (d < 0) return `${f(-d, 0)}° BTDC`;
  if (d <= 180) return `${f(d, 0)}° ATDC`;
  return `${f(d - 180, 0)}° ABDC`;
}

/**
 * Points along a polyline, evenly by length.
 * @param {[number, number][]} pts @param {number} n
 * @returns {[number, number][]}
 */
function along(pts, n) {
  const seg = []; let total = 0;
  for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(l); total += l; }
  /** @type {[number, number][]} */
  const out = [];
  for (let k = 0; k <= n; k++) {
    let s = (k / n) * total; let i = 0;
    while (i < seg.length - 1 && s > seg[i]) { s -= seg[i]; i++; }
    const t = seg[i] > 0 ? s / seg[i] : 0;
    out.push([pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t]);
  }
  return out;
}

/** An SVG path through points, its corners rounded. @param {[number, number][]} pts @param {number} [r] */
function roundedPath(pts, r = 26) {
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i - 1]; const [x1, y1] = pts[i]; const [x2, y2] = pts[i + 1];
    const la = Math.hypot(x1 - x0, y1 - y0); const lb = Math.hypot(x2 - x1, y2 - y1);
    const a = Math.min(r, la / 2); const b = Math.min(r, lb / 2);
    const ux = (x1 - x0) / la; const uy = (y1 - y0) / la; const vx = (x2 - x1) / lb; const vy = (y2 - y1) / lb;
    d += ` L${x1 - ux * a} ${y1 - uy * a} Q${x1} ${y1} ${x1 + vx * b} ${y1 + vy * b}`;
  }
  const last = pts[pts.length - 1];
  return `${d} L${last[0]} ${last[1]}`;
}

const STROKES = /** @type {const} */ (['Intake', 'Compression', 'Power', 'Exhaust']);

/**
 * @param {object} props
 * @param {any} props.engineConfig the engine as built
 * @param {any} props.mods its bolt-ons (and catalyst)
 * @param {any} props.hwForVe the breathing's hardware argument (exhaust pipe, turbo, fuel)
 * @param {((rpm: number, kpa: number) => number)|null} props.camAt the calibrated intake cam advance
 * @param {any} props.point the pull's point at the chosen speed
 * @param {{deg: number[], bar: number[], burned: number[]}|null} props.cycleTrace that point's closed cycle
 * @param {any} props.derived the engine's derived geometry
 */
export function GasExchange({ engineConfig, mods, hwForVe, camAt, point, cycleTrace, derived }) {
  const U = useUnits();
  const rpm = point?.rpm ?? 3000;
  const mapKpa = point?.map ?? 100;
  const advance = camAt ? camAt(rpm, mapKpa) : 0;
  const gx = useMemo(
    () => gasExchangeTrace(engineConfig, mods ?? {}, { ...hwForVe, intakeCamAdvanceDeg: advance }, rpm, mapKpa),
    [engineConfig, mods, hwForVe, advance, rpm, mapKpa],
  );
  const tr = gx.trace;
  const ev = gx.events;
  const geo = gx.geometry;
  const gasLo = tr.deg[0]; const gasHi = tr.deg[tr.deg.length - 1];
  // The closed cycle in this frame: firing TDC is +/-360 here, 0 in cycle.js.
  const cyc = useMemo(() => (cycleTrace?.deg?.length
    ? { deg: cycleTrace.deg.map((d) => d + 360), bar: cycleTrace.bar, burned: cycleTrace.burned } : null), [cycleTrace]);
  const peakBar = Math.max(...(cyc?.bar ?? [10]), ...tr.cylKpa.map((k) => k / 100));
  const maxIn = Math.max(...tr.inAreaMm2, 1); const maxEx = Math.max(...tr.exAreaMm2, 1);
  const maxFlow = Math.max(...tr.inFlowGs.map(Math.abs), ...tr.exFlowGs.map(Math.abs), 1);

  // ---- the crank: turned by one animation-frame loop while the drawing is on screen ----
  const [deg, setDeg] = useState(-200);
  const [playing, setPlaying] = useState(true);
  const travel = useRef({ inT: 0, exT: 0 });
  const flowNow = useRef({ inF: 0, exF: 0 });
  const wrapRef = useRef(/** @type {HTMLDivElement|null} */ (null));
  useEffect(() => {
    if (!playing) return undefined;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined;
    let raf = 0; let last = 0; let visible = true;
    const tick = (t) => {
      raf = 0;
      const dt = last ? Math.min(0.05, (t - last) / 1000) : 0; last = t;
      // The charge streams at the rate it flows: the pipes' particles travel with it.
      travel.current.inT += (flowNow.current.inF / maxFlow) * dt * 0.9;
      travel.current.exT += (flowNow.current.exF / maxFlow) * dt * 0.9;
      setDeg((v) => wrap(v + (720 / CYCLE_SECONDS) * dt));
      if (visible && !document.hidden) raf = requestAnimationFrame(tick);
    };
    const start = () => { if (!raf) { last = 0; raf = requestAnimationFrame(tick); } };
    const io = typeof window.IntersectionObserver === 'function'
      ? new window.IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) start(); }, { threshold: 0.05 }) : null;
    if (wrapRef.current) io?.observe(wrapRef.current);
    const onVis = () => { if (!document.hidden) start(); };
    document.addEventListener('visibilitychange', onVis);
    start();
    return () => { if (raf) cancelAnimationFrame(raf); io?.disconnect(); document.removeEventListener('visibilitychange', onVis); };
  }, [playing, maxFlow]);

  // ---- the model at this crank angle ----
  const d = deg;
  const cycAt = (ys, dd) => (cyc ? readAt(cyc.deg, ys, dd < gasLo ? dd + 720 : dd) : null);
  const cylKpa = readAt(tr.deg, tr.cylKpa, d) ?? (cycAt(cyc?.bar ?? [], d) ?? mapKpa / 100) * 100;
  const burned = cycAt(cyc?.burned ?? [], d) ?? 0;
  const fresh = readAt(tr.deg, tr.freshShare, d);
  const inPort = (dd) => readAt(tr.deg, tr.inPortKpa, dd) ?? mapKpa;
  const exPort = (dd) => readAt(tr.deg, tr.exPortKpa, dd) ?? gx.empKpa;
  const inF = readAt(tr.deg, tr.inFlowGs, d) ?? 0; const exF = readAt(tr.deg, tr.exFlowGs, d) ?? 0;
  flowNow.current = { inF, exF };
  const liftIn = (readAt(tr.deg, tr.inAreaMm2, d) ?? 0) / maxIn;
  const liftEx = (readAt(tr.deg, tr.exAreaMm2, d) ?? 0) / maxEx;
  const strokeIdx = d >= 0 && d < 180 ? 0 : d >= 180 ? 1 : d < -180 ? 2 : 3;
  const sparkD = wrap(360 - (point?.timing ?? 20));

  // ---- the drawing: 960 x 460. The engine to its own bore, stroke and rod, as in the
  // combustion cutaway; the pipes in proportion where they fit, their real lengths labelled. ----
  const W = 960; const H = 480;
  const bore = derived?.bore ?? 90; const stroke = derived?.stroke ?? 86;
  const r = stroke / 2; const l = r * COEFF.ROD_RATIO;
  const area = (Math.PI * bore * bore) / 4; const vc = (area * stroke) / Math.max(1.5, (derived?.compression ?? 10) - 1);
  const cx = 470; const cy = 370; const pistonComp = bore * 0.3;
  const k = Math.min(130 / bore, (cy - 190) / (r + l + pistonComp + vc / area));
  const halfBore = (bore * k) / 2; const rk = r * k;
  const th = d * RAD;
  const xPin = r * Math.cos(th) + Math.sqrt(l * l - (r * Math.sin(th)) ** 2);
  const pinY = cy - xPin * k; const pistonTop = pinY - pistonComp * k; const pistonH = bore * 0.62 * k;
  const deckY = cy - (r + l + pistonComp + vc / area) * k; const headTop = deckY - 112; const roofY = deckY - 20;
  const crankPinX = cx + rk * Math.sin(th); const crankPinY = cy - rk * Math.cos(th);
  const blockL = cx - halfBore - 34; const blockR = cx + halfBore + 34;
  const portY = deckY - 70;
  const PIPE = 26;

  const airX = 24; const tbX = 150; const plX = 210; const plW = 64;
  const colX = 700; const exitY = cy - 30;
  /** @type {[number, number][]} */
  const runnerPts = [[plX + plW, portY], [blockL, portY]];
  /** @type {[number, number][]} */
  const primaryPts = [[blockR, portY], [blockR + 60, portY], [blockR + 92, exitY], [colX, exitY]];
  const catX = colX + 44; const catW = 82; const mufX = catX + catW + 22; const mufW = 92;
  const N = 26;
  const runnerSeg = along(runnerPts, N); const primarySeg = along(primaryPts, N);
  const halfRunner = gx.runnerRoundTripDeg / 2; const halfPrimary = gx.primaryRoundTripDeg / 2;
  // Fresh charge brighter where the wave is high, darker in its suction; burned gas grey,
  // running to orange where it is hot and pushed.
  const freshOpacity = (kpa) => 0.35 + 0.6 * clamp01(0.5 + (kpa - mapKpa) / 36);
  const hotShare = (kpa) => clamp01((kpa - gx.empKpa) / 60 + 0.25);
  // The same as solid colours, mixed from the theme's: a stack of see-through segments
  // darkened wherever two overlapped and striped the pipes.
  const freshMix = (kpa) => `color-mix(in srgb, var(--cut-fresh) ${Math.round(freshOpacity(kpa) * 100)}%, var(--cut-metal-dark))`;
  const hotMix = (hot) => `color-mix(in srgb, var(--cut-burn) ${Math.round(hot * 85)}%, var(--cut-exhaust))`;

  /** One valve on its spring under its cam, as the combustion cutaway draws it. */
  const valve = (side, lift, centreD) => {
    const s = side === 'in' ? -1 : 1;
    const a = 22 * RAD * s;
    const seatX = cx + s * halfBore * 0.48; const seatY = deckY - 8;
    const down = lift * halfBore * 0.22;
    const ux = Math.sin(a); const uy = -Math.cos(a);
    const hx = seatX - ux * down; const hy = seatY - uy * down;
    const stemLen = 74; const coils = [];
    for (let i = 0; i <= 12; i += 1) {
      const t = i / 12; const dd = 32 + 30 * t - down * (1 - t); const off = i % 2 ? 7 : -7;
      coils.push(`${(seatX + ux * dd + Math.cos(a) * off).toFixed(1)},${(seatY + uy * dd + Math.sin(a) * off).toFixed(1)}`);
    }
    const camX = seatX + ux * (stemLen + 14); const camY = seatY + uy * (stemLen + 14);
    const camDeg = (d - centreD) / 2 + a / RAD + 180;
    const headW = halfBore * 0.36;
    return (
      <g>
        <polyline points={coils.join(' ')} className={cut.cutSpring} />
        <line x1={hx} y1={hy} x2={hx + ux * stemLen} y2={hy + uy * stemLen} className={cut.cutStem} />
        <path d={`M${hx - Math.cos(a) * headW} ${hy - Math.sin(a) * headW} L${hx + Math.cos(a) * headW} ${hy + Math.sin(a) * headW} L${hx + ux * 7 + Math.cos(a) * 2} ${hy + uy * 7 + Math.sin(a) * 2} L${hx + ux * 7 - Math.cos(a) * 2} ${hy + uy * 7 - Math.sin(a) * 2} Z`} className={cut.cutValve} />
        <g transform={`translate(${camX.toFixed(1)} ${camY.toFixed(1)}) rotate(${camDeg.toFixed(1)})`}>
          <path d="M0 -14 C 11 -14 14 -4 13 5 C 11 14 4 23 0 23 C -4 23 -11 14 -13 5 C -14 -4 -11 -14 0 -14 Z" className={cut.cutCam} />
          <circle r="4.5" className={cut.cutHub} />
        </g>
      </g>
    );
  };

  // The charge in the cylinder: fresh and burned in the shares the model tracks.
  const freshShare = fresh ?? (strokeIdx === 1 ? 1 : strokeIdx === 2 ? 1 - burned : 0);
  const flame = burned > 0 && burned < 0.98 && (strokeIdx === 1 || strokeIdx === 2) ? burned * (1 - burned) * 4 : 0;
  const cylPressShare = clamp01(Math.log10(Math.max(1, cylKpa / 100)) / Math.log10(Math.max(2, peakBar)));
  const chamber = `M${cx - halfBore} ${deckY} L${cx} ${roofY} L${cx + halfBore} ${deckY} L${cx + halfBore} ${pistonTop} L${cx - halfBore} ${pistonTop} Z`;
  const portShape = (s) => `M${s < 0 ? blockL : blockR} ${portY - PIPE / 2} L${cx + s * halfBore * 0.7} ${portY - PIPE / 2} L${cx + s * halfBore * 0.22} ${deckY - 18} L${cx + s * halfBore * 0.66} ${deckY - 12} L${cx + s * halfBore * 0.9} ${portY + PIPE / 2} L${s < 0 ? blockL : blockR} ${portY + PIPE / 2} Z`;

  // The charge moving: dots along each path, travelling with the flow.
  /** @type {[number, number][]} */
  const intakePath = [[airX + 70, portY], [plX + plW, portY], [blockL, portY], [cx - halfBore * 0.5, deckY - 16]];
  /** @type {[number, number][]} */
  const exhaustPath = [[cx + halfBore * 0.5, deckY - 16], ...primaryPts, [W - 6, exitY]];
  const inLine = useMemo(() => along(intakePath, 80), [airX, plX, plW, blockL, portY, cx, halfBore, deckY]); // eslint-disable-line react-hooks/exhaustive-deps
  const exLine = useMemo(() => along(exhaustPath, 120), [blockR, portY, exitY, colX, cx, halfBore, deckY]); // eslint-disable-line react-hooks/exhaustive-deps
  const dots = (pts, t, count) => Array.from({ length: count }, (_, i) => {
    const u = ((((i / count) + t) % 1) + 1) % 1;
    const p = pts[Math.min(pts.length - 1, Math.floor(u * (pts.length - 1)))];
    return [p[0], p[1] + (((i * 7) % 5) - 2) * 3];
  });
  const inDots = Math.abs(inF) > 1 ? dots(inLine, travel.current.inT, 16) : [];
  const exDots = Math.abs(exF) > 1 ? dots(exLine, travel.current.exT, 22) : [];

  // ---- the charts under it, against the cycle's crank angle ----
  const X = (dd) => 40 + ((dd + 360) / 720) * 880;
  const cylPath = useMemo(() => {
    const pts = [];
    for (let dd = -360; dd < 360; dd += 2) {
      const g = readAt(tr.deg, tr.cylKpa, dd);
      const c = g == null && cyc ? readAt(cyc.deg, cyc.bar, dd < gasLo ? dd + 720 : dd) : null;
      const bar = g != null ? g / 100 : c;
      if (bar != null) pts.push(`${(40 + ((dd + 360) / 720) * 880).toFixed(1)},${(150 - (bar / (peakBar * 1.05)) * 130).toFixed(1)}`);
    }
    return pts.join(' ');
  }, [tr, cyc, gasLo, peakBar]);
  const portRange = useMemo(() => {
    const all = [...tr.inPortKpa, ...tr.exPortKpa, mapKpa, gx.empKpa];
    return [Math.min(...all) - 5, Math.max(...all) + 5];
  }, [tr, mapKpa, gx.empKpa]);
  const PY = (kpa) => 150 - ((kpa - portRange[0]) / (portRange[1] - portRange[0])) * 130;
  const line = (ys) => tr.deg.map((dd, i) => `${X(dd).toFixed(1)},${PY(ys[i]).toFixed(1)}`).join(' ');
  const liftLine = (ys, max) => tr.deg.map((dd, i) => `${X(dd).toFixed(1)},${(150 - (ys[i] / max) * 56).toFixed(1)}`).join(' ');
  const maxA = Math.max(...tr.inAreaMm2, ...tr.exAreaMm2, 1);
  const primaryReturn = wrap(gasLo + gx.primaryRoundTripDeg);

  const drop = gx.exhaustDropKpa;
  const dropTotal = drop.manifold + drop.catalyst + drop.catback + drop.turbine;
  const dropRows = /** @type {[string, number][]} */ ([
    [geo.headers ? 'Headers' : 'Cast manifold', drop.manifold],
    [mods?.catalyst === 'none' ? 'No catalyst' : mods?.catalyst === 'metallic' ? 'High-flow catalyst' : 'Catalyst', drop.catalyst],
    [mods?.exhaust ? 'Free-flow cat-back' : 'Stock cat-back', drop.catback],
    ...(drop.turbine > 0 ? /** @type {[string, number][]} */ ([['Turbine', drop.turbine]]) : []),
  ]);
  const slowMo = Math.round(CYCLE_SECONDS / (120 / rpm));
  const catCells = mods?.catalyst === 'metallic' ? 7 : 12;
  const labels = /** @type {[string, number, number, number, number][]} */ ([
    ['Air filter', airX + 6, portY - 60, airX + 30, portY - 46],
    ['Throttle', tbX - 26, portY - 40, tbX, portY - 26],
    ['Plenum', plX + 8, portY - 104, plX + plW / 2, portY - 92],
    [`Runner ${f(geo.runnerLengthMm, 0)} × ${f(geo.runnerBoreMm, 0)} mm`, plX + plW + 4, portY + 40, (plX + plW + blockL) / 2, portY + 14],
    ['Camshafts', cx - 30, headTop - 22, cx - halfBore * 0.48 - 30, headTop + 16],
    ['Intake valve', blockL - 96, headTop + 6, cx - halfBore * 0.52, deckY - 14],
    ['Exhaust valve', blockR + 18, headTop + 6, cx + halfBore * 0.52, deckY - 14],
    [`${geo.headers ? 'Header primary' : 'Manifold runner'} ${f(geo.primaryLengthMm, 0)} × ${f(geo.primaryBoreMm, 0)} mm`, blockR + 118, portY + 46, blockR + 86, portY + 30],
    ['Collector', colX - 6, exitY + 44, colX + 20, exitY + 14],
    [mods?.catalyst === 'none' ? 'Test pipe' : mods?.catalyst === 'metallic' ? 'High-flow cat' : 'Catalytic converter', catX - 4, exitY - 44, catX + catW / 2, exitY - 30],
    [`${mods?.exhaust ? 'Free-flow muffler' : 'Muffler'}, ${U.metric ? U.fmtLength(hwForVe?.exhaustDia ?? 3) : `${f(hwForVe?.exhaustDia ?? 3, 2)} in`} pipe`, mufX - 40, exitY + 52, mufX + mufW / 2, exitY + 30],
    ['Piston', blockR + 22, pistonTop + pistonH * 0.55, cx + halfBore - 4, pistonTop + pistonH * 0.5],
    ['Crankshaft', cx + rk + 50, cy + 30, cx + 12, cy + 4],
  ]);

  return (
    <div className={cut.cutWrap} ref={wrapRef}>
      <ol className={cut.strokeBar} aria-label="The four strokes">
        {STROKES.map((name, j) => <li key={name} className={cut.strokePill} data-on={j === strokeIdx ? 'true' : undefined}>{name}</li>)}
      </ol>
      <div className={styles.scroller}>
        <svg viewBox={`0 0 ${W} ${H}`} className={`${cut.cutSvg} ${styles.svg}`} role="img"
          aria-label={`The engine breathing at ${rpm} RPM, ${cardAngle(d)}: ${STROKES[strokeIdx].toLowerCase()} stroke, cylinder ${f(cylKpa, 0)} kPa`}>
          {/* ---------- intake: airbox and filter, throttle, plenum, runner ---------- */}
          <rect x={airX} y={portY - 46} width={86} height={92} rx={10} className={cut.cutCase} />
          <rect x={airX + 10} y={portY - 36} width={30} height={72} rx={3} className={cut.cutOil} />
          {Array.from({ length: 7 }, (_, i) => <line key={i} x1={airX + 13 + i * 4} x2={airX + 13 + i * 4} y1={portY - 34} y2={portY + 34} className={cut.cutRing} />)}
          <rect x={airX + 86} y={portY - PIPE / 2 - 5} width={tbX - airX - 104} height={PIPE + 10} className={cut.cutBlock} />
          <rect x={airX + 86} y={portY - PIPE / 2} width={tbX - airX - 104} height={PIPE} className={cut.gasFresh} opacity={freshOpacity(101.3)} />
          <circle cx={tbX} cy={portY} r={26} className={cut.cutCase} />
          <circle cx={tbX} cy={portY} r={PIPE / 2 + 1} className={cut.gasFresh} opacity={freshOpacity(mapKpa)} />
          <line x1={tbX} y1={portY - PIPE / 2} x2={tbX} y2={portY + PIPE / 2} className={cut.cutStem}
            transform={`rotate(${(90 - clamp01(mapKpa / 101.3) * 82).toFixed(1)} ${tbX} ${portY})`} />
          <rect x={tbX + 26} y={portY - PIPE / 2 - 5} width={plX - tbX - 26} height={PIPE + 10} className={cut.cutBlock} />
          <rect x={tbX + 26} y={portY - PIPE / 2} width={plX - tbX - 26} height={PIPE} className={cut.gasFresh} opacity={freshOpacity(mapKpa)} />
          <rect x={plX} y={portY - 92} width={plW} height={150} rx={18} className={cut.cutCase} />
          <rect x={plX + 7} y={portY - 85} width={plW - 14} height={136} rx={13} className={cut.gasFresh} opacity={freshOpacity(mapKpa)} />
          <path d={`M${plX + plW - 4} ${portY} L${blockL + 2} ${portY}`} stroke="var(--cut-metal-dark)" strokeWidth={PIPE + 10} />
          {runnerSeg.slice(0, -1).map(([x0, y0], i) => {
            const [x1, y1] = runnerSeg[i + 1];
            const kpa = inPort(d - (1 - (i + 0.5) / N) * halfRunner);
            return <line key={i} x1={x0} y1={y0} x2={x1 + (x1 - x0) * 0.25} y2={y1 + (y1 - y0) * 0.25} style={{ stroke: freshMix(kpa) }} strokeWidth={PIPE} />;
          })}

          {/* ---------- the cylinder, as the combustion cutaway draws it ---------- */}
          <rect x={blockL} y={deckY} width={34} height={cy - rk - 30 - deckY} className={cut.cutBlock} />
          <rect x={cx + halfBore} y={deckY} width={34} height={cy - rk - 30 - deckY} className={cut.cutBlock} />
          <rect x={blockL + 8} y={deckY + 8} width={14} height={cy - rk - 50 - deckY} rx={4} className={cut.cutCoolant} />
          <rect x={cx + halfBore + 12} y={deckY + 8} width={14} height={cy - rk - 50 - deckY} rx={4} className={cut.cutCoolant} />
          <path d={`M${blockL} ${deckY} L${blockL} ${headTop} L${blockR} ${headTop} L${blockR} ${deckY} L${cx + halfBore} ${deckY} L${cx} ${roofY} L${cx - halfBore} ${deckY} Z`} className={cut.cutHead} />
          <path d={portShape(-1)} className={cut.gasFresh} opacity={freshOpacity(inPort(d))} />
          <path d={portShape(1)} className={cut.gasSpent} opacity={0.45 + 0.5 * liftEx} />
          <path d={portShape(1)} className={cut.gasBurn} opacity={0.75 * hotShare(exPort(d))} />
          <path d={chamber} className={cut.gasSpent} opacity={0.55 + 0.4 * cylPressShare} />
          <path d={chamber} className={cut.gasFresh} opacity={(0.3 + 0.6 * cylPressShare) * freshShare} />
          <path d={chamber} className={cut.gasBurn} opacity={strokeIdx === 1 || strokeIdx === 2 ? 0.85 * burned * cylPressShare : 0} />
          {flame > 0.02 && <circle cx={cx} cy={roofY + 6} r={6 + burned * halfBore} className={cut.cutFlame} opacity={0.6 * flame} />}
          {valve('in', liftIn, (ev.ivo + ev.ivc) / 2)}
          {valve('ex', liftEx, (ev.evo + ev.evc) / 2)}
          <rect x={cx - 6} y={headTop - 12} width={12} height={roofY - headTop - 2} rx={3} className={cut.cutPlug} />
          <rect x={cx - 3} y={roofY - 14} width={6} height={12} className={cut.cutPlugTip} />
          {Math.abs(wrap(d - sparkD)) < 8 && <path d={`M${cx} ${roofY - 2} l7 11 l-9 2 l9 13 l-16 -13 l9 -2 z`} className={cut.cutSpark} />}
          <path d={`M${blockL} ${cy - rk - 30} L${cx - rk - 44} ${cy - 10} L${cx - rk - 44} ${cy + rk + 22} L${cx + rk + 44} ${cy + rk + 22} L${cx + rk + 44} ${cy - 10} L${blockR} ${cy - rk - 30} Z`} className={cut.cutCase} />
          <g transform={`rotate(${(d % 360).toFixed(1)} ${cx} ${cy})`}>
            <path d={`M${cx - rk * 1.15} ${cy + 4} A ${rk * 1.15} ${rk * 1.15} 0 0 0 ${cx + rk * 1.15} ${cy + 4} Z`} className={cut.cutCounter} />
            <rect x={cx - 10} y={cy - rk - 10} width={20} height={rk + 16} rx={10} className={cut.cutWeb} />
          </g>
          <circle cx={cx} cy={cy} r={11} className={cut.cutHub} />
          <line x1={cx - halfBore} y1={deckY} x2={cx - halfBore} y2={cy - rk - 30} className={cut.cutBore} />
          <line x1={cx + halfBore} y1={deckY} x2={cx + halfBore} y2={cy - rk - 30} className={cut.cutBore} />
          <line x1={crankPinX} y1={crankPinY} x2={cx} y2={pinY} className={cut.cutRod} />
          <circle cx={crankPinX} cy={crankPinY} r={8} className={cut.cutHub} />
          <rect x={cx - halfBore + 1.5} y={pistonTop} width={halfBore * 2 - 3} height={pistonH} rx={3} className={cut.cutPiston} />
          {[0.07, 0.15, 0.23].map((t) => <line key={t} x1={cx - halfBore + 1.5} x2={cx + halfBore - 1.5} y1={pistonTop + pistonH * t} y2={pistonTop + pistonH * t} className={cut.cutRing} />)}
          <circle cx={cx} cy={pinY} r={6} className={cut.cutHub} />

          {/* ---------- exhaust: primary, collector, catalyst, muffler, tailpipe ---------- */}
          <path d={roundedPath(primaryPts)} fill="none" stroke="var(--cut-metal-dark)" strokeWidth={PIPE + 10} strokeLinejoin="round" />
          {primarySeg.slice(0, -1).map(([x0, y0], i) => {
            const [x1, y1] = primarySeg[i + 1];
            const hot = hotShare(exPort(d - ((i + 0.5) / N) * halfPrimary));
            return (
              <line key={i} x1={x0} y1={y0} x2={x1 + (x1 - x0) * 0.25} y2={y1 + (y1 - y0) * 0.25} style={{ stroke: hotMix(hot) }} strokeWidth={PIPE} />
            );
          })}
          <path d={`M${colX} ${exitY - PIPE / 2 - 5} L${colX + 44} ${exitY - 14} L${colX + 44} ${exitY + 14} L${colX} ${exitY + PIPE / 2 + 5} Z`} className={cut.cutCase} />
          <path d={`M${colX} ${exitY - PIPE / 2} L${colX + 44} ${exitY - 9} L${colX + 44} ${exitY + 9} L${colX} ${exitY + PIPE / 2} Z`} className={cut.gasSpent} opacity={0.6} />
          <rect x={catX} y={exitY - 30} width={catW} height={60} rx={20} className={cut.cutCase} />
          {mods?.catalyst !== 'none' && (
            <g>
              <rect x={catX + 14} y={exitY - 20} width={catW - 28} height={40} rx={4} className={cut.cutBlock} />
              {Array.from({ length: catCells }, (_, i) => (
                <line key={i} x1={catX + 14} x2={catX + catW - 14} y1={exitY - 20 + ((i + 0.5) * 40) / catCells} y2={exitY - 20 + ((i + 0.5) * 40) / catCells}
                  stroke="var(--cut-exhaust)" strokeWidth={40 / catCells - 1.4} opacity={0.75} />
              ))}
            </g>
          )}
          <rect x={catX + catW} y={exitY - 9} width={mufX - catX - catW} height={18} className={cut.gasSpent} opacity={0.6} />
          <rect x={mufX} y={exitY - (mods?.exhaust ? 26 : 32)} width={mufW} height={mods?.exhaust ? 52 : 64} rx={26} className={cut.cutCase} />
          {!mods?.exhaust && [0.36, 0.64].map((t) => <line key={t} x1={mufX + mufW * t} x2={mufX + mufW * t} y1={exitY - 28} y2={exitY + 28} className={cut.cutBore} />)}
          <rect x={mufX + 6} y={exitY - 7} width={mufW - 12} height={14} className={cut.gasSpent} opacity={0.55} />
          {Array.from({ length: 8 }, (_, i) => <circle key={i} cx={mufX + 12 + i * ((mufW - 24) / 7)} cy={exitY - 7} r={1.6} className={cut.cutHub} />)}
          <rect x={mufX + mufW} y={exitY - 8} width={W - mufX - mufW} height={16} className={cut.gasSpent} opacity={0.6} />

          {/* the charge moving: fresh in, burned out, at the rate the model flows it */}
          {inDots.map(([x, y], i) => <circle key={`i${i}`} cx={x} cy={y} r={2.6} className={cut.gasFresh} />)}
          {exDots.map(([x, y], i) => <circle key={`e${i}`} cx={x} cy={y} r={2.6} className={cut.gasBurn} />)}

          {labels.map(([t, lx, ly, tx, ty]) => (
            <g key={t}>
              <line x1={lx + Math.min(60, t.length * 2.8)} y1={ly + 3} x2={tx} y2={ty} className={cut.cutLeader} />
              <text x={lx} y={ly} className={cut.cutLabel}>{t}</text>
            </g>
          ))}
        </svg>
      </div>

      <div className={styles.side}>
        <dl className={cut.liveEq}>
          <dt>Crank angle</dt><dd>{cardAngle(d)} ({STROKES[strokeIdx].toLowerCase()} stroke)</dd>
          <dt>Cylinder</dt><dd>p = {f(cylKpa, 0)} kPa{fresh != null ? `, ${f(fresh * 100, 0)}% fresh charge` : burned > 0 && strokeIdx === 2 ? `, ${f(burned * 100, 0)}% burned` : ''}</dd>
          <dt>Intake port</dt><dd>p = p<sub>plenum</sub> + wave = {f(mapKpa, 0)} {inPort(d) >= mapKpa ? '+' : '−'} {f(Math.abs(inPort(d) - mapKpa), 1)} = {f(inPort(d), 0)} kPa</dd>
          <dt>Exhaust port</dt><dd>p = p<sub>collector</sub> + wave = {f(gx.empKpa, 0)} {exPort(d) >= gx.empKpa ? '+' : '−'} {f(Math.abs(exPort(d) - gx.empKpa), 1)} = {f(exPort(d), 0)} kPa</dd>
          <dt>Valve flow</dt><dd>ṁ = C<sub>d</sub>A p<sub>up</sub> ψ / √(RT): intake {f(inF, 0)} g/s, exhaust {f(exF, 0)} g/s</dd>
          <dt>Valves</dt><dd>intake {f(liftIn * 100, 0)}% open, exhaust {f(liftEx * 100, 0)}% open</dd>
        </dl>
        <div className={cut.cutControls}>
          <button type="button" onClick={() => setPlaying(!playing)} aria-pressed={!playing}>{playing ? 'Pause' : 'Play'}</button>
          <input type="range" min={-360} max={359} value={Math.round(d)} aria-label="Crank angle" aria-valuetext={cardAngle(d)}
            onChange={(e) => { setPlaying(false); setDeg(Number(e.target.value)); }} />
        </div>
        <p className={cut.panelNote}>Shown {slowMo.toLocaleString('en-US')}× slower than {rpm.toLocaleString('en-US')} RPM at {f(mapKpa, 0)} kPa. Blue is fresh charge, grey burned gas, orange where it is hot and pushed; each pipe is lighter where its wave is high.</p>
      </div>

      <div className={`${styles.charts} ${styles.scroller}`}>
        <svg viewBox="0 0 960 170" className={styles.chart} role="img" aria-label="Cylinder pressure across the whole cycle">
          <rect x={X(ev.ivo)} y={14} width={Math.max(0, X(ev.evc) - X(ev.ivo))} height={136} className={styles.overlap} />
          {[-360, -180, 0, 180, 360].map((dd) => <line key={dd} x1={X(dd)} x2={X(dd)} y1={14} y2={150} className={styles.grid} />)}
          <polyline points={cylPath} className={styles.cylLine} />
          <text x={X(-360) + 4} y={164} className={styles.lab}>firing TDC</text>
          <text x={X(-180)} y={164} className={styles.lab} textAnchor="middle">BDC</text>
          <text x={X(0)} y={164} className={styles.lab} textAnchor="middle">TDC overlap</text>
          <text x={X(180)} y={164} className={styles.lab} textAnchor="middle">BDC</text>
          <text x={44} y={26} className={styles.lab}>cylinder pressure, peak {f(peakBar, 0)} bar</text>
          <line x1={X(d)} x2={X(d)} y1={14} y2={150} className={styles.cursor} />
        </svg>
        <svg viewBox="0 0 960 170" className={styles.chart} role="img" aria-label="Port pressures and valve lift through the gas exchange">
          <rect x={X(ev.ivo)} y={14} width={Math.max(0, X(ev.evc) - X(ev.ivo))} height={136} className={styles.overlap} />
          <polyline points={liftLine(tr.inAreaMm2, maxA)} className={styles.liftIn} />
          <polyline points={liftLine(tr.exAreaMm2, maxA)} className={styles.liftEx} />
          <line x1={X(gasLo)} x2={X(gasHi)} y1={PY(mapKpa)} y2={PY(mapKpa)} className={styles.refIn} />
          <line x1={X(gasLo)} x2={X(gasHi)} y1={PY(gx.empKpa)} y2={PY(gx.empKpa)} className={styles.refEx} />
          <polyline points={line(tr.inPortKpa)} className={styles.portLineIn} />
          <polyline points={line(tr.exPortKpa)} className={styles.portLineEx} />
          <line x1={X(primaryReturn)} x2={X(primaryReturn)} y1={14} y2={150} className={styles.waveMark} />
          <text x={X(primaryReturn) + 4} y={26} className={styles.lab}>blowdown&apos;s echo back at the valve</text>
          {[[ev.evo, 'EVO'], [ev.ivo, 'IVO'], [ev.evc, 'EVC'], [ev.ivc, 'IVC']].map(([dd, kk]) => (
            <text key={kk} x={X(dd)} y={164} className={styles.lab} textAnchor="middle">{kk}</text>
          ))}
          <text x={916} y={26} className={styles.lab} textAnchor="end">port pressures, kPa ({f(portRange[0], 0)}–{f(portRange[1], 0)}); valve lift shaded</text>
          <line x1={X(d)} x2={X(d)} y1={14} y2={150} className={styles.cursor} />
        </svg>
        <div className={styles.key}>
          <span><i className={styles.kIn} />intake port</span><span><i className={styles.kEx} />exhaust port</span>
          <span><i className={styles.kCyl} />cylinder</span><span><i className={styles.kOv} />valve overlap</span>
        </div>
      </div>

      <div className={styles.numbers}>
        <dl className={styles.nums}>
          <dt>Volumetric efficiency</dt><dd>{f(gx.ve, 1)} %</dd>
          <dt>Residual (burned gas kept)</dt><dd>{f(gx.residualFrac * 100, 1)} %</dd>
          <dt>Charge pushed back up the runner</dt><dd>{f(gx.backflowShare * 100, 1)} %</dd>
          <dt>Runner wave round trip</dt><dd>{f(gx.runnerRoundTripDeg, 0)}° of crank ({f(geo.runnerLengthMm, 0)} × {f(geo.runnerBoreMm, 0)} mm, R {f(geo.runnerReflection, 2)} at the plenum)</dd>
          <dt>Primary wave round trip</dt><dd>{f(gx.primaryRoundTripDeg, 0)}° of crank ({f(geo.primaryLengthMm, 0)} × {f(geo.primaryBoreMm, 0)} mm, R {f(geo.collectorReflection, 2)} at the collector)</dd>
          <dt>Valve events (seat)</dt><dd>IVO {cardAngle(ev.ivo)}, IVC {cardAngle(ev.ivc)}<br />EVO {cardAngle(ev.evo)}, EVC {cardAngle(ev.evc)}</dd>
          <dt>Valves</dt><dd>{geo.intakeValves} × {f(geo.intakeValveMm, 1)} mm intake, {geo.exhaustValves} × {f(geo.exhaustValveMm, 1)} mm exhaust</dd>
        </dl>
        <div className={styles.dropBox} aria-label="Exhaust back-pressure, part by part">
          <div className={styles.dropHead}>Exhaust back-pressure <b>{f(dropTotal, 1)} kPa</b> <span>({U.metric ? `${f(dropTotal / 100, 3)} bar` : `${f(dropTotal * 0.145, 2)} psi`}) at {f(gx.exhaustFlowGs, 0)} g/s</span></div>
          {dropRows.map(([kk, v]) => (
            <div key={kk} className={styles.dropRow}>
              <span>{kk}</span>
              <span className={styles.dropBar}><i style={{ width: `${dropTotal > 0 ? (v / dropTotal) * 100 : 0}%` }} /></span>
              <b>{f(v, 1)}</b>
            </div>
          ))}
          <p className={styles.dropNote}>Each part&apos;s loss goes as its coefficient times the pipe&apos;s dynamic pressure, ½ρu²: the bigger the pipe, the slower the gas and the smaller every loss.</p>
        </div>
      </div>
    </div>
  );
}
