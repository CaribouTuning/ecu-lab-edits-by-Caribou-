/**
 * The shared visual language, assembled from the tokens.
 *
 * Every colour in the app resolves to `src/ui/tokens.js`. Screens must not hard-code
 * hex values — `tests/no-hardcoded-colours.test.js` enforces that, because the rule
 * was stated here for a long time and quietly broken 58 times.
 *
 * The `amber*`/`yellow`/`green`/`red` keys are ALIASES kept so the pre-overhaul
 * screens keep rendering while they are migrated. Write new code against
 * `acc`/`warn`/`ok`/`danger` and delete an alias the moment its last caller goes.
 */

import { clamp } from '../sim/index.js';

import { tokens } from './tokens.js';

const T = {
  bg: tokens.bg,
  panel: tokens.panel,
  panel2: tokens.panel2,
  panel3: tokens.panel3,
  panelHi: tokens.panel3,
  line: tokens.line,
  lineHi: tokens.lineHi,

  ink: tokens.ink,
  inkSoft: tokens.inkSoft,
  ink2: tokens.ink2,
  ink3: tokens.ink3,

  acc: tokens.acc,
  accInk: tokens.accInk,
  accBg: tokens.accBg,
  accOn: tokens.accOn,

  ok: tokens.ok,
  okInk: tokens.okInk,
  okBg: tokens.okBg,
  warn: tokens.warn,
  warnInk: tokens.warnInk,
  warnBg: tokens.warnBg,
  danger: tokens.danger,
  dangerInk: tokens.dangerInk,
  dangerBg: tokens.dangerBg,

  cyan: tokens.cyan,
  cyanBg: tokens.cyanBg,
  violet: tokens.violet,
  violetBg: tokens.violetBg,

  // --- aliases retired during the overhaul; see the file comment above ---
  amber: tokens.acc,
  amberInk: tokens.accInk,
  amberBg: tokens.accBg,
  green: tokens.ok,
  greenBg: tokens.okBg,
  yellow: tokens.warn,
  yellowBg: tokens.warnBg,
  red: tokens.danger,
  redBg: tokens.dangerBg,

  mono: tokens.mono,
  sans: tokens.sans,
};

/** Maps a 0-100 health/quality value onto the green/amber/red status scale. */
export const statusColor = (v) => (v >= 90 ? T.ok : v >= 55 ? T.warn : T.danger);

/**
 * Heat-map colour for a table cell, cool (low) through warm (high).
 *
 * Deliberately its own ramp rather than the status scale: a hot VE cell is not a
 * fault, and it must never compete visually with a real warning.
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
