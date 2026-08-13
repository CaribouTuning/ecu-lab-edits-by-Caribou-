/**
 * Peak cylinder pressure — what the metal actually feels.
 *
 * Knock is not the only way boost and compression break an engine. Every combustion
 * cycle drives a pressure spike into the piston crown, down the rod, through the rod
 * bolts and into the bearings, and that spike is a mechanical load whether or not the
 * mixture detonates. An engine can run a perfectly knock-free tune and still bend a
 * rod, which is exactly what happens when a big fuel's octane rating is used to buy
 * back the knock margin that high static compression under boost costs: the knock
 * goes away, the pressure does not.
 *
 * THE THREE THINGS THAT SET IT
 *   1. What is trapped. Manifold pressure times how much of the cylinder actually
 *      fills — a better-breathing engine at the same MAP traps more, so it peaks
 *      higher. This is the same trapped-charge idea the knock model uses.
 *   2. How hard it is squeezed. The static compression ratio, raised to a polytropic
 *      exponent. This is why compression multiplies rather than adds: a point of
 *      compression is worth proportionally more pressure the more boost is behind it,
 *      which is precisely the interaction the model used to miss.
 *   3. Where the burn happens. Spark at MBT puts the pressure peak just after TDC,
 *      where it is highest. Retard it and the peak lands later, on a descending
 *      piston in a growing volume, so it is lower — which is why pulling timing saves
 *      an engine from itself twice over, and why a knock-limited tune is under LESS
 *      mechanical stress than the same build tuned to MBT on better fuel.
 *
 * WHY CHARGE TEMPERATURE IS NOT A TERM HERE. Pressure at the start of compression is
 * manifold pressure, whatever the temperature: hot air is simply fewer molecules at
 * that same pressure. So an intercooler does not lower peak pressure directly — it
 * RAISES it, by densifying the charge (more trapped mass) and by buying knock margin
 * the tune spends on advance. Charge temperature earns its keep in the knock model,
 * not here.
 *
 * The output is a real pressure in bar, not a unitless index, so it can be checked
 * against published figures: a naturally aspirated engine at wide-open throttle peaks
 * near 50-60 bar, a production boosted engine near 90-120, and much past 130 is where
 * stock cast pistons and powdered-metal rods start coming apart.
 */

import { COEFF } from './coefficients.js';
import { KPA_PER_BAR } from './constants.js';

/**
 * Peak in-cylinder pressure for one operating point.
 *
 * @param {object} input
 * @param {number} input.compression static compression ratio
 * @param {number} input.mapKpa manifold absolute pressure, kPa
 * @param {number} input.veActual TRUE cylinder filling, percent
 * @param {number} input.usedTiming spark advance actually run, degrees BTDC
 * @param {number} input.mbtIdeal minimum spark for best torque here, degrees BTDC
 * @returns {number} peak cylinder pressure, bar
 */
export function peakPressureBar({ compression, mapKpa, veActual, usedTiming, mbtIdeal }) {
  // Trapped pressure: the charge the cylinder actually holds at the bottom of the
  // stroke, expressed as the pressure that mass of air exerts there.
  const trappedBar = (mapKpa * (veActual / 100)) / KPA_PER_BAR;
  const motoredBar = trappedBar * Math.pow(compression, COEFF.PEAK_POLYTROPIC_N);
  const advance = usedTiming - mbtIdeal;
  // Past MBT the burn completes earlier against a still-rising piston, so pressure
  // keeps climbing even though torque is falling — the over-advanced tune that makes
  // less power while stressing the engine more. The rise is capped because the burn
  // cannot start before the charge is there to burn.
  const phasing = advance >= 0
    ? 1 + Math.min(advance, COEFF.PEAK_ADVANCE_CAP_DEG) * COEFF.PEAK_ADVANCE_RISE_PER_DEG
    : Math.max(COEFF.PEAK_RETARD_FLOOR, 1 + advance * COEFF.PEAK_RETARD_FALL_PER_DEG);
  return motoredBar * COEFF.PEAK_COMBUSTION_RISE * phasing;
}
