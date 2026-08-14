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
import { chargeTempK, exhaustTempK } from './thermo.js';
import { clamp, interp1 } from './math.js';
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
  // Only advise on load the engine can actually reach — AT THIS ENGINE SPEED. A
  // naturally aspirated build never sees 150 or 200 kPa anywhere, and a turbo build
  // never sees them at 800 RPM either: the boost curve says how much the controller is
  // even asking for at each speed.
  //
  // The gate used to be per-ROW, against the PEAK of the boost curve, which let the
  // 200 kPa row be judged at idle. Those cells are clamped to the table's 5 degree
  // floor and their knock ceiling at 800 RPM is near zero — the end gas spends an age
  // under pressure when the crank is barely turning — so the advisor reported the
  // factory table as dangerously over-advanced at an operating point the engine cannot
  // physically occupy. An advisor that cries wolf about impossible cells trains the
  // player to ignore it on the real ones.
  const reachableKpa = (rpm) => BARO_KPA + 2
    + (turboOn ? Math.max(0, interp1(RPM, boostCurve, rpm)) * PSI_TO_KPA : 0);
  LOAD.forEach((mapRow, ri) => {
    RPM.forEach((rpm, ci) => {
      if (mapRow > reachableKpa(rpm)) return;
      // EVERY cell is judged at ITS OWN ROW PRESSURE. A spark table is indexed by
      // manifold pressure, so the 100 kPa row IS the calibration for 100 kPa — what the
      // throttle happens to be doing when the engine passes through that row is not a
      // property of the cell.
      //
      // This used to run the induction solve first and evaluate at the manifold pressure
      // it produced, which on a boosted engine meant the 100 kPa row was judged at full
      // boost — 200 kPa on the Golf R. The advisor then flagged cells of the factory
      // table THE APP ITSELF GENERATED as over-advanced, because `factoryCalibration`
      // wrote them at the row pressure and the advisor was reading them at double it.
      // Both halves of this function already used the row pressure for MBT; the knock
      // half now does too, and the three producers of a spark opinion — the generator,
      // the advisor and the running ECU — finally ask one question of one model.
      const boostPsi = Math.max(0, (mapRow - BARO_KPA) / PSI_TO_KPA);
      const pt = evaluatePoint({
        rpm, mapKpa: mapRow, boostPsi,
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
          turboOn, turbine: turboOn ? turbine : null,
          exhaustFlowKgS: (rowAir / 1000) * (1 + 1 / (fuel.stoich * rowLambda))
            * derived.cyl * (rpm / 2) / 60,
          exhaustK: exhaustTempK({ chargeIndex: chargeIndexOf(rowVe, mapRow), lambda: rowLambda }),
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
      // Mixture advice is judged on what the engine DELIVERED, not on what the table
      // commanded — and the suggestion is the commanded number that would deliver the
      // target, which is the number the player has to type into the cell.
      //
      // Those are the same thing only when the ECU's fuel maths is perfect. It is not:
      // a MAF that under-reads, or an injector the ECU has the wrong size for, puts a
      // fixed multiplier between commanded and delivered, and a real factory table is
      // written PRE-CORRECTED for it. Comparing the target against the commanded number
      // therefore flagged every boosted preset's own factory fuel table — the Golf R
      // commands 11.22 at 5000 RPM and full boost and delivers 12.20, which is its
      // best-power target to the hundredth, and the advisor called it a whole point off.
      // Scaling by the delivered/target ratio prices the error the engine actually made.
      const mixScale = pt.bestAfr / Math.max(0.1, pt.afr);
      const suggestedAfr = afr[ri][ci] * mixScale;
      fuelAdv.push({
        ri, ci, rpm, map: mapRow, current: afr[ri][ci],
        suggested: Number(suggestedAfr.toFixed(1)),
        delta: Number((suggestedAfr - afr[ri][ci]).toFixed(1)),
        delivered: Number(pt.afr.toFixed(2)), target: Number(pt.bestAfr.toFixed(2)),
        duty: pt.duty,
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
