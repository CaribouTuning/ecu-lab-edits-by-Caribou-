/**
 * Engine damage (src/sim/damage.js): worn parts change what the engine does, the live
 * engine wears from the conditions that wear real parts, and a part at zero is a failed
 * engine — a state, entered once, that stops it until it is rebuilt.
 */

import { describe, expect, it } from 'vitest';

import * as S from '../src/sim/index.js';
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
    expect(half.leakFrac).toBeGreaterThan(0);
    expect(gone.leakFrac).toBeGreaterThan(half.leakFrac);
    expect(half.deadFrac).toBe(0);
  });

  it('a burnt valve leaks one cylinder, and stops it firing near the end', () => {
    expect(S.wearEffects({ ...NEW, valve: 60 }, 6).deadFrac).toBe(0);
    const late = S.wearEffects({ ...NEW, valve: 5 }, 6);
    expect(late.deadFrac).toBeGreaterThan(0);
    expect(late.deadFrac).toBeLessThanOrEqual(1 / 6);
  });

  it('wiped bearings add friction and lose oil pressure', () => {
    const fx = S.wearEffects({ ...NEW, bearing: 20 }, 6);
    expect(fx.bearingFmepPa).toBeGreaterThan(0);
    expect(fx.oilPressureFactor).toBeLessThan(1);
  });
});

describe('a worn engine on the dyno', () => {
  const eng = makeEngine();

  it('makes less power with worn rings, through the physics, and runs richer for it', () => {
    const fresh = S.simulateSweep({ ...sweepOf(eng), health: NEW });
    const worn = S.simulateSweep({ ...sweepOf(eng), health: { ...NEW, piston: 20 } });
    expect(worn.peakHp).toBeLessThan(fresh.peakHp);
    // The ECU fuels for the air its table claims; the cylinder holds less, so the mixture
    // it burns is richer.
    const at = (r, rpm) => r.points.find((p) => p.rpm === rpm);
    expect(at(worn, 4000).lambda).toBeLessThan(at(fresh, 4000).lambda);
    expect(worn.failure).toBeNull();
  });

  it('loses power to wiped bearings as friction', () => {
    const fresh = S.simulateSweep({ ...sweepOf(eng), health: NEW });
    const worn = S.simulateSweep({ ...sweepOf(eng), health: { ...NEW, bearing: 10 } });
    const at = (r, rpm) => r.points.find((p) => p.rpm === rpm);
    expect(at(worn, 5000).fmep).toBeGreaterThan(at(fresh, 5000).fmep);
    expect(worn.peakHp).toBeLessThan(fresh.peakHp);
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
    expect(f).toEqual({ index: 7, part: 'piston' });
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

  it('worn bearings read as lower oil pressure', () => {
    const a = runLive(eng, NEW, { seconds: 5 }).state.ecu.oilKpa;
    const b = runLive(eng, { ...NEW, bearing: 10 }, { seconds: 5 }).state.ecu.oilKpa;
    expect(b).toBeLessThan(a);
  });
});

describe('live wear from operating conditions', () => {
  const base = {
    pt: { knock: false, knockPull: 0, peakPressure: 40 }, dt: 1, rpm: 3000, oilKpa: 400, coolantC: 90,
    ratedRpm: 7000, bearingFreeBar: 60, bearingWearMult: 1, pointSeconds: 0.2, pullSeconds: 12,
  };

  it('costs nothing running gently', () => {
    expect(S.liveWear(base)).toEqual({ piston: 0, bearing: 0, valve: 0 });
  });

  it('charges knock at the dyno rate per second', () => {
    const w = S.liveWear({ ...base, pt: { ...base.pt, knock: true, knockPull: 2 } });
    expect(w.piston).toBeCloseTo(2 * S.COEFF.WEAR_KNOCK / 0.2, 9);
  });

  it('charges oil starvation, overspeed and boiling coolant', () => {
    expect(S.liveWear({ ...base, oilKpa: 50 }).bearing).toBeGreaterThan(0);
    expect(S.liveWear({ ...base, rpm: 7700 }).bearing).toBeGreaterThan(0);
    const hot = S.liveWear({ ...base, coolantC: 130 });
    expect(hot.piston).toBeGreaterThan(0);
    expect(hot.valve).toBeGreaterThan(0);
  });
});

/** The harness's dyno pull arguments, with the ECU in the loop, as the app runs them. */
const sweepOf = (eng) => eng.pullArgs(100);
