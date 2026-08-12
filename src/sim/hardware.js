/**
 * The parts catalogue — everything the player can bolt on, with the real
 * specifications that make each choice a trade-off rather than an upgrade.
 */

import { clamp } from './math.js';

/** Cylinder count per configuration. */
export const CYL_COUNT = { I4: 4, I6: 6, V6: 6, V8: 8 };

/** Selectable engine configurations. */
export const CONFIG_OPTS = ['I4', 'I6', 'V6', 'V8'];

/**
 * Crankshaft main bearing count per configuration.
 *
 * An architectural fact, not a tuning knob: an inline engine carries a main between
 * every pair of cylinders plus one at each end, while a V shares a journal between
 * opposing cylinders. So an inline six runs seven mains where a V6 runs four.
 *
 * Crankshaft bearings are a real share of engine friction — published breakdowns put
 * the crankshaft group anywhere from ~9% of friction power to ~25%, rising with
 * speed. That is why the inline six's superior balance is not a free lunch: it pays
 * for its extra bearings every revolution.
 */
export const MAIN_BEARINGS = { I4: 5, I6: 7, V6: 4, V8: 5 };

/** Main bearing count treated as the calibration baseline (the stock V6). */
export const BASELINE_MAIN_BEARINGS = MAIN_BEARINGS.V6;

/**
 * Whether this architecture needs balance shafts.
 *
 * An inline six is inherently balanced in both primary and secondary order and needs
 * none — that is its genuine mechanical advantage. A cross-plane V8 and a 60-degree
 * V6 likewise run without them. A four-cylinder above roughly 1.8 L has a secondary
 * imbalance large enough that manufacturers fit a pair of counter-rotating shafts;
 * the EA888.3 has exactly that, two chain-driven shafts in the crankcase.
 *
 * Those shafts cost real friction. The National Academies' fuel-economy technology
 * report records that Ford's removal of the balance shaft from its 1.0 L three
 * cylinder "reduced friction by 6 percent", which is what sizes the
 * FMEP_BALANCE_SHAFT_FRAC coefficient in coefficients.js.
 *
 * @param {string} configuration engine layout
 * @param {number} displacementL total displacement, litres
 * @returns {boolean}
 */
export function hasBalanceShafts(configuration, displacementL) {
  return configuration === 'I4' && displacementL >= 1.8;
}

/** Selectable block and head materials. */
export const MATERIAL_OPTS = ['Cast Iron', 'Aluminum'];

/**
 * Fuels, each carrying its real stoichiometric ratio, liquid density and lower
 * heating value.
 *
 * Octane raises the knock ceiling. Separately, a fuel's STOICHIOMETRIC POINT sets how
 * much fuel volume is needed for the same lambda: gasoline is ~14.7:1, E85 is ~9.8:1,
 * so E85 needs roughly 1.43× the injector flow for an identical lambda target. That is
 * why E85 is not a free upgrade — it buys big knock margin but costs fuel system
 * headroom, and undersized injectors will run out much sooner on it.
 *
 * Fuel MASS is derived from air mass and lambda; injector VOLUME from density;
 * released ENERGY from LHV. E85 needs ~1.5× the volume of gasoline at the same lambda
 * but has ~2/3 the energy per kg — those two nearly cancel, which is exactly why E85
 * makes similar power per unit of air while demanding a much bigger fuel system.
 */
export const OCTANE_OPTS = [
  { label: '91', bonus: 0, stoich: 14.7, density: 0.745, lhv: 44.0e6 },
  { label: '93', bonus: 3, stoich: 14.7, density: 0.745, lhv: 44.0e6 },
  { label: '100', bonus: 8, stoich: 14.6, density: 0.750, lhv: 43.5e6 },
  { label: 'E85', bonus: 14, stoich: 9.8, density: 0.782, lhv: 29.2e6 },
];

/**
 * Real static flow ratings, cc/min.
 *
 * Duty cycle is computed from actual required pulse width against the time available
 * per engine cycle, not from a capacity index.
 */
export const INJECTOR_OPTS = [
  { label: '315cc (stock)', cc: 315 },
  { label: '440cc', cc: 440 },
  { label: '550cc', cc: 550 },
  { label: '650cc', cc: 650 },
  { label: '850cc', cc: 850 },
];

/**
 * Turbine sizing trades spool speed against top-end flow — small spins up fast but
 * chokes the exhaust side at high RPM; large is laggy but flows more up top.
 *
 * `size` is the stable id the Engineer Score matches on. `label` is display copy and
 * may be reworded freely; simulation logic must never read it.
 */
export const TURBINE_OPTS = [
  { label: 'Small — quick spool', size: 'small', spoolRange: 1200, topEndMult: -0.05 },
  { label: 'Medium — balanced', size: 'medium', spoolRange: 1800, topEndMult: 0 },
  { label: 'Large — top-end', size: 'large', spoolRange: 2600, topEndMult: 0.05 },
];

/**
 * Compressor sizing sets a practical boost ceiling before it is pushed outside its
 * efficient range (surge/choke) — running past it makes hot, knock-prone air.
 *
 * `size` is the stable id the Engineer Score matches on; see {@link TURBINE_OPTS}.
 */
export const COMPRESSOR_OPTS = [
  { label: 'Small', size: 'small', boostCeiling: 12, lagAdd: -150 },
  { label: 'Medium', size: 'medium', boostCeiling: 20, lagAdd: 0 },
  { label: 'Large', size: 'large', boostCeiling: 30, lagAdd: 250 },
];

/**
 * Exhaust diameter is not simply "bigger is better" — undersized chokes high-RPM
 * flow, oversized loses low-RPM scavenging velocity.
 *
 * The range must span everything {@link idealExhaustDiameter} can return (2.0"–5.0"),
 * in steps small enough that some option always lands inside the Engineer Score's
 * 0.3" tolerance. Otherwise builds at the extremes — a small naturally aspirated
 * engine, or anything on serious boost — carry a penalty no purchasable part can
 * clear. Half-inch steps put the worst-case gap at 0.25".
 */
export const EXHAUST_DIA_OPTS = [
  { label: '2.0"', dia: 2.0 },
  { label: '2.5"', dia: 2.5 },
  { label: '3.0"', dia: 3.0 },
  { label: '3.5"', dia: 3.5 },
  { label: '4.0"', dia: 4.0 },
  { label: '4.5"', dia: 4.5 },
  { label: '5.0"', dia: 5.0 },
];

/** Largest exhaust diameter the player can actually buy, inches. */
export const MAX_EXHAUST_DIA = EXHAUST_DIA_OPTS[EXHAUST_DIA_OPTS.length - 1].dia;

/**
 * Ideal total exhaust diameter for a given build, inches.
 *
 * Real exhaust sizing follows POWER, not displacement alone — the long-standing shop
 * rule is about one inch of total pipe diameter per 100 crank horsepower. Boost
 * roughly scales power with pressure ratio, so a boosted build genuinely needs more
 * pipe than the same engine naturally aspirated.
 *
 * THIS IS THE SINGLE SOURCE OF TRUTH for exhaust sizing. The VE model, the on-screen
 * advice and the Engineer Score all call it. There was previously a second,
 * displacement-only formula buried in the airflow model, so the score rewarded a
 * diameter the physics then penalised — do not reintroduce one.
 *
 * @param {number} displacementL engine displacement, litres
 * @param {number} [peakBoostPsi] peak boost target, psi
 * @returns {number} ideal diameter in inches
 */
export function idealExhaustDiameter(displacementL, peakBoostPsi = 0) {
  const naCrankHp = displacementL * 82;
  const estCrankHp = naCrankHp * (1 + Math.max(0, peakBoostPsi) / 14.7);
  return clamp(estCrankHp / 100, 2.0, 5.0);
}

/** Measured airflow gains per bolt-on, weighted toward the RPM where they work. */
export const MOD_BONUS = {
  intake: [0, 0, 0, 1, 2, 3, 3, 4],
  exhaust: [0, 0, 1, 2, 3, 4, 5, 6],
  headers: [0, 1, 2, 4, 6, 8, 9, 10],
};

/** Display copy for each bolt-on. */
export const MOD_INFO = {
  intake: { label: 'Cold Air Intake', blurb: 'Mostly a top-end gain — but the larger MAF housing needs a rescale or it will run lean.' },
  exhaust: { label: 'Cat-Back Exhaust', blurb: 'Frees up mid-to-high RPM flow; modest gain, good sound.' },
  headers: { label: 'Long-Tube Headers', blurb: 'The biggest single N/A bolt-on gain, spread across the mid-to-upper range.' },
};
