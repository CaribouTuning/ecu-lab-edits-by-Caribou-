/**
 * What the live engine and its engine management (src/sim/ecu/liveEcu.js) both stand on:
 * the engine's rotational constants, the noisy lagged sensor, the manifold pressure a
 * throttle settles at, and the tachometer and airflow gauges.
 *
 * A leaf of its own so that `live.js` (which calls the engine management) and `liveEcu.js`
 * (which needs these) do not import each other. `live.js` re-exports all of it, so
 * nothing outside changes.
 */

import { BARO_KPA } from './constants.js';
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
 * Below this crank speed a crank sensor produces no usable signal, so the ECU reports
 * zero rather than a small number, RPM.
 *
 * A variable-reluctance pickup's output voltage is proportional to how fast a tooth goes
 * past it; with nothing turning there are no teeth and no signal, and reading noise off a
 * stationary crank is not a measurement. Without this the tachometer sat at about 28 RPM
 * for ever after the engine was switched off, which is what a stopped engine looked like:
 * still running.
 *
 * Here rather than in COEFF deliberately. The fingerprint hashes COEFF whole, so a
 * coefficient added there moves the fixture even when — as here — it cannot move a single
 * dyno figure. This is a property of the tachometer, it sits with the rest of the live
 * model's own constants above, and the gate stays meaningful.
 */
export const CRANK_SENSOR_MIN_RPM = 30;

/**
 * A simulated sensor: real ones are noisy and lag behind the true value.
 *
 * @param {number} prev previous reading
 * @param {number} trueVal actual underlying value
 * @param {number} lagFactor 0..1, how fast the reading catches up
 * @param {number} noiseAmp peak noise amplitude
 * @returns {number}
 */
export function sensorRead(prev, trueVal, lagFactor, noiseAmp) {
  const lagged = prev + (trueVal - prev) * lagFactor;
  return lagged + (Math.random() - 0.5) * 2 * noiseAmp;
}

/**
 * Manifold pressure the throttle and engine settle at, before any boost.
 *
 * A closed throttle at high RPM pulls far harder vacuum than the same opening at idle,
 * because the engine is trying to pump much more air through the same restriction; that
 * RPM term is what lets the engine decelerate on a closed throttle. Valve overlap lets
 * exhaust back into the intake at low speed, so a big cam simply cannot pull strong
 * vacuum at idle — which is why cammed engines idle high and lumpy.
 *
 * Shared with the live engine management (src/sim/ecu/liveEcu.js), which passes the
 * overlap its cam phasers have added.
 *
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
 * Overlap makes the idle lope, and the lope shows on the tach. Shared with the live
 * engine management, which reads its other sensors itself.
 *
 * A CRANK SENSOR THAT IS NOT TURNING READS ZERO, and reads it exactly. Everything else
 * here is a real transducer with lag and noise, but a stationary crank presents no teeth
 * to the pickup, so there is no signal to be noisy — the ECU sees no pulses and reports
 * no speed. Left as a noisy reading it never settled, and a switched-off engine showed a
 * tachometer wandering around 28 RPM for as long as you cared to watch it.
 *
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
    : sensorRead(s.sensedRpm, s.rpm, lag, 14 + lopeAmp);
  s.sensedMaf = sensorRead(s.sensedMaf, pt ? pt.maf : 0, lag * 0.8, 1.4);
  return lag;
}
