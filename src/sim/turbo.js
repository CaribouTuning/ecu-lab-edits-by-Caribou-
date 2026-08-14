/**
 * The turbocharger as a machine, not as a boost slider.
 *
 * A POWER BALANCE. The compressor takes work to raise intake pressure; the turbine
 * extracts it by expanding exhaust to atmospheric. At steady state they are equal, and
 * that sets the boost the hardware can make:
 *
 *   Pc = ṁ_air · cp · T_in · (PR^((γ-1)/γ) − 1) / η_c        compressor work required
 *   Pt = ṁ_exh · cp · T_exh · (1 − PR_t^-((γ-1)/γ)) · η_t    turbine work available
 *
 * Backpressure comes first, from the turbine as a fixed-area nozzle; the expansion across
 * it sets the power available; the balance sets the boost. The player's target is a
 * CEILING enforced by the wastegate, not a promise.
 *
 * Two things this replaces, both of which a tuner feels immediately. Boost was
 * `target × spool(RPM) × throttle²` — but a turbo spools on exhaust ENERGY, so a small
 * housing at full load is already on boost at 2000 RPM and the same housing at light load
 * is not on boost at 5000. And backpressure was proportional to BOOST, when the turbine is
 * a restriction of fixed area: double the flow and it takes roughly twice the pressure.
 *
 * STILL MISSING: no compressor map (efficiency is one number per part, so surge and choke
 * are represented only by `boostCeiling`) and no shaft inertia, so this is steady-state
 * and transient lag is not modelled.
 */

import { BARO_KPA, GAMMA_EXP, PSI_TO_KPA } from './constants.js';
import { COEFF } from './coefficients.js';
import { clamp } from './math.js';

/**
 * Pressure the turbine needs upstream of itself to pass a given exhaust flow.
 *
 * The housing is a nozzle: flow scales with upstream pressure over the square root of
 * upstream temperature, times an effective area. Inverting gives the backpressure the
 * engine pushes against — why a small housing costs pumping work at high flow and almost
 * nothing at idle.
 *
 * @param {number} exhaustFlowKgS mass flow through the turbine
 * @param {number} exhaustK exhaust temperature entering the turbine
 * @param {number} effectiveAreaM2 turbine effective flow area
 * @returns {number} exhaust manifold pressure, kPa
 */
export function turbineBackPressureKpa(exhaustFlowKgS, exhaustK, effectiveAreaM2) {
  const flowParam = (exhaustFlowKgS * Math.sqrt(Math.max(exhaustK, 1)))
    / Math.max(effectiveAreaM2, 1e-9);
  return BARO_KPA + flowParam * COEFF.TURBINE_FLOW_TO_KPA;
}

/**
 * Boost the hardware can actually make, from the turbine/compressor power balance.
 *
 * @param {object} input
 * @param {number} input.airFlowKgS air the engine is drawing
 * @param {number} input.fuelFlowKgS fuel going in with it; exhaust is the sum of the two
 * @param {number} input.exhaustK turbine inlet temperature
 * @param {number} input.intakeK compressor inlet temperature
 * @param {number} input.empKpa exhaust manifold pressure available to expand
 * @param {{turbineEff: number}} input.turbine
 * @param {{compressorEff: number}} input.compressor
 * @returns {number} achievable gauge boost, psi
 */
export function achievableBoostPsi({
  airFlowKgS, fuelFlowKgS, exhaustK, intakeK, empKpa, turbine, compressor,
}) {
  const exhaustFlowKgS = airFlowKgS + fuelFlowKgS;
  const expansionRatio = Math.max(1, empKpa / BARO_KPA);
  // Work the turbine can pull out of that expansion.
  const turbineW = exhaustFlowKgS * COEFF.CP_EXHAUST * exhaustK
    * (1 - Math.pow(expansionRatio, -GAMMA_EXP)) * turbine.turbineEff
    * COEFF.TURBO_MECH_EFF;
  if (turbineW <= 0 || airFlowKgS <= 0) return 0;
  // Invert the compressor work equation for the pressure ratio that power buys.
  const specificWork = (turbineW * compressor.compressorEff)
    / (airFlowKgS * COEFF.CP_AIR * Math.max(intakeK, 1));
  const pressureRatio = Math.pow(1 + specificWork, 1 / GAMMA_EXP);
  return Math.max(0, (pressureRatio - 1) * BARO_KPA / PSI_TO_KPA);
}

/**
 * Solves the manifold and exhaust state for one operating point, turbo included.
 *
 * Boost, airflow and backpressure are mutually dependent, so this iterates to a fixed
 * point. Three passes suffice: the wastegate ceiling damps the feedback strongly in every
 * case the app can reach.
 *
 * @param {object} input
 * @param {number} input.rpm engine speed
 * @param {number} input.loadKpa commanded load (throttle), kPa
 * @param {boolean} input.turboOn
 * @param {number} input.boostTargetPsi what the boost controller is asking for
 * @param {object} input.turbine
 * @param {object} input.compressor
 * @param {(mapKpa: number) => number} input.veAt true cylinder filling at a given MAP
 * @param {import('./engine.js').DerivedEngine} input.derived
 * @param {(boostPsi: number) => number} input.intakeKAt charge temperature at a boost level
 * @param {number} input.lambda delivered lambda, for exhaust mass and temperature
 * @param {number} input.exhaustK turbine inlet temperature
 * @returns {{mapKpa: number, boostPsi: number, empKpa: number, throttleFrac: number,
 *   spool: number, boostShortfallPsi: number}}
 */
export function solveInduction({
  rpm, loadKpa, turboOn, boostTargetPsi, turbine, compressor,
  veAt, derived, intakeKAt, lambda, exhaustK,
}) {
  const throttleFrac = clamp(loadKpa / BARO_KPA, 0, 1);
  const throttledKpa = Math.min(loadKpa, BARO_KPA);
  // The throttle plate still gates a turbo engine: closed throttle means no flow to
  // compress, whatever the turbine could theoretically do.
  const target = turboOn ? Math.max(0, boostTargetPsi) * Math.pow(throttleFrac, 2) : 0;

  const airFlowAt = (mapKpa, boostPsi) => {
    const chargeK = intakeKAt(boostPsi);
    const sweptM3 = (derived.displacementL / derived.cyl) / 1000;
    const densityKgM3 = (mapKpa * 1000) / (287 * chargeK);
    const perCycleKg = (veAt(mapKpa) / 100) * sweptM3 * densityKgM3;
    return perCycleKg * derived.cyl * (rpm / 2) / 60;
  };

  let boostPsi = target;
  let mapKpa = throttledKpa + boostPsi * PSI_TO_KPA;
  let empKpa = BARO_KPA;

  for (let i = 0; i < COEFF.INDUCTION_SOLVE_PASSES; i += 1) {
    const airFlowKgS = airFlowAt(mapKpa, boostPsi);
    const fuelFlowKgS = airFlowKgS / Math.max(1, lambda * COEFF.EXHAUST_STOICH_REF);
    empKpa = turboOn
      ? turbineBackPressureKpa(airFlowKgS + fuelFlowKgS, exhaustK, turbine.effectiveAreaM2)
      : BARO_KPA + (airFlowKgS * COEFF.EXHAUST_SYSTEM_KPA_PER_KGS);
    if (!turboOn) { boostPsi = 0; mapKpa = throttledKpa; break; }
    const canMake = achievableBoostPsi({
      airFlowKgS, fuelFlowKgS, exhaustK, intakeK: intakeKAt(boostPsi),
      empKpa, turbine, compressor,
    });
    // The wastegate is the ceiling. Below target the hardware simply cannot deliver, and
    // that is lag and undersizing made visible; above it the gate bleeds the difference.
    const next = Math.min(target, canMake);
    boostPsi = boostPsi + (next - boostPsi) * COEFF.INDUCTION_RELAX;
    mapKpa = throttledKpa + boostPsi * PSI_TO_KPA;
  }

  // When the wastegate is holding boost down, it is also bleeding exhaust around the
  // turbine, so the engine does not pay the full backpressure the turbine would need to
  // pass everything. That is precisely why a bigger turbine on a wastegated setup is
  // worth power even at the same boost.
  if (turboOn && empKpa > BARO_KPA) {
    const gateOpen = target > 0 ? clamp(1 - boostPsi / target, 0, 1) : 0;
    empKpa = BARO_KPA + (empKpa - BARO_KPA) * (1 - gateOpen * COEFF.WASTEGATE_RELIEF);
  }

  return {
    mapKpa,
    boostPsi,
    empKpa,
    throttleFrac,
    // Kept for display continuity: how much of the requested boost is actually present.
    spool: target > 0 ? clamp(boostPsi / target, 0, 1) : 0,
    boostShortfallPsi: Math.max(0, target - boostPsi),
  };
}
