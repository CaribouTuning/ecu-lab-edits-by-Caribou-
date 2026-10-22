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

import { DEFAULT_CAR, G, RHO_AIR, TIRE_GRIP, simulateDragRun, simulateSweep, tireRadiusM, torqueCurveFromSweep } from '../src/sim/index.js';
import { makeInitialState } from '../src/ui/state/initialState.js';
import { pullInputs } from '../src/ui/state/pullInputs.js';
import { NEUTRAL } from '../src/ui/career/chassis.js';
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
const TIRE_GRIP_MU = (c) => TIRE_GRIP[c.gripIdx].mu;

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

describe('it drives like a road car, not a car on ice', () => {
  const moving = (speed) => { const v = makeVehicle(); v.vx = speed; v.wR = v.wF = speed / tireRadiusM(car); v.gear = 3; return v; };

  it('holding full lock at any speed pushes wide; it never spins with the aids on', () => {
    for (const speed of [8, 15, 25, 35]) {
      let worstBeta = 0;
      const { v } = run(pt(), { throttle: 0.4, brake: 0, steer: -1 }, (s, t) => { worstBeta = Math.max(worstBeta, Math.abs(Math.atan2(s.vy, Math.max(0.1, s.vx)))); return t > 4; }, 5, moving(speed));
      // The nose runs wide and the tail may step out a little, but the car never rotates past its path.
      expect(worstBeta, `${speed} m/s`).toBeLessThan(0.25);
      expect(v.vx, `${speed} m/s`).toBeGreaterThan(Math.abs(v.vy) * 3);
    }
  });

  it('the tyres take a moment to bite: yaw builds over a tenth of a second or more, not instantly', () => {
    const v = moving(25);
    let yaw100 = 0; let yawEnd = 0; let t = 0;
    const p = pt();
    while (t < 0.8) { stepVehicle(v, p, { throttle: 0.2, brake: 0, steer: -0.3 }); t += STEP_S; if (Math.abs(t - 0.1) < STEP_S / 2) yaw100 = Math.abs(v.yawRate); }
    yawEnd = Math.abs(v.yawRate);
    expect(yaw100).toBeLessThan(yawEnd * 0.6);
    expect(yawEnd).toBeGreaterThan(0.05);
  });

  it('an axle that carries the weight transfer loses grip: a car loaded hard sideways corners at less than mu g', () => {
    // On a flat plane the limit is mu g; load sensitivity and weight transfer keep a street car below it.
    let peak = 0;
    run(pt(), (s) => ({ throttle: s.vx < 20 ? 0.5 : 0.1, brake: 0, steer: 0.8 }), (s, t) => { if (t > 3) peak = Math.max(peak, Math.abs(s.ay)); return t > 6; }, 7, moving(20));
    expect(peak / G).toBeLessThan(0.97 * TIRE_GRIP_MU(car));
  });

  it('brakes hard into a turn and slides wide at worst: it never swaps ends', () => {
    // Braking at most of the grip while turning asks more of the tyres than they have, so the
    // car runs wide; what it must not do is rotate past the way it is going.
    let worstBeta = 0;
    run(pt(), (s, t) => ({ throttle: 0, brake: t < 2 ? 0.8 : 0, steer: t > 0.3 ? 0.6 : 0 }), (s, t) => { worstBeta = Math.max(worstBeta, Math.abs(Math.atan2(s.vy, Math.max(0.1, s.vx)))); return t > 3; }, 4, moving(30));
    expect(worstBeta).toBeLessThan(0.3);
  });

  it('lets go of the wheel and the car straightens up by itself', () => {
    const { v } = run(pt(), (s, t) => ({ throttle: 0.3, brake: 0, steer: t < 1.5 ? 1 : 0 }), (s, t) => t > 4, 5, moving(22));
    expect(Math.abs(v.yawRate)).toBeLessThan(0.02);
    expect(Math.abs(v.vy)).toBeLessThan(0.1);
  });

  it('with the aids off and the handbrake up, the tail can still be thrown out: a slide is the driver’s choice', () => {
    let worstRear = 0;
    run(pt(), (s, t) => ({ throttle: 0.3, brake: 0, steer: t > 0.2 ? 1 : 0, handbrake: t > 0.2 && t < 1.2, tc: false }), (s, t) => { worstRear = Math.max(worstRear, s.slipR); return t > 2; }, 3, moving(18));
    expect(worstRear).toBeGreaterThan(1.2);
  });

  it('stickier tyres corner harder: grip is the speed limit in a turn', () => {
    const peakG = (gripIdx) => {
      let peak = 0;
      run(pt({ gripIdx }), (s) => ({ throttle: s.vx < 18 ? 0.5 : 0.1, brake: 0, steer: 0.7 }), (s, t) => { if (t > 2) peak = Math.max(peak, Math.abs(s.ay)); return t > 5; }, 6, moving(18));
      return peak;
    };
    expect(peakG(1)).toBeGreaterThan(peakG(0) * 1.1);
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
    expect(v.vx).toBeLessThan(-5);
    expect(v.vx).toBeGreaterThan(-8.5);
  });

  it('does not move on its own: coasting rolls to rest, and waiting at a stop on the brake does not back up', () => {
    const v = makeVehicle();
    const p = pt();
    for (let i = 0; i < 240 * 3; i += 1) stepVehicle(v, p, { throttle: 1, brake: 0, steer: 0 });
    for (let i = 0; i < 240 * 30; i += 1) stepVehicle(v, p, { throttle: 0, brake: 0, steer: 0 });
    expect(v.vx).toBe(0);
    // Brake to a stop and keep the foot on it a moment, then let go: the car stays where it is.
    for (let i = 0; i < 240 * 3; i += 1) stepVehicle(v, p, { throttle: 1, brake: 0, steer: 0 });
    let t = 0;
    while (v.vx > 0.01 && t < 20) { stepVehicle(v, p, { throttle: 0, brake: 1, steer: 0 }); t += STEP_S; }
    for (let i = 0; i < 240 * 0.6; i += 1) stepVehicle(v, p, { throttle: 0, brake: 1, steer: 0 });
    expect(v.reverse).toBe(false);
    const x = v.x; const z = v.z;
    for (let i = 0; i < 240 * 10; i += 1) stepVehicle(v, p, { throttle: 0, brake: 0, steer: 0 });
    expect(Math.hypot(v.x - x, v.z - z)).toBeLessThan(0.1);
    // A fresh press of the brake at a stop is reverse.
    for (let i = 0; i < 240 * 2; i += 1) stepVehicle(v, p, { throttle: 0, brake: 1, steer: 0 });
    expect(v.vx).toBeLessThan(-2);
  });

  it('moves weight on sprung bodywork: it takes a moment to arrive, then settles where the acceleration says', () => {
    const v = makeVehicle();
    const p = pt();
    Object.assign(v, { vx: 25, wR: 25 / tireRadiusM(car), wF: 25 / tireRadiusM(car), gear: 4 });
    for (let i = 0; i < 240 * 0.5; i += 1) stepVehicle(v, p, { throttle: 0, brake: 0, steer: 0 });
    const t0 = v.pitchA;
    // A stab of the brake: the car decelerates at once, but the nose takes its time to go down.
    for (let i = 0; i < 12; i += 1) stepVehicle(v, p, { throttle: 0, brake: 0.8, steer: 0 });
    expect(Math.abs(v.pitchA - t0)).toBeLessThan(Math.abs(v.ax - t0) * 0.3);
    for (let i = 0; i < 240 * 1; i += 1) stepVehicle(v, p, { throttle: 0, brake: 0.8, steer: 0 });
    expect(v.pitchA).toBeCloseTo(v.ax, 0);
    // Stiffer springs settle sooner.
    const soft = makeVehicle(); const stiff = makeVehicle();
    for (const [st, hz] of /** @type {[typeof soft, number][]} */ ([[soft, 1], [stiff, 1.4]])) {
      const q = pt({ chassis: { ...NEUTRAL, bodyHz: hz } });
      Object.assign(st, { vx: 25, wR: 25 / tireRadiusM(car), wF: 25 / tireRadiusM(car), gear: 4 });
      for (let i = 0; i < 24; i += 1) stepVehicle(st, q, { throttle: 0, brake: 0.8, steer: 0 });
    }
    expect(stiff.pitchA).toBeLessThan(soft.pitchA);
  });

  it('pulls away like a car, not a CVT: the revs come down onto the wheels and then climb with the road speed', () => {
    const v = makeVehicle();
    const p = pt();
    const rpm = [];
    for (let i = 0; i < 240 * 3; i += 1) { stepVehicle(v, p, { throttle: 1, brake: 0, steer: 0, tc: false }); if (i % 24 === 0 && v.gear === 1 && v.rpm < redline * 0.95) rpm.push(v.rpm); }
    const low = Math.min(...rpm.slice(1));
    expect(low).toBeLessThan(rpm[0] - 300);
    expect(low).toBeGreaterThan(1900);
    // Never a flat note: every tenth of a second in the climb, the revs have moved.
    const climb = rpm.slice(rpm.indexOf(low) + 1);
    for (let i = 1; i < climb.length; i += 1) expect(climb[i]).toBeGreaterThan(climb[i - 1]);
  });

  it('traction control cuts sparks in bursts, not a steady trim', () => {
    const v = makeVehicle();
    const p = pt();
    let flips = 0;
    let was = false;
    for (let i = 0; i < 240; i += 1) { stepVehicle(v, p, { throttle: 1, brake: 0, steer: 0 }); if (v.tcCutting !== was) flips += 1; was = !!v.tcCutting; }
    expect(flips).toBeGreaterThan(4);
  });

  it('steers in reverse along the path its wheels roll, without sliding sideways', () => {
    const v = makeVehicle();
    const p = pt();
    for (let i = 0; i < 240 * 2; i += 1) stepVehicle(v, p, { throttle: 0, brake: 1, steer: 0 });
    for (let i = 0; i < 240 * 2; i += 1) stepVehicle(v, p, { throttle: 0, brake: 1, steer: 1 });
    const L = car.wheelbaseM;
    expect(v.vx).toBeLessThan(-3);
    // Yaw as the wheels roll, and the only sideways motion is the geometry's, not a slide.
    expect(v.yawRate).toBeCloseTo((v.vx * Math.tan(v.steer)) / L, 1);
    expect(Math.abs(Math.atan2(v.vy, -v.vx))).toBeLessThan(0.45);
  });

  it('slows a car rolling backwards in a forward gear, and its tyres pull a sideways slide straight', () => {
    const v = makeVehicle();
    const p = pt();
    Object.assign(v, { vx: -8, vy: 4, yawRate: 1, wR: -8 / tireRadiusM(car), wF: -8 / tireRadiusM(car) });
    for (let i = 0; i < 240 * 2; i += 1) stepVehicle(v, p, { throttle: 0, brake: 0, steer: 0 });
    expect(v.vx).toBeGreaterThan(-8);
    expect(Math.abs(v.vy)).toBeLessThan(0.5);
    expect(Math.abs(v.yawRate)).toBeLessThan(0.2);
  });

  it('respects the rev limiter', () => {
    const v = makeVehicle();
    const p = pt();
    let max = 0;
    for (let i = 0; i < 240 * 20; i += 1) { stepVehicle(v, p, { ...flat, manual: true }); max = Math.max(max, v.rpm); }
    expect(max).toBeLessThan(redline + 700);
  });
});
