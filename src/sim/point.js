/**
 * The simulation core: one operating point, fully solved.
 *
 * `evaluatePoint` is the heart of the whole app — everything else feeds it or
 * displays its output. It is commented step by step in the order an ECU actually
 * works: read load, compute air mass, decide fuel, convert to pulse width, check
 * knock, burn, subtract losses, report torque.
 *
 * It is a pure function with no React dependency, which is what makes the whole
 * physics layer testable in plain Node.
 */

import { DRIVETRAIN_EFF, INJ_DEADTIME_MS, KELVIN_OFFSET } from './constants.js';
import { COEFF } from './coefficients.js';
import {
  cycleInputsFor, knockLimitedSpark, mbtFromBurn, paToBar, runCycle, trappedAirGrams,
} from './cycle.js';
import { exhaustManifoldKpa, rubbingFmepPa, pumpingFmepPa } from './friction.js';
import { turbineBackpressureRelief } from './hardware.js';
import { chargeIndexOf } from './knock.js';
import { bestPowerAfr } from './manifold.js';
import { clamp } from './math.js';
import { chargeTempK } from './thermo.js';

/**
 * @typedef {object} PointInput
 * @property {number} rpm engine speed
 * @property {number} mapKpa manifold absolute pressure, kPa
 * @property {number} boostPsi gauge boost, psi
 * @property {number} veVal the ECU's VE table value at this point, percent — what the
 *   ECU BELIEVES the cylinder filling is. Drives the fuel calculation.
 * @property {number} [veActualVal] TRUE cylinder filling at this point, percent — what
 *   the hardware really flows. Drives torque, knock and the measured airflow. Defaults
 *   to `veVal`, which models a perfectly calibrated VE table.
 * @property {number} timingVal commanded spark advance, degrees BTDC
 * @property {number} afrCommanded commanded air:fuel ratio, gasoline-equivalent
 * @property {{stoich: number, density: number, lhv: number, octane: number}} fuel
 * @property {object} mods bolt-ons fitted, plus `turboFitted`
 * @property {number} mafScalar player's MAF calibration multiplier
 * @property {number} mafErrorBase physical MAF error introduced by hardware
 * @property {number} injectorCc injector size actually fitted, cc/min
 * @property {number} ecuInjectorCc injector size the ECU believes is fitted, cc/min
 * @property {import('./engine.js').DerivedEngine} derived
 * @property {number} [octaneBonus] legacy knock-margin bonus. Accepted so existing
 *   call sites keep type-checking, and deliberately unused: octane is now a fuel
 *   property read by the autoignition model, not a margin added after the fact
 * @property {{boostCeiling: number}} compressor
 * @property {{size: string}|null} [turbine] turbine in the exhaust stream, if any. Null
 *   means no turbine, which is the correct state for a naturally aspirated engine —
 *   it sets exhaust backpressure, so it is not a cosmetic omission
 */

/**
 * Solves one steady-state operating point.
 *
 * @param {PointInput} input
 * @returns {object} the full datalog record for this point
 */
export function evaluatePoint({
  rpm, mapKpa, boostPsi, veVal, veActualVal, timingVal, afrCommanded,
  fuel, mods, mafScalar, mafErrorBase,
  injectorCc, ecuInjectorCc, derived, compressor, turbine = null,
}) {
  const compressorOver = boostPsi > compressor.boostCeiling;
  const chargeK = chargeTempK(boostPsi, mods.intercooler);
  const chargeC = chargeK - KELVIN_OFFSET;

  // --- AIR CHARGE: ideal gas law. MAP already carries load, so VE is used purely as
  // an efficiency term here — no separate throttle multiplier (that would
  // double-count load, which is exactly the Alpha-N mistake).
  //
  // TWO VE NUMBERS, DOING DIFFERENT JOBS. This distinction is the whole basis of
  // closed-loop VE tuning and it must not be collapsed back into one variable:
  //
  //   veActual   what the hardware genuinely flows. Physics. Sets the air that is
  //              really in the cylinder, so it sets torque, knock and measured MAF.
  //   veVal      what the ECU's table CLAIMS the cylinder flows. Calibration. The ECU
  //              has no airflow oracle — it fuels from this number and nothing else.
  //
  // When the table is wrong, the ECU fuels for air that is not there (or misses air
  // that is), and the mixture comes back off target. That gap is the entire signal a
  // fuel-trim histogram measures, and correcting the table toward the truth is what
  // makes it converge. With a single shared VE the gap is identically zero, the
  // histogram has nothing to read, and no amount of iterating can ever close it.
  const veActual = veActualVal ?? veVal;
  const vCylM3 = (derived.displacementL / derived.cyl) / 1000;
  const airChargeG = trappedAirGrams({ veActual, mapKpa, chargeK, sweptM3: vCylM3 });
  const airChargeBelievedG = trappedAirGrams({ veActual: veVal, mapKpa, chargeK, sweptM3: vCylM3 });
  // The MAF reading reports real airflow — a sensor cannot read a table.
  const mafGps = (airChargeG * derived.cyl * (rpm / 2)) / 60;

  // --- MAF error / fuel trim. Open loop above ~85 kPa (near WOT).
  const netFactor = mafErrorBase * mafScalar;
  const openLoop = mapKpa >= 85;
  const effFactor = 1 + (netFactor - 1) * (openLoop ? 1 : 0.25);
  const trimPct = (effFactor - 1) * 100;

  // --- FUEL MASS from lambda and the fuel's own stoichiometric ratio. Computed from
  // the air the ECU BELIEVES it has, because that is all the ECU knows.
  const lambdaCommanded = (afrCommanded / 14.7) / effFactor;
  const fuelMassG = airChargeBelievedG / (lambdaCommanded * fuel.stoich);

  // --- INJECTOR: the ECU computes pulse width for the injector size it has been TOLD
  // it has. Fit bigger injectors without rescaling and every pulse delivers
  // proportionally more fuel than intended — the classic "went rich after upgrading
  // injectors" mistake real tuners fix with a scaling constant.
  const ecuGramsPerMs = (ecuInjectorCc * fuel.density) / 60000;
  const actualGramsPerMs = (injectorCc * fuel.density) / 60000;
  const cycleTimeMs = 120000 / rpm;
  const pulseWidthMs = fuelMassG / ecuGramsPerMs + INJ_DEADTIME_MS;
  const maxPulseMs = cycleTimeMs * 0.9;
  const dutyPct = clamp((pulseWidthMs / cycleTimeMs) * 100, 0, 220);

  const cappedPw = Math.min(pulseWidthMs, maxPulseMs);
  const fuelLimited = pulseWidthMs > maxPulseMs;
  const deliveredFuelG = Math.max(1e-6, (cappedPw - INJ_DEADTIME_MS) * actualGramsPerMs);
  const lambdaActual = airChargeG / (deliveredFuelG * fuel.stoich);
  const actualAfr = lambdaActual * 14.7;

  // --- GAS EXCHANGE. What the piston pushes against on the exhaust stroke, and how
  // much of last cycle's exhaust is still in the cylinder when the intake valve shuts.
  const bestAfr = bestPowerAfr(boostPsi);
  const chargeIndex = chargeIndexOf(veActual, mapKpa);
  const flowFrac = chargeIndex * (rpm / COEFF.EMP_FLOW_REF_RPM);
  const empKpa = exhaustManifoldKpa({
    boostPsi, turboOn: !!mods.turboFitted,
    turbineRelief: turbineBackpressureRelief(turbine), flowFrac,
  });

  // --- THE CYCLE ITSELF. Everything from here is read off an integrated pressure
  // trace rather than estimated: the work done, the peak pressure, and whether the end
  // gas had time to light itself before the flame reached it.
  const burnedFuelG = Math.min(deliveredFuelG, airChargeG / fuel.stoich);
  const cyc = cycleInputsFor({
    rpm, mapKpa, empKpa, intakeK: chargeK,
    airChargeG, burnedFuelG, fuelMassG: deliveredFuelG, lambda: lambdaActual, fuel, derived,
  });

  // The knock limit is solved from the same cycle, so it responds to compression,
  // boost, charge heat, residuals, mixture and cam timing without a separate term for
  // any of them. This is what the ECU's knock control is protecting against.
  const threshold = knockLimitedSpark(cyc);
  const margin = threshold - timingVal;
  const knockPull = margin < 0 ? Math.min(COEFF.MAX_KNOCK_RETARD, -margin) : 0;
  const usedTiming = timingVal - knockPull;

  const cycle = runCycle({ ...cyc, sparkBtdc: usedTiming });
  const mbtIdeal = mbtFromBurn(cyc.burnDeg);
  const imepPa = cycle.imepGrossPa;

  // The engine must pay for its own rubbing friction, and for the gas-exchange loop.
  // Pumping is exhaust manifold pressure minus intake: a loss when throttled, and
  // genuinely negative — work returned to the piston — when boost exceeds backpressure.
  const pmepPa = pumpingFmepPa(mapKpa, empKpa);
  const rubbingPa = rubbingFmepPa(rpm, derived.springPa || 0, {
    bearingFmepPa: derived.bearingFmepPa, balanceShaftFrac: derived.balanceShaftFrac,
  });
  const fmepPa = rubbingPa + pmepPa;
  const bmepPa = imepPa - fmepPa;

  // T = BMEP × Vd / (4π) for a four-stroke; power follows from torque.
  const torqueNmCrank = (bmepPa * (derived.displacementL / 1000)) / (4 * Math.PI);
  const powerW = torqueNmCrank * (2 * Math.PI * rpm / 60);
  const hp = (powerW / 745.7) * DRIVETRAIN_EFF;
  const torque = torqueNmCrank * 0.7376 * DRIVETRAIN_EFF;
  // Brake-specific fuel consumption is fuel per unit of work OUT. On overrun and in
  // deep vacuum there is no work out — the engine is being motored — so the quantity is
  // undefined, not zero. Zero would read as an engine making power from no fuel.
  const bsfc = powerW > 0 ? (burnedFuelG * derived.cyl * (rpm / 2) * 60 / 453.6) / (powerW / 745.7) : null;

  // --- MECHANICAL LOAD. Torque is what the engine gives you; peak cylinder pressure is
  // what it costs the metal to give it. Both now come off the same trace, so they can
  // no longer disagree — and the timing that maximises one is visibly not the timing
  // that minimises the other.
  const peakPressure = paToBar(cycle.peakPressurePa);
  const pressureRisk = peakPressure > COEFF.PEAK_PRESSURE_LIMIT_BAR;

  const egtProxy = knockPull * 22 + Math.max(0, actualAfr - bestAfr) * 45 + boostPsi * 6;
  const leanRisk = actualAfr > COEFF.LEAN_DAMAGE_AFR && mapKpa >= 85;
  // Excessively rich is its own failure mode, not just "safe". Unburnt fuel washes the
  // oil film off the bores, fouls plugs, dumps raw fuel into the catalyst and costs
  // real power — a genuinely damaging condition, just a slower one than knock.
  const richRisk = lambdaActual < COEFF.RICH_DAMAGE_LAMBDA && mapKpa >= 55;
  const valveRisk = leanRisk && boostPsi > 3;
  const mafFlag = Math.abs(trimPct) > 8 && (mods.intake || mods.turboFitted);
  const injMismatch = Math.abs(injectorCc / ecuInjectorCc - 1) > 0.05;

  return {
    rpm, hp: Math.round(hp), torque: Math.round(torque),
    // `ve` is the measured (true) filling, which is what a datalog and the fuel-trim
    // histogram need; `veTable` is what the ECU was working from.
    ve: Number(veActual.toFixed(1)),
    veTable: Number(veVal.toFixed(1)),
    afr: Number(actualAfr.toFixed(2)), afrCommanded: Number(afrCommanded.toFixed(2)),
    lambda: Number(lambdaActual.toFixed(3)),
    timing: Number(usedTiming.toFixed(1)), commandedTiming: Number(timingVal.toFixed(1)),
    duty: Math.round(dutyPct), pw: Number(pulseWidthMs.toFixed(2)),
    maf: Number(mafGps.toFixed(1)), map: Number(mapKpa.toFixed(0)),
    iat: Number(chargeC.toFixed(0)), airCharge: Number(airChargeG.toFixed(3)),
    boostPsi: Number(boostPsi.toFixed(1)), trimPct: Number(trimPct.toFixed(1)),
    threshold: Number(threshold.toFixed(1)), margin: Number(margin.toFixed(1)),
    chargeIndex: Number(chargeIndex.toFixed(3)),
    mbtIdeal: Number(mbtIdeal.toFixed(1)), openLoop,
    egt: Math.round(720 + egtProxy),
    imep: Number((imepPa / 100000).toFixed(2)), bmep: Number((bmepPa / 100000).toFixed(2)),
    fmep: Number((fmepPa / 100000).toFixed(2)),
    bsfc: bsfc === null ? null : Number(bsfc.toFixed(3)),
    // The gas-exchange loop, reported separately from rubbing friction because they are
    // different problems with different fixes — one is a turbo match, the other is a
    // rebuild.
    pmep: Number((pmepPa / 100000).toFixed(2)), emp: Number(empKpa.toFixed(0)),
    bestAfr: Number(bestAfr.toFixed(2)),
    peakPressure: Number(peakPressure.toFixed(1)),
    // Read off the trace: where the pressure peaked, where the burn centred, how much
    // of last cycle's exhaust is still in the cylinder, and how close the end gas came
    // to lighting itself (1.0 is knock).
    peakPressureDeg: Number(cycle.peakPressureDeg.toFixed(1)),
    mfb50: Number(cycle.mfb50Deg.toFixed(1)),
    burnDeg: Number(cyc.burnDeg.toFixed(1)),
    residualFrac: Number(cyc.residualFrac.toFixed(3)),
    effectiveCr: Number(cyc.effectiveCr.toFixed(2)),
    knockIntegral: Number(cycle.knockIntegral.toFixed(3)),
    endGasK: Math.round(cycle.peakEndGasK),
    knock: knockPull > 0, knockPull, fuelLimited, leanRisk, richRisk, valveRisk,
    pressureRisk, mafFlag, compressorOver, injMismatch,
  };
}
