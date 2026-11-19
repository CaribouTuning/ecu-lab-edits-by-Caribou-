/**
 * Small math helpers shared across the simulation.
 *
 * Depends only on `tables.js` (for the table axes), which itself imports nothing —
 * so this sits at the bottom of the dependency graph and every other module can
 * import from it without creating a cycle.
 */

import { CURVE_RPM, LOAD, RPM } from './tables.js';

/**
 * Deep-copies a 2D array of numbers.
 * @param {number[][]} arr
 * @returns {number[][]}
 */
export const clone2D = (arr) => arr.map((r) => [...r]);

/**
 * Constrains a value to an inclusive range.
 * @param {number} v value
 * @param {number} lo lower bound
 * @param {number} hi upper bound
 * @returns {number}
 */
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * Linear interpolation across a set of breakpoints, clamped at both ends.
 *
 * Real ECUs interpolate between table breakpoints rather than snapping to the
 * nearest cell, which is why this is used everywhere a table is read.
 *
 * @param {number[]} bp ascending breakpoints
 * @param {number[]} vals values at each breakpoint (same length as `bp`)
 * @param {number} x point to evaluate
 * @returns {number}
 */
export function interp1(bp, vals, x) {
  if (x <= bp[0]) return vals[0];
  if (x >= bp[bp.length - 1]) return vals[vals.length - 1];
  for (let i = 0; i < bp.length - 1; i++) {
    if (x >= bp[i] && x <= bp[i + 1]) {
      const t = (x - bp[i]) / (bp[i + 1] - bp[i]);
      return vals[i] + t * (vals[i + 1] - vals[i]);
    }
  }
  return vals[vals.length - 1];
}

// LOAD descends (200 -> 20) but interp1 needs ascending breakpoints. Hoisted to
// module scope because interp2 sits on the hottest path in the app — the dyno sweep
// calls it three times per RPM step — and rebuilding these arrays per call was pure
// garbage-collector pressure.
const LOAD_ASC = [...LOAD].reverse();

/**
 * 2D interpolation across both RPM and load.
 *
 * @param {number[][]} table rows indexed by LOAD, columns by RPM
 * @param {number} rpm engine speed
 * @param {number} loadKpa manifold absolute pressure, kPa
 * @returns {number}
 */
/**
 * A per-RPM curve (boost target, bolt-on gains) read at any engine speed: written either
 * on the table grid's 8 columns or on the longer CURVE_RPM, held flat past its ends.
 *
 * @param {number[]} values
 * @param {number} rpm
 * @returns {number}
 */
export function curveAt(values, rpm) {
  return interp1(values.length === CURVE_RPM.length ? CURVE_RPM : RPM, values, rpm);
}

/**
 * A curve carried onto CURVE_RPM, its last value held past its own end.
 * @param {number[]} values written on the table grid's columns or on CURVE_RPM
 * @returns {number[]}
 */
export function onCurveRpm(values) {
  return values.length === CURVE_RPM.length ? [...values] : CURVE_RPM.map((rpm) => curveAt(values, rpm));
}

export function interp2(table, rpm, loadKpa) {
  const rowVals = LOAD.map((_, ri) => interp1(RPM, table[ri], rpm));
  return interp1(LOAD_ASC, rowVals.reverse(), loadKpa);
}

/**
 * Groups consecutive points matching a predicate into runs.
 *
 * Used by the pull log so that "knock from 4200–5600 RPM" is reported as one event
 * rather than fifteen separate ones.
 *
 * @template T
 * @param {T[]} points
 * @param {(p: T) => boolean} predicate
 * @returns {T[][]} one array per contiguous run
 */
export function groupRuns(points, predicate) {
  const runs = [];
  let current = null;
  points.forEach((p, i) => {
    if (predicate(p)) { if (!current) current = { start: i, end: i }; else current.end = i; }
    else if (current) { runs.push(current); current = null; }
  });
  if (current) runs.push(current);
  return runs.map((r) => points.slice(r.start, r.end + 1));
}

/**
 * Joins runs of points separated by a small gap into one, marking the result
 * `intermittent` — how borderline knock looks on a log: on, off, on again.
 * @param {object[][]} runs
 * @param {number} gapRpm
 * @returns {object[][]}
 */
export function mergeNearbyRuns(runs, gapRpm) {
  const out = [];
  for (const run of runs) {
    const prev = out[out.length - 1];
    if (prev && run[0].rpm - prev[prev.length - 1].rpm <= gapRpm) {
      const merged = Object.assign([...prev, ...run], { intermittent: true });
      out[out.length - 1] = merged;
    } else out.push(run);
  }
  return out;
}

/**
 * The x in [lo, hi] where an increasing `f` reaches `target`, by bracketed Illinois false
 * position, to `tol` in x: the root a 40-step bisection finds, in a handful of evaluations,
 * every one near the root, and a bisection step wherever f gives no finite number. (Bisection probed the whole bracket on its way in: finding the
 * pressure that traps a load row's air on a B58 solved the breathing at every 2 kPa from 12 to
 * 236 kPa in those columns.) Outside the bracket it returns the end, as bisection does.
 * @param {(x: number) => number} f increasing
 * @param {number} target
 * @param {number} lo
 * @param {number} hi
 * @param {number} [tol]
 * @returns {number}
 */
export function solveIncreasing(f, target, lo, hi, tol = 1e-9) {
  let flo = f(lo) - target;
  let fhi = f(hi) - target;
  if (flo >= 0) return lo;
  if (fhi <= 0) return hi;
  let side = 0;
  let prev = Infinity;
  for (let i = 0; i < 200; i += 1) {
    // A bisection step wherever an end of the bracket has no finite reading (f returned NaN
    // there), which a reading that is not below the target, NaN included, sets as bisection did.
    const x = Number.isFinite(flo) && Number.isFinite(fhi) ? (lo * fhi - hi * flo) / (fhi - flo) : (lo + hi) / 2;
    const fx = f(x) - target;
    if (fx === 0 || Math.abs(x - prev) < tol * 0.01) return x;
    prev = x;
    if (fx < 0) {
      lo = x; flo = fx;
      if (side === -1) fhi /= 2;
      side = -1;
    } else {
      hi = x; fhi = fx;
      if (side === 1) flo /= 2;
      side = 1;
    }
    if (hi - lo < tol) return (lo + hi) / 2;
  }
  return (lo + hi) / 2;
}
