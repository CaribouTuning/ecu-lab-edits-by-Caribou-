/**
 * The guided base map, followed literally (components/TuneStart.jsx "Build it with the
 * guide"): a player who does each step as it reads, in order, ends with an engine the pull log
 * and the advisor agree is safe: no knock and no lean.
 */

import { describe, expect, it } from 'vitest';

import * as S from '../src/sim/index.js';
import { makeInitialState } from '../src/ui/state/initialState.js';
import { ACTIONS, reducer } from '../src/ui/state/reducer.js';
import { boostSteps, safeBaseMap } from '../src/ui/state/safeBaseMap.js';
import { guidedSteps } from '../src/ui/state/tuneStart.js';
import { advice, pull, round, setCal } from './guidedPlayer.js';

const preset = (id) => reducer(makeInitialState(), { type: ACTIONS.APPLY_PRESET, preset: S.applyPreset(S.presetById(id)) });
const set = (s, field, value) => reducer(s, { type: ACTIONS.SET_BUILD_FIELD, field, value });
const LEAN = ['lean', 'leanprot', 'knock', 'unheardknock', 'knockprot'];

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
  st = set(st, 'ecuInjectorCc', Number(/set ECU Injector Scaling to (\d+)/.exec(steps[0].text)[1]));
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

describe('the guided base map, followed literally, leaves an engine the log and the advisor call safe', () => {
  const builds = {
    'a turbo VQ35DE at 5 psi on 550 cc injectors (no intercooler)': () => {
      let s = preset('vq35de-revup');
      s = set(s, 'turboOn', true);
      s = set(s, 'boostCurve', S.RPM.map((r) => Math.round(5 * Math.min(1, Math.max(0, (r - 1500) / 2600)))));
      return set(s, 'injIdx', S.INJECTOR_OPTS.findIndex((o) => o.cc === 550));
    },
    'an LS1 with bolt-ons': () => set(preset('ls1'), 'mods', { ...preset('ls1').build.mods, intake: true, exhaust: true, headers: true }),
  };
  it.each(Object.entries(builds))('%s', (_name, make) => {
    const st0 = make();
    const { st, ids, made } = followTheGuide(st0);
    expect(ids[0]).toBe('injectors');
    if (!made.clean) return; // a build no map can make clean says so on its card instead
    const p = pull(st);
    const bad = p.events.filter((e) => LEAN.includes(e.type)).map((e) => `${e.type}: ${e.msg}`);
    expect(bad, 'the pull log after following the guide').toEqual([]);
    expect(p.points.some((q) => (q.knockPull ?? 0) > 0.2)).toBe(false);
    const a = advice(st, p);
    expect(a.overAdvanced.map((c) => `${c.rpm} rpm ${c.map} kPa`), 'TUNE\'s advisor after following the guide').toEqual([]);
  }, 600_000);
});

describe('the safe base map tells the ECU what is fitted before it pulls', () => {
  it('enters the fitted injectors, so its check pulls are not run rich', () => {
    let s = preset('vq35de-revup');
    s = set(set(s, 'turboOn', true), 'boostCurve', S.RPM.map((r) => (r >= 3500 ? 5 : 0)));
    s = set(s, 'injIdx', S.INJECTOR_OPTS.findIndex((o) => o.cc === 550));
    const m = safeBaseMap(s);
    expect(m.action.ecuInjectorCc).toBe(550);
    const loaded = reducer(s, m.action);
    expect(loaded.build.ecuInjectorCc).toBe(550);
    expect(pull(loaded).events.map((e) => e.type)).not.toContain('injscale');
  }, 300_000);
});
