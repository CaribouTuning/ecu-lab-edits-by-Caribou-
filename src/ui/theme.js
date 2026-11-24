/**
 * The shared visual language, assembled from the tokens.
 *
 * Every colour in the app resolves to `src/ui/tokens.js`. Screens must not hard-code
 * hex values — `tests/no-hardcoded-colours.test.js` enforces that, because the rule
 * was stated here for a long time and quietly broken 58 times.
 */

import { clamp } from '../sim/index.js';

import { accAlpha, shadowAlpha, tokens } from './tokens.js';

const T = {
  bg: tokens.bg,
  panel: tokens.panel,
  panel2: tokens.panel2,
  panel3: tokens.panel3,
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

  okLine: tokens.okLine,
  warnLine: tokens.warnLine,
  dangerLine: tokens.dangerLine,
  violetLine: tokens.violetLine,

  cyan: tokens.cyan,
  cyanBg: tokens.cyanBg,
  violet: tokens.violet,
  violetBg: tokens.violetBg,

  mono: tokens.mono,
  sans: tokens.sans,
};

/**
 * The NAME of the band a 0-100 health/quality value falls into, for consumers that
 * take a semantic tone rather than a colour — `StatTile`, and anything else with a
 * token-driven variant.
 *
 * The single source of truth for where the bands sit. `statusColor` below maps this
 * tone onto a colour rather than repeating the thresholds, because two copies of a
 * band drift apart and then disagree about whether the same number is a warning.
 *
 * @param {number} v 0-100
 * @returns {'ok'|'warn'|'danger'}
 */
export const statusTone = (v) => (v >= 90 ? 'ok' : v >= 55 ? 'warn' : 'danger');

/** Maps a 0-100 health/quality value onto the green/amber/red status scale. */
export const statusColor = (v) => T[statusTone(v)];

/**
 * Status colour for a value where HIGH is the dangerous end: injector duty cycle,
 * or any "how much of the available capacity is spent" reading.
 *
 * Deliberately NOT the mirror image of `statusColor`. Health and utilisation are
 * different judgements about different quantities: 55% health is already poor,
 * while 55% duty is an ordinary cruise load. Mirroring the health bands would paint
 * everything above 45% duty as an alarm and could not tell a comfortable 60% from a
 * lean-out-imminent 90%.
 *
 * The bands come from the app's own long-standing duty readout — a real injector is
 * sized so that sustained duty above ~90% has no headroom left for the next
 * enrichment the ECU asks for.
 *
 * The bands live here alone — the injector duty preview and the tachometer's redline
 * zone in `EcuLab.jsx` both call this instead of re-testing the thresholds inline. Do
 * not let a new inline copy creep back in; change the bands here.
 *
 * Returns the NAME rather than the colour, because a caller may need either and only
 * one of the two can be derived from the other. `StatTile` takes a tone name, and the
 * alternative was comparing a returned colour against `T.danger` — which `DataScreen`
 * actually did. Same shape as `statusTone`/`statusColor` above.
 *
 * @param {number} v 0-100, percent of the available capacity spent
 * @returns {'ok'|'warn'|'danger'}
 */
export const utilisationTone = (v) => (v > 90 ? 'danger' : v > 75 ? 'warn' : 'ok');

/** The same judgement as `utilisationTone`, as a colour. See it for the bands. */
export const utilisationColor = (v) => T[utilisationTone(v)];

/**
 * Heat-map colour for a table cell, low to high: green, through yellow, to red.
 *
 * The way tuning software shades a table: the cell's value sets its hue, and the higher
 * the value the redder the cell. RomRaider's table editor blends the hue from its
 * minimum colour to its maximum, light blue (153, 153, 255) to light red (255, 102, 102),
 * which runs through green and yellow on the way (src/main/java/com/romraider/util/
 * ColorScaler.java and Settings.java); TunerStudio's cells run blue - green - yellow -
 * red (MSExtra forum, "Cell-value colors when increasing/decreasing Ign advance"). This
 * ramp is that sweep's green-to-red part, which is what a tuner reads as a table's heat.
 * Each step is dark enough that the cell's text (--ink) keeps 4.5:1 or better on it.
 *
 * @param {number} value cell value
 * @param {number} min low end of the scale
 * @param {number} max high end of the scale
 * @returns {string} an hsl() colour
 */
function heat(value, min, max) {
  const t = max > min ? clamp((value - min) / (max - min), 0, 1) : 0.5;
  // [t, hue, saturation %, lightness %]: green, yellow-green, yellow, orange, red.
  const stops = [[0, 130, 50, 26], [0.33, 85, 55, 26], [0.5, 55, 65, 25], [0.75, 28, 70, 32], [1, 0, 68, 38]];
  let i = 1;
  while (i < stops.length - 1 && t > stops[i][0]) i += 1;
  const [t0, h0, s0, l0] = stops[i - 1];
  const [t1, h1, s1, l1] = stops[i];
  const k = (t - t0) / (t1 - t0);
  const mix = (x, y) => x + (y - x) * k;
  return `hsl(${mix(h0, h1).toFixed(0)}, ${mix(s0, s1).toFixed(0)}%, ${mix(l0, l1).toFixed(1)}%)`;
}

/**
 * Diverging colour for a SIGNED delta: warm for positive, cool for negative, with
 * intensity carrying magnitude.
 *
 * Distinct from `heat()`, which is a one-directional ramp for an absolute cell value.
 * A delta has a sign that means something — richer vs leaner, advanced vs retarded —
 * so it needs a scale that reads outward from a neutral middle rather than along a line.
 *
 * @param {number} delta signed difference
 * @param {number} [fullScale] magnitude at which the colour saturates
 * @returns {string} an hsl() colour
 */
function deltaHeat(delta, fullScale = 12) {
  const mag = clamp(Math.abs(delta) / fullScale, 0, 1);
  return `hsl(${delta > 0 ? 8 : 200}, 60%, ${14 + mag * 22}%)`;
}

// The hues of T.violet and T.cyan, so the overlay reads as the app's secondary data
// colours. Neither is near a status hue (ok ~150, warn ~39, danger 0) or the accent
// (~213); tests/theme.test.js holds them to that.
const DIFF_UP_HUE = 255;
const DIFF_DOWN_HUE = 188;

/**
 * Tint for a cell's change from the loaded calibration (issue 106): violet up, cyan down,
 * brighter with magnitude up to `fullScale`.
 *
 * Not `deltaHeat`: that one's warm half sits on red, and a table the player has simply
 * edited must never look like a fault. The floor keeps the smallest change distinct
 * from an unchanged cell, which is drawn on `T.panel2` instead of through this.
 *
 * @param {number} delta signed change, non-zero
 * @param {number} fullScale magnitude at which the colour stops brightening
 * @returns {string} an hsl() colour
 */
function diffTint(delta, fullScale) {
  const mag = clamp(Math.abs(delta) / fullScale, 0, 1);
  return `hsl(${delta > 0 ? DIFF_UP_HUE : DIFF_DOWN_HUE}, 55%, ${(20 + mag * 20).toFixed(0)}%)`;
}

export { T, accAlpha, deltaHeat, diffTint, heat, shadowAlpha };
