/**
 * Engine damage (src/sim/damage.js): worn parts change what the engine does, the live
 * engine wears from the conditions that wear real parts, and a part at zero is a failed
 * engine — a state, entered once, that stops it until it is rebuilt.
 */

import { describe, expect, it } from 'vitest';

import * as S from '../src/sim/index.js';
import { ECU_COEFF } from '../src/sim/ecu/ecuCoefficients.js';
import { oilPressureKpa } from '../src/sim/ecu/ecuHardware.js';

import { makeEngine } from './ecuHarness.js';

const NEW = S.healthyEngine();

/**
 * The live engine run with a given condition, a step at a time as the app does.
 * @param {ReturnType<typeof makeEngine>} eng
 * @param {object} health
 * @param {{seconds: number, pedal?: number, from?: object, aux?: object, faults?: object}} opts
 */
function runLive(eng, health, { seconds, pedal = 0, from, aux = {}, faults }) {
  const cfg = { ...eng.liveCfg(aux), health };
  if (faults) cfg.ecu = { ...cfg.ecu, cond: { ...cfg.ecu.cond, ...faults } };
  let s = from ?? { ...S.makeLiveState(), cranking: true, coolantC: 85, oilC: 85 };
  const states = [];
  for (let i = 0; i < Math.round(seconds / 0.05); i++) {
    s = S.liveStep(s, 0.05, { throttle: pedal, load: 0 }, cfg);
    states.push(s);
  }
  return { state: s, states };
}

describe('what worn parts do', () => {
  it('a new engine has nothing to apply', () => {
    expect(S.wearEffects(NEW, 6)).toBeNull();
    expect(S.wearEffects(null, 6)).toBeNull();
    expect(S.failedPart(NEW)).toBeNull();
  });

  it('worn rings leak charge, more the more they are worn', () => {
    const half = S.wearEffects({ ...NEW, piston: 50 }, 6);
    const gone = S.wearEffects({ ...NEW, piston: 1 }, 6);
    expect(half.ringLeakFrac).toBeGreaterThan(0);
    expect(gone.ringLeakFrac).toBeGreaterThan(half.ringLeakFrac);
    expect(half.deadFrac).toBe(0);
    expect(half.cylLossFrac).toBe(0);
  });

  it('a burnt valve leaks one cylinder, and stops it firing near the end', () => {
    const early = S.wearEffects({ ...NEW, valve: 60 }, 6);
    expect(early.deadFrac).toBe(0);
    expect(early.cylLossFrac).toBeGreaterThan(0);
    const late = S.wearEffects({ ...NEW, valve: 5 }, 6);
    expect(late.deadFrac).toBeGreaterThan(0);
    expect(late.ringLeakFrac).toBe(0);
    // One cylinder's work, counted once: its leak and its misfire never add past it.
    expect(late.cylLossFrac).toBeGreaterThanOrEqual(late.deadFrac);
    expect(S.wearEffects({ ...NEW, valve: 0 }, 6).cylLossFrac).toBeCloseTo(1 / 6, 12);
  });

  it('worn bearings leak oil with the cube of their clearance, and add no friction', () => {
    const fx = S.wearEffects({ ...NEW, bearing: 20 }, 6);
    expect(fx.oilConductance).toBeGreaterThan(1);
    expect('bearingFmepPa' in fx).toBe(false);
    // Worn to the service limit (Toyota T-SB-0030-15, 2AZ-FE: 0.08 mm against 0.024-0.048
    // standard), the bearings' quarter of the flow (SAE 2020-28-0338) passes 2.22³ times
    // as much: the system leaks about 3.5 times as freely.
    expect(S.oilConductance(1)).toBeCloseTo(0.75 + 0.25 * 2.22 ** 3, 9);
    expect(S.oilConductance(0)).toBe(1);
    // Half worn still makes the maker's minimum share of a healthy pump; worn to the limit
    // it does not, and starts starving itself.
    expect(1 / S.oilConductance(0.5)).toBeGreaterThan(S.COEFF.DAMAGE_OIL_FILM_SHARE);
    expect(1 / S.oilConductance(1)).toBeLessThan(S.COEFF.DAMAGE_OIL_FILM_SHARE);
  });

  it('worn rings cost about a percent of the charge, the order the blow-by data gives', () => {
    // DieselNet: a worn engine's blow-by is twice a new one's, which is well under 1% of
    // the intake flow. A leak-down figure is a static test and is not this number.
    expect(S.wearEffects({ ...NEW, piston: 0.001 }, 6).ringLeakFrac).toBeLessThanOrEqual(0.01);
  });
});

describe('a worn engine on the dyno', () => {
  const eng = makeEngine();

  it('makes less power with worn rings, through the physics, with the mixture read as metered', () => {
    const fresh = S.simulateSweep({ ...sweepOf(eng), health: NEW });
    const worn = S.simulateSweep({ ...sweepOf(eng), health: { ...NEW, piston: 20 } });
    expect(worn.peakHp).toBeLessThan(fresh.peakHp);
    // Blow-by takes air and fuel together and the breather returns both to the intake, so
    // the MAF and the wideband read what they did; the cylinder burns less of it.
    const at = (r, rpm) => r.points.find((p) => p.rpm === rpm);
    expect(at(worn, 4000).lambda).toBeCloseTo(at(fresh, 4000).lambda, 6);
    expect(at(worn, 4000).maf).toBeCloseTo(at(fresh, 4000).maf, 6);
    expect(at(worn, 4000).torque).toBeLessThan(at(fresh, 4000).torque);
    expect(worn.failure).toBeNull();
  });

  it('worn bearings cost no power: friction falls with clearance (Petroff), it does not rise', () => {
    const fresh = S.simulateSweep({ ...sweepOf(eng), health: NEW });
    const worn = S.simulateSweep({ ...sweepOf(eng), health: { ...NEW, bearing: 10 } });
    expect(worn.points.map((p) => p.fmep)).toEqual(fresh.points.map((p) => p.fmep));
    expect(worn.peakHp).toBe(fresh.peakHp);
  });

  it('is unchanged by a condition of full health', () => {
    const plain = S.simulateSweep(sweepOf(eng));
    const fresh = S.simulateSweep({ ...sweepOf(eng), health: NEW });
    expect(fresh.points).toEqual(plain.points);
    expect(fresh.wear).toEqual(plain.wear);
    expect(fresh.failure).toBeNull();
    expect('failure' in plain).toBe(false);
  });

  it('an engine already failed does not make a pull: it fails at the first point', () => {
    const r = S.simulateSweep({ ...sweepOf(eng), health: { ...NEW, bearing: 0 } });
    expect(r.failure?.part).toBe('bearing');
    expect(r.points).toHaveLength(1);
    expect(r.events[0].type).toBe('failure');
  });
});

describe('where in a pull the last life runs out', () => {
  const pts = (n, fn) => Array.from({ length: n }, (_, i) => ({ rpm: 1500 + i * 100, knock: false, knockPull: 0, peakPressure: 50, ...fn(i) }));

  it('fails at the point the part is spent, not before', () => {
    // Knock only in the second half of the pull, so that is where the pistons go.
    const points = pts(10, (i) => (i >= 5 ? { knock: true, knockPull: 5 } : {}));
    const wear = { piston: 5 * 5 * S.COEFF.WEAR_KNOCK, bearing: 0, valve: 0 };
    const f = S.sweepFailure(points, wear, { ...NEW, piston: 3 * 5 * S.COEFF.WEAR_KNOCK }, 60);
    expect(f).toMatchObject({ index: 7, part: 'piston' });
    // What the pull to there cost: the knock points 5, 6 and 7.
    expect(f.spent.piston).toBeCloseTo(3 * 5 * S.COEFF.WEAR_KNOCK, 9);
  });

  it('a pull that does not spend a part does not fail', () => {
    const points = pts(10, () => ({ knock: true, knockPull: 1 }));
    const wear = { piston: 10 * S.COEFF.WEAR_KNOCK, bearing: 0, valve: 0 };
    expect(S.sweepFailure(points, wear, { ...NEW, piston: 50 }, 60)).toBeNull();
  });

  it('a dyno pull that spends the bearings fails part way and ends there', () => {
    // 13.5:1 on pump fuel: a peak pressure the bearings pay for on every pull. (Worn rings
    // would be the wrong part to test this on: the charge they leak takes the knock with it.)
    const eng = makeEngine({ build: { engineConfig: { ...S.DEFAULT_ENGINE_CONFIG, compression: 13.5 } } });
    const fresh = S.simulateSweep({ ...sweepOf(eng), health: NEW });
    expect(fresh.wear.bearing).toBeGreaterThan(0);
    const r = S.simulateSweep({ ...sweepOf(eng), health: { ...NEW, bearing: fresh.wear.bearing / 2 } });
    expect(r.failure?.part).toBe('bearing');
    expect(r.points.length).toBeLessThan(fresh.points.length);
    expect(r.points.length).toBeGreaterThan(1);
    expect(r.wear.bearing).toBeGreaterThanOrEqual(fresh.wear.bearing / 2);
    expect(r.points.at(-1).rpm).toBe(r.failure.rpm);
    expect(r.events[0].type).toBe('failure');
  });
});

describe('the live engine', () => {
  const eng = makeEngine();

  it('a failed engine will not turn over', () => {
    const { state } = runLive(eng, { ...NEW, piston: 0 }, { seconds: 3 });
    expect(state.running).toBe(false);
    expect(state.cranking).toBe(false);
    expect(state.failure?.part).toBe('piston');
  });

  it('wears its bearings with no oil pressure, then fails once and stays stopped', () => {
    const started = runLive(eng, NEW, { seconds: 4 });
    expect(started.state.running).toBe(true);
    // A dead pump: the bearings run dry, and wear each step until one goes.
    let health = { ...NEW, bearing: 3 };
    let s = started.state;
    let failures = 0;
    for (let i = 0; i < 400 && !s.failure; i++) {
      const cfg = { ...eng.liveCfg(), health };
      cfg.ecu = { ...cfg.ecu, cond: { ...cfg.ecu.cond, oilHealth: 0 } };
      s = S.liveStep(s, 0.05, { throttle: 20, load: 0 }, cfg);
      if (s.wear) health = { piston: health.piston - s.wear.piston, bearing: health.bearing - s.wear.bearing, valve: health.valve - s.wear.valve };
      if (s.failure) failures += 1;
    }
    expect(s.failure?.part).toBe('bearing');
    expect(s.running).toBe(false);
    expect(failures).toBe(1);
    // After it: no more wear, no restart, and the same failure, not a new one each step.
    const first = s.failure;
    const after = runLive(eng, { ...health, bearing: 0 }, { seconds: 2, from: { ...s, cranking: true } });
    expect(after.state.running).toBe(false);
    expect(after.states.every((x) => x.wear === null)).toBe(true);
    expect(after.state.failure.part).toBe(first.part);
  });

  it('a rebuilt engine starts again', () => {
    const failed = runLive(eng, { ...NEW, bearing: 0 }, { seconds: 1 });
    const rebuilt = runLive(eng, NEW, { seconds: 4, from: { ...failed.state, cranking: true } });
    expect(rebuilt.state.failure).toBeNull();
    expect(rebuilt.state.running).toBe(true);
  });

  it('worn bearings read as lower oil pressure at idle, and the relief still caps it at speed', () => {
    const a = runLive(eng, NEW, { seconds: 5 }).state.ecu.oilKpa;
    const b = runLive(eng, { ...NEW, bearing: 10 }, { seconds: 5 }).state.ecu.oilKpa;
    expect(b).toBeLessThan(a);
    // The pump's pressure below its relief divides by how freely the system leaks; at the
    // relief (cold oil at speed) it is the valve that sets it, worn or not.
    expect(oilPressureKpa(7000, 30, 1 / S.oilConductance(0.9))).toBe(ECU_COEFF.OIL_RELIEF_KPA);
    expect(oilPressureKpa(800, 100, 1 / S.oilConductance(0.9))).toBeLessThan(oilPressureKpa(800, 100, 1));
  });
});

describe('live wear from operating conditions', () => {
  const base = {
    pt: { knock: false, knockPull: 0, peakPressure: 40 }, dt: 1, rpm: 3000, oilKpa: 400, healthyOilKpa: 400, coolantC: 90,
    ratedRpm: 7000, bearingFreeBar: 60, bearingWearMult: 1, pointSeconds: 0.2, pullSeconds: 12,
  };

  it('costs nothing running gently', () => {
    expect(S.liveWear(base)).toEqual({ piston: 0, bearing: 0, valve: 0 });
  });

  it('charges knock at the dyno rate per second', () => {
    const w = S.liveWear({ ...base, pt: { ...base.pt, knock: true, knockPull: 2 } });
    expect(w.piston).toBeCloseTo(2 * S.COEFF.WEAR_KNOCK / 0.2, 9);
  });

  it('spends a whole bottom end in the 28 s a dry bearing took to seize (Nissan, US 9,109,627)', () => {
    let left = 100, t = 0;
    while (left > 0 && t < 120) { left -= S.liveWear({ ...base, dt: 0.05, oilKpa: 0 }).bearing; t += 0.05; }
    expect(t).toBeGreaterThan(26);
    expect(t).toBeLessThan(30);
  });

  it('judges oil pressure against the maker\'s minimum: 29 kPa at idle, and the share of a healthy pump', () => {
    // Toyota: 29 kPa or more at idle; 245 kPa minimum at 3000 rpm against 490-539 normal.
    expect(S.liveWear({ ...base, rpm: 800, oilKpa: 30, healthyOilKpa: 40 }).bearing).toBe(0);
    expect(S.liveWear({ ...base, rpm: 800, oilKpa: 25, healthyOilKpa: 40 }).bearing).toBeGreaterThan(0);
    expect(S.liveWear({ ...base, oilKpa: 0.46 * 400 }).bearing).toBe(0);
    expect(S.liveWear({ ...base, oilKpa: 0.40 * 400 }).bearing).toBeGreaterThan(0);
  });

  it('charges oil starvation, overspeed and boiling coolant', () => {
    expect(S.liveWear({ ...base, oilKpa: 50 }).bearing).toBeGreaterThan(0);
    // Hot thin oil at idle reads low on every engine; against its own healthy pump it is
    // not starvation.
    expect(S.liveWear({ ...base, rpm: 800, oilKpa: 100, healthyOilKpa: 120 }).bearing).toBe(0);
    // A factory engine bounces off its own limiter without harm: within 12% of the rated
    // speed (1.25 times its inertia load) costs nothing; past it, the bearings wear.
    expect(S.liveWear({ ...base, rpm: 7700 }).bearing).toBe(0);
    expect(S.liveWear({ ...base, rpm: 8000 }).bearing).toBeGreaterThan(0);
    const hot = S.liveWear({ ...base, coolantC: 130 });
    expect(hot.piston).toBeGreaterThan(0);
    expect(hot.valve).toBeGreaterThan(0);
    // A 50/50 glycol coolant under a 15 lb cap boils over at 265 °F (Prestone): below it,
    // nothing.
    expect(S.liveWear({ ...base, coolantC: 128 })).toEqual({ piston: 0, bearing: 0, valve: 0 });
  });
});

/** The harness's dyno pull arguments, with the ECU in the loop, as the app runs them. */
const sweepOf = (eng) => eng.pullArgs(100);

describe('a stock engine run as its maker meant lasts', () => {
  it('two minutes on the stand, idling, blipped to the limiter and held flat out, costs it nothing', () => {
    // A stock VQ35DE once lost 12% of its life in five minutes on the stand: every bounce
    // off its own limiter was charged as overspeed, and every instant at its torque peak
    // against the bearing threshold that was set for a whole pull's average.
    const eng = makeEngine({ preset: 'vq35de-revup' });
    const pedal = (t) => (t % 20 < 4 ? 100 : t % 20 < 8 ? 60 : 0);
    const { state } = runLive(eng, NEW, { seconds: 120, pedal: 0 });
    let s = state, health = NEW;
    const cfg = { ...eng.liveCfg({}), health };
    for (let i = 0; i < 120 / 0.05; i++) {
      s = S.liveStep(s, 0.05, { throttle: pedal(i * 0.05), load: 0 }, { ...cfg, health });
      if (s.wear) health = S.applyWear(health, s.wear);
    }
    expect(s.running).toBe(true);
    expect(health.bearing).toBe(100);
    expect(health.valve).toBe(100);
    expect(health.piston).toBeGreaterThan(99.9);
  });

  it('a turbo bolted on before the tables are tuned costs a little per pull, not half the engine', () => {
    // The ECU's knock control hears it and pulls timing: knock at the limit, which is what
    // knock control is for. It once cost 19% of the pistons per pull.
    const eng = makeEngine({ preset: 'vq35hr', build: { turboOn: true, boostCurve: Array(8).fill(7), injIdx: 3, ecuInjectorCc: 650 } });
    const r = S.simulateSweep({ ...sweepOf(eng), health: NEW });
    expect(r.points.some((p) => p.knockPull > 3)).toBe(true);
    expect(r.wear.piston).toBeGreaterThan(0);
    expect(r.wear.piston).toBeLessThan(3);
    expect(r.failure).toBeNull();
  });
});
