/**
 * SANDBOX's three ways to start a tune: the safe base map is checked on the dyno and runs
 * clean (or names what a map cannot fix), the guide grades the player's own tables against it
 * only where the engine runs, and the start is offered for a built engine, never in the career
 * or for a stock one.
 */

import { describe, expect, it } from 'vitest';

import * as S from '../src/sim/index.js';
import { makeInitialState } from '../src/ui/state/initialState.js';
import { ACTIONS, reducer } from '../src/ui/state/reducer.js';
import { boostSteps, safeBaseMap } from '../src/ui/state/safeBaseMap.js';
import { buildChanges, buildSignature, guideStepNow, guidedSteps, offersTuneStart } from '../src/ui/state/tuneStart.js';
import { nextStep } from '../src/ui/flow.js';
import { pull } from './guidedPlayer.js';

const preset = (id) => reducer(makeInitialState(), { type: ACTIONS.APPLY_PRESET, preset: S.applyPreset(S.presetById(id)) });
const set = (s, field, value) => reducer(s, { type: ACTIONS.SET_BUILD_FIELD, field, value });
const boltOns = (s) => set(s, 'mods', { ...s.build.mods, intake: true, exhaust: true, headers: true });

describe('when the start is offered', () => {
  it('is offered for a changed factory engine in SANDBOX, not a stock one or in CAREER', () => {
    const stock = preset('vq35de-revup');
    expect(offersTuneStart({ mode: 'sandbox', build: stock.build })).toBe(false);
    const built = boltOns(stock);
    expect(offersTuneStart({ mode: 'sandbox', build: built.build })).toBe(true);
    expect(offersTuneStart({ mode: 'career', build: built.build })).toBe(false);
  });

  it('asks again when the build changes', () => {
    const a = boltOns(preset('ls1'));
    const b = set(a, 'octaneIdx', 3);
    expect(buildSignature(a.build)).not.toBe(buildSignature(b.build));
    expect(buildSignature(a.build)).toBe(buildSignature(boltOns(preset('ls1')).build));
  });
});

describe('the safe base map', () => {
  it('runs a naturally aspirated build clean with power left to find', () => {
    const st = boltOns(preset('vq35de-revup'));
    const m = safeBaseMap(st);
    expect(m.clean).toBe(true);
    expect(m.action.type).toBe(ACTIONS.LOAD_BASE_MAP);
    const loaded = reducer(st, m.action);
    const p = pull(loaded);
    expect(p.points.some((q) => (q.knockPull ?? 0) > 0.2)).toBe(false);
    // A start, not a tune: the log still finds timing to add.
    expect(p.events.some((e) => e.type === 'timing')).toBe(true);
    // Loading it is one undoable write.
    expect(reducer(loaded, { type: ACTIONS.UNDO }).tune.timing).toEqual(st.tune.timing);
  }, 120_000);

  it('takes the knock out of a boosted build, or says what a map cannot fix', () => {
    const st0 = preset('ea888-gti');
    const st = set(st0, 'boostCurve', st0.build.boostCurve.map((b) => (b > 0 ? b + 4 : b)));
    const m = safeBaseMap(st);
    const p = pull(reducer(st, m.action));
    const knocks = p.points.some((q) => (q.knockPull ?? 0) > 0.2);
    expect(knocks).toBe(!m.clean);
    if (!m.clean) expect(m.left.length).toBeGreaterThan(0);
  }, 300_000);

  it('names the parts that limit a build instead of changing them', () => {
    const st0 = preset('vq35de-revup');
    const st = set(set(set(st0, 'turboOn', true), 'boostCurve', [0, 2, 6, 8, 8, 8, 8, 8]), 'mods', { ...st0.build.mods, intercooler: true });
    const m = safeBaseMap(st);
    expect(m.parts.map((e) => e.type)).toContain('fuel');
    // The parts on the bench are untouched.
    expect(reducer(st, m.action).build.injIdx).toBe(st.build.injIdx);
  }, 300_000);
});

describe('the guided base map', () => {
  it('ticks off a step only when the player\'s cells get there', () => {
    const st = boltOns(preset('ls1'));
    const m = safeBaseMap(st);
    const before = guidedSteps({ build: st.build, tune: st.tune, target: m.action, samples: m.samples });
    // Bolt-ons on the factory injectors: no injector step, the air meter's scaling first.
    expect(before.map((s) => s.id)).toEqual(['maf', 'mixture', 'spark', 'air', 'pull']);
    expect(before.find((s) => s.id === 'pull').done).toBeNull();
    const loaded = reducer(st, m.action);
    const after = guidedSteps({ build: loaded.build, tune: loaded.tune, target: m.action, samples: m.samples });
    for (const s of after.filter((x) => x.done !== null)) expect([s.id, s.done]).toEqual([s.id, true]);
    // Timing well past the target is caught.
    const hot = { ...loaded.tune, timing: loaded.tune.timing.map((r) => r.map((v) => v + 6)) };
    expect(guidedSteps({ build: loaded.build, tune: hot, target: m.action, samples: m.samples }).find((s) => s.id === 'spark').done).toBe(false);
    // Targets for a few speeds, never the whole table.
    expect(before.find((s) => s.id === 'spark').text).toMatch(/° at \d+ RPM, .*° at \d+ RPM, .*° at \d+ RPM/);
  }, 120_000);
});

describe('the guide on a turbo VQ35DE on 550 cc injectors (a player found it stuck on its first step)', () => {
  it('takes the injector scaling and the MAF scaling one step at a time, in order', () => {
    let st = preset('vq35de-revup');
    st = set(set(st, 'turboOn', true), 'boostCurve', S.RPM.map((r) => Math.round(5 * Math.min(1, Math.max(0, (r - 1500) / 2600)))));
    st = set(st, 'injIdx', S.INJECTOR_OPTS.findIndex((o) => o.cc === 550));
    const m = safeBaseMap(st);
    const steps = (s) => guidedSteps({ build: s.build, tune: s.tune, target: m.action, samples: m.samples });
    const first = steps(st);
    expect(first.slice(0, 2).map((x) => x.id)).toEqual(['injectors', 'maf']);
    expect(guideStepNow(first).id).toBe('injectors');
    // The injectors set: that step ticks on its own, and the guide moves on to the MAF.
    const inj = set(st, 'ecuInjectorCc', 550);
    expect(steps(inj)[0].done).toBe(true);
    expect(guideStepNow(steps(inj)).id).toBe('maf');
    // The scalar the step names, as the slider sets it (0.01 a step): the guide moves on again.
    const want = Number(/set the MAF scalar to (\d+\.\d+)/.exec(steps(inj)[1].text)[1]);
    const maf = set(inj, 'mafScalar', want);
    expect(steps(maf)[1].done).toBe(true);
    const after = steps(maf);
    expect(guideStepNow(after)).toBe(after.slice(2).find((x) => x.done === false));
    // The Next bar names the same step as the guide.
    const g = { n: 3, of: steps(maf).length, title: 'Mixture targets', go: 'fuel', checkable: true };
    const step = nextStep(/** @type {any} */ ({ mode: 'sandbox', attention: [], guide: g }));
    expect(step).toMatchObject({ id: 'guide', go: 'tune:fuel' });
    expect(step.text).toMatch(/step 3 of \d+: Mixture targets/);
  }, 300_000);
});

describe('the guide is this build\'s, not a generic one', () => {
  const steps = (st) => { const m = safeBaseMap(st); return { m, g: guidedSteps({ build: st.build, tune: st.tune, target: m.action, samples: m.samples }) }; };
  it('names what was changed and says why each step applies', () => {
    let st = preset('vq35de-revup');
    st = set(set(st, 'turboOn', true), 'boostCurve', S.RPM.map((r) => (r >= 3500 ? 6 : 0)));
    st = set(st, 'injIdx', S.INJECTOR_OPTS.findIndex((o) => o.cc === 550));
    expect(buildChanges(st.build).join(', ')).toMatch(/a turbo at 6 psi, no intercooler, 550 cc injectors \(factory \d+\)/);
    const { g } = steps(st);
    expect(g.find((x) => x.id === 'injectors').text).toMatch(/You fitted 550 cc\/min injectors where the factory ones flowed \d+/);
    expect(g.find((x) => x.id === 'spark').text).toMatch(/no intercooler/);
    expect(g.map((x) => x.id)).not.toContain('nitrous');
  }, 300_000);
  it('reads the mixture on the fuel in the tank: E85 burns completely at about 9.8, not 14.7', () => {
    const st = set(preset('vq35de-revup'), 'octaneIdx', S.FUEL_CHOICES.findIndex((f) => f.label === 'E85'));
    expect(buildChanges(st.build)).toContain('E85');
    const mix = steps(st).g.find((x) => x.id === 'mixture').text;
    expect(mix).toMatch(/on E85 about 9\.8 parts air/);
    expect(mix).not.toMatch(/14\.7/);
  }, 300_000);
  it('adds the nitrous last, with the retard and fuel the base map was checked with', () => {
    const st = set(preset('vq35de-revup'), 'nitrous', { kit: 'wet', shotHp: 75, heater: true, bottleLb: 10 });
    const { g } = steps(st);
    expect(g[g.length - 1].id).toBe('nitrous');
    expect(g[g.length - 1].text).toMatch(/Retard while spraying to at least [0-9.]+°/);
    expect(g.find((x) => x.id === 'pull').text).toMatch(/Leave the nitrous off/);
  }, 300_000);
});

describe('the safe base map follows a tuner\'s order of work', () => {
  it('fuels from low load up before any full-throttle run', () => {
    const m = safeBaseMap(boltOns(preset('vq35de-revup')));
    expect(m.steps[0]).toMatch(/^Fuel at 40% throttle/);
    expect(m.steps[1]).toMatch(/^Fuel at 70% throttle/);
    expect(m.steps[2]).toMatch(/^Full throttle/);
  }, 120_000);

  it('proves a turbo at its wastegate spring first, then raises the boost in steps', () => {
    const st0 = preset('vq35de-revup');
    const st = set(set(set(st0, 'turboOn', true), 'boostCurve', [0, 2, 6, 8, 8, 8, 8, 8]), 'mods', { ...st0.build.mods, intercooler: true });
    const steps = boostSteps(st.build);
    expect(steps[steps.length - 1]).toBe(8);
    expect(steps[0]).toBeLessThan(8);
    expect(steps).toEqual([...steps].sort((a, b) => a - b));
    const m = safeBaseMap(st);
    expect(m.steps.filter((t) => /^Full throttle at/.test(t)).map((t) => Number(/at ([0-9.]+) psi/.exec(t)[1]))).toEqual(steps.slice(0, m.steps.filter((t) => /^Full throttle at/.test(t)).length));
  }, 300_000);

  it('stops raising the boost at a step no map can make clean, and says the last clean one', () => {
    const st0 = preset('b58-m0');
    const st = set(st0, 'boostCurve', st0.build.boostCurve.map((b) => (b > 0 ? b + 4 : b)));
    const m = safeBaseMap(st);
    expect(m.clean).toBe(false);
    const last = m.steps[m.steps.length - 1];
    expect(last).toMatch(/knocks with the spark as low as the map can take it/);
    expect(last).toMatch(new RegExp(`highest step it ran clean was ${m.cleanAt} psi`));
  }, 300_000);
});
