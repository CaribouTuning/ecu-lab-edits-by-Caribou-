/**
 * Dyno sweep — a full pull, plus the event log that explains it.
 *
 * The event log is the teaching surface of the whole app. Every event carries three
 * things: what happened (`msg`), what physically caused it (`cause`), and what to
 * change (`fix`). When adding a new event type, all three are mandatory — an event
 * that only says something is wrong teaches nothing.
 */

import { STOCK_EXHAUST_DIA_IN } from './hardware.js';
import { BARO_KPA, MIXTURE_TOLERANCE_PCT } from './constants.js';
import { throttleBoreM } from './throttle.js';
import { COEFF } from './coefficients.js';
import { clamp, curveAt, groupRuns, mergeNearbyRuns } from './math.js';
import { solveInduction } from './turbo.js';
import { chargeTempK, INDUCTION_REF_EXHAUST_K } from './thermo.js';
import { evaluatePoint } from './point.js';
import {
  IN_FORCE_WEIGHT, KNOCK_SAFETY_DEG, cellsInForce, missedMixCause, missesTarget,
  afrTargetVerdict, pullCellLimits, pullSparkCells, pullTableCells, reachKpaAt, sparkForLimit,
} from './advisors.js';
import { bestPowerAfr } from './manifold.js';
import { FAILURE_MODES, pointWear, sweepFailure, wearEffects } from './damage.js';
import { trappedAirGrams } from './cycle.js';
import { loadFor, needsAirmass, readEcuTable, truthReader } from './layouts.js';
import { CURVE_RPM, IDLE_COLUMN_MAX_RPM, LOAD, OPEN_LOOP_KPA, RPM, SPARK_MIN_DEG } from './tables.js';
import { ecuSweepEvents } from './ecu/ecuEvents.js';
import { ECU_COEFF } from './ecu/ecuCoefficients.js';
import { ecuDemandPoint, ecuSteadyPoint } from './ecu/strategy.js';
import { N2O_AIR_EQUIV, stepBottle, wetKitFuelKgS } from './nitrous.js';
import { veCorrections, veSamplesFromPull } from './veLearn.js';

/** Exhaust over intake pressure past which a turbo engine's turbine is logged as choking it. */
const BACKPRESSURE_RATIO_LIMIT = 1.8;

/** Lowest engine speed of a dyno pull, RPM. */
export const SWEEP_START_RPM = 1500;
/** Highest engine speed of a dyno pull, RPM. */
export const SWEEP_END_RPM = 7500;
/** Sweep resolution, RPM. */
export const SWEEP_STEP_RPM = 100;

/**
 * Guards the one input that has already broken this simulation once.
 *
 * The UI builds every boost curve with `RPM.map(...)`, but preset data is a second
 * source of curves. A short array silently interpolates to `undefined` and puts NaN
 * through every downstream formula, so fail loudly at the boundary instead.
 *
 * @param {number[]} boostCurve
 * @throws {Error} if the curve does not match the RPM axis
 */
export function assertBoostCurve(boostCurve) {
  if (!Array.isArray(boostCurve) || (boostCurve.length !== RPM.length && boostCurve.length !== CURVE_RPM.length)) {
    throw new Error(
      `boost curve must have ${RPM.length} entries (the table grid's columns) or ${CURVE_RPM.length} (CURVE_RPM, to 11,500 RPM) — got ${
        Array.isArray(boostCurve) ? boostCurve.length : typeof boostCurve
      }. Build it with RPM.map(...) or CURVE_RPM.map(...).`,
    );
  }
  const bad = boostCurve.findIndex((v) => !Number.isFinite(v));
  if (bad !== -1) {
    throw new Error(`boost curve entry ${bad} is not a finite number: ${boostCurve[bad]}`);
  }
}

/**
 * Systematic MAF misread introduced by hardware that changes airflow characteristics
 * downstream of the sensor — a bigger intake or turbo plumbing — before the ECU has
 * been recalibrated for it.
 *
 * Exported so the factory calibration generator in `presets.js` can pre-compensate for
 * exactly this error the same way a real ECU's characterized MAF transfer function
 * would, rather than guessing at a second copy of this formula — the same drift risk that
 * keeps the cycle model in one place for the ECU and the calibration generator both.
 *
 * @param {{intake: boolean}} mods bolt-ons fitted
 * @param {boolean} turboOn whether a turbo is fitted
 * @returns {number} multiplier applied to true airflow to get the MAF's reading
 */
export function mafErrorFactor(mods, turboOn) {
  let base = 1.0;
  if (mods.intake) base *= COEFF.MAF_ERROR_INTAKE;
  if (turboOn) base *= COEFF.MAF_ERROR_TURBO;
  return base;
}

/** Knock separated by no more than this much quiet is reported as one band. */
const KNOCK_MERGE_GAP_RPM = 600;

/**
 * The spark-table rows in force at a manifold pressure, as a tuner would look for them:
 * one row when the engine sits on it, the two either side (and where between) when it
 * runs between them — which, under boost, it nearly always does.
 * On a layout that reads spark by air per cylinder (layouts.js) the rows are named in
 * that unit, at the air the point trapped.
 * @param {number} mapKpa
 * @param {import('./layouts.js').Layout|null} [layout]
 * @param {number} [airmassG]
 * @returns {string}
 */
function tableRowsAt(mapKpa, layout = null, airmassG = 0) {
  const axes = layout?.timing ?? { load: LOAD, loadUnit: 'kPa' };
  const v = loadFor(/** @type {any} */ (axes), { mapKpa, airmassG });
  const u = axes.loadUnit;
  const fmt = (x) => (u === 'g/cyl' ? x.toFixed(2) : String(Math.round(x)));
  const near = u === 'kPa' ? 3 : u === 'g/cyl' ? 0.01 : 10;
  const rows = [...axes.load].sort((a, b) => a - b);
  const on = rows.find((r) => Math.abs(r - v) <= near);
  if (on !== undefined) return `the ${fmt(on)} ${u} load row`;
  if (v > rows[rows.length - 1]) return `the ${fmt(rows[rows.length - 1])} ${u} load row (it ran at ${fmt(v)} ${u})`;
  if (v < rows[0]) return `the ${fmt(rows[0])} ${u} load row (it ran at ${fmt(v)} ${u})`;
  const hi = rows.find((r) => r > v);
  const lo = [...rows].reverse().find((r) => r < v);
  return `the ${fmt(lo)} and ${fmt(hi)} ${u} load rows (it ran at ${fmt(v)} ${u}, between them)`;
}

/** While the nitrous sprays, richer than this is fuel the spray does not need (a wet kit is held near 11.5:1). */
const SPRAY_RICHEST_LAMBDA = 0.75;

/**
 * The ECU's hardware for a pull: the build's `EcuHardware`, completed with the pull's own
 * engine, induction and injectors.
 *
 * @param {object} input `simulateSweep`'s input, with its `ecu`; `wear` is the engine's
 *   wear effects (damage.js `wearEffects`) where the pull runs on a worn engine
 * @returns {object}
 */
function pullEcuHardware({
  ecu, ve, veTruth, timing, afr, layout = null, turboOn, boostCurve, fuel, injectorCc, ecuInjectorCc, mods, mafScalar,
  derived, turbine, compressor, blower = null, blowerRatio = 1, nitrous = null, exhaustDia = null, wear = null,
}) {
  return {
    ...ecu.hw, mafErrorBase: mafErrorFactor(mods, turboOn), derived, mods, turboOn, boostCurve, turbine, compressor,
    injectorCc, ecuInjectorCc, mafScalar, fuel, blower, blowerRatio, nitrous, exhaustDia,
    veTruthByPhase: ecu.hw.veTruthByPhase ?? [pullBreathing({ ve, veTruth, timing, afr, layout }).flowAt],
    ...(wear ? { wear } : {}),
  };
}

/**
 * The engine's true breathing at any speed and pressure (`hardwareVeAt`), or, when the
 * caller gives none, the ECU's own VE table taken as correct: the "perfectly calibrated"
 * case. Read on the table's own breakpoints either way, never clamped at a grid's edge.
 *
 * @param {object} input `simulateSweep`'s tables, `veTruth` and `layout`
 * @returns {{tables: object, truthAt: ((rpm: number, mapKpa: number) => number)|null,
 *   flowAt: (rpm: number, mapKpa: number) => number}}
 */
function pullBreathing({ ve, veTruth, timing, afr, layout = null }) {
  const tables = { ve, timing, afr, layout };
  const truthAt = truthReader(veTruth, layout?.ve ?? null);
  const flowAt = truthAt ?? ((r, m) => readEcuTable(tables, 've', r, { mapKpa: m }));
  return { tables, truthAt, flowAt };
}

/**
 * Injector duty the ECU commands at one RPM of a pull, before the pull is run.
 *
 * The point is the pull's own, solved the way the pull solves it: the boost the turbo or
 * blower actually makes, the day's air, the ECU's dead time, pressure model and fuel
 * belief. What it leaves out is anything that reacts to the demand, which is
 * `ecuDemandPoint`'s to explain. TUNE → INJECTORS shows it and the Engineer Score
 * reads it.
 *
 * @param {object} input `simulateSweep`'s input, which must carry `ecu`, and `rpm`, the
 *   engine speed to read the duty at
 * @returns {number} injector duty, percent, as the datalog rounds it
 */
export function injectorDutyPreview(input) {
  const { ecu, ve, timing, afr, layout = null, loadKpa, rpm } = input;
  return ecuDemandPoint({ cal: ecu.cal, hw: pullEcuHardware(input), cond: ecu.cond, tables: { ve, timing, afr, layout }, rpm, loadKpa }).duty;
}

/** Engine speed TUNE → INJECTORS previews duty at, RPM. */
export const DUTY_PREVIEW_RPM = 6500;

/**
 * Where the injector duty preview reads: DUTY_PREVIEW_RPM, or the redline of an engine
 * that stops short of it (a truck V8's 5600), so the preview is always a point the pull
 * runs.
 *
 * @param {{redline?: number}} derived
 * @returns {number}
 */
export function dutyPreviewRpm(derived) {
  return Math.min(DUTY_PREVIEW_RPM, derived.redline ?? SWEEP_END_RPM);
}

/**
 * Runs a full dyno pull and produces the datalog, event log, wear and peak figures.
 *
 * With `ecu`, every point is solved with the engine management in the loop — boost
 * control, cam phasing, knock control, sensors, protections — by `ecuSteadyPoint`, and
 * the log gains the ECU's own events. Without it, the ECU is the ideal one the model has
 * always assumed, and the result is exactly what it always was.
 *
 * `input.ecu`, when given, is `{cal, hw, cond}` — the calibration, the
 * `EcuHardware` and the `EcuConditions` of `src/sim/ecu/strategy.js`.
 *
 * `input.health`, when given, is the engine's condition at the start of the pull
 * (damage.js): its worn parts act on every point, and if the pull spends a part's last
 * life the engine fails at that point. The pull ends there, and the result's `failure`
 * says where, which part and how. Without it the engine is new, and the result is
 * exactly what it always was.
 *
 * `traceRpm` keeps the closed cycle's pressure trace at that speed (the point's
 * `cycleTrace`); `onlyRpm` runs that one speed and skips the rest, for a caller that wants
 * one point the way the pull makes it.
 *
 * @param {object} input
 * @returns {{points: object[], events: object[], wear: object, peakHp: number, peakTq: number, loadKpa: number, needsMafRecal: boolean,
 *   failure?: {rpm: number, part: import('./damage.js').Part, title: string, cause: string}|null}}
 */
export function simulateSweep({
  loadKpa, ve, veTruth, timing, afr, turboOn, boostCurve, octaneLabel,
  fuel, injectorCc, ecuInjectorCc, injectorLabel, mods, mafScalar, derived,
  turbine, compressor, ecu = null, blower = null, blowerRatio = 1, nitrous = null, layout = null, health = null,
  exhaustDia = null, traceRpm = null, onlyRpm = null,
}) {
  const wearFx = health ? wearEffects(health, derived.cyl) : null;
  if (turboOn) assertBoostCurve(boostCurve);
  const mafErrorBase = mafErrorFactor(mods, turboOn);
  const needsMafRecal = mods.intake || turboOn;
  const modsWithTurbo = { ...mods, turboFitted: turboOn };

  const points = [];
  const { tables, truthAt, flowAt } = pullBreathing({ ve, veTruth, timing, afr, layout });
  const endRpm = derived.redline ?? SWEEP_END_RPM;
  const hardCut = ecu ? (derived.redline ?? SWEEP_END_RPM) + ecu.cal.limiter.offsetRpm : Infinity;
  const ecuHw = ecu ? pullEcuHardware({
    ecu, ve, veTruth, timing, afr, layout, turboOn, boostCurve, fuel, injectorCc, ecuInjectorCc, mods, mafScalar,
    derived, turbine, compressor, blower, blowerRatio, nitrous, exhaustDia, wear: wearFx,
  }) : null;
  // A nitrous bottle through the pull: what each point sprays makes the liquid left boil
  // and cool, and the pressure falls with it — a heater is too slow to hold it mid-pass.
  const nc = ecu && nitrous ? ecu.cond.nitrous : null;
  let bottle = nc ? { massKg: (nitrous.bottleLb ?? 10) * 0.45359237, tempK: nc.bottleK } : null;
  const dtPerPoint = SWEEP_STEP_RPM / ECU_COEFF.DYNO_SWEEP_RPM_PER_S;
  for (let rpm = SWEEP_START_RPM; rpm <= endRpm; rpm += SWEEP_STEP_RPM) {
    // One speed only (the Physics page's cylinder at the speed it shows): the rest are skipped.
    if (onlyRpm != null && rpm !== onlyRpm) continue;
    if (ecu) {
      // The limiter cuts before the pull gets there: those points are never reached.
      if (rpm >= hardCut) break;
      const cond = bottle
        ? { ...ecu.cond, nitrous: { ...nc, armed: nc.armed && bottle.massKg > 0, bottleK: bottle.tempK } }
        : ecu.cond;
      const pt = ecuSteadyPoint({ cal: ecu.cal, hw: ecuHw, cond, tables: { ve, timing, afr, layout }, rpm, loadKpa, traceCycle: rpm === traceRpm });
      points.push(pt);
      if (bottle && pt.nitrousLbMin > 0) {
        bottle = stepBottle(bottle, (pt.nitrousLbMin * 0.45359237 / 60) * dtPerPoint, dtPerPoint, {
          heater: !!nitrous.heater, setK: nc.setK ?? nc.bottleK, ambientK: ecu.cond.env.ambientK,
        });
      }
      continue;
    }
    const boostTarget = turboOn ? curveAt(boostCurve, rpm) : 0;
    // Boost is solved from the turbine/compressor power balance, not ramped in on engine
    // speed. The target is a wastegate ceiling: ask for more than the hardware can make
    // and the log will show what it actually made.
    const man = solveInduction({
      rpm, loadKpa, turboOn, boostTargetPsi: boostTarget, turbine, compressor,
      veAt: (mapKpa) => flowAt(rpm, mapKpa),
      derived,
      intakeKAt: (boostPsi) => chargeTempK(boostPsi, mods.intercooler),
      lambda: 1, exhaustK: INDUCTION_REF_EXHAUST_K,
      throttle: { boreM: throttleBoreM(derived), coldAirIntake: !!mods.intake },
      exhaust: { pipeDiaIn: exhaustDia ?? STOCK_EXHAUST_DIA_IN, mods },
      intakeKAtEff: (b, eta) => chargeTempK(b, mods.intercooler, undefined, eta),
      ...(blower ? { blower, blowerRatio } : {}),
    });
    // Tables are indexed by ACTUAL manifold pressure, so adding boost walks the
    // calibration up into the high-MAP rows automatically.
    const veVal = readEcuTable(tables, 've', rpm, { mapKpa: man.mapKpa });
    // `veTruth` is what the hardware actually flows. When it is omitted the ECU's
    // table is taken as correct, which is the "perfectly calibrated" case.
    const veActualVal = truthAt ? truthAt(rpm, man.mapKpa) : undefined;
    const airmassG = needsAirmass(layout)
      ? trappedAirGrams({ veActual: veVal, mapKpa: man.mapKpa, chargeK: chargeTempK(man.boostPsi, mods.intercooler), sweptM3: (derived.displacementL / derived.cyl) / 1000 })
      : 0;
    const timingVal = readEcuTable(tables, 'timing', rpm, { mapKpa: man.mapKpa, airmassG });
    const afrCommanded = readEcuTable(tables, 'afr', rpm, { mapKpa: man.mapKpa, airmassG });
    points.push({
      ...evaluatePoint({
        rpm, mapKpa: man.mapKpa, boostPsi: man.boostPsi,
        veVal, veActualVal, timingVal, afrCommanded, fuel, mods: modsWithTurbo,
        mafScalar, mafErrorBase, injectorCc, ecuInjectorCc, derived, compressor,
        turbine: turboOn ? turbine : null, empKpa: man.empKpa, compressorEff: turboOn ? man.compressorEff : null,
        ...(man.blower ? { blower: man.blower } : {}),
        ...(wearFx ? { wear: wearFx } : {}),
      }),
      ...(turboOn ? { boostTarget: Number(boostTarget.toFixed(1)) } : {}),
    });
  }

  const perPoint = points.map(pointWear);
  let pistonWear = 0, valveWear = 0;
  perPoint.forEach((w) => {
    pistonWear += w.piston;
    valveWear += w.valve;
  });
  const pullPeakPressure = points.reduce((s, p) => s + p.peakPressure, 0) / points.length;
  // Bearings are loaded by peak cylinder pressure on every firing stroke, so they are
  // charged for the pressure the whole pull averaged — not for boost, which was only
  // ever a proxy for it and one that ignored static compression entirely. Block
  // material still modulates it: an iron block holds its main bores rounder under load
  // than an aluminium one, which is `bearingWearMult`'s whole job.
  const bearingWear = Math.max(0, pullPeakPressure - (derived.bearingFreeBar ?? COEFF.BEARING_PRESSURE_FREE_BAR))
    * COEFF.WEAR_BEARING_PER_BAR * derived.bearingWearMult;
  let wear = { piston: pistonWear, bearing: bearingWear, valve: valveWear };

  // A part that runs out of life fails where it does: the pull ends at that point, and
  // the failed part is spent to nothing. What the others wore is what the pull to there
  // cost them, charged the same way the failure was found.
  let failure = null;
  if (health) {
    const freeBar = derived.bearingFreeBar ?? COEFF.BEARING_PRESSURE_FREE_BAR;
    const at = sweepFailure(points, wear, health, freeBar, perPoint);
    if (at) {
      wear = { ...at.spent };
      wear[at.part] = Math.max(wear[at.part], health[at.part]);
      points.length = at.index + 1;
      failure = { rpm: points[at.index].rpm, part: at.part, ...FAILURE_MODES[at.part] };
    }
  }
  // Everything below reads the pull as it ran: to the failure, if there was one.
  const reachedRpm = failure ? failure.rpm : endRpm;
  const avgBoost = points.reduce((s, p) => s + p.boostPsi, 0) / points.length;
  const avgPeakPressure = points.reduce((s, p) => s + p.peakPressure, 0) / points.length;

  const events = [];
  const rangeLabel = (run) => (run[0].rpm === run[run.length - 1].rpm
    ? `${run[0].rpm} RPM`
    : `${run[0].rpm}–${run[run.length - 1].rpm} RPM`);
  /** How much of the full sweep this run covers. */
  const rangeFrac = (run) => run.length / points.length;
  // Delivered mixture more than half a ratio from what the AFR table asked for: the
  // table is not the problem, the fuelling is — a tuner reading a wideband against the
  // target makes exactly this call before touching a single AFR cell.
  const missedTarget = (p) => Math.abs(p.afr - p.afrCommanded) > 0.5;
  // The FUEL cells a point reads whose target TUNE marks, with the number it marks: judged by the
  // same rule (advisors.js afrTargetVerdict), on cells at or under the pressure the point ran, at
  // full load, past the idle column and inside the redline, as TUNE grades them.
  const afrCellsOf = pullTableCells({ tables, derived, mods }, 'afr');
  const afrAxesOf = (tables.layout ?? null)?.afr ?? { rpm: RPM, load: LOAD, loadUnit: 'kPa' };
  const pastRedlineCol = (ci) => derived.redline != null && (afrAxesOf.rpm[ci] > derived.redline || (ci > 0 && afrAxesOf.rpm[ci - 1] >= derived.redline));
  /** @type {Map<string, any>|null} the spark cells' pull limits, once worked out (the knock entry) */
  let sparkLimitsForFuel = null;
  // Where no spark the table holds is safe, a direct-injected engine's target is judged as a
  // port one's (TUNE does the same).
  const portBandAt = (ri, ci) => {
    const L = sparkLimitsForFuel?.get(`${ri}|${ci}`);
    return !!L && L.knockBy > 0 && L.limit - KNOCK_SAFETY_DEG < SPARK_MIN_DEG;
  };
  // The rows TUNE grades at each speed: at or under what the engine reaches there, by the same
  // rule (advisors.js reachKpaAt), so a row the turbo overshot into is not named when TUNE
  // calls it out of reach.
  const reachOf = reachKpaAt({ turboOn, boostCurve, pull: { points } });
  const offTargets = (p) => (afr ? afrCellsOf(p) : [])
    .filter((c) => c.w >= IN_FORCE_WEIGHT && c.rowKpa <= Math.min(p.map + 0.5, reachOf(afrAxesOf.rpm[c.ci]) + 1e-6) && c.rowKpa >= OPEN_LOOP_KPA
      && afrAxesOf.rpm[c.ci] > IDLE_COLUMN_MAX_RPM && !pastRedlineCol(c.ci))
    .map((c) => ({ ...c, v: afrTargetVerdict({ value: afr[c.ri][c.ci], kpa: c.rowKpa, direct: derived.injection === 'direct' && !portBandAt(c.ri, c.ci) }) }))
    .filter((c) => c.v.outside);
  const afrCellText = (c) => `${afrAxesOf.loadUnit === 'kPa' ? `${Math.round(afrAxesOf.load[c.ri])} kPa` : `${afrAxesOf.load[c.ri]} ${afrAxesOf.loadUnit}`} at ${afrAxesOf.rpm[c.ci].toLocaleString('en-US')} RPM from ${afr[c.ri][c.ci]} to ${c.v.suggested}`;
  /** Where the target itself is also outside the band, the entry says so and names the cells:
   *  the two faults are fixed in different places. */
  const targetNote = (p) => {
    const off = offTargets(p);
    if (!off.length) return '';
    const lean = off.some((c) => c.v.lean);
    return ` The target itself is also ${lean ? 'leaner than is safe' : 'richer than makes power'} in ${off.length === 1 ? 'a cell' : `${off.length} cells`} this reads: TUNE → FUEL marks ${off.length === 1 ? 'it' : 'them'} with the number under each (${off.slice(0, 3).map(afrCellText).join(', ')}).`;
  };
  /** The ECU's injector flow rate is not the fitted injector's: its own entry, and the
   *  first thing to fix when the mixture is off. */
  const injMismatch = Math.abs(injectorCc / ecuInjectorCc - 1) > 0.05;

  // WHILE NITROUS SPRAYS the mixture is not the base tune's alone: a wet kit's jet brings
  // fuel of its own, a dry kit's rides on the injectors, and the vapour takes room the air
  // would have had. The fix is the kit's fuel, not VE or the AFR table, which are right
  // the moment the nitrous stops.
  const spraying = (p) => (p.nitrousLbMin ?? 0) > 0;
  /** Change to the injectors' fuel while spraying that brings the mixture to λ 0.80
   *  (11.8:1 on gasoline), the middle of what nitrous tuners aim for; null without an
   *  ECU record to price it from. */
  const nitrousFuelChangePct = (p) => {
    if (!(p.fuelMass > 0) || !nitrous) return null;
    const eventsPerS = derived.cyl * (p.rpm / 2) / 60;
    const kitMg = ((p.nitrousFuelLbMin ?? 0) * 453.59237 / 60 / eventsPerS) * 1000;
    // Both the dry kit's fuel and the correction are shares of the shot's fuel, at the dose
    // the controller is passing, so one number serves either field.
    const shotMg = (wetKitFuelKgS(nitrous.shotHp, fuel) * ((p.nitrousPct ?? 100) / 100) * 1e6) / eventsPerS;
    const changeMg = (p.fuelMass + kitMg) * (p.lambda / COEFF.N2O_TARGET_LAMBDA - 1);
    return Math.round((changeMg / shotMg) * 100);
  };
  /** The kit-fuel field this build tunes, its current setting and its limits. */
  const kitFuelField = () => {
    const dry = nitrous?.kit === 'dry';
    const n = ecu?.cal?.nitrous;
    return dry
      ? { label: 'Dry kit fuel', now: n?.dryFuelPct, min: 0, max: 200 }
      : { label: 'Fuel correction while spraying', now: n?.fuelTrimPct, min: -100, max: 100 };
  };
  const nitrousFuelFix = (p, dir) => {
    const pct = nitrousFuelChangePct(p);
    const field = kitFuelField();
    // The change can only go as far as the field does: a dry kit's fuel at 100% cannot be
    // lowered by 200 points. When the whole range is not enough, the kit is not the
    // problem, and saying "lower it by 200" hid that.
    const room = field.now == null ? Infinity
      : dir === 'less' ? field.now - field.min : field.max - field.now;
    const want = pct != null ? Math.abs(pct) : null;
    const verb = dir === 'less' ? 'lower' : 'raise';
    const base = 'the rest of the error is in the base fuelling, so check VE on TUNE → AIRFLOW and the injector scaling on TUNE → INJECTORS.';
    const aim = ' Nitrous tuners aim for about 11.5-12:1 (λ 0.78-0.82) on pump gas.';
    if (room <= 0) {
      return `On TUNE → NITROUS, ${field.label} is already at its ${dir === 'less' ? 'minimum' : 'maximum'} (${field.now}%), so the kit's fuel cannot fix this: ${base}${aim}`;
    }
    if (want != null && want > room) {
      return `On TUNE → NITROUS, ${verb} ${field.label} as far as it goes (${room} points, to ${dir === 'less' ? field.min : field.max}%). That alone will not reach the target: ${base}${aim}`;
    }
    return `On TUNE → NITROUS, ${verb} ${field.label}${want != null ? ` by about ${want} points` : ''}. That changes the fuel only while the nitrous flows — leave VE and the AFR table alone, they are right when it stops.${aim}`;
  };
  // The base tune can be the one off, and nitrous only makes it show: a VE table well
  // above what the engine really fills fuels for air that is not there, spraying or not.
  // Tuning the kit's fuel to hide that would leave the engine wrong the moment the
  // nitrous stops. 8 % is past what the closed-loop trim or a wideband's own error
  // explains.
  const baseVeOff = (p) => (p.ve > 0 ? p.veTable / p.ve - 1 : 0);
  const baseFuelFix = (p) => `The base fuelling is off, not the nitrous: the VE table says ${p.veTable}% here where the engine actually fills ${p.ve}%, so the ECU fuels for ${baseVeOff(p) > 0 ? 'air that is not there' : 'less air than it gets'} whether the kit sprays or not. Correct VE on TUNE → AIRFLOW first (log a pull and accept the suggestions), then re-check the mixture on the spray. Leave the nitrous fuel where it is until then.`;

  // Real knock: commanded timing past the knock limit. Without an ECU that is exactly
  // `knock`. With one, the controller can also pull timing for noise it mistook for
  // knock — that has its own entry — and borderline knock comes and goes as the
  // controller steps back and forth, so knock separated by a few hundred RPM of quiet
  // is one problem in one band, not four.
  //
  // Knock while nitrous sprays is the nitrous controller's to answer — its retard while
  // spraying — and has its own entry. Answering it here would take timing out of the base
  // table and cost the engine it the rest of the time.
  const knockRuns = ecu
    ? mergeNearbyRuns(groupRuns(points, (p) => p.margin < 0 && !spraying(p)), KNOCK_MERGE_GAP_RPM)
    : groupRuns(points, (p) => p.knock);
  /** How this build turns its boost down: a turbo's target, a supercharger's pulley. The
   *  turbo's base target is the BUILD curve; TUNE → BOOST only trims it. */
  const lessBoost = blower
    ? 'fit a larger blower pulley (a lower drive ratio) on BUILD → INDUCTION'
    : 'lower the boost target there on BUILD → INDUCTION (Boost Target Curve)';
  /**
   * Why the engine got less fuel than the table asked for, and the page that fixes it, in
   * the order a tuner checks: the injectors at their limit, the pump, the injector flow the
   * ECU is set for, then the air estimate (the VE table), which a log corrects.
   */
  // Where the grid is the limit. Correct VE from logs fits each cell to the samples around it;
  // once it has, every cell near a miss reads within half the mixture tolerance of right, and
  // what is left is the engine's VE bending between breakpoints faster than the straight line
  // the ECU reads between them.
  const veAxes = layout?.ve ?? { rpm: RPM, load: LOAD, loadUnit: 'kPa' };
  const veFit = veAxes.loadUnit === 'kPa' ? veCorrections(veSamplesFromPull(points), veAxes) : null;
  const gridBound = (p) => {
    if (!veFit) return false;
    const cells = cellsInForce(p.rpm, p.ecuLoad ?? p.sensedMap ?? p.map, veAxes).filter((c) => c.w >= IN_FORCE_WEIGHT);
    return cells.length > 0 && cells.every(({ ri, ci }) => {
      const r = veFit.ratio[ri]?.[ci];
      return r != null && Math.abs(r - 1) * 100 < MIXTURE_TOLERANCE_PCT / 2;
    });
  };
  // Cells the pull crossed too briefly for Correct VE from logs to trust (a boost rise climbs
  // through a row in one or two speeds): it leaves them as they are, so the log must not send
  // the player back to it for them.
  const thinCells = (p) => {
    if (!veFit) return [];
    const cells = cellsInForce(p.rpm, p.ecuLoad ?? p.sensedMap ?? p.map, veAxes).filter((c) => c.w >= IN_FORCE_WEIGHT);
    return cells.filter(({ ri, ci }) => veFit.ratio[ri]?.[ci] == null)
      .map(({ ri, ci }) => `the ${Math.round(veAxes.load[ri])} kPa cell at ${veAxes.rpm[ci]} RPM`);
  };
  const deliveryFix = (peak, run, deliveryLean) => {
    const lean = deliveryLean > 0;
    const pct = Math.max(1, Math.round(Math.abs(peak.afr / peak.afrCommanded - 1) * 100));
    const where = `${tableRowsAt(peak.map, layout, peak.airCharge)} around ${peak.rpm} RPM`;
    switch (missedMixCause(run, { injectorCc, ecuInjectorCc })) {
      case 'injectors': return `Fuel first: the injectors are at their limit here, so the table's mixture cannot be delivered. On BUILD → FUEL SYSTEM fit larger injectors, then set their flow on TUNE → INJECTORS.`;
      case 'pump': return `Fuel first: the pump cannot hold rail pressure at this demand. Fit a bigger pump on BUILD → FUEL SYSTEM.`;
      case 'injscale': return `Fuel first: the ECU is set for ${ecuInjectorCc} cc injectors and ${injectorCc} cc are fitted, so every pulse is ${(injectorCc / ecuInjectorCc).toFixed(2)}× what it means to give. Set the flow on TUNE → INJECTORS (its own entry in this log), then pull again before touching the tables.`;
      case 'maf': return `Fuel first: the MAF is mis-scaled for the parts fitted, so the ECU reads the air ${lean ? 'low' : 'high'}. Set the MAF scalar on TUNE → SENSORS (its own entry in this log), then pull again before touching the tables.`;
      default: {
        // A miss just under a column the pull never reaches (past the redline) is that
        // column's doing: the engine blends toward it, and a log cannot correct a cell it
        // has no samples for. A tuner carries the trend of the cells before it on by hand.
        const cols = layout?.ve?.rpm ?? RPM;
        const above = cols.find((r) => r > peak.rpm);
        const at = [...cols].reverse().find((r) => r <= peak.rpm);
        // Only where that column carries a real share of the point: on a column, or just past
        // one, the column above is not what it reads.
        const share = above != null && at != null ? (peak.rpm - at) / (above - at) : 0;
        const unlogged = above != null && above > endRpm && share >= IN_FORCE_WEIGHT;
        if (!unlogged && gridBound(peak)) {
          const below = at;
          return `The VE table already matches this pull as closely as its breakpoints allow: Correct VE from logs finds less than ${MIXTURE_TOLERANCE_PCT / 2}% to change in any cell around ${peak.rpm} RPM. This engine's air flow bends ${below != null && above != null ? `between the ${below} and ${above} RPM columns` : 'here'} faster than the straight line the ECU reads between them, so the speeds between miss (${pct}% ${lean ? 'lean' : 'rich'} at ${peak.rpm} RPM), and moving a cell by hand only moves the miss to the speed beside it. ${layout?.id === 'engine' ? 'These are already the Sized 16 × 16 breakpoints, the finest this ECU offers: this is as close as they go, within what a tuner accepts at full throttle, and it costs the score next to nothing.' : 'On TUNE, set the Table layout to Sized, 16 × 16, whose breakpoints sit closer together, then use Correct VE from logs again. A CAREER shop\'s tables keep their breakpoints: there this is as close as they go, and a job does not count it against you.'}`;
        }
        const thin = unlogged ? [] : thinCells(peak);
        // The column past the redline carries only `share` of the blend at this speed, so it
        // has to move by the miss over that share: asked for the miss itself, a player moved
        // it 4% at a time, pull after pull (an LR4 with its limiter raised took eleven).
        const colPct = unlogged ? Math.min(25, Math.max(pct, Math.round(pct / share))) : pct;
        const them = thin.length > 1 ? 'them' : 'it';
        return `Fuel first: the engine is not getting the mixture the AFR table asks for, because the ECU's air estimate is ${pct}% ${lean ? 'low' : 'high'} here, so it fuels for ${lean ? 'less' : 'more'} air than the engine takes in and it runs ${Math.abs(deliveryLean).toFixed(1)} AFR ${lean ? 'lean' : 'rich'} of the table${lean ? '' : ', costing power'}. On TUNE → AIRFLOW ${lean ? 'raise' : 'lower'} the VE cells in ${where} by about ${pct}%, or use Correct VE from logs there, which reads this pull and writes it for you.${thin.length ? ` Correct VE from logs leaves ${thin.join(' and ')} alone (this pull crossed ${them} too briefly to trust): ${lean ? 'raise' : 'lower'} ${them} by hand by about ${pct}%, or log more time there on LIVE and correct from that.` : ''}${unlogged ? ` The ${above} RPM column is past the ${endRpm} RPM redline, where a pull cannot log it, so Correct VE from logs carries it on from the column before it; if the miss stays after that: ${lean ? 'raise' : 'lower'} it by hand by about ${colPct}%, carrying on the trend of the cells before it (at ${peak.rpm} RPM the ECU reads it for only ${Math.round(share * 100)}% of the blend, so it moves by more than the miss).` : ''}`;
      }
    }
  };
  // The cells each knock reaches, read the way TUNE reads the pull (advisors.js
  // pullCellLimits): the numbers this entry gives are the numbers marked on the grid.
  const sparkCellsOf = pullSparkCells({ tables, derived, mods });
  const cellLimits = timing ? pullCellLimits(points, timing, sparkCellsOf) : new Map();
  sparkLimitsForFuel = cellLimits;
  const sparkAxesOf = (tables.layout ?? null)?.timing ?? { rpm: RPM, load: LOAD, loadUnit: 'kPa' };
  const rowLabel = (ri) => (sparkAxesOf.loadUnit === 'kPa' ? `${Math.round(sparkAxesOf.load[ri])} kPa` : `${sparkAxesOf.load[ri]} ${sparkAxesOf.loadUnit}`);
  knockRuns.forEach((run) => {
    const peak = ecu
      ? run.reduce((a, b) => (b.margin < a.margin ? b : a))
      : run.reduce((a, b) => (b.knockPull > a.knockPull ? b : a));
    const avgPull = run.reduce((s, p) => s + p.knockPull, 0) / run.length;
    const boosted = run.some((p) => p.boostPsi >= 1);
    const leanContrib = Math.max(0, peak.afr - peak.bestAfr) * 2.5;
    const causes = [];
    if (boosted) causes.push(`boost (up to ${Math.max(...run.map((p) => p.boostPsi)).toFixed(1)} psi here) eating into your margin`);
    // Which mixture is wrong. The table can ask for the wrong mixture (the target), or the
    // engine can miss what the table asks for (delivery: the ECU's air estimate, the
    // injectors, the pump).
    const deliveryLean = peak.afr - peak.afrCommanded;
    const byDelivery = leanContrib >= 1.5 && deliveryLean > 0.3;
    if (byDelivery) causes.push(`the mixture running ${peak.afr.toFixed(1)}:1 where the AFR table asks for ${peak.afrCommanded.toFixed(1)}:1 (best power is ${peak.bestAfr.toFixed(1)}:1): the engine is getting less fuel than the table asks for`);
    else if (leanContrib >= 1.5) causes.push(`the mixture running leaner than the ${peak.bestAfr.toFixed(1)}:1 best-power target here (peak ${peak.afr.toFixed(1)}:1)${peak.fuelLimited ? ', partly from injectors maxing out' : ''}`);
    if (causes.length === 0) causes.push(`the commanded timing itself being too aggressive for ${octaneLabel} octane and this compression ratio at this load`);
    // Every cell the knocking points read, with the number TUNE marks under it; a cell already at
    // its number is done (its neighbours carry the rest), as TUNE leaves it unmarked.
    const knocked = new Map();
    for (const p of run) {
      if (!(p.margin < 0 || p.knock)) continue;
      for (const c of sparkCellsOf(p)) {
        const L = cellLimits.get(`${c.ri}|${c.ci}`);
        if (c.w < IN_FORCE_WEIGHT || !L || !(L.knockBy > 0) || !Number.isFinite(L.limit)) continue;
        const now = timing[c.ri][c.ci]; const want = sparkForLimit(L.limit);
        const cannot = L.limit - KNOCK_SAFETY_DEG < SPARK_MIN_DEG;
        if (cannot || now - want > 0.5) knocked.set(`${c.ri}|${c.ci}`, { ri: c.ri, ci: c.ci, now, want, cannot, atTable: L.worst?.thresholdAtTable != null && L.worst.thresholdAtTable < L.worst.threshold });
      }
    }
    const listed = [...knocked.values()].sort((a, b) => (b.now - b.want) - (a.now - a.want));
    const fixable = listed.filter((c) => !c.cannot);
    const unfixable = listed.filter((c) => c.cannot);
    const cellText = (c) => `${rowLabel(c.ri)} at ${sparkAxesOf.rpm[c.ci].toLocaleString('en-US')} RPM`;
    const sparkCanFix = !unfixable.length;
    // The targets TUNE marks lean in the cells the knock reads (a direct-injected engine's
    // stoichiometric target stands where spark can answer the knock, as TUNE judges it).
    const leanTargets = leanContrib >= 1.5 ? offTargets(peak).filter((c) => c.v.lean) : [];
    const targetWrong = leanTargets.length > 0;
    const sparkLine = [
      fixable.length
        ? `On TUNE → SPARK, lower the ${fixable.length === 1 ? 'cell' : `${fixable.length} cells`} marked past the knock limit to the number under each: ${fixable.slice(0, 4).map((c) => `${cellText(c)} from ${c.now}° to ${c.want}°`).join(', ')}${fixable.length > 4 ? `, and ${fixable.length - 4} more` : ''}. Each is ${KNOCK_SAFETY_DEG}° under the knock limit this pull measured where that cell is in force${fixable.some((c) => c.atTable) ? ', at the mixture the AFR table asks for: once the fuel hits it, the engine knocks sooner than it did on this pull' : ''}. Set them all, then pull again.`
        : null,
      unfixable.length
        ? `Timing alone can't fix this at ${unfixable.slice(0, 2).map(cellText).join(' and ')}${unfixable.length > 2 ? ` and ${unfixable.length - 2} more` : ''}: it knocks there even at ${SPARK_MIN_DEG}°, the most retard the SPARK table holds.`
        : null,
      !listed.length ? `On TUNE → SPARK, the cells around ${peak.rpm} RPM are already at the numbers marked under them: pull again to check.` : null,
    ].filter(Boolean).join(' ');
    const levers = ['higher-octane fuel', 'lower compression', ...(boosted && !mods.intercooler ? ['an intercooler'] : []),
      ...(derived.injection !== 'direct' ? ['direct injection'] : []), ...(derived.chamberOffsetK > 0 ? ['an aluminum head'] : [])];
    const buildLevers = `${levers.slice(0, -1).join(', ')} or ${levers.at(-1)}`;
    const impact = Math.max(5, Math.round((10 + avgPull * 7) * (0.3 + 0.7 * rangeFrac(run))));
    events.push({
      type: 'knock', severity: 3, impact,
      rpmStart: run[0].rpm, rpmEnd: run[run.length - 1].rpm,
      // Past the limit before the controller has pulled anything: say so, not "pulled 0.0°".
      msg: `Knock across ${rangeLabel(run)}${/** @type {any} */ (run).intermittent ? ' (on and off)' : ''} — ${Math.max(...run.map((p) => p.knockPull)) >= 0.05
        ? `ECU pulled up to ${Math.max(...run.map((p) => p.knockPull)).toFixed(1)}°`
        : `up to ${Math.max(...run.map((p) => -(p.margin ?? 0))).toFixed(1)}° past the knock limit, before the knock control pulled any timing`} (peak near ${peak.rpm} RPM)`,
      cause: `Caused by ${causes.join(' and ')}. This spans ${Math.round(rangeFrac(run) * 100)}% of the RPM sweep${avgPull >= 2 ? `, averaging ${avgPull.toFixed(1)}° of retard — a common tuner's rule of thumb treats anything sustained above about 2° as a warning of expensive engine damage, not an acceptable operating point` : ''}.`,
      // In the order a tuner works: mixture first (the knock limit moves with it), then
      // timing, then boost, then hardware.
      fix: [
        byDelivery ? deliveryFix(peak, run, deliveryLean) : null,
        targetWrong
          ? `${byDelivery ? 'Then, o' : 'O'}n TUNE → FUEL, richen the AFR target${leanTargets.length === 1 ? '' : 's'} marked there to the number under each: ${leanTargets.slice(0, 3).map(afrCellText).join(', ')}${leanTargets.length > 3 ? `, and ${leanTargets.length - 3} more` : ''} (λ ${(leanTargets[0].v.suggested / 14.7).toFixed(2)}). A richer charge runs cooler and raises the knock limit.`
          : null,
        sparkLine,
        boosted ? `${sparkCanFix ? 'Or' : 'Instead,'} ${lessBoost}.` : null,
        `Hardware that raises the knock limit: ${buildLevers} (BUILD).`,
      ].filter(Boolean).join(' '),
    });
  });

  // Spark left on the table is not in this log: it lists problems, and a safe tune short of its
  // best power is the player's to take further. TUNE shows the room a pull measured in each
  // cell it ran (advisors.js judgeAgainstPull, its power hints), from the same reading as the
  // knock entry above.

  // Mechanical overload, reported separately from knock because it is a separate
  // failure and — crucially — because the levers that fix it are different ones. Every
  // other cylinder-pressure event in this log can be answered with octane; this one
  // cannot, and saying so is the entire teaching value of the event.
  groupRuns(points, (p) => p.pressureRisk).forEach((run) => {
    const peak = run.reduce((a, b) => (b.peakPressure > a.peakPressure ? b : a));
    const over = peak.peakPressure - COEFF.PEAK_PRESSURE_LIMIT_BAR;
    const impact = Math.round(clamp(10 + over * 0.7, 10, 34) * (0.35 + 0.65 * rangeFrac(run)));
    events.push({
      type: 'pressure', severity: 3, impact,
      rpmStart: run[0].rpm, rpmEnd: run[run.length - 1].rpm,
      msg: `Peak cylinder pressure past what the bottom end takes across ${rangeLabel(run)} — up to ${peak.peakPressure.toFixed(0)} bar near ${peak.rpm} RPM`,
      cause: `${derived.compression.toFixed(1)}:1 static compression multiplies whatever the manifold sends it, and it is being sent ${Math.round(peak.map)} kPa at ${peak.ve.toFixed(0)}% VE${peak.boostPsi >= 1 ? ` (${peak.boostPsi.toFixed(1)} psi of boost)` : ''}${spraying(peak) ? `, with a ${nitrous.shotHp} shot of nitrous adding the oxygen for about ${Math.round(peak.nitrousLbMin * N2O_AIR_EQUIV)} lb/min more air on top` : ''} — about ${peak.peakPressure.toFixed(0)} bar at the top of the stroke, against roughly ${COEFF.PEAK_PRESSURE_LIMIT_BAR} bar for stock cast pistons and production rods. This is not detonation: the mixture is burning normally and the ECU has nothing to detect. It is simply more force than the parts are built to pass, on every firing stroke, for ${Math.round(rangeFrac(run) * 100)}% of the sweep.`,
      fix: `Take cylinder pressure out: ${peak.boostPsi >= 1 ? `${blower ? 'fit a larger blower pulley on BUILD → INDUCTION' : 'lower the boost target on BUILD → INDUCTION'}, ` : ''}${spraying(peak) ? 'run a smaller shot or start it later on TUNE → NITROUS, ' : ''}or lower static compression on BUILD → SHORT BLOCK. Less timing also lowers peak pressure, at a cost in power. More octane will NOT help: it raises the knock limit, not what the pistons and rods can carry. Forged or race pistons and rods (BUILD → SHORT BLOCK) carry more.`,
    });
  });

  groupRuns(points, (p) => p.fuelLimited).forEach((run) => {
    const peak = run.reduce((a, b) => (b.duty > a.duty ? b : a));
    const impact = Math.max(4, Math.round(10 * (0.3 + 0.7 * rangeFrac(run))));
    events.push({
      type: 'fuel', severity: 2, impact,
      rpmStart: run[0].rpm, rpmEnd: run[run.length - 1].rpm,
      msg: `Injectors maxed across ${rangeLabel(run)} (up to ${peak.duty}% duty) — mixture leaned to ${peak.afr.toFixed(1)}:1`,
      cause: `Required pulse width (${peak.pw} ms) exceeds 90% of the ${(120000 / peak.rpm).toFixed(1)} ms available per engine cycle at ${peak.rpm} RPM, so the ${injectorLabel} injectors physically cannot deliver the commanded fuel.${fuel.stoich < 12 ? ` ${octaneLabel} needs roughly ${(14.7 / fuel.stoich).toFixed(2)}× the fuel volume of gasoline at the same lambda — a big part of why you ran out here.` : ''}`,
      fix: `On BUILD → FUEL SYSTEM, fit larger injectors — size them to run about 80–85% duty at peak — then enter their flow rate on TUNE → INJECTORS. Or ${turboOn || blower ? `${blower ? 'fit a larger blower pulley' : 'lower the boost target'} in this range on BUILD → INDUCTION` : 'lower the rev limit'} so demand fits the injectors you have.${fuel.stoich < 12 ? ` ${octaneLabel} needs about ${(14.7 / fuel.stoich).toFixed(1)}× gasoline's fuel volume; gasoline would fit these injectors, but gives up knock margin.` : ''}`,
    });
  });

  groupRuns(points, (p) => p.leanRisk && !p.valveRisk).forEach((run) => {
    const peak = run.reduce((a, b) => (b.afr > a.afr ? b : a));
    const impact = Math.max(4, Math.round(10 * (0.3 + 0.7 * rangeFrac(run))));
    events.push({
      type: 'lean', severity: 2, impact,
      rpmStart: run[0].rpm, rpmEnd: run[run.length - 1].rpm,
      msg: `Lean mixture (up to ${peak.afr.toFixed(1)}:1) across ${rangeLabel(run)} under load`,
      cause: peak.fuelLimited
        ? `This is the injector-duty limit above showing up as heat risk, not a bad AFR table entry.`
        : spraying(peak)
          ? `This is while the nitrous sprays: it brings oxygen worth about 1.6 times its weight in air, and ${nitrous?.kit === 'dry' ? 'a dry kit relies on the ECU to add the fuel for it through the injectors — too little arrived' : 'the wet kit\'s fuel jet did not bring enough to match it'}. Lean on nitrous is how pistons melt.`
          : peak.afrCommanded <= COEFF.LEAN_DAMAGE_AFR
          ? `The AFR table asked for ${peak.afrCommanded.toFixed(1)}:1 here, but the engine got ${peak.afr.toFixed(1)}:1: the fuelling is not delivering what the table asks for.${targetNote(peak)}`
          : `The AFR target itself (${peak.afrCommanded.toFixed(1)}:1) is set leaner than is safe for ${Math.round(peak.map)} kPa in the manifold.${missedTarget(peak) ? ` And the engine got even leaner than that, ${peak.afr.toFixed(1)}:1.` : ''}`,
      fix: peak.fuelLimited
        ? `Upgrade injectors on BUILD → FUEL SYSTEM (and set TUNE → INJECTORS to match), or lower VE/boost so demand fits within current capacity.`
        : spraying(peak)
          ? baseVeOff(peak) < -0.08 ? baseFuelFix(peak) : nitrousFuelFix(peak, 'more')
          : peak.afrCommanded <= COEFF.LEAN_DAMAGE_AFR
          ? `Fuel delivery isn't hitting the target, so don't ask for a richer number to make up for it. Correct the VE table in this range on TUNE → AIRFLOW (log a pull and accept the suggested cells), then check the injector flow rate on TUNE → INJECTORS and the MAF and sensor scaling on TUNE → SENSORS match the parts on BUILD.`
          : `On TUNE → FUEL, richen the AFR target in these cells to about ${peak.bestAfr.toFixed(1)}:1 (λ ${(peak.bestAfr / 14.7).toFixed(2)})${peak.boostPsi > 1 ? ' — richer than the NA best-power mixture, because boost needs the charge cooling' : ''}.${missedTarget(peak) ? ' Then correct the VE table there on TUNE → AIRFLOW, so the engine gets what the target asks for.' : ''}`,
    });
  });

  // Missed the target. The engine not getting the mixture its AFR table asks for, at full
  // load, by more than a wideband's and a tuner's tolerance: the table is not the fault, the
  // fuelling is (the air estimate, the injectors, the pump).
  for (const lean of [true, false]) {
    groupRuns(points, (p) => p.map >= 85 && !spraying(p) && !p.leanRisk && !p.richRisk && !p.valveRisk
      && missesTarget(p) && (lean ? p.afr > p.afrCommanded : p.afr < p.afrCommanded)).forEach((run) => {
      // Only where the air estimate is the cause: a mis-scaled MAF, a mis-set injector, maxed
      // injectors or a starved rail each has its own entry in this log already.
      if (missedMixCause(run, { injectorCc, ecuInjectorCc }) !== 've') return;
      const peak = run.reduce((a, b) => (Math.abs(b.afr - b.afrCommanded) > Math.abs(a.afr - a.afrCommanded) ? b : a));
      const miss = peak.afr - peak.afrCommanded;
      // Grid-bound: as well tuned as these breakpoints can be, so it costs the score little.
      const grid = gridBound(peak);
      events.push({
        type: 'missedmix', severity: Math.abs(miss / peak.afrCommanded) > 0.06 ? 2 : 1,
        impact: grid ? 1 : Math.max(2, Math.round((Math.abs(miss / peak.afrCommanded) > 0.06 ? 8 : 4) * (0.3 + 0.7 * rangeFrac(run)))),
        rpmStart: run[0].rpm, rpmEnd: run[run.length - 1].rpm,
        ...(grid ? { gridBound: true } : {}),
        msg: `Mixture ${lean ? 'leaner' : 'richer'} than the AFR table asks for across ${rangeLabel(run)}: ${peak.afr.toFixed(1)}:1 where it asks for ${peak.afrCommanded.toFixed(1)}:1`,
        cause: `The AFR table asks for ${peak.afrCommanded.toFixed(1)}:1 at ${peak.rpm} RPM and ${Math.round(peak.map)} kPa and the engine got ${peak.afr.toFixed(1)}:1. What reaches the cylinder is not what the ECU meant to give it, so the fuelling is what to fix.${targetNote(peak)} ${lean ? 'Lean under load runs hotter and knocks sooner.' : 'Rich past best power costs torque and washes the bores.'}`,
        fix: deliveryFix(peak, run, miss).replace(/^Fuel first: (.)/, (m, c) => c.toUpperCase()),
      });
    });
  }

  groupRuns(points, (p) => p.valveRisk).forEach((run) => {
    const peak = run.reduce((a, b) => (b.afr > a.afr ? b : a));
    const overage = Math.min(1, Math.max(0, peak.afr - 15.2) / 6);
    const impact = Math.max(6, Math.round(18 * (0.25 + 0.75 * rangeFrac(run)) * (0.4 + 0.6 * overage)));
    events.push({
      type: 'valve', severity: 3, impact,
      rpmStart: run[0].rpm, rpmEnd: run[run.length - 1].rpm,
      msg: `Lean-under-boost across ${rangeLabel(run)} (up to ${peak.afr.toFixed(1)}:1 at ${peak.boostPsi.toFixed(1)} psi) — elevated EGT, valve risk`,
      cause: `Boost raises cylinder pressure and heat at the same time the mixture goes lean — that combination burns exhaust valves over repeated pulls, separately from detonation. This spans ${Math.round(rangeFrac(run) * 100)}% of the sweep.`,
      // The target only where the target is the fault: an engine that misses a right target is
      // fixed in its fuelling, never by asking a richer number to make up for it.
      fix: peak.fuelLimited
        ? `On BUILD → FUEL SYSTEM, fit larger injectors (and set TUNE → INJECTORS to match), or lower the boost in this range on BUILD → INDUCTION so demand fits the injectors you have.`
        : missedTarget(peak)
          ? `${deliveryFix(peak, run, peak.afr - peak.afrCommanded)}${targetNote(peak)}`
          : `The engine is getting the mixture its table asks for, so the target is too lean for this boost.${targetNote(peak) || ` On TUNE → FUEL, richen the boost AFR target in this range to about ${bestPowerAfr(peak.boostPsi).toFixed(1)}:1 on gasoline's scale: it asks for ${peak.afrCommanded.toFixed(1)}:1.`}${!mods.intercooler && peak.boostPsi > 3 ? ' An intercooler on BUILD → INDUCTION also takes heat out of the charge.' : ''}`,
    });
  });

  // Rich enough to harm the engine, or, while the nitrous sprays, richer than a wet kit's
  // working mixture: about 11.5:1 is where the spray is held (the EGT entry says so), so past
  // 11:1 (λ 0.75) the spray's own fuel is the player's to take out on TUNE → NITROUS.
  const sprayRich = (p) => spraying(p) && p.lambda < SPRAY_RICHEST_LAMBDA && !(p.protect ?? []).includes('egt');
  groupRuns(points, (p) => p.richRisk || sprayRich(p)).forEach((run) => {
    const peak = run.reduce((a, b) => (b.lambda < a.lambda ? b : a));
    const danger = run.some((p) => p.richRisk);
    const sev = clamp((COEFF.RICH_DAMAGE_LAMBDA - peak.lambda) / 0.35, 0, 1);
    const impact = danger ? Math.max(6, Math.round((12 + sev * 26) * (0.35 + 0.65 * rangeFrac(run))))
      : Math.max(2, Math.round(4 * (0.3 + 0.7 * rangeFrac(run))));
    events.push({
      type: 'rich', severity: danger ? 3 : 1, impact,
      rpmStart: run[0].rpm, rpmEnd: run[run.length - 1].rpm,
      msg: danger
        ? `Dangerously rich across ${rangeLabel(run)} — down to lambda ${peak.lambda.toFixed(2)} (${peak.afr.toFixed(1)}:1)`
        : `Richer than the spray needs across ${rangeLabel(run)} — down to ${peak.afr.toFixed(1)}:1 while the nitrous sprays, where about 11.5:1 makes the power`,
      cause: spraying(peak) && baseVeOff(peak) > 0.08
        ? `This is while the nitrous sprays, but most of the extra fuel is the base tune's: the VE table here reads ${Math.round(baseVeOff(peak) * 100)}% more air than the engine really gets, and a speed-density ECU fuels for the air the table says. The nitrous's own fuel comes on top of that.`
        : spraying(peak)
        ? `This is while the nitrous sprays, and the extra fuel is the nitrous's, not the base tune's. ${nitrous?.kit === 'dry' ? 'The injectors carry the dry kit\'s fuel on top of the fuel for the air' : 'The wet kit\'s own jet adds fuel, jetted rich on purpose, on top of the injectors'} — and the nitrous vapour takes up room the air would have had. A speed-density ECU works out air from MAP and the VE table, so it cannot see that and keeps fuelling for air that is not there. Past about 11:1 the extra fuel washes the cylinder walls, fouls plugs and costs power.`
        : `Far more fuel is being delivered than the available air can burn. Raw fuel washes the oil film off the cylinder walls, fouls plugs, and passes into the exhaust. It also costs a lot of power — the mixture is well past the point where extra fuel helps.`,
      fix: spraying(peak) && baseVeOff(peak) > 0.08 ? baseFuelFix(peak)
        : spraying(peak) ? nitrousFuelFix(peak, 'less') : peak.afrCommanded / 14.7 >= COEFF.RICH_DAMAGE_LAMBDA
        ? `The AFR target asked for ${peak.afrCommanded.toFixed(1)}:1 and the engine got ${peak.afr.toFixed(1)}:1, so the fuelling is off.${targetNote(peak)} ${injMismatch ? `Fix the injector flow rate on TUNE → INJECTORS first (its own entry in this log) — it alone makes every pulse ${(injectorCc / ecuInjectorCc).toFixed(1)}× too big. Then correct` : 'Correct'} the VE table on TUNE → AIRFLOW, and check the MAF scalar on TUNE → SENSORS matches the parts on BUILD.`
        : `The AFR target itself asks for this much fuel. On TUNE → FUEL, lean the target in these cells back to about ${peak.bestAfr.toFixed(1)}:1 (λ ${(peak.bestAfr / 14.7).toFixed(2)}).${missedTarget(peak) ? ' Then check the VE table on TUNE → AIRFLOW and the injector flow rate on TUNE → INJECTORS, because the engine is getting even more than the target.' : ''}`,
    });
  });

  groupRuns(points, (p) => p.mafFlag).forEach((run) => {
    const avgTrim = run.reduce((s, p) => s + p.trimPct, 0) / run.length;
    // `trimPct` is the MAF reading's error: below zero the MAF under-reads the air, the
    // ECU fuels for less air than there is, and the engine runs LEAN (point.js divides
    // the commanded lambda by this factor). This was once the other way round, and the
    // log told a player with a lean cold-air intake to expect a rich one.
    const direction = avgTrim < 0 ? 'lean' : 'rich';
    const source = mods.intake && turboOn ? 'the bigger intake and turbo plumbing'
      : mods.intake ? 'the bigger intake' : 'the turbo plumbing';
    const impact = Math.round(8 * (0.3 + 0.7 * rangeFrac(run)));
    events.push({
      type: 'maf', severity: 1, impact,
      rpmStart: run[0].rpm, rpmEnd: run[run.length - 1].rpm,
      msg: `MAF reading about ${Math.abs(avgTrim).toFixed(0)}% ${avgTrim < 0 ? 'low' : 'high'} across ${rangeLabel(run)} — running ${direction}`,
      cause: `${source.charAt(0).toUpperCase() + source.slice(1)} changed how much air reads across the MAF sensor at a given flow rate, and the ECU has not been rescaled for it. It sees ${avgTrim < 0 ? 'less' : 'more'} air than the engine really takes in, so it fuels ${avgTrim < 0 ? 'too little' : 'too much'}.`,
      fix: `On TUNE → SENSORS, ${avgTrim < 0 ? 'raise' : 'lower'} the MAF scalar from ${mafScalar.toFixed(2)} to about ${(mafScalar * 100 / (100 + avgTrim)).toFixed(2)}, which cancels this. Re-pull and check the actual AFR trace sits on the commanded one.`,
    });
  });

  // Backpressure: a turbine too small for the engine's exhaust.
  if (turboOn && loadKpa >= 95) {
    groupRuns(points, (p) => p.rpm >= 3000 && p.emp != null && p.map > 0
      && p.emp / p.map >= BACKPRESSURE_RATIO_LIMIT).forEach((run) => {
      if (run.length < 3) return;
      const worst = run.reduce((a, b) => (b.emp / b.map > a.emp / a.map ? b : a));
      const ratio = worst.emp / worst.map;
      events.push({
        type: 'backpressure', severity: 2,
        impact: Math.round(clamp(6 + (ratio - BACKPRESSURE_RATIO_LIMIT) * 12, 6, 24) * (0.4 + 0.6 * rangeFrac(run))),
        rpmStart: run[0].rpm, rpmEnd: run[run.length - 1].rpm,
        msg: `The turbine is choking the engine across ${rangeLabel(run)}: ${Math.round(worst.emp)} kPa of exhaust pressure ahead of it against ${Math.round(worst.map)} kPa in the intake at ${worst.rpm} RPM`,
        cause: `All of the engine's exhaust has to get through the turbine, and a turbine this size for this much engine needs ${ratio.toFixed(1)} times the intake's pressure to push it through. Each cylinder pumps against that on its exhaust stroke, and while both valves are open the exhaust pushes back into the cylinder, so it fills with less fresh air. Boost falls away and the engine can make less power than it did without the turbo.`,
        fix: 'On BUILD → INDUCTION, fit a larger turbine housing or twin turbos, so the exhaust passes at a pressure near the intake\'s. A larger exhaust pipe helps a little. Asking for more boost from this turbine makes it worse.',
      });
    });
  }

  // UNDERBOOST: the turbo cannot make what is asked of it. Below 4000 RPM a shortfall is
  // spool, which every turbo has and the boost curve should already allow for; above it,
  // with the exhaust flowing hard, a turbo that still falls short is too small (its
  // compressor runs out of flow, or its turbine chokes and cannot drive it). Nothing
  // logged this before: asking a small turbo for 12 psi quietly made 5, and more boost
  // on the same hardware looked like it made less power.
  if (turboOn) {
    groupRuns(points, (p) => p.rpm >= 4000 && p.boostTarget != null
      && p.boostTarget - p.boostPsi > Math.max(1.5, p.boostTarget * 0.15)).forEach((run) => {
      const worst = run.reduce((a, b) => ((b.boostTarget - b.boostPsi) > (a.boostTarget - a.boostPsi) ? b : a));
      const impact = Math.round(10 * (0.3 + 0.7 * rangeFrac(run)));
      events.push({
        type: 'underboost', severity: 2, impact,
        rpmStart: run[0].rpm, rpmEnd: run[run.length - 1].rpm,
        msg: `Boost falls short of target across ${rangeLabel(run)} (${worst.boostPsi.toFixed(1)} of ${worst.boostTarget.toFixed(1)} psi at ${worst.rpm} RPM)`,
        cause: `The turbo cannot make this much boost here. With the wastegate shut, boost settles where the turbine's power meets what the compressor needs: a compressor too small runs out of flow, and a turbine too small chokes the exhaust and cannot drive it. Asking for more does not help — it only makes the target further away.`,
        fix: `On BUILD → INDUCTION, fit a larger compressor, a larger turbine or twin turbos — the airflow line under the Turbos picker shows what this engine needs against what the turbo flows. Or lower the boost target up top to what this turbo holds (about ${worst.boostPsi.toFixed(0)} psi at ${worst.rpm} RPM).`,
      });
    });
  }

  // Manifold pressure past the top of the tables.
  const kpaAxes = [layout?.ve, layout?.timing, layout?.afr].filter((a) => a && a.loadUnit === 'kPa');
  const topKpa = layout ? (kpaAxes.length ? Math.min(...kpaAxes.map((a) => a.load[0])) : Infinity) : LOAD[0];
  // Above atmospheric only: a naturally aspirated engine at full throttle reaches the
  // barometer less what the intake and the throttle lose, which can sit a kPa over a table
  // topped at 100. That is the full-throttle row, not boost nobody has tuned.
  const pastKpa = Math.max(topKpa, (ecu?.cond?.env?.baroKpa ?? BARO_KPA)) + 0.5;
  groupRuns(points, (p) => p.map > pastKpa).forEach((run) => {
    const peak = run.reduce((a, b) => (b.map > a.map ? b : a));
    events.push({
      type: 'pastTable', severity: 3, impact: Math.round(clamp((peak.map - topKpa) / 4, 6, 30)),
      rpmStart: run[0].rpm, rpmEnd: run[run.length - 1].rpm,
      msg: `Boost past the top of the tables across ${rangeLabel(run)}: up to ${peak.map} kPa, and the tables stop at ${topKpa} kPa`,
      cause: `An ECU does not guess past its last load breakpoint: above ${topKpa} kPa it reads the ${topKpa} kPa row, so every psi of boost here is fuelled and timed as if it were full throttle without it. That row was written for no boost: its timing is too far advanced for the denser, hotter charge and its fuel target too lean for it. Nobody has tuned these cells yet.`,
      fix: `On TUNE → SPARK, press Extend the axes to this engine (above the table; it extends all three tables), then tune the new boost rows: on TUNE → FUEL, the best-power target for ${peak.boostPsi.toFixed(0)} psi is about ${bestPowerAfr(peak.boostPsi).toFixed(1)}:1 on gasoline; on TUNE → SPARK, start well below the ${topKpa} kPa row and add timing from the log. The new rows start as a copy of the ${topKpa} kPa row, marked Not tuned, which is exactly what the ECU reads there now.`,
    });
  });

  groupRuns(points, (p) => p.compressorOver).forEach((run) => {
    const peak = run.reduce((a, b) => (b.boostPsi > a.boostPsi ? b : a));
    const impact = Math.round(10 * (0.3 + 0.7 * rangeFrac(run)));
    events.push({
      type: 'compressor', severity: 2, impact,
      rpmStart: run[0].rpm, rpmEnd: run[run.length - 1].rpm,
      msg: `Compressor pushed past its efficient range across ${rangeLabel(run)} (target up to ${peak.boostPsi.toFixed(1)} psi)`,
      cause: `This compressor's practical ceiling is lower than the boost you're asking for here — beyond it, the compressor is working outside its efficient map. That air leaves hotter, less dense and more knock-prone, so this pull's charge temperature already carries the cost.`,
      fix: `On BUILD → INDUCTION, keep the boost target at or under this compressor's ~${compressor?.boostCeiling ?? peak.boostPsi} psi ceiling in this range, or fit a larger compressor.`,
    });
  });

  // A supercharger turns at a fixed multiple of the crank, so its speed limit is the
  // pulley and the redline together. Past its rating the rotors or impeller and their
  // bearings are outside what they were built for, and the belt is the next thing to go.
  groupRuns(points, (p) => p.blowerOverspeed).forEach((run) => {
    const peak = run.reduce((a, b) => (b.blowerRpm > a.blowerRpm ? b : a));
    const rated = blower.maxRpm ?? blower.maxImpellerRpm;
    const impact = Math.round(10 * (0.4 + 0.6 * rangeFrac(run)));
    // Rounded DOWN: a ratio rounded up to two places can land back over the rating.
    const safeRatio = (Math.floor((rated / (peak.rpm * (blower.stepUp ?? 1))) * 100) / 100).toFixed(2);
    events.push({
      type: 'blower', severity: 3, impact,
      rpmStart: run[0].rpm, rpmEnd: run[run.length - 1].rpm,
      msg: `Supercharger over its rated speed across ${rangeLabel(run)} (${peak.blowerRpm.toLocaleString('en-US')} rpm, rated ${rated.toLocaleString('en-US')})`,
      cause: `A supercharger is geared to the crank: at ${peak.rpm} RPM the ${blowerRatio.toFixed(2)}:1 pulley${blower.stepUp ? ` and its ${blower.stepUp}:1 internal step-up` : ''} spin the ${blower.label} past what its ${blower.type === 'centrifugal' ? 'impeller and gears' : 'rotors and bearings'} are rated for. Nothing makes more boost for free up there: it is wear, heat and a thrown belt waiting to happen.`,
      fix: `On BUILD → INDUCTION, fit a larger blower pulley (a lower drive ratio — about ${safeRatio}:1 keeps it inside its rating at this RPM), or lower the rev limiter on TUNE → PROTECT.`,
    });
  });

  const injRatio = injectorCc / ecuInjectorCc;
  if (Math.abs(injRatio - 1) > 0.05) {
    const richLean = injRatio > 1 ? 'rich' : 'lean';
    events.push({
      type: 'injscale', severity: 3, impact: Math.round(clamp(14 + Math.abs(injRatio - 1) * 22, 14, 40)),
      msg: `Injector scaling mismatch — ECU is calibrated for ${ecuInjectorCc}cc but ${injectorCc}cc are fitted`,
      cause: `The ECU calculates pulse width for a ${ecuInjectorCc}cc injector. With ${injectorCc}cc actually fitted, every pulse delivers about ${(injRatio * 100).toFixed(0)}% of the intended fuel, so the whole tune runs ${richLean} no matter what your AFR table asks for.`,
      fix: `On TUNE → INJECTORS, set the injector flow rate (scaling) to ${injectorCc} cc/min to match what is fitted. Every tuning suite has this constant — HP Tuners calls it injector flow rate, UpRev the K-fuel multiplier — and it changes whenever the injectors do. Fix this before anything else fuel-related.`,
    });
  }

  // Valve float is a hard mechanical limit — the springs cannot close the valves fast
  // enough, so cylinder filling collapses. No calibration change touches this.
  const floatRpm = derived.floatRpm || 99999;
  if (floatRpm < reachedRpm) {
    const lost = points.filter((p) => p.rpm > floatRpm);
    events.push({
      type: 'float', severity: 3, impact: Math.round(clamp((reachedRpm - floatRpm) / 45, 8, 34)),
      rpmStart: Math.round(floatRpm), rpmEnd: reachedRpm,
      msg: `Valve float above ${Math.round(floatRpm)} RPM — cylinder filling collapsing over the last ${lost.length * SWEEP_STEP_RPM} RPM of the pull`,
      cause: `The camshaft opens the valves but only the springs close them. Above ${Math.round(floatRpm)} RPM the valves stop following the lobe, so the cylinder cannot fill and power falls off a cliff instead of tapering. A ${derived.camDuration}° cam opens further and faster, which is exactly why it demands stiffer springs than stock.`,
      fix: `On BUILD → HEADS AND CAM, raise the valve spring rate until float sits above your ${endRpm} RPM redline, or fit a milder cam. Or keep the engine under it: set the rev limiter below ${Math.round(floatRpm)} RPM on TUNE → PROTECT. No table change fixes valve float.`,
    });
  }

  // The bottom end past what it is built for: mean piston speed over its rating
  // (bottomEnd.js). A pull's few seconds up there cost no power, which is exactly why it
  // has to be said; held there on LIVE, it wears the bearings out (damage.js liveWear).
  const bottomEnd = derived.bottomEnd;
  if (bottomEnd && reachedRpm > bottomEnd.ratedRpm) {
    const peakMs = 2 * (derived.stroke / 1000) * (reachedRpm / 60);
    const factory = bottomEnd.id === 'factory';
    events.push({
      type: 'bottomEnd', severity: 3, impact: Math.round(clamp((reachedRpm - bottomEnd.ratedRpm) / 60, 6, 30)),
      rpmStart: bottomEnd.ratedRpm, rpmEnd: reachedRpm,
      msg: `Pistons and rods past their rating above ${bottomEnd.ratedRpm.toLocaleString('en-US')} RPM (${peakMs.toFixed(1)} m/s mean piston speed, rated ${bottomEnd.limitMs.toFixed(1)})`,
      cause: factory
        ? `This engine's factory pistons and rods are rated to its own ${bottomEnd.ratedRpm.toLocaleString('en-US')} RPM limiter, ${bottomEnd.limitMs.toFixed(1)} m/s on its ${derived.stroke} mm stroke. The inertia load on each rod grows with the square of engine speed, so ${reachedRpm.toLocaleString('en-US')} RPM loads them ${Math.round(100 * ((reachedRpm / bottomEnd.ratedRpm) ** 2 - 1))}% harder than the maker ever validated. A pull's few seconds up there show as power, not damage; held there on LIVE, the rod bearings wear out, and a worn-out bearing is how the rod lets go.`
        : `${bottomEnd.label} are good for about ${bottomEnd.limitMs} m/s of mean piston speed, which this ${derived.stroke} mm stroke reaches at ${bottomEnd.ratedRpm.toLocaleString('en-US')} RPM. Rod inertia load grows with the square of engine speed: at ${reachedRpm.toLocaleString('en-US')} RPM it is ${Math.round(100 * ((reachedRpm / bottomEnd.ratedRpm) ** 2 - 1))}% past what these parts are built for. Production engines run about 16-21 m/s; 25 is NASCAR and Formula One. A pull's few seconds up there show as power, not damage; held there on LIVE, the rod bearings wear out until one spins.`,
      fix: `Keep the limiter at or below ${bottomEnd.ratedRpm.toLocaleString('en-US')} RPM on TUNE → PROTECT, or ${factory ? 'build the bottom end for the speed: forged pistons and rods' : 'fit stronger pistons and rods on BUILD → SHORT BLOCK'}, or a shorter stroke.`,
    });
  }

  // A big cam's real cost is rarely peak-power knock — it is everything below the
  // power band: reversion, lost vacuum, lumpy idle, and a much narrower usable range.
  // This is a HARDWARE trade-off, not a calibration fault, so it is flagged as an
  // advisory rather than something the player can tune away.
  const overlap = derived.overlapDeg || 0;
  if (overlap > 10) {
    const lowTq = points.find((p) => p.rpm === 2500)?.torque ?? 0;
    const peakTqPt = points.reduce((a, b) => (b.torque > a.torque ? b : a));
    events.push({
      type: 'cam', severity: 1, impact: Math.round(clamp(overlap * 0.35, 4, 14)),
      msg: `Large camshaft (${derived.camDuration}°, ${overlap.toFixed(0)}° overlap) — powerband moved up, low end given away`,
      cause: `At ${overlap.toFixed(0)}° of overlap both valves are open together long enough that at low RPM exhaust pushes back into the intake (reversion) and fresh charge escapes out the exhaust. Torque at 2500 RPM is down to ${lowTq} lb-ft while peak torque has moved to ${peakTqPt.rpm} RPM. Expect a lumpy idle, weak manifold vacuum and poorer driveability off boost.`,
      fix: `This is a hardware trade-off, not a tuning fault — you cannot calibrate it away. If the low end matters, fit a milder cam. If you want this cam, make sure the valve springs suit it (float at ${Math.round(derived.floatRpm)} RPM) and expect to gear the car for the higher powerband.`,
    });
  }

  // Keyed on the pressure the bearings actually see rather than on boost, so it fires
  // for the reason the wear number now moves. A high-compression naturally aspirated
  // engine can reach this without a turbo, and a knock-limited boosted one can stay
  // under it because the retard the ECU pulled took the pressure peak with it.
  const bearingEventBar = derived.bearingEventBar ?? COEFF.BEARING_EVENT_BAR;
  if (avgPeakPressure > bearingEventBar) {
    const bearingLevers = [
      turboOn ? 'Lower the boost target on BUILD → INDUCTION' : blower ? 'Fit a larger blower pulley on BUILD → INDUCTION' : null,
      points.some(spraying) ? `${turboOn || blower ? 'spray' : 'Spray'} a smaller shot` : null,
    ].filter(Boolean);
    const impact = Math.round(clamp((avgPeakPressure - bearingEventBar) * 0.25, 3, 9));
    events.push({
      type: 'bearing', severity: 1, impact,
      msg: `Sustained cylinder pressure through the pull (averaging ${avgPeakPressure.toFixed(0)} bar peak) — bottom-end stress accumulating`,
      cause: `Peak cylinder pressure is carried by the rod into the rod and main bearings on every firing stroke, knock or no knock. ${turboOn || blower ? `${avgBoost.toFixed(1)} psi of average boost ${points.some(spraying) ? 'and the nitrous ' : ''}against ` : points.some(spraying) ? 'The nitrous\'s extra charge against ' : 'Running this much load against '}${derived.compression.toFixed(1)}:1 static compression is what puts it there — compression multiplies manifold pressure, so both halves of that pair count.`,
      fix: `${bearingLevers.length ? `${bearingLevers.join(', ')}, or lower` : 'Lower'} static compression on BUILD → SHORT BLOCK. Less timing also lowers peak pressure, at a cost in power. ${derived.bearingFreeBar > COEFF.BEARING_PRESSURE_FREE_BAR ? 'This is a factory turbo engine, built for boost, and this is past what its factory tune asks of it.' : 'This is a naturally aspirated bottom end: a factory turbo engine is built for this load, this one is not.'} An iron block holds its main bores rounder under this load than an aluminium one, and either way there is no calibration change that removes the force — only ones that reduce it.`,
    });
  }

  if (ecu) {
    events.push(...ecuSweepEvents(points, { cal: ecu.cal, hw: ecuHw, hardCut, endRpm, intercooled: !!mods?.intercooler }));
    // One cause, one fix. Where this log already names a sensor or injector scaling error,
    // that error IS the lean the protection caught: the airflow or the fuel the ECU computes
    // is off by it everywhere.
    const scaling = events.find((e) => e.type === 'maf' || e.type === 'injscale');
    if (scaling) {
      for (const e of events) {
        if (e.type !== 'leanprot' || !/raise the VE cells/.test(String(e.fix ?? ''))) continue;
        e.fix = `This lean is the ${scaling.type === 'maf' ? 'airflow sensor reading low' : 'injector scaling'} the log names above, everywhere at once: fix that first on ${scaling.type === 'maf' ? 'TUNE → SENSORS' : 'TUNE → INJECTORS'} and pull again, before touching the VE table on TUNE → AIRFLOW. The protection saved the engine; it is not the fix.`;
      }
    }
  }
  if (failure) {
    events.push({
      type: 'failure', severity: 3, impact: 100, rpm: failure.rpm,
      msg: `Engine failure at ${failure.rpm} RPM: ${failure.title.toLowerCase()}`,
      cause: failure.cause,
      fix: 'The engine has to be rebuilt before it runs again. What killed it is in the health history: the pulls before this one wore that part down, and the same tune will wear the rebuilt one the same way.',
    });
  }

  events.sort((a, b) => (b.impact ?? b.severity) - (a.impact ?? a.severity));

  const peakHp = Math.max(...points.map((p) => p.hp));
  const peakTq = Math.max(...points.map((p) => p.torque));
  return { points, events, wear, peakHp, peakTq, loadKpa, needsMafRecal, ...(health ? { failure } : {}) };
}

/**
 * Whether an event happened somewhere in particular, rather than being true of the
 * whole pull.
 *
 * Derived from the data, never from a list of type names. `LogScreen` records what a
 * hand-kept list costs: one there named eleven of the twelve types this file emits and
 * `bearing` fell through to a chart colour. A thirteenth event type added later is
 * classified correctly the day it appears — it carries a span or it does not.
 *
 * @param {{rpmStart?: number}} event
 * @returns {boolean}
 */
export function isLocatable(event) {
  return typeof event.rpmStart === 'number';
}
