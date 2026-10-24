/**
 * Engines you can put in a car: the swap catalogue.
 *
 * A swap is the oldest trick in the trade, and the most honest one: more air through a
 * bigger or better engine. Every engine here is either one of the simulator's factory
 * engines or an engine described by its bore, stroke, compression, cam and redline and
 * calibrated from the physics (`customEnginePatch`), exactly as the BUILD screen does for a
 * player's own engine. Nothing carries a power figure: what each one makes is whatever the
 * simulator says it makes.
 *
 * A swapped engine comes out of its donor with its own ECU and harness, so it arrives on its
 * factory calibration. The bolt-ons on the old engine (intake, exhaust, injectors, boost)
 * go with the old engine. What stays with the car is the car: its tyres, gearing and weight.
 */

import { customEnginePatch, presetById, validateCustomEngine } from '../../sim/index.js';

import { customerCar } from './cars.js';

/**
 * @typedef {object} SwapEngine
 * @property {string} id
 * @property {string} name
 * @property {string|null} [preset] a factory engine
 * @property {object} [spec] a described engine, for `validateCustomEngine`
 * @property {number} price installed, with its ECU and harness, dollars
 * @property {number} kg dressed weight above the lightest engine here, the car's 1.6 iron four: what a swap adds to the car
 * @property {number} minRep
 * @property {string} blurb
 */

/** @type {SwapEngine[]} */
export const ENGINES = [
  {
    id: 'i4-16', name: '1.6 SOHC four (8 valves)', price: 600, kg: 0, minRep: 0,
    spec: { configuration: 'I4', bore: 79, stroke: 81.5, compression: 9.4, redline: 6200, camDuration: 200, valvetrain: 'sohc', valvesPerCyl: 2, blockMaterial: 'Cast Iron', headMaterial: 'Aluminum', injection: 'port' },
    blurb: 'The engine every cheap hatchback had: two valves a cylinder and a gentle cam. It will outlive you.',
  },
  {
    id: 'i4-20', name: '2.0 DOHC four (16 valves)', price: 1400, kg: 5, minRep: 0,
    spec: { configuration: 'I4', bore: 86, stroke: 86, compression: 10.5, redline: 7200, camDuration: 220, valvetrain: 'dohc', valvesPerCyl: 4, blockMaterial: 'Aluminum', headMaterial: 'Aluminum', injection: 'port' },
    blurb: 'Four valves a cylinder and a longer cam: it breathes at the top end the 1.6 never reaches.',
  },
  {
    id: 'i6-30', name: '3.0 DOHC straight six', price: 2800, kg: 60, minRep: 5,
    spec: { configuration: 'I6', bore: 86, stroke: 86, compression: 10.2, redline: 7000, camDuration: 216, valvetrain: 'dohc', valvesPerCyl: 4, blockMaterial: 'Cast Iron', headMaterial: 'Aluminum', injection: 'port' },
    blurb: 'Half as much engine again as the 2.0 four, and smooth: a six is in perfect balance.',
  },
  { id: 'lr4', preset: 'lr4', name: 'GM 4.8 Vortec V8 (junkyard)', price: 2400, kg: 120, minRep: 5, blurb: 'Every scrapyard has a pickup with one of these in it. Cast iron, pushrods, torque everywhere.' },
  { id: 'vq35de-revup', preset: 'vq35de-revup', name: 'Nissan VQ35DE Rev-Up V6', price: 3600, kg: 50, minRep: 10, blurb: 'The 350Z engine: 3.5 litres that like to rev.' },
  { id: 'ea888-gti', preset: 'ea888-gti', name: 'VW EA888 2.0 turbo four', price: 4800, kg: 35, minRep: 15, blurb: 'A factory turbo with its intercooler: boost is already part of the calibration.' },
  { id: 'ls1', preset: 'ls1', name: 'GM LS1 5.7 V8', price: 6500, kg: 75, minRep: 20, blurb: 'The swap that launched a thousand forum threads. Aluminium block, light for a V8.' },
  { id: 'n54', preset: 'n54', name: 'BMW N54 twin-turbo six', price: 7900, kg: 85, minRep: 30, blurb: 'Two small turbos on a straight six, and a reputation for responding to a tune.' },
  { id: 'hemi-392', preset: 'hemi-392', name: 'Chrysler 6.4 HEMI V8', price: 13500, kg: 130, minRep: 45, blurb: 'Six point four litres. The answer when the question is displacement.' },
];

/** @param {string} id */
export const engineById = (id) => ENGINES.find((e) => e.id === id);

/** The swap engine a factory engine is, or the 1.6 when a car never said. @param {string|null|undefined} preset */
export const engineForPreset = (preset) => ENGINES.find((e) => e.preset === preset)?.id ?? (preset ? null : 'vq35de-revup');

const STATES = new Map();

/**
 * The hardware and factory calibration of an engine, as it would leave its donor car.
 * @param {string} id
 * @returns {{build: any, tune: any}}
 */
export function engineState(id) {
  if (STATES.has(id)) return STATES.get(id);
  const e = engineById(id);
  if (!e) throw new Error(`no engine ${id}`);
  let st;
  if (e.preset) {
    if (!presetById(e.preset)) throw new Error(`no preset ${e.preset}`);
    st = customerCar({ preset: e.preset });
  } else {
    const v = validateCustomEngine(e.spec);
    if (!v.ok) throw new Error(`engine ${id}: ${JSON.stringify('errors' in v ? v.errors : {})}`);
    st = customerCar({ custom: customEnginePatch(v.engine, v.assumed) });
  }
  const out = { build: st.build, tune: st.tune };
  STATES.set(id, out);
  return out;
}
