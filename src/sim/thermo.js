/**
 * Charge thermodynamics.
 *
 * Compressing air heats it. Real compressors are ~70% isentropically efficient, so
 * charge temperature rises faster than ideal. An intercooler recovers most of that
 * back toward ambient. Charge temperature then feeds BOTH air density (via the ideal
 * gas law) and knock margin — the same coupling that exists on a real engine.
 */

import {
  AMBIENT_K, BARO_KPA, COMP_ISEN_EFF, GAMMA_EXP, IC_EFFECTIVENESS, PSI_TO_KPA,
} from './constants.js';
import { COEFF } from './coefficients.js';
import { clamp } from './math.js';

/**
 * Intake charge temperature after compression and (optionally) intercooling.
 *
 * @param {number} boostPsi gauge boost pressure, psi
 * @param {boolean} intercooler whether an intercooler is fitted
 * @returns {number} charge temperature, K
 */
export function chargeTempK(boostPsi, intercooler) {
  if (boostPsi <= 0) return AMBIENT_K;
  const pressureRatio = (BARO_KPA + boostPsi * PSI_TO_KPA) / BARO_KPA;
  const tCompressed = AMBIENT_K * Math.pow(pressureRatio, GAMMA_EXP / COMP_ISEN_EFF);
  return intercooler ? AMBIENT_K + (tCompressed - AMBIENT_K) * (1 - IC_EFFECTIVENESS) : tCompressed;
}

/**
 * Fraction of the trapped cylinder contents that is burned gas left from last cycle.
 *
 * Every four-stroke engine re-breathes some of its own exhaust. The clearance volume
 * cannot be emptied — at TDC it is still full of combustion products at roughly exhaust
 * pressure — and valve overlap lets more back in. Load is the dominant term: at part
 * throttle the manifold is in vacuum while the exhaust port is near atmospheric, so
 * exhaust pushes back into the cylinder during overlap and the residual fraction climbs
 * steeply. Under boost the fresh charge scavenges the chamber instead, and residuals
 * fall below the no-overlap floor.
 *
 * This is internal EGR, and it is why a big-cam engine idles badly, why part-throttle
 * cruise tolerates enormous spark advance, and why the same engine knocks at 100 kPa
 * that was perfectly happy at 40.
 *
 * @param {object} input
 * @param {number} input.mapKpa manifold absolute pressure, kPa
 * @param {number} input.empKpa exhaust manifold pressure, kPa
 * @param {number} input.overlapDeg valve overlap, crank degrees
 * @returns {number} residual mass fraction, 0..1
 */
export function residualFraction({ mapKpa, empKpa, overlapDeg }) {
  // Pressure ratio across the cylinder during overlap. Above 1 the exhaust port is
  // pushing back in; below 1 the fresh charge is blowing through.
  const backflow = Math.pow(Math.max(0.05, empKpa / Math.max(1, mapKpa)), COEFF.RESIDUAL_LOAD_EXP);
  const overlapTerm = 1 + overlapDeg * COEFF.RESIDUAL_PER_OVERLAP_DEG;
  return clamp(COEFF.RESIDUAL_BASE * backflow * overlapTerm, 0, COEFF.RESIDUAL_MAX);
}

/**
 * Charge temperature at intake valve close, after mixing with residual exhaust.
 *
 * The intake air temperature a sensor reads is not the temperature the charge starts
 * compression at. Hot residual gas is already in the cylinder and mixes with the
 * incoming charge, and the mixture is what the knock model needs. At light load, where
 * residual fractions are highest, this can be a hundred degrees.
 *
 * @param {number} intakeK incoming charge temperature, K
 * @param {number} residualFrac residual mass fraction
 * @returns {number} trapped charge temperature, K
 */
export function trappedChargeK(intakeK, residualFrac) {
  return intakeK * (1 - residualFrac) + COEFF.RESIDUAL_TEMP_K * residualFrac;
}

/**
 * Charge temperature drop as liquid fuel evaporates into it.
 *
 * The heat has to come from somewhere, and it comes from the charge. This is why a rich
 * mixture is a knock-control tool and not just a safety margin on lambda, and why E85 is
 * worth far more knock resistance than its octane number alone accounts for.
 *
 * @param {number} fuelMassG fuel delivered to the cylinder, grams
 * @param {number} airMassG air trapped in the cylinder, grams
 * @param {{stoich: number}} fuel
 * @returns {number} temperature drop, K
 */
export function evaporativeCoolingK(fuelMassG, airMassG, fuel) {
  const latent = fuel.stoich < COEFF.FUEL_ETHANOL_STOICH_MAX
    ? COEFF.FUEL_LATENT_HEAT_ETHANOL : COEFF.FUEL_LATENT_HEAT_GASOLINE;
  const heatJ = (fuelMassG / 1000) * latent * COEFF.FUEL_EVAP_IN_CYLINDER;
  return heatJ / Math.max(1e-6, (airMassG / 1000) * COEFF.CHARGE_CP);
}
