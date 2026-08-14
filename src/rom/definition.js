/**
 * ROM definitions — what lives where in the binary.
 *
 * A ROM dump is half a megabyte of undifferentiated bytes. A definition is the
 * document that says "the ignition table is a 16x16 grid of bytes at 0x2A840,
 * each byte is half a degree, indexed by these RPM breakpoints and these load
 * breakpoints". This is the same job RomRaider's XML definitions and TunerPro's
 * XDF files do, and it is the reason those projects are useful at all.
 *
 * Two rules shape the format here:
 *
 *  - **Axes can come from the ROM.** Nissan stores the breakpoints for a table
 *    in the ROM next to it, and a tuner edits those breakpoints too — moving a
 *    load axis to get resolution where the engine actually operates is standard
 *    practice. An axis pinned to a hard-coded array cannot express that.
 *  - **Nothing is trusted.** A definition is third-party data describing where
 *    to write bytes into a file that will be flashed to a car. Every address is
 *    bounds-checked against the image before use, and overlapping maps are
 *    reported rather than allowed to silently corrupt each other.
 */

import { readRaw, writeRaw, quantize, STORAGE_TYPES } from './scaling.js';

/**
 * One axis of a map.
 *
 * Either `values` (fixed breakpoints, stated in the definition) or `address`
 * plus `scaling` (breakpoints read from the ROM) must be present.
 *
 * @typedef {object} AxisDef
 * @property {string} name
 * @property {string} [units]
 * @property {number} count number of breakpoints
 * @property {number[]} [values] fixed breakpoints
 * @property {number} [address] where the breakpoints live in the ROM
 * @property {import('./scaling.js').Scaling} [scaling] how to read them
 */

/**
 * One map: a 1D or 2D table of calibration values.
 *
 * @typedef {object} MapDef
 * @property {string} id stable key, used for diffing two tunes
 * @property {string} name
 * @property {string} [category] grouping for the editor, e.g. "Fuel", "Ignition"
 * @property {string} [description] what this map does and what moving it costs
 * @property {number} address byte offset of element [0][0]
 * @property {number} rows
 * @property {number} cols
 * @property {import('./scaling.js').Scaling} scaling
 * @property {AxisDef} [xAxis] indexes columns
 * @property {AxisDef} [yAxis] indexes rows
 */

/**
 * A complete definition for one ROM.
 *
 * @typedef {object} RomDef
 * @property {string} id
 * @property {string} name human-readable, e.g. "Z33 VQ35DE 2005 MT"
 * @property {string} [ecuPartNumber] the Nissan part number this matches
 * @property {number} romSize expected image size in bytes
 * @property {string} [cpu] e.g. "SH7055"
 * @property {{sumOffset: number, xorOffset: number, correctionOffset?: number}} [checksum]
 * @property {MapDef[]} maps
 */

/**
 * How many bytes a map occupies.
 *
 * @param {MapDef} map
 * @returns {number}
 */
export function mapByteLength(map) {
  return map.rows * map.cols * STORAGE_TYPES[map.scaling.storageType].bytes;
}

/**
 * Check a definition against an image before anything reads or writes through it.
 *
 * Returns problems rather than throwing, because a definition with one bad map
 * is still useful for the other forty — the editor should show what it can and
 * mark the rest broken.
 *
 * @param {RomDef} def
 * @param {number} imageSize
 * @returns {{errors: string[], warnings: string[]}}
 */
export function validateDefinition(def, imageSize) {
  const errors = [];
  const warnings = [];

  if (def.romSize && def.romSize !== imageSize) {
    errors.push(
      `definition "${def.name}" expects a ${def.romSize}-byte ROM but this image is ${imageSize} bytes`
    );
  }

  const seenIds = new Set();
  /** @type {Array<{id: string, start: number, end: number}>} */
  const extents = [];

  for (const map of def.maps) {
    if (seenIds.has(map.id)) {
      errors.push(`duplicate map id "${map.id}"`);
    }
    seenIds.add(map.id);

    if (map.rows < 1 || map.cols < 1) {
      errors.push(`map "${map.id}" has a degenerate size ${map.rows}x${map.cols}`);
      continue;
    }

    const length = mapByteLength(map);
    if (map.address < 0 || map.address + length > imageSize) {
      errors.push(
        `map "${map.id}" spans 0x${map.address.toString(16)}..0x${(map.address + length).toString(16)} ` +
          `which is outside a ${imageSize}-byte image`
      );
      continue;
    }
    extents.push({ id: map.id, start: map.address, end: map.address + length });

    /**
     * @param {string} which
     * @param {AxisDef | undefined} axis
     * @param {number} expected
     */
    const checkAxis = (which, axis, expected) => {
      if (!axis) return;
      if (axis.count !== expected) {
        errors.push(
          `map "${map.id}" ${which}-axis has ${axis.count} breakpoints but the table is ${expected} wide`
        );
      }
      if (axis.values) {
        if (axis.values.length !== axis.count) {
          errors.push(`map "${map.id}" ${which}-axis declares ${axis.count} values but lists ${axis.values.length}`);
        }
      } else if (axis.address === undefined || !axis.scaling) {
        errors.push(`map "${map.id}" ${which}-axis has neither fixed values nor an address to read them from`);
      } else {
        const axisLength = axis.count * STORAGE_TYPES[axis.scaling.storageType].bytes;
        if (axis.address < 0 || axis.address + axisLength > imageSize) {
          errors.push(`map "${map.id}" ${which}-axis at 0x${axis.address.toString(16)} is outside the image`);
        }
      }
    };

    checkAxis('x', map.xAxis, map.cols);
    checkAxis('y', map.yAxis, map.rows);
  }

  // Overlaps are usually a typo'd address, and a typo'd address is how you write
  // your ignition table over your rev limiter. Sort and sweep.
  extents.sort((a, b) => a.start - b.start);
  for (let i = 1; i < extents.length; i++) {
    if (extents[i].start < extents[i - 1].end) {
      warnings.push(
        `maps "${extents[i - 1].id}" and "${extents[i].id}" overlap in the image — ` +
          'one of the two addresses is probably wrong'
      );
    }
  }

  return { errors, warnings };
}

/**
 * Read an axis's breakpoints.
 *
 * @param {Uint8Array} buf
 * @param {AxisDef} axis
 * @returns {number[]}
 */
export function readAxis(buf, axis) {
  if (axis.values) return axis.values.slice();
  if (axis.address === undefined || !axis.scaling) {
    throw new Error(`axis "${axis.name}" has no values and no address`);
  }
  const size = STORAGE_TYPES[axis.scaling.storageType].bytes;
  const out = [];
  for (let i = 0; i < axis.count; i++) {
    out.push(axis.scaling.toReal(readRaw(buf, axis.address + i * size, axis.scaling.storageType)));
  }
  return out;
}

/**
 * Read a whole map as real-unit values.
 *
 * Row-major, which is how every Nissan table in this family is laid out.
 *
 * @param {Uint8Array} buf
 * @param {MapDef} map
 * @returns {number[][]} `[row][col]`
 */
export function readMap(buf, map) {
  const size = STORAGE_TYPES[map.scaling.storageType].bytes;
  const out = [];
  for (let r = 0; r < map.rows; r++) {
    const row = [];
    for (let c = 0; c < map.cols; c++) {
      const offset = map.address + (r * map.cols + c) * size;
      row.push(map.scaling.toReal(readRaw(buf, offset, map.scaling.storageType)));
    }
    out.push(row);
  }
  return out;
}

/**
 * Write one cell, in real units.
 *
 * Reports what the ECU will actually run, which will differ from the requested
 * value whenever the table's resolution cannot express it.
 *
 * @param {Uint8Array} buf
 * @param {MapDef} map
 * @param {number} row
 * @param {number} col
 * @param {number} real
 * @returns {{raw: number, actual: number, clamped: boolean, quantized: boolean}}
 */
export function writeCell(buf, map, row, col, real) {
  if (row < 0 || row >= map.rows || col < 0 || col >= map.cols) {
    throw new RangeError(`cell (${row}, ${col}) is outside map "${map.id}" (${map.rows}x${map.cols})`);
  }
  const size = STORAGE_TYPES[map.scaling.storageType].bytes;
  const offset = map.address + (row * map.cols + col) * size;
  const result = quantize(map.scaling, real);
  writeRaw(buf, offset, map.scaling.storageType, result.raw);
  return result;
}

/**
 * Write a whole map at once.
 *
 * @param {Uint8Array} buf
 * @param {MapDef} map
 * @param {number[][]} values `[row][col]` in real units
 * @returns {{clamped: number, quantized: number}} counts, for reporting
 */
export function writeMap(buf, map, values) {
  if (values.length !== map.rows) {
    throw new Error(`map "${map.id}" wants ${map.rows} rows, got ${values.length}`);
  }
  let clamped = 0;
  let quantized = 0;
  for (let r = 0; r < map.rows; r++) {
    if (values[r].length !== map.cols) {
      throw new Error(`map "${map.id}" row ${r} wants ${map.cols} columns, got ${values[r].length}`);
    }
    for (let c = 0; c < map.cols; c++) {
      const result = writeCell(buf, map, r, c, values[r][c]);
      if (result.clamped) clamped++;
      if (result.quantized) quantized++;
    }
  }
  return { clamped, quantized };
}

/**
 * Compare two images through a definition and report which cells moved.
 *
 * This is the "what did I actually change" view, and it is the thing that makes
 * a reflash reviewable instead of an act of faith. Comparing bytes alone would
 * flag the checksum words on every single edit; comparing through the maps
 * reports changes in the units a tuner thinks in.
 *
 * @param {Uint8Array} before
 * @param {Uint8Array} after
 * @param {RomDef} def
 * @returns {Array<{mapId: string, name: string, changes: Array<{row: number, col: number, from: number, to: number}>}>}
 */
export function diffMaps(before, after, def) {
  const out = [];
  for (const map of def.maps) {
    const a = readMap(before, map);
    const b = readMap(after, map);
    const changes = [];
    for (let r = 0; r < map.rows; r++) {
      for (let c = 0; c < map.cols; c++) {
        if (a[r][c] !== b[r][c]) {
          changes.push({ row: r, col: c, from: a[r][c], to: b[r][c] });
        }
      }
    }
    if (changes.length) out.push({ mapId: map.id, name: map.name, changes });
  }
  return out;
}
