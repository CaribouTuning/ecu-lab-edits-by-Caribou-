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

import { COMPRESSOR_OPTS, EXHAUST_DIA_OPTS, INJECTOR_OPTS, OCTANE_OPTS, TURBINE_OPTS } from './hardware.js';
import { BARO_KPA, KELVIN_OFFSET, PSI_TO_KPA } from './constants.js';
import { computeHardwareVE } from './airflow.js';
import { knockThreshold, mbtTiming } from './knock.js';
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
    id: 'b58-m0',
    name: 'BMW B58B30M0',
    manufacturer: 'BMW',
    years: '2016-2018',
    blurb: 'One twin-scroll turbo where the N54 ran two, and 11.0:1 compression no 2006 turbo engine could have run — two BMW turbo-six generations apart. Load it next to the N54 to see what a decade of combustion development actually bought.',
    factory: {
      crankHp: 320, crankHpRpm: [5500, 6500],  // plateau-rated
      crankTq: 330, crankTqRpm: 1380,          // 330 lb-ft, flat 1380-5000
      displacementL: 3.00,
    },
    engine: {
      configuration: 'I6',
      bore: 82.0, stroke: 94.6,          // 82 x 94.6 mm
      compression: 11.0,                 // 11.0:1 — higher than the N54, two generations back
      blockMaterial: 'Aluminum', headMaterial: 'Aluminum',
      // Bore, stroke, compression and redline are published and do not move.
      // `camDuration` and `springRate` are not published in terms comparable to this
      // model, so they are free to be fitted — see the VQ35HR comment above for the
      // same arrangement and why it is not a fudge factor. In the event neither had to
      // move: this engine's peak torque is set almost entirely by manifold pressure.
      // Measured with `python3 scripts/analyze_presets.py --id b58-m0` (peak torque at
      // the 3700 breakpoint, baseline 296 wlb-ft at camDuration 214): swapping duration
      // 212->214->216 moves it only 297->296->296, about 0-1 wlb-ft per 2°, while +1 psi
      // of boost at the 3500 breakpoint, the 4500 breakpoint, or added across the whole
      // curve each move it 296->306/308/308 — 10-12 wlb-ft per psi. So the boost curve
      // below is what was actually fitted. 214° sits just below the N54's 216° and
      // carries 2.20° of overlap, well inside the advisory.
      // `springRate` 60 puts `valveFloatRpm` at ~8474, 1474 RPM clear of the 7000
      // limiter — the same order of margin the other presets carry (1242-1682). No
      // pull on a healthy engine should ever log a `float` event.
      camDuration: 214, springRate: 60,
      redline: 7000,
    },
    induction: {
      turboOn: true, turbineIdx: 1, compressorIdx: 1,
      // One twin-scroll turbo rather than the N54's pair. A twin-scroll housing keeps
      // the exhaust pulses of the two cylinder groups separated right up to the
      // turbine, so a single larger turbo spools nearly as early as two small ones —
      // which is why peak boost is commanded from just above idle and the torque
      // plateau is rated from 1380. It then tapers toward redline for the same reasons
      // the N54's does: backpressure and heat.
      //
      // PEAK is the published figure — 13 psi, ~0.9 bar — and does not move. The SHAPE
      // across RPM is not published, and it is the only thing fitted here: 13 psi held
      // to 2500, then a taper down to about 6.75 psi at the 7000 limiter (the curve's
      // last node, 6.5, sits at 7500 and is never reached — redline cuts the pull
      // first). That taper is steeper than the
      // real engine's, and deliberately so. This model was calibrated on a naturally
      // aspirated V6, and it reports more torque per unit of manifold pressure than a
      // real high-compression boosted six makes — hold 13 psi flat to 4500 here and the
      // pull returns 342 wlb-ft against a 281 target. Everything above the torque peak
      // is where that error can be absorbed without contradicting a published number,
      // so that is where it is absorbed.
      boost: RPM.map((r) => (r < 1500 ? 0 : r < 3500 ? 13 : r < 4500 ? 11
        : r < 5500 ? 9 : r < 6500 ? 8 : r < 7500 ? 7 : 6.5)),
    },
    parts: { injectorIdx: 3, exhaustDiaIdx: 2, octaneIdx: 1 },
    mods: { intake: false, exhaust: false, headers: false, intercooler: true },
  },
  {
    id: 'b58-m1',
    name: 'BMW B58B30M1',
    manufacturer: 'BMW',
    years: '2019-present',
    blurb: 'The same three litres with more boost and a far sharper calibration — 382 hp from an identical short block. What the Golf R is to the GTI, one engine family later.',
    factory: {
      crankHp: 382, crankHpRpm: 5800,   // 382 hp @ 5800 rpm
      crankTq: 369, crankTqRpm: 1800,   // 369 lb-ft, flat 1800-5000
      displacementL: 3.00,
    },
    engine: {
      configuration: 'I6',
      bore: 82.0, stroke: 94.6,
      compression: 11.0,
      blockMaterial: 'Aluminum', headMaterial: 'Aluminum',
      // Same short block, so bore, stroke and compression are the M0's. The revised
      // engine's sharper calibration is carried by a slightly longer duration and the
      // spring rate to match: `valveFloatRpm` ~8534, 1534 RPM clear of the limiter.
      camDuration: 218, springRate: 62,
      redline: 7000,
    },
    induction: {
      turboOn: true, turbineIdx: 1, compressorIdx: 1,
      // The revised engine runs meaningfully more boost than the M0 through the same
      // architecture — roughly 1.2 bar against 0.9. Nothing about the short block
      // changed, which is the entire lesson of shipping both.
      //
      // Peak is the published 17 psi and does not move; as on the M0, only the taper is
      // fitted, and it absorbs the same model error the M0's does (see that comment
      // above) — this physics reports more torque per unit of manifold pressure than
      // an 11.0:1 boosted six really makes, and the taper is where the excess is
      // absorbed without contradicting a published number. It is a far gentler taper
      // than the M0's: 17 psi held to 2500 — as on the M0, the last node carrying peak
      // is 2500, not 3500, so the plateau is already falling by 3000 (15.5 psi) — then
      // tapering to about 10.75 psi at the 7000 limiter (the curve's last node, 10.5,
      // sits at 7500 and is never reached), against the M0's 13 held to the same 2500
      // and tapering to about 6.75 at its own 7000 limiter. The two engines differ in
      // the DEPTH of the taper, not in where it starts — but that depth is still NOT
      // the same relationship the Golf R has to the GTI
      // below. Each retained-boost figure is that engine's boost curve linearly
      // interpolated at its own redline (the same way the sim samples it), divided by
      // its peak boost — not the value written last in each curve's ternary, which
      // sits at the 7500 breakpoint, past every one of these four engines' redlines,
      // and so is never itself sampled: the Golf R interpolates to 15.2 psi at its
      // 6800 limiter, 15.2/17 = 89% of peak; the GTI's 6500 limiter lands exactly on
      // an RPM breakpoint at 8.5 psi, 8.5/14 = 61% (coincidentally the same number as
      // that curve's final ternary clause); and the M1 interpolates to 10.75 psi at
      // its 7000 limiter, 10.75/17 = 63% — still on the GTI's side of that split, not
      // the Golf R's. The real reason the M1 needs a gentler taper is a fitting
      // constraint, not a wastegate schedule: its power target is 19% above the
      // M0's while its torque target is only 12% above, so less of the M0's curve can be
      // cut before power falls out of tolerance. Together the two published targets
      // give a 62 hp gap (382-320); the two simulated curves give 47 whp (324-277) —
      // the model doesn't reproduce the full published gap, but the direction and most
      // of the magnitude are there.
      boost: RPM.map((r) => (r < 1500 ? 0 : r < 3500 ? 17 : r < 4500 ? 14
        : r < 6500 ? 12 : r < 7500 ? 11 : 10.5)),
    },
    parts: { injectorIdx: 4, exhaustDiaIdx: 2, octaneIdx: 1 },
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
  const compressor = COMPRESSOR_OPTS[preset.induction.compressorIdx];
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
  const timing = LOAD.map((loadKpa, ri) => RPM.map((rpm, ci) => {
    const boostPsi = boostAt(rpm, loadKpa);
    const trueBestAfr = bestPowerAfr(boostPsi);
    const threshold = knockThreshold({
      rpm, mapKpa: loadKpa, veActual: ve[ri][ci],
      chargeC: chargeTempK(boostPsi, preset.mods.intercooler) - KELVIN_OFFSET,
      actualAfr: trueBestAfr, bestAfr: trueBestAfr, boostPsi,
      octaneBonus: fuel.bonus, mods: preset.mods, derived, compressor,
    });
    const safe = threshold - FACTORY_KNOCK_MARGIN_DEG;
    return Number(clamp(Math.min(mbtTiming(rpm, loadKpa), safe), 5, 50).toFixed(1));
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

/**
 * Presets grouped by manufacturer, in first-appearance order.
 *
 * The picker needs headings once the list outgrows a flat stack of buttons. Deriving
 * the grouping here rather than in the component keeps it assertable in plain Node —
 * the same reason `applyPreset` returns a patch instead of applying one — and means
 * the JSX renders a shape rather than computing one.
 *
 * Order comes from {@link ENGINE_PRESETS} itself, never from a second list kept
 * alongside it. A separate ordering table would be free to drift out of agreement
 * with the presets it claims to order; this cannot.
 *
 * @type {{manufacturer: string, presets: Preset[]}[]}
 */
export const PRESET_GROUPS = ENGINE_PRESETS.reduce((groups, preset) => {
  const group = groups.find((g) => g.manufacturer === preset.manufacturer);
  if (group) group.presets.push(preset);
  else groups.push({ manufacturer: preset.manufacturer, presets: [preset] });
  return groups;
}, /** @type {{manufacturer: string, presets: Preset[]}[]} */ ([]));
