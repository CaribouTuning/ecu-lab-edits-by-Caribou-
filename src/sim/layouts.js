/**
 * Table layouts: the breakpoints the VE, spark and mixture tables are written on.
 *
 * The game's own grid is 8 RPM columns by 6 MAP rows (tables.js). A real engine computer
 * uses its own breakpoints, packed where the engine spends its time, and does not always
 * index spark by manifold pressure: GM's Gen III computers read spark against the grams of
 * air the ECU believes are in each cylinder, and so does Chrysler's GPEC2 (in milligrams).
 * A layout here is those breakpoints, as read from the factory's own files, so a table can
 * be edited, simulated and exported exactly as the car's computer holds it.
 *
 * Only layouts whose breakpoint VALUES were read from a real calibration are listed.
 * Definitions for other computers (BMW MSD80 and MG1, VW Simos18) give each table's size
 * and units but keep the breakpoints in the car's flash, so without a stock image of that
 * car they are not here; ECU Lab Pro reads them from the customer's own file.
 *
 * Every axis lists its load rows from the highest load down, as the game's LOAD does.
 */

import { LOAD, RPM } from './tables.js';
import { interp1, interp2 } from './math.js';

/**
 * @typedef {object} TableAxes
 * @property {number[]} rpm column breakpoints, ascending
 * @property {number[]} load row breakpoints, descending
 * @property {'kPa'|'g/cyl'|'mg/cyl'} loadUnit what the load axis measures: manifold
 *   pressure, or the air the ECU believes is in one cylinder per cycle
 */

/**
 * @typedef {object} Layout
 * @property {string} id
 * @property {string} label
 * @property {string} [ecu] the engine computer it comes from
 * @property {string} [source] where its breakpoints were read
 * @property {string} [note] what is not the computer's own
 * @property {TableAxes} ve
 * @property {TableAxes} timing
 * @property {TableAxes} afr
 */

const GAME_AXES = Object.freeze({ rpm: RPM, load: LOAD, loadUnit: /** @type {'kPa'} */ ('kPa') });

/** The game's own 8 × 6 grid. Tutorials, missions and the career always use it. */
export const GAME_LAYOUT = Object.freeze({
  id: 'game',
  label: 'ECU Lab grid (8 × 6)',
  ve: GAME_AXES,
  timing: GAME_AXES,
  afr: GAME_AXES,
});

const range = (from, to, step) => Array.from({ length: Math.round((to - from) / step) + 1 }, (_, i) => Number((from + i * step).toFixed(3)));
const desc = (xs) => [...xs].reverse();

// GM P01/P59 (Gen III small-block V8). Read from 44 stock images of six operating systems
// in the LS_Based_Engine_Repository through their own TunerPro definitions; every one
// carries these axes (B0101 main VE, B5913/B5914 high/low-octane spark).
const GM_VE = Object.freeze({ rpm: range(400, 8000, 400), load: desc(range(15, 105, 5)), loadUnit: /** @type {'kPa'} */ ('kPa') });
const GM_SPARK = Object.freeze({
  rpm: [400, 600, 800, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2400, 2800, 3200, 3600, 4000, 4400, 4800, 5200, 5600, 6000, 6400, 6800, 7200, 7600, 8000],
  load: desc(range(0.08, 1.2, 0.04)),
  loadUnit: /** @type {'g/cyl'} */ ('g/cyl'),
});

// Chrysler GPEC2 (the 2015 SRT 6.4 Hemi). Spark grids are 17 × 17 on engine speed and air
// charge per cylinder, read from a stock image by disassembling the controller's own
// lookup code (ECU Lab Pro docs/STOCK-TUNE-REFERENCE.md). Its airflow tables were not
// identified, so VE and mixture stay on the game's grid for this layout.
const GPEC2_SPARK = Object.freeze({
  rpm: [512, 704, 928, 1088, 1344, 1504, 1760, 1952, 2208, 2496, 2688, 3040, 3776, 4256, 4896, 5248, 5792],
  load: desc([75, 100, 125, 150, 200, 250, 300, 350, 400, 450, 500, 550, 600, 650, 700, 775, 900]),
  loadUnit: /** @type {'mg/cyl'} */ ('mg/cyl'),
});

/** Engine computers whose breakpoints were read from real calibrations. */
export const ECU_LAYOUTS = Object.freeze({
  'gm-gen3': Object.freeze({
    id: 'gm-gen3',
    label: 'GM P01/P59 (VE 19 × 20, spark 29 × 25)',
    ecu: 'GM P01 / P59, Gen III V8 (1999-2007)',
    source: '44 stock images, six operating systems, LS_Based_Engine_Repository',
    note: 'GM has no 2-D target-mixture table (it runs closed loop and enriches by RPM); mixture here sits on the VE table\'s axes.',
    ve: GM_VE,
    timing: GM_SPARK,
    afr: GM_VE,
  }),
  'chrysler-gpec2': Object.freeze({
    id: 'chrysler-gpec2',
    label: 'Chrysler GPEC2 (spark 17 × 17)',
    ecu: 'Chrysler GPEC2, 2015 SRT 6.4 Hemi',
    source: 'one stock image, axes read from the controller\'s own lookup code',
    note: 'Only the spark grids were identified: VE and mixture stay on the ECU Lab grid.',
    ve: GAME_AXES,
    timing: GPEC2_SPARK,
    afr: GAME_AXES,
  }),
});

/** Which computer each factory engine came with, where its layout is known. */
export const PRESET_ECU_LAYOUT = Object.freeze({
  ls1: 'gm-gen3', ls6: 'gm-gen3', lq4: 'gm-gen3', lm7: 'gm-gen3', lr4: 'gm-gen3', 'hemi-392': 'chrysler-gpec2',
});

/**
 * A layout by id; the game's grid for null, undefined or anything unknown.
 * @param {string|null|undefined} id
 * @returns {Layout}
 */
export function layoutById(id) {
  return (id && ECU_LAYOUTS[id]) || GAME_LAYOUT;
}

/**
 * The value to read a table's load axis with.
 *
 * @param {TableAxes} axes
 * @param {{mapKpa: number, airmassG?: number}} at what the ECU believes: manifold
 *   pressure, and the air per cylinder its own VE table works out
 */
export function loadFor(axes, { mapKpa, airmassG = 0 }) {
  if (axes.loadUnit === 'g/cyl') return airmassG;
  if (axes.loadUnit === 'mg/cyl') return airmassG * 1000;
  return mapKpa;
}

/**
 * Bilinear read of a table on its own axes (rows descending), held flat past the ends,
 * as an engine computer reads one.
 *
 * @param {number[][]} table
 * @param {TableAxes} axes
 * @param {number} rpm
 * @param {number} load in the axis's own unit
 */
export function readTable(table, axes, rpm, load) {
  const rows = axes.load.map((_, ri) => interp1(axes.rpm, table[ri], rpm));
  return interp1([...axes.load].reverse(), rows.reverse(), load);
}

/**
 * A table moved onto other axes: every new cell is read off the old table. Where the two
 * axes measure load differently (MAP and air per cylinder), `toKpa` gives the manifold
 * pressure that traps a given air charge at an RPM, from the ECU's own VE table.
 *
 * @param {number[][]} table
 * @param {TableAxes} from
 * @param {TableAxes} to
 * @param {{airmassAt?: (rpm: number, mapKpa: number) => number, kpaFor?: (rpm: number, airmassG: number) => number}} [convert]
 * @param {number} [digits] decimals to keep
 * @returns {number[][]}
 */
export function resampleTable(table, from, to, convert = {}, digits = 1) {
  const toG = (u, v) => (u === 'mg/cyl' ? v / 1000 : v);
  return to.load.map((load) => to.rpm.map((rpm) => {
    let at = load;
    if (from.loadUnit !== to.loadUnit) {
      if (from.loadUnit === 'kPa') at = convert.kpaFor ? convert.kpaFor(rpm, toG(to.loadUnit, load)) : load;
      else if (to.loadUnit === 'kPa') at = convert.airmassAt ? convert.airmassAt(rpm, load) * (from.loadUnit === 'mg/cyl' ? 1000 : 1) : load;
      else at = from.loadUnit === 'mg/cyl' ? load * 1000 : load / 1000;
    }
    return Number(readTable(table, from, rpm, at).toFixed(digits));
  }));
}

/**
 * One of the three main tables, read the way the engine computer reads it: on the
 * layout's axes when the tables carry one, on the game's grid by MAP when they do not.
 *
 * @param {{ve: number[][], timing: number[][], afr: number[][], layout?: Layout|null}} tables
 * @param {'ve'|'timing'|'afr'} name
 * @param {number} rpm
 * @param {{mapKpa: number, airmassG?: number}} at what the ECU believes
 */
export function readEcuTable(tables, name, rpm, at) {
  if (!tables.layout) return interp2(tables[name], rpm, at.mapKpa);
  const axes = tables.layout[name];
  return readTable(tables[name], axes, rpm, loadFor(axes, at));
}

/** Whether a layout reads any table by air per cylinder, so the ECU's airmass is needed. */
export function needsAirmass(layout) {
  return !!layout && ['ve', 'timing', 'afr'].some((k) => layout[k].loadUnit !== 'kPa');
}
