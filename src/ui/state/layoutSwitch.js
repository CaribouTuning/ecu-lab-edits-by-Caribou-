/**
 * Moving the three main tables onto another engine computer's breakpoints.
 *
 * A factory engine whose tables have not been touched gets its factory calibration
 * generated afresh on the new breakpoints (`factoryCalibrationOn`): the same physics at
 * every cell the computer has, not a resample of the 8 × 6. Anything else is the
 * player's own work, so it is carried across cell by cell: every new cell is read off the
 * old table. Where one axis is manifold pressure and the other air per cylinder, the
 * conversion is the ECU's own: the air its VE table traps at that pressure.
 *
 * A BUILD change never moves the tables. More boost or a higher limiter than the tables
 * reach is what a real ECU meets too: past its last breakpoint it reads the edge. The
 * player extends the axes when they are ready (`extendAxes`), and the new cells are
 * marked not tuned until they write them.
 */

import {
  BARO_KPA, ECU_LAYOUTS, PSI_TO_KPA, blowerCurve, chargeTempK, deriveEngine, engineLayout,
  extendAxesTo, factoryCalibrationOn, layoutById, oemLayout, peakMapKpaOf, presetById, readTable, resampleTable,
  tankFuel, trappedAirGrams,
} from '../../sim/index.js';

/**
 * The breakpoints sized to the engine as built: from cranking to just past its limiter,
 * from overrun to just past the most manifold pressure it makes (sim/layouts.js
 * `engineLayout`), 16 × 16 like most standalone and factory computers.
 *
 * @param {StoreState['build']} build
 */
export function buildLayout(build) {
  const wot = build.blowerId ? blowerCurve(build, tankFuel(build)) : [];
  return engineLayout({
    redline: build.engineConfig.redline ?? 7000,
    peakMapKpa: peakMapKpaOf({
      turboOn: build.turboOn, boostCurve: build.boostCurve,
      blowerPeakPsi: wot.length ? Math.max(...wot.map((p) => p.boostPsi)) : 0,
    }),
  });
}

/**
 * The layout a TUNE layout choice names, for this build: `engine` for breakpoints sized to
 * it, or an engine computer's own (an ECU_LAYOUTS id), whose tables it gives no
 * breakpoints for sit on the engine's.
 *
 * @param {StoreState['build']} build
 * @param {string} choice
 */
export function layoutFor(build, choice) {
  const engine = buildLayout(build);
  return ECU_LAYOUTS[choice] ? oemLayout(choice, engine.ve) : engine;
}

/**
 * Whether the engine reaches past its tables' breakpoints: more boost than the top load
 * row, or a limiter past the last RPM column. A real ECU reads the edge there; the player
 * extends the axes when they are ready to tune the new cells (`extendAxes`). Only for
 * breakpoints sized to the engine: an engine computer's own do not move.
 * @param {Pick<StoreState, 'build'|'tune'>} state
 * @returns {boolean}
 */
export function engineOutgrowsTables(state) {
  const { build, tune } = state;
  if (!tune.layout || typeof tune.layout !== 'object' || tune.layout.id !== 'engine') return false;
  const want = buildLayout(build).ve;
  const have = tune.layout.ve;
  return want.load[0] > have.load[0] + 0.5 || want.rpm[want.rpm.length - 1] > have.rpm[have.rpm.length - 1] + 0.5;
}

/**
 * The SET_LAYOUT that extends breakpoints sized to the engine to reach what it reaches
 * now, as tuning software's "extend axis" does: new rows and columns are ADDED, and every
 * existing breakpoint and cell stays exactly as it was (nothing is re-sampled, so a value the
 * player typed is the value that is there). The new cells hold the edge's values: exactly
 * what the ECU read past the edge before, so the engine runs the same until the player tunes
 * them. They are marked not tuned. Nothing is calculated for the player.
 * @param {Pick<StoreState, 'build'|'tune'>} state
 * @returns {import('./reducer.js').SetLayoutAction}
 */
export function extendAxes(state) {
  const { build, tune } = state;
  const from = layoutById(tune.layout);
  const want = buildLayout(build).ve;
  const wantAt = { loadKpa: want.load[0], rpm: want.rpm[want.rpm.length - 1] };
  const names = /** @type {const} */ (['ve', 'timing', 'afr']);
  /** @type {Record<string, ReturnType<typeof extendAxesTo>>} */
  const grown = {};
  for (const n of names) grown[n] = extendAxesTo(from[n], wantAt);
  const to = { ...from, ve: grown.ve.axes, timing: grown.timing.axes, afr: grown.afr.axes };
  const grow = (table, n) => {
    const { addRows, addCols } = grown[n];
    return table.length && (addRows || addCols) ? extendTable(table, addRows, addCols) : table;
  };
  const was = /** @type {{ve?: string[], timing?: string[], afr?: string[]}} */ (tune.untuned ?? {});
  const untuned = Object.fromEntries(names.map((n) => {
    const { addRows } = grown[n];
    const cols = from[n].rpm.length;
    // What was marked keeps its mark, on its new row; every new row and column is marked.
    const keys = new Set((was[n] ?? []).map((k) => { const [r, c] = k.split(':').map(Number); return `${r + addRows}:${c}`; }));
    to[n].load.forEach((_, ri) => to[n].rpm.forEach((__, ci) => { if (ri < addRows || ci >= cols) keys.add(`${ri}:${ci}`); }));
    return [n, [...keys]];
  }));
  const base = tune.baseline;
  return {
    type: /** @type {const} */ ('SET_LAYOUT'), layout: to,
    ve: grow(tune.ve, 've'), timing: grow(tune.timing, 'timing'), afr: grow(tune.afr, 'afr'),
    baseline: base ? { ve: grow(base.ve, 've'), timing: grow(base.timing, 'timing'), afr: grow(base.afr, 'afr') } : base,
    untuned: /** @type {any} */ (untuned),
  };
}

/**
 * A table with `addRows` rows put above and `addCols` columns after, every old cell where it
 * was. A new cell is the edge cell it is beyond (the top row's, the last column's): what a
 * table is read as past its last breakpoint.
 * @param {number[][]} t
 * @param {number} addRows
 * @param {number} addCols
 * @returns {number[][]}
 */
function extendTable(t, addRows, addCols) {
  const last = t[0].length - 1;
  return Array.from({ length: t.length + addRows }, (_, r) => {
    const src = t[Math.max(0, r - addRows)];
    return [...src, ...Array(addCols).fill(src[last])];
  });
}

/**
 * The SET_LAYOUT carrying the tables cell by cell onto `to`, with the cells past the old
 * edge (kPa and RPM axes) marked not tuned. For a change of layout, where the breakpoints
 * differ and every new cell is read off the old table; `extendAxes` does not use it.
 * @param {Pick<StoreState, 'build'|'tune'>} state
 * @param {import('../../sim/layouts.js').Layout} to
 * @returns {import('./reducer.js').SetLayoutAction}
 */
function carried(state, to) {
  const { tune } = state;
  const from = layoutById(tune.layout);
  const conv = airmassConversion(state);
  const past = (axes, fromAxes) => {
    if (axes.loadUnit !== 'kPa' || fromAxes.loadUnit !== 'kPa') return [];
    const keys = [];
    axes.load.forEach((load, ri) => axes.rpm.forEach((rpm, ci) => {
      if (load > fromAxes.load[0] + 0.5 || rpm > fromAxes.rpm[fromAxes.rpm.length - 1] + 0.5) keys.push(`${ri}:${ci}`);
    }));
    return keys;
  };
  return {
    type: /** @type {const} */ ('SET_LAYOUT'), layout: to, ...moveTables(tune, from, to, conv),
    baseline: moveTables(tune.baseline, from, to, conv),
    untuned: { ve: past(to.ve, from.ve), timing: past(to.timing, from.timing), afr: past(to.afr, from.afr) },
  };
}

/** @typedef {import('./initialState.js').StoreState} StoreState */

/**
 * The air the ECU believes one cylinder holds at a speed and pressure, from its own VE
 * table, and the inverse. Boost heats the charge as the dyno heats it.
 * @param {Pick<StoreState, 'build'|'tune'>} state
 */
export function airmassConversion(state) {
  const { build, tune } = state;
  const axes = layoutById(tune.layout).ve;
  const derived = deriveEngine(build.engineConfig);
  const sweptM3 = derived.displacementL / derived.cyl / 1000;
  const airmassAt = (rpm, kpa) => trappedAirGrams({
    veActual: readTable(tune.ve, axes, rpm, kpa),
    mapKpa: kpa,
    chargeK: chargeTempK(Math.max(0, (kpa - BARO_KPA) / PSI_TO_KPA), !!build.mods?.intercooler),
    sweptM3,
  });
  const kpaFor = (rpm, g) => {
    let lo = 5; let hi = 600;
    for (let i = 0; i < 40; i += 1) {
      const mid = (lo + hi) / 2;
      if (airmassAt(rpm, mid) < g) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  };
  return { airmassAt, kpaFor };
}

/**
 * The SET_LAYOUT payload that puts the tune on `layoutId`'s breakpoints.
 * @param {Pick<StoreState, 'build'|'tune'>} state
 * @param {string|null} layoutId an ECU_LAYOUTS id, or `engine` (or null) for breakpoints sized to the engine
 * @returns {import('./reducer.js').SetLayoutAction}
 */
export function layoutSwitch(state, layoutId) {
  const { build, tune } = state;
  const to = layoutFor(build, layoutId ?? 'engine');
  const preset = build.presetId ? presetById(build.presetId) : null;
  // Untouched tables on a factory engine are its factory calibration, generated afresh on
  // the new breakpoints. Not once its induction has changed: the factory never wrote a
  // calibration for a turbo it did not fit, and generating one would be tuning it for the
  // player. Then the tables are carried across like anyone's.
  const stockInduction = preset && !!build.turboOn === !!preset.induction.turboOn && !build.blowerId && !build.nitrous;
  if (preset && !tune.tablesDirty && stockInduction) {
    const f = factoryCalibrationOn(preset, to);
    const tables = { ve: f.ve, timing: f.timing, afr: f.afr };
    return { type: 'SET_LAYOUT', layout: to, ...tables, baseline: tables, untuned: null };
  }
  return carried(state, to);
}

/**
 * The three tables carried from one layout's breakpoints to another's.
 * @param {{ve: number[][], timing: number[][], afr: number[][]}} t
 * @param {import('../../sim/layouts.js').Layout} from
 * @param {import('../../sim/layouts.js').Layout} to
 * @param {ReturnType<typeof airmassConversion>} conv
 */
export function moveTables(t, from, to, conv) {
  return {
    ve: resampleTable(t.ve, from.ve, to.ve, conv, 1),
    timing: resampleTable(t.timing, from.timing, to.timing, conv, 1),
    afr: resampleTable(t.afr, from.afr, to.afr, conv, 2),
  };
}
