/**
 * Engines of the player's own, tuned the way the game says: the safe base map's guide step by
 * step, then the pull log and TUNE's marks, pull after pull. Each of these was once left with
 * something the log kept asking for and no edit could settle: a mixture the VE fit would not
 * close on cells a pull crosses briefly (#17), a VE gradient that ran away on a MAP reading
 * rounded to a whole kPa (#21), a turbo build whose typed spark numbers moved again (#12), and
 * a V6 whose valves float below its redline, where no VE edit can follow the filling (#26).
 * The audit behind them (100 random engines) runs the same player over many more.
 */

import { describe, expect, it } from 'vitest';

import * as S from '../src/sim/index.js';
import { makeInitialState } from '../src/ui/state/initialState.js';
import { ownEngineBaseMap } from '../src/ui/state/baseMap.js';
import { ownEnginePatch } from '../src/ui/state/ownEngine.js';
import { ACTIONS, reducer } from '../src/ui/state/reducer.js';
import { boostSteps, safeBaseMap } from '../src/ui/state/safeBaseMap.js';
import { guidedSteps } from '../src/ui/state/tuneStart.js';
import { advice, pull, round, setCal } from './guidedPlayer.js';
import { randomBuild } from './randomBuilds.js';

const set = (s, field, value) => reducer(s, { type: ACTIONS.SET_BUILD_FIELD, field, value });
const B = set;
const E = (st, patch) => reducer(st, { type: ACTIONS.SET_ENGINE_CONFIG_PATCH, patch });
const LEAN = ['lean', 'leanprot', 'knock', 'unheardknock', 'knockprot'];
const FAULTS = ['backpressure', 'knock', 'unheardknock', 'lean', 'rich', 'missedmix', 'maf', 'injscale', 'misfire', 'fuel', 'falseknock', 'nitrousknock', 'nitrouslean', 'timing', 'pastTable', 'valve', 'piston', 'leanprot', 'knockprot', 'egtprot', 'dutyprot', 'iatprot', 'rail', 'underboost', 'float'];

/** Correct VE from logs, from these pulls. */
function veFromLogs(st, pulls) {
  const axes = S.layoutById(st.tune.layout).ve;
  const { ratio } = S.veCorrections(pulls.flatMap((r) => S.veSamplesFromPull(r.points)), axes);
  return { ...st, tune: { ...st.tune, ve: S.applyVeCorrections(st.tune.ve, ratio, 1) } };
}
/** The boost held to at most psi in 4th, the dyno's gear (TUNE → BOOST, Boost limit by gear). */
const limitBoost = (st, psi) => {
  const c = S.getCal(st.tune.ecu, 'boost.gearLimit');
  return setCal(st, 'boost.gearLimit', { ...c, z: c.z.map(() => psi) });
};
/** Every step of the guide, done as it reads. */
function followTheGuide(st0) {
  const made = safeBaseMap(st0);
  const t = made.action;
  let st = st0;
  const steps = guidedSteps({ build: st.build, tune: st.tune, target: t, samples: made.samples });
  const ids = steps.map((s) => s.id);
  // 1. The injector scaling, the size the step names; then the MAF scalar where a step names one.
  const inj = steps.find((x) => x.id === 'injectors');
  if (inj) st = set(st, 'ecuInjectorCc', Number(/set ECU Injector Scaling to (\d+)/.exec(inj.text)[1]));
  const maf = steps.find((x) => x.id === 'maf');
  if (maf) st = set(st, 'mafScalar', Number(/set the MAF scalar to (\d+\.\d+)/.exec(maf.text)[1]));
  // 2 and 3. Mixture no leaner than the targets, spark no higher, in the full-load rows: the
  // target read where each of the player's own cells sits (the base map may be on finer axes).
  const afrAx = S.layoutById(st.tune.layout).afr;
  const sparkAx = S.layoutById(st.tune.layout).timing;
  const at = (table, name, rpm, load) => S.readTable(table, S.layoutById(t.layout)[name], rpm, load);
  const full = (ax, ri) => ax.loadUnit === 'kPa' && ax.load[ri] >= S.OPEN_LOOP_KPA;
  st = { ...st, tune: { ...st.tune,
    afr: st.tune.afr.map((r, ri) => (full(afrAx, ri) ? r.map((v, ci) => Math.min(v, Number(at(t.afr, 'afr', afrAx.rpm[ci], afrAx.load[ri]).toFixed(1)))) : [...r])),
    timing: st.tune.timing.map((r, ri) => (full(sparkAx, ri) ? r.map((v, ci) => Math.min(v, Number(at(t.timing, 'timing', sparkAx.rpm[ci], sparkAx.load[ri]).toFixed(1)))) : [...r])),
  } };
  // 4. Fuel from low load up, the boost held at its lowest step.
  const bs = boostSteps(st.build);
  if (bs.length) st = limitBoost(st, bs[0]);
  for (const load of [40, 70]) for (let i = 0; i < 2; i += 1) st = veFromLogs(st, [pull(st, load)]);
  // 5 and 6. Full throttle at each boost step, the pull log worked in its order (the guided
  // player acting on its entries: parts and fuel first, then knock; false knock at the sensor).
  for (const psi of bs.length ? bs : [null]) {
    if (psi != null) st = limitBoost(st, psi);
    for (let i = 0; i < 8; i += 1) { const r = round(st); if (!r.did.length) break; st = r.st; }
  }
  if (bs.length) st = limitBoost(st, 40);
  // Back to the guide, as the screen shows it with TUNE's advisor: whatever cells its spark and
  // mixture steps still name, set to the figure it gives, until it names none.
  for (let i = 0; i < 3; i += 1) {
    const adv = advice(st, pull(st));
    const g = guidedSteps({ build: st.build, tune: st.tune, target: t, samples: made.samples, advice: adv });
    const spark = g.find((x) => x.id === 'spark');
    if (spark.done || !/past the knock limit/.test(spark.text)) break;
    const timing = st.tune.timing.map((r) => [...r]);
    for (const c of adv.overAdvanced) timing[c.ri][c.ci] = Math.min(timing[c.ri][c.ci], c.suggested);
    st = { ...st, tune: { ...st.tune, timing } };
  }
  return { st, ids, made };
}

/** Log and TUNE quoting different numbers for the same cell, on this pull (agree.mjs's checks). */
const disagreements = (st, p) => {
  const a = advice(st, p); const ax = S.layoutById(st.tune.layout); const out = [];
  for (const e of p.events) {
    const text = `${e.cause ?? ''} ${e.fix ?? ''}`;
    if (/target is fine|AFR table is right|not the target|target is not the fault/i.test(text)) out.push(`${e.type} says target fine`);
    for (const m of text.matchAll(/(\d+) kPa at ([\d,]+) RPM from -?[\d.]+° to (-?\d+)°/g)) {
      const c = a.overAdvanced.find((x) => Math.round(ax.timing.load[x.ri]) === Number(m[1]) && ax.timing.rpm[x.ci] === Number(m[2].replace(',', '')));
      if (c?.suggested !== Number(m[3])) out.push(`spark ${m[1]}@${m[2]} log ${m[3]} grid ${c?.suggested}`);
    }
    for (const m of text.matchAll(/([0-9.]+) kPa at ([0-9,]+) RPM from ([0-9.]+) to ([0-9.]+)(?!°|[0-9.])/g)) {
      const c = a.wrongMix.find((x) => Math.round(ax.afr.load[x.ri]) === Number(m[1]) && ax.afr.rpm[x.ci] === Number(m[2].replace(',', '')));
      if (!c || Math.abs(c.suggested - Number(m[4])) > 0.05) out.push(`afr ${m[1]}@${m[2]} log ${m[4]} grid ${c?.suggested}`);
    }
  }
  if (p.events.some((e) => ['knock', 'unheardknock'].includes(e.type)) && !a.overAdvanced.length) out.push('log knock, grid no marks');
  return out;
};

/** BUILD as the player does it: their own engine, its figures typed in, the parts fitted. */
function built(seed) {
  const b = randomBuild(seed);
  let st = reducer(makeInitialState({ blank: true }), { type: ACTIONS.APPLY_PRESET, preset: ownEnginePatch() });
  st = E(st, b.engineConfig);
  st = reducer(st, { type: ACTIONS.SET_ENGINE_CONFIG_PATCH, patch: {}, base: ownEngineBaseMap(st.build, S.layoutById(st.tune.layout).id) });
  for (const f of ['turboOn', 'boostCurve', 'octaneIdx', 'injIdx', 'turbineIdx', 'compressorIdx', 'exhaustDiaIdx']) st = B(st, f, b[f]);
  return B(st, 'mods', { ...st.build.mods, ...b.mods });
}

describe('engines of the player\'s own tune clean from the guide, the log and TUNE', { timeout: 240000 }, () => {
  for (const seed of [12, 17, 21, 26]) {
    it(`custom #${seed}`, () => {
      const { st: guided } = followTheGuide(built(seed));
      const first = pull(guided);
      expect(first.events.filter((e) => LEAN.includes(e.type)).map((e) => e.type)).toEqual([]);
      let st = guided;
      const disagree = [];
      for (let k = 0; k < 15; k += 1) {
        disagree.push(...disagreements(st, pull(st)));
        const r = round(st);
        if (!r.did.length) break;
        st = r.st;
      }
      const last = pull(st);
      const a = advice(st, last);
      expect(last.events.filter((e) => FAULTS.includes(e.type) && !e.gridBound).map((e) => `${e.type}: ${e.msg}`)).toEqual([]);
      expect(a.overAdvanced.length + a.pastMbt.length + a.underAdvanced.length + a.wrongMix.length).toBe(0);
      expect([...disagree, ...disagreements(st, last)]).toEqual([]);
      expect(last.peakHp).toBeGreaterThanOrEqual(first.peakHp - 1);
    });
  }
});
