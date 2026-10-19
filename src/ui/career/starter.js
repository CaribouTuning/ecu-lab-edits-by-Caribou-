/**
 * The first car: every new shop is handed one, so the drag strip, the circuit and the
 * parts counter are open from the first morning. Its own module so the shop's save can
 * make it without importing the rest of the car business (which imports the shop).
 */

import { engineState } from './engines.js';
import { registerCars } from './ownRegistry.js';

/** @typedef {import('./shop.js').Career} Career */
/** @typedef {import('./ownedCars.js').OwnedCar} OwnedCar */

/** The car every new shop starts with: Pops's old hatchback, on its last legs. */
export const STARTER = {
  id: 'starter', name: '1996 Hatchback (Pops’s old one)', body: 'hatch', engine: 'i4-16', plate: 'POPS 1',
  look: { color: 'pewter', wheels: 'steel', wheelColor: 'silver', spoiler: 'none', stripes: null, lowered: 0, underglow: null, scoop: false },
};

/**
 * Give a shop its first car, once. The beater is a real car: a 1.6 two-valve four, making
 * whatever the simulator says such an engine makes, on worn hardware (a stale air meter, as
 * a car that has sat for years would have).
 * @param {Career} c @returns {Career}
 */
export function withStarter(c) {
  if (c.starterGiven || (c.cars ?? []).length) return { ...c, starterGiven: true };
  const st = engineState(STARTER.engine);
  /** @type {OwnedCar} */
  const car = {
    id: STARTER.id, name: STARTER.name, preset: null, body: STARTER.body, look: { ...STARTER.look }, plate: STARTER.plate,
    car: { build: { ...st.build, mafScalar: 1.06 }, tune: st.tune }, drag: {}, paid: 400, bought: c.day, km: 0, parts: [], engine: STARTER.engine,
  };
  const next = { ...c, starterGiven: true, cars: [car, ...(c.cars ?? [])] };
  registerCars(next);
  return next;
}
