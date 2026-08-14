/**
 * A loaded ROM image and everything you can safely do to it.
 *
 * This is the object the map editor talks to. It owns the bytes, tracks what has
 * been changed against the original dump, and — critically — will not hand back
 * an image for flashing unless the checksums are right.
 *
 * The safety posture here is deliberate and comes straight from what these tools
 * cost when they go wrong. An SH705x is rated for roughly a hundred flash
 * cycles, a bad checksum means an ECU that will not boot, and the recovery for
 * both is "buy another ECU". So: the original dump is kept for the life of the
 * object, exports are checksum-verified rather than checksum-hoped, and the
 * number of bytes that differ is always available to look at before you commit.
 */

import { verify, fixByRewrite, fixByCorrection, findChecksumOffsets } from './checksum.js';
import { validateDefinition, readMap, writeMap, writeCell, readAxis, diffMaps } from './definition.js';

/** Known SH705x parts, by ROM size. Used to sanity-check a dump. */
export const CPU_BY_SIZE = {
  262144: 'SH7051 / SH7055 (256 kB)',
  524288: 'SH7055 (512 kB)',
  1048576: 'SH7058 (1 MB)',
};

/**
 * Scan for printable ASCII runs, which is where a Nissan part number hides.
 *
 * Nissan ROMs carry an ECU identifier as plain text somewhere in the image —
 * usually something shaped like `23710 CD000`. There is no single fixed address
 * across the family, so this scans rather than pretending to know. It is a
 * heuristic and is labelled as one: the authoritative identification is the
 * ECUID the ECU itself reports over K-line, which needs hardware.
 *
 * @param {Uint8Array} buf
 * @param {number} [minLength]
 * @returns {Array<{offset: number, text: string}>}
 */
export function findAsciiStrings(buf, minLength = 6) {
  const out = [];
  let start = -1;
  for (let i = 0; i <= buf.length; i++) {
    const byte = i < buf.length ? buf[i] : 0;
    const printable = byte >= 0x20 && byte <= 0x7e;
    if (printable) {
      if (start < 0) start = i;
    } else {
      if (start >= 0 && i - start >= minLength) {
        out.push({ offset: start, text: String.fromCharCode(...buf.subarray(start, i)) });
      }
      start = -1;
    }
  }
  return out;
}

/**
 * Guess the Nissan part number in a dump.
 *
 * Matches the `23710-XXXXX` shape Nissan uses for engine control units. Returns
 * every candidate rather than picking one, because a ROM can contain several and
 * choosing between them is the user's call, not ours.
 *
 * @param {Uint8Array} buf
 * @returns {Array<{offset: number, text: string}>}
 */
export function findPartNumbers(buf) {
  const pattern = /\b\d{5}[- ]?[0-9A-Z]{5}\b/g;
  const out = [];
  for (const { offset, text } of findAsciiStrings(buf, 5)) {
    for (const match of text.matchAll(pattern)) {
      out.push({ offset: offset + (match.index ?? 0), text: match[0] });
    }
  }
  return out;
}

/**
 * A ROM image, its definition, and the edits made to it.
 */
export class RomImage {
  /**
   * @param {Uint8Array} bytes the dump, taken as-is
   * @param {import('./definition.js').RomDef} [def]
   */
  constructor(bytes, def) {
    if (!(bytes instanceof Uint8Array)) {
      throw new TypeError('RomImage wants a Uint8Array');
    }
    if (bytes.length === 0 || bytes.length & 3) {
      throw new Error(
        `a ${bytes.length}-byte image is not a whole number of 32-bit words — this is a truncated dump`
      );
    }

    /** The untouched dump. Never written to; this is the thing you flash back. */
    this.original = new Uint8Array(bytes);
    /** The working copy. All edits land here. */
    this.bytes = new Uint8Array(bytes);
    /** @type {import('./definition.js').RomDef | null} */
    this.def = def ?? null;

    /** @type {{errors: string[], warnings: string[]}} */
    this.validation = def ? validateDefinition(def, bytes.length) : { errors: [], warnings: [] };
  }

  /** @returns {number} */
  get size() {
    return this.bytes.length;
  }

  /** @returns {string} best guess at the CPU, from the dump size alone */
  get cpuGuess() {
    return CPU_BY_SIZE[this.size] ?? `unrecognised size (${this.size} bytes)`;
  }

  /**
   * Where the checksum words live.
   *
   * Prefers the definition, falls back to solving for them arithmetically, which
   * works on a stock dump with no definition at all.
   *
   * @returns {{sumOffset: number, xorOffset: number, source: string} | null}
   */
  locateChecksum() {
    if (this.def?.checksum) {
      const { sumOffset, xorOffset } = this.def.checksum;
      return { sumOffset, xorOffset, source: 'definition' };
    }
    // Solve against the ORIGINAL image: the arithmetic only works while the
    // checksums are still valid, and by now the working copy may not be.
    const found = findChecksumOffsets(this.original);
    if (!found) return null;
    return { sumOffset: found.sumOffset, xorOffset: found.xorOffset, source: 'derived' };
  }

  /**
   * Is the working copy's checksum currently correct?
   *
   * @returns {ReturnType<typeof verify> & {located: boolean}}
   */
  checkChecksum() {
    const located = this.locateChecksum();
    if (!located) {
      return {
        located: false,
        valid: false,
        storedSum: 0,
        storedXor: 0,
        actualSum: 0,
        actualXor: 0,
      };
    }
    return { located: true, ...verify(this.bytes, located.sumOffset, located.xorOffset) };
  }

  /**
   * Bring the checksum back in line after edits.
   *
   * @param {{strategy?: 'rewrite' | 'correction'}} [options]
   * @returns {object} what was written
   */
  fixChecksum(options = {}) {
    const located = this.locateChecksum();
    if (!located) {
      throw new Error(
        'cannot find this ROM\'s checksum words — supply a definition with a checksum block before writing'
      );
    }
    const strategy = options.strategy ?? 'rewrite';
    if (strategy === 'correction') {
      const correctionOffset = this.def?.checksum?.correctionOffset;
      if (correctionOffset === undefined) {
        throw new Error('the correction strategy needs a correctionOffset in the definition');
      }
      return fixByCorrection(this.bytes, located.sumOffset, located.xorOffset, correctionOffset);
    }
    return fixByRewrite(this.bytes, located.sumOffset, located.xorOffset);
  }

  /** @param {string} mapId @returns {import('./definition.js').MapDef} */
  map(mapId) {
    const found = this.def?.maps.find((m) => m.id === mapId);
    if (!found) throw new Error(`no map "${mapId}" in this definition`);
    return found;
  }

  /** @param {string} mapId @returns {number[][]} */
  readMap(mapId) {
    return readMap(this.bytes, this.map(mapId));
  }

  /**
   * Axis breakpoints for a map, as `{x, y}`. Either may be null.
   *
   * @param {string} mapId
   * @returns {{x: number[] | null, y: number[] | null}}
   */
  readAxes(mapId) {
    const map = this.map(mapId);
    return {
      x: map.xAxis ? readAxis(this.bytes, map.xAxis) : null,
      y: map.yAxis ? readAxis(this.bytes, map.yAxis) : null,
    };
  }

  /** @param {string} mapId @param {number[][]} values */
  writeMap(mapId, values) {
    return writeMap(this.bytes, this.map(mapId), values);
  }

  /** @param {string} mapId @param {number} row @param {number} col @param {number} real */
  writeCell(mapId, row, col, real) {
    return writeCell(this.bytes, this.map(mapId), row, col, real);
  }

  /**
   * Every byte that differs from the original dump.
   *
   * @returns {Array<{offset: number, from: number, to: number}>}
   */
  changedBytes() {
    const out = [];
    for (let i = 0; i < this.bytes.length; i++) {
      if (this.bytes[i] !== this.original[i]) {
        out.push({ offset: i, from: this.original[i], to: this.bytes[i] });
      }
    }
    return out;
  }

  /**
   * Every map cell that differs from the original dump, in real units.
   *
   * @returns {ReturnType<typeof diffMaps>}
   */
  changedCells() {
    if (!this.def) return [];
    return diffMaps(this.original, this.bytes, this.def);
  }

  /** Throw away all edits. */
  revert() {
    this.bytes = new Uint8Array(this.original);
  }

  /**
   * Produce the bytes to write to a file or send to the ECU.
   *
   * Fixes the checksum and then re-verifies it. If verification fails this
   * throws rather than returning — an image that fails its own checksum is an
   * ECU that will not start, and handing one back silently is the worst thing
   * this module could do.
   *
   * @param {{strategy?: 'rewrite' | 'correction', allowBadChecksum?: boolean}} [options]
   * @returns {Uint8Array}
   */
  export(options = {}) {
    const out = new Uint8Array(this.bytes);

    if (options.allowBadChecksum) return out;

    const located = this.locateChecksum();
    if (!located) {
      throw new Error(
        'refusing to export: this ROM\'s checksum words could not be located, so the result ' +
          'cannot be verified. Pass allowBadChecksum only if you are writing to a file for analysis.'
      );
    }

    const strategy = options.strategy ?? 'rewrite';
    if (strategy === 'correction') {
      const correctionOffset = this.def?.checksum?.correctionOffset;
      if (correctionOffset === undefined) {
        throw new Error('the correction strategy needs a correctionOffset in the definition');
      }
      fixByCorrection(out, located.sumOffset, located.xorOffset, correctionOffset);
    } else {
      fixByRewrite(out, located.sumOffset, located.xorOffset);
    }

    const check = verify(out, located.sumOffset, located.xorOffset);
    if (!check.valid) {
      throw new Error('refusing to export: checksum still invalid after repair');
    }
    return out;
  }
}
