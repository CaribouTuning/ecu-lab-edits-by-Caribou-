/**
 * The pull log's working order: every event the simulator can emit belongs to a step,
 * the steps run setup → fuel → spark → boost, and the fix line names a screen to open.
 */

import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { FIX_STEPS, fixStep, groupByCause, inFixOrder } from '../../src/ui/components/fixOrder.js';
import { fixLinks } from '../../src/ui/components/fixLinks.js';
import { makeEngine } from '../ecuHarness.js';
import { seedRandomPerTest } from '../seededRandom.js';

seedRandomPerTest();

/** Every event type the simulator source can emit. */
const emitted = () => {
  const types = new Set();
  for (const f of ['src/sim/sweep.js', 'src/sim/ecu/ecuEvents.js']) {
    for (const m of readFileSync(f, 'utf8').matchAll(/type: '([a-z]+)', severity/g)) types.add(m[1]);
  }
  return [...types];
};

describe('the order a tuner fixes a pull log in', () => {
  it('places every event type the simulator emits in a named step', () => {
    const named = FIX_STEPS.flatMap((s) => s.types);
    const types = emitted();
    expect(types.length).toBeGreaterThan(30);
    for (const t of types) expect(named, `${t} has no step`).toContain(t);
  });

  it('runs setup, then fuel, then spark, then boost', () => {
    expect(FIX_STEPS.map((s) => s.id).slice(0, 4)).toEqual(['setup', 'fuel', 'spark', 'boost']);
    const ordered = inFixOrder([
      { type: 'underboost', impact: 9 }, { type: 'knock', impact: 30 }, { type: 'lean', impact: 4 },
      { type: 'knock', impact: 40 }, { type: 'injscale', impact: 14 },
    ]);
    expect(ordered.map((e) => `${e.type}${e.impact}`)).toEqual(['injscale14', 'lean4', 'knock40', 'knock30', 'underboost9']);
  });

  it('puts an unknown type last instead of losing it', () => {
    expect(fixStep('something-new').id).toBe('hardware');
  });
});

describe('every fix line sends the player somewhere', () => {
  it('names a screen to open on the builds that produce the widest spread of advice', () => {
    const builds = [
      { turboOn: true, boostCurve: [0, 0, 3, 6, 8, 8, 8, 8] },
      { turboOn: true, turbineIdx: 0, compressorIdx: 0, boostCurve: [0, 2, 6, 14, 14, 14, 14, 14] },
      { mods: { intake: true, exhaust: true, headers: true, intercooler: false } },
      { injIdx: 4 },
      { octaneIdx: 3, turboOn: true, boostCurve: [0, 2, 8, 22, 22, 22, 22, 22] },
      { nitrous: { kit: 'wet', shotHp: 150, heater: false, bottleLb: 10 } },
    ];
    let seen = 0;
    for (const build of builds) {
      for (const e of makeEngine({ build }).pull(100).events) {
        seen += 1;
        // The cam is a trade-off to choose, not a cell to fix, so it alone may name none.
        if (e.type === 'cam') continue;
        expect(fixLinks(e.fix).length, `${e.type}: ${e.fix}`).toBeGreaterThan(0);
      }
    }
    expect(seen).toBeGreaterThan(10);
  });
});

describe('the pull log grouped by cause', () => {
  const ev = (type, rpmStart, rpmEnd, impact = 5) => ({ type, rpmStart, rpmEnd, impact, msg: type });

  it('puts the symptoms of one cause under it, so their advice is not read as separate fixes', () => {
    // A turbo on an NA calibration: boost past the tables, the lean boost cells it leaves,
    // the knock they cause and the boost cut that knock trips, all over the same RPM.
    const groups = groupByCause([ev('knockprot', 3000, 6000, 9), ev('knock', 3000, 7000, 43), ev('lean', 3000, 5000, 4), ev('pastTable', 2500, 7000, 20)]);
    expect(groups).toHaveLength(1);
    expect(groups[0].root.type).toBe('pastTable');
    expect(groups[0].effects.map((e) => e.type)).toEqual(['lean', 'knock', 'knockprot']);
  });

  it('keeps causes in separate parts of the pull apart', () => {
    const groups = groupByCause([ev('lean', 6000, 7000), ev('knock', 2000, 3000)]);
    expect(groups.map((g) => g.root.type)).toEqual(['lean', 'knock']);
    expect(groups.every((g) => g.effects.length === 0)).toBe(true);
  });

  it('shows every entry exactly once', () => {
    const events = [ev('injscale'), ev('lean', 1000, 7000), ev('leanprot', 4000, 5000), ev('iatprot', 6000, 7000), ev('float', 6500, 7000)];
    const seen = groupByCause(events).flatMap((g) => [g.root, ...g.effects]);
    expect(seen).toHaveLength(events.length);
    expect(new Set(seen).size).toBe(events.length);
  });
});
