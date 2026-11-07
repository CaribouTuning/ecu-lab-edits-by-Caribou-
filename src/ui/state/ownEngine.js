/**
 * The engine BUILD puts on the bench when the player chooses to build their own: an ordinary
 * square two-litre four, on a safe base map generated from the physics, with every figure
 * marked as assumed. The player sets each on the short block (layout, bore, stroke,
 * compression, redline) and the stages after it, and the base map follows the block as built
 * until they edit a table themselves (EngineScreen's short-block note).
 */

import { customEnginePatch, validateCustomEngine } from '../../sim/index.js';

/** Typical figures, none of them anyone's engine in particular. */
export const TYPICAL_OWN_ENGINE = Object.freeze({ configuration: 'I4', bore: 86, stroke: 86, compression: 10.5, redline: 6800 });

/** The figures BUILD asks the player for first, all assumed until set. */
const FIRST_FIGURES = ['configuration', 'bore', 'stroke', 'compression', 'redline'];

/** @returns {object} the APPLY_PRESET patch for a new engine of the player's own */
export function ownEnginePatch() {
  const v = /** @type {any} */ (validateCustomEngine(TYPICAL_OWN_ENGINE));
  return customEnginePatch(v.engine, [...FIRST_FIGURES, ...v.assumed]);
}
