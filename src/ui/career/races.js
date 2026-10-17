/**
 * The drag strip's rivals, and how a race is decided.
 *
 * A rival is a real car (a factory engine, perhaps with parts fitted the same way yours are)
 * run down the strip on the SAME model as yours: measured on the simulator, put in a body,
 * pushed down a quarter mile by `simulateDragRun`. Nobody is given a time. A fast rival is a
 * car that really is faster, and the way to beat one is the way it is built: more air, more
 * grip, less weight, or better gearing.
 *
 * The result is decided by elapsed time from the green light: the car's own ET plus how
 * long the driver took to react.
 */

import { customerCar } from './cars.js';

/** @typedef {import('./shop.js').Career} Career */

/**
 * @typedef {object} Rival
 * @property {string} id
 * @property {string} name
 * @property {string} car what they drive
 * @property {string} body
 * @property {string} color
 * @property {string|null} preset
 * @property {(b: any) => object} [build] hardware they have fitted
 * @property {{gripIdx?: number, finalDrive?: number, massDelta?: number}} [drag]
 * @property {number} minRep
 * @property {number} fee entry fee, refunded with the prize on a win
 * @property {number} prize
 * @property {number} rt their reaction time, seconds
 * @property {string} says what they say before the race
 * @property {string} wins what they say if they win
 * @property {string} loses what they say if they lose
 */

/** @type {Rival[]} */
export const RIVALS = [
  { id: 'dutch', name: 'Dutch', car: 'Work truck', body: 'pickup', color: 'orange', preset: 'lr4', minRep: 15, fee: 50, prize: 150, rt: 0.28, says: 'My truck hauls a ton. Let’s see if your toy can pull away from it.', wins: 'Tonnes of torque, friend. Tonnes.', loses: 'Huh. I thought a pickup was quick enough.' },
  { id: 'mia', name: 'Mia', car: 'Golf R', body: 'hatch', color: 'blue', preset: 'ea888-r', minRep: 30, fee: 100, prize: 300, rt: 0.2, says: 'All-wheel drive, no drama. Try to out-launch it.', wins: 'All four tyres. That is the whole trick.', loses: 'Okay, that was fast. Rematch.' },
  { id: 'ryo', name: 'Ryo', car: '350Z, bolt-ons', body: 'coupe', color: 'white', preset: 'vq35de-revup', build: (b) => ({ mods: { ...b.mods, intake: true, exhaust: true, headers: true } }), drag: { gripIdx: 1 }, minRep: 50, fee: 200, prize: 600, rt: 0.17, says: 'Intake, headers, back box and sport tyres. Respectable.', wins: 'Revs. It is all in the revs.', loses: 'You tuned that, didn’t you.' },
  { id: 'vee', name: 'Vee', car: '335i, small turbo', body: 'sedan', color: 'black', preset: 'n54', drag: { gripIdx: 1, finalDrive: 3.9 }, minRep: 80, fee: 400, prize: 1200, rt: 0.15, says: 'Twin-turbo six with a short final drive. You will smell it first.', wins: 'Boost is boost. Boost wins.', loses: 'You have a better launch than me. How?' },
  { id: 'tom', name: 'Big Tom', car: 'Challenger 392', body: 'muscle', color: 'red', preset: 'hemi-392', drag: { gripIdx: 2 }, minRep: 110, fee: 800, prize: 2500, rt: 0.22, says: 'Six point four litres, slicks on the back. Bring a lunch.', wins: 'Cubic inches. You cannot replace them.', loses: 'I need more rubber. Or fewer years.' },
  { id: 'champ', name: 'The Champ', car: 'M340i, gearing and slicks', body: 'sedan', color: 'graphite', preset: 'b58-m1', drag: { gripIdx: 2, finalDrive: 4.1, massDelta: -60 }, minRep: 150, fee: 1500, prize: 6000, rt: 0.13, says: 'I have not lost on this strip in two years.', wins: 'Two years and counting.', loses: 'Two years. Congratulations.' },
];

/** @param {string} id */
export const rivalById = (id) => RIVALS.find((r) => r.id === id);

/**
 * The build and calibration a rival races: a factory car with whatever hardware they fitted,
 * on the factory calibration (rivals do not retune; that is your advantage).
 * @param {Rival} r
 */
const RIVAL_STATES = new Map();
export function rivalState(r) {
  if (!RIVAL_STATES.has(r.id)) {
    const s = customerCar({ preset: r.preset, build: r.build });
    RIVAL_STATES.set(r.id, { build: s.build, tune: s.tune });
  }
  return RIVAL_STATES.get(r.id);
}

/**
 * Why a race cannot be entered, or null.
 * @param {Career} c @param {Rival} r @param {string|null} carId
 */
export function cannotRace(c, r, carId) {
  if (c.rep < r.minRep) return `Needs reputation ${r.minRep}.`;
  if (!carId || !(c.cars ?? []).some((x) => x.id === carId)) return 'Choose one of your own cars.';
  if (c.lifts.some((l) => l.jobId === `own:${carId}`)) return 'That car is on a lift: lower it first.';
  if (c.money < r.fee) return `Entry costs $${r.fee}.`;
  if ((c.raceDay?.day === c.day && c.raceDay.n >= 3)) return 'Three races a day is plenty. Come back tomorrow.';
  return null;
}

/**
 * Decide a race from two quarter-mile runs and two reaction times.
 * @param {{et: number, trapMph: number}} player @param {{et: number, trapMph: number}} rival
 * @param {{playerRt: number, rivalRt: number}} rt
 */
export function decide(player, rival, rt) {
  const p = player.et + rt.playerRt;
  const r = rival.et + rt.rivalRt;
  return { won: p < r, margin: r - p, playerTotal: p, rivalTotal: r };
}

/** The player's reaction time: deterministic from the day, so a rematch is the same race. @param {number} seed @param {number} day */
export function playerReaction(seed, day) {
  const h = Math.imul((seed ^ (day * 2654435761)) >>> 0, 2246822519) >>> 0;
  return 0.16 + ((h >>> 8) % 100) / 1000;
}

/**
 * What a race pays and costs, and what the save records.
 * @param {Career} c @param {Rival} r @param {string} carId @param {{won: boolean, et: number}} res
 * @returns {Career}
 */
export function settleRace(c, r, carId, res) {
  const prior = c.races ?? { won: [], best: {} };
  const first = res.won && !prior.won.includes(r.id);
  const bestEt = Math.min(prior.best[carId] ?? Infinity, res.et);
  const rd = c.raceDay?.day === c.day ? c.raceDay : { day: c.day, n: 0 };
  return {
    ...c,
    money: c.money - r.fee + (res.won ? r.fee + r.prize : 0),
    rep: c.rep + (first ? Math.max(3, Math.round(r.prize / 120)) : 0),
    races: { won: first ? [...prior.won, r.id] : prior.won, best: { ...prior.best, [carId]: bestEt } },
    raceDay: { day: c.day, n: rd.n + 1 },
  };
}

/**
 * What to say about a run, from what actually happened on the strip.
 * @param {{et: number, trapMph: number, sixtyFootT: number|null, wheelspun: boolean, topGearUsed: number}} run
 * @param {{gripIdx?: number}} drag
 * @param {number} gears
 */
export function sliptalk(run, drag, gears) {
  const out = [];
  if (run.wheelspun) {
    out.push(
      (drag.gripIdx ?? 0) < 1
        ? 'The tyres broke loose off the line. Street rubber caps what a launch can use: stickier tyres would turn that wheelspin into forward push.'
        : 'Even with good tyres the car spun on the launch: more power than grip. Gearing or a gentler first gear would put it down better.',
    );
  } else if (run.sixtyFootT != null) {
    out.push(`A 60-foot time of ${run.sixtyFootT.toFixed(2)} s: the launch hooked up. From here the quarter mile is power against weight and drag.`);
  }
  if (run.topGearUsed < gears) out.push('The run ended before the car reached top gear: shorter gearing helps here, because a quarter mile is short.');
  if (run.trapMph > 105) out.push(`Trap speed ${run.trapMph.toFixed(0)} mph: that is power. Elapsed time says how quickly you got moving; trap speed says how much engine is pushing at the end.`);
  else out.push(`Trap speed ${run.trapMph.toFixed(0)} mph: that reflects the power at the end of the run, more than the launch.`);
  return out;
}
