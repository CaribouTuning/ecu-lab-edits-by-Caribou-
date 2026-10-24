/**
 * The places in the career's town, as data: what they are called, what reputation opens
 * them, where their doors are and what you do inside. The town level draws them, the map
 * lists them, and fast travel uses them. Nothing here knows about WebGL.
 */

import { siteAt } from './levels/townPlan.js';

/**
 * @typedef {object} Place
 * @property {string} id
 * @property {string} name
 * @property {number} rep reputation that opens it
 * @property {string} blurb what it is for
 * @property {{x: number, z: number}} door where you stand to go in (town coordinates)
 * @property {string} [panel] the drawer tab a counter inside opens
 * @property {'day'|'night'|'any'} [hours]
 * @property {string} color a `world` palette key for its sign
 * @property {string} learn the real-world idea the place is about
 */

/** @type {Place[]} */
export const PLACES = [
  { id: 'garage', name: 'Your shop', rep: 0, door: { x: -37, z: -6.6 }, color: 'wallBlack', blurb: 'Customers, the laptop, the dyno.', learn: 'Where the tuning happens.' },
  { id: 'supply', name: 'Gearhead Supply', rep: 0, door: siteAt('supply', -13, -6.6), panel: 'upgrades', color: 'wallBlue', blurb: 'Lifts, the dyno, wideband and ethanol analyser, and parts for your own cars. West end of Main Street.', learn: 'Measuring first: a tuner is only as good as their instruments.' },
  { id: 'academy', name: 'Tuning Academy', rep: 0, door: siteAt('academy', 6, -6.6), panel: 'training', color: 'roofGreen', blurb: 'Courses that open the rest of the ECU. On North Street, out east.', learn: 'Spark, boost, knock: each course is a real page of the ECU.' },
  { id: 'boutique', name: 'Threads', rep: 0, door: { x: 24, z: -6.6 }, panel: 'wardrobe', color: 'wallPurple', blurb: 'Clothes for the tuner. Looks only; no power.', learn: 'Style points count at the car meet.' },
  { id: 'diner', name: 'Pops’ Diner', rep: 0, door: { x: 42, z: -6.6 }, panel: 'diner', color: 'wallRed', blurb: 'Pops has seen every engine you will ever tune.', learn: 'A real fact with every cup.' },
  { id: 'dealer', name: 'Caribou Motors', rep: 0, door: siteAt('dealer', -45, 14.6), panel: 'cars', color: 'wallGreen', blurb: 'Project cars from $900, and an engine for any of them. On South Street, out west.', learn: 'Every engine here is one the simulator knows, or one it calibrates from its figures.' },
  { id: 'junk', name: 'Sparky’s Scrapyard', rep: 3, door: siteAt('junk', 16, 8.2), panel: 'junk', color: 'wallBase', blurb: 'Dig through the wrecks for parts and cash. South Street, by the industrial estate.', learn: 'Salvage: what can be reused, and what has been cooked.' },
  { id: 'gas', name: 'Fuel stop', rep: 0, door: siteAt('gas', -14, 14), color: 'toolRed', blurb: 'Choose the fuel for your own cars. East end of Main Street.', learn: 'Octane is knock resistance; ethanol needs more fuel.' },
  { id: 'meet', name: 'Car meet', rep: 10, door: siteAt('meet', 52, 22), hours: 'night', color: 'neonPink', blurb: 'Show a car and a look. The crowd judges both. North Street, out west.', learn: 'Build quality, tune quality and style.' },
  { id: 'strip', name: 'Main Street Drags', rep: 0, door: { x: -138, z: -232.6 }, color: 'toolYellow', blurb: 'The quarter mile, off the highway to the north. Drive your car to the tree.', learn: 'Reaction, traction, gearing and weight transfer decide the quarter mile.' },
  { id: 'track', name: 'Caribou Raceway', rep: 0, door: { x: -22, z: 225.6 }, color: 'toolBlue', blurb: 'A kilometre of corners, off the highway to the south. Drive onto the grid.', learn: 'In a corner, grip is the speed limit: v equals the square root of mu g R.' },
];

/** @param {string} id */
export const placeById = (id) => PLACES.find((p) => p.id === id);

/**
 * Why a place is shut, or null when it is open.
 * @param {{rep: number, phase?: number}} c @param {Place} p
 */
export function closedBecause(c, p) {
  if (c.rep < p.rep) return `Opens at reputation ${p.rep}.`;
  if (p.hours === 'night' && (c.phase ?? 0) < 2) return 'Opens in the evening.';
  return null;
}
