/**
 * The parts the Physics page's three breathing cutaways share (IntakeCutaway.jsx,
 * HeaderCutaway.jsx, ExhaustSystemCutaway.jsx): the crank clock, the model's readers, paths
 * and flow streaks, the bank of cylinders, the valves and the port pressure chart.
 *
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

import React, { useEffect, useState } from 'react';

import { COEFF, clamp } from '../../sim/index.js';

import cut from './Apps.module.css';
import styles from './Breathing.module.css';
import { Plot, crankTicks } from './Plot.jsx';
import { fixed as f } from '../format.js';

/** Seconds one engine cycle takes on screen, whatever the engine speed. */
export const CYCLE_SECONDS = 3.6;
export const RAD = Math.PI / 180;

/** @param {number} x */
export const clamp01 = (x) => clamp(x, 0, 1);
/** Wraps a crank angle into [-360, 360): 0 is TDC on the overlap, +/-360 firing TDC. @param {number} d */
export const wrap = (d) => ((((d + 360) % 720) + 720) % 720) - 360;

/**
 * Reads a record (`xs` ascending crank degrees) at `deg`, linearly; null outside it.
 * @param {number[]} xs @param {number[]} ys @param {number} deg
 */
export function readAt(xs, ys, deg) {
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
export const strokeOf = (d) => (d >= 0 && d < 180 ? 0 : d >= 180 ? 1 : d < -180 ? 2 : 3);
export const STROKES = /** @type {const} */ (['Intake', 'Compression', 'Power', 'Exhaust']);

/**
 * Points along a polyline, evenly by length.
 * @param {[number, number][]} pts @param {number} n
 * @returns {[number, number][]}
 */
export function along(pts, n) {
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
export function roundedPath(pts, r = 24) {
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
export function roundedAlong(pts, n, r = 24) {
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
export const segs = (pts) => pts.slice(0, -1).map(([x0, y0], i) => {
  const [x1, y1] = pts[i + 1];
  return [x0, y0, x1 + (x1 - x0) * 0.3, y1 + (y1 - y0) * 0.3];
});

/** A point a fraction `u` (0-1) of the way along a path sampled evenly by length, between its samples. */
export const pointAt = (pts, u) => {
  const fi = clamp01(u) * (pts.length - 1);
  const i = Math.min(pts.length - 2, Math.floor(fi)); const k = fi - i;
  const [x0, y0] = pts[i]; const [x1, y1] = pts[i + 1];
  return [x0 + (x1 - x0) * k, y0 + (y1 - y0) * k];
};

/**
 * Flow streaks along a path: each a short line from where its gas was to where it is, so the
 * direction is drawn rather than inferred. Dots stepped between a path's samples read as
 * running backwards (a wagon wheel) once a frame's step neared half their spacing, as it did
 * on a phone. `t` (wrapping) is how far the gas has moved; `tail` the streak's length, as a
 * share of the path; a negative flow draws its tail ahead (gas going back).
 */
export const streaks = (pts, t, count, tail = 0.05, back = false) => Array.from({ length: count }, (_, i) => {
  const u = ((((i / count) + t) % 1) + 1) % 1;
  const v = back ? Math.min(1, u + tail) : Math.max(0, u - tail);
  return [...pointAt(pts, v), ...pointAt(pts, u)];
});

/** Flow streaks drawn: a fading tail and a bright head. */
export function Streaks({ items, tone, width = 2.4 }) {
  return items.map(([x0, y0, x1, y1], i) => (
    <g key={i}>
      <line x1={x0} y1={y0} x2={x1} y2={y1} className={tone === 'fresh' ? cut.streakFresh : cut.streakBurn} strokeWidth={width} />
      <circle cx={x1} cy={y1} r={width * 0.6} className={tone === 'fresh' ? cut.gasFresh : cut.gasBurn} />
    </g>
  ));
}

/**
 * Section lining for the metal the drawing cuts through: thin lines at 45°, the convention
 * for a sectioned part on an engineering drawing (ISO 128-50), so cut walls read as cut
 * material rather than flat shapes. Referenced by the cut-metal classes (Apps.module.css).
 */
export function SectionHatch() {
  return (
    <defs>
      <pattern id="cut-hatch" patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(45)">
        <rect width="5" height="5" style={{ fill: 'var(--panel3)' }} />
        <line x1="0" y1="0" x2="0" y2="5" style={{ stroke: 'var(--cut-metal)', strokeWidth: 0.6, opacity: 0.7 }} />
      </pattern>
    </defs>
  );
}

/** Labels on leaders, as the combustion cutaway sets them. */
export function Labels({ items, W }) {
  return (
    <>
      {items.map(([t, lx, ly, tx, ty]) => (
        <g key={t}>
          <line x1={lx < W / 2 ? lx + t.length * 5.4 + 4 : lx - t.length * 5.4 - 4} y1={ly - 3} x2={tx} y2={ty} className={cut.cutLeader} />
          <circle cx={tx} cy={ty} r={1.8} className={cut.cutLeaderDot} />
          <text x={lx} y={ly} className={cut.cutLabel} textAnchor={lx < W / 2 ? 'start' : 'end'}>{t}</text>
        </g>
      ))}
    </>
  );
}

// Firing orders, by cylinder number: an inline four 1-3-4-2, an inline six 1-5-3-6-2-4, the
// 60° V6 1-2-3-4-5-6 (odd bank 1-3-5), GM's cross-plane V8 1-8-7-2-6-5-4-3 (odd bank 1-3-5-7,
// fired unevenly: 0°, 180°, 450°, 630°).
export const FIRING = /** @type {Record<string, number[]>} */ ({ I4: [1, 3, 4, 2], I6: [1, 5, 3, 6, 2, 4], V6: [1, 2, 3, 4, 5, 6], V8: [1, 8, 7, 2, 6, 5, 4, 3] });

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
export function useCrank(wrapRef, tickRef) {
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
export function readers(gx) {
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
export const freshMix = (kpa, ref) => `color-mix(in srgb, var(--cut-fresh) ${Math.round((0.22 + 0.58 * clamp01(0.5 + (kpa - ref) / 36)) * 100)}%, var(--cut-metal-dark))`;
/** Burned gas: grey, running to orange where it is pushed, to dark in the suction behind a pulse. */
export const hotMix = (kpa, ref) => (kpa >= ref
  ? `color-mix(in srgb, var(--cut-burn) ${Math.round(clamp01(0.2 + (kpa - ref) / 50) * 90)}%, var(--cut-exhaust))`
  : `color-mix(in srgb, var(--cut-metal-dark) ${Math.round(clamp01((ref - kpa) / 25) * 80)}%, var(--cut-exhaust))`);

/**
 * The bank's cylinders under a head, to the engine's own bore, stroke and rod: the piston
 * at each one's place in the cycle, the charge above it by stroke.
 */
export function bankGeometry({ derived, n, W, deckY, bottomY, margin = 34 }) {
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
export function CylinderStrip({ bank, d, R, derived, W, y0, sparkD, burnedAt, label }) {
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
export function BlockFace({ g, top, bottom }) {
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
export function Valve({ x, seatY, lift, halfBore, topY, spring = true }) {
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
export function Lobe({ x, y, d, centre, size = 1 }) {
  const a = (d - centre) / 2 + 180;
  return (
    <g transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${a.toFixed(1)}) scale(${size})`}>
      <path d="M0 -10 C 8 -10 10 -3 9 3.5 C 8 10 3 16 0 16 C -3 16 -8 10 -9 3.5 C -10 -3 -8 -10 0 -10 Z" className={cut.cutCam} />
      <circle r="3.2" className={cut.cutHub} />
    </g>
  );
}

/** The side panel's small chart: a port's pressure against crank angle through the gas exchange. */
export function PortChart({ gx, ys, refKpa, d, tone, lift, marks, title, refName, valveName }) {
  const tr = gx.trace;
  const lo = Math.min(...ys, refKpa); const hi = Math.max(...ys, refKpa);
  const pad = Math.max(4, (hi - lo) * 0.1);
  const yDomain = /** @type {[number, number]} */ ([Math.floor((lo - pad) / 5) * 5, Math.ceil((hi + pad) / 5) * 5]);
  const xDomain = /** @type {[number, number]} */ ([tr.deg[0], tr.deg[tr.deg.length - 1]]);
  const maxL = Math.max(...lift, 1);
  const now = readAt(tr.deg, ys, d);
  const line = tone === 'in' ? 'var(--cut-fresh)' : 'var(--cut-burn)';
  const refTone = tone === 'in' ? 'var(--cut-fresh)' : 'var(--cut-exhaust)';
  // 0° is top dead centre between the exhaust and intake strokes (valve overlap); ±180° the
  // bottom dead centres either side.
  const dead = (dd) => (dd === 0 ? 'TDC' : Math.abs(dd) === 180 ? 'BDC' : '');
  return (
    <Plot
      title={title}
      sub={`cylinder 1, ${gx.rpm.toLocaleString('en-US')} rpm${now == null ? '' : `; now ${f(now, 0)} kPa`}`}
      xLabel="crank angle, ° from overlap TDC"
      yLabel="pressure, kPa (abs)"
      xDomain={xDomain}
      yDomain={yDomain}
      xTicks={crankTicks(xDomain[0], xDomain[1], dead)}
      ariaLabel={`${title}; now ${now == null ? 'outside the valve events' : `${f(now, 0)} kPa`}`}
      legend={[
        { label: 'port pressure', kind: 'line', tone: line },
        { label: refName, kind: 'dash', tone: refTone },
        { label: `${valveName} flow area (peak ${f(maxL, 0)} mm²)`, kind: 'fill', tone: refTone },
      ]}
    >
      {({ x, y, Y1 }) => {
        const pts = tr.deg.map((dd, i) => `${x(dd).toFixed(1)},${y(ys[i]).toFixed(1)}`).join(' ');
        // The flow area on its own scale, its peak at a third of the plot's height.
        const liftPts = `${x(tr.deg[0])},${Y1} ${tr.deg.map((dd, i) => `${x(dd).toFixed(1)},${(Y1 - (lift[i] / maxL) * (Y1 * 0.3)).toFixed(1)}`).join(' ')} ${x(tr.deg[tr.deg.length - 1])},${Y1}`;
        return (
          <>
            <polygon points={liftPts} className={tone === 'in' ? styles.liftFillIn : styles.liftFillEx} />
            <line x1={x(xDomain[0])} x2={x(xDomain[1])} y1={y(refKpa)} y2={y(refKpa)} className={tone === 'in' ? styles.refIn : styles.refEx} />
            {marks.map(([dd, t], i) => (
              <g key={t}>
                <line x1={x(dd)} x2={x(dd)} y1={0} y2={Y1} className={styles.eventLine} />
                {/* A mark too close to the one before it says its name lower down. */}
                <text x={x(dd) + 3} y={i > 0 && Math.abs(x(dd) - x(marks[i - 1][0])) < 34 ? 30 : 18} className={styles.eventText}>{t}</text>
              </g>
            ))}
            <polyline points={pts} className={tone === 'in' ? styles.portLineIn : styles.portLineEx} />
            {now != null && <circle cx={x(d)} cy={y(now)} r={4} className={cut.pvDot} />}
          </>
        );
      }}
    </Plot>
  );
}
