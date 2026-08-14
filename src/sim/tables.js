/**
 * The calibration data the player edits, and the axes it is indexed by.
 *
 * These are starting points, not physics. A stock calibration is deliberately a
 * mediocre one — the whole exercise is improving on it.
 */

/** RPM axis (table columns). 800 is the idle breakpoint. */
export const RPM = [800, 1500, 2500, 3500, 4500, 5500, 6500, 7500];

/**
 * Load axis (table rows) = MANIFOLD ABSOLUTE PRESSURE in kPa.
 *
 * This is the axis real speed-density ECUs actually use — HP Tuners indexes VE by
 * RPM × MAP. Throttle-percentage indexing is "Alpha-N", the uncommon older method.
 * ~101 kPa is atmospheric, so the top two rows are only reached under boost, and the
 * low rows are part-throttle vacuum.
 */
export const LOAD = [200, 150, 100, 70, 40, 20];

/** Stock volumetric efficiency table, percent. */
export const DEFAULT_VE = [
  [60, 70, 84, 95, 104, 101, 94, 84],
  [58, 68, 82, 93, 102, 99, 92, 82],
  [55, 65, 78, 88, 96, 92, 85, 75],
  [49, 58, 70, 80, 87, 84, 77, 68],
  [38, 45, 55, 63, 69, 66, 61, 53],
  [29, 34, 42, 48, 52, 50, 46, 40],
];

/**
 * The range a spark table cell can hold, degrees BTDC.
 *
 * Defined here, next to the table itself, because THREE places need to agree on it and
 * two of them used to be wrong. The editable grid in the UI has always allowed −5 to 50;
 * `factoryCalibration` clamped what it generated to 5 as a floor, and the spark advisor
 * refused to suggest below 5 for the same reason. That disagreement was not cosmetic.
 *
 * A production boosted calibration genuinely commands retarded, even after-TDC, timing in
 * the low-speed high-load corner — it is the most knock-limited place any turbo engine
 * operates, which is why manufacturers taper torque below about 1800 RPM and enrich hard
 * there. Flooring the generator at 5 meant it wrote spark the engine could not take: the
 * B58B30M1 at 11:1 and 16.6 psi came out detonating on its own factory table from 1700 to
 * 2600 RPM, not because the tune was wrong but because the generator was not allowed to
 * write the number the physics asked for.
 */
export const SPARK_MIN_DEG = -5;
export const SPARK_MAX_DEG = 50;

/** Stock ignition timing table, degrees BTDC. */
export const DEFAULT_TIMING = [
  [10, 14, 20, 26, 30, 32, 33, 34],
  [10, 14, 20, 26, 30, 32, 33, 34],
  [10, 14, 20, 26, 30, 32, 33, 34],
  [14, 22, 28, 33, 36, 37, 38, 39],
  [16, 30, 36, 40, 42, 43, 43, 43],
  [14, 34, 40, 44, 46, 47, 47, 47],
];

/** Stock commanded air:fuel ratio table, gasoline-equivalent. */
export const DEFAULT_AFR = [
  [13.2, 12.8, 12.6, 12.6, 12.6, 12.8, 13.0, 13.2],
  [13.2, 12.8, 12.6, 12.6, 12.6, 12.8, 13.0, 13.2],
  [13.2, 12.8, 12.6, 12.6, 12.6, 12.8, 13.0, 13.2],
  [14.5, 14.0, 13.8, 13.6, 13.6, 13.8, 14.0, 14.2],
  [14.7, 14.7, 14.7, 14.7, 14.7, 14.7, 14.7, 14.7],
  [14.7, 14.7, 14.7, 14.7, 14.7, 14.7, 14.7, 14.7],
];

/**
 * Stock boost target curve, psi — one entry per RPM breakpoint.
 *
 * Must stay the same length as {@link RPM}. Build boost curves with
 * `RPM.map(...)` rather than array literals so the two cannot drift apart.
 */
export const DEFAULT_BOOST = RPM.map(() => 0);

/**
 * Stock short-block design, calibrated around the Nissan VQ35DE Rev-Up baseline.
 *
 * The geometry, compression, materials, camshaft and valve springs are exposed as the
 * VQ35DE Rev-Up preset. The default redline remains a generic ceiling for custom builds,
 * while the preset carries the production engine's lower limit.
 *
 * Frozen: this object is handed straight to React state, and a caller doing
 * `Object.assign(cfg, patch)` — exactly what preset code reaches for — would
 * otherwise corrupt the module-level default for the whole session.
 * @type {Readonly<import('./engine.js').EngineConfig>}
 */
export const DEFAULT_ENGINE_CONFIG = Object.freeze({
  configuration: 'V6',
  bore: 95.5,
  stroke: 81.4,
  compression: 10.3,
  blockMaterial: 'Aluminum',
  headMaterial: 'Aluminum',
  camDuration: 210,
  springRate: 50,
  redline: 7500,
});

/** No bolt-ons fitted. Frozen for the same reason as the engine config above. */
export const DEFAULT_MODS = Object.freeze({ intake: false, exhaust: false, headers: false, intercooler: false });
