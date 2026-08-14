/**
 * Import a RomRaider definition file.
 *
 * RomRaider's ECU definitions are the largest body of public, community-checked
 * knowledge about where the maps live in these ROMs. Being able to read them
 * directly is the difference between this project being usable and it being an
 * exercise in reverse-engineering your own ECU from scratch.
 *
 * RomRaider definitions are XML with three relevant pieces:
 *
 *  - `<romid>` identifies which ROM the definition is for — an address, a string
 *    expected at that address, and some metadata.
 *  - `<scaling>` elements name a conversion: a storage type and a pair of
 *    expressions, `toexpr` (raw to real) and `frexpr` (real to raw).
 *  - `<table>` elements place a map: address, dimensions, and which scaling to
 *    use. Nested `<table type="X Axis">` elements describe the breakpoints.
 *
 * Definitions also inherit: a `<rom base="...">` picks up the tables of another
 * ROM and overrides some of them. That is resolved here, because a definition
 * that ignored inheritance would silently produce a half-empty map list.
 *
 * **This importer has not yet been run against a real RomRaider Nissan
 * definition file** — only against fixtures written to match the documented
 * structure. Treat the first import of a real file as something to check rather
 * than trust, and compare a few known map values by hand before writing
 * anything to an ECU.
 */

import { parseXml, childrenNamed, childNamed } from './xml.js';
import { makeScaling } from '../scaling.js';

/**
 * Parse the number formats definitions use: `0x2A840`, `2A840`, `512kb`, `16`.
 *
 * @param {string | undefined} text
 * @returns {number | undefined}
 */
function parseNumber(text) {
  if (text === undefined || text === '') return undefined;
  const trimmed = text.trim();

  const size = /^(\d+)\s*(kb|mb)$/i.exec(trimmed);
  if (size) {
    const scale = size[2].toLowerCase() === 'mb' ? 1024 * 1024 : 1024;
    return Number(size[1]) * scale;
  }

  // RomRaider writes addresses both as 0x-prefixed and as bare hex. A bare
  // decimal-looking string is genuinely ambiguous, so dimensions (sizex, sizey)
  // are parsed as decimal by the caller and addresses as hex here.
  if (/^0x[0-9a-f]+$/i.test(trimmed)) return parseInt(trimmed.slice(2), 16);
  if (/^[0-9a-f]+$/i.test(trimmed)) return parseInt(trimmed, 16);
  return undefined;
}

/** @param {string | undefined} text @returns {number | undefined} */
function parseDecimal(text) {
  if (text === undefined || text === '') return undefined;
  const value = Number(text.trim());
  return Number.isFinite(value) ? value : undefined;
}

/**
 * Turn RomRaider's `format="%.2f"` into a decimal count.
 *
 * @param {string | undefined} format
 * @returns {number | undefined}
 */
function decimalsFromFormat(format) {
  if (!format) return undefined;
  const m = /%\.(\d+)f/.exec(format);
  return m ? Number(m[1]) : undefined;
}

/**
 * Normalise the storage type names RomRaider uses onto ours.
 *
 * @param {string | undefined} name
 * @returns {string | undefined}
 */
function normaliseStorageType(name) {
  if (!name) return undefined;
  const key = name.trim().toLowerCase();
  const aliases = {
    uint8: 'uint8',
    int8: 'int8',
    uint16: 'uint16',
    int16: 'int16',
    uint32: 'uint32',
    int32: 'int32',
    // RomRaider's older spellings.
    'unsigned int8': 'uint8',
    'unsigned int16': 'uint16',
    'unsigned int32': 'uint32',
  };
  return aliases[key];
}

/**
 * Collect every `<scaling>` in the document, by name.
 *
 * @param {import('./xml.js').XmlNode} root
 * @returns {{scalings: Map<string, object>, problems: string[]}}
 */
function collectScalings(root) {
  const scalings = new Map();
  const problems = [];

  /** @param {import('./xml.js').XmlNode} node */
  const walk = (node) => {
    if (node.name === 'scaling' && node.attrs.name) {
      scalings.set(node.attrs.name, node.attrs);
    }
    for (const child of node.children) walk(child);
  };
  walk(root);

  return { scalings, problems };
}

/**
 * Build one of our scalings from a RomRaider `<scaling>` element's attributes.
 *
 * @param {Record<string, string>} attrs
 * @param {string} fallbackStorageType
 * @returns {import('../scaling.js').Scaling}
 */
function scalingFromAttrs(attrs, fallbackStorageType) {
  const storageType =
    normaliseStorageType(attrs.storagetype) ?? normaliseStorageType(fallbackStorageType) ?? 'uint8';

  if (attrs.endian && attrs.endian.toLowerCase() !== 'big') {
    throw new Error(
      `scaling "${attrs.name}" declares ${attrs.endian}-endian storage; SH705x ECUs are big-endian, ` +
        'so this definition is for a different ECU family'
    );
  }

  return makeScaling({
    name: attrs.name ?? 'unnamed',
    units: attrs.units ?? '',
    storageType,
    // A definition with no expression is an identity mapping — raw counts.
    toReal: attrs.toexpr && attrs.toexpr.trim() ? attrs.toexpr : 'x',
    toRaw: attrs.frexpr && attrs.frexpr.trim() ? attrs.frexpr : undefined,
    decimals: decimalsFromFormat(attrs.format),
  });
}

/**
 * Build an axis from a nested `<table type="X Axis">` element.
 *
 * @param {import('./xml.js').XmlNode} node
 * @param {Map<string, Record<string, string>>} scalings
 * @param {number} count
 * @returns {import('../definition.js').AxisDef}
 */
function axisFromTable(node, scalings, count) {
  const address = parseNumber(node.attrs.storageaddress);
  const scalingAttrs = node.attrs.scaling ? scalings.get(node.attrs.scaling) : undefined;

  // A "Static Y Axis" carries its breakpoints inline as <data> elements rather
  // than pointing at the ROM.
  const staticValues = childrenNamed(node, 'data')
    .map((d) => Number(d.text.trim()))
    .filter((v) => Number.isFinite(v));

  if (staticValues.length) {
    return { name: node.attrs.name ?? 'axis', units: scalingAttrs?.units ?? '', count: staticValues.length, values: staticValues };
  }

  if (address === undefined) {
    throw new Error(`axis "${node.attrs.name ?? '?'}" has neither a storageaddress nor inline data`);
  }

  return {
    name: node.attrs.name ?? 'axis',
    units: scalingAttrs?.units ?? '',
    count,
    address,
    scaling: scalingFromAttrs(scalingAttrs ?? { name: node.attrs.scaling ?? 'raw' }, node.attrs.storagetype),
  };
}

/**
 * Read a RomRaider definition file.
 *
 * @param {string} xml the file contents
 * @param {object} [options]
 * @param {string} [options.romId] which `<rom>` to use when the file holds several
 * @returns {{definition: import('../definition.js').RomDef, problems: string[], available: string[]}}
 *          `problems` lists maps that were skipped and why — a definition with
 *          one unreadable table should still give you the other forty
 */
export function importRomRaider(xml, options = {}) {
  const root = parseXml(xml);
  const { scalings } = collectScalings(root);

  const roms = root.name === 'rom' ? [root] : childrenNamed(root, 'rom');
  if (!roms.length) throw new Error('no <rom> element in this definition file');

  /** @param {import('./xml.js').XmlNode} rom */
  const idOf = (rom) => childNamed(rom, 'romid')?.children.find((c) => c.name === 'xmlid')?.text.trim() ?? '';

  const available = roms.map(idOf).filter(Boolean);

  const rom = options.romId ? roms.find((r) => idOf(r) === options.romId) : roms[0];
  if (!rom) {
    throw new Error(`no <rom> with xmlid "${options.romId}" — this file has: ${available.join(', ')}`);
  }

  // Resolve `base` inheritance: a derived definition lists only what differs, so
  // walk up the chain and let nearer definitions win.
  /** @type {import('./xml.js').XmlNode[]} */
  const chain = [rom];
  const seen = new Set([idOf(rom)]);
  let cursor = rom;
  while (cursor.attrs.base) {
    const parent = roms.find((r) => idOf(r) === cursor.attrs.base);
    if (!parent) break;
    if (seen.has(idOf(parent))) break; // a cycle; stop rather than spin
    seen.add(idOf(parent));
    chain.push(parent);
    cursor = parent;
  }

  const romid = childNamed(rom, 'romid');
  /** @param {string} tag */
  const meta = (tag) => childNamed(romid ?? rom, tag)?.text.trim();

  const problems = [];
  /** @type {Map<string, import('../definition.js').MapDef>} */
  const maps = new Map();

  // Walk the chain from the most distant ancestor forwards, so the ROM's own
  // tables overwrite inherited ones of the same name.
  for (const link of chain.slice().reverse()) {
    for (const table of childrenNamed(link, 'table')) {
      const name = table.attrs.name;
      if (!name) continue;

      const inherited = maps.get(name);
      try {
        const address = parseNumber(table.attrs.storageaddress) ?? inherited?.address;
        if (address === undefined) {
          // Common and not an error: a base definition names a table and the
          // derived one supplies the address. Only complain if nothing ever does.
          continue;
        }

        const cols = parseDecimal(table.attrs.sizex) ?? inherited?.cols ?? 1;
        const rows = parseDecimal(table.attrs.sizey) ?? inherited?.rows ?? 1;

        const scalingAttrs = table.attrs.scaling ? scalings.get(table.attrs.scaling) : undefined;
        if (table.attrs.scaling && !scalingAttrs) {
          throw new Error(`references scaling "${table.attrs.scaling}" which this file does not define`);
        }
        const scaling = scalingAttrs
          ? scalingFromAttrs(scalingAttrs, table.attrs.storagetype)
          : inherited?.scaling ?? scalingFromAttrs({ name: 'raw' }, table.attrs.storagetype);

        /** @type {import('../definition.js').MapDef} */
        const map = {
          id: name,
          name,
          category: table.attrs.category ?? inherited?.category ?? 'Uncategorised',
          description: childNamed(table, 'description')?.text.trim() || inherited?.description,
          address,
          rows,
          cols,
          scaling,
        };

        for (const nested of childrenNamed(table, 'table')) {
          const kind = (nested.attrs.type ?? '').toLowerCase();
          if (kind.includes('x axis')) map.xAxis = axisFromTable(nested, scalings, cols);
          else if (kind.includes('y axis')) map.yAxis = axisFromTable(nested, scalings, rows);
        }
        if (!map.xAxis && inherited?.xAxis) map.xAxis = inherited.xAxis;
        if (!map.yAxis && inherited?.yAxis) map.yAxis = inherited.yAxis;

        maps.set(name, map);
      } catch (err) {
        problems.push(`table "${name}": ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  /** @type {import('../definition.js').RomDef} */
  const definition = {
    id: idOf(rom) || 'imported',
    name: [meta('make'), meta('model'), meta('year'), meta('transmission')].filter(Boolean).join(' ') || idOf(rom),
    ecuPartNumber: meta('ecuid') || meta('internalidstring'),
    romSize: parseNumber(meta('filesize')) ?? 0,
    cpu: meta('memmodel'),
    maps: [...maps.values()],
  };

  return { definition, problems, available };
}
