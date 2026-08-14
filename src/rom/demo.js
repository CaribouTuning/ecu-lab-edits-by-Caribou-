/**
 * A synthetic ROM you can open without a car.
 *
 * WHAT THIS IS AND IS NOT
 * This is **not** a Nissan ROM. Not a dump, not a leaked image, not anyone's
 * firmware. It is an empty 1 MB buffer with plausible calibration values written
 * into it at the addresses a real definition would look for, so the editor has
 * something real-shaped to open.
 *
 * The layout mirrors the public community definition for a 2006 350Z Rev-Up
 * (ECUID CF43D) — same map names, sizes, storage types, scalings and addresses.
 * That part is public, factual, and is what makes the demo worth having: the
 * grid you edit here is the grid you will edit on your own dump, at the same
 * addresses, in the same units.
 *
 * The **numbers inside** the maps are invented. They are physically sensible —
 * stoich at cruise, richer under load, cams advancing with RPM — so the heat maps
 * read the way a real calibration does, but they are not your car's calibration
 * and nothing here should be flashed to anything.
 *
 * Why it exists: the whole ROM layer is unusable until you own an FTDI cable and
 * have dumped your ECU. This makes the editor explorable in the meantime, and
 * gives the tests a realistically-shaped image instead of a 4 kB toy.
 */

import { makeScaling, writeRaw } from './scaling.js';
import { writeMap } from './definition.js';
import { fixByRewrite } from './checksum.js';

/** SH7058: 1 MB of flash. A real Rev-Up dump is exactly this size. */
export const DEMO_ROM_SIZE = 1024 * 1024;

/**
 * Where the demo puts its checksum words.
 *
 * A real ROM's checksum location has to be found or supplied by a definition;
 * here we choose one, well clear of every map, and keep it in the definition so
 * the export path is exercised properly rather than stubbed.
 */
const CHECKSUM = { sumOffset: 0x20, xorOffset: 0x24, correctionOffset: 0x30 };

/* Scalings, matching the real definition's conversions. */

const RAW = () => makeScaling({ name: 'Raw', storageType: 'uint8', toReal: 'x', decimals: 0 });

const AFR = makeScaling({
  name: 'AFR',
  units: 'AFR (gasoline scale)',
  storageType: 'uint8',
  // The real CF43D conversion. Raw 128 is exactly 14.7:1.
  toReal: '14.7/(x*.0078125)',
  toRaw: '(14.7/x)/.0078125',
  decimals: 2,
});

const CAM_ADVANCE = makeScaling({
  name: 'Cam advance',
  units: 'Degrees Advance',
  storageType: 'uint8',
  toReal: '(x-128)*.5',
  toRaw: '(x/.5)+128',
  decimals: 1,
});

const RPM_AXIS = makeScaling({
  name: 'RPM axis', units: 'RPM', storageType: 'uint8', toReal: 'x*50', toRaw: 'x/50', decimals: 0,
});

const LOAD_AXIS = makeScaling({
  name: 'Load axis', units: 'Load', storageType: 'uint8',
  toReal: 'x*0.151875', toRaw: 'x/0.151875', decimals: 2,
});

const RPM_LIMIT = makeScaling({
  name: 'Engine speed', units: 'RPM', storageType: 'uint16', toReal: 'x*.125', toRaw: 'x/.125', decimals: 0,
});

const IDLE_RPM = makeScaling({
  name: 'Idle target', units: 'RPM', storageType: 'uint8', toReal: 'x*12.5', toRaw: 'x/12.5', decimals: 0,
});

/**
 * The demo definition. Addresses mirror the real CF43D layout.
 *
 * @returns {import('./definition.js').RomDef}
 */
export function demoDefinition() {
  /** @param {number} address @param {number} count */
  const rpmAxis = (address, count) => ({ name: 'RPM', units: 'RPM', count, address, scaling: RPM_AXIS });
  /** @param {number} address @param {number} count */
  const loadAxis = (address, count) => ({ name: 'Load', units: 'Load', count, address, scaling: LOAD_AXIS });

  return {
    id: 'DEMO',
    name: 'Demo ROM — synthetic, Rev-Up shaped',
    ecuPartNumber: 'DEMO-CF43D',
    romSize: DEMO_ROM_SIZE,
    cpu: 'SH7058',
    checksum: CHECKSUM,
    maps: [
      {
        id: 'Timing1', name: 'Timing1', category: 'Ignition Timing',
        description: 'Base spark advance. Raw counts, exactly as the real definition has it — ' +
          'the community definition has not established the conversion for this table.',
        address: 0x8ded, rows: 16, cols: 16, scaling: RAW(),
        xAxis: loadAxis(0xb640, 16), yAxis: rpmAxis(0xb650, 16),
      },
      {
        id: 'Timing High Detonation', name: 'Timing High Detonation', category: 'Ignition Timing',
        description: 'The retarded table the ECU moves toward when it hears knock.',
        address: 0x8fed, rows: 16, cols: 16, scaling: RAW(),
        xAxis: loadAxis(0xb640, 16), yAxis: rpmAxis(0xb650, 16),
      },
      {
        id: 'Fuel Target', name: 'Fuel Target', category: 'Fuel',
        description: 'Commanded air:fuel ratio. 14.7 is stoichiometric; under load a real ' +
          'calibration commands richer than that to control knock and exhaust temperature.',
        address: 0x971d, rows: 8, cols: 8, scaling: AFR,
        xAxis: rpmAxis(0xb2f9, 8), yAxis: loadAxis(0xb4a2, 8),
      },
      {
        id: 'Intake Cam Timing', name: 'Intake Cam Timing', category: 'Cams',
        description: 'Intake cam advance. Raw 128 is zero — the cam is parked.',
        address: 0x9b2d, rows: 16, cols: 16, scaling: CAM_ADVANCE,
        xAxis: loadAxis(0xc308, 16), yAxis: rpmAxis(0xc328, 16),
      },
      {
        id: 'Idle Target', name: 'Idle Target', category: 'Idle',
        description: 'Target idle speed against coolant temperature — high when cold.',
        address: 0xbd02, rows: 1, cols: 16, scaling: IDLE_RPM,
      },
      {
        id: 'Rev Limit (Fuel Cut)', name: 'Rev Limit (Fuel Cut)', category: 'Limiters',
        description: 'Where fuel is cut. The first number most people go looking for, and the ' +
          'one most worth understanding before moving.',
        address: 0x8998, rows: 1, cols: 1, scaling: RPM_LIMIT,
      },
    ],
  };
}

/**
 * A physically sensible commanded AFR for a given load and speed.
 *
 * Cruise sits at stoichiometric because that is where the catalyst works and
 * where closed-loop control lives. As load comes on the target goes rich, which
 * is how a real calibration buys knock margin and keeps exhaust temperature
 * survivable.
 *
 * @param {number} loadFraction 0..1
 * @returns {number} AFR on the gasoline scale
 */
function demoAfr(loadFraction) {
  if (loadFraction < 0.45) return 14.7;
  // 14.7 down to about 11.8 as load fills in.
  return 14.7 - (loadFraction - 0.45) * (2.9 / 0.55);
}

/**
 * Build the demo ROM.
 *
 * Returns bytes with a valid checksum, so the export path — recompute, verify,
 * refuse if it does not check out — runs for real rather than being bypassed.
 *
 * @returns {{bytes: Uint8Array, definition: import('./definition.js').RomDef}}
 */
export function buildDemoRom() {
  const bytes = new Uint8Array(DEMO_ROM_SIZE);
  const definition = demoDefinition();
  const map = (id) => definition.maps.find((m) => m.id === id);

  // 0xFF is what erased flash reads as, so an untouched region looks like an
  // untouched region rather than a suspiciously tidy block of zeroes.
  bytes.fill(0xff);

  /** @param {import('./definition.js').AxisDef} axis @param {number[]} values */
  const writeAxis = (axis, values) => {
    const size = axis.scaling.storageType === 'uint16' ? 2 : 1;
    values.forEach((value, i) => {
      writeRaw(bytes, axis.address + i * size, axis.scaling.storageType, Math.round(axis.scaling.toRaw(value)));
    });
  };

  const rpm16 = Array.from({ length: 16 }, (_, i) => 800 + i * 400);   // 800..6800
  const load16 = Array.from({ length: 16 }, (_, i) => (i + 1) * 2.4);
  const rpm8 = Array.from({ length: 8 }, (_, i) => 800 + i * 800);
  const load8 = Array.from({ length: 8 }, (_, i) => (i + 1) * 4.8);

  const timing = map('Timing1');
  writeAxis(timing.xAxis, load16);
  writeAxis(timing.yAxis, rpm16);

  // Spark: more advance with speed, less as load fills the cylinder.
  const spark = Array.from({ length: 16 }, (_, r) =>
    Array.from({ length: 16 }, (_, c) => {
      const speed = r / 15;
      const load = c / 15;
      return Math.round(18 + speed * 22 - load * 16);
    })
  );
  writeMap(bytes, timing, spark);

  // The knock table is the same shape, pulled back several degrees.
  writeMap(bytes, map('Timing High Detonation'), spark.map((row) => row.map((v) => Math.max(0, v - 7))));

  const fuel = map('Fuel Target');
  writeAxis(fuel.xAxis, rpm8);
  writeAxis(fuel.yAxis, load8);
  writeMap(
    bytes, fuel,
    Array.from({ length: 8 }, (_, r) => Array.from({ length: 8 }, () => demoAfr(r / 7)))
  );

  const cam = map('Intake Cam Timing');
  writeAxis(cam.xAxis, load16);
  writeAxis(cam.yAxis, rpm16);
  // Cam advances in the midrange to fill the torque curve, then backs off up top.
  writeMap(
    bytes, cam,
    Array.from({ length: 16 }, (_, r) =>
      Array.from({ length: 16 }, () => {
        const speed = r / 15;
        return Math.round(Math.sin(speed * Math.PI) * 30 * 2) / 2;
      })
    )
  );

  // Idle target against coolant temperature: high cold, settling warm.
  writeMap(bytes, map('Idle Target'), [
    Array.from({ length: 16 }, (_, i) => Math.round((1400 - i * 50) / 12.5) * 12.5),
  ]);

  writeMap(bytes, map('Rev Limit (Fuel Cut)'), [[7000]]);

  // Sign it, so the image opens as valid and export has real work to do.
  fixByRewrite(bytes, CHECKSUM.sumOffset, CHECKSUM.xorOffset);

  return { bytes, definition };
}
