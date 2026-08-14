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
 * An architectural fact, not a tuning knob: an inline carries a main between every pair
 * of cylinders plus one at each end, while a V shares a journal between opposing
 * cylinders — so an I6 runs seven mains where a V6 runs four. Published breakdowns put
 * the crankshaft group at 9-25% of friction power, rising with speed, which is why the
 * I6's balance is not a free lunch.
 */
export const MAIN_BEARINGS = { I4: 5, I6: 7, V6: 4, V8: 5 };

/** Main bearing count treated as the calibration baseline (the stock V6). */
export const BASELINE_MAIN_BEARINGS = MAIN_BEARINGS.V6;

/**
 * Whether this architecture needs balance shafts.
 *
 * An I6 is balanced in both primary and secondary order and needs none — its genuine
 * mechanical advantage. A cross-plane V8 and a 60-degree V6 likewise. An I4 above ~1.8 L
 * has enough secondary imbalance that manufacturers fit counter-rotating shafts; the
 * EA888.3 has two. They cost real friction — see FMEP_BALANCE_SHAFT_FRAC.
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
 * Fuel MASS comes from air mass and lambda; injector VOLUME from density; ENERGY from
 * LHV. E85's stoichiometric point (9.8 vs 14.7) means ~1.43x the injector flow for the
 * same lambda, and it carries ~2/3 the energy per kg — those nearly cancel, which is why
 * E85 makes similar power per unit of air while demanding a much bigger fuel system.
 * It buys big knock margin and costs fuel headroom; it is not a free upgrade.
 */
export const OCTANE_OPTS = [
  { label: '91', bonus: 0, octane: 91, stoich: 14.7, density: 0.745, lhv: 44.0e6 },
  { label: '93', bonus: 3, octane: 93, stoich: 14.7, density: 0.745, lhv: 44.0e6 },
  { label: '100', bonus: 8, octane: 100, stoich: 14.6, density: 0.750, lhv: 43.5e6 },
  // E85's pump antiknock index is usually quoted around 100-105 AKI. The autoignition
  // model uses `octane` directly, so this number now does real work: it is the fuel
  // property the ignition-delay correlation reads. `bonus` is the older
  // degrees-of-margin figure, kept because the Engineer Score still prices its
  // compression headroom in it.
  { label: 'E85', bonus: 14, octane: 105, stoich: 9.8, density: 0.782, lhv: 29.2e6 },
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
 *
 * `effectiveAreaM2` is the flow area the housing presents to the exhaust, fitted against
 * the boosted presets — real engines with published output, where the area decides how
 * much backpressure they pay for their factory boost. It makes the sizing trade real
 * rather than a pair of multipliers: a small housing needs more pressure upstream to pass
 * the same flow, which spools it early AND costs pumping work at high flow.
 * `turbineEff` is how much of that expansion becomes shaft work; bigger wheels are more
 * efficient as well as less restrictive.
 *
 * (`spoolRange` is gone: a turbo spools on exhaust ENERGY, not engine speed, so flow area
 * produces that behaviour instead of an asserted RPM ramp.)
 */
export const TURBINE_OPTS = [
  { label: 'Small — quick spool', size: 'small', topEndMult: -0.05, effectiveAreaM2: 0.00153, turbineEff: 0.68 },
  { label: 'Medium — balanced', size: 'medium', topEndMult: 0, effectiveAreaM2: 0.00243, turbineEff: 0.72 },
  { label: 'Large — top-end', size: 'large', topEndMult: 0.05, effectiveAreaM2: 0.00360, turbineEff: 0.75 },
];

/**
 * Compressor sizing sets a practical boost ceiling before it is pushed outside its
 * efficient range (surge/choke) — running past it makes hot, knock-prone air.
 *
 * `size` is the stable id the Engineer Score matches on; see {@link TURBINE_OPTS}.
 * `compressorEff` is how much of the shaft work it turns into pressure; `lagAdd` is gone
 * with the spool ramp that used it.
 */
export const COMPRESSOR_OPTS = [
  { label: 'Small', size: 'small', boostCeiling: 12, compressorEff: 0.72 },
  { label: 'Medium', size: 'medium', boostCeiling: 20, compressorEff: 0.74 },
  { label: 'Large', size: 'large', boostCeiling: 30, compressorEff: 0.76 },
];

/**
 * Exhaust diameter is not simply "bigger is better" — undersized chokes high-RPM
 * flow, oversized loses low-RPM scavenging velocity.
 *
 * Must span everything {@link idealExhaustDiameter} can return (2.0"-5.0") in steps small
 * enough that some option always lands inside the Engineer Score's 0.3" tolerance, or
 * builds at the extremes carry a penalty no purchasable part can clear. Half-inch steps
 * put the worst-case gap at 0.25".
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
