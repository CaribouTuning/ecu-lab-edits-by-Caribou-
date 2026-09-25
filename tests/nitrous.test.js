/**
 * Nitrous, held to its chemistry, the published numbers racers work from, and what it does
 * on a real car: the bottle's pressure follows its temperature, a shot flows what its jets
 * are rated for, the gain tracks the shot, the knock limit drops about 2° per 50 hp, a
 * wet kit's fuel does not follow the bottle, a dry kit without fuel runs lean and is cut,
 * and nothing sprays outside the controller's window.
 */

import { describe, expect, it } from 'vitest';

import * as S from '../src/sim/index.js';
import { makeEngine, runLive } from './ecuHarness.js';
import { seedRandomPerTest } from './seededRandom.js';

seedRandomPerTest();

const F = (f) => ((f - 32) * 5) / 9 + 273.15;
const FUELLED = { injIdx: 3, ecuInjectorCc: 650, octaneIdx: 1 };
const kit = (shotHp, extra = {}) => ({ kit: 'wet', shotHp, heater: true, bottleLb: 10, ...extra });
const pull = (nitrous, opts = {}) => makeEngine({ build: { ...FUELLED, nitrous }, ...opts }).pull(opts.loadKpa ?? 100);
const at = (p, rpm) => p.points.find((x) => x.rpm === rpm);
const lbMin = (kgS) => (kgS * 60) / 0.45359237;

describe('the chemistry', () => {
  it('carries 36.4% oxygen by mass, worth 1.57 times its mass in air', () => {
    expect(S.N2O.o2MassFrac).toBeCloseTo(0.3636, 3);
    expect(S.N2O_AIR_EQUIV).toBeCloseTo(1.571, 2);
  });

  it('releases 1.86 MJ/kg coming apart (−82 kJ/mol)', () => {
    expect(S.N2O.decompJPerKg / 1e6).toBeCloseTo(1.864, 2);
  });
});

describe('the bottle', () => {
  it('holds the vapour pressure the racing charts give for its temperature', () => {
    // Published bottle charts: ~450 psi at 32 °F, ~590 at 50 °F, 762 at 70 °F, 921 at 85 °F.
    for (const [f, psi] of [[32, 450], [50, 590], [70, 762], [85, 921]]) {
      expect(Math.abs(S.bottlePressurePsi(F(f)) / psi - 1)).toBeLessThan(0.03);
    }
  });

  it('loses pressure through a pass without a heater, and holds it better with one', () => {
    const cold = pull(kit(150, { heater: false }), { bottleK: F(85) });
    const heated = pull(kit(150));
    const drop = (p) => p.points.filter((x) => x.nitrousLbMin > 0).map((x) => x.bottlePsi);
    const [c, h] = [drop(cold), drop(heated)];
    expect(c[0] - c.at(-1)).toBeGreaterThan(40);
    expect(h.at(-1)).toBeGreaterThan(c.at(-1));
  });
});

describe('the jets', () => {
  it('a 100 shot flows the 5-6 lb/min racers budget for it', () => {
    const flow = lbMin(S.nitrousFlowKgS({ shotHp: 100, bottlePsi: 950, bottleK: F(85), manifoldPsi: 0 }));
    expect(flow).toBeGreaterThan(4.8);
    expect(flow).toBeLessThan(6);
  });

  it('a cold bottle flows less, and a wet kit\'s fuel does not follow it: the mixture goes rich', () => {
    const cold = at(pull(kit(100), { bottleK: F(55) }), 4500);
    const warm = at(pull(kit(100)), 4500);
    expect(cold.nitrousLbMin).toBeLessThan(warm.nitrousLbMin * 0.92);
    expect(cold.nitrousFuelLbMin).toBeCloseTo(warm.nitrousFuelLbMin, 5);
    expect(cold.lambda).toBeLessThan(warm.lambda);
    expect(pull(kit(100), { bottleK: F(55) }).events.some((e) => e.type === 'bottle')).toBe(true);
  });
});

describe('what it does to the engine', () => {
  it('adds power in step with the shot: 1.0-1.35 × the rating at the crank', () => {
    // 1.0-1.35 rather than 1.0: the model makes 10-15% more power per unit of oxygen than
    // real engines (docs/accuracy.md, approximation 1), and nitrous is oxygen.
    const base = at(pull(null), 4500).hp;
    const gains = [50, 100, 150].map((shot) => (at(pull(kit(shot)), 4500).hp - base) / S.DRIVETRAIN_EFF / shot);
    for (const g of gains) {
      expect(g).toBeGreaterThan(1.0);
      expect(g).toBeLessThan(1.35);
    }
    expect(Math.max(...gains) - Math.min(...gains)).toBeLessThan(0.1);
  });

  it('drops the knock limit about 2° per 50 hp of shot, as the rule of thumb says', () => {
    for (const shot of [100, 150]) {
      const p = pull(kit(shot), { cal: { 'nitrous.retardDeg': 0 } });
      const worst = Math.max(...p.points.filter((x) => x.nitrousLbMin > 0).map((x) => x.knockPull));
      const perFifty = worst / (shot / 50);
      expect(perFifty).toBeGreaterThan(1.5);
      expect(perFifty).toBeLessThan(3.5);
    }
  });

  it('retards spark only while spraying', () => {
    const p = pull(kit(100), { cal: { 'nitrous.retardDeg': 6 } });
    const off = pull(kit(100), { nitrousArmed: false });
    expect(at(p, 2500).commandedTiming).toBe(at(off, 2500).commandedTiming);
    expect(at(off, 4500).commandedTiming - at(p, 4500).commandedTiming).toBeCloseTo(6, 5);
  });
});

describe('the controller', () => {
  it('sprays nothing below the window, disarmed, or at part throttle — and then the engine is exactly the base engine', () => {
    const base = pull(null);
    const disarmed = pull(kit(100), { nitrousArmed: false });
    expect(disarmed.points.map((x) => x.hp)).toEqual(base.points.map((x) => x.hp));
    const armed = pull(kit(100));
    expect(at(armed, 2500).nitrousLbMin ?? 0).toBe(0);
    expect(at(armed, 2500).hp).toBe(at(base, 2500).hp);
    const partThrottle = pull(kit(100), { loadKpa: 70 });
    expect(partThrottle.points.every((x) => !(x.nitrousLbMin > 0))).toBe(true);
  });

  it('ramps a progressive shot in from its start percentage', () => {
    const p = pull(kit(100), { cal: { 'nitrous.startPct': 30, 'nitrous.rampS': 2 } });
    const first = at(p, 3000).nitrousLbMin;
    const full = at(p, 4500).nitrousLbMin;
    expect(first / full).toBeGreaterThan(0.25);
    expect(first / full).toBeLessThan(0.35);
    expect(at(p, 4000).nitrousLbMin / full).toBeGreaterThan(0.99);
  });

  it('a dry kit with no fuel added runs lean, and the lean cut shuts the nitrous off', () => {
    const p = pull(kit(100, { kit: 'dry' }), { cal: { 'nitrous.dryFuelPct': 0 } });
    const ev = p.events.find((e) => e.type === 'nitrouslean');
    expect(ev).toBeDefined();
    expect(ev.fix).toMatch(/TUNE → NITROUS/);
    expect(p.points.filter((x) => x.rpm >= 3000).every((x) => !(x.nitrousLbMin > 0))).toBe(true);
  });

  it('flags a big shot sprayed too low in the rev range', () => {
    const p = pull(kit(150), { cal: { 'nitrous.minRpm': 2000 } });
    expect(p.events.some((e) => e.type === 'nitrouswindow')).toBe(true);
  });
});

describe('the pull log sends the player to screens that exist', () => {
  it('every nitrous event names BUILD → INDUCTION / FUEL SYSTEM or TUNE → NITROUS / INJECTORS', () => {
    const cases = [
      pull(kit(150), { cal: { 'nitrous.retardDeg': 0 } }),
      pull(kit(100), { bottleK: F(55) }),
      pull(kit(100, { kit: 'dry' }), { cal: { 'nitrous.dryFuelPct': 0 } }),
    ];
    for (const p of cases) {
      for (const e of p.events.filter((x) => /nitrous|bottle/.test(x.type))) {
        for (const m of e.fix.matchAll(/\b(BUILD|TUNE) → ([A-Z][A-Z ]*[A-Z])/g)) {
          expect(['BUILD → INDUCTION', 'BUILD → FUEL SYSTEM', 'TUNE → NITROUS', 'TUNE → INJECTORS']).toContain(`${m[1]} → ${m[2]}`);
        }
      }
    }
  });
});

describe('on the LIVE engine', () => {
  const floorIt = (t) => (t > 3 ? 100 : 0);
  const live = (nitrous, aux, seconds = 10) => runLive(makeEngine({ build: { ...FUELLED, nitrous } }), { seconds, pedal: floorIt, coolantC: 90, aux, holdRpm: 4500 });

  it('sprays only when armed, inside the window, and the bottle loses pressure as it does', () => {
    const armed = live(kit(100, { heater: false }), { nitrous: true });
    const spraying = armed.rows.filter((r) => r.nitrous > 0);
    expect(spraying.length).toBeGreaterThan(20);
    for (const r of spraying) expect(r.rpm).toBeGreaterThanOrEqual(3000);
    expect(spraying.at(-1).bottle).toBeLessThan(spraying[0].bottle - 20);
    const disarmed = live(kit(100), { nitrous: false });
    expect(disarmed.rows.every((r) => r.nitrous === 0)).toBe(true);
  });

  it('a lean cut holds the nitrous off until the driver lifts', () => {
    const eng = makeEngine({ build: { ...FUELLED, nitrous: kit(100, { kit: 'dry' }) }, cal: { 'nitrous.dryFuelPct': 0 } });
    const { rows } = runLive(eng, { seconds: 10, pedal: floorIt, coolantC: 90, aux: { nitrous: true }, holdRpm: 4500 });
    expect(rows.some((r) => r.protect.includes('nitrous lean'))).toBe(true);
    const cut = rows.findIndex((r) => r.protect.includes('nitrous lean'));
    expect(rows.slice(cut + 2).every((r) => r.nitrous === 0)).toBe(true);
  });
});

describe('superchargers and nitrous on random engines', () => {
  it('every number stays finite, the blower costs the crank, and hp = torque × RPM / 5252 holds', async () => {
    const { randomBuild, honest, rng } = await import('./randomBuilds.js');
    const r = rng(4242);
    const failures = [];
    for (let i = 0; i < 24; i += 1) {
      const base = honest(randomBuild(70000 + i));
      if (base.turboOn) continue;
      const blower = S.BLOWER_OPTS[Math.floor(r() * S.BLOWER_OPTS.length)];
      const withBlower = { ...base, blowerId: blower.id };
      const build = {
        ...withBlower,
        blowerRatio: S.starterRatio(withBlower, S.tankFuel(withBlower)),
        nitrous: kit([50, 100, 150][Math.floor(r() * 3)], { kit: r() < 0.5 ? 'wet' : 'dry' }),
      };
      const p = makeEngine({ build }).pull(100);
      for (const pt of p.points) {
        const nums = [pt.hp, pt.torque, pt.lambda, pt.egt, pt.boostPsi, pt.blowerHp, pt.peakPressure];
        if (nums.some((v) => !Number.isFinite(v))) failures.push(`seed ${base.seed} ${blower.id} @${pt.rpm}: non-finite`);
        if (pt.boostPsi > 0.5 && !(pt.blowerHp > 0)) failures.push(`seed ${base.seed} ${blower.id} @${pt.rpm}: boost with no drive power`);
        if (pt.hp > 20 && Math.abs(pt.hp - (pt.torque * pt.rpm) / 5252) > 2) failures.push(`seed ${base.seed} @${pt.rpm}: hp ${pt.hp} vs ${(pt.torque * pt.rpm / 5252).toFixed(0)}`);
        if (pt.lambda < 0.3 || pt.lambda > 2.5) failures.push(`seed ${base.seed} @${pt.rpm}: λ ${pt.lambda}`);
      }
    }
    expect(failures).toEqual([]);
  });
});
