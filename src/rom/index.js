/**
 * The ROM layer: reading, editing and re-checksumming real Nissan ECU binaries.
 *
 * This is the offline half of putting a real ECU on the other end of ECU Lab.
 * Nothing here touches a serial port or a car — it works on a dump, on your
 * laptop, with no way to damage anything. That is deliberate: every edit you
 * will ever flash gets made and reviewed here first.
 *
 * See `docs/rom/README.md` for how the pieces fit together and what still has to
 * be built before bytes can reach an ECU.
 */

export {
  sum32,
  verify,
  fixByRewrite,
  fixByCorrection,
  findChecksumOffsets,
  readU32BE,
  writeU32BE,
} from './checksum.js';

export {
  STORAGE_TYPES,
  readRaw,
  writeRaw,
  compileExpression,
  invertLinear,
  makeScaling,
  quantize,
} from './scaling.js';

export {
  mapByteLength,
  validateDefinition,
  readAxis,
  readMap,
  writeCell,
  writeMap,
  diffMaps,
} from './definition.js';

export { RomImage, CPU_BY_SIZE, findAsciiStrings, findPartNumbers } from './image.js';

export { importRomRaider } from './formats/romraider.js';
export { parseXml } from './formats/xml.js';
