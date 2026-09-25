/**
 * NITROUS OXIDE: carrying oxygen into the cylinder instead of pumping it.
 *
 * N₂O is 36.4% oxygen by mass against air's 23.1%, so a kilogram of it brings the oxygen
 * of 1.57 kg of air. Above about 300 °C it comes apart (2 N₂O → 2 N₂ + O₂), and that
 * breakdown itself releases 82 kJ per mole — heat on top of what the extra fuel burns.
 * It arrives as a liquid and flashes to vapour in the intake, cooling the charge as it
 * boils; the vapour then takes up room the air would have had.
 *
 * THE BOTTLE. N₂O is stored as a liquid under its own vapour pressure, so bottle pressure
 * is set by bottle TEMPERATURE, not by how full it is: about 760 psi at 70 °F, 920 at 85 °F,
 * and 1,050 at its critical point, 97.6 °F. The jets are sized for a pressure (900-950 psi),
 * so a cold bottle flows less nitrous than the shot is rated for and a hot one more. Spray
 * and the liquid boils to replace what left, chilling what remains: pressure falls
 * through a pass unless a heater holds it.
 *
 * THE JETS. A "100 shot" is a jet sized to add about 100 hp at rated bottle pressure; it
 * flows 5-6 lb of nitrous a minute. Flow through the jet goes as √(ρ·ΔP) — liquid through
 * an orifice. A WET kit meters fuel through its own jet from the fuel system, at a fixed
 * pressure, so its fuel does not follow the bottle: a cold bottle runs the nitrous mixture
 * rich and a hot one lean. A DRY kit sprays nitrous only and relies on the ECU to add the
 * fuel through the injectors.
 */

import { COEFF } from './coefficients.js';
import { clamp } from './math.js';

/** Nitrous oxide's own properties. */
export const N2O = {
  molarG: 44.013,
  /** Specific gas constant, J/(kg·K): 8.314 J/(mol·K) over 44.013 g/mol. */
  gasConstant: 8.314462618 / 0.044013,
  /** Mass fraction of oxygen, and of the nitrogen left behind. */
  o2MassFrac: 32 / (2 * 44.013),
  /** Decomposition enthalpy, 2 N₂O → 2 N₂ + O₂: −82.05 kJ/mol (NIST), per kg. */
  decompJPerKg: 82050 / 0.044013,
  /** Critical point (NIST): 309.52 K, 7.245 MPa, 452 kg/m³. */
  critK: 309.52,
  critDensity: 452,
  /** Normal boiling point and enthalpy of vaporisation there (NIST: 184.67 K, 16.53 kJ/mol). */
  nbpK: 184.67,
  hvapNbpJPerKg: 16530 / 0.044013,
};

/** Oxygen in air, by mass. */
const AIR_O2_MASS_FRAC = 0.2314;

/** How much air a gram of nitrous is worth in oxygen. */
export const N2O_AIR_EQUIV = N2O.o2MassFrac / AIR_O2_MASS_FRAC;

/**
 * Bottle pressure at a bottle temperature, psi (gauge). Clausius-Clapeyron through the
 * racing charts' 762 psi at 70 °F and 921 psi at 85 °F; it reproduces their ~590 psi at
 * 50 °F and the 1,053 psi critical point. Above the critical temperature there is no
 * liquid left to hold a vapour pressure; the bottle is held at the critical value here.
 *
 * @param {number} bottleK
 * @returns {number}
 */
export function bottlePressurePsi(bottleK) {
  const t = Math.min(bottleK, N2O.critK);
  return COEFF.N2O_REF_PSI * Math.exp(-COEFF.N2O_VAPOUR_B * (1 / t - 1 / COEFF.N2O_REF_K));
}

/**
 * Density of the saturated liquid, kg/m³: a fitted curve through the published 907 at
 * 0 °C and ~785 at 20 °C, collapsing to 452 at the critical point.
 *
 * @param {number} bottleK
 * @returns {number}
 */
export function liquidDensity(bottleK) {
  const tr = Math.min(bottleK, N2O.critK) / N2O.critK;
  return N2O.critDensity * (1 + COEFF.N2O_DENSITY_SHAPE * Math.cbrt(Math.max(0, 1 - tr)));
}

/**
 * Heat it takes to boil the liquid, J/kg, by the Watson relation from the normal boiling
 * point: about 235 kJ/kg at 0 °C, 175 at 20 °C, 120 at 30 °C and none at the critical point.
 * It is what the flashing nitrous takes from the charge, so a hot bottle cools it less.
 *
 * @param {number} bottleK
 * @returns {number}
 */
export function latentHeatJPerKg(bottleK) {
  const tr = Math.min(bottleK, N2O.critK) / N2O.critK;
  const trNbp = N2O.nbpK / N2O.critK;
  return N2O.hvapNbpJPerKg * Math.pow(Math.max(0, 1 - tr) / (1 - trNbp), 0.38);
}

/**
 * Nitrous flow through a jet, kg/s.
 *
 * @param {object} input
 * @param {number} input.shotHp what the jet is rated to add
 * @param {number} input.bottlePsi bottle pressure, gauge
 * @param {number} input.bottleK
 * @param {number} input.manifoldPsi manifold pressure the jet sprays into, gauge
 * @returns {number}
 */
export function nitrousFlowKgS({ shotHp, bottlePsi, bottleK, manifoldPsi }) {
  const refKgS = shotHp * COEFF.N2O_LB_MIN_PER_HP * 0.45359237 / 60;
  const dp = Math.max(0, bottlePsi - manifoldPsi);
  const refDensity = liquidDensity(COEFF.N2O_REF_BOTTLE_K);
  return refKgS * Math.sqrt(dp / COEFF.N2O_REF_BOTTLE_PSI) * Math.sqrt(liquidDensity(bottleK) / refDensity);
}

/**
 * Fuel a wet kit's fuel jet delivers, kg/s: sized so the nitrous it is paired with burns
 * at the kit's jetted mixture at rated bottle pressure, and fixed from there by the fuel
 * pressure behind it — it does not follow the bottle.
 *
 * @param {number} shotHp
 * @param {{stoich: number}} fuel
 * @returns {number}
 */
export function wetKitFuelKgS(shotHp, fuel) {
  const refKgS = shotHp * COEFF.N2O_LB_MIN_PER_HP * 0.45359237 / 60;
  return (refKgS * N2O_AIR_EQUIV) / (fuel.stoich * COEFF.N2O_WET_LAMBDA);
}

/**
 * The bottle through a pass: the liquid that leaves boils off part of what stays, and the
 * heat for that comes out of the liquid and the bottle wall, so both cool and the pressure
 * with them. A heater, if fitted and switched on, works to hold its set point.
 *
 * @param {{massKg: number, tempK: number}} bottle
 * @param {number} usedKg nitrous drawn this step
 * @param {number} dt seconds
 * @param {{heater: boolean, setK: number, ambientK: number}} opts
 * @returns {{massKg: number, tempK: number}}
 */
export function stepBottle(bottle, usedKg, dt, { heater, setK, ambientK }) {
  const massKg = Math.max(0, bottle.massKg - usedKg);
  const heatCap = massKg * COEFF.N2O_LIQUID_CP + COEFF.N2O_BOTTLE_WALL_J_PER_K;
  let tempK = bottle.tempK - (usedKg * latentHeatJPerKg(bottle.tempK)) / Math.max(1, heatCap);
  if (heater && tempK < setK) tempK = Math.min(setK, tempK + (COEFF.N2O_HEATER_W * dt) / Math.max(1, heatCap));
  // The bottle also drifts toward the air around it.
  tempK += (ambientK - tempK) * clamp(dt / COEFF.N2O_BOTTLE_AMBIENT_TAU_S, 0, 1);
  return { massKg, tempK };
}

/**
 * The nitrous and wet-kit fuel reaching one cylinder event.
 *
 * @param {object} input
 * @param {number} input.n2oKgS nitrous flow
 * @param {number} input.fuelKgS wet-kit fuel flow (0 for a dry kit)
 * @param {number} input.rpm
 * @param {number} input.cyl
 * @returns {{n2oG: number, fuelG: number}}
 */
export function perCylinderEvent({ n2oKgS, fuelKgS, rpm, cyl }) {
  const eventsPerS = cyl * (rpm / 2) / 60;
  return { n2oG: (n2oKgS * 1000) / eventsPerS, fuelG: (fuelKgS * 1000) / eventsPerS };
}
