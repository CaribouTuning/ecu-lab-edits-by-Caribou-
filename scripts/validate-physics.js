/**
 * An independent check of the physics model, from outside it.
 *
 * The test suite holds the model to sourced bands (tests/benchmark.test.js and the rest,
 * docs/accuracy.md). This script asks different questions, with nothing taken from the
 * model on trust:
 *
 *   1. Do its own outputs obey the laws they claim to? On every point of every factory
 *      pull: hp = torque x rpm / 5252; the charge equals VE x MAP/(R T) x cylinder volume
 *      (ideal gas); MAF equals the charge x cylinders x rpm / 120; wheel torque equals
 *      BMEP x displacement / 4 pi through the drivetrain; BSFC equals fuel flow over crank
 *      power; and no point beats the ideal air-standard Otto cycle at its compression.
 *   2. How close are the thirteen factory engines to the makers' ratings?
 *   3. Do its sensitivities match references it was not fitted to: SAE J1349's
 *      correction for intake temperature and pressure, the textbook spark-retard curve,
 *      best-power mixture, and the Otto cycle's gain from compression?
 *
 * Run: node scripts/validate-physics.js
 */

import * as S from '../src/sim/index.js';

function pull(preset, over = {}) {
  const patch = S.applyPreset(preset);
  const cfg = { ...patch.engineConfig, ...(over.engine ?? {}) };
  const derived = S.deriveEngine(cfg);
  const oct = S.OCTANE_OPTS[over.octaneIdx ?? patch.octaneIdx];
  return { derived, patch, r: S.simulateSweep({
    loadKpa: over.loadKpa ?? 100, ve: patch.ve, veTruth: over.veTruth ?? patch.ve, layout: patch.layout,
    timing: over.timing ?? patch.timing, afr: over.afr ?? patch.afr, turboOn: patch.turboOn, boostCurve: over.boostCurve ?? patch.boostCurve,
    octaneBonus: oct.bonus, octaneLabel: oct.label, fuel: oct,
    injectorCc: S.INJECTOR_OPTS[patch.injIdx].cc, ecuInjectorCc: patch.ecuInjectorCc, injectorLabel: S.INJECTOR_OPTS[patch.injIdx].label,
    mods: over.mods ?? patch.mods, mafScalar: patch.mafScalar, derived,
    turbine: S.presetTurbine(preset), compressor: S.presetCompressor(preset), env: over.env,
  }) };
}

const out = []; const log = (...a) => { out.push(a.join(' ')); };
const pct = (a, b) => ((a / b - 1) * 100);
const R = 287.05, LHV = 43.4e6, KW_PER_HP = 0.7457, NM_PER_LBFT = 1.35582;

// ---- 1. Identities on every point of every factory pull ----
let worst = { hp: 0, air: 0, maf: 0, bmep: 0, bsfc: 0 }; let n = 0; let otto = 0; let maxEff = 0; let effs = [];
for (const preset of S.ENGINE_PRESETS) {
  const { r, derived } = pull(preset);
  for (const p of r.points) {
    n++;
    const hpId = p.torque * p.rpm / 5252; worst.hp = Math.max(worst.hp, Math.abs(hpId - p.hp) / Math.max(1, p.hp));
    // Ideal gas: charge mass from VE x density x cylinder volume (residual-free, as speed-density does)
    const rho = p.map * 1000 / (R * (p.iat + 273.15));
    const mIdeal = (p.ve / 100) * rho * derived.perCylL / 1000 * 1000; // g
    worst.air = Math.max(worst.air, Math.abs(mIdeal / p.airCharge - 1));
    const maf = p.airCharge * derived.cyl * p.rpm / 120; worst.maf = Math.max(worst.maf, Math.abs(maf / p.maf - 1));
    // Torque from BMEP: T = BMEP Vd / (4 pi); wheel = crank x drivetrain efficiency
    const tCrankNm = p.bmep * 1e5 * (derived.displacementL / 1000) / (4 * Math.PI);
    worst.bmep = Math.max(worst.bmep, Math.abs(tCrankNm * S.DRIVETRAIN_EFF / (p.torque * NM_PER_LBFT) - 1));
    // BSFC from fuel flow (air / AFR) over crank power
    const fuelLbH = (p.maf / p.afr) * 3600 / 453.592; const crankHp = p.hp / S.DRIVETRAIN_EFF;
    if (p.rpm >= 2000) worst.bsfc = Math.max(worst.bsfc, Math.abs(fuelLbH / crankHp / p.bsfc - 1));
    // Brake thermal efficiency vs the ideal Otto cycle at this compression (gamma 1.3 for real charge, 1.4 air-standard)
    const eta = (crankHp * KW_PER_HP * 1000) / ((p.maf / p.afr) / 1000 * LHV);
    const ottoAir = 1 - Math.pow(derived.compression, -0.4);
    if (eta >= ottoAir) otto++;
    maxEff = Math.max(maxEff, eta); if (p.rpm >= 3000) effs.push(eta);
  }
}
log(`1. Identities over ${n} points of the 13 factory pulls (worst error):`);
log(`   hp = torque x rpm / 5252 ........ ${(worst.hp * 100).toFixed(2)}% (integer rounding of the readouts)`);
log(`   air = VE x MAP/(R T) x Vcyl ..... ${(worst.air * 100).toFixed(2)}%`);
log(`   MAF = air x cyl x rpm / 120 ..... ${(worst.maf * 100).toFixed(2)}%`);
log(`   wheel tq = BMEP Vd/4pi x 0.85 ... ${(worst.bmep * 100).toFixed(2)}%`);
log(`   BSFC = (MAF/AFR) / crank hp ..... ${(worst.bsfc * 100).toFixed(2)}%`);
log(`   points beating the air-standard Otto efficiency: ${otto}; best brake efficiency ${(maxEff * 100).toFixed(1)}%; median above 3000 rpm ${(effs.sort((a, b) => a - b)[effs.length >> 1] * 100).toFixed(1)}% (real SI engines at full load: about 30-38%)`);

// ---- 2. Factory ratings ----
log(''); log('2. Peak crank power and torque against the makers\' ratings:');
const RATED = { 'vq35de-revup': [300, 260], vq35hr: [306, 268], n54: [302, 295], 'b58-m0': [320, 330], 'b58-m1': [382, 369], 'ea888-gti': [220, 258], 'ea888-r': [292, 280], ls1: [350, 375], ls6: [400, 395], lq4: [325, 370], lm7: [295, 335], lr4: [285, 295], 'hemi-392': [475, 470] };
const errs = [];
for (const preset of S.ENGINE_PRESETS) {
  const { r } = pull(preset);
  const hp = r.peakHp / S.DRIVETRAIN_EFF; const tq = r.peakTq / S.DRIVETRAIN_EFF; const [rh, rt] = RATED[preset.id];
  errs.push(Math.abs(pct(hp, rh)));
  log(`   ${preset.name.padEnd(26)} ${hp.toFixed(0).padStart(4)} hp (${pct(hp, rh) >= 0 ? '+' : ''}${pct(hp, rh).toFixed(1)}%)  ${tq.toFixed(0).padStart(4)} lb-ft (${pct(tq, rt) >= 0 ? '+' : ''}${pct(tq, rt).toFixed(1)}%)`);
}
log(`   mean absolute power error ${(errs.reduce((a, b) => a + b) / errs.length).toFixed(1)}%`);

// ---- 3. Sensitivities against independent references ----
log(''); log('3. Sensitivities, VQ35DE Rev-Up at 5000 rpm, full throttle, MBT or knock-limited spark:');
const preset = S.presetById('vq35de-revup'); const patch = S.applyPreset(preset);
const fuel93 = S.OCTANE_OPTS[patch.octaneIdx];
const pt = (o = {}) => {
  const derived = S.deriveEngine({ ...patch.engineConfig, ...(o.engine ?? {}) });
  const base = { rpm: 5000, mapKpa: o.map ?? 100, boostPsi: 0, veVal: 97.4, afrCommanded: o.afr ?? 12.85, fuel: o.fuel ?? fuel93, mods: { ...patch.mods, turboFitted: false }, mafScalar: 1, mafErrorBase: 1, injectorCc: 400, ecuInjectorCc: 400, derived, compressor: S.presetCompressor(preset), turbine: null, ecu: o.env ? { env: o.env } : undefined };
  const probe = S.evaluatePoint({ ...base, timingVal: 10 });
  const t = o.timing ?? Math.min(probe.threshold - 0.5, probe.mbtIdeal);
  return S.evaluatePoint({ ...base, timingVal: t });
};
const b = pt();
const hot = pt({ env: { ambientK: 308.15, baroKpa: 101.325 } });
const base25 = pt({ env: { ambientK: 298.15, baroKpa: 101.325 } });
log(`   +10 C intake air: ${pct(hot.hp, base25.hp).toFixed(1)}%   [SAE J1349 correction: -1.9%; ideal density alone: -3.2%] (charge temp ${base25.iat} -> ${hot.iat} C)`);
const alt = pt({ map: 90, env: { ambientK: 298.15, baroKpa: 90 } });
log(`   barometer 101 -> 90 kPa (about 1000 m): ${pct(alt.hp, base25.hp).toFixed(1)}%   [J1349: about -11 to -13%; density alone: -11.2%]`);
const mbt = b.mbtIdeal; const at = (d) => pt({ timing: mbt + d });
log(`   spark 5 / 10 / 20 degrees retarded from MBT: ${pct(at(-5).hp, at(0).hp).toFixed(1)}% / ${pct(at(-10).hp, at(0).hp).toFixed(1)}% / ${pct(at(-20).hp, at(0).hp).toFixed(1)}%   [Heywood's torque-vs-spark curve: about -1 / -4 / -15%]`);
const lam = (l) => pt({ afr: 14.7 * l });
log(`   lambda 0.87 -> 1.00: ${pct(lam(1).hp, lam(0.87).hp).toFixed(1)}%;  0.87 -> 0.75: ${pct(lam(0.75).hp, lam(0.87).hp).toFixed(1)}%   [best power lambda 0.85-0.90, a few % down either side]`);
const cr = pt({ engine: { compression: 11.3 }, fuel: S.OCTANE_OPTS[S.OCTANE_OPTS.length - 1] });
const cr0 = pt({ fuel: S.OCTANE_OPTS[S.OCTANE_OPTS.length - 1] });
log(`   compression 10.3 -> 11.3 (race fuel, no knock): ${pct(cr.hp, cr0.hp).toFixed(1)}%   [air-standard Otto: +${pct(1 - Math.pow(11.3, -0.4), 1 - Math.pow(10.3, -0.4)).toFixed(1)}%; real engines about +2-3%]`);
const oct = S.OCTANE_OPTS.map((f) => `${f.label} ${pt({ fuel: f }).timing.toFixed(1)} deg`).join(', ');
log(`   knock-limited spark by fuel: ${oct}`);
console.log(out.join('\n'));
