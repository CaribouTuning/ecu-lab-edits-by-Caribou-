/**
 * The engine's breathing on the Physics page, as three live cutaways drawn the way the
 * combustion cutaway is (EngineCutaway.jsx: its parts, its colours, its labels on leaders):
 *
 *   - IntakeCutaway: the air filter, the throttle body's butterfly, the plenum and a runner
 *     to each cylinder of a bank, down through the ports past the valves into the bores;
 *   - HeaderCutaway: the same bank from the exhaust side, its exhaust valves, ports and the
 *     primary tubes merging in the collector;
 *   - ExhaustSystemCutaway: the collector's outlet, the oxygen sensors, the catalytic
 *     converter's substrate, the muffler's chambers and the tailpipe, with the pressure along
 *     the pipe drawn under it.
 *
 * Every number and colour is the model's (`gasExchangeTrace`, breathing.js) at the speed and
 * throttle the page is set to: each port's pressure (the wave arriving plus the one leaving),
 * each valve's flow and open area, the waves' speed in each pipe, the back-pressure of each
 * part of the exhaust. A pipe is lighter where its wave is high and darker in its suction; the
 * gas in it streams at the rate the model flows it. Cylinders other than number 1 run the same
 * trace at their place in the firing order.
 *
 * Each runs only while it is on screen and the tab is showing, and holds still when the system
 * asks for less motion (the crank-angle slider still moves it).
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';

import { COEFF } from '../../sim/index.js';

import cut from './Apps.module.css';
import styles from './Breathing.module.css';
import { useUnits } from '../units.js';

/** Seconds one engine cycle takes on screen, whatever the engine speed. */
const CYCLE_SECONDS = 3.6;
const RAD = Math.PI / 180;

/** @param {number} v @param {number} [d] */
const f = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '—');
/** @param {number} x */
const clamp01 = (x) => Math.max(0, Math.min(1, x));
/** Wraps a crank angle into [-360, 360): 0 is TDC on the overlap, +/-360 firing TDC. @param {number} d */
const wrap = (d) => ((((d + 360) % 720) + 720) % 720) - 360;

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

/** A crank angle as a cam card says it. @param {number} d */
export function cardAngle(d) {
  if (d < -180) return `${f(-180 - d, 0)}° BBDC`;
  if (d < 0) return `${f(-d, 0)}° BTDC`;
  if (d <= 180) return `${f(d, 0)}° ATDC`;
  return `${f(d - 180, 0)}° ABDC`;
}

/** The stroke a cylinder is on at a crank angle in this frame. @param {number} d */
const strokeOf = (d) => (d >= 0 && d < 180 ? 0 : d >= 180 ? 1 : d < -180 ? 2 : 3);
const STROKES = /** @type {const} */ (['Intake', 'Compression', 'Power', 'Exhaust']);

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
function roundedPath(pts, r = 24) {
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

/** Points along a rounded path, for the gas segments and the particles that ride it. */
function roundedAlong(pts, n, r = 24) {
  // Sample the path's own geometry (its corners rounded) rather than the polyline's.
  /** @type {[number, number][]} */
  const dense = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i - 1]; const [x1, y1] = pts[i]; const [x2, y2] = pts[i + 1];
    const la = Math.hypot(x1 - x0, y1 - y0); const lb = Math.hypot(x2 - x1, y2 - y1);
    const a = Math.min(r, la / 2); const b = Math.min(r, lb / 2);
    const p0 = [x1 - ((x1 - x0) / la) * a, y1 - ((y1 - y0) / la) * a];
    const p2 = [x1 + ((x2 - x1) / lb) * b, y1 + ((y2 - y1) / lb) * b];
    dense.push(/** @type {[number, number]} */ (p0));
    for (let t = 0.25; t < 1; t += 0.25) {
      dense.push([(1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * x1 + t * t * p2[0], (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * y1 + t * t * p2[1]]);
    }
    dense.push(/** @type {[number, number]} */ (p2));
  }
  dense.push(pts[pts.length - 1]);
  return along(dense, n);
}

/** Pipe segments: each a short line from one sample to the next, overlapping a little. */
const segs = (pts) => pts.slice(0, -1).map(([x0, y0], i) => {
  const [x1, y1] = pts[i + 1];
  return [x0, y0, x1 + (x1 - x0) * 0.3, y1 + (y1 - y0) * 0.3];
});

/** Dots spread along a path, `t` (0-1, wrapping) how far the gas has moved. */
const dots = (pts, t, count, jitter = 2.5) => Array.from({ length: count }, (_, i) => {
  const u = ((((i / count) + t) % 1) + 1) % 1;
  const p = pts[Math.min(pts.length - 1, Math.floor(u * (pts.length - 1)))];
  return [p[0], p[1] + (((i * 7) % 5) - 2) * jitter];
});

/** Labels on leaders, as the combustion cutaway sets them. */
function Labels({ items, W }) {
  return (
    <>
      {items.map(([t, lx, ly, tx, ty]) => (
        <g key={t}>
          <line x1={lx < W / 2 ? lx + t.length * 5.4 + 4 : lx - t.length * 5.4 - 4} y1={ly - 3} x2={tx} y2={ty} className={cut.cutLeader} />
          <text x={lx} y={ly} className={cut.cutLabel} textAnchor={lx < W / 2 ? 'start' : 'end'}>{t}</text>
        </g>
      ))}
    </>
  );
}

// Firing orders, by cylinder number: an inline four 1-3-4-2, an inline six 1-5-3-6-2-4, the
// 60° V6 1-2-3-4-5-6 (odd bank 1-3-5), GM's cross-plane V8 1-8-7-2-6-5-4-3 (odd bank 1-3-5-7,
// fired unevenly: 0°, 180°, 450°, 630°).
const FIRING = /** @type {Record<string, number[]>} */ ({ I4: [1, 3, 4, 2], I6: [1, 5, 3, 6, 2, 4], V6: [1, 2, 3, 4, 5, 6], V8: [1, 8, 7, 2, 6, 5, 4, 3] });

/**
 * The cylinders a diagram draws, front to back, and how far behind cylinder 1 each fires.
 * @param {string} configuration @param {number} [perCollector] primaries into one collector
 *   (the header's group: a bank, all four of an I4, three of an I6)
 * @returns {{n: number, offset: number}[]}
 */
export function bankOf(configuration, perCollector) {
  const order = FIRING[configuration] ?? FIRING.V6;
  const total = order.length;
  const offset = (c) => (order.indexOf(c) * 720) / total;
  const vee = /^V/.test(configuration);
  let cyls = vee ? Array.from({ length: total / 2 }, (_, i) => 2 * i + 1) : Array.from({ length: total }, (_, i) => i + 1);
  if (perCollector && cyls.length > perCollector) cyls = cyls.slice(0, perCollector);
  return cyls.map((n) => ({ n, offset: offset(n) }));
}

/**
 * The crank, turned by one animation-frame loop while the drawing is on screen, and the gas
 * moving with it: `onTick(dt)` integrates whatever flows the drawing set for this frame.
 * @param {React.RefObject<HTMLElement|null>} wrapRef
 * @param {React.MutableRefObject<((dt: number) => void)|null>} tickRef
 */
function useCrank(wrapRef, tickRef) {
  const [deg, setDeg] = useState(-200);
  const [playing, setPlaying] = useState(true);
  useEffect(() => {
    if (!playing) return undefined;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined;
    let raf = 0; let last = 0; let visible = true;
    const tick = (t) => {
      raf = 0;
      const dt = last ? Math.min(0.05, (t - last) / 1000) : 0; last = t;
      tickRef.current?.(dt);
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
  }, [playing, wrapRef, tickRef]);
  return { deg, setDeg, playing, setPlaying };
}

/** The model's port pressures, flows and valve openings at any crank angle. */
function readers(gx) {
  const tr = gx.trace;
  const maxIn = Math.max(...tr.inAreaMm2, 1); const maxEx = Math.max(...tr.exAreaMm2, 1);
  const at = (ys, dd, dflt) => readAt(tr.deg, ys, wrap(dd)) ?? dflt;
  return {
    inPort: (dd) => at(tr.inPortKpa, dd, gx.mapKpa),
    exPort: (dd) => at(tr.exPortKpa, dd, gx.empKpa),
    inFlow: (dd) => at(tr.inFlowGs, dd, 0),
    exFlow: (dd) => at(tr.exFlowGs, dd, 0),
    inLift: (dd) => at(tr.inAreaMm2, dd, 0) / maxIn,
    exLift: (dd) => at(tr.exAreaMm2, dd, 0) / maxEx,
    maxFlow: Math.max(...tr.inFlowGs.map(Math.abs), ...tr.exFlowGs.map(Math.abs), 1),
  };
}

/** Fresh charge as a solid colour: brighter where the wave is high, darker in its suction. */
const freshMix = (kpa, ref) => `color-mix(in srgb, var(--cut-fresh) ${Math.round((0.35 + 0.6 * clamp01(0.5 + (kpa - ref) / 36)) * 100)}%, var(--cut-metal-dark))`;
/** Burned gas: grey, running to orange where it is pushed, to dark in the suction behind a pulse. */
const hotMix = (kpa, ref) => (kpa >= ref
  ? `color-mix(in srgb, var(--cut-burn) ${Math.round(clamp01(0.2 + (kpa - ref) / 50) * 90)}%, var(--cut-exhaust))`
  : `color-mix(in srgb, var(--cut-metal-dark) ${Math.round(clamp01((ref - kpa) / 25) * 80)}%, var(--cut-exhaust))`);

/**
 * The bank's cylinders under a head, to the engine's own bore, stroke and rod: the piston
 * at each one's place in the cycle, the charge above it by stroke.
 */
function bankGeometry({ derived, n, W, deckY, bottomY, margin = 34 }) {
  const bore = derived?.bore ?? 90; const stroke = derived?.stroke ?? 86;
  const r = stroke / 2; const l = r * COEFF.ROD_RATIO;
  const area = (Math.PI * bore * bore) / 4; const clear = ((area * stroke) / Math.max(1.5, (derived?.compression ?? 10) - 1)) / area;
  const comp = bore * 0.3;
  const pitch = (W - 2 * margin) / n;
  let halfBore = Math.min(pitch * 0.37, 46);
  let k = (2 * halfBore) / bore;
  const total = r + l + comp + clear;
  // Room under the crank for its throw and counterweight.
  if (deckY + (total + r * 1.3) * k > bottomY) { k = (bottomY - deckY) / (total + r * 1.3); halfBore = (bore * k) / 2; }
  const crankY = deckY + total * k;
  const xs = Array.from({ length: n }, (_, j) => margin + pitch * (j + 0.5));
  /** The piston pin's height for a crank angle. @param {number} d */
  const pinY = (d) => crankY - (r * Math.cos(d * RAD) + Math.sqrt(l * l - (r * Math.sin(d * RAD)) ** 2)) * k;
  // The block and head: a jacket's width either side of the outer bores, as the combustion
  // cutaway draws one cylinder's.
  const bx0 = xs[0] - halfBore - 30; const bx1 = xs[n - 1] + halfBore + 30;
  return { bore, k, r, rk: r * k, comp: comp * k, pistonH: bore * 0.62 * k, halfBore, pitch, xs, crankY, pinY, margin, bx0, bx1 };
}

/**
 * Each cylinder of the bank, cut away end on and running at its own place in the firing order,
 * as the per-cylinder row of a cutaway poster draws them: the piston on the engine's own slider
 * crank, both valves at their lift, the charge by stroke, the spark. Drawn apart from the
 * manifold so no tube ever crosses a bore.
 */
function CylinderStrip({ bank, d, R, derived, W, y0, sparkD, burnedAt, label }) {
  const n = bank.length; const margin = 26;
  const pitch = (W - 2 * margin) / n;
  const bore = derived?.bore ?? 90; const stroke = derived?.stroke ?? 86;
  const r = stroke / 2; const l = r * COEFF.ROD_RATIO;
  const clear = stroke / Math.max(1.5, (derived?.compression ?? 10) - 1);
  const comp = bore * 0.3;
  const bw = Math.min(pitch * 0.5, 44); const k = bw / bore;
  const deck = y0 + 42;
  const crankY = deck + (r + l + comp + clear) * k;
  const rk = r * k;
  const pistonH = bore * 0.55 * k;
  return (
    <g>
      <text x={margin} y={y0 + 8} className={cut.artText}>{label}</text>
      {bank.map((c, j) => {
        const x = margin + pitch * (j + 0.5);
        const dj = wrap(d - c.offset);
        const th = dj * RAD;
        const pinY = crankY - (r * Math.cos(th) + Math.sqrt(l * l - (r * Math.sin(th)) ** 2)) * k;
        const top = pinY - comp * k;
        const st = strokeOf(dj);
        const burned = burnedAt(dj);
        const inL = R.inLift(dj); const exL = R.exLift(dj);
        const cls = st <= 1 ? cut.gasFresh : st === 2 ? cut.gasBurn : cut.gasSpent;
        const op = st === 2 ? 0.45 + 0.5 * (1 - burned * 0.5) : st === 1 ? 0.8 : 0.6;
        const vw = bw * 0.2; const drop = bw * 0.16;
        const pinX = x + rk * Math.sin(th); const pinY2 = crankY - rk * Math.cos(th);
        return (
          <g key={c.n}>
            {/* ports above the head: fresh charge in on the left, burned gas out on the right */}
            <rect x={x - bw / 2 - 2} y={deck - 26} width={bw * 0.42} height={12} rx={2} className={cut.gasFresh} opacity={0.25 + 0.7 * inL} />
            <rect x={x + bw / 2 + 2 - bw * 0.42} y={deck - 26} width={bw * 0.42} height={12} rx={2} className={cut.gasSpent} opacity={0.25 + 0.7 * exL} />
            <rect x={x - bw / 2 - 6} y={deck - 14} width={bw + 12} height={14} className={cut.cutHead} />
            <rect x={x - bw / 2 - 6} y={deck} width={6} height={crankY - rk - 6 - deck} className={cut.cutBlock} />
            <rect x={x + bw / 2} y={deck} width={6} height={crankY - rk - 6 - deck} className={cut.cutBlock} />
            <path d={`M${x - bw / 2} ${deck} L${x} ${deck - 6} L${x + bw / 2} ${deck} L${x + bw / 2} ${top} L${x - bw / 2} ${top} Z`} className={cls} opacity={op} />
            {(st === 1 || st === 2) && burned > 0.02 && burned < 0.97 && <circle cx={x} cy={deck - 2} r={2 + burned * bw * 0.45} className={cut.cutFlame} opacity={0.6 * (1 - burned * 0.6)} />}
            {Math.abs(wrap(dj - sparkD)) < 10 && <path d={`M${x} ${deck - 5} l4 6 l-5 1 l5 8 l-9 -8 l5 -1 z`} className={cut.cutSpark} />}
            {[[-1, inL], [1, exL]].map(([sgn, lift]) => (
              <g key={sgn}>
                <line x1={x + sgn * bw * 0.24} y1={deck - 14} x2={x + sgn * bw * 0.24} y2={deck - 3 + lift * drop} className={cut.cutStem} style={{ strokeWidth: 2 }} />
                <rect x={x + sgn * bw * 0.24 - vw / 2} y={deck - 4 + lift * drop} width={vw} height={2.5} className={cut.cutValve} />
              </g>
            ))}
            <line x1={x} y1={pinY} x2={pinX} y2={pinY2} className={cut.cutRod} style={{ strokeWidth: Math.max(3, bw * 0.12) }} />
            <rect x={x - bw / 2 + 1} y={top} width={bw - 2} height={pistonH} rx={2} className={cut.cutPiston} />
            {[0.1, 0.22].map((t) => <line key={t} x1={x - bw / 2 + 1} x2={x + bw / 2 - 1} y1={top + pistonH * t} y2={top + pistonH * t} className={cut.cutRing} />)}
            <g transform={`rotate(${(dj % 360).toFixed(1)} ${x} ${crankY})`}>
              <path d={`M${x - rk * 1.2} ${crankY + 2} A ${rk * 1.2} ${rk * 1.2} 0 0 0 ${x + rk * 1.2} ${crankY + 2} Z`} className={cut.cutCounter} />
            </g>
            <circle cx={x} cy={crankY} r={Math.max(3, rk * 0.35)} className={cut.cutHub} />
            <circle cx={pinX} cy={pinY2} r={Math.max(2.5, rk * 0.22)} className={cut.cutHub} />
            <text x={x} y={crankY + rk * 1.2 + 14} className={cut.artText} textAnchor="middle">{c.n} · {STROKES[st]}</text>
          </g>
        );
      })}
    </g>
  );
}

/** The bank's block from outside: solid casting, the bores behind it as hidden (dashed) lines,
 *  as an engineering drawing shows what is behind a face. */
function BlockFace({ g, top, bottom }) {
  return (
    <g>
      <rect x={g.bx0} y={top} width={g.bx1 - g.bx0} height={bottom - top} className={cut.cutBlock} />
      {g.xs.map((x) => (
        <g key={x}>
          <rect x={x - g.halfBore} y={top + 4} width={g.halfBore * 2} height={bottom - top - 8} fill="none" stroke="var(--ink3)" strokeWidth={1} strokeDasharray="4 3" />
          <circle cx={x - g.halfBore - 6} cy={top + 8} r={2.4} className={cut.cutHub} />
          <circle cx={x + g.halfBore + 6} cy={top + 8} r={2.4} className={cut.cutHub} />
        </g>
      ))}
    </g>
  );
}

/** A valve seen along the bank: head, stem and spring, lifted `lift` of the way. */
function Valve({ x, seatY, lift, halfBore, topY, spring = true }) {
  const down = lift * halfBore * 0.24;
  const hw = Math.max(5, halfBore * 0.3);
  const y = seatY + down;
  const coils = [];
  const s0 = topY + 20; const s1 = topY + 4;
  for (let i = 0; i <= 10; i += 1) coils.push(`${(x + (i % 2 ? 5 : -5)).toFixed(1)},${(s0 + (s1 - s0) * (i / 10) + down * (1 - i / 10) * 0.6).toFixed(1)}`);
  return (
    <g>
      {spring && <polyline points={coils.join(' ')} className={cut.cutSpring} />}
      <line x1={x} y1={y} x2={x} y2={topY + down * 0.6} className={cut.cutStem} />
      <path d={`M${x - hw} ${y} L${x + hw} ${y} L${x + 2} ${y - 7} L${x - 2} ${y - 7} Z`} className={cut.cutValve} />
    </g>
  );
}

/** A cam lobe on its shaft, turning at half the crank's speed; at full lift it points down. */
function Lobe({ x, y, d, centre, size = 1 }) {
  const a = (d - centre) / 2 + 180;
  return (
    <g transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${a.toFixed(1)}) scale(${size})`}>
      <path d="M0 -10 C 8 -10 10 -3 9 3.5 C 8 10 3 16 0 16 C -3 16 -8 10 -9 3.5 C -10 -3 -8 -10 0 -10 Z" className={cut.cutCam} />
      <circle r="3.2" className={cut.cutHub} />
    </g>
  );
}

/** The side panel's small chart: a port's pressure against crank angle through the gas exchange. */
function PortChart({ gx, ys, refKpa, d, tone, lift, marks, label }) {
  const tr = gx.trace;
  const W = 300; const H = 120;
  const lo = Math.min(...ys, refKpa) - 4; const hi = Math.max(...ys, refKpa) + 4;
  const x = (dd) => 8 + ((dd - tr.deg[0]) / (tr.deg[tr.deg.length - 1] - tr.deg[0])) * (W - 16);
  const y = (k) => H - 18 - ((k - lo) / (hi - lo)) * (H - 34);
  const maxL = Math.max(...lift, 1);
  const pts = tr.deg.map((dd, i) => `${x(dd).toFixed(1)},${y(ys[i]).toFixed(1)}`).join(' ');
  const liftPts = `${x(tr.deg[0])},${H - 18} ${tr.deg.map((dd, i) => `${x(dd).toFixed(1)},${(H - 18 - (lift[i] / maxL) * 30).toFixed(1)}`).join(' ')} ${x(tr.deg[tr.deg.length - 1])},${H - 18}`;
  const now = readAt(tr.deg, ys, d);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={cut.pvSvg} role="img" aria-label={`${label}; now ${now == null ? 'outside the valve events' : `${f(now, 0)} kPa`}`}>
      <polygon points={liftPts} className={tone === 'in' ? styles.liftFillIn : styles.liftFillEx} />
      <line x1={8} x2={W - 8} y1={y(refKpa)} y2={y(refKpa)} className={tone === 'in' ? styles.refIn : styles.refEx} />
      <polyline points={pts} className={tone === 'in' ? styles.portLineIn : styles.portLineEx} />
      {marks.map(([dd, t], i) => (
        <g key={t}>
          <line x1={x(dd)} x2={x(dd)} y1={14} y2={H - 18} className={styles.grid} />
          {/* A mark too close to the one before it says its name at the top instead. */}
          <text x={x(dd)} y={i > 0 && Math.abs(x(dd) - x(marks[i - 1][0])) < 34 ? 24 : H - 6} className={cut.artText} textAnchor="middle">{t}</text>
        </g>
      ))}
      {now != null && <circle cx={x(d)} cy={y(now)} r={4.5} className={cut.pvDot} />}
      <text x={10} y={12} className={cut.artText}>{label}</text>
    </svg>
  );
}

/**
 * @typedef {object} BreathingProps
 * @property {any} gx the model's gas exchange at the page's speed and throttle (`gasExchangeTrace`)
 * @property {any} point the pull's point at that speed
 * @property {any} derived the engine's derived geometry
 * @property {any} engineConfig the engine as built
 * @property {any} [mods] its bolt-ons and catalyst
 * @property {number} [exhaustDia] the exhaust pipe, inches
 * @property {number} [throttleFrac] the throttle's opening, 0-1
 */

/** @param {BreathingProps} props */
export function IntakeCutaway({ gx, point, derived, engineConfig, throttleFrac = 1 }) {
  const wrapRef = useRef(/** @type {HTMLDivElement|null} */ (null));
  const R = useMemo(() => readers(gx), [gx]);
  const bank = useMemo(() => bankOf(engineConfig?.configuration ?? 'V6'), [engineConfig?.configuration]);
  const travel = useRef(/** @type {number[]} */ ([]));
  const inlet = useRef(0);
  const tickRef = useRef(/** @type {((dt: number) => void)|null} */ (null));
  const { deg: d, setDeg, playing, setPlaying } = useCrank(wrapRef, tickRef);
  tickRef.current = (dt) => {
    bank.forEach((c, j) => { travel.current[j] = (travel.current[j] ?? 0) + (R.inFlow(d - c.offset) / R.maxFlow) * dt * 0.8; });
    inlet.current += dt * 0.12 * clamp01(throttleFrac + 0.15);
  };

  const ev = gx.events; const geo = gx.geometry;
  const W = 480; const H = 616;
  const headTop = 232; const deckY = 318;
  const g = bankGeometry({ derived, n: bank.length, W, deckY, bottomY: deckY + 260, margin: 84 });
  const blockBot = deckY + 70; const stripY = blockBot + 14;
  const centreIn = (ev.ivo + ev.ivc) / 2;
  const sparkD = wrap(360 - (point?.timing ?? 20));
  const RW = Math.min(g.pitch * 0.34, 26);
  const flangeY = 276;
  const valvesX = (x) => (geo.intakeValves > 1 ? [x - g.halfBore * 0.45, x + g.halfBore * 0.45] : [x]);
  const plTop = 108; const plBot = 162;
  const tbX = 146; const tbY = 46;
  const runners = useMemo(() => g.xs.map((x) => /** @type {[number, number][]} */ ([[x + g.pitch * 0.22, plBot - 6], [x + g.pitch * 0.22, plBot + 22], [x, plBot + 66], [x, flangeY]])), [g.xs, g.pitch]);
  const runnerPts = useMemo(() => runners.map((pts) => roundedAlong(pts, 22, 18)), [runners]);
  /** @type {[number, number][]} */
  const inletPath = [[24, tbY], [tbX, tbY], [232, tbY], [232, plTop + 8], [W - 40, plTop + 26]];
  const inletPts = useMemo(() => roundedAlong(inletPath, 40, 18), []); // eslint-disable-line react-hooks/exhaustive-deps
  const half = gx.runnerRoundTripDeg / 2;
  const mapKpa = gx.mapKpa;
  const s1 = strokeOf(d);
  const port1 = R.inPort(d);
  const flow1 = R.inFlow(d);
  const burnedAt = (dd) => (strokeOf(dd) === 2 ? clamp01(1 - Math.exp(-5 * ((wrap(dd - sparkD) + 0) / Math.max(30, point?.burnDeg ?? 50)) ** 3)) : 0);
  const butterfly = 90 - clamp01(throttleFrac) * 84;
  const intakeK = gx.intakeK; const a = gx.intakeSoundMs;
  const slowMo = Math.round(CYCLE_SECONDS / (120 / gx.rpm));

  const labels = /** @type {[string, number, number, number, number][]} */ ([
    ['Air filter', 8, 98, 36, 80],
    [`Throttle ${f(throttleFrac * 100, 0)}% open`, W - 8, 24, tbX + 22, tbY - 8],
    [`Plenum ${f(mapKpa, 0)} kPa`, W - 8, plTop - 8, g.bx1 + 10, plTop + 12],
    [`Runner ${f(geo.runnerLengthMm, 0)} mm`, 8, plBot + 40, g.xs[0] + g.pitch * 0.22 - RW / 2, plBot + 30],
    ['Camshaft', W - 8, headTop + 4, g.bx1 - 8, headTop + 22],
    ['Intake valves', 8, headTop + 34, valvesX(g.xs[0])[0] - 6, deckY - 10],
    ['Ports', 8, headTop + 66, g.xs[0] - RW / 2, flangeY + 14],
    ['Chambers', W - 8, deckY - 18, g.xs[g.xs.length - 1] + g.halfBore * 0.5, deckY - 5],
    ['Block', 8, deckY + 44, g.bx0 + 4, deckY + 44],
  ]);

  return (
    <div className={cut.cutWrap} ref={wrapRef}>
      <ol className={cut.strokeBar} aria-label="Cylinder 1's stroke">
        {STROKES.map((name, j) => <li key={name} className={cut.strokePill} data-on={j === s1 ? 'true' : undefined}>{name}</li>)}
      </ol>
      <div className={cut.cutSplit}>
        <svg viewBox={`0 0 ${W} ${H}`} className={cut.cutSvg} role="img"
          aria-label={`The intake at ${gx.rpm} RPM: plenum ${f(mapKpa, 0)} kPa, cylinder 1 on its ${STROKES[s1].toLowerCase()} stroke, its port at ${f(port1, 0)} kPa`}>
          {/* air filter, its pleated element */}
          <rect x={10} y={16} width={74} height={62} rx={9} className={cut.cutCase} />
          <rect x={18} y={24} width={28} height={46} rx={3} className={cut.cutOil} />
          {Array.from({ length: 6 }, (_, i) => <line key={i} x1={21 + i * 4.4} x2={21 + i * 4.4} y1={26} y2={68} className={cut.cutRing} />)}
          {/* the inlet duct, throttle body and the elbow into the plenum */}
          <path d={roundedPath([[84, tbY], [232, tbY], [232, plTop + 6]], 22)} fill="none" stroke="var(--cut-metal-dark)" strokeWidth={30} />
          <path d={roundedPath([[84, tbY], [232, tbY], [232, plTop + 6]], 22)} fill="none" style={{ stroke: freshMix(101.3, mapKpa) }} strokeWidth={20} />
          <circle cx={tbX} cy={tbY} r={23} className={cut.cutCase} />
          <circle cx={tbX} cy={tbY} r={13} style={{ fill: freshMix(mapKpa, mapKpa) }} />
          <line x1={tbX} y1={tbY - 13} x2={tbX} y2={tbY + 13} className={cut.cutStem} transform={`rotate(${butterfly.toFixed(1)} ${tbX} ${tbY})`} />
          <circle cx={tbX} cy={tbY} r={2.5} className={cut.cutHub} />
          {/* plenum */}
          <rect x={g.bx0 + 10} y={plTop} width={g.bx1 - g.bx0 + 20} height={plBot - plTop} rx={24} className={cut.cutCase} />
          <rect x={g.bx0 + 18} y={plTop + 7} width={g.bx1 - g.bx0 + 4} height={plBot - plTop - 14} rx={18} style={{ fill: freshMix(mapKpa, mapKpa) }} />
          {/* head: cam cover, camshaft, the ports' channels and the valves */}
          <rect x={g.bx0} y={headTop} width={g.bx1 - g.bx0} height={deckY - headTop} className={cut.cutHead} />
          <rect x={g.bx0} y={headTop} width={g.bx1 - g.bx0} height={10} rx={3} className={cut.cutBlock} />
          <line x1={g.bx0 + 6} x2={g.bx1 - 6} y1={headTop + 22} y2={headTop + 22} className={cut.cutRod} style={{ strokeWidth: 5 }} />
          {g.xs.map((x, j) => {
            const dj = d - bank[j].offset;
            const kpa = R.inPort(dj);
            const lift = R.inLift(dj);
            const vx = valvesX(x);
            return (
              <g key={`p${j}`}>
                <path d={vx.length > 1
                  ? `M${x - RW / 2} ${flangeY} L${x + RW / 2} ${flangeY} L${vx[1] + g.halfBore * 0.32} ${deckY - 10} L${vx[1] - g.halfBore * 0.22} ${deckY - 10} L${x} ${flangeY + 18} L${vx[0] + g.halfBore * 0.22} ${deckY - 10} L${vx[0] - g.halfBore * 0.32} ${deckY - 10} Z`
                  : `M${x - RW / 2} ${flangeY} L${x + RW / 2} ${flangeY} L${x + g.halfBore * 0.36} ${deckY - 10} L${x - g.halfBore * 0.36} ${deckY - 10} Z`}
                  style={{ fill: freshMix(kpa, mapKpa) }} opacity={0.55 + 0.45 * lift} />
                {vx.map((v) => <Valve key={v} x={v} seatY={deckY - 8} lift={lift} halfBore={g.halfBore} topY={headTop + 22} />)}
                {vx.map((v) => <Lobe key={`c${v}`} x={v} y={headTop + 22} d={dj} centre={centreIn} size={Math.min(1, g.halfBore / 30)} />)}
              </g>
            );
          })}
          {/* the block from outside, bores behind it dashed; each cylinder's chamber in the cut head */}
          <BlockFace g={g} top={deckY} bottom={blockBot} />
          {g.xs.map((x, j) => {
            const st = strokeOf(wrap(d - bank[j].offset));
            return <path key={`ch${j}`} d={`M${x - g.halfBore} ${deckY} L${x} ${deckY - 12} L${x + g.halfBore} ${deckY} Z`} className={st <= 1 ? cut.gasFresh : st === 2 ? cut.gasBurn : cut.gasSpent} opacity={0.75} />;
          })}
          {g.xs.map((x, j) => <text key={`n${j}`} x={x} y={deckY + 16} className={cut.artText} textAnchor="middle">{bank[j].n}</text>)}
          <CylinderStrip bank={bank} d={d} R={R} derived={derived} W={W} y0={stripY} sparkD={sparkD} burnedAt={burnedAt}
            label="Each cylinder, at its own place in the firing order" />
          {/* runners: the wave in each, at its cylinder's place in the cycle */}
          {runners.map((pts, j) => (
            <path key={`ro${j}`} d={roundedPath(pts, 18)} fill="none" stroke="var(--cut-metal-dark)" strokeWidth={RW + 8} />
          ))}
          {runnerPts.map((pts, j) => {
            const dj = d - bank[j].offset;
            const n = pts.length - 1;
            return segs(pts).map(([x0, y0, x1, y1], i) => (
              <line key={`r${j}-${i}`} x1={x0} y1={y0} x2={x1} y2={y1} style={{ stroke: freshMix(R.inPort(dj - (1 - (i + 0.5) / n) * half), mapKpa) }} strokeWidth={RW} />
            ));
          })}
          {g.xs.map((x) => <rect key={`fl${x}`} x={x - RW / 2 - 6} y={flangeY - 5} width={RW + 12} height={8} rx={2} className={cut.cutBlock} />)}
          {/* the charge moving */}
          {dots(inletPts, inlet.current, 18).map(([x, y], i) => <circle key={`a${i}`} cx={x} cy={y} r={2.2} className={cut.gasFresh} />)}
          {runnerPts.map((pts, j) => (Math.abs(R.inFlow(d - bank[j].offset)) > 1
            ? dots(pts, travel.current[j] ?? 0, 7, 1.5).map(([x, y], i) => <circle key={`d${j}-${i}`} cx={x} cy={y} r={2.2} className={cut.gasFresh} />)
            : null))}
          <Labels items={labels} W={W} />
        </svg>
        <div className={cut.cutSide}>
          <p className={cut.cutStroke}>
            <b>Cylinder 1, {STROKES[s1].toLowerCase()}.</b>{' '}
            {R.inLift(d) > 0.02
              ? flow1 >= 0
                ? `Its intake valves are ${f(R.inLift(d) * 100, 0)}% open and ${f(flow1, 0)} g/s is going in. The runner's wave sets the pressure at the valve: ${port1 >= mapKpa ? 'now above' : 'now below'} the plenum by ${f(Math.abs(port1 - mapKpa), 1)} kPa.`
                : `The piston is pushing charge back up the runner, ${f(-flow1, 0)} g/s: the valve is still open past bottom dead centre and the port is below the cylinder's pressure.`
              : 'Its intake valves are shut. The runner still rings with the wave the last opening started; the next cylinder in the firing order draws on the plenum.'}
          </p>
          <PortChart gx={gx} ys={gx.trace.inPortKpa} refKpa={mapKpa} d={wrap(d)} tone="in" lift={gx.trace.inAreaMm2}
            marks={[[ev.ivo, 'IVO'], [ev.ivc, 'IVC']]} label="intake port, kPa; dashed: plenum; shaded: valve open" />
          <dl className={cut.liveEq}>
            <dt>Crank angle</dt><dd>{cardAngle(wrap(d))} (cylinder 1)</dd>
            <dt>Throttle</dt><dd>{f(throttleFrac * 100, 0)}% open: 101.3 → {f(mapKpa, 0)} kPa in the plenum</dd>
            <dt>Wave speed</dt><dd>a = √(γRT) = √(1.4 × 287 × {f(intakeK, 0)}) = {f(a, 0)} m/s</dd>
            <dt>Round trip</dt><dd>2L/a = 2 × {f(geo.runnerLengthMm / 1000, 3)} / {f(a, 0)} = {f((2 * geo.runnerLengthMm) / 1000 / a * 1000, 2)} ms = {f(gx.runnerRoundTripDeg, 0)}° of crank</dd>
            <dt>Plenum end</dt><dd>R = {f(geo.runnerReflection, 2)}: a wave comes back {geo.runnerReflection < 0 ? 'inverted, suction as pressure' : 'the same sign'}</dd>
            <dt>Valve flow</dt><dd>ṁ = C<sub>d</sub>A p<sub>up</sub> ψ / √(RT) = {f(flow1, 0)} g/s</dd>
            <dt>Filling</dt><dd>VE {f(gx.ve, 1)}%, {f(gx.backflowShare * 100, 1)}% pushed back up the runner</dd>
          </dl>
          <div className={cut.cutControls}>
            <button type="button" onClick={() => setPlaying(!playing)} aria-pressed={!playing}>{playing ? 'Pause' : 'Play'}</button>
            <input type="range" min={-360} max={359} value={Math.round(wrap(d))} aria-label="Crank angle" aria-valuetext={cardAngle(wrap(d))}
              onChange={(e) => { setPlaying(false); setDeg(Number(e.target.value)); }} />
          </div>
          <p className={cut.panelNote}>Shown {slowMo.toLocaleString('en-US')}× slower than {gx.rpm.toLocaleString('en-US')} RPM. Cylinders {bank.map((c) => c.n).join(', ')} in their firing order; each runner lighter where its wave is high, darker in its suction.</p>
        </div>
      </div>
    </div>
  );
}

/** @param {BreathingProps} props */
export function HeaderCutaway({ gx, point, derived, engineConfig }) {
  const wrapRef = useRef(/** @type {HTMLDivElement|null} */ (null));
  const R = useMemo(() => readers(gx), [gx]);
  const geo = gx.geometry; const ev = gx.events;
  const bank = useMemo(() => bankOf(engineConfig?.configuration ?? 'V6', geo.primariesPerCollector), [engineConfig?.configuration, geo.primariesPerCollector]);
  const travel = useRef(/** @type {number[]} */ ([]));
  const out = useRef(0);
  const tickRef = useRef(/** @type {((dt: number) => void)|null} */ (null));
  const { deg: d, setDeg, playing, setPlaying } = useCrank(wrapRef, tickRef);
  tickRef.current = (dt) => {
    bank.forEach((c, j) => { travel.current[j] = (travel.current[j] ?? 0) + (R.exFlow(d - c.offset) / R.maxFlow) * dt * 0.8; });
    out.current += dt * 0.22;
  };

  const W = 480;
  const camY = 34; const headTop = 22; const deckY = 128; const blockBot = 214;
  const g = bankGeometry({ derived, n: bank.length, W, deckY, bottomY: deckY + 250, margin: 84 });
  const centreEx = (ev.evo + ev.evc) / 2;
  const sparkD = wrap(360 - (point?.timing ?? 20));
  const PW = Math.min(g.pitch * 0.3, 22);
  const flangeY = 78;
  const valvesX = (x) => (geo.exhaustValves > 1 ? [x - g.halfBore * 0.45, x + g.halfBore * 0.45] : [x]);
  // A merge collector: the primaries meet side by side and a cone takes them down to the
  // outlet at a 15-degree included angle, the usual figure (Burns Stainless, "Collectors",
  // Vince in Shorts part one: about 15 degrees for most, 7 to 18 across applications).
  const colX = W / 2 + 10; const colTop = 300;
  const spacing = PW + 2;
  const inletHalf = (spacing * bank.length) / 2 + 3; const outletHalf = PW * 0.8;
  const coneLen = Math.min(150, (inletHalf - outletHalf) / Math.tan(7.5 * RAD));
  const colY = colTop + coneLen;
  const stripY = colY + 72;
  const H = stripY + 196;
  const primaries = useMemo(() => g.xs.map((x, j) => {
    const mx = colX + (j - (bank.length - 1) / 2) * spacing;
    return /** @type {[number, number][]} */ ([[x, flangeY], [x, flangeY + 70 + j * 10], [x + (mx - x) * 0.55, 250 + j * 8], [mx, colTop - 30], [mx, colTop]]);
  }), [g.xs, bank.length, colX, spacing]);
  const primaryPts = useMemo(() => primaries.map((p) => roundedAlong(p, 26, 30)), [primaries]);
  /** @type {[number, number][]} */
  const outlet = [[colX, colY - 2], [colX, colY + 24], [W - 4, colY + 24]];
  const outletPts = useMemo(() => roundedAlong(outlet, 20, 26), [colX, colY]); // eslint-disable-line react-hooks/exhaustive-deps
  const half = gx.primaryRoundTripDeg / 2;
  const emp = gx.empKpa;
  const s1 = strokeOf(d);
  const port1 = R.exPort(d);
  const flow1 = R.exFlow(d);
  const burnedAt = (dd) => (strokeOf(dd) === 2 ? clamp01(1 - Math.exp(-5 * (wrap(dd - sparkD) / Math.max(30, point?.burnDeg ?? 50)) ** 3)) : 0);
  // The collector sees every primary's pulse as it arrives.
  const collKpa = bank.reduce((s, c) => s + R.exPort(d - c.offset - half), 0) / bank.length;
  const a = gx.exhaustSoundMs; const slowMo = Math.round(CYCLE_SECONDS / (120 / gx.rpm));
  const echo = wrap(ev.evo + gx.primaryRoundTripDeg);
  const n = bank.length;

  const labels = /** @type {[string, number, number, number, number][]} */ ([
    ['Camshaft', 8, 30, g.bx0 + 6, camY],
    ['Exhaust valves', W - 8, 30, (valvesX(g.xs[n - 1]).at(-1) ?? 0) + 6, deckY - 12],
    ['Ports', 8, 78, g.xs[0] - PW / 2 - 6, flangeY + 8],
    ['Cylinder head', 8, deckY - 20, g.bx0 + 4, deckY - 24],
    ['Block', W - 8, deckY + 60, g.bx1 - 6, deckY + 60],
    [`${geo.headers ? 'Primaries' : 'Runners'} ${f(geo.primaryLengthMm, 0)} × ${f(geo.primaryBoreMm, 0)} mm`, 8, 340, primaries[0][2][0] - PW / 2, primaries[0][2][1] + 14],
    [`Merge collector, ${n} into 1, 15°`, 8, colTop + coneLen / 2, colX - (inletHalf + outletHalf) / 2 - 4, colTop + coneLen / 2],
    ['To the catalytic converter', W - 8, colY + 50, W - 40, colY + 30],
  ]);

  return (
    <div className={cut.cutWrap} ref={wrapRef}>
      <ol className={cut.strokeBar} aria-label="Cylinder 1's stroke">
        {STROKES.map((name, j) => <li key={name} className={cut.strokePill} data-on={j === s1 ? 'true' : undefined}>{name}</li>)}
      </ol>
      <div className={cut.cutSplit}>
        <svg viewBox={`0 0 ${W} ${H}`} className={cut.cutSvg} role="img"
          aria-label={`The exhaust header at ${gx.rpm} RPM: cylinder 1 on its ${STROKES[s1].toLowerCase()} stroke, its port at ${f(port1, 0)} kPa, the collector at ${f(collKpa, 0)} kPa`}>
          {/* the block from outside; the head cut open along its exhaust ports */}
          <BlockFace g={g} top={deckY} bottom={blockBot} />
          <rect x={g.bx0} y={headTop} width={g.bx1 - g.bx0} height={deckY - headTop} className={cut.cutHead} />
          <rect x={g.bx0} y={headTop} width={g.bx1 - g.bx0} height={8} rx={3} className={cut.cutBlock} />
          <line x1={g.bx0 + 6} x2={g.bx1 - 6} y1={camY} y2={camY} className={cut.cutRod} style={{ strokeWidth: 5 }} />
          {g.xs.map((x, j) => {
            const dj = d - bank[j].offset;
            const lift = R.exLift(dj);
            const vx = valvesX(x);
            return (
              <g key={`v${j}`}>
                <path d={vx.length > 1
                  ? `M${x - PW / 2} ${flangeY} L${x + PW / 2} ${flangeY} L${vx[1] + g.halfBore * 0.3} ${deckY - 10} L${vx[1] - g.halfBore * 0.2} ${deckY - 10} L${x} ${flangeY + 16} L${vx[0] + g.halfBore * 0.2} ${deckY - 10} L${vx[0] - g.halfBore * 0.3} ${deckY - 10} Z`
                  : `M${x - PW / 2} ${flangeY} L${x + PW / 2} ${flangeY} L${x + g.halfBore * 0.34} ${deckY - 10} L${x - g.halfBore * 0.34} ${deckY - 10} Z`}
                  style={{ fill: hotMix(R.exPort(dj), emp) }} opacity={0.6 + 0.4 * lift} />
                {vx.map((v) => <Valve key={v} x={v} seatY={deckY - 8} lift={lift} halfBore={g.halfBore} topY={camY} />)}
                {vx.map((v) => <Lobe key={`l${v}`} x={v} y={camY} d={dj} centre={centreEx} size={Math.min(1, g.halfBore / 30)} />)}
                <text x={x} y={deckY + 14} className={cut.artText} textAnchor="middle">{bank[j].n}</text>
              </g>
            );
          })}
          {/* the primaries, in front of the block: steel tube, the gas and its pulses inside */}
          {primaries.map((pts, j) => <path key={`po${j}`} d={roundedPath(pts, 30)} fill="none" stroke="var(--cut-metal)" strokeWidth={PW + 7} strokeLinejoin="round" />)}
          {primaries.map((pts, j) => <path key={`pi${j}`} d={roundedPath(pts, 30)} fill="none" stroke="var(--cut-metal-dark)" strokeWidth={PW + 2} strokeLinejoin="round" />)}
          {primaryPts.map((pts, j) => {
            const dj = d - bank[j].offset;
            const m = pts.length - 1;
            return segs(pts).map(([x0, y0, x1, y1], i) => (
              <line key={`s${j}-${i}`} x1={x0} y1={y0} x2={x1} y2={y1} style={{ stroke: hotMix(R.exPort(dj - ((i + 0.5) / m) * half), emp) }} strokeWidth={PW - 2} />
            ));
          })}
          {g.xs.map((x) => <rect key={`f${x}`} x={x - PW / 2 - 7} y={flangeY - 6} width={PW + 14} height={10} rx={2} className={cut.cutBlock} />)}
          {/* collector: the primaries merge, then the outlet */}
          <path d={`M${colX - inletHalf - 4} ${colTop - 2} L${colX + inletHalf + 4} ${colTop - 2} L${colX + outletHalf + 4} ${colY} L${colX - outletHalf - 4} ${colY} Z`} style={{ fill: 'var(--cut-metal)' }} />
          <path d={`M${colX - inletHalf} ${colTop} L${colX + inletHalf} ${colTop} L${colX + outletHalf} ${colY} L${colX - outletHalf} ${colY} Z`} style={{ fill: hotMix(collKpa, emp) }} />
          <CylinderStrip bank={bank} d={d} R={R} derived={derived} W={W} y0={stripY} sparkD={sparkD} burnedAt={burnedAt}
            label="Each cylinder into this collector, in firing order" />
          <path d={roundedPath(outlet, 26)} fill="none" stroke="var(--cut-metal)" strokeWidth={PW * 1.5 + 7} />
          <path d={roundedPath(outlet, 26)} fill="none" style={{ stroke: hotMix(collKpa, emp) }} strokeWidth={PW * 1.5} />
          {/* the burned gas moving out */}
          {primaryPts.map((pts, j) => (R.exFlow(d - bank[j].offset) > 1
            ? dots(pts, travel.current[j] ?? 0, 8, 1.4).map(([x, y], i) => <circle key={`e${j}-${i}`} cx={x} cy={y} r={2.2} className={cut.gasBurn} />)
            : null))}
          {dots(outletPts, out.current, 10, 2).map(([x, y], i) => <circle key={`o${i}`} cx={x} cy={y} r={2.2} className={cut.gasBurn} opacity={0.8} />)}
          <Labels items={labels} W={W} />
        </svg>
        <div className={cut.cutSide}>
          <p className={cut.cutStroke}>
            <b>Cylinder 1, {STROKES[s1].toLowerCase()}.</b>{' '}
            {R.exLift(d) > 0.02
              ? (wrap(d) < -150 && wrap(d) > -360)
                ? `Blowdown: the exhaust valve has cracked open on ${f((readAt(gx.trace.deg, gx.trace.cylKpa, wrap(d)) ?? 0) / 100, 1)} bar of burned gas, and the pulse runs down the primary at ${f(a, 0)} m/s.`
                : `The piston is pushing the rest out, ${f(flow1, 0)} g/s. ${port1 < emp ? 'The collector\'s inverted echo has arrived: the port is below the collector, pulling gas out.' : 'The port is above the collector: the piston is doing the work.'}`
              : 'Its exhaust valves are shut. The other cylinders\' pulses cross at the collector, each one\'s echo running back up the other primaries.'}
          </p>
          <PortChart gx={gx} ys={gx.trace.exPortKpa} refKpa={emp} d={wrap(d)} tone="ex" lift={gx.trace.exAreaMm2}
            marks={[[ev.evo, 'EVO'], [echo, 'echo'], [ev.evc, 'EVC']]} label="exhaust port, kPa; dashed: collector; shaded: valve open" />
          <dl className={cut.liveEq}>
            <dt>Crank angle</dt><dd>{cardAngle(wrap(d))} (cylinder 1)</dd>
            <dt>Wave speed</dt><dd>a = √(γRT) = √({f(COEFF.GAMMA_BURNED, 2)} × 287 × {f(gx.exhaustK, 0)}) = {f(a, 0)} m/s</dd>
            <dt>Round trip</dt><dd>2L/a = 2 × {f(geo.primaryLengthMm / 1000, 3)} / {f(a, 0)} = {f(((2 * geo.primaryLengthMm) / 1000 / a) * 1000, 2)} ms = {f(gx.primaryRoundTripDeg, 0)}° of crank</dd>
            <dt>Collector</dt><dd>R = {f(geo.collectorReflection, 2)} ({n} primaries meet): the pulse comes back as suction</dd>
            <dt>Echo lands</dt><dd>EVO + {f(gx.primaryRoundTripDeg, 0)}° = {cardAngle(echo)}{echo > ev.ivo - 30 && echo < ev.evc + 30 ? ', in the overlap: it helps scavenge' : ''}</dd>
            <dt>Port now</dt><dd>p = {f(emp, 0)} {port1 >= emp ? '+' : '−'} {f(Math.abs(port1 - emp), 1)} = {f(port1, 0)} kPa; out {f(flow1, 0)} g/s</dd>
            <dt>Left behind</dt><dd>{f(gx.residualFrac * 100, 1)}% of the charge is last cycle&apos;s burned gas</dd>
          </dl>
          <div className={cut.cutControls}>
            <button type="button" onClick={() => setPlaying(!playing)} aria-pressed={!playing}>{playing ? 'Pause' : 'Play'}</button>
            <input type="range" min={-360} max={359} value={Math.round(wrap(d))} aria-label="Crank angle" aria-valuetext={cardAngle(wrap(d))}
              onChange={(e) => { setPlaying(false); setDeg(Number(e.target.value)); }} />
          </div>
          <p className={cut.panelNote}>Shown {slowMo.toLocaleString('en-US')}× slower than {gx.rpm.toLocaleString('en-US')} RPM. Cylinders {bank.map((c) => c.n).join(', ')} into one collector, in their firing order. Orange where a pulse pushes, dark where its echo pulls.</p>
        </div>
      </div>
    </div>
  );
}

// Where each part sits along a typical car's exhaust, metres from the collector: it times the
// pulses and the gas on screen, and is drawn to it. The model prices each part by its loss
// coefficient (exhaustSystemDropKpa), not by its length.
const SYS = { o2a: 0.25, catIn: 0.45, catOut: 0.8, o2b: 0.95, mufIn: 2.0, mufOut: 2.55, tip: 3.0 };

/** @param {BreathingProps} props */
export function ExhaustSystemCutaway({ gx, engineConfig, mods = {}, exhaustDia = 3 }) {
  const U = useUnits();
  const wrapRef = useRef(/** @type {HTMLDivElement|null} */ (null));
  const R = useMemo(() => readers(gx), [gx]);
  const geo = gx.geometry;
  const bank = useMemo(() => bankOf(engineConfig?.configuration ?? 'V6', geo.primariesPerCollector), [engineConfig?.configuration, geo.primariesPerCollector]);
  const tickRef = useRef(/** @type {((dt: number) => void)|null} */ (null));
  const flowT = useRef(0);
  const { deg: d, setDeg, playing, setPlaying } = useCrank(wrapRef, tickRef);

  // The gas: the bank's share of the flow, through this pipe, at the system's temperature.
  const collectors = (gx.cylinders ?? 6) / bank.length;
  const flowKgS = gx.exhaustFlowGs / 1000 / Math.max(1, collectors);
  const T = gx.exhaustK - COEFF.EXHAUST_PIPE_COOLING_K;
  const pipeA = (Math.PI / 4) * (exhaustDia * 0.0254) ** 2;
  const L = SYS.tip;
  const drop = gx.exhaustDropKpa;
  const catLoss = drop.catalyst; const backLoss = drop.catback;
  // Static pressure along the pipe: the cat's loss across the cat, the cat-back's down the
  // rest (the model prices the pipe and the muffler as one loss).
  const staticAt = (s) => {
    if (s <= SYS.catIn) return 101.3 + catLoss + backLoss;
    if (s <= SYS.catOut) return 101.3 + backLoss + catLoss * (1 - (s - SYS.catIn) / (SYS.catOut - SYS.catIn));
    return 101.3 + backLoss * (1 - (s - SYS.catOut) / (L - SYS.catOut));
  };
  const rho = (staticAt(0) * 1000) / (287 * T);
  const u = flowKgS / (rho * pipeA);
  const q = 0.5 * rho * u * u;
  const a = Math.sqrt(COEFF.GAMMA_BURNED * 287 * T);
  const slowMo = CYCLE_SECONDS / (120 / gx.rpm);
  tickRef.current = (dt) => { flowT.current += (u / slowMo / L) * dt; };
  const half = gx.primaryRoundTripDeg / 2;
  const collRaw = (dd) => bank.reduce((sum, c) => sum + R.exPort(dd - c.offset - half), 0) / bank.length;
  // The collector's pulses about their own average over the cycle (the average is the static
  // back-pressure, drawn separately), and their size, which sets the colour scale.
  const pulse = useMemo(() => {
    const xs = []; for (let dd = -360; dd < 360; dd += 4) xs.push(collRaw(dd));
    const mean = xs.reduce((a0, b0) => a0 + b0, 0) / xs.length;
    return { mean, amp: Math.max(1, ...xs.map((v) => Math.abs(v - mean))) };
  }, [R, bank, half]); // eslint-disable-line react-hooks/exhaustive-deps
  const collAt = (dd) => collRaw(dd) - pulse.mean;
  const degPerSec = gx.rpm * 6;
  // A pulse runs at a + u; the converter's cells and the muffler's chambers take it out.
  const atten = (s) => (s < SYS.catIn ? 1 : s < SYS.catOut ? 1 - 0.5 * ((s - SYS.catIn) / (SYS.catOut - SYS.catIn)) : s < SYS.mufIn ? 0.5 : s < SYS.mufOut ? 0.5 - 0.42 * ((s - SYS.mufIn) / (SYS.mufOut - SYS.mufIn)) : 0.08);
  const pAt = (s) => staticAt(s) + collAt(d - (s / (a + u)) * degPerSec) * atten(s);

  const W = 960; const H = 260; const y0 = 120; const x0 = 20; const x1 = W - 40;
  const X = (s) => x0 + (s / L) * (x1 - x0);
  const P = 30; // pipe height on screen
  const catKind = mods.catalyst ?? 'ceramic';
  const free = !!mods.exhaust;
  const N = 120;
  const pipeCells = Array.from({ length: N }, (_, i) => (i + 0.5) / N * L);
  const ref = staticAt(0);
  const gasFill = (s) => hotMix(ref + ((pAt(s) - staticAt(s)) / pulse.amp) * 30, ref);
  const catCpsi = catKind === 'metallic' ? COEFF.CAT_METALLIC_CPSI : COEFF.CAT_CERAMIC_CPSI;
  const catWall = catKind === 'metallic' ? COEFF.CAT_METALLIC_WALL_IN : COEFF.CAT_CERAMIC_WALL_IN;
  const cellPitch = 1 / Math.sqrt(catCpsi); const dh = cellPitch - catWall; const ofa = (dh / cellPitch) ** 2;
  const catRows = catKind === 'metallic' ? 9 : 13;
  // Muffler gas path: in through the perforated inlet tube to the rear chamber, back through
  // the return tube to the front one, out through the outlet tube.
  const mx0 = X(SYS.mufIn); const mx1 = X(SYS.mufOut); const mw = mx1 - mx0;
  /** @type {[number, number][]} */
  const mufPath = free ? [[mx0, y0], [mx1, y0]] : [[mx0, y0 - 18], [mx0 + mw * 0.82, y0 - 18], [mx0 + mw * 0.92, y0], [mx0 + mw * 0.82, y0 + 18], [mx0 + mw * 0.18, y0 + 18], [mx0 + mw * 0.08, y0], [mx0 + mw * 0.2, y0 - 2], [mx1, y0 - 2]];
  /** @type {[number, number][]} */
  const fullPath = [[X(0), y0], [mx0, y0], ...mufPath.slice(free ? 0 : 0), [X(L), y0], [W - 6, y0]];
  const pathPts = useMemo(() => along(fullPath, 160), [free, mx0, mx1]); // eslint-disable-line react-hooks/exhaustive-deps
  const puffs = Array.from({ length: 4 }, (_, i) => ((flowT.current * 3 + i / 4) % 1));
  const dropRows = /** @type {[string, number][]} */ ([
    [geo.headers ? 'Headers' : 'Cast manifold', drop.manifold],
    [catKind === 'none' ? 'Test pipe' : catKind === 'metallic' ? 'High-flow catalyst' : 'Catalyst', drop.catalyst],
    [free ? 'Free-flow cat-back' : 'Stock cat-back', drop.catback],
    ...(drop.turbine > 0 ? /** @type {[string, number][]} */ ([['Turbine', drop.turbine]]) : []),
  ]);
  const dropTotal = dropRows.reduce((s, [, v]) => s + v, 0);
  // The pressure strip under the drawing.
  const SH = 90; const pLo = Math.min(98, ...pipeCells.map(pAt)) - 1; const pHi = Math.max(ref + 6, ...pipeCells.map(pAt)) + 2;
  const SY = (k) => SH - 14 - ((k - pLo) / (pHi - pLo)) * (SH - 26);

  const labels = /** @type {[string, number, number, number, number][]} */ ([
    ['From the collector', 8, y0 - 46, X(0.08), y0 - P / 2],
    ['Oxygen sensor (upstream)', X(SYS.o2a) - 30, 22, X(SYS.o2a), y0 - P / 2 - 26],
    [catKind === 'none' ? 'Test pipe' : `${catKind === 'metallic' ? 'High-flow catalyst' : 'Catalytic converter'}, ${catCpsi} cells/in²`, X((SYS.catIn + SYS.catOut) / 2) - 70, H - 20, X((SYS.catIn + SYS.catOut) / 2), y0 + 38],
    ['Oxygen sensor (downstream)', X(SYS.o2b) + 10, 46, X(SYS.o2b), y0 - P / 2 - 26],
    [free ? 'Straight-through muffler' : 'Muffler: three passes, two baffles', mx0 + 10, 22, mx0 + mw * 0.4, y0 - 46],
    [`${U.metric ? U.fmtLength(exhaustDia) : `${exhaustDia} in`} tailpipe`, W - 8, H - 20, X(2.85), y0 + P / 2],
  ]);

  return (
    <div className={cut.cutWrap} ref={wrapRef}>
      <div className={styles.scroller}>
        <svg viewBox={`0 0 ${W} ${H}`} className={`${cut.cutSvg} ${styles.svg}`} role="img"
          aria-label={`The exhaust system at ${gx.rpm} RPM: ${f(u, 0)} m/s in the pipe, ${f(dropTotal, 1)} kPa of back-pressure`}>
          {/* the pipe: steel, and the gas in it */}
          <rect x={X(0) - 6} y={y0 - P / 2 - 4} width={X(L) - X(0) + 30} height={P + 8} rx={4} style={{ fill: 'var(--cut-metal)' }} />
          {pipeCells.map((s, i) => (
            <rect key={i} x={X(s - L / N / 2)} y={y0 - P / 2} width={(x1 - x0) / N + 0.8} height={P} style={{ fill: gasFill(s) }} />
          ))}
          {/* flanges at the joints, and the rubber hangers the pipe swings on */}
          {[0.12, SYS.catIn - 0.02, SYS.catOut + 0.02, SYS.mufIn - 0.04, SYS.mufOut + 0.04].map((s) => (
            <rect key={`fl${s}`} x={X(s) - 3} y={y0 - P / 2 - 9} width={6} height={P + 18} rx={2} className={cut.cutBlock} />
          ))}
          {[1.35, 2.8].map((s) => (
            <g key={`h${s}`}>
              <line x1={X(s)} x2={X(s)} y1={y0 - P / 2 - 4} y2={y0 - P / 2 - 26} className={cut.cutStem} />
              <rect x={X(s) - 9} y={y0 - P / 2 - 40} width={18} height={14} rx={5} className={cut.cutCase} />
            </g>
          ))}
          {/* oxygen sensors */}
          {[SYS.o2a, SYS.o2b].map((s) => (
            <g key={s}>
              <rect x={X(s) - 8} y={y0 - P / 2 - 12} width={16} height={10} rx={2} className={cut.cutBlock} />
              <rect x={X(s) - 4} y={y0 - P / 2 - 30} width={8} height={20} rx={2} className={cut.cutPlug} />
              <path d={`M${X(s)} ${y0 - P / 2 - 30} C ${X(s)} ${y0 - 70}, ${X(s) + 30} ${y0 - 64}, ${X(s) + 34} ${y0 - 84}`} fill="none" stroke="var(--ink3)" strokeWidth={2} />
            </g>
          ))}
          {/* the converter: shell, cones, and the substrate's channels the gas runs through */}
          {catKind !== 'none' && (
            <g>
              <path d={`M${X(SYS.catIn)} ${y0 - P / 2 - 4} L${X(SYS.catIn) + 22} ${y0 - 40} L${X(SYS.catOut) - 22} ${y0 - 40} L${X(SYS.catOut)} ${y0 - P / 2 - 4} L${X(SYS.catOut)} ${y0 + P / 2 + 4} L${X(SYS.catOut) - 22} ${y0 + 40} L${X(SYS.catIn) + 22} ${y0 + 40} L${X(SYS.catIn)} ${y0 + P / 2 + 4} Z`} style={{ fill: 'var(--cut-metal)' }} />
              <path d={`M${X(SYS.catIn) + 3} ${y0 - P / 2} L${X(SYS.catIn) + 24} ${y0 - 35} L${X(SYS.catOut) - 24} ${y0 - 35} L${X(SYS.catOut) - 3} ${y0 - P / 2} L${X(SYS.catOut) - 3} ${y0 + P / 2} L${X(SYS.catOut) - 24} ${y0 + 35} L${X(SYS.catIn) + 24} ${y0 + 35} L${X(SYS.catIn) + 3} ${y0 + P / 2} Z`}
                style={{ fill: gasFill((SYS.catIn + SYS.catOut) / 2) }} />
              <path d={`M${X(SYS.catIn) + 20} ${y0 - 48} L${X(SYS.catOut) - 20} ${y0 - 48}`} fill="none" stroke="var(--ink3)" strokeWidth={1.2} strokeDasharray="4 3" />
              <path d={`M${X(SYS.catIn) + 20} ${y0 + 48} L${X(SYS.catOut) - 20} ${y0 + 48}`} fill="none" stroke="var(--ink3)" strokeWidth={1.2} strokeDasharray="4 3" />
              <rect x={X(SYS.catIn) + 30} y={y0 - 33} width={X(SYS.catOut) - X(SYS.catIn) - 60} height={66} rx={4} style={{ fill: 'var(--cut-metal-dark)' }} />
              {Array.from({ length: catRows }, (_, i) => {
                const yy = y0 - 33 + ((i + 0.5) * 66) / catRows;
                return <line key={i} x1={X(SYS.catIn) + 30} x2={X(SYS.catOut) - 30} y1={yy} y2={yy} style={{ stroke: gasFill(SYS.catIn + 0.1) }} strokeWidth={(66 / catRows) * Math.sqrt(ofa) - 0.4} />;
              })}
              {Array.from({ length: 10 }, (_, i) => <line key={`v${i}`} x1={X(SYS.catIn) + 30 + ((i + 1) * (X(SYS.catOut) - X(SYS.catIn) - 60)) / 11} x2={X(SYS.catIn) + 30 + ((i + 1) * (X(SYS.catOut) - X(SYS.catIn) - 60)) / 11} y1={y0 - 33} y2={y0 + 33} stroke="var(--cut-metal-dark)" strokeWidth={0.8} opacity={0.6} />)}
            </g>
          )}
          {/* the muffler: its shell, baffles, perforated tubes (or a packed straight-through core) */}
          <rect x={mx0} y={y0 - 56} width={mw} height={112} rx={44} style={{ fill: 'var(--cut-metal)' }} />
          <rect x={mx0 + 4} y={y0 - 52} width={mw - 8} height={104} rx={40} className={cut.cutCase} />
          <path d={`M${mx0 + 10} ${y0 - 46} Q${mx0 + 2} ${y0} ${mx0 + 10} ${y0 + 46}`} fill="none" stroke="var(--cut-metal)" strokeWidth={3} />
          <path d={`M${mx1 - 10} ${y0 - 46} Q${mx1 - 2} ${y0} ${mx1 - 10} ${y0 + 46}`} fill="none" stroke="var(--cut-metal)" strokeWidth={3} />
          {free ? (
            <g>
              <rect x={mx0 + 12} y={y0 - 40} width={mw - 24} height={80} rx={30} className={cut.cutOil} opacity={0.35} />
              <rect x={mx0} y={y0 - P / 2} width={mw} height={P} style={{ fill: gasFill(SYS.mufIn + 0.2) }} />
              {Array.from({ length: 22 }, (_, i) => <circle key={i} cx={mx0 + 10 + i * ((mw - 20) / 21)} cy={y0 - P / 2 + 1} r={1.6} className={cut.cutHub} />)}
              {Array.from({ length: 22 }, (_, i) => <circle key={`b${i}`} cx={mx0 + 10 + i * ((mw - 20) / 21)} cy={y0 + P / 2 - 1} r={1.6} className={cut.cutHub} />)}
            </g>
          ) : (
            <g>
              {[0.33, 0.66].map((t) => <rect key={t} x={mx0 + mw * t - 2} y={y0 - 50} width={4} height={100} style={{ fill: 'var(--cut-metal)' }} />)}
              {[[mx0, mx0 + mw * 0.82, y0 - 18], [mx0 + mw * 0.18, mx0 + mw * 0.82, y0 + 18], [mx0 + mw * 0.2, mx1, y0 - 2]].map(([a0, a1, yy], i) => (
                <g key={i}>
                  <rect x={a0} y={yy - 7} width={a1 - a0} height={14} rx={3} style={{ fill: gasFill(SYS.mufIn + 0.15 * (i + 1)) }} />
                  {Array.from({ length: 10 }, (_, k) => <circle key={k} cx={a0 + 8 + (k * (a1 - a0 - 16)) / 9} cy={yy - 7} r={1.4} className={cut.cutHub} />)}
                </g>
              ))}
            </g>
          )}
          {/* tailpipe tip, the gas leaving it */}
          <path d={`M${X(L)} ${y0 - P / 2 - 4} L${X(L) + 26} ${y0 - P / 2 - 8} L${X(L) + 26} ${y0 + P / 2 + 8} L${X(L)} ${y0 + P / 2 + 4} Z`} style={{ fill: 'var(--ink-soft)' }} />
          <ellipse cx={X(L) + 26} cy={y0} rx={4} ry={P / 2 + 8} style={{ fill: 'var(--panel3)' }} stroke="var(--ink-soft)" strokeWidth={1.5} />
          {puffs.map((t, i) => <circle key={i} cx={X(L) + 30 + t * 30} cy={y0 + (i % 2 ? -4 : 4) * t} r={4 + t * 10} className={cut.gasSpent} opacity={0.5 * (1 - t)} />)}
          {/* the gas moving, at the speed it really flows (slowed with the rest) */}
          {dots(pathPts, flowT.current, 46, 3).map(([x, y], i) => <circle key={`g${i}`} cx={x} cy={y} r={2.2} className={cut.gasBurn} opacity={0.85} />)}
          <Labels items={labels} W={W} />
        </svg>
        <svg viewBox={`0 0 ${W} ${SH}`} className={styles.chart} role="img" aria-label="Pressure along the exhaust, now and on average">
          <line x1={X(0)} x2={X(L)} y1={SY(101.3)} y2={SY(101.3)} className={styles.grid} />
          <polyline points={pipeCells.map((s) => `${X(s).toFixed(1)},${SY(staticAt(s)).toFixed(1)}`).join(' ')} className={styles.stripMean} />
          <polyline points={pipeCells.map((s) => `${X(s).toFixed(1)},${SY(pAt(s)).toFixed(1)}`).join(' ')} className={styles.stripNow} />
          <text x={X(0)} y={12} className={styles.lab}>pressure along the pipe, kPa: dashed the average (each part&apos;s loss), solid now (the pulses)</text>
          <text x={X(L)} y={SY(101.3) - 4} className={styles.lab} textAnchor="end">101.3 outside</text>
          <text x={X(0)} y={SH - 2} className={styles.lab}>{f(ref, 1)} at the collector</text>
        </svg>
      </div>
      <div className={styles.numbers}>
        <dl className={cut.liveEq}>
          <dt>Crank angle</dt><dd>{cardAngle(wrap(d))} (cylinder 1)</dd>
          <dt>Gas</dt><dd>ṁ = {f(flowKgS * 1000, 0)} g/s through this pipe, {f(T, 0)} K, ρ = p/RT = {f(rho, 3)} kg/m³</dd>
          <dt>Speed</dt><dd>u = ṁ/(ρA) = {f(flowKgS, 3)} / ({f(rho, 3)} × {f(pipeA * 1e4, 1)} cm²) = {f(u, 0)} m/s</dd>
          <dt>Dynamic pressure</dt><dd>q = ½ρu² = {f(q / 1000, 2)} kPa; each part loses K × q</dd>
          <dt>Pulses</dt><dd>run at a + u = {f(a, 0)} + {f(u, 0)} m/s: the length of the car in {f((L / (a + u)) * 1000, 1)} ms</dd>
          {catKind !== 'none' && <><dt>Substrate</dt><dd>{catCpsi} cells/in², {f(catWall * 1000, 1)} thou walls: channel {f(dh * 25.4, 2)} mm, {f(ofa * 100, 0)}% open; laminar loss ∝ 1/(OFA × d<sub>h</sub>²)</dd></>}
          <dt>Back-pressure</dt><dd>{f(gx.empKpa, 1)} kPa at the port side: {f(dropTotal, 1)} above the air outside</dd>
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
          <p className={styles.dropNote}>Each part&apos;s loss goes as its coefficient times the pipe&apos;s dynamic pressure, ½ρu²: the bigger the pipe, the slower the gas and the smaller every loss. Change the pipe, catalyst or muffler on BUILD.</p>
        </div>
      </div>
      <div className={cut.cutControls}>
        <button type="button" onClick={() => setPlaying(!playing)} aria-pressed={!playing}>{playing ? 'Pause' : 'Play'}</button>
        <input type="range" min={-360} max={359} value={Math.round(wrap(d))} aria-label="Crank angle" aria-valuetext={cardAngle(wrap(d))}
          onChange={(e) => { setPlaying(false); setDeg(Number(e.target.value)); }} />
      </div>
      <p className={cut.panelNote}>Shown {Math.round(slowMo).toLocaleString('en-US')}× slower than {gx.rpm.toLocaleString('en-US')} RPM, drawn to a typical car&apos;s lengths. The gas crawls at its {f(u, 0)} m/s; the pressure pulses race through it at the speed of sound, and the converter and the muffler&apos;s chambers take them out.</p>
    </div>
  );
}
