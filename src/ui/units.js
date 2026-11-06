/**
 * The units the player reads numbers in: the US shop's (hp, lb-ft, psi, inches, mph) or
 * metric (kW, N·m, bar, mm, km/h), switched in the settings menu and kept per browser.
 *
 * The simulation stays in its own units throughout; only what is shown converts, here, in
 * one place, so a number reads the same on every screen. Factors are the exact ones:
 * 1 mechanical hp = 745.699872 W, 1 lbf·ft = 1.3558179483 N·m, 1 psi = 6.894757293 kPa,
 * 1 in = 25.4 mm, 1 mile = 1.609344 km, 1 lb = 0.45359237 kg.
 */

import { useSyncExternalStore } from 'react';

/** @typedef {'imperial'|'metric'} UnitSystem */

const KEY = 'ecu-lab:units';
/** @type {Set<() => void>} */
const listeners = new Set();
/** @type {UnitSystem|null} */
let cached = null;

/** @returns {UnitSystem} */
export function readUnits() {
  if (cached) return cached;
  let v = null;
  try { v = globalThis.localStorage?.getItem(KEY); } catch { /* storage blocked: the default */ }
  cached = v === 'metric' ? 'metric' : 'imperial';
  return cached;
}

/** @param {UnitSystem} system */
export function writeUnits(system) {
  cached = system === 'metric' ? 'metric' : 'imperial';
  try { globalThis.localStorage?.setItem(KEY, cached); } catch { /* kept for this session only */ }
  for (const l of listeners) l();
}

const subscribe = (/** @type {() => void} */ l) => { listeners.add(l); return () => { listeners.delete(l); }; };

/** The unit system on screen, re-rendering when the player switches it. */
export function useUnitSystem() {
  return useSyncExternalStore(subscribe, readUnits, readUnits);
}

export const HP_TO_KW = 0.745699872;
export const LBFT_TO_NM = 1.3558179483;
export const PSI_TO_BAR = 0.06894757293;
export const IN_TO_MM = 25.4;
export const MPH_TO_KMH = 1.609344;
export const LB_TO_KG = 0.45359237;

/**
 * Converters and labels for one unit system. Each `x(v)` takes the simulation's own unit
 * (hp, lb-ft, psi, in, mph, lb/min) and returns the number to show; `xUnit` is its label.
 * @param {UnitSystem} system
 */
function makeUnits(system) {
  const m = system === 'metric';
  return {
    system,
    metric: m,
    power: (hp) => (m ? hp * HP_TO_KW : hp),
    powerUnit: m ? 'kW' : 'hp',
    /** At the wheels: whp, or kW at the wheels. */
    wheelUnit: m ? 'kW' : 'whp',
    torque: (lbft) => (m ? lbft * LBFT_TO_NM : lbft),
    torqueUnit: m ? 'N·m' : 'lb-ft',
    boost: (psi) => (m ? psi * PSI_TO_BAR : psi),
    boostUnit: m ? 'bar' : 'psi',
    /** Decimals a boost figure is written to. */
    boostDecimals: m ? 2 : 1,
    length: (inch) => (m ? inch * IN_TO_MM : inch),
    lengthUnit: m ? 'mm' : 'in',
    speed: (mph) => (m ? mph * MPH_TO_KMH : mph),
    speedUnit: m ? 'km/h' : 'mph',
    massFlow: (lbMin) => (m ? lbMin * LB_TO_KG : lbMin),
    massFlowUnit: m ? 'kg/min' : 'lb/min',
    /** A boost figure with its unit, to the system's precision. */
    fmtBoost: (psi, digits) => `${(m ? psi * PSI_TO_BAR : psi).toFixed(digits ?? (m ? 2 : 1))} ${m ? 'bar' : 'psi'}`,
    /** Power at the wheels with its unit, rounded. */
    fmtWheel: (hp) => `${Math.round(m ? hp * HP_TO_KW : hp)} ${m ? 'kW' : 'whp'}`,
    fmtPower: (hp) => `${Math.round(m ? hp * HP_TO_KW : hp)} ${m ? 'kW' : 'hp'}`,
    fmtTorque: (lbft) => `${Math.round(m ? lbft * LBFT_TO_NM : lbft)} ${m ? 'N·m' : 'lb-ft'}`,
    /** A pipe or tube size: inches to two places, millimetres whole. */
    fmtLength: (inch) => (m ? `${Math.round(inch * IN_TO_MM)} mm` : `${inch} in`),
  };
}

const SYSTEMS = Object.freeze({ imperial: Object.freeze(makeUnits('imperial')), metric: Object.freeze(makeUnits('metric')) });

/**
 * One unit system's converters: the same object every time, so it is safe in a hook's deps.
 * @param {UnitSystem} system
 */
export function unitsFor(system) {
  return system === 'metric' ? SYSTEMS.metric : SYSTEMS.imperial;
}

/** The converters for the unit system on screen. */
export function useUnits() {
  return unitsFor(useUnitSystem());
}
