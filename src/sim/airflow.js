/**
 * Airflow model — hardware in, VE table out.
 *
 * This is the ONLY place hardware is allowed to change how the engine breathes. If
 * you are adding a part, it belongs here (or in the knock/fuel terms of
 * `point.js`) — never as a bonus multiplier on power.
 */

import { BARO_KPA, PSI_TO_KPA } from './constants.js';
import { COEFF } from './coefficients.js';
import { CYL_COUNT, MOD_BONUS, idealExhaustDiameter } from './hardware.js';
import { trappedAirGrams } from './cycle.js';
import {
  CAM_BASE_DURATION, camOverlapDeg, camPeakShiftRpm, charMultiplier, intakeValveAreaRatio, machVeMultiplier,
  valveFloatRpm,
} from './engine.js';
import { clamp, interp1 } from './math.js';
import { chargeTempK, exhaustTempK } from './thermo.js';
import { turbineBackPressureKpa } from './turbo.js';
import { DEFAULT_VE, LOAD, RPM } from './tables.js';

/**
 * Computes the volumetric efficiency table this hardware would actually flow.
 *
 * Bore/stroke bias is baked directly into the VISIBLE VE table rather than applied as
 * a hidden multiplier at simulation time — so changing bore/stroke on BUILD actually
 * moves the numbers you see and edit, the way a real hardware change would show up
 * the next time a tuner logs airflow.
 *
 * @param {import('./engine.js').EngineConfig} cfg short-block design
 * @param {{intake: boolean, exhaust: boolean, headers: boolean, intercooler: boolean}} mods bolt-ons
 * @param {object} [hw] induction hardware
 * @param {boolean} [hw.turboOn]
 * @param {{topEndMult: number, effectiveAreaM2: number}|null} [hw.turbine] the housing:
 *   `topEndMult` biases the breathing curve, `effectiveAreaM2` is what the backpressure
 *   solve needs — the same field `turbo.js` passes to `turbineBackPressureKpa`.
 * @param {number|null} [hw.exhaustDia] exhaust diameter, inches
 * @param {{stoich: number}|null} [hw.fuel]
 * @param {boolean} [hw.supercharged] a supercharger in the intake: the same blower
 *   ducting, intercooler core and charge piping a turbo kit carries, without a turbine
 * @param {number} [hw.peakBoostPsi] peak boost target, psi — raises the ideal exhaust
 *   diameter, because sizing follows power and boost makes power
 * @param {number} [hw.intakeCamAdvanceDeg] how far a cam phaser has advanced the intake
 *   cam, crank degrees. It moves intake valve close earlier by the same amount, which is
 *   exactly what a shorter grind does to IVC — so the breathing curve slides down the
 *   RPM range by the same RPM per degree of IVC the duration model already uses
 * @param {number} [hw.exhaustCamRetardDeg] how far a phaser has retarded the exhaust
 *   cam. It adds overlap, which is what a turbine's backpressure pushes against
 * @returns {number[][]} VE table, percent, indexed [LOAD][RPM]
 */
export function computeHardwareVE(cfg, mods, hw = {}, axes = null) {
  const at = hardwareVeAt(cfg, mods, hw);
  return (axes?.load ?? LOAD).map((mapKpa) => (axes?.rpm ?? RPM).map((rpm) => at(rpm, mapKpa)));
}

/** The manifold pressure of the full-load row the breathing curve is defined at, kPa. */
export const VE_FULL_LOAD_KPA = 100;

/**
 * PART-LOAD BREATHING: THE IDEAL GAS-EXCHANGE PROCESS.
 *
 * At exhaust-valve close the clearance volume Vc holds burned gas at the exhaust
 * pressure Pe. When the intake opens on a throttled manifold at Pi, that residual expands
 * to Pi before any fresh charge can enter, and it takes up Vc·(Pe/Pi)^(1/γ) of the
 * cylinder. What is left for fresh charge, as a share of the displacement Vd, is
 *
 *     ηv = (Vc + Vd − Vc·(Pe/Pi)^(1/γ)) / Vd = (rc − (Pe/Pi)^(1/γ)) / (rc − 1)
 *
 * with rc = (Vc + Vd)/Vc the compression ratio (the ideal-cycle intake process:
 * Heywood, Internal Combustion Engine Fundamentals, ch. 5 and 6; Taylor, The
 * Internal-Combustion Engine in Theory and Practice, vol. 1, ch. 6). This is the factor
 * relative to the full-load row, so the full-load curve, and every rated power fitted on
 * it, is untouched. γ is the burned gas's at exhaust temperature (RESIDUAL_EXPANSION_GAMMA).
 * Nothing in it is fitted: at 9.5:1 it gives 0.71/0.82/0.88/0.92/0.96 of full-load VE at
 * 20/30/40/50/70 kPa, where GM's own VE tables for the LM7 at 2400 rpm (put on an
 * intake-air basis through their charge-temperature blend) read 0.73/0.81/0.86/0.90/0.95,
 * and the hand-shaped rows it replaces gave 0.54/0.62/0.70/0.77/0.90.
 *
 * Not in it: valve overlap pushing exhaust back into a vacuum manifold, which lowers
 * light-load VE further on long-overlap cams (the residual's TEMPERATURE effect is in
 * `residualFraction`); and exhaust pressure above atmospheric.
 *
 * @param {number} mapKpa manifold absolute pressure, kPa
 * @param {number} compression static compression ratio
 * @returns {number} VE relative to the full-load row, 0..1
 */
export function partLoadVeFactor(mapKpa, compression) {
  if (mapKpa >= VE_FULL_LOAD_KPA) return 1;
  const rc = Math.max(4, compression);
  const eta = (p) => (rc - Math.pow(BARO_KPA / Math.max(5, p), 1 / COEFF.RESIDUAL_EXPANSION_GAMMA)) / (rc - 1);
  return clamp(eta(mapKpa) / eta(VE_FULL_LOAD_KPA), 0.05, 1);
}

/**
 * The same model as `computeHardwareVE`, as a function of any (RPM, MAP), so a table on
 * an ECU's own breakpoints is computed at them rather than interpolated off the 8 × 6 grid.
 *
 * @param {import('./engine.js').EngineConfig} cfg
 * @param {{intake: boolean, exhaust: boolean, headers: boolean, intercooler: boolean}} mods
 * @param {object} [hw] as for computeHardwareVE
 * @returns {(rpm: number, mapKpa: number) => number} VE, percent
 */
export function hardwareVeAt(cfg, mods, hw = {}) {
  const {
    turboOn = false, turbine = null, exhaustDia = null, fuel = null, peakBoostPsi = 0, supercharged = false,
    intakeCamAdvanceDeg = 0, exhaustCamRetardDeg = 0,
  } = hw;
  const ratio = cfg.bore / cfg.stroke;
  const cyl = CYL_COUNT[cfg.configuration];
  const displacementL = (Math.PI / 4 * Math.pow(cfg.bore / 10, 2) * (cfg.stroke / 10) * cyl) / 1000;
  const perCylL = displacementL / cyl;
  // Shared with the advisory and the Engineer Score, so the physics and the advice
  // can no longer disagree about what "correctly sized" means.
  const idealDia = idealExhaustDiameter(displacementL, turboOn ? peakBoostPsi : 0);
  const diaError = exhaustDia != null ? exhaustDia - idealDia : 0;

  // Smaller individual cylinders carry proportionally more valve area for their
  // volume, so they keep filling better at high RPM. Big single cylinders fall off.
  const cylBreathing = clamp((0.62 - perCylL) * 0.10, -0.05, 0.05);

  // Higher compression means less clearance volume, so less burnt gas is left behind
  // to dilute the incoming charge — a small but real VE gain.
  const crFactor = 1 + (cfg.compression - 10.3) * COEFF.VE_PER_COMPRESSION_POINT;

  // An aluminium head runs cooler, so the incoming charge picks up less heat on the
  // way in and stays denser.
  const headFactor = cfg.headMaterial === 'Aluminum' ? COEFF.VE_ALUMINIUM_HEAD_GAIN : 1.0;

  // Fuels with high latent heat of vaporisation cool the charge as they evaporate,
  // which raises density. E85 is markedly better at this than gasoline.
  const fuelFactor = fuel
    ? (fuel.stoich < 12 ? COEFF.VE_E85_CHARGE_COOLING : fuel.stoich < 14.7 ? 1.005 : 1.0)
    : 1.0;

  // Direct injection cools the air while the intake valve is still open (see
  // VE_DIRECT_INJECTION); a port-injected engine's fuel cools the valve instead.
  const injectionFactor = cfg.injection === 'direct' ? COEFF.VE_DIRECT_INJECTION : 1.0;

  // Camshaft: shifting where the VE peak sits is the honest way to model duration. A
  // longer cam is evaluated as if the engine were running SLOWER than it is, so the
  // whole breathing curve slides up the RPM range — top end gained, bottom lost.
  const camDuration = cfg.camDuration ?? CAM_BASE_DURATION;
  const springRate = cfg.springRate ?? 50;
  // Intake valve close moves IVC_PER_CAM_DEG per degree of duration and the peak moves
  // CAM_PEAK_SHIFT_PER_DEG, so one degree of IVC is worth their ratio in RPM. A phaser
  // advancing the intake cam moves IVC earlier by its own angle, directly.
  const camShift = camPeakShiftRpm(camDuration)
    - intakeCamAdvanceDeg * (COEFF.CAM_PEAK_SHIFT_PER_DEG / COEFF.IVC_PER_CAM_DEG);
  // More open time = more flow area-seconds.
  const flowGain = 1 + (camDuration - CAM_BASE_DURATION) * COEFF.CAM_FLOW_GAIN_PER_DEG;
  const floatRpm = valveFloatRpm(springRate, camDuration);
  // Charge temperature to take the Mach limit against. Peak boost, because choking binds
  // at the top end and that is where the boost curve is highest — so a boosted engine is
  // judged on the hot charge it actually breathes there, not on ambient air.
  const machChargeK = chargeTempK(turboOn ? peakBoostPsi : 0, !!mods.intercooler);
  // Intake valve area against the four-valve head the Mach terms were fitted with.
  const valveAreaRatio = intakeValveAreaRatio(cfg).ratio;
  const sweptM3 = (displacementL / cyl) / 1000;
  // Overlap decides how much of the cycle backpressure gets to push the wrong way: with
  // both valves open, a manifold above the intake drives burnt gas back through the
  // intake valve. A short factory cam is genuinely less exposed than a long one, and
  // that ordering is load-bearing — flattening it over-charges every production engine
  // in the app by more than 20% of peak power.
  const overlapFactor = Math.max(0, camOverlapDeg(camDuration) + intakeCamAdvanceDeg + exhaustCamRetardDeg)
    / COEFF.VE_BACKPRESSURE_OVERLAP_REF;

  return (rpm, mapKpa) => {
    const norm = (rpm - 4500) / 3000;      // -1 at 1500, +1 at 7500
    const loadScale = clamp(mapKpa / BARO_KPA, 0, 1);

    // Sample the baseline breathing curve at the cam-shifted engine speed: the full-load
    // row below atmospheric (part load is the factor below), the boost rows above it.
    const camRpm = clamp(rpm - camShift, 1200, 8200);
    const baseVe = baseBreathing(camRpm, mapKpa);
    let val = baseVe * flowGain * charMultiplier(rpm, ratio);

    // Valve float: past the spring's limit the valve stops following the lobe and
    // cylinder filling collapses. This is the cliff you feel at the top of an
    // over-cammed, under-sprung engine.
    // Inlet choking. Flat through the mid-range, then falling away as the charge
    // approaches sonic velocity past the valve — the term that gives a naturally
    // aspirated engine a power peak before its redline instead of climbing into the
    // limiter (#15). Keyed on stroke, so a long-stroke engine runs out of breath at
    // fewer revolutions than a short-stroke one, which is the real reason it cannot rev.
    val *= machVeMultiplier(cfg.bore, cfg.stroke, rpm, machChargeK, valveAreaRatio);

    if (rpm > floatRpm) {
      val *= clamp(1 - (rpm - floatRpm) / COEFF.FLOAT_COLLAPSE_RPM, COEFF.FLOAT_COLLAPSE_FLOOR, 1);
    }
    val *= 1 + cylBreathing * Math.max(0, norm);
    val *= crFactor * headFactor * fuelFactor * injectionFactor;
    val *= partLoadVeFactor(mapKpa, cfg.compression);

    // Bolt-ons: measured airflow gains, weighted toward the RPM where they work.
    if (mods.intake) val += interp1(RPM, MOD_BONUS.intake, rpm) * loadScale;
    if (mods.exhaust) val += interp1(RPM, MOD_BONUS.exhaust, rpm) * loadScale;
    if (mods.headers) val += interp1(RPM, MOD_BONUS.headers, rpm) * loadScale;

    // Exhaust diameter: undersized chokes the top end, oversized kills low-RPM
    // scavenging velocity. Both directions cost VE, in different places.
    if (diaError < 0) val *= 1 + diaError * COEFF.VE_EXHAUST_UNDERSIZE * Math.max(0, norm);
    else if (diaError > 0) val *= 1 - diaError * COEFF.VE_EXHAUST_OVERSIZE * Math.max(0, -norm);

    // A supercharger kit puts the blower, its intercooler core and the charge piping in
    // the intake path: the same flat cost a turbo kit's intake side carries. It has no
    // turbine, so no exhaust backpressure penalty — which is why, at equal boost, it
    // breathes better than a turbo and pays for it at the crank instead.
    if (supercharged && !turboOn) val *= COEFF.VE_TURBINE_BACKPRESSURE;

    // A turbine in the exhaust stream is a restriction. Small housings choke the top
    // end; large ones flow better up high but hurt low-RPM scavenging.
    if (turboOn && turbine) {
      val *= 1 + turbine.topEndMult * Math.max(0, norm);
      // Intake side: intercooler core and charge piping, fixed hardware, flat cost.
      val *= COEFF.VE_TURBINE_BACKPRESSURE;

      // EXHAUST BACKPRESSURE. A turbine is a flow restriction, not a flat tax. The
      // pressure it holds upstream climbs with the exhaust it has to pass, and once the
      // manifold sits ABOVE the intake, overlap stops scavenging and starts pushing
      // burnt gas back through the intake valve. That is what makes a small turbine
      // breathe fine low down and run out of air at the top, and it is the reason two
      // builds making identical boost are not the same engine.
      //
      // Solved with the same `turbineBackPressureKpa` the cycle uses, against this
      // cell's own flow, so the VE table and the running engine cannot disagree about
      // what the turbine costs. One pass, not iterated: the flow estimate uses the VE
      // computed up to this point, and the second-order correction is far below the
      // 0.1% the table is rounded to.
      // ONLY WHERE THE ENGINE IS ACTUALLY BOOSTED. Below atmospheric the manifold is
      // also above the intake — that is why a turbo engine pumps badly at part throttle
      // — but that cost is already carried twice over, by `pumpingFmepPa` against real
      // EMP and by `residualFraction`'s EMP/MAP term. Charging it here as well would
      // bill the same pressure three times, and at 40 kPa the ratio is about 2.5, which
      // drives this straight into its floor. What is missing from the model, and what
      // this term is for, is the turbine CHOKING under boost.
      if (mapKpa <= BARO_KPA) return Number(clamp(val, 10, 130).toFixed(1));
      // THIS CELL'S charge temperature, not `machChargeK`. That one is deliberately the
      // peak-boost figure because choking binds at the top end, and it is also derived
      // from a caller-supplied `peakBoostPsi` hint that not every call site passes. Using
      // it here made the flow estimate depend on a hint rather than on the cell, and at
      // the default of zero it read the charge as ambient — denser than it is, so more
      // flow, more backpressure, and a VE penalty the cell had not earned.
      const cellChargeK = chargeTempK((mapKpa - BARO_KPA) / PSI_TO_KPA, !!mods.intercooler);
      const airG = trappedAirGrams({ veActual: val, mapKpa, chargeK: cellChargeK, sweptM3 });
      const flowKgS = (airG / 1000) * (1 + 1 / ((fuel?.stoich ?? 14.7) * COEFF.VE_BACKPRESSURE_LAMBDA_REF))
        * cyl * (rpm / 2) / 60;
      const exhaustK = exhaustTempK({
        chargeIndex: (val / 100) * (mapKpa / BARO_KPA),
        lambda: COEFF.VE_BACKPRESSURE_LAMBDA_REF,
      });
      const empKpa = turbineBackPressureKpa(flowKgS, exhaustK, turbine.effectiveAreaM2);
      // Below 1 the manifold is lower than the intake and overlap scavenges — a real
      // gain, but a small one, so it is not credited here; only the loss is charged.
      const pressureRatio = empKpa / Math.max(1, mapKpa);
      val *= clamp(
        1 - COEFF.VE_BACKPRESSURE_PER_PR * Math.max(0, pressureRatio - 1) * overlapFactor,
        COEFF.VE_BACKPRESSURE_FLOOR, 1,
      );
    }

    return Number(clamp(val, 10, 130).toFixed(1));
  };
}

/** Rows of DEFAULT_VE at and above full load, ascending, for the boost end of the curve. */
const BOOST_ROWS = LOAD.map((kpa, ri) => ({ kpa, row: DEFAULT_VE[ri] }))
  .filter((r) => r.kpa >= VE_FULL_LOAD_KPA).sort((a, b) => a.kpa - b.kpa);

/** The baseline breathing curve at an engine speed and a manifold pressure (see above). */
function baseBreathing(rpm, mapKpa) {
  const at = BOOST_ROWS.map((r) => interp1(RPM, r.row, rpm));
  return interp1(BOOST_ROWS.map((r) => r.kpa), at, Math.max(VE_FULL_LOAD_KPA, mapKpa));
}
