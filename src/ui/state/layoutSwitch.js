/**
 * Moving the three main tables onto another engine computer's breakpoints.
 *
 * A factory engine whose tables have not been touched gets its factory calibration
 * generated afresh on the new breakpoints (`factoryCalibrationOn`): the same physics at
 * every cell the computer has, not a resample of the 8 × 6. Anything else is the
 * player's own work, so it is carried across cell by cell: every new cell is read off the
 * old table. Where one axis is manifold pressure and the other air per cylinder, the
 * conversion is the ECU's own: the air its VE table traps at that pressure.
 */

import {
  BARO_KPA, PSI_TO_KPA, chargeTempK, deriveEngine, factoryCalibrationOn, layoutById, presetById,
  readTable, resampleTable, trappedAirGrams,
} from '../../sim/index.js';

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
 * @param {string|null} layoutId an ECU_LAYOUTS id, or null for the ECU Lab grid
 * @returns {{type: 'SET_LAYOUT', layout: string|null, ve: number[][], timing: number[][], afr: number[][], baseline: {ve: number[][], timing: number[][], afr: number[][]}}}
 */
export function layoutSwitch(state, layoutId) {
  const { build, tune } = state;
  const to = layoutById(layoutId);
  const id = to.id === 'game' ? null : to.id;
  const preset = build.presetId ? presetById(build.presetId) : null;
  if (preset && !tune.tablesDirty) {
    const f = factoryCalibrationOn(preset, id ? to : null);
    const tables = { ve: f.ve, timing: f.timing, afr: f.afr };
    return { type: 'SET_LAYOUT', layout: id, ...tables, baseline: tables };
  }
  const from = layoutById(tune.layout);
  const conv = airmassConversion(state);
  return { type: 'SET_LAYOUT', layout: id, ...moveTables(tune, from, to, conv), baseline: moveTables(tune.baseline, from, to, conv) };
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

/**
 * Tables on an ECU layout, seen on the ECU Lab grid: what the per-cell advisors read.
 * @param {{ve: number[][], timing: number[][], afr: number[][]}} tables
 * @param {import('../../sim/layouts.js').Layout} layout
 * @param {StoreState['build']} build
 */
export function toGameGrid(tables, layout, build) {
  const conv = airmassConversion(/** @type {any} */ ({ build, tune: { layout: layout.id, ve: tables.ve } }));
  return moveTables(tables, layout, layoutById(null), conv);
}
