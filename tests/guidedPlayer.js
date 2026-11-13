/**
 * A guided player: tunes using ONLY what the game shows. Each round it pulls, reads the pull
 * log and does what its entries say (the values they name, on the pages they name), then what
 * TUNE's advisor lists cell by cell, and for a hunting idle what LIVE says. It stops at a pass,
 * or when nothing it is told to do changes anything.
 *
 * The tests hold the game to it (tests/guided-workflow.test.js): if a job or a SANDBOX build
 * cannot be finished this way, the log or the advisor is not leading the player to the fix.
 */

import * as S from '../src/sim/index.js';
import { customerCar } from '../src/ui/career/cars.js';
import { evaluateJob } from '../src/ui/career/evaluate.js';
import { layoutSwitch } from '../src/ui/state/layoutSwitch.js';
import { pullInputs } from '../src/ui/state/pullInputs.js';
import { reducer as RED } from '../src/ui/state/reducer.js';

const at = (st, load) => ({ ...st, session: { ...st.session, loadKpa: load } });
export const pull = (st, load = 100) => S.simulateSweep(pullInputs(at(st, load)).args);
export const setCal = (st, path, v) => ({ ...st, tune: { ...st.tune, ecu: S.setCal(st.tune.ecu, path, v) } });
export const setBuild = (st, patch) => ({ ...st, build: { ...st.build, ...patch } });
export function advice(st, p) {
  const { args, veTruth, mafErrorBase } = pullInputs(at(st, p.loadKpa ?? 100));
  return S.calibrationAdvice({ ve: st.tune.ve, veTruth, timing: st.tune.timing, afr: st.tune.afr, layout: st.tune.layout, derived: args.derived,
    octaneBonus: args.octaneBonus, fuel: args.fuel, mods: args.mods, turboOn: args.turboOn, boostCurve: args.boostCurve, compressor: args.compressor, turbine: args.turbine,
    camAt: S.intakeCamAt(st.build.engineConfig, st.tune.ecu?.vvt), exhaustDia: args.exhaustDia, injectorCc: args.injectorCc, ecuInjectorCc: args.ecuInjectorCc,
    mafScalar: args.mafScalar, mafErrorBase, pull: p });
}
const FUELLING = ['injscale', 'maf', 'missedmix', 'rich', 'lean', 'misfire'];
function veFromLogs(st, pulls) {
  const axes = S.layoutById(st.tune.layout).ve;
  const { ratio } = S.veCorrections(pulls.flatMap((r) => S.veSamplesFromPull(r.points)), axes);
  const carried = ratio.map((row) => { let last = null; return row.map((r) => (r == null ? last : (last = r))); });
  return { ...st, tune: { ...st.tune, ve: S.applyVeCorrections(st.tune.ve, carried, 1) } };
}
/** One round: what the log says first (setup, then fuelling, then spark), then TUNE. */
export function round(st) {
  const did = []; const cannot = [];
  const p = pull(st);
  for (const e of p.events) {
    const fix = String(e.fix ?? '');
    if (e.type === 'injscale') { const m = /to (\d+) cc\/min/.exec(fix); if (m) { st = setBuild(st, { ecuInjectorCc: Number(m[1]) }); did.push(`injectors ${m[1]}cc`); } else cannot.push(e.type); }
    else if (e.type === 'maf') { const m = /to about ([0-9.]+), which cancels/.exec(fix); if (m) { st = setBuild(st, { mafScalar: Number(m[1]) }); did.push(`MAF ${m[1]}`); } else cannot.push(e.type); }
    else if (e.type === 'nitrousknock') { const m = /retard while spraying to about (\d+)°/.exec(fix); if (m) { st = setCal(st, 'nitrous.retardDeg', Number(m[1])); did.push(`N2O retard ${m[1]}`); } else cannot.push(`${e.type}: ${fix.slice(0, 120)}`); }
    else if (['rich', 'lean'].includes(e.type) && /Fuel correction while spraying by about (\d+) points/.test(fix)) {
      const m = /(lower|raise) Fuel correction while spraying by about (\d+) points/.exec(fix);
      const cur = S.getCal(st.tune.ecu, 'nitrous.fuelTrimPct'); const d = Number(m[2]) * (m[1] === 'lower' ? -1 : 1);
      st = setCal(st, 'nitrous.fuelTrimPct', cur + d); did.push(`N2O fuel ${d > 0 ? '+' : ''}${d}`);
    }
    else if (e.type === 'falseknock') {
      const t = S.getCal(st.tune.ecu, 'ignition.knockThreshold'); st = setCal(st, 'ignition.knockThreshold', { ...t, z: t.z.map((v) => v * 1.1) }); did.push('knock threshold +10%');
    }
    else if (/set the Table layout to Sized, 16 × 16/.test(fix) && st.tune.layout?.id !== 'engine') { st = RED(st, layoutSwitch(st, 'engine')); did.push('layout: sized 16x16'); }
    else if (e.type === 'iatprot' && /fit an intercooler/.test(fix) && !st.build.mods.intercooler) { st = setBuild(st, { mods: { ...st.build.mods, intercooler: true } }); did.push('intercooler'); }
    else if (e.type === 'rail' && /higher-flow fuel pump/.test(fix)) {
      const fs = st.build.fuelSystem; if (fs.pumpIdx < 3) { st = setBuild(st, { fuelSystem: { ...fs, pumpIdx: fs.pumpIdx + 1 } }); did.push(`pump ${fs.pumpIdx + 1}`); } else cannot.push(e.type);
    }
    else if (e.type === 'fuel') {
      // Injectors maxed: the log says fit bigger and enter their flow, or lower the rev limit.
      const next = Math.min(st.build.injIdx + 1, S.INJECTOR_OPTS.length - 1);
      if (next !== st.build.injIdx) { st = setBuild(st, { injIdx: next, ecuInjectorCc: S.INJECTOR_OPTS[next].cc }); did.push(`injectors up to ${S.INJECTOR_OPTS[next].cc}cc`); } else cannot.push(e.type);
    }
  }
  if (did.length) return { st, did, cannot };
  // VE from logs wherever the engine missed its table, at every throttle the player can pull.
  const pulls = [100, 70, 40].map((l) => (l === 100 ? p : pull(st, l)));
  if (pulls.some((r) => r.events.some((e) => ['missedmix', 'rich', 'lean'].includes(e.type) && !/while spraying/.test(String(e.fix))))) {
    st = veFromLogs(st, pulls); return { st, did: ['VE from logs'], cannot };
  }
  // TUNE's cells, at each throttle.
  let n = 0;
  for (const r of pulls) {
    const a = advice(st, r);
    for (const c of [...a.overAdvanced, ...a.pastMbt, ...a.underAdvanced]) if (st.tune.timing[c.ri][c.ci] !== c.suggested) { st.tune.timing[c.ri][c.ci] = c.suggested; n++; }
    for (const c of a.wrongMix) if (c.suggested != null && st.tune.afr[c.ri][c.ci] !== c.suggested) { st.tune.afr[c.ri][c.ci] = c.suggested; n++; }
  }
  if (n) did.push(`${n} TUNE cells`);
  for (const e of p.events) if (!['injscale', 'maf', 'nitrousknock', 'falseknock', 'fuel', ...FUELLING, 'knock', 'timing', 'cam', 'bearing', 'pressure', 'piston'].includes(e.type)) cannot.push(`${e.type}: ${e.msg}`);
  return { st, did, cannot };
}
/** LIVE's advice for a hunting idle: raise damping, lower the air gains, a step at a time. */
export const idleStep = (st) => {
  const i = st.tune.ecu.idle;
  return setCal(setCal(setCal(st, 'idle.damp', Math.min(0.05, i.damp * 1.6)), 'idle.gainUp', i.gainUp / 1.4), 'idle.gainDown', i.gainDown / 1.4);
};
const clone = (st) => JSON.parse(JSON.stringify(st));
export function solve(job, prep = (x) => x) {
  let st = prep(clone(customerCar(job.car))); const path = []; const cannot = new Set();
  for (let i = 0; i < 12; i++) {
    const v = evaluateJob(job, st);
    if (v.verdict === 'pass') return { ok: true, path, v, cannot };
    const idleFail = v.results.some((x) => !x.pass && x.check.type === 'idle');
    const r = round(st);
    r.cannot.forEach((c) => cannot.add(c));
    if (r.did.length) { st = r.st; path.push(r.did.join(', ')); continue; }
    if (idleFail) { st = idleStep(st); path.push('LIVE: idle damping up, gains down'); continue; }
    return { ok: false, path, v, cannot };
  }
  return { ok: false, path, v: evaluateJob(job, st), cannot };
}
