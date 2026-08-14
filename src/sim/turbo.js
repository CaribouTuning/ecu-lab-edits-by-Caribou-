/**
 * The turbocharger as a machine, not as a boost slider.
 *
 * WHAT THIS REPLACES
 * Boost used to be `target × spool × throttle²`, where spool was a linear ramp in RPM,
 * and exhaust backpressure was boost multiplied by a constant. Both are wrong in ways a
 * tuner feels immediately:
 *
 *   - A turbo does not spool on ENGINE SPEED, it spools on EXHAUST ENERGY. An RPM ramp
 *     says a small turbo makes no boost at 1500 RPM at full load, when in reality that
 *     is exactly where a small turbo is already at full boost. It also says boost
 *     arrives at the same RPM whether the engine is at 30% or 100% load, which is not
 *     how anything behaves.
 *   - Backpressure is not proportional to boost. The turbine is a restriction with a
 *     fixed effective area, so the pressure it needs upstream depends on how much
 *     exhaust is trying to get through it and how hot that exhaust is. Doubling the flow
 *     roughly doubles the pressure it takes to pass it.
 *
 * THE MODEL
 * A power balance. The compressor takes work to raise intake pressure; the turbine
 * extracts work by expanding exhaust down to atmospheric. At steady state the two are
 * equal, and that is what sets how much boost the hardware can actually make:
 *
 *   Pc = ṁ_air · cp · T_in · (PR^((γ-1)/γ) − 1) / η_c        compressor work required
 *   Pt = ṁ_exh · cp · T_exh · (1 − PR_t^-((γ-1)/γ)) · η_t    turbine work available
 *
 * Exhaust manifold pressure comes first, from the turbine treated as a nozzle of fixed
 * effective area. Then the expansion across it sets the power available, and the power
 * balance sets the boost the compressor can deliver. The player's boost target is a
 * CEILING enforced by the wastegate, not a promise: ask for more than the hardware can
 * make and you get what it can make.
 *
 * Compressor efficiency comes off a MAP (see {@link compressorMap}) rather than being one
 * number per part, so surge and choke are real limit lines: a big compressor genuinely
 * surges on a small engine at low RPM, and a small one genuinely chokes at the top end.
 * Shaft inertia lives in `live.js`, because only the live engine has a transient to lag
 * through — a dyno sweep holds each point until it settles, which is what makes it a
 * steady-state measurement.
 *
 * WHAT IS STILL MISSING
 * The map is parametric, not digitised from a real compressor: one island, one surge
 * line, one choke line, rather than a measured field. Variable geometry is not modelled,
 * and neither is heat soak into the compressor housing.
 */

import { BARO_KPA, GAMMA_EXP, PSI_TO_KPA } from './constants.js';
import { COEFF } from './coefficients.js';
import { clamp } from './math.js';

/**
 * Where this operating point sits on the compressor map, and what that costs.
 *
 * The map is a parametric island rather than a digitised one: peak efficiency at a
 * design flow and pressure ratio, falling off elliptically away from it, bounded by a
 * surge line on the low-flow side and a choke line on the high-flow side. That is enough
 * to reproduce the two things a single efficiency number cannot — a big compressor
 * surging on a small engine at low RPM, and a small one choking at the top end — and
 * both are matching failures a tuner has to be able to see.
 *
 * @param {object} compressor a COMPRESSOR_OPTS entry
 * @param {number} flowKgS air the engine is actually drawing
 * @param {number} pressureRatio compressor outlet over inlet
 * @returns {{eff: number, surge: boolean, choke: boolean, margin: number}} `margin` is
 *   the fraction of the flow range between the surge and choke lines that is left, so
 *   0 means hard against a limit and 1 means dead centre
 */
export function compressorMap(compressor, flowKgS, pressureRatio) {
  const pr = Math.max(1, pressureRatio);
  // Surge: below this flow, the pressure ratio cannot be sustained and flow reverses.
  const surgeFlow = compressor.surgeSlope * (pr - 1);
  const surge = pr > COEFF.SURGE_MIN_PR && flowKgS < surgeFlow;
  const choke = flowKgS > compressor.chokeFlowKgS;
  // Elliptical fall-off from the island centre, in normalised flow and pressure ratio.
  const dFlow = flowKgS / compressor.pkFlowKgS - 1;
  const dPr = pr / compressor.pkPr - 1;
  const distance = dFlow * dFlow + COEFF.MAP_PR_WEIGHT * dPr * dPr;
  let eff = compressor.etaMax * (1 - COEFF.MAP_EFF_FALLOFF * distance);
  // Past either limit line the map does not merely get worse, it stops working: a
  // surging compressor is not pumping and a choked one is making heat, not pressure.
  if (surge) eff *= COEFF.SURGE_EFF_PENALTY;
  if (choke) eff *= COEFF.CHOKE_EFF_PENALTY;
  const span = Math.max(1e-6, compressor.chokeFlowKgS - surgeFlow);
  return {
    eff: clamp(eff, COEFF.MAP_EFF_FLOOR, compressor.etaMax),
    surge,
    choke,
    margin: clamp(Math.min(flowKgS - surgeFlow, compressor.chokeFlowKgS - flowKgS) / span, 0, 1),
  };
}

/**
 * Pressure the turbine needs upstream of itself to pass a given exhaust flow.
 *
 * The housing is a nozzle: flow through it scales with upstream pressure over the square
 * root of upstream temperature, times an effective area. Inverting that gives the
 * backpressure the engine has to push against — which is why a small housing costs
 * pumping work at high flow, and why the same housing costs almost nothing at idle.
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
 * @param {object} input.compressor a COMPRESSOR_OPTS entry, read through {@link compressorMap}
 * @param {number} [input.currentPr] pressure ratio to evaluate the map at
 * @returns {{boostPsi: number, map: ReturnType<typeof compressorMap>}}
 */
export function achievableBoostPsi({
  airFlowKgS, fuelFlowKgS, exhaustK, intakeK, empKpa, turbine, compressor, currentPr = 1,
}) {
  const exhaustFlowKgS = airFlowKgS + fuelFlowKgS;
  const expansionRatio = Math.max(1, empKpa / BARO_KPA);
  // Work the turbine can pull out of that expansion.
  const turbineW = exhaustFlowKgS * COEFF.CP_EXHAUST * exhaustK
    * (1 - Math.pow(expansionRatio, -GAMMA_EXP)) * turbine.turbineEff
    * COEFF.TURBO_MECH_EFF;
  if (turbineW <= 0 || airFlowKgS <= 0) return { boostPsi: 0, map: compressorMap(compressor, airFlowKgS, currentPr) };
  // Efficiency comes off the MAP at where this point actually sits, not from a constant.
  const map = compressorMap(compressor, airFlowKgS, currentPr);
  // Invert the compressor work equation for the pressure ratio that power buys.
  const specificWork = (turbineW * map.eff)
    / (airFlowKgS * COEFF.CP_AIR * Math.max(intakeK, 1));
  const pressureRatio = Math.pow(1 + specificWork, 1 / GAMMA_EXP);
  return { boostPsi: Math.max(0, (pressureRatio - 1) * BARO_KPA / PSI_TO_KPA), map };
}

/**
 * Solves the manifold and exhaust state for one operating point, turbo included.
 *
 * Boost, airflow and backpressure are mutually dependent — more boost means more air,
 * which means more exhaust, which drives more boost — so this iterates to a fixed point.
 * Three passes is plenty: the loop converges quickly because the feedback is strongly
 * damped by the wastegate ceiling in every case the app can reach.
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
 *   spool: number, boostShortfallPsi: number, compressorEff: number, surge: boolean,
 *   choke: boolean, mapMargin: number}}
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
  let mapState = compressorMap(compressor, 0, 1);

  for (let i = 0; i < COEFF.INDUCTION_SOLVE_PASSES; i += 1) {
    const airFlowKgS = airFlowAt(mapKpa, boostPsi);
    const fuelFlowKgS = airFlowKgS / Math.max(1, lambda * COEFF.EXHAUST_STOICH_REF);
    empKpa = turboOn
      ? turbineBackPressureKpa(airFlowKgS + fuelFlowKgS, exhaustK, turbine.effectiveAreaM2)
      : BARO_KPA + (airFlowKgS * COEFF.EXHAUST_SYSTEM_KPA_PER_KGS);
    if (!turboOn) { boostPsi = 0; mapKpa = throttledKpa; break; }
    const solved = achievableBoostPsi({
      airFlowKgS, fuelFlowKgS, exhaustK, intakeK: intakeKAt(boostPsi),
      empKpa, turbine, compressor, currentPr: mapKpa / BARO_KPA,
    });
    const canMake = solved.boostPsi;
    mapState = solved.map;
    // CHOKE IS A MASS FLOW LIMIT, not merely an efficiency penalty. Once the inducer is
    // at Mach 1 no more air goes through it at any shaft speed, so the boost the engine
    // can actually be fed is capped by the flow the compressor can pass — pull the target
    // back in proportion to the overrun rather than letting the wastegate hold a
    // pressure the compressor cannot supply.
    const chokeCap = airFlowKgS > compressor.chokeFlowKgS
      ? boostPsi * (compressor.chokeFlowKgS / airFlowKgS)
      : Infinity;
    // The wastegate is the ceiling. Below target the hardware simply cannot deliver, and
    // that is lag and undersizing made visible; above it the gate bleeds the difference.
    const next = Math.min(target, canMake, chokeCap);
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
    // Where the compressor ended up on its own map. Surge and choke are real limits now,
    // not a single `boostCeiling` standing in for both.
    compressorEff: mapState.eff,
    surge: mapState.surge,
    choke: mapState.choke,
    mapMargin: mapState.margin,
  };
}
