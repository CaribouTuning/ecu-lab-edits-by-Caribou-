/**
 * The tuning workflow, played by a player who reads only the game (tests/guidedPlayer.js):
 * every story job finishes, and SANDBOX builds that once left the player stuck finish clean.
 *
 * Each was a dead end a player met: the log telling them to press a button the 8 × 6 grid
 * did not have, the log calling spark short where the advisor listed no cell, and the log
 * sending them back to Correct VE from logs when the cells had nothing left to change.
 */

import { describe, expect, it } from 'vitest';

import * as S from '../src/sim/index.js';
import { JOBS } from '../src/ui/career/jobs.js';
import { makeInitialState } from '../src/ui/state/initialState.js';
import { ownEngineBaseMap } from '../src/ui/state/baseMap.js';
import { ownEnginePatch } from '../src/ui/state/ownEngine.js';
import { ACTIONS, reducer } from '../src/ui/state/reducer.js';
import { advice, pull, round, solve } from './guidedPlayer.js';

/** The faults a finished tune has none of: what the log asks the player to act on. */
const FAULTS = ['backpressure', 'underboost', 'leanprot', 'iatprot', 'rail', 'knock', 'unheardknock', 'lean', 'rich', 'missedmix', 'maf', 'injscale', 'misfire', 'fuel', 'falseknock', 'nitrousknock', 'nitrouslean', 'timing', 'pastTable'];

const build = (st, field, value) => reducer(st, { type: ACTIONS.SET_BUILD_FIELD, field, value });
const preset = (id) => reducer(makeInitialState(), { type: ACTIONS.APPLY_PRESET, preset: S.applyPreset(S.presetById(id)) });

/** Rounds of the guided player until it is told nothing more to do. */
function finish(st) {
  let s = st;
  const path = [];
  for (let i = 0; i < 20; i += 1) {
    const r = round(s);
    if (!r.did.length) break;
    s = r.st;
    path.push(r.did.join(', '));
  }
  const p = pull(s);
  const a = advice(s, p);
  return {
    path,
    left: p.events.filter((e) => FAULTS.includes(e.type)).map((e) => `${e.type}: ${e.msg}`),
    cells: a.overAdvanced.length + a.pastMbt.length + a.underAdvanced.length + a.wrongMix.length,
    hp: p.peakHp,
  };
}

describe('CAREER: every story job, fixed only from what the game says', () => {
  it.each(JOBS.map((j) => [j.id, j]))('%s', (_id, job) => {
    const r = solve(job);
    expect(r.ok, `${job.id}: ${r.path.join(' | ')}`).toBe(true);
  }, 300_000);
});

describe('SANDBOX: builds that once left the player stuck', () => {
  it('a supercharger past the 8 × 6 grid: the grid grows its boost rows, and the build tunes clean', () => {
    const st = build(build(preset('ls1'), 'blowerId', 'tvs1900'), 'blowerRatio', 2.4);
    const r = finish(st);
    expect(r.left, r.path.join(' | ')).toEqual([]);
    expect(r.cells, r.path.join(' | ')).toBe(0);
  }, 300_000);

  it('a cam whose VE peaks between breakpoints: the correction across every load finishes it (the finer grid is the log\'s fallback)', () => {
    const ls1 = preset('ls1');
    const c = ls1.build.engineConfig;
    const st = build(reducer(ls1, { type: ACTIONS.SET_ENGINE_CONFIG_PATCH, patch: { camDuration: c.camDuration + 16, exhaustCamDuration: (c.exhaustCamDuration ?? c.camDuration) + 16, springRate: 90 } }),
      'mods', { ...ls1.build.mods, headers: true });
    const r = finish(st);
    expect(r.left, r.path.join(' | ')).toEqual([]);
    expect(r.cells).toBe(0);
  }, 300_000);

  it('a wet shot of nitrous: the spray is tuned on TUNE → NITROUS, and the base tables are left alone', () => {
    const st = build(preset('vq35de-revup'), 'nitrous', { kit: 'wet', shotHp: 75, heater: true, bottleLb: 10 });
    const before = st.tune.timing.map((row) => [...row]);
    const r = finish(st);
    expect(r.left, r.path.join(' | ')).toEqual([]);
    expect(r.path.every((s) => !s.includes('TUNE cells')), r.path.join(' | ')).toBe(true);
    // Its knock was the spray's: TUNE lists no base cell for it.
    const a = advice(st, pull(st));
    expect(a.overAdvanced).toEqual([]);
    expect(a.spray?.knockDeg ?? 0).toBeGreaterThan(0);
    expect(st.tune.timing).toEqual(before);
  }, 300_000);
});

describe('SANDBOX: any engine, changed any way that makes sense, tunes clean and makes the power', () => {
  // One of each kind of fix the matrix met (scratch matrix: 13 engines × 9 changes): each a
  // dead end once, each finished now by following the log and TUNE.
  const stock = (st) => pull(st).peakHp;
  it('more boost on a direct-injected turbo four: knock low down that no spark fixes, answered by the boost there', () => {
    const base = preset('ea888-gti');
    const r = finish(build(base, 'boostCurve', base.build.boostCurve.map((b) => (b > 0 ? b + 4 : b))));
    expect(r.path.some((s) => s.startsWith('boost -1.5 psi')), r.path.join(' | ')).toBe(true);
    expect(r.left, r.path.join(' | ')).toEqual([]);
    expect(r.hp).toBeGreaterThan(stock(base) * 1.1);
  }, 300_000);

  it('a turbo on a big V8: the log names what the turbo is short of, and the engine makes the power', () => {
    const base = preset('hemi-392');
    const st = build(build(build(build(build(base, 'turboOn', true), 'mods', { ...base.build.mods, intercooler: true }), 'compressorIdx', 1), 'boostCurve', [0, 2, 6, 8, 8, 8, 8, 8]), 'octaneIdx', 1);
    const r = finish(st);
    expect(r.left, r.path.join(' | ')).toEqual([]);
    expect(r.hp).toBeGreaterThan(stock(base) * 1.25);
  }, 300_000);

  it('E85 on a factory turbo: the lean the boost-cutting protection hid is named, and the build finishes', () => {
    const base = preset('ea888-r');
    const r = finish(build(base, 'octaneIdx', 3));
    expect(r.path.join(' | ')).toMatch(/lean protection/);
    expect(r.left, r.path.join(' | ')).toEqual([]);
    expect(r.hp).toBeGreaterThan(stock(base) * 1.04);
  }, 300_000);

  it('an engine of the player\'s own starts on a start-up map, and boost on it tunes to big power', () => {
    let st = reducer(makeInitialState({ blank: true }), { type: ACTIONS.APPLY_PRESET, preset: ownEnginePatch() });
    st = reducer(st, { type: ACTIONS.SET_ENGINE_CONFIG_PATCH, patch: { configuration: 'V6', bore: 95.5, stroke: 81.4, compression: 10.3, redline: 7000 } });
    st = reducer(st, { type: ACTIONS.SET_ENGINE_CONFIG_PATCH, patch: {}, base: ownEngineBaseMap(st.build, 'game') });
    const na = stock(st);
    // The start-up map leaves its timing to find: TUNE lists it.
    expect(advice(st, pull(st)).underAdvanced.length).toBeGreaterThan(0);
    st = build(build(build(build(build(st, 'turboOn', true), 'mods', { ...st.build.mods, intercooler: true }), 'compressorIdx', 1), 'boostCurve', [0, 3, 8, 10, 10, 10, 10, 10]), 'octaneIdx', 1);
    const r = finish(st);
    expect(r.left, r.path.join(' | ')).toEqual([]);
    expect(r.cells).toBe(0);
    expect(r.hp).toBeGreaterThan(na * 1.4);
  }, 300_000);
});

describe('the log calls spark short only where the advisor lists a cell', () => {
  it('holds for every timing entry along the way', () => {
    let st = build(build(preset('ls1'), 'blowerId', 'tvs1900'), 'blowerRatio', 2.4);
    for (let i = 0; i < 8; i += 1) {
      const p = pull(st);
      if (p.events.some((e) => e.type === 'timing')) expect(advice(st, p).underAdvanced.length).toBeGreaterThan(0);
      const r = round(st);
      if (!r.did.length) break;
      st = r.st;
    }
  }, 300_000);
});
