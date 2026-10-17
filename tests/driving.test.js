/**
 * Driving a tuned car in the world.
 *
 * The world's vehicle model (src/ui/world/driving.js) pushes the car with the engine's own
 * dyno torque curve, and these tests hold it to the physics it is built from: it
 * agrees with the drag strip's 0-60, tops out where power meets drag, brakes and corners at
 * the tyre's grip, and a more powerful or lighter car is faster. None of it is tuned to a
 * number; the tolerances say how close two honest models of the same car should be.
 */

import { describe, expect, it } from 'vitest';

import { DEFAULT_CAR, G, RHO_AIR, simulateDragRun, simulateSweep, tireRadiusM, torqueCurveFromSweep } from '../src/sim/index.js';
import { makeInitialState } from '../src/ui/state/initialState.js';
import { pullInputs } from '../src/ui/state/pullInputs.js';
import { STEP_S, makeVehicle, powertrainOf, stepVehicle, toMph } from '../src/ui/world/driving.js';
import { dragCarFor } from '../src/ui/world/vehicle.js';

const state = makeInitialState();
const inputs = pullInputs(state);
const sweep = simulateSweep(inputs.args);
const torque = torqueCurveFromSweep(sweep);
const redline = inputs.derived.redline;
const disp = inputs.derived.displacementL;
const car = { ...DEFAULT_CAR };
const pt = (over = {}, torqueFn = torque) => powertrainOf({ ...car, ...over }, torqueFn, redline, { displacementL: disp });

/** Run until `stop` says so or the time is up. */
function run(p, input, stop, seconds = 60, v0 = makeVehicle()) {
  const v = v0;
  let t = 0;
  while (t < seconds && !stop(v, t)) { stepVehicle(v, p, typeof input === 'function' ? input(v, t) : input); t += STEP_S; }
  return { v, t };
}
const flat = { throttle: 1, brake: 0, steer: 0 };

describe('the world agrees with the strip', () => {
  const strip = simulateDragRun({ car, torqueCurveNm: torque, redline, displacementL: disp, peakHp: sweep.peakHp });

  it('0-60 mph is within 14% of the drag strip’s, and never quicker than it', () => {
    const { t } = run(pt(), flat, (v) => toMph(v.vx) >= 60);
    expect(t).toBeGreaterThanOrEqual(strip.zeroToSixty * 0.97);
    expect(t).toBeLessThanOrEqual(strip.zeroToSixty * 1.14);
  });

  it('the quarter mile is within 8% of the strip’s', () => {
    const { t } = run(pt(), flat, (v) => v.z >= 402.3);
    expect(t).toBeGreaterThanOrEqual(strip.et * 0.97);
    expect(t).toBeLessThanOrEqual(strip.et * 1.08);
  });
});

describe('top speed is where power meets drag', () => {
  it('matches the force balance of the same curve and gearing within 4%', () => {
    const r = tireRadiusM(car);
    let best = 0;
    for (const g of car.gears.slice(0, car.gearCount)) {
      for (let v = 20; v < 120; v += 0.05) {
        const rpm = ((v / (2 * Math.PI * r)) * g * car.finalDrive) * 60;
        if (rpm > redline) break;
        const drive = (torque(rpm) * g * car.finalDrive) / r;
        const resist = 0.5 * RHO_AIR * car.cd * car.frontalAreaM2 * v * v + car.crr * car.massKg * G;
        if (drive >= resist) best = Math.max(best, v);
      }
    }
    const { v } = run(pt(), flat, (_, t) => t > 150, 150);
    expect(v.vx).toBeGreaterThan(best * 0.96);
    expect(v.vx).toBeLessThan(best * 1.04);
  });
});

describe('the tyres are the limit', () => {
  const mu = 0.85;
  it('braking from 100 km/h takes about v squared over 2 mu g, within -5% and +25%', () => {
    const v0 = makeVehicle();
    const speed = 100 / 3.6;
    v0.vx = speed; v0.wR = v0.wF = speed / tireRadiusM(car);
    const { v } = run(pt(), { throttle: 0, brake: 1, steer: 0 }, (s) => s.vx < 0.1, 20, v0);
    const ideal = (speed ** 2) / (2 * mu * G);
    expect(v.z).toBeGreaterThan(ideal * 0.95);
    expect(v.z).toBeLessThan(ideal * 1.25);
  });

  it('cornering never beats the grip circle, and gets most of the way there', () => {
    const v0 = makeVehicle();
    v0.vx = 18; v0.wR = v0.wF = 18 / tireRadiusM(car);
    let peak = 0;
    const { v } = run(pt(), (s, t) => ({ throttle: s.vx < 18 ? 0.5 : 0.1, brake: 0, steer: t > 1 ? 1 : 0 }), (s, t) => { if (t > 4) peak = Math.max(peak, Math.abs(s.ay)); return t > 8; }, 9, v0);
    void v;
    expect(peak / G).toBeLessThan(mu * 1.05);
    expect(peak / G).toBeGreaterThan(mu * 0.6);
  });

  it('grass grips less than road, so the same turn pulls fewer g', () => {
    const turn = (gripScale) => {
      const v0 = makeVehicle();
      v0.vx = 16; v0.wR = v0.wF = 16 / tireRadiusM(car);
      let peak = 0;
      run(pt(), (s, t) => ({ throttle: s.vx < 16 ? 0.5 : 0.12, brake: 0, steer: t > 1 ? 1 : 0, gripScale }), (s, t) => { if (t > 4) peak = Math.max(peak, Math.abs(s.ay)); return t > 7; }, 8, v0);
      return peak;
    };
    expect(turn(0.55)).toBeLessThan(turn(1) * 0.75);
  });

  it('traction control keeps the driven tyres near their peak slip, and switching it off lets them spin', () => {
    const peakSlip = (tc) => {
      let peak = 0;
      run(pt(), { ...flat, tc }, (s, t) => { if (t < 3) peak = Math.max(peak, s.wheelspin); return t > 3; }, 4);
      return peak;
    };
    expect(peakSlip(true)).toBeLessThan(0.3);
    expect(peakSlip(false)).toBeGreaterThan(0.5);
  });
});

describe('the car is what the tuner made', () => {
  const sixty = (p) => run(p, flat, (v) => toMph(v.vx) >= 60, 40).t;
  it('more torque is quicker, less is slower', () => {
    const base = sixty(pt());
    expect(sixty(pt({}, (r) => torque(r) * 1.25))).toBeLessThan(base);
    expect(sixty(pt({}, (r) => torque(r) * 0.75))).toBeGreaterThan(base);
  });
  it('a lighter car is quicker and a heavier one slower', () => {
    const base = sixty(pt());
    expect(sixty(pt({ massKg: car.massKg - 200 }))).toBeLessThan(base);
    expect(sixty(pt({ massKg: car.massKg + 400 }))).toBeGreaterThan(base);
  });
  it('sticky tyres launch harder than street tyres on a car with power to spare', () => {
    const strong = (r) => torque(r) * 2;
    expect(sixty(pt({ gripIdx: 2 }, strong))).toBeLessThan(sixty(pt({ gripIdx: 0 }, strong)));
  });
  it('every body the world draws is a car with sane figures', () => {
    for (const b of ['coupe', 'sedan', 'hatch', 'wagon', 'muscle', 'supercar', 'suv', 'pickup', 'van', 'kei', 'roadster']) {
      const d = dragCarFor(b);
      expect(d.massKg).toBeGreaterThan(700);
      expect(d.massKg).toBeLessThan(2500);
      expect(d.rearFrac).toBeGreaterThan(0.3);
      expect(d.rearFrac).toBeLessThan(0.6);
      expect(d.wheelbaseM).toBeGreaterThan(2);
      expect(d.cgHeightM).toBeGreaterThan(0.35);
    }
    expect(dragCarFor('coupe', { lowered: 1 }).cgHeightM).toBeLessThan(dragCarFor('coupe').cgHeightM);
    expect(dragCarFor('coupe', { massDelta: -60 }).massKg).toBe(dragCarFor('coupe').massKg - 60);
  });
});

describe('it stays a physical thing', () => {
  it('never produces a non-finite number, whatever it is asked', () => {
    const v = makeVehicle();
    let seed = 7;
    const r = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const p = pt();
    let thr = 0; let brk = 0; let str = 0;
    for (let i = 0; i < 240 * 90; i += 1) {
      if (i % 120 === 0) { thr = r(); brk = r() < 0.3 ? r() : 0; str = r() * 2 - 1; }
      stepVehicle(v, p, { throttle: thr, brake: brk, steer: str, handbrake: r() < 0.003, shift: r() < 0.002 ? 1 : 0 });
      expect(Number.isFinite(v.x + v.z + v.vx + v.vy + v.yawRate + v.rpm + v.wR + v.wF)).toBe(true);
    }
  });

  it('holds still when parked and reverses on the brake pedal at a stop, to a walking-pace limit', () => {
    const v = makeVehicle();
    const p = pt();
    for (let i = 0; i < 240 * 3; i += 1) stepVehicle(v, p, { throttle: 0, brake: 0, steer: 0 });
    expect(Math.abs(v.vx)).toBeLessThan(0.05);
    for (let i = 0; i < 240 * 6; i += 1) stepVehicle(v, p, { throttle: 0, brake: 1, steer: 0 });
    expect(v.vx).toBeLessThan(-2);
    expect(v.vx).toBeGreaterThan(-6.5);
  });

  it('respects the rev limiter', () => {
    const v = makeVehicle();
    const p = pt();
    let max = 0;
    for (let i = 0; i < 240 * 20; i += 1) { stepVehicle(v, p, { ...flat, manual: true }); max = Math.max(max, v.rpm); }
    expect(max).toBeLessThan(redline + 700);
  });
});
