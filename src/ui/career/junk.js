/**
 * Sparky's scrapyard: dig through the wrecks for cash, clothes and the odd car nobody
 * wanted. Each dig is a small bet, decided by the day and the pile you pick, so the same
 * day gives the same finds.
 */

import { ITEMS, itemById } from '../world/appearance.js';

import { rng, mix } from './generate.js';
import { buyCar, carLimit } from './ownedCars.js';
import { wardrobeOf } from './wardrobe.js';

/** @typedef {import('./shop.js').Career} Career */

export const DIG_COST = 40;
export const DIGS_PER_DAY = 3;

export const PILES = [
  { id: 'rust', name: 'The heavy, rusty pile', hint: 'Heavy metal: radiators, cat converters, wiring looms.', learn: 'Scrap is worth its metal: aluminium, copper and platinum-group metals in a catalytic converter.' },
  { id: 'shiny', name: 'The shiny pile', hint: 'Bits somebody liked once: wheels, trim, a leather jacket on a hook.', learn: 'Trim and wheels outlive the engine they came off.' },
  { id: 'tarp', name: 'Under the tarp', hint: 'Sparky will not say what is under it.', learn: 'Sometimes a car is sold as scrap because nobody checked the one thing wrong with it.' },
];

/** How many digs are left today. @param {Career} c */
export const digsLeft = (c) => DIGS_PER_DAY - (c.junk?.day === c.day ? c.junk.n : 0);

/** Why you cannot dig, or null. @param {Career} c */
export function cannotDig(c) {
  if (digsLeft(c) <= 0) return 'Sparky is shutting up for the day. Three digs is plenty.';
  if (c.money < DIG_COST) return `A dig costs $${DIG_COST}.`;
  return null;
}

/**
 * One dig.
 * @param {Career} c @param {string} pile
 * @returns {{career: Career, find: {kind: 'cash'|'clothes'|'looks'|'car'|'nothing', text: string}}}
 */
export function dig(c, pile) {
  if (cannotDig(c)) return { career: c, find: { kind: 'nothing', text: 'Nothing today.' } };
  const used = c.junk?.day === c.day ? c.junk.n : 0;
  const r = rng(mix(c.seed >>> 0, c.day, used, [...pile].reduce((a, ch) => a + ch.charCodeAt(0), 0)));
  const roll = r.next();
  let career = { ...c, money: c.money - DIG_COST, junk: { day: c.day, n: used + 1 } };
  const own = new Set(wardrobeOf(c));
  const wardrobePool = ITEMS.filter((i) => !own.has(i.id) && i.price <= 420 && i.rep <= c.rep && !i.set);
  const tarpCar = pile === 'tarp' && roll > 0.9 && (c.cars ?? []).length < carLimit(c);
  if (tarpCar) {
    const id = `junk${c.day}-${used}`;
    return {
      career: addJunkCar(career, id),
      find: { kind: 'car', text: 'Under the tarp: an old project V6 coupe with a flat tyre and a very tired engine. Sparky says take it. It is yours, free.' },
    };
  }
  if (pile === 'rust' || (pile === 'tarp' && roll < 0.45)) {
    const cash = Math.round((60 + r.range(0, 190)) / 5) * 5;
    career = { ...career, money: career.money + cash };
    const what = r.pick(['a radiator full of aluminium', 'a cat converter with the good stuff still in it', 'a box of copper wiring', 'two old alternators', 'a cracked cylinder head: cast iron by the kilo']);
    return { career, find: { kind: 'cash', text: `You haul out ${what} and sell it by weight for $${cash}.` } };
  }
  if (pile === 'shiny' && roll < 0.5 && wardrobePool.length) {
    const it = r.pick(wardrobePool);
    career = { ...career, wardrobe: [...wardrobeOf(career), it.id] };
    return { career, find: { kind: 'clothes', text: `Hanging on a hook: ${itemById(it.id).name}. It fits. It is yours.` } };
  }
  if (pile === 'shiny' && roll < 0.8) {
    const pick = r.pick([['wheels:mesh', 'a set of mesh wheels'], ['paint:pearl', 'a tin of pearl paint'], ['spoiler:wing', 'a rear wing'], ['paint:copper', 'a tin of copper paint']]);
    if (!(c.looks ?? []).includes(pick[0])) {
      career = { ...career, looks: [...(career.looks ?? []), pick[0]] };
      return { career, find: { kind: 'looks', text: `You find ${pick[1]}. Any of your cars can wear it now, for free.` } };
    }
  }
  const dud = r.pick(['a seized engine and a bag of bolts', 'half a gearbox', 'a bumper full of wasps', 'a heap of tyres, none of them round']);
  return { career, find: { kind: 'nothing', text: `You dig up ${dud}. Not today.` } };
}

/** A free, worn car out of the yard, made the way the dealer makes one. @param {Career} c @param {string} id @returns {Career} */
function addJunkCar(c, id) {
  return buyCar(c, { id, model: 'Barn-find project', name: 'Barn-find project V6', preset: null, body: 'coupe', year: 1999, color: 'grey', price: 0, worn: true, minRep: 0, pitch: '', wheels: 'steel', engine: { layout: 'V6' }, plate: 'JUNK 1' });
}
