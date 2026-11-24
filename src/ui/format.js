/**
 * Number formatting the screens share: a figure to a fixed number of decimals, or an em dash
 * when there is no figure to show (a sensor not yet read, a point the pull did not reach),
 * never "NaN" on the screen.
 */

/**
 * @param {number} v
 * @param {number} [d] decimals
 * @returns {string}
 */
export const fixed = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '—');
