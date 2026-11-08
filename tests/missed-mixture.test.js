/**
 * When the engine does not get the mixture its AFR table asks for, the table is not the
 * fault and nothing should send the player to change it. A turbo V8 whose VE table read
 * low under boost ran 14.1:1 against a 12.9:1 target: the pull log told the player to
 * richen the target, while TUNE's mixture advisor, rightly, passed the table. Both now
 * name the fuelling (the VE table, the injectors, the pump), from the same threshold.
 */

import { describe, expect, it } from 'vitest';

import * as S from '../src/sim/index.js';
import { fuelReport } from '../src/ui/components/advisorReports.js';
import { makeEngine } from './ecuHarness.js';
import { seedRandomPerTest } from './seededRandom.js';

seedRandomPerTest();

/** A turbo LS1 whose VE table's boost rows read `scale` of what they should. */
function turboV8(scale) {
  const eng = makeEngine({ preset: 'ls1', build: { turboOn: true, boostCurve: S.RPM.map((r) => (r < 1000 ? 0 : 5)), mods: { ...S.presetById('ls1').mods, intercooler: true } } });
  const args = eng.pullArgs(100);
  const rows = args.layout ? args.layout.ve.load : S.LOAD;
  args.ve = args.ve.map((row, ri) => (rows[ri] > 100 ? row.map((v) => v * scale) : row));
  return { args, pull: S.simulateSweep(args) };
}

describe('the engine missing its AFR table', () => {
  it('a VE table that reads low under boost is named as the fault, not the AFR target', () => {
    const { pull } = turboV8(0.85);
    const miss = pull.events.find((e) => e.type === 'missedmix');
    expect(miss, 'a missed-mixture entry').toBeTruthy();
    expect(miss.msg).toMatch(/leaner than the AFR table asks for/);
    expect(miss.fix).toMatch(/TUNE → AIRFLOW/);
    expect(miss.fix).toMatch(/Correct VE from logs/);
    for (const e of pull.events) {
      // nothing tells the player to richen a target the engine is not getting anyway
      if (/runs? .* lean of the table|asks for .* got/.test(e.cause ?? '')) expect(e.fix).not.toMatch(/richen the AFR target/);
    }
    const knock = pull.events.find((e) => e.type === 'knock');
    if (knock && /less fuel than the table asks for/.test(knock.cause)) {
      expect(knock.fix).toMatch(/^Fuel first: the AFR table is right/);
      expect(knock.fix).not.toMatch(/richen the AFR target/);
    }
  });

  it('a VE table that reads high is named too: lower the cells, the engine runs rich of the table', () => {
    const { pull } = turboV8(1.15);
    const miss = pull.events.find((e) => e.type === 'missedmix');
    expect(miss.msg).toMatch(/richer than the AFR table asks for/);
    expect(miss.fix).toMatch(/lower the VE cells/);
  });

  it("TUNE's mixture advisor says the same, from the same pull", () => {
    const { args, pull } = turboV8(0.85);
    const advice = S.calibrationAdvice({ ...args, pull, octaneBonus: args.fuel.bonus, mafErrorBase: 1 });
    expect(advice.missedMix.length).toBeGreaterThan(0);
    const report = fuelReport(advice, null);
    expect(report.state).toBe('table-missed');
    expect(report.tone).toBe('warn');
    expect(report.headline).toMatch(/leaner than this table asks for/);
  });

  it('a stock engine misses nothing, so neither screen raises it', () => {
    const eng = makeEngine({ preset: 'vq35de-revup' });
    const pull = eng.pull(100);
    expect(pull.events.some((e) => e.type === 'missedmix')).toBe(false);
  });
});
