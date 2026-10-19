// @ts-nocheck: these tests build partial saves and cars on purpose, to prove one rule at a time.

/**
 * The career world's rules: the wardrobe, the goals, the scrapyard, the meet, the strip's
 * rivals, the decor and the medals. All pure functions of the save, so the whole meta
 * game is checked without a screen.
 *
 * The one rule they share: nothing here adds horsepower, and nothing here changes what a
 * customer's job pays.
 */

import { describe, expect, it } from 'vitest';

import { ACHIEVEMENTS, collect } from '../src/ui/career/achievements.js';
import { SPANNER_COUNT, SPANNER_PRIZES, findSpanner } from '../src/ui/career/collectibles.js';
import { bump, claim, claimed, goalsFor, progressOf } from '../src/ui/career/daily.js';
import { EXTRAS, buyExtra, cannotBuyExtra, decorOf, setDecor } from '../src/ui/career/decor.js';
import { inspectCar } from '../src/ui/career/inspect.js';
import { DIGS_PER_DAY, DIG_COST, dig, digsLeft } from '../src/ui/career/junk.js';
import { carStyle, cannotEnter, entrants, judge, placing, settleMeet } from '../src/ui/career/meet.js';
import { RIVALS, TRACK_RIVALS, cannotRace, decide, nextRival, playerReaction, prizeFor, recordTime, rivalState, settleRace, sliptalk } from '../src/ui/career/races.js';
import { advancePhase, newCareer, nextDay, reviveCareer } from '../src/ui/career/shop.js';
import { buyItem, buyOutfit, restyle, wear, wearOutfit, lookOf, wardrobeOf } from '../src/ui/career/wardrobe.js';
import { ITEMS, OUTFITS, STARTING_WARDROBE, cannotBuyItem, defaultLook, itemById, npcLook, outfitPrice, styleScore } from '../src/ui/world/appearance.js';
import { PLACES, closedBecause, placeById } from '../src/ui/world/locations.js';
import { TIPS, tipFor } from '../src/ui/world/tips.js';
import { driveSetup } from '../src/ui/world/vehicle.js';
import { world as W } from '../src/ui/tokens.js';

// Without the starter car, so a test counts only the cars it buys.
const rich = (extra = {}) => ({ ...newCareer(5), cars: [], money: 100000, rep: 200, ...extra });

describe('the wardrobe', () => {
  it('starts with everything that is free, and wears a complete outfit', () => {
    const c = newCareer(1);
    expect(wardrobeOf(c)).toEqual(STARTING_WARDROBE);
    const look = lookOf(c);
    for (const slot of ['top', 'bottom', 'shoes']) expect(wardrobeOf(c)).toContain(look[slot]);
    expect(ITEMS.every((i) => i.price >= 0)).toBe(true);
  });

  it('every item names real palette colours and a known slot', () => {
    for (const i of ITEMS) {
      expect(['top', 'bottom', 'shoes', 'hat', 'glasses', 'extra']).toContain(i.slot);
      expect(W.cloth[i.color], i.id).toBeTruthy();
      if (i.accent) expect(W.cloth[i.accent], i.id).toBeTruthy();
    }
    expect(new Set(ITEMS.map((i) => i.id)).size).toBe(ITEMS.length);
    for (const o of OUTFITS) for (const id of o.items) expect(itemById(id), `${o.id}:${id}`).toBeTruthy();
  });

  it('buys, then wears, but never wears what it does not own or puts on the wrong slot', () => {
    let c = rich();
    expect(wear(c, 'hat', 'tophat')).toEqual(c);
    c = buyItem(c, 'cap-red');
    expect(c.money).toBe(100000 - 40);
    expect(lookOf(c).hat).toBeNull();
    c = wear(c, 'hat', 'cap-red');
    expect(lookOf(c).hat).toBe('cap-red');
    expect(wear(c, 'top', 'cap-red')).toEqual(c);
    expect(lookOf(wear(c, 'hat', null)).hat).toBeNull();
    expect(wear(c, 'top', null)).toEqual(c);
  });

  it('asks for the money and the reputation', () => {
    expect(cannotBuyItem({ money: 10, rep: 0, wardrobe: [] }, 'jacket-leather')).toMatch(/reputation/);
    expect(cannotBuyItem({ money: 10, rep: 999, wardrobe: [] }, 'jacket-leather')).toMatch(/Costs/);
    expect(cannotBuyItem({ money: 1e6, rep: 999, wardrobe: ['cap-red'] }, 'cap-red')).toMatch(/Already/);
    const poor = { ...newCareer(1), money: 5 };
    expect(buyItem(poor, 'cap-red')).toBe(poor);
  });

  it('sells an outfit for a tenth off what is missing', () => {
    let c = rich();
    const full = OUTFITS[0].items.reduce((s, id) => s + itemById(id).price, 0);
    expect(outfitPrice([], OUTFITS[0].id)).toBe(Math.round(full * 0.9));
    c = buyOutfit(c, OUTFITS[0].id);
    for (const id of OUTFITS[0].items) expect(wardrobeOf(c)).toContain(id);
    c = wearOutfit(c, OUTFITS[0].id);
    for (const id of OUTFITS[0].items) expect(Object.values(lookOf(c))).toContain(id);
    expect(outfitPrice(wardrobeOf(c), OUTFITS[0].id)).toBe(0);
  });

  it('scores style, with a bonus for a matched set, and styles hair for free', () => {
    const plain = styleScore(defaultLook());
    const racer = { ...defaultLook(), top: 'suit-racing', bottom: 'racing-pants', shoes: 'racing-shoes', hat: 'helmet-open' };
    expect(styleScore(racer)).toBeGreaterThan(plain + 20);
    const c = restyle(newCareer(1), { hair: 'mohawk', hairColor: 'pink', skin: 3 });
    expect(lookOf(c)).toMatchObject({ hair: 'mohawk', hairColor: 'pink', skin: 3 });
    expect(c.money).toBe(newCareer(1).money);
  });

  it('draws the same stranger from the same number, and varied ones from different numbers', () => {
    expect(npcLook(42)).toEqual(npcLook(42));
    const looks = new Set(Array.from({ length: 30 }, (_, i) => JSON.stringify(npcLook(i * 7919))));
    expect(looks.size).toBeGreaterThan(20);
  });
});

describe('the town', () => {
  it('has a door for every place, and opens them by reputation and the hour', () => {
    expect(new Set(PLACES.map((p) => p.id)).size).toBe(PLACES.length);
    for (const p of PLACES) { expect(p.door.x).toBeTypeOf('number'); expect(p.learn.length).toBeGreaterThan(10); }
    expect(closedBecause({ rep: 0 }, placeById('dealer'))).toMatch(/reputation/);
    expect(closedBecause({ rep: 500, phase: 0 }, placeById('meet'))).toMatch(/evening/);
    expect(closedBecause({ rep: 500, phase: 2 }, placeById('meet'))).toBeNull();
    expect(closedBecause({ rep: 0 }, placeById('garage'))).toBeNull();
  });

  it('keeps Pops’s tips distinct and free of horsepower promises', () => {
    expect(new Set(TIPS.map((t) => t.text)).size).toBe(TIPS.length);
    for (const t of TIPS) expect(t.text).not.toMatch(/free (horse)?power|adds? \d+ ?hp/i);
    expect(tipFor(0)).toBe(TIPS[0]);
    expect(tipFor(-1)).toBe(TIPS[TIPS.length - 1]);
  });

  it('says only facts about what is fitted', () => {
    const c = newCareer(1);
    const car = rich();
    void car;
    const facts = inspectCar({ ...JSON.parse(JSON.stringify({ x: 1 })), engineConfig: { configuration: 'V6', bore: 95.5, stroke: 81.4, compression: 10.3, blockMaterial: 'Aluminum', headMaterial: 'Aluminum', injection: 'port', camDuration: 210, springRate: 50, redline: 7500 }, mods: { intake: true, exhaust: false, headers: false, intercooler: false }, turboOn: false, injIdx: 3, ecuInjectorCc: 315, octaneIdx: 1, exhaustDiaIdx: 2, mafScalar: 1 });
    void c;
    expect(facts.find((f) => f.label === 'Injectors').tone).toBe('odd');
    expect(facts.find((f) => f.label === 'Intake').value).toMatch(/Aftermarket/);
    expect(facts.find((f) => f.label === 'Fuel in the tank').value).toMatch(/93/);
  });
});

describe('collecting spanners', () => {
  it('pays $40 each, a prize at three, six and ten, and each only once', () => {
    let c = rich({ money: 0 });
    const ids = Array.from({ length: SPANNER_COUNT }, (_, i) => i);
    for (const id of ids) c = findSpanner(c, id).career;
    expect(c.found.length).toBe(SPANNER_COUNT);
    expect(findSpanner(c, 3)).toBeNull();
    const prizes = Object.values(SPANNER_PRIZES).reduce((s, p) => s + p.money, 0);
    expect(c.money).toBe(SPANNER_COUNT * 40 + prizes);
    for (const p of Object.values(SPANNER_PRIZES)) expect(wardrobeOf(c)).toContain(p.item);
  });
});

describe('the day’s goals', () => {
  it('are three, the same all day, one of them easy, and they change tomorrow', () => {
    const c = rich();
    const g = goalsFor(c);
    expect(g.length).toBe(3);
    expect(g.map((x) => x.id)).toContain('tip');
    expect(new Set(g.map((x) => x.kind)).size).toBe(3);
    expect(goalsFor(c).map((x) => x.id)).toEqual(g.map((x) => x.id));
    const tomorrow = goalsFor({ ...c, day: c.day + 1 }).map((x) => x.id).join();
    const week = new Set(Array.from({ length: 12 }, (_, i) => goalsFor({ ...c, day: c.day + i }).map((x) => x.id).join()));
    expect(week.size).toBeGreaterThan(2);
    void tomorrow;
  });

  it('are measured from what happened today, and paid once, with a bonus for all three', () => {
    let c = { ...rich({ money: 0 }) };
    const goals = goalsFor(c);
    for (const g of goals) expect(progressOf(c, g)).toBe(0);
    for (const g of goals) {
      c = bump(c, g.kind, g.kind === 'earn' ? 0 : g.target);
    }
    // The counters that read the job history need a real hand-back; fake them.
    c = { ...c, history: [{ day: c.day, paid: 900, verdict: 'pass' }, { day: c.day, paid: 900, verdict: 'pass' }] };
    for (const g of goals) expect(progressOf(c, g)).toBe(g.target);
    for (const g of goals) c = claim(c, g.id);
    const sum = goals.reduce((s, g) => s + g.reward, 0);
    expect(c.money).toBe(sum + 150);
    expect(c.rep).toBe(201);
    expect(claim(c, goals[0].id)).toBe(c);
    expect(claimed(c, goals[0].id)).toBe(true);
    expect(claimed({ ...c, day: c.day + 1 }, goals[0].id)).toBe(false);
  });

  it('will not pay for a goal that has not been done', () => {
    const c = rich();
    const g = goalsFor(c)[0];
    expect(claim(c, g.id)).toBe(c);
  });
});

describe('the scrapyard', () => {
  it('costs a little, allows three digs a day, and finds the same thing on the same day', () => {
    let c = rich({ money: 1000 });
    expect(digsLeft(c)).toBe(DIGS_PER_DAY);
    const a = dig(c, 'rust');
    const b = dig(c, 'rust');
    expect(a.find).toEqual(b.find);
    for (let i = 0; i < DIGS_PER_DAY; i += 1) c = dig(c, 'rust').career;
    expect(digsLeft(c)).toBe(0);
    const nothing = dig(c, 'rust');
    expect(nothing.career).toBe(c);
    expect(digsLeft({ ...c, day: c.day + 1 })).toBe(DIGS_PER_DAY);
  });

  it('never loses more than a dig costs, and a rich find is cash or kit, never power', () => {
    let worst = Infinity;
    for (let day = 1; day < 60; day += 1) {
      for (const pile of ['rust', 'shiny', 'tarp']) {
        const c = rich({ money: 1000, day, rep: 20 });
        const r = dig(c, pile);
        worst = Math.min(worst, r.career.money - c.money);
        expect(['cash', 'clothes', 'looks', 'car', 'nothing']).toContain(r.find.kind);
      }
    }
    expect(worst).toBe(-DIG_COST);
  });

  it('can turn up a free barn-find car, and the car is a real one', () => {
    let found = null;
    for (let day = 1; day < 400 && !found; day += 1) {
      const r = dig(rich({ money: 1000, day }), 'tarp');
      if (r.find.kind === 'car') found = r;
    }
    expect(found).toBeTruthy();
    expect(found.career.cars.length).toBe(1);
    expect(found.career.cars[0].paid).toBe(0);
  });
});

describe('the car meet', () => {
  const look = { color: 'red', wheels: 'steel', wheelColor: 'chrome', spoiler: 'none', stripes: null, lowered: 0, underglow: null, scoop: false };
  const fancy = { color: 'candy', wheels: 'deep', wheelColor: 'chrome', spoiler: 'gt', stripes: 'white', lowered: 0.8, underglow: 'neonPink', scoop: true };

  it('judges build, tune and style, each from something the tuner controls', () => {
    const tuner = defaultLook();
    const base = judge({ peakHp: 300, massKg: 1500, tuningScore: 95, health: 100 }, look, tuner);
    expect(judge({ peakHp: 450, massKg: 1500, tuningScore: 95, health: 100 }, look, tuner).build).toBeGreaterThan(base.build);
    expect(judge({ peakHp: 300, massKg: 1500, tuningScore: 60, health: 100 }, look, tuner).tune).toBeLessThan(base.tune);
    expect(judge({ peakHp: 300, massKg: 1500, tuningScore: 95, health: 40 }, look, tuner).tune).toBeLessThan(base.tune);
    expect(judge({ peakHp: 300, massKg: 1500, tuningScore: 95, health: 100 }, fancy, tuner).style).toBeGreaterThan(base.style);
    expect(carStyle(fancy)).toBeLessThanOrEqual(60);
    for (const part of [base.build, base.tune, base.style, base.total]) { expect(part).toBeGreaterThanOrEqual(0); expect(part).toBeLessThanOrEqual(100); }
    expect(base.notes.length).toBe(3);
  });

  it('weighs the tune most: a clean pull beats a loud paint job', () => {
    const tuner = defaultLook();
    const clean = judge({ peakHp: 250, massKg: 1500, tuningScore: 100, health: 100 }, look, tuner).total;
    const showy = judge({ peakHp: 250, massKg: 1500, tuningScore: 40, health: 100 }, fancy, tuner).total;
    expect(clean).toBeGreaterThan(showy);
  });

  it('puts the evening’s entrants in a fixed order and pays 1st to 3rd', () => {
    const c = rich();
    expect(entrants(c)).toEqual(entrants(c));
    const others = [{ total: 50 }, { total: 60 }, { total: 70 }];
    expect(placing(99, others)).toEqual({ place: 1, prize: 800, rep: 4 });
    expect(placing(65, others).place).toBe(2);
    expect(placing(55, others).place).toBe(3);
    expect(placing(10, others)).toEqual({ place: 4, prize: 0, rep: 0 });
  });

  it('opens in the evening, once a night, for your own car', () => {
    let c = rich();
    c = { ...c, cars: [{ id: 'a' }] };
    expect(cannotEnter(c, 'a')).toMatch(/evening/);
    c = { ...c, phase: 2 };
    expect(cannotEnter(c, 'a')).toBeNull();
    expect(cannotEnter(c, 'zzz')).toMatch(/own cars/);
    expect(cannotEnter(settleMeet(c, { prize: 100, rep: 1 }), 'a')).toMatch(/already/);
    expect(settleMeet(c, { prize: 100, rep: 1 }).money).toBe(c.money + 100);
  });
});

describe('the strip’s rivals', () => {
  it('get quicker as they get harder, from the same physics as your car', () => {
    const ets = RIVALS.map((r) => {
      const s = driveSetup(rivalState(r), { body: r.body, drag: r.drag });
      return s.strip().et;
    });
    for (let i = 1; i < ets.length; i += 1) expect(ets[i], RIVALS[i].id).toBeLessThan(ets[i - 1]);
    expect(RIVALS.map((r) => r.minRep)).toEqual([...RIVALS.map((r) => r.minRep)].sort((a, b) => a - b));
    expect(RIVALS.map((r) => r.prize)).toEqual([...RIVALS.map((r) => r.prize)].sort((a, b) => a - b));
  }, 120000);

  it('are beaten by elapsed time from the green light: reaction counts', () => {
    const a = { et: 14.0, trapMph: 100 };
    const b = { et: 14.05, trapMph: 99 };
    expect(decide(a, b, { playerRt: 0.15, rivalRt: 0.2 }).won).toBe(true);
    expect(decide(a, b, { playerRt: 0.3, rivalRt: 0.1 }).won).toBe(false);
    expect(playerReaction(7, 3)).toBe(playerReaction(7, 3));
    expect(playerReaction(7, 3)).toBeGreaterThan(0.15);
    expect(playerReaction(7, 3)).toBeLessThan(0.27);
  });

  it('cost an entry fee that comes back with the prize, and pay in full and with reputation only the first time', () => {
    const r = RIVALS[1];
    const c = rich({ cars: [{ id: 'a', parts: [], drag: {}, look: {} }], money: 1000, rep: 40, races: { won: [RIVALS[0].id], best: {} } });
    expect(cannotRace(c, r, 'a')).toBeNull();
    const won = settleRace(c, r, 'a', { won: true, et: 14.2 });
    expect(won.money).toBe(1000 + r.prize);
    expect(won.rep).toBeGreaterThan(40);
    expect(won.races.won).toEqual([RIVALS[0].id, r.id]);
    expect(won.races.best.a).toBe(14.2);
    const again = settleRace(won, r, 'a', { won: true, et: 14.5 });
    expect(again.rep).toBe(won.rep);
    expect(again.money - won.money).toBe(prizeFor(won, r));
    expect(prizeFor(won, r)).toBeLessThan(r.prize / 3);
    expect(again.races.best.a).toBe(14.2);
    const lost = settleRace(c, r, 'a', { won: false, et: 15 });
    expect(lost.money).toBe(1000 - r.fee);
    expect(lost.rep).toBe(40);
  });

  it('are climbed in order, and closed to the under-qualified, the broke and the car-less', () => {
    const r = RIVALS[2];
    const c = rich({ cars: [{ id: 'a' }], money: 1000, rep: 60, races: { won: [RIVALS[0].id, RIVALS[1].id], best: {} } });
    expect(cannotRace(c, r, 'a')).toBeNull();
    expect(cannotRace({ ...c, races: { won: [RIVALS[0].id], best: {} } }, r, 'a')).toMatch(/Beat Bo first/);
    expect(cannotRace({ ...c, rep: 0 }, r, 'a')).toMatch(/reputation/);
    expect(cannotRace({ ...c, money: 1 }, r, 'a')).toMatch(/Entry/);
    expect(cannotRace(c, r, null)).toMatch(/own cars/);
    // No daily limit: a rematch pays a quarter, so there is nothing to farm.
    expect(cannotRace({ ...c, raceDay: { day: c.day, n: 9 } }, r, 'a')).toBeNull();
    // The first rung is open to a brand-new shop in its starter car.
    const fresh = newCareer(3);
    expect(cannotRace(fresh, RIVALS[0], fresh.cars[0].id)).toBeNull();
    expect(cannotRace(fresh, TRACK_RIVALS[0], fresh.cars[0].id)).toBeNull();
    expect(nextRival(fresh, 'drag')).toBe(RIVALS[0]);
  });

  it('on the circuit, climb their own ladder and keep their own record', () => {
    const c = rich({ cars: [{ id: 'a' }], money: 5000, rep: 60 });
    const won = settleRace(c, TRACK_RIVALS[0], 'a', { won: true, lap: 41.2 });
    expect(won.track.won).toEqual([TRACK_RIVALS[0].id]);
    expect(won.track.best.a).toBe(41.2);
    expect(won.races).toEqual(c.races);
    expect(cannotRace(won, TRACK_RIVALS[1], 'a')).toBeNull();
    expect(recordTime(won, 'track', 'a', 40.5).track.best.a).toBe(40.5);
    expect(recordTime(won, 'track', 'a', 45).track.best.a).toBe(41.2);
    expect(TRACK_RIVALS.map((r) => r.skill)).toEqual([...TRACK_RIVALS.map((r) => r.skill)].sort((a, b) => a - b));
    expect(TRACK_RIVALS.map((r) => r.prize)).toEqual([...TRACK_RIVALS.map((r) => r.prize)].sort((a, b) => a - b));
  });

  it('explain the run from what really happened', () => {
    const spun = sliptalk({ et: 15, trapMph: 100, sixtyFootT: 2.5, wheelspun: true, topGearUsed: 4 }, { gripIdx: 0 }, 6);
    expect(spun.join(' ')).toMatch(/Street rubber/);
    expect(spun.join(' ')).toMatch(/top gear/);
    const hooked = sliptalk({ et: 12, trapMph: 120, sixtyFootT: 1.8, wheelspun: false, topGearUsed: 6 }, { gripIdx: 2 }, 6);
    expect(hooked.join(' ')).toMatch(/hooked/);
  });
});

describe('the shop’s decor', () => {
  it('charges once for a colour, then swaps for nothing, and ignores unknown things', () => {
    let c = rich({ money: 1000 });
    expect(decorOf(c).wall).toBe('wallShop');
    c = setDecor(c, 'wall', 'wallBlue');
    expect(c.money).toBe(700);
    c = setDecor(c, 'wall', 'wallShop');
    c = setDecor(c, 'wall', 'wallBlue');
    expect(c.money).toBe(700);
    expect(setDecor(c, 'wall', 'nope')).toBe(c);
    expect(setDecor({ ...c, money: 0 }, 'floor', 'wood').decor.floor).toBe('epoxy');
  });

  it('puts extras up once, and holds the grand ones for reputation', () => {
    let c = rich({ money: 5000, rep: 0 });
    c = buyExtra(c, 'plants');
    expect(decorOf(c).extras).toEqual(['plants']);
    expect(cannotBuyExtra(c, 'plants')).toMatch(/Already/);
    expect(cannotBuyExtra(c, 'trophycase')).toMatch(/reputation/);
    expect(EXTRAS.length).toBeGreaterThan(3);
  });
});

describe('medals', () => {
  it('are paid once, however often the save is looked at', () => {
    let c = rich({ money: 0, cars: [{ id: 'a', parts: ['turbo-m'] }], found: [0, 1, 2, 3, 4], races: { won: ['dutch'], best: {} } });
    const first = collect(c);
    expect(first.earned.map((a) => a.id)).toEqual(expect.arrayContaining(['own-car', 'first-part', 'boosted', 'race-win', 'spanners-5']));
    expect(first.career.money).toBe(first.earned.reduce((s, a) => s + a.reward, 0));
    const again = collect(first.career);
    expect(again.earned).toEqual([]);
    expect(again.career).toBe(first.career);
    c = first.career;
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
  });
});

describe('the day', () => {
  it('moves on with each hand-back and starts again each morning', () => {
    let c = newCareer(3);
    expect(c.phase).toBe(0);
    c = advancePhase(advancePhase(c));
    expect(c.phase).toBe(2);
    expect(advancePhase(advancePhase(c)).phase).toBe(3);
    expect(nextDay(c).phase).toBe(0);
  });

  it('keeps a save from before the world: it gains a wardrobe, no cars and a fresh day', () => {
    const old = { ...newCareer(9) };
    for (const k of ['look', 'wardrobe', 'cars', 'looks', 'found', 'races', 'phase']) delete old[k];
    const back = reviveCareer(JSON.parse(JSON.stringify(old)));
    expect(back.cars).toEqual([]);
    expect(back.found).toEqual([]);
    expect(back.races).toEqual({ won: [], best: {} });
    expect(lookOf(back)).toEqual(defaultLook());
    expect(wardrobeOf(back)).toEqual(STARTING_WARDROBE);
  });
});
