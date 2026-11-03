/**
 * Airflow model: hardware in, VE out.
 *
 * This is the ONLY place hardware is allowed to change how the engine breathes. If you are
 * adding a part, it belongs here (or in the knock and fuel terms of `point.js`), never as a
 * bonus multiplier on power. The breathing itself is the cylinder's gas exchange
 * (breathing.js): valves, cam events, the intake runner and the exhaust it pushes against.
 */

import { AMBIENT_K, BARO_KPA, PSI_TO_KPA } from './constants.js';
import { COEFF } from './coefficients.js';
import { CYL_COUNT } from './hardware.js';
import { CAM_BASE_DURATION, deriveEngine, intakeValveAreaRatio, valveFloatRpm } from './engine.js';
import { clamp } from './math.js';
import { chargeTempK, exhaustTempK } from './thermo.js';
import { turbineBackPressureKpa } from './turbo.js';
import { rubbingFmepPa } from './friction.js';
import { exhaustSystemDropKpa, gasExchange, valveEvents } from './breathing.js';
import { LOAD, RPM } from './tables.js';

/**
 * Computes the volumetric efficiency table this hardware would actually flow: the gas
 * exchange (`hardwareVeAt`) at every cell. Changing bore, stroke, cam or valves on BUILD
 * moves the numbers you see, as a real hardware change shows up the next time a tuner
 * logs airflow.
 *
 * @param {import('./engine.js').EngineConfig} cfg short-block design
 * @param {{intake: boolean, exhaust: boolean, headers: boolean, intercooler: boolean}} mods bolt-ons
 * @param {object} [hw] induction hardware
 * @param {boolean} [hw.turboOn]
 * @param {{effectiveAreaM2: number}|null} [hw.turbine] the housing: its effective area sets
 *   the backpressure it holds upstream at a flow (turbo.js `turbineBackPressureKpa`)
 * @param {number|null} [hw.exhaustDia] exhaust diameter, inches
 * @param {{stoich: number}|null} [hw.fuel]
 * @param {boolean} [hw.supercharged] a supercharger in the intake (no turbine in the exhaust)
 * @param {number} [hw.peakBoostPsi] peak boost target, psi (kept for callers; the breathing
 *   reads each cell's own pressure)
 * @param {number} [hw.intakeCamAdvanceDeg] how far a cam phaser has advanced the intake
 *   cam, crank degrees: both intake events move earlier by it (breathing.js `valveEvents`)
 * @param {number} [hw.exhaustCamRetardDeg] how far a phaser has retarded the exhaust cam:
 *   it closes later, adding overlap, which is what a turbine's backpressure pushes against
 * @returns {number[][]} VE table, percent, indexed [LOAD][RPM]
 */
export function computeHardwareVE(cfg, mods, hw = {}, axes = null) {
  const at = hardwareVeAt(cfg, mods, hw);
  return (axes?.load ?? LOAD).map((mapKpa) => (axes?.rpm ?? RPM).map((rpm) => at(rpm, mapKpa)));
}

/**
 * The intake runner this engine breathes through: its bore from the intake valves it feeds,
 * its length the one whose torque (filling less friction) peaks at `tuneRpm` (the published torque peak where
 * there is one), found by stepping the length and running the gas exchange. A player's
 * engine may set its own length (`cfg.runnerMm`).
 * @param {object} base the breathing geometry without the runner length
 * @param {number} tuneRpm
 * @param {object|null} [derived] the engine's derived figures, for its friction
 * @param {number|null} [cyl] cylinders, for its exhaust flow
 * @returns {number} runner length, m
 */
function tunedRunnerM(base, tuneRpm, derived = null, cyl = null) {
  const key = `${COEFF.BREATH_VALVE_CD}|${cyl}|${base.boreM}|${base.strokeM}|${base.compression}|${base.intakeValveM}|${base.intakeValves}|${base.events.ivc}|${base.events.ivo}|${base.runnerAreaM2}|${Math.round(tuneRpm)}`;
  const hit = RUNNER_CACHE.get(key);
  if (hit != null) return hit;
  // The length whose filling peaks at the speed it is tuned for, the peak found between
  // samples by a parabola through the highest three (a flat curve's peak does not jump from
  // one sample to the next). Ties go to the shorter runner.
  const op = { plenumKpa: BARO_KPA, intakeK: AMBIENT_K, exhaustKpa: BARO_KPA + 8, exhaustK: 1000 };
  const step = 500;
  const rpms = []; for (let r = 1000; r <= tuneRpm * 2 + step; r += step) rpms.push(r);
  // Torque, not filling, is what peaks at the published speed: brake MEP is the indicated MEP
  // the filling buys, less the engine's own rubbing friction, which climbs with speed and so
  // puts the torque peak below the filling peak.
  const fmep = rpms.map((rpm) => rubbingFmepPa(rpm, derived?.springPa ?? 0, derived ?? {}));
  /** Where a runner of this length peaks in torque, interpolated between samples. */
  const peakOf = (L) => {
    const g = { ...base, runnerLengthM: L };
    const ves = rpms.map((rpm, n) => {
      // Against the exhaust backpressure its own flow raises through a stock system: lost
      // filling and pumping work both grow with speed.
      let emp = BARO_KPA; let r = null;
      for (let i = 0; i < 2; i++) {
        r = gasExchange(g, { ...op, rpm, exhaustKpa: emp });
        const exh = r.freshKg * (cyl ?? 6) * (rpm / 120) * 1.07;
        emp = BARO_KPA + exhaustSystemDropKpa({ flowKgS: exh, exhaustK: op.exhaustK - COEFF.EXHAUST_PIPE_COOLING_K, pipeDiaIn: 3.0 });
      }
      return (r.ve / 100) * COEFF.BREATH_IMEP_PER_VE_PA - fmep[n] - (emp - BARO_KPA) * 1000;
    });
    let k = 0; ves.forEach((v, n) => { if (v > ves[k]) k = n; });
    let peak = rpms[k];
    if (k > 0 && k < ves.length - 1) {
      const den = ves[k - 1] - 2 * ves[k] + ves[k + 1];
      if (den < 0) peak += step * 0.5 * (ves[k - 1] - ves[k + 1]) / den;
    }
    return peak;
  };
  // Coarse, then fine about the best: a longer runner peaks lower, so the error is close to
  // monotonic in the length and two passes find it.
  let best = 0.35; let bestErr = Infinity;
  const search = (from, to, by) => {
    for (let L = from; L <= to + 1e-9; L += by) {
      const err = Math.abs(peakOf(L) - tuneRpm);
      if (err < bestErr - 1) { bestErr = err; best = L; }
    }
  };
  search(0.1, 1.0, 0.1);
  search(Math.max(0.1, best - 0.08), Math.min(1.0, best + 0.08), 0.02);
  RUNNER_CACHE.set(key, best);
  return best;
}
const RUNNER_CACHE = new Map();

/**
 * The cylinder's breathing geometry from the engine's own figures (breathing.js).
 * @param {import('./engine.js').EngineConfig} cfg
 * @param {{intakeCamAdvanceDeg?: number, exhaustCamRetardDeg?: number, headers?: boolean}} [phase]
 * @returns {import('./breathing.js').BreathingGeometry}
 */
export function breathingGeometry(cfg, phase = {}) {
  const { intakeValves, intakeValveMm } = intakeValveAreaRatio(cfg);
  const valvesPerCyl = cfg.valvesPerCyl ?? 4;
  const exhaustValves = Math.max(1, valvesPerCyl - intakeValves);
  const intakeValveM = intakeValveMm / 1000;
  // Fewer exhaust valves than intake (a three-valve head) are each made larger, so the
  // exhaust side keeps its share of the area.
  const exhaustValveM = intakeValveM * COEFF.BREATH_EXHAUST_VALVE_SHARE * Math.sqrt(intakeValves / exhaustValves);
  const camDuration = cfg.camDuration ?? CAM_BASE_DURATION;
  const ivcAbdc = COEFF.IVC_BASE_ABDC + (camDuration - COEFF.IVC_CAM_REF_DURATION) * COEFF.IVC_PER_CAM_DEG
    - (phase.intakeCamAdvanceDeg ?? 0);
  const throat = intakeValves * (Math.PI / 4) * (COEFF.BREATH_THROAT_SHARE * intakeValveM) ** 2;
  const base = {
    boreM: cfg.bore / 1000, strokeM: cfg.stroke / 1000, compression: cfg.compression, rodRatio: COEFF.ROD_RATIO,
    intakeValves, intakeValveM, exhaustValves, exhaustValveM, liftPerDia: COEFF.BREATH_LIFT_PER_DIA,
    runnerAreaM2: throat * COEFF.BREATH_RUNNER_AREA_SHARE, runnerLengthM: 0.35,
    // The exhaust primaries: a cast manifold's short ones, or long-tube headers' (phase.headers).
    exhaustPrimaryM: phase.headers ? COEFF.EXH_PRIMARY_HEADERS_M : COEFF.EXH_PRIMARY_MANIFOLD_M,
    exhaustPrimaryAreaM2: exhaustValves * (Math.PI / 4) * (COEFF.BREATH_THROAT_SHARE * exhaustValveM) ** 2 * COEFF.EXH_PRIMARY_AREA_SHARE,
    exhaustReflection: reflectionCoefficient(phase.headers ? COEFF.EXH_COLLECTOR_AREA_HEADERS : COEFF.EXH_COLLECTOR_AREA_MANIFOLD),
    events: valveEvents({ ivcAbdc, durationDeg: camDuration, exhaustRetardDeg: phase.exhaustCamRetardDeg ?? 0, maxLiftM: COEFF.BREATH_LIFT_PER_DIA * intakeValveM }),
  };
  if (cfg.runnerMm) return { ...base, runnerLengthM: cfg.runnerMm / 1000 };
  // The intake runner is tuned with the factory exhaust; headers change the exhaust, not it.
  if (phase.headers) return { ...base, runnerLengthM: breathingGeometry(cfg, { ...phase, headers: false }).runnerLengthM };
  // The runner is tuned with the cam parked: a phaser moves the events, not the manifold.
  const parked = phase.intakeCamAdvanceDeg || phase.exhaustCamRetardDeg ? breathingGeometry(cfg, {}) : null;
  if (parked) return { ...base, runnerLengthM: parked.runnerLengthM };
  const tuneRpm = cfg.runnerTuneRpm ?? (cfg.redline ?? 7000) * COEFF.BREATH_TUNE_SHARE_OF_REDLINE;
  return { ...base, runnerLengthM: tunedRunnerM(base, tuneRpm, deriveEngine(cfg), CYL_COUNT[cfg.configuration]) };
}

/**
 * The engine's volumetric efficiency at any speed and manifold pressure, from its gas
 * exchange (breathing.js): the valves, the cam's events and any phaser, the runner, the
 * exhaust manifold pressure the pipe, the bolt-ons or a turbine hold, and the charge
 * temperature the induction delivers. Effects outside the gas exchange are applied on top:
 * fuel evaporating in the charge (direct injection, ethanol), the head's heat, valve float.
 *
 * @param {import('./engine.js').EngineConfig} cfg
 * @param {{intake: boolean, exhaust: boolean, headers: boolean, intercooler: boolean}} mods
 * @param {object} [hw] as for computeHardwareVE
 * @returns {(rpm: number, mapKpa: number) => number} VE, percent
 */
export function hardwareVeAt(cfg, mods, hw = {}) {
  const {
    turboOn = false, turbine = null, exhaustDia = null, fuel = null,
    intakeCamAdvanceDeg = 0, exhaustCamRetardDeg = 0,
  } = hw;
  const g = breathingGeometry(cfg, { intakeCamAdvanceDeg, exhaustCamRetardDeg, headers: !!mods.headers });
  const cyl = CYL_COUNT[cfg.configuration];
  const pipeDiaIn = exhaustDia ?? 3.0;
  const floatRpm = valveFloatRpm(cfg.springRate ?? 50, cfg.camDuration ?? CAM_BASE_DURATION);
  const headFactor = cfg.headMaterial === 'Aluminum' ? COEFF.VE_ALUMINIUM_HEAD_GAIN : 1.0;
  const fuelFactor = fuel ? (fuel.stoich < 12 ? COEFF.VE_E85_CHARGE_COOLING : fuel.stoich < 14.7 ? 1.005 : 1.0) : 1.0;
  const injectionFactor = cfg.injection === 'direct' ? COEFF.VE_DIRECT_INJECTION : 1.0;
  const stoich = fuel?.stoich ?? 14.7;
  const cache = new Map();

  /** The gas exchange at one grid node, computed once. */
  const node = (ri, mi) => {
    const key = ri * 4096 + mi;
    const hit = cache.get(key);
    if (hit != null) return hit;
    const rpm = Math.max(VE_GRID_RPM, ri * VE_GRID_RPM);
    const mapKpa = Math.max(VE_GRID_KPA, mi * VE_GRID_KPA);
    const boostPsi = Math.max(0, (mapKpa - BARO_KPA) / PSI_TO_KPA);
    const intakeK = chargeTempK(boostPsi, !!mods.intercooler);
    // Exhaust manifold pressure is set by the flow it passes, which is set by the breathing:
    // repeated substitution from atmospheric; three passes settle it well inside 0.1% VE.
    let emp = BARO_KPA;
    let r = null;
    for (let i = 0; i < 3; i++) {
      const tex = exhaustK(mapKpa, r?.ve ?? 85);
      r = gasExchange(g, { rpm, plenumKpa: mapKpa, intakeK, exhaustKpa: emp, exhaustK: tex });
      const airKgS = r.freshKg * cyl * (rpm / 120);
      const exhKgS = airKgS * (1 + 1 / (stoich * COEFF.VE_BACKPRESSURE_LAMBDA_REF));
      // The pipe runs cooler than the manifold: the gas has given up heat on the way.
      const system = exhaustSystemDropKpa({ flowKgS: exhKgS, exhaustK: tex - COEFF.EXHAUST_PIPE_COOLING_K, pipeDiaIn, mods });
      emp = turboOn && turbine
        ? turbineBackPressureKpa(exhKgS, tex, turbine.effectiveAreaM2) + system
        : BARO_KPA + system;
    }
    let val = r.ve * headFactor * fuelFactor * injectionFactor;
    if (rpm > floatRpm) val *= clamp(1 - (rpm - floatRpm) / COEFF.FLOAT_COLLAPSE_RPM, COEFF.FLOAT_COLLAPSE_FLOOR, 1);
    cache.set(key, val);
    return val;
  };

  // Read between grid nodes bilinearly, so the curve is smooth to any caller.
  return (rpm, mapKpa) => {
    const x = clamp(rpm, VE_GRID_RPM, 16000) / VE_GRID_RPM;
    const y = clamp(mapKpa, VE_GRID_KPA, 600) / VE_GRID_KPA;
    const ri = Math.floor(x); const mi = Math.floor(y);
    const fx = x - ri; const fy = y - mi;
    const v = node(ri, mi) * (1 - fx) * (1 - fy) + node(ri + 1, mi) * fx * (1 - fy)
      + node(ri, mi + 1) * (1 - fx) * fy + node(ri + 1, mi + 1) * fx * fy;
    return Number(clamp(v, 5, 140).toFixed(1));
  };
}

/** The breathing is computed on a grid this fine (RPM, kPa) and read between its nodes. */
const VE_GRID_RPM = 100;
const VE_GRID_KPA = 2;

/**
 * Pressure reflection coefficient of a wave meeting an area change from A1 to A2 = r * A1:
 * (A1 - A2) / (A1 + A2), linear acoustics; negative (an inverted, suction wave) into a
 * larger area.
 * @param {number} areaRatio A2 / A1
 * @returns {number}
 */
function reflectionCoefficient(areaRatio) {
  return (1 - areaRatio) / (1 + areaRatio);
}

/** Exhaust gas temperature at the manifold for a breathing cell, K (thermo.js). */
function exhaustK(mapKpa, ve) {
  return exhaustTempK({ chargeIndex: (ve / 100) * (mapKpa / BARO_KPA), lambda: COEFF.VE_BACKPRESSURE_LAMBDA_REF });
}
