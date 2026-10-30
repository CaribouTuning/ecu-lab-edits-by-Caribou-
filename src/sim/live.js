/**
 * Live engine — a continuously running rotational-dynamics model.
 *
 * Unlike the dyno sweep (which evaluates steady-state points), this integrates real
 * crankshaft physics in time: the engine accelerates because combustion torque
 * exceeds friction torque, idles because the ECU trims air to hold a target, and
 * stalls if it does not.
 *
 * `liveStep` is pure apart from `sensorRead`, which uses `Math.random()` to simulate
 * sensor noise. Tests that need determinism should stub `Math.random`.
 */

import { BARO_KPA, DRIVETRAIN_EFF, PSI_TO_KPA } from './constants.js';
import { COEFF } from './coefficients.js';
import { frictionTorqueNm } from './friction.js';
import { clamp, curveAt } from './math.js';
import { solveInduction } from './turbo.js';
import { chargeTempK, INDUCTION_REF_EXHAUST_K } from './thermo.js';
import { evaluatePoint } from './point.js';
import { trappedAirGrams } from './cycle.js';
import { needsAirmass, readEcuTable, truthReader } from './layouts.js';
import { assertBoostCurve } from './sweep.js';

import { liveStepEcu } from './ecu/liveEcu.js';
import {
  CRANK_RPM, CRANK_SENSOR_MIN_RPM, ENGINE_INERTIA, IDLE_TARGET_RPM, LIMITER_OVERSHOOT_RPM, REDLINE_CUT, STALL_RPM,
  readSpeedAndAirflow, sensorRead, steadyManifoldKpa,
} from './liveCore.js';

export {
  CRANK_RPM, CRANK_SENSOR_MIN_RPM, ENGINE_INERTIA, IDLE_TARGET_RPM, LIMITER_OVERSHOOT_RPM, REDLINE_CUT, STALL_RPM,
  readSpeedAndAirflow, sensorRead, steadyManifoldKpa,
};


/**
 * A fresh live-engine state: stopped, cold, untrimmed.
 * @returns {object}
 */
export function makeLiveState() {
  return {
    running: false, cranking: false, rpm: 0, omega: 0, boostPsi: 0,
    idleTrim: 5, stft: 0, ltft: 0,
    coolantC: 20, oilC: 20, knockCount: 0, fuelCut: false, dfco: false, limiterCut: false,
    sensedRpm: 0, sensedMaf: 0, sensedMap: 101, sensedIat: 25,
    sensedLambda: 1.0, sensedCoolant: 20, elapsed: 0,
  };
}

/**
 * One integration step of the live engine plus one pass of the ECU control loop.
 *
 * @param {object} st previous state
 * @param {number} dt timestep, seconds
 * @param {{throttle: number, load: number}} input driver input
 * @param {object} cfg current tune and hardware
 * @returns {object} next state
 */
export function liveStep(st, dt, input, cfg) {
  // With an engine management context the ECU's own controllers run the engine; without
  // one, the original model below, unchanged.
  if (cfg.ecu) return liveStepEcu(st, dt, input, cfg);
  const s = { ...st };
  const {
    ve, veTruth, timing, afr, derived, fuel, injectorCc, ecuInjectorCc, mods, mafScalar,
    mafErrorBase, turboOn, boostCurve, turbine, compressor, layout = null,
  } = cfg;
  const tables = { ve, timing, afr, layout };
  const truthAt = truthReader(veTruth, tables.layout?.ve ?? null);
  const flowAt = truthAt ?? ((r, m) => readEcuTable(tables, 've', r, { mapKpa: m }));
  if (turboOn) assertBoostCurve(boostCurve);
  const redline = derived.redline ?? (REDLINE_CUT - LIMITER_OVERSHOOT_RPM);
  const limiterCutRpm = redline + LIMITER_OVERSHOOT_RPM;

  s.prevRpm = st.rpm;
  s.elapsed += dt;

  // ---- starter / stall handling ----
  if (s.cranking && s.rpm > 450) { s.cranking = false; s.running = true; }
  if (s.running && s.rpm < STALL_RPM) { s.running = false; s.fuelCut = false; }

  // ---- ECU idle air control (PI holding target idle) ----
  const userThrottle = input.throttle;
  if (s.running && userThrottle < 3) {
    if (s.rpm < 2000) {
      // Near idle: closed-loop control. Air is added far faster than it is removed
      // (a dashpot), so the engine catches itself instead of stalling.
      const err = IDLE_TARGET_RPM - s.rpm;
      const gain = err > 0 ? COEFF.IDLE_AIR_GAIN_UP : COEFF.IDLE_AIR_GAIN_DOWN;
      const damp = (s.rpm - (s.prevRpm ?? s.rpm)) * COEFF.IDLE_AIR_DAMP;
      s.idleTrim = clamp(s.idleTrim + err * gain * (dt / 0.05) - damp, 1, 34);
    } else {
      // Coasting down off-idle: bleed the idle valve back toward its base position so
      // the engine can actually decelerate.
      s.idleTrim += (3 - s.idleTrim) * COEFF.IDLE_BLEED_RATE * (dt / 0.05);
    }
  }
  const coldEnrich = s.coolantC < 80 ? 1 + (80 - s.coolantC) * 0.004 : 1;
  const effThrottle = clamp(Math.max(userThrottle, s.running ? s.idleTrim : 0), 0, 100);

  // ---- rev limiter + deceleration fuel cut-off (DFCO) ----
  // Real ECUs shut the injectors off completely on a closed throttle above idle: the
  // engine is being driven by its own inertia, so burning fuel there is pure waste.
  // It is also why a real engine drops back to idle briskly instead of hanging. Fuel
  // is restored with hysteresis before the engine can stall.
  const overrun = s.running && userThrottle < 3 && s.rpm > (s.dfco ? 1600 : 1850) && s.coolantC > 45;
  s.dfco = overrun;
  // A real rev limiter is a hysteresis loop, not a ceiling: fuel is cut at the limit,
  // revs fall, fuel is restored a few hundred RPM lower, and the engine climbs back
  // into the cut. That rapid cut-restore cycle IS the bounce you hear.
  if (s.running) {
    if (s.rpm >= limiterCutRpm) s.limiterCut = true;
    else if (s.rpm < limiterCutRpm - COEFF.LIMITER_RESTORE_BAND_RPM) s.limiterCut = false;
  } else s.limiterCut = false;
  s.fuelCut = (s.running && s.limiterCut) || overrun;

  // ---- combustion torque from the same physics the dyno uses ----
  let crankNm = 0, pt = null;
  if ((s.running || s.cranking) && s.rpm > 100) {
    const rpmClamped = clamp(s.rpm, 700, redline);
    // Throttle opening sets manifold pressure — but so does ENGINE SPEED. A nearly
    // closed throttle at high RPM pulls far harder vacuum than the same opening at
    // idle, because the engine is trying to pump much more air through the same
    // restriction. That rpm term is what lets the engine decelerate on a closed
    // throttle instead of sustaining itself at redline.
    const aFrac = clamp(effThrottle, 0, 100) / 100;
    // Normalised against a fixed RPM datum, not this engine's redline — see
    // COEFF.MANIFOLD_VACUUM_RPM_NORM in coefficients.js for why that is deliberate.
    const nFrac = clamp(rpmClamped / COEFF.MANIFOLD_VACUUM_RPM_NORM, 0, 1.2);
    const loadKpa = steadyManifoldKpa(aFrac, nFrac, derived.overlapDeg || 0);
    const boostTarget = turboOn ? curveAt(boostCurve, rpmClamped) : 0;
    const steady = solveInduction({
      rpm: rpmClamped, loadKpa, turboOn, boostTargetPsi: boostTarget, turbine, compressor,
      veAt: (mapKpa) => flowAt(rpmClamped, mapKpa),
      derived,
      intakeKAt: (boostPsi) => chargeTempK(boostPsi, mods.intercooler),
      lambda: 1, exhaustK: INDUCTION_REF_EXHAUST_K,
    });
    // --- SHAFT INERTIA, i.e. turbo lag. The balance says where the turbo ENDS UP; a real
    // one has to spin a wheel up to get there. Spool-UP is energy-limited, so it is slow
    // at low exhaust flow and fast at high; spool-DOWN is quicker, since a shut throttle
    // leaves the compressor pumping with nothing driving it.
    //
    // Only the live engine sees this — a dyno sweep holds each point until it settles,
    // which is what makes it a steady-state measurement.
    const spooling = steady.boostPsi > s.boostPsi;
    const flowFrac = clamp(rpmClamped / Math.max(1, derived.redline) * aFrac, 0.02, 1);
    const tau = spooling
      ? COEFF.TURBO_SPOOL_TAU_S / Math.max(0.05, flowFrac) * turbine.inertiaScale
      : COEFF.TURBO_DECAY_TAU_S;
    const boostPsi = turboOn
      ? s.boostPsi + (steady.boostPsi - s.boostPsi) * clamp(dt / Math.max(dt, tau), 0, 1)
      : 0;
    s.boostPsi = boostPsi;
    const man = {
      ...steady,
      boostPsi,
      mapKpa: Math.min(loadKpa, BARO_KPA) + boostPsi * PSI_TO_KPA,
      boostShortfallPsi: Math.max(0, boostTarget - boostPsi),
    };
    const veVal = readEcuTable(tables, 've', rpmClamped, { mapKpa: man.mapKpa });
    const veActualVal = truthAt ? truthAt(rpmClamped, man.mapKpa) : undefined;
    const airmassG = needsAirmass(layout)
      ? trappedAirGrams({ veActual: veVal, mapKpa: man.mapKpa, chargeK: chargeTempK(man.boostPsi, mods.intercooler), sweptM3: (derived.displacementL / derived.cyl) / 1000 })
      : 0;
    // Spark-based idle stabilisation: the air path is slow (throttle -> manifold ->
    // cylinder takes several cycles), so real ECUs hold idle with IGNITION timing,
    // which changes torque on the very next firing event. Air trim handles the slow
    // drift; spark handles the fast corrections.
    let idleSpark = 0;
    if (s.running && userThrottle < 3 && s.rpm < 1600) {
      idleSpark = clamp((IDLE_TARGET_RPM - s.rpm) * COEFF.IDLE_SPARK_GAIN, -COEFF.IDLE_SPARK_LIMIT, COEFF.IDLE_SPARK_LIMIT);
    }
    const timingVal = readEcuTable(tables, 'timing', rpmClamped, { mapKpa: man.mapKpa, airmassG }) + idleSpark;
    const afrCmd = readEcuTable(tables, 'afr', rpmClamped, { mapKpa: man.mapKpa, airmassG }) / coldEnrich;
    pt = evaluatePoint({
      rpm: rpmClamped, mapKpa: man.mapKpa, boostPsi: man.boostPsi,
      veVal, veActualVal, timingVal, afrCommanded: afrCmd, fuel,
      mods: { ...mods, turboFitted: turboOn },
      mafScalar: mafScalar * (1 + s.ltft / 100 + s.stft / 100),
      mafErrorBase, injectorCc, ecuInjectorCc, derived, compressor,
      turbine: turboOn ? turbine : null, empKpa: man.empKpa,
    });
    // evaluatePoint already returns BRAKE torque — friction and pumping are subtracted
    // inside it — so we must not deduct them again here.
    if (!s.fuelCut && !s.cranking) {
      crankNm = pt.torque / 0.7376 / DRIVETRAIN_EFF;
    } else if (!s.cranking) {
      // Fuel cut: no combustion at all, so the engine is being motored against its own
      // friction and pumping losses. That is engine braking, for real.
      crankNm = -(pt.fmep * 100000 * (derived.displacementL / 1000)) / (4 * Math.PI);
    }
    if (pt.knock) s.knockCount += pt.knockPull * dt * 8;
  }

  // ---- rotational dynamics ----
  const starterNm = s.cranking ? 180 : 0;
  // Cranking has no combustion, so the starter works against motoring friction.
  const crankingDrag = s.cranking
    ? frictionTorqueNm(Math.max(s.rpm, 0), derived.displacementL, pt ? pt.map : BARO_KPA, 0, derived)
    : 0;
  const netNm = crankNm + starterNm - crankingDrag - (s.running ? input.load : 0);
  const alpha = netNm / ENGINE_INERTIA;
  s.omega = Math.max(0, s.omega + alpha * dt);
  s.rpm = s.omega * 60 / (2 * Math.PI);
  if (!s.running && !s.cranking) s.rpm = Math.max(0, s.rpm - 900 * dt);
  s.omega = s.rpm * 2 * Math.PI / 60;

  // ---- thermal model ----
  if (s.running) {
    const heatIn = 0.9 + (crankNm / 200) * 3.2;
    s.coolantC = Math.min(95, s.coolantC + heatIn * dt * (s.coolantC < 88 ? 1 : 0.15));
    s.oilC = Math.min(110, s.oilC + heatIn * dt * 0.7);
  } else {
    s.coolantC = Math.max(20, s.coolantC - 0.35 * dt);
    s.oilC = Math.max(20, s.oilC - 0.3 * dt);
  }

  // ---- ECU closed-loop fuel trims ----
  // Only at part throttle: at WOT the ECU goes open-loop and stops correcting, which
  // is exactly when MAF scaling errors bite.
  const closedLoop = s.running && pt && !pt.openLoop && s.coolantC > 45;
  if (closedLoop && pt) {
    const lambdaErr = pt.lambda - 1.0;
    s.stft = clamp(s.stft + lambdaErr * COEFF.STFT_GAIN * (dt / 0.05) * 0.25, -COEFF.TRIM_LIMIT, COEFF.TRIM_LIMIT);
    s.ltft = clamp(s.ltft + s.stft * COEFF.LTFT_LEARN_RATE * (dt / 0.05), -COEFF.TRIM_LIMIT, COEFF.TRIM_LIMIT);
  } else if (s.running) {
    s.stft += (0 - s.stft) * 0.06;
  }

  // ---- simulated sensors: lag + noise ----
  const lag = readSpeedAndAirflow(s, pt, dt, derived.overlapDeg || 0);
  s.sensedMap = sensorRead(s.sensedMap, pt ? pt.map : BARO_KPA, lag, 0.7);
  s.sensedIat = sensorRead(s.sensedIat, pt ? pt.iat : 25, 0.05, 0.3);
  s.sensedLambda = sensorRead(s.sensedLambda, pt && s.running && !s.fuelCut ? pt.lambda : 1.6, lag * 0.5, 0.008);
  s.sensedCoolant = sensorRead(s.sensedCoolant, s.coolantC, 0.08, 0.25);
  s.live = pt;
  s.effThrottle = effThrottle;
  s.closedLoop = closedLoop;
  return s;
}
