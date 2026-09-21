/**
 * The charge index the datalog reports.
 *
 * WHAT USED TO BE HERE
 * This module held `knockThreshold` and `mbtTiming` — a base timing table plus eight
 * additive corrections, and an RPM-and-load correlation for MBT. Both are gone. The
 * knock limit is now solved from an integrated pressure trace in `cycle.js`
 * (`knockLimitedSpark`), and MBT is derived from burn phasing (`mbtFromBurn`), so every
 * input that used to need its own hand-fitted correction in degrees — octane,
 * compression, charge temperature, boost, mixture, head material, cylinder size —
 * now reaches the answer through the physics instead.
 *
 * What survives is the one thing that was never a correction: the charge index, which
 * is a plain description of how full the cylinder is, useful in the datalog and in the
 * exhaust-flow term.
 */

import { BARO_KPA } from './constants.js';

/**
 * How full the cylinder is, relative to a perfectly filled one at sea level.
 *
 * @param {number} veActual TRUE cylinder filling, percent
 * @param {number} mapKpa manifold absolute pressure, kPa
 * @returns {number} charge index; 1.0 is 100% VE at one atmosphere
 */
export function chargeIndexOf(veActual, mapKpa) {
  return (veActual / 100) * (mapKpa / BARO_KPA);
}
