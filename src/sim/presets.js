/**
 * Pre-configured factory engines.
 *
 * Each preset is a real production engine with its published specifications, so a
 * player can start from something they recognise instead of guessing at slider
 * values. Every figure below is sourced in the comment beside it.
 *
 * WHAT "FACTORY CALIBRATION" MEANS HERE
 * Real OEM binaries (BMW MSD80, Siemens Simos 18.1) are not publicly available in a
 * form this project can source or ship. These calibrations are RECONSTRUCTIONS built
 * from what is public — factory boost, compression, published power and torque peaks
 * and typical OEM wide-open-throttle lambda — and then validated against the real
 * power figures by `tests/presets.test.js`. The test is what keeps the claim honest.
 *
 * The tables are generated from the physics rather than hand-authored, so a
 * coefficient change can never leave a stale calibration behind.
 */

import {
  EXHAUST_DIA_OPTS, INJECTOR_OPTS, OCTANE_OPTS, TURBINE_OPTS,
  turbineBackpressureRelief,
} from './hardware.js';
import { BARO_KPA, PSI_TO_KPA } from './constants.js';
import { COEFF } from './coefficients.js';
import { computeHardwareVE } from './airflow.js';
import { chargeIndexOf } from './knock.js';
import { cycleInputsFor, knockLimitedSpark, mbtFromBurn, trappedAirGrams } from './cycle.js';
import { exhaustManifoldKpa } from './friction.js';
import { bestPowerAfr } from './manifold.js';
import { mafErrorFactor } from './sweep.js';
import { chargeTempK } from './thermo.js';
import { deriveEngine } from './engine.js';
import { clamp } from './math.js';
import { LOAD, RPM } from './tables.js';

/**
 * How far below the knock limit a factory calibration sits, in degrees.
 *
 * Manufacturers leave margin for fuel quality, altitude, heat soak and engine
 * wear — they do not calibrate to the edge the way a dyno tune can. This margin is
 * why the factory tune is beatable, which is the whole exercise.
 *
 * Exported deliberately, not because anything outside this module currently imports
 * it: it is part of this module's documented interface (the number a reader or a
 * future test needs to know "how much margin is a factory tune leaving on the
 * table"), not leftover surface.
 */
export const FACTORY_KNOCK_MARGIN_DEG = 2;

/** MAP above which an OEM calibration leaves closed loop and enriches for power. */
const OPEN_LOOP_KPA = 85;

/**
 * @typedef {object} Preset
 * @property {string} id
 * @property {string} name
 * @property {string} manufacturer
 * @property {string} years
 * @property {string} blurb
 * @property {object} factory published ratings
 * @property {import('./engine.js').EngineConfig} engine
 * @property {object} induction
 * @property {object} parts
 * @property {object} mods
 */

/** @type {Preset[]} */
export const ENGINE_PRESETS = [
  {
    id: 'vq35hr',
    name: 'Nissan VQ35HR',
    manufacturer: 'Nissan',
    years: '2007-2016',
    blurb: 'A high-revving naturally aspirated V6 — the reference point for what an engine makes without boost. Rewards cam and exhaust work, punishes anyone hoping for torque down low.',
    factory: {
      crankHp: 306, crankHpRpm: 6800,   // 306 hp @ 6800 rpm
      crankTq: 268, crankTqRpm: 4800,   // 268 lb-ft @ 4800 rpm
      displacementL: 3.50,
    },
    engine: {
      configuration: 'V6',
      bore: 95.5, stroke: 81.4,          // 95.5 x 81.4 mm
      compression: 10.6,                 // 10.6:1
      blockMaterial: 'Aluminum', headMaterial: 'Aluminum',
      // Bore, stroke, compression and redline above are published figures and do not
      // move. `camDuration` and `springRate` are not published, so they are where this
      // preset is fitted — 228° is simply the duration that best fits power and torque
      // at the same time (+2.2% and -3.9% against the published ratings at the wheels).
      // Torque is not what caps this fit — in the fitted range it bottoms out near
      // 220° (213.65 wlb-ft) and RISES in both directions: 216.2 at 224°, 217.4 at
      // 226°, 218.8 at 228°. Bigger cams gain power and torque both. What actually
      // bounds the fit is the ±5% power ceiling and the cam-overlap advisory, which
      // starts firing at 229° (11.00° overlap, vs. 9.90° at 228° — the last duration
      // with an empty event log).
      // `springRate` 68 is set well above the 50 baseline purely to carry that cam:
      // `valveFloatRpm` lands at ~8740, about 1240 RPM clear of the 7500 redline —
      // comparable to (not the same as) the margin the other three presets carry:
      // 1330 / 1682 / 1382 RPM. No pull should ever show a `float` event on this
      // engine — if one appears, that is a bug, not "the character".
      //
      // WHAT THIS PRESET DOES NOT REPRODUCE: the real engine makes peak power at 6800
      // and falls away after it. Simulated power does not fall at all — it climbs
      // monotonically into the 7500 limiter, so peak power reads 7500, 700 RPM high,
      // and peak torque sits at 5500 against a published 4800. That is a limit of the
      // shared physics, not of this data: the real rolloff comes from cam profile,
      // VVEL variable lift and intake-tract tuning, and the model has no term for any
      // of them, so at every duration that reaches this engine's rating VE is still
      // rising at the redline. The three boosted presets roll over only because their
      // factory boost curves taper; nothing tapers on a naturally aspirated engine
      // here. Shaping the top end with valve float instead (a 42 spring rate, which is
      // what this preset shipped with) did place the peak, at the cost of modelling a
      // healthy valvetrain as a failing one — that is not coming back.
      // `tests/presets.test.js` asserts the climb-to-limiter rather than a peak
      // location, and says the same thing there.
      camDuration: 228, springRate: 68,
      redline: 7500,
    },
    induction: { turboOn: false, turbineIdx: 1, compressorIdx: 1, boost: RPM.map(() => 0) },
    parts: { injectorIdx: 2, exhaustDiaIdx: 1, octaneIdx: 1 },
    mods: { intake: false, exhaust: false, headers: false, intercooler: false },
  },
  {
    id: 'n54',
    name: 'BMW N54',
    manufacturer: 'BMW',
    years: '2006-2013',
    blurb: 'A twin-turbo straight six running unusually high compression for a boosted engine. Famous for leaving power on the table from the factory — which makes it the best argument in the app for why tuning exists.',
    factory: {
      crankHp: 302, crankHpRpm: 5800,   // 302 hp @ 5800 rpm
      crankTq: 295, crankTqRpm: 3000,   // 295 lb-ft, flat 1400-5000
      displacementL: 2.98,
    },
    engine: {
      configuration: 'I6',
      bore: 84.0, stroke: 89.6,          // 84 x 89.6 mm
      compression: 10.2,                 // 10.2:1 — high for a turbo engine, thanks to DI
      blockMaterial: 'Aluminum', headMaterial: 'Aluminum',
      camDuration: 216, springRate: 58,
      redline: 7000,
    },
    induction: {
      turboOn: true, turbineIdx: 0, compressorIdx: 1,
      // Twin small turbos spool early (0.6 bar / 8.5 psi target by 3500), but the
      // factory ECU tapers boost above that as exhaust backpressure and heat climb
      // toward redline — the well-documented N54 "boost taper" that trades away
      // top-end for turbo longevity rather than chasing peak power to the limiter.
      boost: RPM.map((r) => (r < 1500 ? 0 : r < 2500 ? 7 : r < 4500 ? 8.5
        : r < 5500 ? 7.2 : r < 6500 ? 6.2 : 5.2)),
    },
    parts: { injectorIdx: 3, exhaustDiaIdx: 2, octaneIdx: 1 },
    mods: { intake: false, exhaust: false, headers: false, intercooler: true },
  },
  {
    id: 'ea888-gti',
    name: 'VW EA888.3 (GTI)',
    manufacturer: 'Volkswagen',
    years: '2013-2021',
    blurb: 'A small, heavily boosted four with a long stroke and a broad torque plateau. Same short block as the Golf R below — the difference is entirely turbo and calibration, which is the point.',
    factory: {
      crankHp: 220, crankHpRpm: [4700, 6200],  // plateau-rated
      crankTq: 258, crankTqRpm: 1500,
      displacementL: 1.98,
    },
    engine: {
      configuration: 'I4',
      bore: 82.5, stroke: 92.8,          // 82.5 x 92.8 mm
      compression: 9.6,                  // 9.6:1
      blockMaterial: 'Cast Iron', headMaterial: 'Aluminum',
      camDuration: 210, springRate: 54,
      redline: 6500,
    },
    induction: {
      turboOn: true, turbineIdx: 0, compressorIdx: 1,
      // IHI IS20: quick-spooling, so boost is in by 2500. It peaks around 14 psi in
      // the low-mid range where the plateau torque figure is rated, then the ECU
      // eases off toward redline the way the taper above does for the N54 — the
      // same physical trade-off, smaller turbo. A "Small" compressor (12 psi
      // ceiling) cannot sustain this without running outside its efficient range
      // every pull, so this is sized Medium (20 psi ceiling) instead.
      boost: RPM.map((r) => (r < 1500 ? 0 : r < 2500 ? 12 : r < 3500 ? 14
        : r < 4500 ? 13 : r < 5500 ? 11.2 : r < 6500 ? 9.5 : 8.5)),
    },
    parts: { injectorIdx: 2, exhaustDiaIdx: 1, octaneIdx: 1 },
    mods: { intake: false, exhaust: false, headers: false, intercooler: true },
  },
  {
    id: 'ea888-r',
    name: 'VW EA888.3 (Golf R)',
    manufacturer: 'Volkswagen',
    years: '2015-2021',
    blurb: 'The same 2.0 litre block with the larger IS38 turbo and a far more aggressive calibration. Compare it against the GTI preset to see how much of an engine is decided after the metal is cast.',
    factory: {
      crankHp: 292, crankHpRpm: [5400, 6500],  // plateau-rated
      crankTq: 280, crankTqRpm: 1800,
      displacementL: 1.98,
    },
    engine: {
      configuration: 'I4',
      bore: 82.5, stroke: 92.8,
      compression: 9.6,
      blockMaterial: 'Cast Iron', headMaterial: 'Aluminum',
      camDuration: 210, springRate: 54,
      redline: 6800,
    },
    induction: {
      turboOn: true, turbineIdx: 1, compressorIdx: 1,
      // IS38 at 1.2 bar / 17.4 psi, held through the mid-range where this engine's
      // plateau torque is rated, then the same top-end taper as the smaller turbos
      // above — a bigger compressor gives it less of a fall-off, which is exactly
      // the point of the upgrade over the GTI's IS20.
      boost: RPM.map((r) => (r < 1500 ? 0 : r < 2500 ? 14 : r < 3500 ? 17
        : r < 4500 ? 17 : r < 5500 ? 16.5 : r < 6500 ? 15.8 : 15.2)),
    },
    parts: { injectorIdx: 4, exhaustDiaIdx: 1, octaneIdx: 1 },
    mods: { intake: false, exhaust: false, headers: false, intercooler: true },
  },
];

/** The induction hardware bundle `computeHardwareVE` expects. */
function hardwareFor(preset) {
  const { turboOn, turbineIdx, boost } = preset.induction;
  return {
    turboOn,
    turbine: turboOn ? TURBINE_OPTS[turbineIdx] : null,
    exhaustDia: EXHAUST_DIA_OPTS[preset.parts.exhaustDiaIdx].dia,
    fuel: OCTANE_OPTS[preset.parts.octaneIdx],
    peakBoostPsi: turboOn ? Math.max(...boost) : 0,
  };
}

/**
 * Generates the factory calibration for a preset.
 *
 * Order matters: VE first (it is the physical truth), then FUEL (the knock model
 * needs the mixture), then SPARK (which is knock-limited given that mixture).
 *
 * @param {Preset} preset
 * @returns {{ve: number[][], timing: number[][], afr: number[][]}}
 */
export function factoryCalibration(preset) {
  const derived = deriveEngine(preset.engine);
  const fuel = OCTANE_OPTS[preset.parts.octaneIdx];
  const hw = hardwareFor(preset);
  const ve = computeHardwareVE(preset.engine, preset.mods, hw);

  // Boost actually present at this cell, derived from the LOAD (MAP) axis rather than
  // from the preset's boost curve keyed by RPM. A generated table must be a valid,
  // self-consistent surface at every MAP cell regardless of what boost the preset's
  // curve happens to produce at a given RPM, so this reads pressure back off the axis
  // the table is actually indexed by. `_rpm` is unused for that reason, kept only so
  // every call site can pass the same (rpm, mapKpa) shape as the other per-cell helpers.
  const boostAt = (_rpm, mapKpa) => (preset.induction.turboOn && mapKpa > BARO_KPA
    ? Math.max(0, (mapKpa - BARO_KPA) / PSI_TO_KPA)
    : 0);

  // A turbo (or a bigger intake) changes the airflow profile across the MAF, so at a
  // fixed mafScalar of 1 the ECU under-reads true air by this factor — see
  // `mafErrorFactor` in sweep.js. A generic calibration leaves that error for the
  // player to chase down with the MAF Scalar; a FACTORY calibration is dyno-validated
  // and has already characterized its own sensor, so its fuel table is written to
  // land on best-power AFR once that error is applied — not before it.
  const mafFactor = mafErrorFactor(preset.mods, preset.induction.turboOn);

  // FUEL: stoichiometric where a real ECU runs closed loop, best-power enrichment
  // above that, pre-corrected by the known MAF error so the DELIVERED mixture (not
  // just the commanded one) lands on best-power AFR. This is exactly the shape of a
  // factory fuel table, MAF characterization included.
  const afr = LOAD.map((loadKpa) => RPM.map((rpm) => {
    if (loadKpa < OPEN_LOOP_KPA) return 14.7;
    return Number((bestPowerAfr(boostAt(rpm, loadKpa)) * mafFactor).toFixed(2));
  }));

  // SPARK: MBT where there is margin for it, knock-limited minus the factory safety
  // margin where there is not. That is what a production calibration is. Knock is
  // evaluated against the mixture the engine will ACTUALLY see (best-power AFR, since
  // the fuel table above is what puts it there) rather than the richer commanded
  // number, which is only an artifact of pre-compensating the MAF.
  const sweptM3 = (derived.displacementL / derived.cyl) / 1000;
  const turbine = preset.induction.turboOn ? TURBINE_OPTS[preset.induction.turbineIdx] : null;

  const timing = LOAD.map((loadKpa, ri) => RPM.map((rpm, ci) => {
    const boostPsi = boostAt(rpm, loadKpa);
    const trueBestAfr = bestPowerAfr(boostPsi);
    const lambda = trueBestAfr / 14.7;
    const chargeK = chargeTempK(boostPsi, preset.mods.intercooler);
    const veActual = ve[ri][ci];
    const airChargeG = trappedAirGrams({ veActual, mapKpa: loadKpa, chargeK, sweptM3 });
    const empKpa = exhaustManifoldKpa({
      boostPsi, turboOn: preset.induction.turboOn,
      turbineRelief: turbineBackpressureRelief(turbine),
      flowFrac: chargeIndexOf(veActual, loadKpa) * (rpm / COEFF.EMP_FLOW_REF_RPM),
    });
    // The generator asks the physics the same question the running ECU asks — how much
    // spark will this cylinder take — by solving the same cycle. A second, simpler
    // knock estimate here would drift from the one the player then drives against.
    const cyc = cycleInputsFor({
      rpm, mapKpa: loadKpa, empKpa, intakeK: chargeK,
      airChargeG, burnedFuelG: airChargeG / (fuel.stoich * lambda),
      lambda, fuel, derived,
    });
    const safe = knockLimitedSpark(cyc) - FACTORY_KNOCK_MARGIN_DEG;
    return Number(clamp(Math.min(mbtFromBurn(cyc.burnDeg), safe), 5, 50).toFixed(1));
  }));

  return { ve, timing, afr };
}

/**
 * Everything the app needs to switch to this engine, as one patch.
 *
 * Returned rather than applied, so preset behaviour is testable without React.
 *
 * @param {Preset} preset
 * @returns {object} a complete state patch
 */
export function applyPreset(preset) {
  const { ve, timing, afr } = factoryCalibration(preset);
  return {
    presetId: preset.id,
    engineConfig: { ...preset.engine },
    mods: { ...preset.mods },
    turboOn: preset.induction.turboOn,
    boostCurve: [...preset.induction.boost],
    turbineIdx: preset.induction.turbineIdx,
    compressorIdx: preset.induction.compressorIdx,
    injIdx: preset.parts.injectorIdx,
    ecuInjectorCc: INJECTOR_OPTS[preset.parts.injectorIdx].cc,
    octaneIdx: preset.parts.octaneIdx,
    exhaustDiaIdx: preset.parts.exhaustDiaIdx,
    ve, timing, afr,
  };
}

/**
 * Finds a preset by id.
 * @param {string} id
 * @returns {Preset|undefined}
 */
export const presetById = (id) => ENGINE_PRESETS.find((p) => p.id === id);
