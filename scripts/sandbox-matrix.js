#!/usr/bin/env node
/**
 * The SANDBOX matrix: every factory engine changed each way a player changes one (bolt-ons, a
 * cam, compression, a turbo, more boost, a supercharger, nitrous, E85, the rev limit), then
 * tuned by the guided player (tests/guidedPlayer.js), who acts only on what the game says.
 * node scripts/sandbox-matrix.js [shard/of] [filter]
 * node scripts/sandbox-matrix.js 0/3          # a third of it
 * node scripts/sandbox-matrix.js 0/1 "ls1 cam" # one build
 */
const R = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const S = await import(R + '/src/sim/index.js');
const { makeInitialState } = await import(R + '/src/ui/state/initialState.js');
const { reducer, ACTIONS } = await import(R + '/src/ui/state/reducer.js');
const G = await import(R + '/tests/guidedPlayer.js');
const FAULTS = ['backpressure', 'knock', 'unheardknock', 'lean', 'rich', 'missedmix', 'maf', 'injscale', 'misfire', 'fuel', 'falseknock', 'nitrousknock', 'nitrouslean', 'timing', 'pastTable', 'valve', 'piston', 'leanprot', 'knockprot', 'egtprot', 'dutyprot', 'iatprot', 'rail', 'underboost'];
const B = (st, field, value) => reducer(st, { type: ACTIONS.SET_BUILD_FIELD, field, value });
const E = (st, patch) => reducer(st, { type: ACTIONS.SET_ENGINE_CONFIG_PATCH, patch });
const preset = (id) => reducer(makeInitialState(), { type: ACTIONS.APPLY_PRESET, preset: S.applyPreset(S.presetById(id)) });
const mods = (st, m) => B(st, 'mods', { ...st.build.mods, ...m });
const MODS = {
  'bolt-ons': (st) => mods(st, { intake: true, exhaust: true, headers: true }),
  'cam +12': (st) => { const c = st.build.engineConfig; return E(st, { camDuration: c.camDuration + 12, exhaustCamDuration: (c.exhaustCamDuration ?? c.camDuration) + 12, springRate: Math.max(c.springRate ?? 50, 80) }); },
  'compression +1 on 93': (st) => B(E(st, { compression: st.build.engineConfig.compression + 1 }), 'octaneIdx', 1),
  'turbo 8 psi': (st) => st.build.turboOn ? null : B(B(B(mods(B(st, 'turboOn', true), { intercooler: true }), 'compressorIdx', 1), 'boostCurve', [0, 2, 6, 8, 8, 8, 8, 8]), 'octaneIdx', 1),
  'boost +4 psi': (st) => st.build.turboOn ? B(st, 'boostCurve', st.build.boostCurve.map((b) => (b > 0 ? b + 4 : b))) : null,
  'TVS1900': (st) => { if (st.build.turboOn) return null; let s = B(mods(B(st, 'blowerId', 'tvs1900'), { intercooler: true }), 'octaneIdx', 1); return B(s, 'blowerRatio', S.starterRatio(s.build, S.tankFuel(s.build))); },
  '75 shot wet': (st) => B(st, 'nitrous', { kit: 'wet', shotHp: 75, heater: true, bottleLb: 10 }),
  'E85': (st) => B(st, 'octaneIdx', 3),
  'rev limit +500': (st) => E(st, { redline: st.build.engineConfig.redline + 500 }),
};
const ids = S.ENGINE_PRESETS.map((p) => p.id);
const [shard, of] = (process.argv[2] ?? '0/1').split('/').map(Number);
let n = 0;
for (const id of ids) for (const [name, mod] of Object.entries(MODS)) {
  if (n++ % of !== shard) continue;
  if (process.argv[3] && !`${id} ${name}`.includes(process.argv[3])) continue;
  const t0 = Date.now();
  const base = preset(id);
  const stockHp = G.pull(base).peakHp;
  let st = mod(base);
  if (!st) continue;
  const path = []; const cannot = new Set();
  for (let i = 0; i < 20; i++) { const r = G.round(st); r.cannot.forEach((c) => cannot.add(c)); if (!r.did.length) break; st = r.st; path.push(r.did.join(', ')); }
  const p = G.pull(st); const a = G.advice(st, p);
  const left = p.events.filter((e) => FAULTS.includes(e.type));
  const cells = a.overAdvanced.length + a.pastMbt.length + a.underAdvanced.length + a.wrongMix.length;
  const gain = (p.peakHp / stockHp - 1) * 100;
  const ok = !left.length && !cells;
  console.log(`${ok ? 'DONE' : 'OPEN'} pulls=${path.length + 1} ${id} | ${name} | stock ${stockHp} → ${p.peakHp} whp (${gain >= 0 ? '+' : ''}${gain.toFixed(1)}%) score ${S.computeTuningScore(p).score} ${((Date.now() - t0) / 1000).toFixed(0)}s | ${path.join(' | ')}`);
  for (const e of left) console.log(`      ${e.type}: ${e.msg} || ${String(e.fix).slice(0, 220)}`);
  if (cells) console.log(`      TUNE lists ${cells}`);
  for (const e of p.events.filter((e) => !FAULTS.includes(e.type) && !S.HARDWARE_EVENT_TYPES?.has?.(e.type))) console.log(`      other: ${e.type} -${e.impact} ${e.msg} || ${String(e.fix).slice(0, 160)}`);
}
