// @ts-nocheck: these tests build partial saves and cars on purpose, to prove one rule at a time.

/**
 * The tuner's own cars: buying, parts, lifts, looks, fuel and selling. They ride the shop's
 * lift machinery under a synthetic job, so these also pin that a kept car never behaves like
 * a customer's: it pays nothing and is never graded.
 */

import { describe, expect, it } from 'vitest';

import { jobById } from '../src/ui/career/jobs.js';
import {
  MODELS, PARTS, buyCar, cannotBuyCar, cannotFit, carLimit, carState, dealerStock, fitPart, ownJobId, ownedCar, parkOnLift, refuel, restyleCar,
  sellCar, stowFromLift, valueOf,
} from '../src/ui/career/ownedCars.js';
import { newCareer, reviveCareer, train } from '../src/ui/career/shop.js';

// Without the starter car, so a test counts only the cars it buys.
const rich = (extra = {}) => ({ ...newCareer(11), cars: [], money: 200000, rep: 200, ...extra });
const first = (c, pred = () => true) => dealerStock(c).find(pred);

describe('the dealer', () => {
  it('sells five cars a day, the same all day and different tomorrow, never above the shop’s standing', () => {
    const c = rich();
    const today = dealerStock(c);
    expect(today.length).toBe(5);
    expect(dealerStock(c).map((s) => s.name)).toEqual(today.map((s) => s.name));
    expect(dealerStock({ ...c, day: c.day + 1 }).map((s) => s.name)).not.toEqual(today.map((s) => s.name));
    const poor = dealerStock({ ...c, rep: 0 });
    expect(poor.every((s) => s.minRep === 0)).toBe(true);
    for (const s of dealerStock(c)) expect(c.rep).toBeGreaterThanOrEqual(s.minRep);
  });

  it('needs the money, the reputation and the room', () => {
    const c = { ...newCareer(2), rep: 0, money: 100 };
    const s = first({ ...c, rep: 200 }, (x) => x.minRep > 0) ?? dealerStock({ ...c, rep: 200 })[0];
    expect(cannotBuyCar(c, { ...s, minRep: 50 })).toMatch(/reputation/);
    expect(cannotBuyCar({ ...c, rep: 200 }, s)).toMatch(/Costs/);
    expect(buyCar(c, s)).toBe(c);
    let full = rich();
    for (let i = 0; i < carLimit(full); i += 1) full = buyCar(full, { ...dealerStock(full)[0], id: `x${i}` });
    expect(full.cars.length).toBe(carLimit(full));
    expect(cannotBuyCar(full, dealerStock(full)[1])).toMatch(/No room/);
  });

  it('every model is a car the simulator can build, on a factory calibration', () => {
    for (const m of MODELS) {
      const c = buyCar(rich(), { id: m.name, model: m.name, preset: m.preset, body: m.body, year: 2005, name: m.name, color: 'red', price: m.price, worn: false, minRep: 0, pitch: '', wheels: 'alloy5', engine: { layout: 'V6' }, plate: 'T' });
      const car = ownedCar(c, m.name);
      expect(car.car.build.engineConfig.bore).toBeGreaterThan(0);
      expect(car.car.tune.ve.length).toBeGreaterThan(0);
      expect(c.money).toBe(200000 - m.price);
    }
  });
});

describe('an owned car is not a customer’s', () => {
  it('stands in for a job with no checks, no pay and no reputation', () => {
    const c = buyCar(rich(), dealerStock(rich())[0]);
    const car = c.cars[0];
    const job = jobById(ownJobId(car.id));
    expect(job.own).toBe(true);
    expect(job.checks).toEqual([]);
    expect(job.pay).toBe(0);
    expect(job.rep).toBe(0);
  });

  it('goes on a lift, is worked on, and is put away with the work kept', () => {
    let c = buyCar(rich(), dealerStock(rich())[0]);
    const id = c.cars[0].id;
    c = parkOnLift(c, id);
    expect(c.lifts.some((l) => l.jobId === ownJobId(id))).toBe(true);
    expect(c.working).toBe(ownJobId(id));
    // Work on it: a different build, as the store would hold it.
    const lift = c.lifts[0];
    const changed = { ...lift.car, build: { ...lift.car.build, mafScalar: 1.23 } };
    c = { ...c, lifts: c.lifts.map((l) => ({ ...l, car: changed })) };
    c = stowFromLift(c, id);
    expect(c.lifts.length).toBe(0);
    expect(c.working).toBeNull();
    expect(carState(c, id).build.mafScalar).toBe(1.23);
  });

  it('survives a reload: the car, and the job that stands in for it', () => {
    let c = buyCar(rich(), dealerStock(rich())[0]);
    c = parkOnLift(c, c.cars[0].id);
    const back = reviveCareer(JSON.parse(JSON.stringify(c)));
    expect(back.cars.length).toBe(1);
    expect(back.lifts.length).toBe(1);
    expect(jobById(back.lifts[0].jobId).own).toBe(true);
  });

  it('is sold for most of what was paid and half of the parts, wherever it is', () => {
    let c = buyCar(rich(), { ...dealerStock(rich())[0], price: 10000 });
    const id = c.cars[0].id;
    expect(valueOf(c.cars[0])).toBe(7200);
    c = fitPart(c, id, 'cai');
    expect(valueOf(ownedCar(c, id))).toBe(Math.round((7200 + 350 * 0.45) / 10) * 10);
    c = parkOnLift(c, id);
    const money = c.money;
    c = sellCar(c, id);
    expect(c.cars.length).toBe(0);
    expect(c.lifts.length).toBe(0);
    expect(c.money).toBeGreaterThan(money);
  });
});

describe('parts', () => {
  const carWith = (extra) => { const c = buyCar(rich(extra), { ...dealerStock(rich())[0], preset: null, price: 2000 }); return [c, c.cars[0].id]; };

  it('change the hardware and leave the calibration exactly as it was', () => {
    const [c, id] = carWith({});
    const before = carState(c, id);
    const next = fitPart(c, id, 'cai');
    const after = carState(next, id);
    expect(after.build.mods.intake).toBe(true);
    expect(after.tune).toEqual(before.tune);
    expect(next.money).toBe(c.money - 350);
  });

  it('cannot be fitted twice, or without the money, the training or the right car', () => {
    let [c, id] = carWith({});
    c = fitPart(c, id, 'cai');
    expect(cannotFit(c, id, 'cai')).toMatch(/Already/);
    expect(cannotFit({ ...c, money: 10 }, id, 'catback')).toMatch(/Costs/);
    expect(cannotFit(c, id, 'turbo-m')).toMatch(/Train first/);
    expect(cannotFit(c, id, 'intercooler')).toMatch(/boosted/);
    const trained = train(train({ ...c, money: 100000, rep: 200 }, 'spark'), 'boost');
    expect(cannotFit(trained, id, 'turbo-m')).toBeNull();
    const boosted = fitPart(trained, id, 'turbo-m');
    expect(carState(boosted, id).build.turboOn).toBe(true);
    expect(carState(boosted, id).build.mods.intercooler).toBe(true);
    expect(cannotFit(boosted, id, 'blower')).toMatch(/boosted/);
  });

  it('tyres, gearing and weight reach the strip, not the engine', () => {
    let [c, id] = carWith({});
    c = fitPart(fitPart(fitPart(c, id, 'tyres-race'), id, 'gear-short'), id, 'weight');
    expect(ownedCar(c, id).drag).toEqual({ gripIdx: 2, finalDrive: 4.1, massDelta: -60 });
  });

  it('only ever change hardware: no part carries a power number', () => {
    for (const p of PARTS) {
      const keys = Object.keys(p);
      expect(keys.some((k) => /hp|power|torque/i.test(k)), p.id).toBe(false);
    }
  });
});

describe('looks and fuel', () => {
  it('charge once for a special paint and never again', () => {
    let c = buyCar(rich(), dealerStock(rich())[0]);
    const id = c.cars[0].id;
    const m0 = c.money;
    c = restyleCar(c, id, { color: 'candy' });
    expect(c.money).toBe(m0 - 420);
    c = restyleCar(c, id, { color: 'red' });
    c = restyleCar(c, id, { color: 'candy' });
    expect(c.money).toBe(m0 - 420);
    expect(ownedCar(c, id).look.color).toBe('candy');
    expect(restyleCar({ ...c, money: 0 }, id, { color: 'gold' })).toEqual({ ...c, money: 0 });
  });

  it('the tank takes a fuel, not a calibration', () => {
    let c = buyCar(rich(), dealerStock(rich())[0]);
    const id = c.cars[0].id;
    const before = carState(c, id);
    c = refuel(c, id, 2);
    expect(carState(c, id).build.octaneIdx).toBe(2);
    expect(carState(c, id).tune).toEqual(before.tune);
    expect(refuel({ ...c, owned: c.owned.filter((x) => x !== 'flex') }, id, 3).money).toBe(c.money);
  });
});

