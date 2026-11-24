/**
 * VE CORRECTION FROM LOGS — how a speed-density table is actually tuned.
 *
 * No tuner can see an engine's true volumetric efficiency. What they can see is the
 * wideband: log the car, and wherever the mixture the engine got differs from the one
 * the AFR table asked for, the ECU's air estimate was off by that ratio — too lean means
 * more air than the VE table thought. HP Tuners' VE histograms, Holley's learn and
 * Haltech's quick-tune all run on this:
 *
 *     VE_new = VE × (λ measured ÷ λ target) × (1 + fuel trims) × (MAF factor)
 *
 * The last term keeps the MAF's error out of the VE table. With the ECU blending a MAF
 * reading into its fuel, a MAF that reads wrong (a new intake housing) moves the mixture
 * too; that part belongs to the MAF calibration, and folding it into VE would have to be
 * undone the moment the MAF is fixed — which is why tuners tune the two separately.
 *
 * sorted into the cells the data was taken in, weighted by how close each sample sat to
 * each cell, and applied only where there is data. Cells the car never visited keep
 * whatever they had. Tuners apply about half, re-log, and repeat until the error is
 * within 2-3%: a histogram built from uneven samples overshoots if trusted outright.
 *
 * What is NOT data: acceleration enrichment, a cold engine's warm-up fuel, fuel cut,
 * nitrous, protection enrichment, misfires (unburnt oxygen reads lean), injectors at
 * their limit, and transients — anything where the mixture was not the VE table's doing.
 */

import { COEFF } from './coefficients.js';
import { readTable } from './layouts.js';
import { interp2 } from './math.js';
import { LOAD, RPM } from './tables.js';

/** A cell counts once its samples' weight passes this (coefficients.js). */
const MIN_CELL_WEIGHT = COEFF.VE_FIT_MIN_CELL_WEIGHT;
/** Below this share of a sample, it says too little about a cell to count there (coefficients.js). */
const MIN_SHARE = COEFF.VE_FIT_MIN_SHARE;
/** Steady-state only: manifold pressure moving faster than this between log rows is a
 *  transient, where the wall film and the sensor lag, not the VE table, set the mixture. */
const MAX_MAP_STEP_KPA = 3;
/** Warm-up fuel is on below this coolant temperature. */
const MIN_ECT_C = 75;

/**
 * @typedef {object} VeSample
 * @property {number} rpm
 * @property {number} mapKpa the load the ECU looked VE up by: manifold pressure as it read it,
 *   or on alpha-N the throttle opening as a share of 101.3 kPa
 * @property {number} lambdaRatio λ measured ÷ λ target: over 1 is leaner than asked
 * @property {number} trim what the fuel trims were adding, as a factor (1 = none)
 * @property {number} maf the MAF's error the ECU was applying, as a factor (1 = none)
 * @property {number} rescale the VE the row was logged against ÷ the table's VE there now
 *   (1 for a pull, which is only used while its table is the one on screen)
 * @property {number} ratio the factor the CURRENT table's VE at (rpm, mapKpa) is off by:
 *   the product of the four above
 * @property {'pull'|'live'} source
 */

/**
 * @param {Omit<VeSample, 'ratio'>} parts
 * @returns {VeSample}
 */
const sample = (parts) => ({ ...parts, ratio: parts.lambdaRatio * parts.trim * parts.maf * parts.rescale });

/**
 * Whether a protection changed the fuel the ECU meant to give, so the mixture no longer reads
 * the air estimate: EGT enrichment adds fuel, and a starved rail delivers less.
 * @param {string[]|undefined} protect
 */
const fuelledByProtection = (protect) => (protect ?? []).some((k) => k === 'egt' || k === 'fuelpressure' || k === 'nitrous lean');

/**
 * Samples from a dyno pull. A pull runs at full throttle, open loop, so its mixture
 * error is all the ECU's air estimate. Only valid while the tables it was taken with are
 * the ones on screen — the caller drops a stale pull.
 *
 * @param {object[]} points the pull's points
 * @returns {VeSample[]}
 */
export function veSamplesFromPull(points) {
  const out = [];
  for (const p of points ?? []) {
    if (!p.openLoop || !(p.sensedLambda > 0) || !(p.afrCommanded > 0)) continue;
    if ((p.nitrousLbMin ?? 0) > 0 || p.fuelLimited || p.fuelStarved || fuelledByProtection(p.protect)) continue;
    if ((p.cutPct ?? 0) > 0 || (p.misfire ?? 0) > 0) continue;
    const s = sample({
      rpm: p.rpm, mapKpa: p.ecuLoad ?? p.sensedMap ?? p.map, lambdaRatio: p.sensedLambda / (p.afrCommanded / 14.7),
      trim: 1, maf: 1 + (p.trimPct ?? 0) / 100, rescale: 1, source: 'pull',
    });
    if (!(s.ratio > 0.6 && s.ratio < 1.6)) continue;
    out.push(s);
  }
  return out;
}

/**
 * Samples from the LIVE datalog, rescaled to the table on screen: each row logged the VE
 * the ECU was using then, so a correction already applied since is not applied twice.
 *
 * @param {object[]} rows LIVE log rows
 * @param {number[][]} ve the VE table now
 * @param {import('./layouts.js').TableAxes} [axes] its breakpoints, when not the ECU Lab grid
 * @returns {VeSample[]}
 */
export function veSamplesFromLive(rows, ve, axes) {
  const out = [];
  let prev = null;
  for (const r of rows ?? []) {
    // The load the ECU read VE by: manifold pressure, or on alpha-N the throttle opening.
    const load = r.ecuLoad ?? r.sMap;
    const steady = prev && Math.abs(load - (prev.ecuLoad ?? prev.sMap)) <= MAX_MAP_STEP_KPA;
    prev = r;
    if (!steady || !r.running || r.rpm < 600 || r.ect < MIN_ECT_C) continue;
    if (Math.abs(r.ae ?? 0) >= 1 || (r.cut ?? 0) > 0 || (r.nitrous ?? 0) > 0 || (r.misfire ?? 0) > 0) continue;
    if (fuelledByProtection(r.protect) || !(r.veTable > 0) || !(r.lambdaTarget > 0) || !(r.sLambda > 0)) continue;
    const s = sample({
      rpm: r.rpm, mapKpa: load, lambdaRatio: r.sLambda / r.lambdaTarget,
      trim: (1 + (r.stft ?? 0) / 100) * (1 + (r.ltft ?? 0) / 100), maf: 1 + (r.mafPct ?? 0) / 100,
      rescale: r.veTable / Math.max(1, axes ? readTable(ve, axes, r.rpm, load) : interp2(ve, r.rpm, load)), source: 'live',
    });
    if (!(s.ratio > 0.6 && s.ratio < 1.6)) continue;
    out.push(s);
  }
  return out;
}

/** Where a value sits between two breakpoints of an axis, clamped at its ends. */
function bracket(axis, v) {
  const asc = axis[0] < axis[axis.length - 1];
  for (let i = 0; i < axis.length - 1; i += 1) {
    const [a, b] = [axis[i], axis[i + 1]];
    if (asc ? v <= b : v >= b) {
      const f = Math.min(1, Math.max(0, (v - a) / (b - a)));
      return [[i, 1 - f], [i + 1, f]];
    }
  }
  return [[axis.length - 1, 1]];
}

/** How hard the fit holds a cell to its own average, per unit of its data's weight. */
const FIT_HOLD = 0.25;

/**
 * The cells solved together, not one at a time. The ECU reads every sample through up to four
 * cells blended, so what one cell must change by depends on what its neighbours change by.
 * @param {VeSample[]} samples
 * @param {number[]} rows @param {number[]} cols
 * @param {(VeCell|null)[][]} cell the per-cell averages; null where the data is too thin
 * @returns {[number, number, number][]} [row, col, factor] for every fitted cell
 */
function fitRatios(samples, rows, cols, cell, tie = new Map()) {
  const index = new Map();
  const at = [];
  cell.forEach((row, ri) => row.forEach((c, ci) => { if (c) { index.set(ri * cols.length + ci, at.length); at.push([ri, ci]); } }));
  // A cell past the end of the log solved as the cell it carries on from: one unknown.
  for (const [k, t] of tie) if (index.has(t)) index.set(k, /** @type {number} */ (index.get(t)));
  const n = at.length;
  if (!n) return [];
  const N = Array.from({ length: n }, () => new Float64Array(n));
  const b = new Float64Array(n);
  for (const s of samples) {
    const terms = [];
    let rhs = s.ratio;
    for (const [ri, wr] of bracket(rows, s.mapKpa)) {
      for (const [ci, wc] of bracket(cols, s.rpm)) {
        const w = wr * wc;
        if (w <= 0) continue;
        const k = index.get(ri * cols.length + ci);
        if (k === undefined) rhs -= w; else terms.push([k, w]);
      }
    }
    for (const [i, wi] of terms) {
      b[i] += wi * rhs;
      for (const [j, wj] of terms) N[i][j] += wi * wj;
    }
  }
  at.forEach(([ri, ci], i) => {
    const c = /** @type {VeCell} */ (cell[ri][ci]);
    N[i][i] += FIT_HOLD * c.weight;
    b[i] += FIT_HOLD * c.weight * c.ratio;
  });
  const x = solveDense(N, b);
  if (!x) return [];
  // Within what one log can say about a cell: no further than the per-cell reading itself
  // could go (veSamplesFromPull keeps 0.6 to 1.6), so a weakly tied cell cannot run away.
  return at.map(([ri, ci], i) => [ri, ci, Math.min(1.6, Math.max(0.6, x[i]))]);
}

/**
 * Gaussian elimination with partial pivoting, in place on copies. Null if singular.
 * @param {Float64Array[]} A @param {Float64Array} y
 * @returns {Float64Array|null}
 */
function solveDense(A, y) {
  const n = y.length;
  const M = A.map((r) => Float64Array.from(r));
  const v = Float64Array.from(y);
  for (let c = 0; c < n; c += 1) {
    let p = c;
    for (let r = c + 1; r < n; r += 1) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) return null;
    [M[c], M[p]] = [M[p], M[c]]; [v[c], v[p]] = [v[p], v[c]];
    for (let r = c + 1; r < n; r += 1) {
      const f = M[r][c] / M[c][c];
      if (!f) continue;
      for (let k = c; k < n; k += 1) M[r][k] -= f * M[c][k];
      v[r] -= f * v[c];
    }
  }
  const x = new Float64Array(n);
  for (let r = n - 1; r >= 0; r -= 1) {
    let sum = v[r];
    for (let k = r + 1; k < n; k += 1) sum -= M[r][k] * x[k];
    x[r] = sum / M[r][r];
  }
  return x;
}

/**
 * @typedef {object} VeCell
 * @property {number} ratio the correction the cell's data asks for
 * @property {number} weight how much data it rests on (about one per sample right on it)
 * @property {number} samples how many samples touched it
 * @property {number} lambdaRatio the weighted mean of each sample's part, so the
 *   calculation can be shown: ratio ≈ lambdaRatio × trim × maf × rescale
 * @property {number} trim
 * @property {number} maf
 * @property {number} rescale
 */

/**
 * The correction each cell's data asks for.
 *
 * @param {VeSample[]} samples
 * @param {import('./layouts.js').TableAxes} [axes] the VE table's breakpoints, when not the
 *   ECU Lab grid (a layout's VE is always on manifold pressure)
 * @returns {{ratio: (number|null)[][], weight: number[][], cell: (VeCell|null)[][], cells: number}}
 *   `ratio[row][col]` the mean factor for a cell with enough data, else null; `cell`
 *   the same cell with the parts it was worked out from
 */
export function veCorrections(samples, axes) {
  const keys = ['ratio', 'lambdaRatio', 'trim', 'maf', 'rescale'];
  const rows = axes?.load ?? LOAD;
  const cols = axes?.rpm ?? RPM;
  const acc = rows.map(() => cols.map(() => ({ weight: 0, samples: 0, ratio: 0, lambdaRatio: 0, trim: 0, maf: 0, rescale: 0 })));
  /** Cells some sample is blended from at all, however little. */
  const touched = new Set();
  for (const s of samples) {
    for (const [ri, wr] of bracket(rows, s.mapKpa)) {
      for (const [ci, wc] of bracket(cols, s.rpm)) {
        const w = wr * wc;
        if (w > 1e-9) touched.add(ri * cols.length + ci);
        if (w < MIN_SHARE) continue;
        const a = acc[ri][ci];
        a.weight += w;
        a.samples += 1;
        for (const k of keys) a[k] += w * /** @type {any} */ (s)[k];
      }
    }
  }
  let cells = 0;
  const cell = acc.map((row) => row.map((a) => {
    if (a.weight < MIN_CELL_WEIGHT) return null;
    cells += 1;
    /** @type {any} */
    const out = { weight: a.weight, samples: a.samples };
    for (const k of keys) out[k] = /** @type {any} */ (a)[k] / a.weight;
    return /** @type {VeCell} */ (out);
  }));
  // A column past the fastest a log reached (past the redline) that the ECU still blends into the
  // logged speeds carries on the last logged column's correction, as a tuner carries the trend on:
  // held still, it left a miss there that a hand edit and the next correction fought over. Cells
  // no logged point reads at all are left alone: the log says nothing about them.
  const maxRpm = samples.reduce((m, s) => Math.max(m, s.rpm), -Infinity);
  /** @type {Map<number, number>} */
  const tie = new Map();
  rows.forEach((_, ri) => {
    let last = -1;
    cols.forEach((c, ci) => { if (c <= maxRpm && cell[ri][ci]) last = ci; });
    if (last < 0) return;
    cols.forEach((c, ci) => { if (ci > last && c > maxRpm && !cell[ri][ci] && touched.has(ri * cols.length + ci)) tie.set(ri * cols.length + ci, ri * cols.length + last); });
  });
  const fitted = fitRatios(samples, rows, cols, cell, tie);
  for (const [ri, ci, r] of fitted) /** @type {any} */ (cell[ri][ci]).ratio = r;
  const ratio = cell.map((row) => row.map((c) => (c ? c.ratio : null)));
  for (const [k, t] of tie) {
    const src = ratio[Math.floor(t / cols.length)][t % cols.length];
    if (src != null) ratio[Math.floor(k / cols.length)][k % cols.length] = src;
  }
  return {
    ratio,
    weight: acc.map((row) => row.map((a) => a.weight)),
    cell,
    cells,
  };
}

/**
 * The MAF's own error across the samples, as a percentage, weighted like the cells: what
 * the MAF calibration should fix, not the VE table. Zero with no MAF in the fuel path.
 *
 * @param {VeSample[]} samples
 * @returns {number}
 */
export function mafErrorPct(samples) {
  if (!samples.length) return 0;
  return (samples.reduce((sum, s) => sum + s.maf, 0) / samples.length - 1) * 100;
}

/**
 * The table with a share of the logged correction applied to every cell that has data.
 *
 * @param {number[][]} ve
 * @param {(number|null)[][]} ratio from `veCorrections`
 * @param {number} share 0..1 — tuners apply about half, then re-log
 * @param {{min?: number, max?: number}} [limits] the table's own range
 * @returns {number[][]}
 */
export function applyVeCorrections(ve, ratio, share, { min = 10, max = 130 } = {}) {
  return ve.map((row, ri) => row.map((v, ci) => {
    const r = ratio[ri]?.[ci];
    if (r == null) return v;
    return Number(Math.min(max, Math.max(min, v * (1 + share * (r - 1)))).toFixed(1));
  }));
}
