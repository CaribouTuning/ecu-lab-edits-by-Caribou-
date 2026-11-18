#!/usr/bin/env node
/**
 * How the game's engines and tunes compare with real ones (docs/realism.md).
 *
 *   node scripts/realism-audit.js [--tau 2.5] [--only gm|epa|boost]
 *
 * 1. Spark against GM's own stock calibrations (data/realism/gm-stock-spark.json): at full
 *    throttle, on the fuel GM calibrated for, the physics' knock limit must sit at or above
 *    the spark GM shipped (a production calibration does not knock on its own fuel), and the
 *    game's factory spark is set beside GM's.
 * 2. Brake efficiency against EPA-measured engine maps (data/realism/epa/*.csv, ALPHA map
 *    packages), at the EPA's own speeds and loads, by load band.
 * 3. Boosted spark: an intercooled LS1 on 93 against what LS turbo tuners run.
 *
 * `--tau` sets the knock model's one fitted constant (COEFF.KNOCK_TAU_SCALE) for this run only.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { COEFF } from '../src/sim/coefficients.js';
import * as S from '../src/sim/index.js';
import { makeInitialState } from '../src/ui/state/initialState.js';
import { pullInputs } from '../src/ui/state/pullInputs.js';
import { ACTIONS, reducer } from '../src/ui/state/reducer.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : null; };
if (arg('tau')) COEFF.KNOCK_TAU_SCALE = Number(arg('tau'));
const only = arg('only');

const set = (st, field, value) => reducer(st, { type: ACTIONS.SET_BUILD_FIELD, field, value });
const fromPreset = (preset) => reducer(makeInitialState(), { type: ACTIONS.APPLY_PRESET, preset: S.applyPreset(preset) });
const pull = (st, load = 100) => S.simulateSweep(pullInputs({ ...st, session: { ...st.session, loadKpa: load } }).args);
const fuelIdx = (label) => S.FUEL_CHOICES.findIndex((f) => f.label === label);
const lerp = (xs, x) => {
  if (x <= xs[0]) return [0, 0, 0];
  if (x >= xs[xs.length - 1]) return [xs.length - 1, xs.length - 1, 0];
  let i = 0;
  while (x > xs[i + 1]) i += 1;
  return [i, i + 1, (x - xs[i]) / (xs[i + 1] - xs[i])];
};
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const f1 = (v) => (Number.isFinite(v) ? `${v >= 0 ? '+' : ''}${v.toFixed(1)}` : '—');

console.log(`KNOCK_TAU_SCALE ${COEFF.KNOCK_TAU_SCALE}`);

if (!only || only === 'gm') {
  const gm = JSON.parse(readFileSync(join(root, 'data/realism/gm-stock-spark.json'), 'utf8'));
  console.log('\nSpark at full throttle against GM stock calibrations (game minus GM, degrees)');
  for (const [id, g] of Object.entries(gm.engines)) {
    const premium = /premium/.test(g.fuel);
    const want = premium ? '91' : '87';
    const idx = fuelIdx(want) >= 0 ? fuelIdx(want) : fuelIdx('91');
    const st = set(fromPreset(S.presetById(id)), 'octaneIdx', idx);
    const p = pull(st);
    // GM's spark at the air the game's engine traps, between its 0.60 and 0.80 g/cylinder rows.
    const gmAt = (rpm, gcyl, k) => {
      const [c0, c1, fc] = lerp(gm.rpm, rpm);
      const row = (r) => (1 - fc) * r[c0][k] + fc * r[c1][k];
      const fr = Math.min(1, Math.max(0, (gcyl - 0.6) / 0.2));
      return (1 - fr) * row(g.spark_0_60_gcyl) + fr * row(g.spark_0_80_gcyl);
    };
    const pts = p.points.filter((q) => q.rpm >= 1600 && q.rpm <= st.build.engineConfig.redline && q.rpm % 400 === 0);
    const band = (lo, hi, f) => mean(pts.filter((q) => q.rpm >= lo && q.rpm < hi).map(f));
    const factory = (q) => q.commandedTiming - gmAt(q.rpm, q.airCharge, 0);
    const room = Math.min(...pts.map((q) => q.threshold - gmAt(q.rpm, q.airCharge, 2)));
    console.log(`  ${id.padEnd(4)} on ${S.FUEL_CHOICES[idx].label}${S.FUEL_CHOICES[idx].label !== want ? ` (GM's ${want} is not offered)` : ''}, ${g.calibrations.length} calibration(s) | factory spark < 2000 ${f1(band(0, 2000, factory))}  2000–4000 ${f1(band(2000, 4000, factory))}  ≥ 4000 ${f1(band(4000, 1e9, factory))} | knock limit minus GM's most advanced: worst ${f1(room)}${room < 0 ? '  (the physics says GM\'s own calibration knocks)' : ''}`);
  }
}

if (!only || only === 'epa') {
  // Published figures for each engine; the EPA package's own test fuel.
  const ENGINES = {
    lv3: { name: '2014 GM 4.3 L LV3', cfg: 'V6', cyl: 6, bore: 99.6, stroke: 92, cr: 11.0, vt: 'ohv', vpc: 2, hp: 285, hpRpm: 5300, tq: 305, tqRpm: 3900, redline: 6000, fuel: '93' },
    lcv: { name: '2013 GM 2.5 L LCV', cfg: 'I4', cyl: 4, bore: 88, stroke: 101, cr: 11.3, vt: 'dohc', vpc: 4, hp: 197, hpRpm: 6300, tq: 191, tqRpm: 4400, redline: 7000, fuel: '87' },
    mz20: { name: '2014 Mazda 2.0 L SKYACTIV-G', cfg: 'I4', cyl: 4, bore: 83.5, stroke: 91.2, cr: 13.0, vt: 'dohc', vpc: 4, hp: 155, hpRpm: 6000, tq: 150, tqRpm: 4000, redline: 6500, fuel: '87' },
  };
  console.log('\nBrake efficiency against EPA-measured maps (game minus EPA, percentage points, by BMEP)');
  const base = S.presetById('lm7');
  for (const [key, E] of Object.entries(ENGINES)) {
    const rows = readFileSync(join(root, `data/realism/epa/${key}.csv`), 'utf8').trim().split('\n').slice(1).map((l) => l.split(',').map(Number));
    const vd = E.cyl * Math.PI / 4 * (E.bore / 1000) ** 2 * (E.stroke / 1000);
    const bmepOf = (nm) => nm * 4 * Math.PI / vd / 1e5;
    const speeds = [...new Set(rows.map((r) => Math.round(r[0] / 50) * 50))].sort((a, b) => a - b);
    const effAt = (rpm, bmep) => {
      const s = speeds.reduce((b, x) => (Math.abs(x - rpm) < Math.abs(b - rpm) ? x : b));
      if (Math.abs(s - rpm) > 260) return null;
      const at = rows.filter((r) => Math.round(r[0] / 50) * 50 === s).map((r) => [bmepOf(r[1]), r[4]]).sort((a, b) => a[0] - b[0]);
      for (let i = 0; i < at.length - 1; i += 1) {
        if (bmep >= at[i][0] && bmep <= at[i + 1][0]) return at[i][1] + ((bmep - at[i][0]) / (at[i + 1][0] - at[i][0])) * (at[i + 1][1] - at[i][1]);
      }
      return null;
    };
    const idx = fuelIdx(E.fuel) >= 0 ? fuelIdx(E.fuel) : fuelIdx('91');
    const st = fromPreset({
      ...base, id: `${key}-realism`, name: E.name,
      factory: { crankHp: E.hp, crankHpRpm: E.hpRpm, crankTq: E.tq, crankTqRpm: E.tqRpm, displacementL: vd * 1000 },
      engine: { ...base.engine, configuration: E.cfg, bore: E.bore, stroke: E.stroke, compression: E.cr, injection: 'direct', valvetrain: E.vt, valvesPerCyl: E.vpc, blockMaterial: 'Aluminum', headMaterial: 'Aluminum', frictionLevel: 'modern', redline: E.redline, camDuration: 205, exhaustCamDuration: 205, intakeValveMm: undefined, intakePortCfm: undefined },
      parts: { ...base.parts, octaneIdx: idx },
    });
    const bands = { '<6': [], '6-9': [], '9-11': [], '>11': [] };
    for (const load of [100, 60, 40, 30, 25, 20, 16, 13, 10]) {
      for (const q of pull(st, load).points.filter((x) => x.rpm >= 1500 && x.rpm <= E.redline - 500 && x.rpm % 500 === 0)) {
        const e = effAt(q.rpm, q.bmep);
        if (e == null || q.bmep < 1) continue;
        const kW = (q.hp / S.DRIVETRAIN_EFF) * 0.7457;
        const game = (kW * 1000) / ((q.maf / q.afr) * 43e3) * 100;
        bands[q.bmep < 6 ? '<6' : q.bmep < 9 ? '6-9' : q.bmep < 11 ? '9-11' : '>11'].push(game - e);
      }
    }
    console.log(`  ${E.name.padEnd(28)} | ${Object.entries(bands).map(([k, v]) => `${k} bar ${f1(mean(v))} (${v.length})`).join(' | ')}`);
  }
}

if (!only || only === 'boost') {
  // What LS turbo tuners run on 93 with an intercooler (docs/realism.md): about 19 degrees at
  // 7 psi and 16 at 10 psi.
  console.log('\nBoosted spark, LS1, intercooled, 93 (the physics\' safe spark: 1.5° under the knock limit or MBT)');
  for (const [psi, want] of [[7, 19], [10, 16]]) {
    let st = fromPreset(S.presetById('ls1'));
    st = set(set(set(set(set(st, 'turboOn', true), 'mods', { ...st.build.mods, intercooler: true }), 'compressorIdx', 2), 'boostCurve', [0, psi, psi, psi, psi, psi, psi, psi]), 'octaneIdx', fuelIdx('93'));
    const at = pull(st).points.filter((q) => [3200, 4000, 4800].includes(q.rpm) && q.boostPsi > psi - 1);
    console.log(`  ${psi} psi: tuners about ${want}° | ${at.map((q) => `${q.rpm}: ${Math.min(q.threshold - 1.5, q.mbtIdeal).toFixed(1)}° at ${q.boostPsi.toFixed(1)} psi`).join(' | ') || 'boost not reached'}`);
  }
}
