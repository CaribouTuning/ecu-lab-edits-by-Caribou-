// @ts-nocheck: partial saves and cars, to prove one rule at a time.

/**
 * Suspension, tyres and transmission: every control is a lever on one number in the vehicle
 * model, so each one is held to the direction the physics says it moves things. The engine is
 * not involved: none of these change the torque curve.
 */

import { describe, expect, it } from 'vitest';

import { CHASSIS_PARTS, CONTROLS, NEUTRAL, closeRatios, effective, physicsOf, resetChassis, tuneChassis } from '../src/ui/career/chassis.js';
import { engineState } from '../src/ui/career/engines.js';
import { fitPart, ownedCar } from '../src/ui/career/ownedCars.js';
import { newCareer } from '../src/ui/career/shop.js';
import { chassisReport } from '../src/ui/world/chassisReport.js';
import { driveSetup } from '../src/ui/world/vehicle.js';

const st = engineState('lr4');
const setup = (has = {}, set = {}, drag = {}) => driveSetup({ build: st.build, tune: st.tune }, { body: 'coupe', drag: { ...drag, chassis: { has, set } } });
const report = (has, set, drag) => chassisReport(setup(has, set, drag).pt);
const ALL = { springs: true, coilovers: true, arb: true, camber: true, lsd: true, fdkit: true };

describe('the controls', () => {
  it('a car with nothing fitted runs on the defaults, exactly', () => {
    expect(physicsOf({}, {})).toEqual(NEUTRAL);
    expect(NEUTRAL.rollShareF).toBeCloseTo(0.55, 10);
    const a = chassisReport(driveSetup({ build: st.build, tune: st.tune }, { body: 'coupe' }).pt);
    const b = report({}, {});
    expect(b.skidpadG).toBeCloseTo(a.skidpadG, 9);
    expect(b.brakeM).toBeCloseTo(a.brakeM, 9);
  });

  it('only open controls take: a stock car ignores a spring rate, a coilover car does not', () => {
    expect(effective({}, { springF: 9, psiF: 36 }).springF).toBe(5);
    expect(effective({}, { springF: 9, psiF: 36 }).psiF).toBe(36);
    expect(effective({ coilovers: true }, { springF: 9 }).springF).toBe(9);
    expect(effective({ coilovers: true }, { springF: 99 }).springF).toBe(10);
    expect(effective({ springs: true }, {}).rideMm).toBe(-25);
    expect(CONTROLS.every((c) => !c.needs || c.needs.every((p) => CHASSIS_PARTS[p]))).toBe(true);
  });

  it('close ratios close the steps and keep top gear', () => {
    const g = [3.79, 2.32, 1.62, 1.27, 1.0, 0.79];
    const c = closeRatios(g);
    expect(c[5]).toBeCloseTo(0.79, 10);
    for (let i = 1; i < 6; i += 1) expect(c[i - 1] / c[i]).toBeLessThan(g[i - 1] / g[i]);
    expect(c[0]).toBeLessThan(g[0]);
  });
});

describe('what they do to the car', () => {
  it('a stiffer front bar adds understeer, a stiffer rear bar takes it away', () => {
    const base = report(ALL, { arbF: 5, arbR: 5 }).bias;
    expect(report(ALL, { arbF: 9, arbR: 5 }).bias).toBeGreaterThan(base);
    expect(report(ALL, { arbF: 5, arbR: 9 }).bias).toBeLessThan(base);
  });

  it('spring rates move the balance the same way', () => {
    expect(report(ALL, { springF: 9 }).bias).toBeGreaterThan(report(ALL, { springR: 9 }).bias);
  });

  it('a lower car corners harder: less weight transfer', () => {
    expect(report(ALL, { rideMm: -50 }).skidpadG).toBeGreaterThan(report(ALL, { rideMm: 0 }).skidpadG);
  });

  it('negative camber helps cornering and costs braking, up to a point', () => {
    const flat = report(ALL, { camberF: -0.5, camberR: -0.5 });
    const lean = report(ALL, { camberF: -3, camberR: -3 });
    expect(lean.skidpadG).toBeGreaterThan(flat.skidpadG);
    expect(lean.brakeM).toBeGreaterThan(flat.brakeM);
    const extreme = report(ALL, { camberF: -4, camberR: -4 });
    expect(extreme.skidpadG).toBeLessThan(lean.skidpadG);
  });

  it('tyre pressure has a sweet spot', () => {
    const at = (p) => report({}, { psiF: p, psiR: p }).skidpadG;
    expect(at(32)).toBeGreaterThan(at(26));
    expect(at(32)).toBeGreaterThan(at(40));
  });

  it('a limited-slip diff keeps traction through a corner', () => {
    expect(report(ALL, { diff: 80 }).skidpadG).toBeGreaterThan(report(ALL, { diff: 0 }).skidpadG);
  });

  it('brake bias has an ideal: braking loads the front, so too little at the front wastes it, and too much locks it', () => {
    const at = (b) => report({}, { brake: b }).brakeM;
    // Weight moves forward under braking, so the ideal sits forward of an even split. Near the
    // ideal, ABS holding each axle at its peak slip makes it flat: 65 and 70 stop within a hand's breadth.
    expect(at(70)).toBeLessThan(at(50));
    expect(Math.abs(at(70) - at(65))).toBeLessThan(0.3);
  });

  it('the final drive sets the gearing: taller means a lower top speed, with the same engine', () => {
    const top = (fd) => { const c = setup({ fdkit: true }, { finalDrive: fd }); return c.redline / (c.car.gears[c.car.gearCount - 1] * c.car.finalDrive); };
    expect(setup({ fdkit: true }, { finalDrive: 4.4 }).car.finalDrive).toBe(4.4);
    expect(top(4.4)).toBeLessThan(top(3.0));
    expect(setup({ fdkit: true }, { finalDrive: 4.4 }).peakHp).toBe(setup({}, {}).peakHp);
  });

  it('a sequential box shifts faster and nothing about the engine changes', () => {
    expect(physicsOf({ sequential: true }).shiftScale).toBeLessThan(0.5);
    expect(setup({ sequential: true }, {}).peakTq).toBe(setup({}, {}).peakTq);
  });
});

describe('fitting and setting', () => {
  it('parts open controls, settings stick, and a reset puts them back', () => {
    let c = { ...newCareer(31), money: 50000, rep: 50 };
    const id = c.cars[0].id;
    expect(fitPart(c, id, 'coilovers').money).toBeLessThan(c.money);
    c = fitPart(c, id, 'coilovers');
    c = fitPart(c, id, 'arb');
    expect(ownedCar(c, id).drag.chassis.has).toEqual({ coilovers: true, arb: true });
    c = tuneChassis(c, id, { springF: 8, arbR: 2 });
    expect(effective(ownedCar(c, id).drag.chassis.has, ownedCar(c, id).drag.chassis.set)).toMatchObject({ springF: 8, arbR: 2 });
    c = resetChassis(c, id);
    expect(ownedCar(c, id).drag.chassis.set).toEqual({});
    expect(ownedCar(c, id).drag.chassis.has).toEqual({ coilovers: true, arb: true });
  });

  it('sport springs and coilovers do not stack, and a part is not fitted twice', () => {
    let c = { ...newCareer(32), money: 50000, rep: 50 };
    const id = c.cars[0].id;
    c = fitPart(c, id, 'coilovers');
    expect(fitPart(c, id, 'springs')).toBe(c);
    expect(fitPart(c, id, 'coilovers')).toBe(c);
  });
});
