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
 * @param {number} [input.compression] static compression ratio; sets the clearance
 *   volume, which is the floor this whole quantity rests on
 * @returns {number} residual mass fraction, 0..1
 */
export function residualFraction({
  mapKpa, empKpa, overlapDeg, compression = COEFF.RESIDUAL_CR_REF,
}) {
  // Pressure ratio across the cylinder during overlap. Above 1 the exhaust port is
  // pushing back in; below 1 the fresh charge is blowing through.
  const backflow = Math.pow(Math.max(0.05, empKpa / Math.max(1, mapKpa)), COEFF.RESIDUAL_LOAD_EXP);
  const overlapTerm = 1 + overlapDeg * COEFF.RESIDUAL_PER_OVERLAP_DEG;
  // Clearance volume, relative to the reference engine. The gas that cannot be expelled
  // is the gas still in the chamber at TDC, and that volume is Vd/(CR-1) — so raising
  // compression genuinely traps LESS of the last cycle's exhaust. Until this term
  // existed the docblock above claimed the clearance volume set the floor and the code
  // did not read it, which meant a 12:1 build and an 8:1 build re-breathed identically.
  const clearanceTerm = (COEFF.RESIDUAL_CR_REF - 1) / Math.max(1.5, compression - 1);
  return clamp(
    COEFF.RESIDUAL_BASE * backflow * overlapTerm * clearanceTerm, 0, COEFF.RESIDUAL_MAX,
  );
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

/**
 * Exhaust gas temperature leaving the port — the turbine inlet, and the number the
 * datalog reports as EGT.
 *
 * ONE MODEL, TWO CONSUMERS. The turbine energy balance needs an exhaust temperature
 * before the cycle has been integrated, so it cannot use the cycle's own
 * end-of-expansion answer; the datalog needs one so the player can see when they are
 * cooking a turbine. Those used to be two different expressions — this correlation for
 * the turbine and an ad-hoc `720 + retard·22 + lean·45 + boost·6` for the gauge — which
 * meant the gauge and the machine disagreed about the same gas. They are the same
 * number now.
 *
 * SHAPE. Load raises exhaust temperature steeply at first and then SATURATES: past
 * roughly a full charge, extra air brings extra fuel but also extra expansion work and a
 * richer commanded mixture, so the gas leaves the port hotter by tens of degrees rather
 * than hundreds. The previous linear-in-load form had no such ceiling and put a stock
 * Golf R at 1030 °C, which is turbine-melting territory for an engine that ships with a
 * hundred-thousand-mile warranty.
 *
 * Retarded spark is the big one: burning fuel on the way out of the port is exactly what
 * retard does, and it is why a knock-limited tune runs so much hotter. A rich mixture
 * cools it, which is why over-fuelling is a turbine-protection strategy on a real car.
 *
 * @param {object} input
 * @param {number} input.chargeIndex how full the cylinder is, 1.0 at 100% VE and sea level
 * @param {number} input.lambda delivered lambda
 * @param {number} [input.knockRetardDeg] spark pulled by knock control
 * @returns {number} exhaust gas temperature, K
 */
export function exhaustTempK({ chargeIndex, lambda, knockRetardDeg = 0 }) {
  const loadRise = COEFF.EXHAUST_LOAD_SPAN_K
    * (1 - Math.exp(-Math.max(0, chargeIndex) / COEFF.EXHAUST_LOAD_SCALE));
  return COEFF.EXHAUST_BASE_K + loadRise
    + COEFF.EXHAUST_PER_RETARD_K * Math.max(0, knockRetardDeg)
    - COEFF.EXHAUST_RICH_COOLING_K * Math.max(0, 1 - lambda);
}

/**
 * The exhaust temperature the induction solve runs on, K.
 *
 * `solveInduction` has to price the turbine's expansion before it knows how much air the
 * engine ends up drawing — that is the fixed point it is solving — so it cannot use the
 * point's own exhaust temperature. It uses a full-charge, stoichiometric reference
 * instead. That is a real simplification and it is stated as one; the reason it does not
 * distort much is that the saturating load term above is nearly flat over the range a
 * boosted engine actually operates in.
 *
 * Defined once here because three callers need it, and three hand-inlined copies of
 * `EXHAUST_BASE_K + EXHAUST_PER_CHARGE_K` is how a model ends up with three exhaust
 * temperatures.
 */
export const INDUCTION_REF_EXHAUST_K = exhaustTempK({ chargeIndex: 1, lambda: 1 });
