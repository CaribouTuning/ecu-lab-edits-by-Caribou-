/**
 * The knock sensor: an accelerometer bolted to the block, which hears detonation AND
 * everything else the engine does mechanically.
 *
 * Detonation rings the cylinder at its acoustic resonance, and the ring's amplitude
 * grows with how hard the end gas went off — here, with how far past the knock limit the
 * spark is, scaled by cylinder pressure. The valvetrain makes noise in the same band,
 * growing with the square of engine speed and with how hard the valves are slammed
 * shut: stiffer springs and bigger cams are louder.
 *
 * The ECU compares the band-passed signal against a threshold per RPM. Set it too low
 * and valve noise at high RPM is "knock" — the ECU retards for nothing and the engine
 * goes flat at the top end. Set it too high and real knock runs unheard. The factory sets
 * it just above the noise of the engine as built, which is why changing the cam or the
 * springs without re-learning the threshold produces false knock.
 */

import { clamp } from '../math.js';

/**
 * Background mechanical noise in the knock band, volts.
 * @param {number} rpm
 * @param {{springRate?: number, camDuration?: number}} derived
 * @returns {number}
 */
export function knockNoiseV(rpm, derived) {
  const valvetrain = Math.sqrt((derived.springRate ?? 50) / 50)
    * (1 + Math.max(0, (derived.camDuration ?? 210) - 210) / 150);
  return 0.05 + 0.25 * Math.pow(Math.max(0, rpm) / 6000, 2) * valvetrain;
}

/**
 * Knock signal per degree past the knock limit, volts. Pressure scales the ring.
 * @param {number} peakBar cylinder pressure the knock happens at
 * @returns {number}
 */
export function knockSignalPerDegV(peakBar) {
  return 0.012 * Math.max(15, peakBar);
}

/** Noise peaks run this far above the mean, which is what a threshold has to clear. */
const NOISE_PEAK = 1.3;

/**
 * The factory threshold: just above the peaks of this engine's own noise.
 * @param {number} rpm
 * @param {{springRate?: number, camDuration?: number}} derived
 * @returns {number} volts
 */
export function factoryKnockThresholdV(rpm, derived) {
  return 1.35 * knockNoiseV(rpm, derived) + 0.04;
}

/**
 * What a steady knock controller can and cannot do at one point.
 *
 * @param {object} input
 * @param {number} input.rpm
 * @param {number} input.peakBar estimated peak cylinder pressure
 * @param {number} input.thresholdV the ECU's threshold here
 * @param {{springRate?: number, camDuration?: number}} input.derived
 * @param {number} input.maxRetardDeg
 * @returns {{deadbandDeg: number, falseRetardDeg: number, noiseV: number}}
 *   `deadbandDeg`: how far past the limit knock can go before it is heard.
 *   `falseRetardDeg`: retard the controller settles at from noise alone.
 */
export function knockDetection({ rpm, peakBar, thresholdV, derived, maxRetardDeg }) {
  const noise = knockNoiseV(rpm, derived);
  const perDeg = knockSignalPerDegV(peakBar);
  const deadbandDeg = Math.max(0, thresholdV - noise) / perDeg;
  // Fraction of the time noise peaks cross the threshold. Each crossing is a retard step
  // and recovery is slow, so even a modest crossing rate pins the retard near its limit.
  const cross = clamp((NOISE_PEAK * noise - thresholdV) / (0.3 * noise), 0, 1);
  return { deadbandDeg, falseRetardDeg: maxRetardDeg * Math.sqrt(cross), noiseV: noise };
}
