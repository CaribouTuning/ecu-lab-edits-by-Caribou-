/**
 * VE CORRECTION FROM LOGS — how a speed-density table is actually tuned.
 *
 * No tuner can see an engine's true volumetric efficiency. What they can see is the
 * wideband: log the car, and wherever the mixture the engine got differs from the one
 * the AFR table asked for, the ECU's air estimate was off by that ratio — too lean means
 * more air than the VE table thought. HP Tuners' VE histograms, Holley's learn and
 * Haltech's quick-tune all run on this:
 *
 *     VE_new = VE × (λ measured ÷ λ target) × (1 + fuel trims)
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

import { interp2 } from './math.js';
import { LOAD, RPM } from './tables.js';

/** A cell counts once its weight passes this: about two samples sitting right on it. */
const MIN_CELL_WEIGHT = 2;
/** A sample shares itself among the four cells around it; below this share it says too
 *  little about a cell to count there. */
const MIN_SHARE = 0.2;
/** Steady-state only: manifold pressure moving faster than this between log rows is a
 *  transient, where the wall film and the sensor lag, not the VE table, set the mixture. */
const MAX_MAP_STEP_KPA = 3;
/** Warm-up fuel is on below this coolant temperature. */
const MIN_ECT_C = 75;

/**
 * @typedef {{rpm: number, mapKpa: number, ratio: number}} VeSample
 *   `ratio` is the factor the CURRENT table's VE at (rpm, mapKpa) is off by
 */

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
    if ((p.nitrousLbMin ?? 0) > 0 || p.fuelLimited || p.fuelStarved || (p.protect?.length ?? 0) > 0) continue;
    if ((p.cutPct ?? 0) > 0 || (p.misfire ?? 0) > 0) continue;
    const ratio = p.sensedLambda / (p.afrCommanded / 14.7);
    if (!(ratio > 0.6 && ratio < 1.6)) continue;
    out.push({ rpm: p.rpm, mapKpa: p.sensedMap ?? p.map, ratio });
  }
  return out;
}

/**
 * Samples from the LIVE datalog, rescaled to the table on screen: each row logged the VE
 * the ECU was using then, so a correction already applied since is not applied twice.
 *
 * @param {object[]} rows LIVE log rows
 * @param {number[][]} ve the VE table now
 * @returns {VeSample[]}
 */
export function veSamplesFromLive(rows, ve) {
  const out = [];
  let prev = null;
  for (const r of rows ?? []) {
    const steady = prev && Math.abs(r.sMap - prev.sMap) <= MAX_MAP_STEP_KPA;
    prev = r;
    if (!steady || !r.running || r.rpm < 600 || r.ect < MIN_ECT_C) continue;
    if (Math.abs(r.ae ?? 0) >= 1 || (r.cut ?? 0) > 0 || (r.nitrous ?? 0) > 0 || (r.misfire ?? 0) > 0) continue;
    if ((r.protect?.length ?? 0) > 0 || !(r.veTable > 0) || !(r.lambdaTarget > 0) || !(r.sLambda > 0)) continue;
    const then = (r.sLambda / r.lambdaTarget) * (1 + (r.stft ?? 0) / 100) * (1 + (r.ltft ?? 0) / 100);
    const ratio = (then * r.veTable) / Math.max(1, interp2(ve, r.rpm, r.sMap));
    if (!(ratio > 0.6 && ratio < 1.6)) continue;
    out.push({ rpm: r.rpm, mapKpa: r.sMap, ratio });
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

/**
 * The correction each cell's data asks for.
 *
 * @param {VeSample[]} samples
 * @returns {{ratio: (number|null)[][], weight: number[][], cells: number}}
 *   `ratio[row][col]` the mean factor for a cell with enough data, else null
 */
export function veCorrections(samples) {
  const weight = LOAD.map(() => RPM.map(() => 0));
  const sum = LOAD.map(() => RPM.map(() => 0));
  for (const s of samples) {
    for (const [ri, wr] of bracket(LOAD, s.mapKpa)) {
      for (const [ci, wc] of bracket(RPM, s.rpm)) {
        const w = wr * wc;
        if (w < MIN_SHARE) continue;
        weight[ri][ci] += w;
        sum[ri][ci] += w * s.ratio;
      }
    }
  }
  let cells = 0;
  const ratio = weight.map((row, ri) => row.map((w, ci) => {
    if (w < MIN_CELL_WEIGHT) return null;
    cells += 1;
    return sum[ri][ci] / w;
  }));
  return { ratio, weight, cells };
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
