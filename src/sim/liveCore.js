/**
 * What the live engine and its engine management (src/sim/ecu/liveEcu.js) both stand on: the
 * engine's rotational constants, the noisy lagged sensor, the manifold pressure a throttle
 * settles at, and the tachometer and airflow gauges.
 */

import { BARO_KPA } from './constants.js';
import { COEFF } from './coefficients.js';
import { clamp } from './math.js';

/** Crank + flywheel + damper rotational inertia, kg·m². */
export const ENGINE_INERTIA = 0.18;
/** Idle speed the ECU holds, RPM. */
export const IDLE_TARGET_RPM = 800;
/** Starter cranking speed, RPM. */
export const CRANK_RPM = 260;
/** Below this the engine has stalled, RPM. */
export const STALL_RPM = 380;
/** Default rev limiter fuel cut, RPM, when an engine states no redline. */
export const REDLINE_CUT = 7600;
/** How far past the redline the limiter cuts fuel. */
export const LIMITER_OVERSHOOT_RPM = 100;
/**
 * Below this crank speed a crank sensor produces no usable signal, so the ECU reports zero
 * rather than a small number, RPM.
 */
export const CRANK_SENSOR_MIN_RPM = 30;

/**
 * A simulated sensor: real ones are noisy and lag behind the true value.
 *
 * @param {number} prev previous reading
 * @param {number} trueVal actual underlying value
 * @param {number} lagFactor 0..1, how fast the reading catches up
 * @param {number} noiseAmp peak noise amplitude
 * @param {{rng?: number}|null} [s] the live state carrying the noise's seed
 * @returns {number}
 */
export function sensorRead(prev, trueVal, lagFactor, noiseAmp, s = null) {
  const lagged = prev + (trueVal - prev) * lagFactor;
  return lagged + (liveRandom(s) - 0.5) * 2 * noiseAmp;
}

/** Seed a live engine starts from: the same start, the same noise, run after run. */
export const LIVE_RNG_SEED = 0x2f6b5a11;

/**
 * The live engine's own random numbers, from a seed it carries in its state (`s.rng`):
 * sensor noise and false knock are reproducible, so a recorded run plays back the same
 * and a test needs nothing stubbed. Mulberry32. Without a state to carry it, Math.random.
 * @param {{rng?: number}|null} [s] live state, updated in place
 * @returns {number} 0..1
 */
export function liveRandom(s = null) {
  if (!s) return Math.random();
  let x = ((s.rng ?? LIVE_RNG_SEED) + 0x6d2b79f5) >>> 0;
  s.rng = x;
  x = Math.imul(x ^ (x >>> 15), x | 1);
  x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
  return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
}

/**
 * Engine speed as the manifold vacuum model reads it: against a fixed RPM datum, not this
 * engine's redline (see COEFF.MANIFOLD_VACUUM_RPM_NORM).
 * @param {number} rpm engine speed, held to the redline
 * @returns {number}
 */
export function vacuumSpeedFrac(rpm) {
  return Math.max(0, rpm / COEFF.MANIFOLD_VACUUM_RPM_NORM);
}

/**
 * Manifold pressure the throttle and engine settle at, before any boost.
 * @param {number} aFrac throttle opening, 0..1
 * @param {number} nFrac engine speed against COEFF.MANIFOLD_VACUUM_RPM_NORM
 * @param {number} overlapDeg valve overlap, degrees
 * @returns {number} kPa
 */
export function steadyManifoldKpa(aFrac, nFrac, overlapDeg) {
  const overlapBleed = overlapDeg * 0.0042;
  return BARO_KPA * clamp(
    0.18 + overlapBleed + 0.82 * Math.pow(aFrac, 0.75) - 0.28 * nFrac * Math.pow(1 - aFrac, 2),
    0.12, 1,
  );
}

/**
 * The tachometer and airflow gauges: lagged, noisy readings of engine speed and MAF.
 * @param {object} s live state, updated in place (`lope`, `sensedRpm`, `sensedMaf`)
 * @param {object|null} pt this step's operating point
 * @param {number} dt seconds
 * @param {number} overlapDeg valve overlap, degrees
 * @returns {number} the gauge lag factor for this step, for the caller's other gauges
 */
export function readSpeedAndAirflow(s, pt, dt, overlapDeg) {
  const lag = clamp(dt / 0.09, 0, 1);
  const lopeAmp = s.running && s.rpm < 1500 ? overlapDeg * 0.9 : 0;
  s.lope = lopeAmp;
  s.sensedRpm = s.rpm < CRANK_SENSOR_MIN_RPM
    ? 0
    : sensorRead(s.sensedRpm, s.rpm, lag, 14 + lopeAmp, s);
  s.sensedMaf = sensorRead(s.sensedMaf, pt ? pt.maf : 0, lag * 0.8, 1.4, s);
  return lag;
}
