/**
 * Pops's goals: three small things to do each day, with a little money for each and a
 * bonus for all three. They are a reason to try the parts of the game you have not, not a
 * source of money: a day of goals is worth about one ordinary job.
 */

import { rng, mix } from './generate.js';

/** @typedef {import('./shop.js').Career} Career */

/**
 * @typedef {object} Goal
 * @property {string} id
 * @property {string} text
 * @property {number} target
 * @property {number} reward
 * @property {string} kind which counter it reads
 */

/** What each kind of goal reads, today. */
const COUNTERS = {
  /** Cars handed back today. */
  hand: (c) => c.history.filter((h) => h.day === c.day && h.verdict !== 'fail').length,
  /** Money earned from jobs today. */
  earn: (c) => c.history.filter((h) => h.day === c.day).reduce((s, h) => s + Math.max(0, h.paid), 0),
  spanner: (c) => c.daily?.p?.spanner ?? 0,
  race: (c) => c.daily?.p?.race ?? 0,
  meet: (c) => c.daily?.p?.meet ?? 0,
  drive: (c) => c.daily?.p?.drive ?? 0,
  junk: (c) => c.daily?.p?.junk ?? 0,
  tip: (c) => c.daily?.p?.tip ?? 0,
};

/** @param {Career} c @returns {Goal[]} */
export function goalsFor(c) {
  const r = rng(mix(c.seed >>> 0, c.day, 0x90a1));
  /** @type {(Goal & {when?: (c: Career) => boolean})[]} */
  const pool = [
    { id: 'hand1', kind: 'hand', text: 'Hand a car back to its owner', target: 1, reward: 80 },
    { id: 'hand2', kind: 'hand', text: 'Hand two cars back today', target: 2, reward: 160, when: (x) => x.rep >= 10 },
    { id: 'earn', kind: 'earn', text: 'Earn $500 from customers', target: 500, reward: 120, when: (x) => x.rep >= 5 },
    { id: 'spanner', kind: 'spanner', text: 'Find a golden spanner in town', target: 1, reward: 90 },
    { id: 'drive', kind: 'drive', text: 'Drive a car for two kilometres', target: 2, reward: 90 },
    { id: 'tip', kind: 'tip', text: 'Have a coffee and listen to Pops', target: 1, reward: 40 },
    { id: 'race', kind: 'race', text: 'Win a race at the drag strip', target: 1, reward: 200, when: (x) => x.rep >= 15 && (x.cars ?? []).length > 0 },
    { id: 'meet', kind: 'meet', text: 'Finish in the top three at the meet', target: 1, reward: 200, when: (x) => x.rep >= 40 && (x.cars ?? []).length > 0 },
    { id: 'junk', kind: 'junk', text: 'Dig in the scrapyard', target: 1, reward: 60, when: (x) => x.rep >= 10 },
  ];
  const ok = pool.filter((g) => !g.when || g.when(c));
  const picked = [];
  const kinds = new Set();
  const order = [...ok].sort(() => r.next() - 0.5);
  // Always one easy one to start the day.
  const easy = ok.find((g) => g.id === 'tip');
  if (easy) { picked.push(easy); kinds.add(easy.kind); }
  for (const g of order) {
    if (picked.length >= 3) break;
    if (kinds.has(g.kind)) continue;
    picked.push(g);
    kinds.add(g.kind);
  }
  return picked.map(({ when, ...g }) => { void when; return g; });
}

/** @param {Career} c @param {Goal} g */
export const progressOf = (c, g) => Math.min(g.target, Math.floor(COUNTERS[g.kind]?.(c) ?? 0));

/** @param {Career} c @param {string} id */
export const claimed = (c, id) => (c.daily?.day === c.day ? c.daily.claimed ?? [] : []).includes(id);

/** Count one more of something today. @param {Career} c @param {string} kind @param {number} [n] @returns {Career} */
export function bump(c, kind, n = 1) {
  const d = c.daily?.day === c.day ? c.daily : { day: c.day, p: {}, claimed: [] };
  return { ...c, daily: { ...d, p: { ...d.p, [kind]: (d.p[kind] ?? 0) + n } } };
}

/** Collect a finished goal's reward; all three together pay a bonus. @param {Career} c @param {string} id @returns {Career} */
export function claim(c, id) {
  const goals = goalsFor(c);
  const g = goals.find((x) => x.id === id);
  if (!g || claimed(c, id) || progressOf(c, g) < g.target) return c;
  const d = c.daily?.day === c.day ? c.daily : { day: c.day, p: {}, claimed: [] };
  const nowClaimed = [...(d.claimed ?? []), id];
  const all = goals.every((x) => nowClaimed.includes(x.id));
  return { ...c, money: c.money + g.reward + (all ? 150 : 0), rep: c.rep + (all ? 1 : 0), daily: { ...d, claimed: nowClaimed }, streak: all ? (c.streak ?? 0) + 1 : c.streak ?? 0 };
}
