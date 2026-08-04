/**
 * Engine architecture — turns the player's short-block design into the derived
 * properties the physics needs.
 *
 * Bore, stroke, compression, materials, camshaft and valve springs are all
 * player-editable and feed real physics downstream.
 */

import { CHAR_SCALE, OTTO_REALIZATION } from './constants.js';
import { COEFF } from './coefficients.js';
import { CYL_COUNT } from './hardware.js';

/** Stock camshaft duration, crank degrees. */
export const CAM_BASE_DURATION = 210;

/**
 * How far the VE peak moves for a given cam duration.
 *
 * Duration is how long (in crank degrees) a valve stays open. A longer cam holds the
 * intake valve open later into the compression stroke, so at low RPM some charge is
 * pushed back out — but at high RPM the extra open time is exactly what lets the
 * cylinder keep filling. That is why a big cam trades bottom end for top end.
 *
 * @param {number} camDuration crank degrees
 * @returns {number} RPM the VE peak shifts by
 */
export function camPeakShiftRpm(camDuration) {
  return (camDuration - CAM_BASE_DURATION) * COEFF.CAM_PEAK_SHIFT_PER_DEG;
}

/**
 * Valve overlap — both valves open together around TDC.
 *
 * Scales with duration, and is what makes a big cam idle rough and lose manifold
 * vacuum.
 *
 * @param {number} camDuration crank degrees
 * @returns {number} overlap, crank degrees
 */
export function camOverlapDeg(camDuration) {
  return Math.max(0, (camDuration - CAM_BASE_DURATION) * COEFF.CAM_OVERLAP_PER_DEG);
}

/**
 * The engine speed above which the valves stop following the cam lobe.
 *
 * Springs must close the valve faster than the cam ramp as RPM climbs. Past their
 * limit the valve "floats" — it stops following the lobe, so the cylinder cannot fill
 * and power falls off a cliff. Bigger cams need stiffer springs.
 *
 * @param {number} springRate valve spring rate
 * @param {number} camDuration crank degrees
 * @returns {number} float speed, RPM
 */
export function valveFloatRpm(springRate, camDuration) {
  return COEFF.FLOAT_BASE_RPM
    + (springRate - 50) * COEFF.FLOAT_PER_SPRING_RATE
    - (camDuration - CAM_BASE_DURATION) * COEFF.FLOAT_PER_CAM_DEG;
}

/**
 * Parasitic loss from compressing stiffer valve springs, every cycle.
 *
 * @param {number} springRate valve spring rate
 * @returns {number} extra FMEP, Pa
 */
export function springFrictionPa(springRate) {
  return Math.max(0, (springRate - 50) * COEFF.SPRING_FMEP_PER_RATE);
}

/**
 * Bore/stroke ratio bias — oversquare engines favour high RPM, undersquare favour low.
 *
 * @param {number} rpm engine speed
 * @param {number} ratio bore ÷ stroke
 * @returns {number} multiplier
 */
export function charMultiplier(rpm, ratio) {
  const norm = (rpm - 4500) / 3000; // -1 at 1500 rpm, +1 at 7500 rpm
  return 1 + (ratio - 1) * CHAR_SCALE * norm;
}

/**
 * @typedef {object} EngineConfig
 * @property {'I4'|'V6'|'V8'} configuration
 * @property {number} bore mm
 * @property {number} stroke mm
 * @property {number} compression static compression ratio
 * @property {'Cast Iron'|'Aluminum'} blockMaterial
 * @property {'Cast Iron'|'Aluminum'} headMaterial
 * @property {number} [camDuration] crank degrees
 * @property {number} [springRate] valve spring rate
 */

/**
 * @typedef {object} DerivedEngine
 * @property {number} cyl cylinder count
 * @property {number} displacementL total displacement, litres
 * @property {number} ratio bore ÷ stroke
 * @property {number} configKnockBonus knock margin from cylinder size, degrees
 * @property {number} materialKnockBonus knock margin from head material, degrees
 * @property {number} compressionKnockAdj knock margin from compression ratio, degrees
 * @property {number} thermalEff indicated thermal efficiency
 * @property {number} ottoIdeal ideal Otto-cycle efficiency
 * @property {number} torqueScale displacement relative to the 3.5 L baseline
 * @property {number} bearingWearMult block material wear multiplier
 * @property {string} character human-readable bore/stroke description
 * @property {number} perCylL per-cylinder displacement, litres
 * @property {number} camDuration crank degrees
 * @property {number} springRate valve spring rate
 * @property {number} overlapDeg valve overlap, crank degrees
 * @property {number} floatRpm valve float speed, RPM
 * @property {number} springPa spring friction FMEP, Pa
 */

/**
 * Turns bore/stroke/compression/materials/configuration into the physics deltas used
 * by {@link evaluatePoint}. This is the whole "engine designer" payoff.
 *
 * @param {EngineConfig} cfg
 * @returns {DerivedEngine}
 */
export function deriveEngine(cfg) {
  const cyl = CYL_COUNT[cfg.configuration];
  const boreCm = cfg.bore / 10, strokeCm = cfg.stroke / 10;
  const displacementL = (Math.PI / 4 * boreCm * boreCm * strokeCm * cyl) / 1000;
  const ratio = cfg.bore / cfg.stroke;
  const perCylL = displacementL / cyl;
  const configKnockBonus = perCylL < 0.5 ? 1 : perCylL > 0.7 ? -1 : 0;
  const materialKnockBonus = cfg.headMaterial === 'Cast Iron' ? -1.5 : 0;
  const compressionKnockAdj = (10.3 - cfg.compression) * 2.0;
  // Thermal efficiency comes from the ideal Otto cycle for this compression ratio,
  // scaled by what real engines actually realize.
  const ottoIdeal = 1 - 1 / Math.pow(cfg.compression, 0.35);
  // INDICATED efficiency — work done on the piston, before friction and pumping are
  // paid for. Brake (usable) output is computed later as IMEP minus FMEP.
  const thermalEff = ottoIdeal * OTTO_REALIZATION;
  const torqueScale = displacementL / 3.5;
  const bearingWearMult = cfg.blockMaterial === 'Cast Iron' ? 0.85 : 1.0;
  const camDuration = cfg.camDuration ?? CAM_BASE_DURATION;
  const springRate = cfg.springRate ?? 50;
  const overlapDeg = camOverlapDeg(camDuration);
  const floatRpm = valveFloatRpm(springRate, camDuration);
  const springPa = springFrictionPa(springRate);
  const character = ratio > 1.08
    ? 'Oversquare — revs and breathes higher'
    : ratio < 0.95 ? 'Undersquare — stronger low-end torque' : 'Square — balanced';
  return {
    cyl, displacementL, ratio, configKnockBonus, materialKnockBonus, compressionKnockAdj,
    thermalEff, ottoIdeal, torqueScale, bearingWearMult, character, perCylL,
    camDuration, springRate, overlapDeg, floatRpm, springPa,
  };
}
