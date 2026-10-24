/**
 * The golden spanners hidden round the town. Nobody has to look for them; anyone who
 * wanders is paid for it: a little cash for each, and something from the wardrobe at
 * three, six and all ten.
 */

import { itemById } from '../world/appearance.js';

import { wardrobeOf } from './wardrobe.js';

export const SPANNER_COUNT = 10;

/** What finding the Nth spanner gives, beyond the $40 each pays. */
export const SPANNER_PRIZES = {
  3: { money: 250, item: 'bandana', text: 'Three spanners: a bandana and $250.' },
  6: { money: 500, item: 'aviators', text: 'Six spanners: gold aviators and $500.' },
  10: { money: 1500, item: 'tophat', text: 'All ten! A top hat and $1,500.' },
};

/**
 * @param {import('./shop.js').Career} c @param {number} id which spanner
 * @returns {{career: import('./shop.js').Career, text: string}|null} null if it was already found
 */
export function findSpanner(c, id) {
  const found = c.found ?? [];
  if (found.includes(id)) return null;
  const next = [...found, id];
  const prize = SPANNER_PRIZES[next.length];
  let career = { ...c, found: next, money: c.money + 40 + (prize?.money ?? 0) };
  if (prize?.item && itemById(prize.item) && !wardrobeOf(career).includes(prize.item)) career = { ...career, wardrobe: [...wardrobeOf(career), prize.item] };
  return { career, text: prize?.text ?? `Golden spanner ${next.length} of ${SPANNER_COUNT}: $40.` };
}
