/**
 * Import a RomRaider definition file.
 *
 * RomRaider's ECU definitions are the largest body of public, community-checked
 * knowledge about where the maps live in these ROMs. Reading them directly is the
 * difference between this project being usable and it being an exercise in
 * reverse-engineering your own ECU from scratch.
 *
 * HOW A REAL DEFINITION IS PUT TOGETHER
 * This was written against the Nissan definitions at
 * github.com/murphyslaw05/NissanDefs, and the structure is not the obvious one.
 * A single table is assembled from several `<rom>` elements chained by `base`:
 *
 *   NISSAN_01   a template: table names, sizes, storage types, scalings, axis
 *               names — but no addresses, because they differ per ECU
 *      ^
 *   CM31C       the same tables with `storageaddress` filled in
 *      ^
 *   CF43D       overrides for one specific ECU; often just the romid
 *
 * So a table is the *merge* of every link in that chain, and a link that carries
 * no address is not junk to be skipped — it is where the shape of the table is
 * defined. Getting this wrong produces 1x1 tables that read one byte from the
 * right address and look almost plausible, which is worse than failing outright.
 *
 * Scalings come two ways: as a `<scaling>` child element of the table (what the
 * Nissan defs use), or as a named reference to a shared `<scaling>` elsewhere in
 * the file. Both are handled. The attribute names also vary — `expression` and
 * `to_byte` in these files, `toexpr` and `frexpr` in others — so both spellings
 * are accepted.
 */

import { parseXml, childrenNamed, childNamed } from './xml.js';
import { makeScaling } from '../scaling.js';

/**
 * Parse the number formats definitions use: `0x2A840`, `2A840`, `512kb`, `1024kb`.
 *
 * Bare hex is the RomRaider convention for addresses, so `2401` means 0x2401.
 *
 * @param {string | undefined} text
 * @returns {number | undefined}
 */
function parseAddress(text) {
  if (text === undefined || text === '') return undefined;
  const trimmed = text.trim();

  const size = /^(\d+)\s*(kb|mb)$/i.exec(trimmed);
  if (size) {
    const scale = size[2].toLowerCase() === 'mb' ? 1024 * 1024 : 1024;
    return Number(size[1]) * scale;
  }

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
 * How many decimal places to show.
 *
 * RomRaider writes this two ways: printf style (`%.2f`) and pattern style
 * (`0.00`, or plain `0` for an integer).
 *
 * @param {string | undefined} format
 * @returns {number | undefined}
 */
function decimalsFromFormat(format) {
  if (!format) return undefined;
  const printf = /%\.(\d+)f/.exec(format);
  if (printf) return Number(printf[1]);
  const pattern = /^[0#]+(?:\.([0#]+))?$/.exec(format.trim());
  if (pattern) return pattern[1] ? pattern[1].length : 0;
  return undefined;
}

/**
 * Normalise RomRaider's storage type names onto ours.
 *
 * @param {string | undefined} name
 * @returns {string | undefined}
 */
function normaliseStorageType(name) {
  if (!name) return undefined;
  const aliases = {
    uint8: 'uint8', int8: 'int8',
    uint16: 'uint16', int16: 'int16',
    uint32: 'uint32', int32: 'int32',
    'unsigned int8': 'uint8',
    'unsigned int16': 'uint16',
    'unsigned int32': 'uint32',
  };
  return aliases[name.trim().toLowerCase()];
}

/**
 * Collect every named `<scaling>` in the document.
 *
 * Only ones with a `name` are collectable; the inline scalings the Nissan defs
 * use are anonymous and are read straight off the table instead.
 *
 * @param {import('./xml.js').XmlNode} root
 * @returns {Map<string, Record<string, string>>}
 */
function collectNamedScalings(root) {
  const scalings = new Map();
  const walk = (node) => {
    if (node.name === 'scaling' && node.attrs.name) scalings.set(node.attrs.name, node.attrs);
    for (const child of node.children) walk(child);
  };
  walk(root);
  return scalings;
}

/**
 * Find the scaling attributes that apply to a table or axis element.
 *
 * @param {import('./xml.js').XmlNode} node
 * @param {Map<string, Record<string, string>>} named
 * @returns {Record<string, string> | undefined}
 */
function scalingAttrsFor(node, named) {
  const inline = childNamed(node, 'scaling');
  if (inline) return inline.attrs;
  if (node.attrs.scaling) {
    const found = named.get(node.attrs.scaling);
    if (!found) throw new Error(`references scaling "${node.attrs.scaling}" which this file does not define`);
    return found;
  }
  return undefined;
}

/**
 * Build a {@link import('../scaling.js').Scaling} from a definition's attributes.
 *
 * @param {Record<string, string> | undefined} attrs
 * @param {string | undefined} storageType from the table element
 * @param {string} label for error messages
 * @returns {import('../scaling.js').Scaling}
 */
function buildScaling(attrs = {}, storageType, label) {
  if (attrs.endian && attrs.endian.toLowerCase() !== 'big') {
    throw new Error(
      `${label} declares ${attrs.endian}-endian storage; SH705x ECUs are big-endian, ` +
        'so this definition is for a different ECU family'
    );
  }

  const toReal = attrs.expression ?? attrs.toexpr;
  const toRaw = attrs.to_byte ?? attrs.frexpr;

  // "NA" is how these files say "raw counts, no meaningful unit".
  const units = attrs.units && attrs.units.toUpperCase() !== 'NA' ? attrs.units : '';

  return makeScaling({
    name: attrs.name ?? label,
    units,
    storageType: normaliseStorageType(storageType) ?? 'uint8',
    toReal: toReal && toReal.trim() ? toReal : 'x',
    toRaw: toRaw && toRaw.trim() ? toRaw : undefined,
    decimals: decimalsFromFormat(attrs.format),
  });
}

/**
 * A table part-way through being assembled from an inheritance chain.
 *
 * @typedef {object} PartialMap
 * @property {string} name
 * @property {string} [category]
 * @property {string} [description]
 * @property {number} [address]
 * @property {number} [rows]
 * @property {number} [cols]
 * @property {string} [storageType]
 * @property {Record<string, string>} [scalingAttrs]
 * @property {object} [xAxis]
 * @property {object} [yAxis]
 */

/**
 * Merge one `<table>` element into the accumulated definition of that table.
 *
 * Anything the element does not specify is left as whatever an earlier link in
 * the chain said, which is what makes template inheritance work.
 *
 * @param {PartialMap} into
 * @param {import('./xml.js').XmlNode} node
 * @param {Map<string, Record<string, string>>} named
 */
function mergeTable(into, node, named) {
  const address = parseAddress(node.attrs.storageaddress);
  if (address !== undefined) into.address = address;

  const cols = parseDecimal(node.attrs.sizex);
  if (cols !== undefined) into.cols = cols;
  const rows = parseDecimal(node.attrs.sizey);
  if (rows !== undefined) into.rows = rows;

  if (node.attrs.category) into.category = node.attrs.category;
  if (node.attrs.storagetype) into.storageType = node.attrs.storagetype;

  const scalingAttrs = scalingAttrsFor(node, named);
  if (scalingAttrs) into.scalingAttrs = scalingAttrs;

  const description = childNamed(node, 'description')?.text.trim();
  if (description) into.description = description;

  for (const nested of childrenNamed(node, 'table')) {
    const kind = (nested.attrs.type ?? '').toLowerCase();
    const key = kind.includes('x axis') ? 'xAxis' : kind.includes('y axis') ? 'yAxis' : null;
    if (!key) continue;

    const axis = into[key] ?? {};
    if (nested.attrs.name) axis.name = nested.attrs.name;
    if (nested.attrs.storagetype) axis.storageType = nested.attrs.storagetype;

    const axisAddress = parseAddress(nested.attrs.storageaddress);
    if (axisAddress !== undefined) axis.address = axisAddress;

    const axisScaling = scalingAttrsFor(nested, named);
    if (axisScaling) axis.scalingAttrs = axisScaling;

    // A "static" axis lists its breakpoints inline instead of pointing at the ROM.
    const staticValues = childrenNamed(nested, 'data')
      .map((d) => Number(d.text.trim()))
      .filter((v) => Number.isFinite(v));
    if (staticValues.length) axis.values = staticValues;

    into[key] = axis;
  }
}

/**
 * Turn an assembled partial into a real {@link import('../definition.js').MapDef}.
 *
 * @param {PartialMap} partial
 * @returns {import('../definition.js').MapDef}
 */
function finishMap(partial) {
  if (partial.address === undefined) throw new Error('no storageaddress anywhere in the inheritance chain');

  const cols = partial.cols ?? 1;
  const rows = partial.rows ?? 1;

  /** @type {import('../definition.js').MapDef} */
  const map = {
    id: partial.name,
    name: partial.name,
    category: partial.category ?? 'Uncategorised',
    description: partial.description,
    address: partial.address,
    rows,
    cols,
    scaling: buildScaling(partial.scalingAttrs, partial.storageType, `table "${partial.name}"`),
  };

  for (const [key, count] of [['xAxis', cols], ['yAxis', rows]]) {
    const axis = partial[key];
    if (!axis) continue;

    if (axis.values) {
      map[key] = { name: axis.name ?? key, units: '', count: axis.values.length, values: axis.values };
      continue;
    }
    if (axis.address === undefined) continue; // declared but never located; drop it

    const scaling = buildScaling(axis.scalingAttrs, axis.storageType ?? partial.storageType, `${key} of "${partial.name}"`);
    map[key] = { name: axis.name ?? key, units: scaling.units, count, address: axis.address, scaling };
  }

  return map;
}

/**
 * Read a RomRaider definition file.
 *
 * @param {string} xml the file contents
 * @param {object} [options]
 * @param {string} [options.romId] which `<rom>` to use when the file holds several
 * @returns {{definition: import('../definition.js').RomDef, problems: string[], available: string[]}}
 *          `problems` lists tables that could not be assembled and why — one bad
 *          table should not cost you the other sixty
 */
export function importRomRaider(xml, options = {}) {
  const root = parseXml(xml);
  const named = collectNamedScalings(root);

  const roms = root.name === 'rom' ? [root] : childrenNamed(root, 'rom');
  if (!roms.length) throw new Error('no <rom> element in this definition file');

  /** @param {import('./xml.js').XmlNode} rom */
  const idOf = (rom) => childNamed(rom, 'romid')?.children.find((c) => c.name === 'xmlid')?.text.trim() ?? '';

  const available = roms.map(idOf).filter(Boolean);

  const rom = options.romId ? roms.find((r) => idOf(r) === options.romId) : roms[0];
  if (!rom) {
    throw new Error(`no <rom> with xmlid "${options.romId}" — this file has: ${available.join(', ')}`);
  }

  // Walk up the `base` chain, guarding against a cycle in a hand-edited file.
  const chain = [rom];
  const seen = new Set([idOf(rom)]);
  let cursor = rom;
  while (cursor.attrs.base) {
    const parent = roms.find((r) => idOf(r) === cursor.attrs.base);
    if (!parent || seen.has(idOf(parent))) break;
    seen.add(idOf(parent));
    chain.push(parent);
    cursor = parent;
  }

  /** @type {Map<string, PartialMap>} */
  const partials = new Map();
  const problems = [];

  // Most distant ancestor first, so nearer links override it.
  for (const link of chain.slice().reverse()) {
    for (const table of childrenNamed(link, 'table')) {
      const name = table.attrs.name;
      if (!name) continue;
      const partial = partials.get(name) ?? { name };
      try {
        mergeTable(partial, table, named);
        partials.set(name, partial);
      } catch (err) {
        problems.push(`table "${name}": ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  const maps = [];
  for (const partial of partials.values()) {
    try {
      maps.push(finishMap(partial));
    } catch (err) {
      // A template table that no ECU in this chain located is expected, not a
      // fault worth reporting — it simply is not present in this ROM.
      if (partial.address !== undefined) {
        problems.push(`table "${partial.name}": ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  const romid = childNamed(rom, 'romid');
  /** @param {string} tag */
  const meta = (tag) => childNamed(romid ?? rom, tag)?.text.trim();

  /** @type {import('../definition.js').RomDef} */
  const definition = {
    id: idOf(rom) || 'imported',
    name: [meta('make'), meta('model'), meta('year'), meta('transmission')].filter(Boolean).join(' ') || idOf(rom),
    ecuPartNumber: meta('ecuid') || meta('internalidstring'),
    romSize: parseAddress(meta('filesize')) ?? 0,
    cpu: meta('memmodel'),
    maps,
  };

  return { definition, problems, available };
}
