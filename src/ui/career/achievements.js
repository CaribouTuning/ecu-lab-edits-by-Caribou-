/**
 * Things worth a medal. They watch the whole save, never change what a job pays, and
 * reward the parts of the game a tuner might otherwise skip.
 */

import { styleScore } from '../world/appearance.js';

import { PLACES } from '../world/locations.js';
import { lookOf } from './wardrobe.js';

/** @typedef {import('./shop.js').Career} Career */

/** @type {{id: string, title: string, text: string, reward: number, test: (c: Career) => boolean}[]} */
export const ACHIEVEMENTS = [
  { id: 'own-car', title: 'Wheels of your own', text: 'Buy your first car.', reward: 100, test: (c) => (c.cars ?? []).length > 0 },
  { id: 'first-part', title: 'Bolt-on', text: 'Fit a part to your own car.', reward: 100, test: (c) => (c.cars ?? []).some((x) => x.parts.length > 0) },
  { id: 'boosted', title: 'Boosted', text: 'Fit a turbo, a supercharger or nitrous.', reward: 250, test: (c) => (c.cars ?? []).some((x) => x.parts.some((p) => /turbo|blower|nitrous/.test(p))) },
  { id: 'race-win', title: 'First win', text: 'Win a race at the strip.', reward: 150, test: (c) => (c.races?.won ?? []).length > 0 },
  { id: 'rivals-3', title: 'Local legend', text: 'Beat three different rivals.', reward: 400, test: (c) => (c.races?.won ?? []).length >= 3 },
  { id: 'champion', title: 'The Champ', text: 'Beat every rival on the strip.', reward: 2000, test: (c) => (c.races?.won ?? []).length >= 6 },
  { id: 'quick', title: 'Mid-twelves', text: 'Run a quarter mile in under 12.5 seconds.', reward: 600, test: (c) => Object.values(c.races?.best ?? {}).some((t) => t < 12.5) },
  { id: 'meet-1', title: 'Show and shine', text: 'Show a car at the meet.', reward: 100, test: (c) => (c.meets ?? 0) > 0 },
  { id: 'spanners-5', title: 'Magpie', text: 'Find five golden spanners.', reward: 150, test: (c) => (c.found ?? []).length >= 5 },
  { id: 'spanners-10', title: 'Full toolbox', text: 'Find all ten golden spanners.', reward: 500, test: (c) => (c.found ?? []).length >= 10 },
  { id: 'dressed', title: 'Sharp dresser', text: 'Reach a style score of 60.', reward: 150, test: (c) => styleScore(lookOf(c)) >= 60 },
  { id: 'decorated', title: 'Home improvement', text: 'Change the shop’s paint.', reward: 100, test: (c) => c.decor?.wall && c.decor.wall !== 'wallShop' },
  { id: 'regular', title: 'The regular', text: 'Hit a streak of three days of goals.', reward: 300, test: (c) => (c.streak ?? 0) >= 3 },
  { id: 'rich', title: 'In the black', text: 'Hold $20,000.', reward: 0, test: (c) => c.money >= 20000 },
  { id: 'tour', title: 'Know your town', text: 'Open every place on the map.', reward: 300, test: (c) => PLACES.every((p) => c.rep >= p.rep) },
];

/** Newly earned achievements and the save with their rewards paid. @param {Career} c @returns {{career: Career, earned: typeof ACHIEVEMENTS}} */
export function collect(c) {
  const have = new Set(c.ach ?? []);
  const earned = ACHIEVEMENTS.filter((a) => !have.has(a.id) && a.test(c));
  if (!earned.length) return { career: c, earned };
  return { career: { ...c, ach: [...have, ...earned.map((a) => a.id)], money: c.money + earned.reduce((s, a) => s + a.reward, 0) }, earned };
}
