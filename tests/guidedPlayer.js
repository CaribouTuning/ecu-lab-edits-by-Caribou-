/** A guided player: tunes using ONLY what the game shows. */

import * as S from '../src/sim/index.js';
import { customerCar } from '../src/ui/career/cars.js';
import { evaluateJob } from '../src/ui/career/evaluate.js';
import { layoutSwitch } from '../src/ui/state/layoutSwitch.js';
import { pullInputs } from '../src/ui/state/pullInputs.js';
import { reducer as RED } from '../src/ui/state/reducer.js';

/**
 * The throttles the player pulls at: full throttle only (the dyno's Run, what most players do)
 * when GUIDED_FULL_ONLY is set, else full, 70 % and 40 % (a player who also logs part throttle).
 */
const loads = () => (typeof process !== 'undefined' && process.env?.GUIDED_FULL_ONLY ? [100] : [100, 70, 40]);
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
/** The table row the log names (it rounds 87.5 to 88). */
const rowNear = (ax, kpa) => ax.load.findIndex((l) => Math.abs(l - kpa) < 1);
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
      // One change a round: two entries naming the same correction are one correction.
      if (did.some((x) => x.startsWith('N2O fuel'))) continue;
      st = setCal(st, 'nitrous.fuelTrimPct', cur + d); did.push(`N2O fuel ${d > 0 ? '+' : ''}${d}`);
    }
    else if (/raise Fuel correction while spraying on TUNE → NITROUS until the spray reads about/.test(fix) && !did.some((x) => x.startsWith('N2O fuel'))) {
      // No figure: a step at a time, pulling again, until the spray reads what the log asks.
      st = setCal(st, 'nitrous.fuelTrimPct', S.getCal(st.tune.ecu, 'nitrous.fuelTrimPct') + 10); did.push('N2O fuel +10');
    }
    else if (e.type === 'egtprot' && /run a smaller shot on TUNE → NITROUS/.test(fix) && st.build.nitrous?.shotHp > 25) {
      // The log says the heat is the shot's own: a tuner steps the jet down.
      st = setBuild(st, { nitrous: { ...st.build.nitrous, shotHp: st.build.nitrous.shotHp - 25 } }); did.push(`shot down to ${st.build.nitrous.shotHp} hp`);
    }
    else if (e.type === 'torquelimit' && /raise Crank torque limit by RPM on TUNE → TORQUE/.test(fix) && !did.some((x) => x.startsWith('torque limit'))
      && (st.build.octaneIdx !== S.presetById(st.build.originPresetId ?? st.build.presetId ?? '')?.parts.octaneIdx
        || JSON.stringify(st.build.boostCurve) !== JSON.stringify(st.build.factoryInduction?.boostCurve ?? st.build.boostCurve))) {
      // The note is the engine computer's own limit, not a fault: a player who asked for more
      // than the factory (boost, fuel) raises it, as the note says, a step at a time.
      const t = S.getCal(st.tune.ecu, 'torque.limitByRpm');
      st = setCal(st, 'torque.limitByRpm', { ...t, z: t.z.map((v) => Math.round(v * 1.2)) }); did.push('torque limit +20%');
    }
    else if (e.type === 'falseknock') {
      const t = S.getCal(st.tune.ecu, 'ignition.knockThreshold'); st = setCal(st, 'ignition.knockThreshold', { ...t, z: t.z.map((v) => v * 1.1) }); did.push('knock threshold +10%');
    }
    else if (/set the Table layout to Sized, 16 × 16/.test(fix) && st.tune.layout?.id !== 'engine') { st = RED(st, layoutSwitch(st, 'engine')); did.push('layout: sized 16x16'); }
    // The boost is the last of the knock entry's steps: taken only where the log says timing
    // cannot do it (no spark the table holds is safe). Otherwise the mixture and the timing
    // come first, from the log's fuel entries and TUNE's cells, as the entry lists them.
    else if (st.build.turboOn && /lower the boost target (there|across)/i.test(fix) && !/fit an intercooler/.test(fix)
      && (e.type !== 'knock' || /Timing alone can't fix this/.test(fix))) {
      // The log names the range; a tuner takes a psi and a half out there and pulls again.
      const curve = st.build.boostCurve.map((b, i) => (S.CURVE_RPM[i] >= e.rpmStart - 500 && S.CURVE_RPM[i] <= e.rpmEnd + 500 && b > 0 ? Math.max(0, b - 1.5) : b));
      if (curve.some((b, i) => b !== st.build.boostCurve[i])) { st = setBuild(st, { boostCurve: curve }); did.push(`boost -1.5 psi ${e.rpmStart}-${e.rpmEnd}`); } else cannot.push(e.type);
    }
    else if (e.type === 'underboost' && /fit a larger compressor/.test(fix)) {
      // A larger compressor while there is one; then the target the turbo holds, as the log says.
      const m = /about ([0-9.]+) psi at (\d+) RPM/.exec(fix);
      if (st.build.compressorIdx < 2) { st = setBuild(st, { compressorIdx: st.build.compressorIdx + 1 }); did.push(`compressor ${S.COMPRESSOR_OPTS[st.build.compressorIdx].label ?? st.build.compressorIdx}`); }
      else if (m) {
        const hold = Number(m[1]);
        const curve = st.build.boostCurve.map((b, i) => (S.CURVE_RPM[i] >= e.rpmStart - 500 && b > hold ? hold : b));
        st = setBuild(st, { boostCurve: curve }); did.push(`boost held to ${hold} psi up top`);
      } else cannot.push(e.type);
    }
    else if (e.type === 'backpressure' && /fit a larger turbine housing or twin turbos/.test(fix)) {
      if (st.build.turbineIdx < S.TURBINE_OPTS.length - 1) { st = setBuild(st, { turbineIdx: st.build.turbineIdx + 1 }); did.push(`turbine ${S.TURBINE_OPTS[st.build.turbineIdx].label}`); }
      else if ((st.build.turbineCount ?? 1) < 2) { st = setBuild(st, { turbineCount: 2 }); did.push('twin turbos'); }
      else cannot.push(e.type);
    }
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
  // Lean protection that took the boost out comes before Correct VE from logs, as its entry
  // says: the logs cannot see the cells it hid until the boost stays in. The log names the
  // rows, the range and the share.
  for (const e of p.events) {
    // "the rows around K kPa" (the two bracketing K) or "the rows from A to B kPa" (every row
    // from the one at or below A to the one at or above B).
    const m = /raise the VE cells in the rows (?:around (\d+)|from (\d+) to (\d+)) kPa across (\d+)(?:–(\d+))? RPM by about (\d+)%/.exec(String(e.fix ?? ''));
    if (e.type !== 'leanprot' || !m) continue;
    const ax = S.layoutById(st.tune.layout).ve;
    const a = Number(m[1] ?? m[2]); const b = Number(m[1] ?? m[3]);
    const lo = Number(m[4]); const hi = Number(m[5] ?? m[4]); const f = 1 + Number(m[6]) / 100;
    const bottom = Math.max(...ax.load.filter((l) => l <= a), Math.min(...ax.load));
    const top = Math.min(...ax.load.filter((l) => l >= b), Math.max(...ax.load));
    const ve = st.tune.ve.map((r) => [...r]);
    ax.load.forEach((l, ri) => { if (l < bottom || l > top) return; ax.rpm.forEach((r, ci) => { if (r >= lo - 500 && r <= hi + 500) ve[ri][ci] = Number((ve[ri][ci] * f).toFixed(1)); }); });
    st = { ...st, tune: { ...st.tune, ve } }; did.push(`VE +${m[6]}% ${a === b ? `around ${a}` : `${a}-${b}`} kPa ${lo}-${hi} (lean protection)`);
  }
  if (did.some((d) => /lean protection/.test(d))) return { st, did, cannot };
  // A setup fix (injector flow, the MAF, a part) changes every reading: pull again before the
  // VE answers a log taken without it, or the table soaks up the setup's error (a custom V6 on
  // 550 cc injectors the ECU still called 315 had its VE cut 40%, then ran 15:1 lean).
  if (did.length) return { st, did, cannot };
  // The log's order: where it says Correct VE from logs can do it, that first (when it would
  // change something); the hand edits it names are for the cells the log cannot reach.
  const loadPulls = loads().map((l) => (l === 100 ? p : pull(st, l)));
  const viaLogs = loadPulls.some((r) => r.events.some((e) => ['missedmix', 'rich', 'lean'].includes(e.type)
    && /or use Correct VE from logs there/.test(String(e.fix ?? ''))));
  if (viaLogs) {
    const next = veFromLogs(st, loadPulls);
    const moved = next.tune.ve.some((row, ri) => row.some((v, ci) => Math.abs(v / st.tune.ve[ri][ci] - 1) > 0.005));
    if (moved) return { st: next, did: ['VE from logs (the log\'s first step)'], cannot };
  }
  // A column past the redline: the log says by how much to move it by hand, and in which rows,
  // on whichever throttle's pull met it.
  const handText = /column is past the \d+ RPM redline|too briefly to trust/;
  const handPulls = [loads().map((l) => (l === 100 ? p : pull(st, l))).find((r) => r.events.some((e) => handText.test(String(e.fix ?? '')))) ?? p];
  for (const e of handPulls.flatMap((r) => r.events)) {
    const fix = String(e.fix ?? '');
    const col = /The (\d+) RPM column is past the \d+ RPM redline[^:]*: (lower|raise) it by hand by about (\d+)%/.exec(fix);
    const pct = col ? [col[0], col[3]] : null;
    const rows = /in the ([0-9.]+)(?: and ([0-9.]+))? kPa load rows?/.exec(fix);
    if (!col || !pct || !rows) continue;
    const ax = S.layoutById(st.tune.layout).ve;
    const ci = ax.rpm.indexOf(Number(col[1]));
    const f = 1 + (col[2] === 'lower' ? -1 : 1) * Number(pct[1]) / 100;
    const ve = st.tune.ve.map((r) => [...r]);
    for (const kpa of [rows[1], rows[2]].filter(Boolean).map(Number)) { const ri = rowNear(ax, kpa); if (ri >= 0 && ci >= 0) ve[ri][ci] = Number((ve[ri][ci] * f).toFixed(1)); }
    const tag = `VE ${col[1]} column ${col[2]} ${pct[1]}% by hand (${rows[1]}${rows[2] ? `/${rows[2]}` : ''} kPa)`;
    if (did.includes(tag)) continue;
    st = { ...st, tune: { ...st.tune, ve } }; did.push(tag);
  }
  // Cells a pull crossed too briefly for Correct VE from logs: the log names each one and the
  // share to move it by hand.
  for (const e of handPulls.flatMap((r) => r.events)) {
    const fix = String(e.fix ?? '');
    const m = /Correct VE from logs leaves (.+?) alone \(this pull crossed (?:it|them) too briefly to trust\): (raise|lower) (?:it|them) by hand by about (\d+)%/.exec(fix);
    if (!m) continue;
    const ax = S.layoutById(st.tune.layout).ve;
    const f = 1 + (m[2] === 'lower' ? -1 : 1) * Number(m[3]) / 100;
    const ve = st.tune.ve.map((r) => [...r]);
    let moved = 0;
    for (const c of m[1].matchAll(/the ([0-9.]+) kPa cell at (\d+) RPM/g)) {
      const tag = `VE ${m[2]} ${m[3]}% by hand: ${c[1]} kPa at ${c[2]} RPM`;
      if (did.includes(tag)) continue;
      const ri = rowNear(ax, Number(c[1])); const ci = ax.rpm.indexOf(Number(c[2]));
      if (ri < 0 || ci < 0) continue;
      ve[ri][ci] = Number((ve[ri][ci] * f).toFixed(1)); did.push(tag); moved += 1;
    }
    if (moved) st = { ...st, tune: { ...st.tune, ve } };
  }
  // Knock protection that took the boost out: the log names the rows, the range and the degrees.
  for (const e of p.events) {
    const m = /take about (\d+)° out of the cells in the rows around (\d+) kPa across (\d+)(?:–(\d+))? RPM/.exec(String(e.fix ?? ''));
    if (e.type !== 'knockprot' || !m) continue;
    const ax = S.layoutById(st.tune.layout).timing;
    const deg = Number(m[1]); const kpa = Number(m[2]); const lo = Number(m[3]); const hi = Number(m[4] ?? m[3]);
    const below = Math.max(...ax.load.filter((l) => l <= kpa)); const above = Math.min(...ax.load.filter((l) => l >= kpa));
    const timing = st.tune.timing.map((r) => [...r]);
    ax.load.forEach((l, ri) => { if (l !== below && l !== above) return; ax.rpm.forEach((r, ci) => { if (r >= lo - 500 && r <= hi + 500) timing[ri][ci] = Math.max(S.SPARK_MIN_DEG, timing[ri][ci] - deg); }); });
    st = { ...st, tune: { ...st.tune, timing } }; did.push(`spark -${deg}° around ${kpa} kPa ${lo}-${hi} (knock protection)`);
  }
  if (did.length) return { st, did, cannot };
  // VE from logs wherever the engine missed its table, at every throttle the player can pull.
  const pulls = loads().map((l) => (l === 100 ? p : pull(st, l)));
  // Any other miss the log asks the VE table to answer, from the same samples.
  const missed = pulls.some((r) => r.events.some((e) => ['missedmix', 'rich', 'lean'].includes(e.type) && !e.gridBound && !/while spraying/.test(String(e.fix))));
  if (missed) {
    const next = veFromLogs(st, pulls);
    if (next.tune.ve.some((row, ri) => row.some((v, ci) => Math.abs(v / st.tune.ve[ri][ci] - 1) > 0.005))) return { st: next, did: ['VE from logs'], cannot };
  }
  // TUNE's cells. TUNE judges them against a full-throttle pull whatever throttle the player
  // pulled at (EcuLab.jsx `advisorPull`), so the advice is the full-throttle pull's.
  let n = 0;
  for (const r of [p]) {
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
