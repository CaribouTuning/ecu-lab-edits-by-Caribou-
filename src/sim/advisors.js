/**
 * Advisors — compare what the hardware now wants against what the player's tables
 * actually say.
 *
 * These NEVER edit anything. That is the central design rule of the app: hardware
 * changes invalidate a calibration but do not rewrite it, exactly as in a real shop.
 * The advisors report the gap; closing it is the player's job.
 */

import { BARO_KPA, PSI_TO_KPA } from './constants.js';
import { computeHardwareVE } from './airflow.js';
import { chargeIndexOf } from './knock.js';
import { mbtForCell, trappedAirGrams } from './cycle.js';
import { exhaustManifoldKpa } from './friction.js';
import { turbineBackpressureRelief } from './hardware.js';
import { chargeTempK } from './thermo.js';
import { COEFF } from './coefficients.js';
import { clamp, interp1 } from './math.js';
import { computeManifold } from './manifold.js';
import { evaluatePoint } from './point.js';
import { LOAD, RPM } from './tables.js';

/** The ~100 kPa row — wide-open throttle, naturally aspirated. */
const WOT_ROW = 2;

/** A cell delta below this (percent) is not worth reporting. */
const VE_NOTABLE_PCT = 2.5;

/** Safety left under the calculated knock limit when advising, degrees. */
const KNOCK_SAFETY_DEG = 1.5;

/**
 * The spark table's own editable range, degrees BTDC. A suggestion outside it could
 * not be applied, so there is no point offering one. Matches the bounds
 * `factoryCalibration` clamps to in presets.js.
 */
const SPARK_TABLE_MIN_DEG = 5;
const SPARK_TABLE_MAX_DEG = 50;

/** A cell must sit more than this far past a ceiling before it is worth reporting. */
const ADVANCE_TOLERANCE_DEG = 1.0;

/**
 * Compares the player's VE table against what the current hardware would flow, and
 * turns the gap into specific, cell-level tuning advice — the same thing a tuner
 * would conclude after re-logging airflow following a parts change.
 *
 * @param {number[][]} currentVe the player's VE table
 * @param {import('./engine.js').EngineConfig} cfg
 * @param {object} mods
 * @param {object} hw induction hardware, as passed to {@link computeHardwareVE}
 * @returns {{inSync: boolean, recs: object[], deltas: object[], maxAbs: number}}
 */
export function veRecommendations(currentVe, cfg, mods, hw) {
  const target = computeHardwareVE(cfg, mods, hw);
  const recs = [];
  const deltas = RPM.map((rpm, ci) => ({
    rpm,
    pct: ((target[WOT_ROW][ci] - currentVe[WOT_ROW][ci]) / Math.max(1, currentVe[WOT_ROW][ci])) * 100,
    from: currentVe[WOT_ROW][ci],
    to: target[WOT_ROW][ci],
  }));

  const notable = deltas.filter((d) => Math.abs(d.pct) >= VE_NOTABLE_PCT);
  if (notable.length === 0) {
    return { inSync: true, recs: [], deltas, maxAbs: Math.max(...deltas.map((d) => Math.abs(d.pct))) };
  }

  const low = notable.filter((d) => d.rpm <= 3500);
  const mid = notable.filter((d) => d.rpm > 3500 && d.rpm < 6500);
  const high = notable.filter((d) => d.rpm >= 6500);

  const band = (arr, name) => {
    if (!arr.length) return;
    const avg = arr.reduce((a, b) => a + b.pct, 0) / arr.length;
    const dir = avg > 0 ? 'raise' : 'lower';
    recs.push({
      band: name,
      rpmText: arr.length === 1 ? `${arr[0].rpm} RPM` : `${arr[0].rpm}–${arr[arr.length - 1].rpm} RPM`,
      pct: avg,
      text: `${dir === 'raise' ? 'Raise' : 'Lower'} the ${name} cells by about ${Math.abs(avg).toFixed(0)}% — your hardware ${avg > 0 ? 'now flows more air here than your table assumes' : 'flows less air here than your table assumes'}.`,
      cells: arr.map((d) => `${d.rpm} RPM: ${d.from} → ${d.to}`),
    });
  };
  band(low, 'low-RPM');
  band(mid, 'mid-range');
  band(high, 'top-end');

  return { inSync: false, recs, deltas, maxAbs: Math.max(...deltas.map((d) => Math.abs(d.pct))) };
}

/**
 * Reports, cell by cell, what the current hardware would actually tolerate for spark
 * and mixture — so the player can see where their tune has gone stale and fix it
 * themselves. Spark and fuel are never auto-changed.
 *
 * @param {object} input
 * @returns {{spark: object[], fuelAdv: object[], overAdvanced: object[], underAdvanced: object[], pastMbt: object[], wrongMix: object[]}}
 */
export function calibrationAdvice({
  ve, veTruth, timing, afr, derived, fuel, mods, turboOn, boostCurve,
  compressor, turbine, injectorCc, ecuInjectorCc, mafScalar, mafErrorBase,
}) {
  const spark = [], fuelAdv = [];
  // Only advise on load the engine can actually reach. A naturally aspirated build
  // never sees 150 or 200 kPa, so flagging those rows would be pure noise.
  const maxReachable = BARO_KPA + (turboOn ? Math.max(...boostCurve) * PSI_TO_KPA : 0) + 2;
  LOAD.forEach((mapRow, ri) => {
    if (mapRow > maxReachable) return;
    RPM.forEach((rpm, ci) => {
      const boostTarget = turboOn ? interp1(RPM, boostCurve, rpm) : 0;
      const man = computeManifold(rpm, Math.min(mapRow, BARO_KPA), turboOn, boostTarget, turbine, compressor);
      const useMap = mapRow > BARO_KPA ? mapRow : man.mapKpa;
      const boostPsi = Math.max(0, (useMap - BARO_KPA) / PSI_TO_KPA);
      const pt = evaluatePoint({
        rpm, mapKpa: useMap, boostPsi,
        veVal: ve[ri][ci], veActualVal: veTruth?.[ri]?.[ci],
        timingVal: timing[ri][ci], afrCommanded: afr[ri][ci],
        fuel, mods: { ...mods, turboFitted: turboOn }, mafScalar, mafErrorBase,
        injectorCc, ecuInjectorCc, derived, compressor,
        turbine: turboOn ? turbine : null,
      });
      // Two different ceilings bind here, and only one of them is dangerous.
      //
      // Knock is the hard one: past it the engine is damaging itself, so leave ~1.5
      // deg of safety under the calculated limit, as a tuner would.
      //
      // MBT is the soft one: past it the burn is already landing where it should, so
      // more advance buys nothing and only moves you toward the hard ceiling. At light
      // load the knock limit is enormous — a cylinder in deep vacuum effectively cannot
      // knock — and recommending against it alone produced advice like "run 165 deg at
      // 20 kPa". Whichever ceiling is lower is the real one.
      //
      // This is the same rule `factoryCalibration` writes its spark table with; see
      // presets.js. The two must not disagree about what good timing looks like.
      const knockCeiling = pt.threshold - KNOCK_SAFETY_DEG;
      // MBT is taken at the row's OWN pressure, not the manifold pressure the throttle
      // happens to produce. The table is indexed by manifold pressure, so the 100 kPa
      // row is the calibration for 100 kPa — and `factoryCalibration` writes it that
      // way too. Evaluating it at anything else makes the advisor disagree with the
      // tables the app itself generated.
      // MBT comes from the same integrated burn the ECU and the calibration generator
      // use, evaluated at the row's own pressure. Before the cycle model this was a
      // correlation in RPM and pressure ratio; the conclusion it reached — MBT is
      // wherever 50% burned lands just after TDC — is unchanged, but the burn duration
      // behind it is now modelled rather than fitted, so mixture and dilution move it.
      const rowBoostPsi = Math.max(0, (mapRow - BARO_KPA) / PSI_TO_KPA);
      const rowChargeK = chargeTempK(rowBoostPsi, mods.intercooler);
      const rowVe = ve[ri][ci];
      const rowAir = trappedAirGrams({
        veActual: rowVe, mapKpa: mapRow, chargeK: rowChargeK,
        sweptM3: (derived.displacementL / derived.cyl) / 1000,
      });
      const rowLambda = afr[ri][ci] / 14.7;
      const mbt = mbtForCell({
        rpm, mapKpa: mapRow, intakeK: rowChargeK,
        empKpa: exhaustManifoldKpa({
          boostPsi: rowBoostPsi, turboOn,
          turbineRelief: turbineBackpressureRelief(turboOn ? turbine : null),
          flowFrac: chargeIndexOf(rowVe, mapRow) * (rpm / COEFF.EMP_FLOW_REF_RPM),
        }),
        airChargeG: rowAir, burnedFuelG: rowAir / (fuel.stoich * rowLambda),
        lambda: rowLambda, fuel, derived,
      });
      // Which of the two ceilings bound the suggestion. Useful on its own, but it says
      // nothing about danger: a cell can sit past both ceilings with MBT the lower of
      // the two. Danger is where the player's own number sits — see below.
      const knockLimited = knockCeiling < mbt;
      const safeTiming = clamp(
        Math.round(Math.min(knockCeiling, mbt) * 2) / 2,
        SPARK_TABLE_MIN_DEG, SPARK_TABLE_MAX_DEG,
      );
      spark.push({
        ri, ci, rpm, map: mapRow, current: timing[ri][ci], suggested: safeTiming,
        delta: Number((safeTiming - timing[ri][ci]).toFixed(1)), knocking: pt.knock,
        mbt: Number(mbt.toFixed(1)), knockCeiling: Number(knockCeiling.toFixed(1)),
        knockLimited,
      });
      fuelAdv.push({
        ri, ci, rpm, map: mapRow, current: afr[ri][ci], suggested: Number(pt.bestAfr.toFixed(1)),
        delta: Number((pt.bestAfr - afr[ri][ci]).toFixed(1)), duty: pt.duty,
      });
    });
  });
  // Past the knock limit is a damage risk. Past MBT is only wasted effort — the burn
  // is already landing where it should, so the extra advance buys no torque. Reporting
  // them as one category would either cry wolf about a safe cruise cell or say nothing
  // about a genuinely dangerous one.
  //
  // Which one a cell is depends on where the PLAYER'S OWN NUMBER sits, not on which
  // ceiling happens to be lower. Those come apart exactly when MBT is under the knock
  // ceiling and the table is over both: the cell is detonating, but the lower ceiling
  // is MBT. Classifying on ceiling order would file that cell as merely wasteful and
  // tell the player it is safe, which is the one thing this report must never do.
  const overAdvanced = spark.filter((c) => c.current - c.knockCeiling > ADVANCE_TOLERANCE_DEG);
  const pastMbt = spark.filter((c) => c.current - c.knockCeiling <= ADVANCE_TOLERANCE_DEG
    && c.current - c.mbt > ADVANCE_TOLERANCE_DEG);
  const underAdvanced = spark.filter((c) => c.delta > 3.0);
  const wrongMix = fuelAdv.filter((c) => c.map >= 85 && Math.abs(c.delta) > 0.45);
  return { spark, fuelAdv, overAdvanced, underAdvanced, pastMbt, wrongMix };
}
