/**
 * Design tokens and the shared visual language.
 *
 * Every colour, font and status hue in the app comes from here. Screens and
 * primitives must not hard-code hex values — if you need a new colour, add it as a
 * named token so the UI keeps reading as one product rather than a stack of
 * separately-styled forms.
 */

import { clamp } from '../sim/index.js';

const T = {
  bg: '#0a0d11', panel: '#12161c', panel2: '#181d24', panelHi: '#1e242c',
  line: '#242b34', lineHi: '#33404d',
  ink: '#eef2f5', ink2: '#8b96a3', ink3: '#57616c',
  amber: '#ff6a2c', amberInk: '#ffab7a', amberBg: '#2a1810',
  cyan: '#3ec8ff', cyanBg: '#0f2530',
  violet: '#b083ff', violetBg: '#211a30',
  green: '#39d980', greenBg: '#0f2418',
  yellow: '#ffc94d', yellowBg: '#2a2110',
  red: '#ff5252', redBg: '#2a1414',
  mono: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
  sans: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
};

/** Maps a 0-100 health/quality value onto the green/yellow/red status scale. */
export const statusColor = (v) => (v >= 90 ? T.green : v >= 55 ? T.yellow : T.red);

/**
 * Heat-map colour for a table cell, blue (low) through red (high).
 *
 * @param {number} value cell value
 * @param {number} min low end of the scale
 * @param {number} max high end of the scale
 * @returns {string} an hsl() colour
 */
function heat(value, min, max) {
  const t = clamp((value - min) / (max - min), 0, 1);
  const hue = 214 - t * 214;
  return `hsl(${hue.toFixed(0)}, 68%, ${26 + t * 12}%)`;
}

export { T, heat };
