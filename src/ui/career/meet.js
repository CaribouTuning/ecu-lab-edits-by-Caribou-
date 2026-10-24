/**
 * The car meet: an evening crowd that judges a car on three things, and every one of them
 * is something a tuner controls.
 *
 *   BUILD  how much car there is: power for the weight, measured on the dyno.
 *   TUNE   how well it is calibrated: the Tuning Score of a full pull. Knock events, a lean
 *          mixture or a rattling engine are what the judges read on the log.
 *   STYLE  how it looks, and how the tuner looks: paint, wheels, stance, the outfit.
 *
 * Nothing here moves the physics. The score only reads it.
 */

import { styleScore } from '../world/appearance.js';

import { lookOf } from './wardrobe.js';
import { rng, mix } from './generate.js';

/** @typedef {import('./shop.js').Career} Career */

/** How a car looks to a judge: paint, wheels, spoiler, stripes, stance, glow. 0-60. @param {import('./ownedCars.js').Look} look */
export function carStyle(look) {
  const special = ['candy', 'midnight', 'sunset', 'gold', 'bronze'].includes(look.color) ? 12 : ['copper', 'pewter', 'pearl', 'lime', 'pink', 'mint', 'sky', 'graphite'].includes(look.color) ? 6 : 2;
  const wheels = { steel: 0, alloy5: 3, mesh: 6, deep: 10, race: 10 }[look.wheels] ?? 0;
  const spoiler = { none: 0, lip: 4, wing: 8, gt: 12 }[look.spoiler] ?? 0;
  const stance = look.lowered >= 0.8 ? 10 : look.lowered >= 0.4 ? 6 : 0;
  return Math.min(60, special + wheels + spoiler + (look.stripes ? 6 : 0) + stance + (look.underglow ? 12 : 0) + 8);
}

/**
 * Score one entry.
 * @param {{peakHp: number, massKg: number, tuningScore: number, health: number}} car measured on the dyno
 * @param {import('./ownedCars.js').Look} look
 * @param {import('../world/appearance.js').Look} tuner
 */
export function judge(car, look, tuner) {
  const hpPerTonne = car.peakHp / (car.massKg / 1000);
  const build = Math.max(0, Math.min(100, Math.round(hpPerTonne / 3.4)));
  const tune = Math.max(0, Math.min(100, Math.round(car.tuningScore * (0.6 + 0.4 * (car.health / 100)))));
  const style = Math.max(0, Math.min(100, Math.round(carStyle(look) + styleScore(tuner) * 0.4)));
  const total = Math.round(build * 0.3 + tune * 0.4 + style * 0.3);
  const notes = [];
  notes.push(build >= 70 ? `Build ${build}: ${Math.round(hpPerTonne)} hp per tonne is a lot of car.` : `Build ${build}: ${Math.round(hpPerTonne)} hp per tonne. More air in, or less weight, is the way up.`);
  notes.push(tune >= 85 ? `Tune ${tune}: a clean pull, no knock, nothing lean. The judges read the log and found nothing to mark down.` : `Tune ${tune}: the pull log has things on it. Knock, a lean mixture or a heavy engine all cost points here, and they cost you on the road too.`);
  notes.push(style >= 60 ? `Style ${style}: it looks the part, and so do you.` : `Style ${style}: paint, wheels, stance and your own outfit all count. None of it changes how the car goes.`);
  return { build, tune, style, total, hpPerTonne, notes };
}

/**
 * The evening's other entrants: scores that rise with the shop's standing, the same all
 * evening.
 * @param {Career} c
 */
export function entrants(c) {
  const r = rng(mix(c.seed >>> 0, c.day, 0x3ee7));
  const names = ['Kaz', 'Priya', 'Bo', 'Lena', 'Marcus', 'Yuki', 'Dev', 'Rosa'];
  const base = 38 + Math.min(40, c.rep / 4);
  return [0, 1, 2].map((i) => ({ name: r.pick(names), car: r.pick(['Civic', 'Supra', 'Mustang', 'GTI', 'M3', 'WRX', 'Miata', 'Camaro']), total: Math.round(base + r.range(-6, 18) + i * 3) }));
}

/** Place and prize for a total against the others. @param {number} total @param {{total: number}[]} others */
export function placing(total, others) {
  const place = 1 + others.filter((o) => o.total >= total).length;
  const prize = [800, 350, 150][place - 1] ?? 0;
  const rep = [4, 2, 1][place - 1] ?? 0;
  return { place, prize, rep };
}

/** Why you cannot enter, or null. @param {Career} c @param {string|null} carId */
export function cannotEnter(c, carId) {
  if ((c.phase ?? 0) < 2) return 'The meet starts in the evening.';
  if (!carId || !(c.cars ?? []).some((x) => x.id === carId)) return 'Choose one of your own cars.';
  if (c.lifts.some((l) => l.jobId === `own:${carId}`)) return 'That car is on a lift.';
  if (c.meetDay === c.day) return 'You have already shown a car tonight.';
  return null;
}

/** Settle up. @param {Career} c @param {{prize: number, rep: number}} p @returns {Career} */
export function settleMeet(c, p) {
  return { ...c, money: c.money + p.prize, rep: c.rep + p.rep, meetDay: c.day, meets: (c.meets ?? 0) + 1 };
}

export { lookOf };
