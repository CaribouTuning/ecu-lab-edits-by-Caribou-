/**
 * ROM layer tests.
 *
 * These are correctness tests, not intent tests. The physics suite asserts on
 * direction because the physics is a model; this code either produces the exact
 * right bytes or it produces an ECU that does not boot, so it is tested against
 * exact values.
 *
 * The checksum tests matter most. A wrong checksum is unrecoverable without a
 * bench harness, so the algorithms are checked both forwards (does a repaired
 * image verify?) and backwards (does a deliberately corrupted one fail?).
 */

import { describe, expect, it } from 'vitest';

import {
  sum32,
  verify,
  fixByRewrite,
  fixByCorrection,
  findChecksumOffsets,
  readU32BE,
  writeU32BE,
  readRaw,
  writeRaw,
  compileExpression,
  invertLinear,
  makeScaling,
  quantize,
  validateDefinition,
  readMap,
  writeMap,
  diffMaps,
  RomImage,
  findPartNumbers,
  importRomRaider,
  parseXml,
} from '../src/rom/index.js';

/* ------------------------------------------------------------------ *
 * A synthetic ROM to test against
 *
 * We have no real Nissan dump checked in — they are copyrighted and large — so
 * the tests build an image with the same shape: a whole number of 32-bit words,
 * two checksum slots, three correction slots, and some map data.
 * ------------------------------------------------------------------ */

const SUM_OFFSET = 0x100;
const XOR_OFFSET = 0x104;
const CORRECTION_OFFSET = 0x200;
const MAP_OFFSET = 0x400;

/**
 * Build a 4 kB pseudo-ROM with valid checksums.
 *
 * Filled deterministically rather than randomly so a failure is reproducible.
 *
 * @returns {Uint8Array}
 */
function makeRom() {
  const buf = new Uint8Array(4096);
  for (let i = 0; i < buf.length; i++) {
    buf[i] = (i * 7 + (i >> 3)) & 0xff;
  }
  // Clear the slots the checksum machinery owns.
  writeU32BE(buf, SUM_OFFSET, 0);
  writeU32BE(buf, XOR_OFFSET, 0);
  writeU32BE(buf, CORRECTION_OFFSET, 0);
  writeU32BE(buf, CORRECTION_OFFSET + 4, 0);
  writeU32BE(buf, CORRECTION_OFFSET + 8, 0);
  fixByRewrite(buf, SUM_OFFSET, XOR_OFFSET);
  return buf;
}

const IGNITION_SCALING = makeScaling({
  name: 'Ignition',
  units: 'deg BTDC',
  storageType: 'uint8',
  // Half a degree per count, offset so the table can express retard.
  toReal: 'x*0.5-20',
  decimals: 1,
});

/** @type {import('../src/rom/definition.js').RomDef} */
const TEST_DEF = {
  id: 'test',
  name: 'Synthetic test ROM',
  romSize: 4096,
  cpu: 'SH7055',
  checksum: { sumOffset: SUM_OFFSET, xorOffset: XOR_OFFSET, correctionOffset: CORRECTION_OFFSET },
  maps: [
    {
      id: 'ignition',
      name: 'Ignition timing',
      category: 'Ignition',
      address: MAP_OFFSET,
      rows: 4,
      cols: 8,
      scaling: IGNITION_SCALING,
      xAxis: { name: 'RPM', units: 'rpm', count: 8, values: [800, 1600, 2400, 3200, 4000, 4800, 5600, 6400] },
      yAxis: { name: 'Load', units: 'kPa', count: 4, values: [20, 50, 80, 101] },
    },
  ],
};

/* ------------------------------------------------------------------ *
 * Checksums
 * ------------------------------------------------------------------ */

describe('checksum arithmetic', () => {
  it('reads and writes big-endian words, because SH705x is big-endian', () => {
    const buf = new Uint8Array(4);
    writeU32BE(buf, 0, 0x12345678);
    expect([...buf]).toEqual([0x12, 0x34, 0x56, 0x78]);
    expect(readU32BE(buf, 0)).toBe(0x12345678);
  });

  it('keeps the sum unsigned past 2^31', () => {
    // Two words that overflow a signed 32-bit accumulator. A missing `>>> 0`
    // anywhere in sum32 turns this negative.
    const buf = new Uint8Array(8);
    writeU32BE(buf, 0, 0xfffffff0);
    writeU32BE(buf, 4, 0x00000020);
    const { sum } = sum32(buf);
    expect(sum).toBe(0x10);
    expect(sum).toBeGreaterThanOrEqual(0);
  });

  it('ignores bytes past the last whole word', () => {
    const whole = new Uint8Array([0, 0, 0, 1]);
    const ragged = new Uint8Array([0, 0, 0, 1, 0xff, 0xff]);
    expect(sum32(ragged)).toEqual(sum32(whole));
  });
});

describe('checksum repair', () => {
  it('produces an image that verifies', () => {
    const rom = makeRom();
    expect(verify(rom, SUM_OFFSET, XOR_OFFSET).valid).toBe(true);
  });

  it('notices a single changed byte', () => {
    const rom = makeRom();
    rom[MAP_OFFSET] ^= 0x01;
    expect(verify(rom, SUM_OFFSET, XOR_OFFSET).valid).toBe(false);
  });

  it('repairs by rewriting the stored values', () => {
    const rom = makeRom();
    rom[MAP_OFFSET] = 0x42;
    rom[MAP_OFFSET + 9] = 0x99;
    expect(verify(rom, SUM_OFFSET, XOR_OFFSET).valid).toBe(false);

    fixByRewrite(rom, SUM_OFFSET, XOR_OFFSET);
    expect(verify(rom, SUM_OFFSET, XOR_OFFSET).valid).toBe(true);
  });

  it('repairs by correction while leaving the factory checksum values untouched', () => {
    const rom = makeRom();
    const originalSum = readU32BE(rom, SUM_OFFSET);
    const originalXor = readU32BE(rom, XOR_OFFSET);

    rom[MAP_OFFSET] = 0x42;
    rom[MAP_OFFSET + 1] = 0x43;
    expect(verify(rom, SUM_OFFSET, XOR_OFFSET).valid).toBe(false);

    fixByCorrection(rom, SUM_OFFSET, XOR_OFFSET, CORRECTION_OFFSET);

    expect(verify(rom, SUM_OFFSET, XOR_OFFSET).valid).toBe(true);
    // The whole point of this strategy: the stored words did not move.
    expect(readU32BE(rom, SUM_OFFSET)).toBe(originalSum);
    expect(readU32BE(rom, XOR_OFFSET)).toBe(originalXor);
  });

  it('survives repeated edit-and-correct cycles', () => {
    const rom = makeRom();
    const originalSum = readU32BE(rom, SUM_OFFSET);
    for (let i = 0; i < 20; i++) {
      rom[MAP_OFFSET + i] = (i * 37) & 0xff;
      fixByCorrection(rom, SUM_OFFSET, XOR_OFFSET, CORRECTION_OFFSET);
      expect(verify(rom, SUM_OFFSET, XOR_OFFSET).valid).toBe(true);
    }
    expect(readU32BE(rom, SUM_OFFSET)).toBe(originalSum);
  });

  it('refuses offsets outside the image rather than corrupting it', () => {
    const rom = makeRom();
    expect(() => verify(rom, 0x100000, XOR_OFFSET)).toThrow(/outside/);
    expect(() => verify(rom, 0x101, XOR_OFFSET)).toThrow(/aligned/);
  });

  it('finds the checksum words in a stock image with no definition', () => {
    const rom = makeRom();
    const found = findChecksumOffsets(rom);
    expect(found).not.toBeNull();
    expect(found?.sumOffset).toBe(SUM_OFFSET);
    expect(found?.xorOffset).toBe(XOR_OFFSET);
  });

  it('reports failure rather than a guess when the scheme does not match', () => {
    // An image whose checksums were never valid: the derivation will land on
    // values that are not in the image, or on ones that do not verify.
    const rom = new Uint8Array(256);
    rom.fill(0xab);
    expect(findChecksumOffsets(rom)).toBeNull();
  });
});

/* ------------------------------------------------------------------ *
 * Storage and scaling
 * ------------------------------------------------------------------ */

describe('raw storage', () => {
  it('round-trips every unsigned type', () => {
    const buf = new Uint8Array(8);
    for (const { type, value } of [
      { type: 'uint8', value: 0xfe },
      { type: 'uint16', value: 0xfedc },
      { type: 'uint32', value: 0xfedcba98 },
    ]) {
      writeRaw(buf, 0, type, value);
      expect(readRaw(buf, 0, type)).toBe(value);
    }
  });

  it('sign-extends signed types, including int32', () => {
    const buf = new Uint8Array(4);
    writeRaw(buf, 0, 'int8', -3);
    expect(readRaw(buf, 0, 'int8')).toBe(-3);
    writeRaw(buf, 0, 'int16', -300);
    expect(readRaw(buf, 0, 'int16')).toBe(-300);
    writeRaw(buf, 0, 'int32', -2000000000);
    expect(readRaw(buf, 0, 'int32')).toBe(-2000000000);
  });

  it('clamps rather than wrapping, and says that it did', () => {
    const buf = new Uint8Array(1);
    expect(writeRaw(buf, 0, 'uint8', 300)).toEqual({ written: 255, clamped: true });
    expect(writeRaw(buf, 0, 'uint8', 200)).toEqual({ written: 200, clamped: false });
  });
});

describe('expressions', () => {
  it('evaluates the arithmetic real definitions use', () => {
    expect(compileExpression('x*0.5-20')(100)).toBeCloseTo(30);
    expect(compileExpression('(x+2)*3')(4)).toBe(18);
    expect(compileExpression('-x')(5)).toBe(-5);
    expect(compileExpression('x/8+1.5')(16)).toBe(3.5);
    expect(compileExpression('2e-3*x')(1000)).toBeCloseTo(2);
  });

  it('honours operator precedence', () => {
    expect(compileExpression('1+2*3')(0)).toBe(7);
    expect(compileExpression('(1+2)*3')(0)).toBe(9);
  });

  it('refuses anything it does not understand instead of guessing', () => {
    // A definition file is third-party data. Silent acceptance here would mean
    // wrong numbers written into a ROM.
    expect(() => compileExpression('alert(1)')).toThrow();
    expect(() => compileExpression('x*')).toThrow();
    expect(() => compileExpression('(x')).toThrow();
  });

  it('inverts a linear expression and rejects a non-linear one', () => {
    const linear = invertLinear(compileExpression('x*0.5-20'));
    expect(linear).not.toBeNull();
    expect(linear?.(30)).toBeCloseTo(100);

    expect(invertLinear(compileExpression('x*x'))).toBeNull();
  });

  it('will not build a scaling it could never write back', () => {
    expect(() =>
      makeScaling({ name: 'quadratic', storageType: 'uint8', toReal: 'x*x' })
    ).toThrow(/never written back/);
  });
});

describe('quantization', () => {
  it('reports the value the ECU will actually run', () => {
    // Half-degree resolution cannot express 30.3 degrees.
    const result = quantize(IGNITION_SCALING, 30.3);
    expect(result.actual).toBeCloseTo(30.5);
    expect(result.quantized).toBe(true);
    expect(result.clamped).toBe(false);
  });

  it('reports an exactly representable value as not quantized', () => {
    const result = quantize(IGNITION_SCALING, 30);
    expect(result.actual).toBeCloseTo(30);
    expect(result.quantized).toBe(false);
  });

  it('flags a request the table cannot hold at all', () => {
    // uint8 with x*0.5-20 tops out at 107.5 degrees.
    const result = quantize(IGNITION_SCALING, 500);
    expect(result.clamped).toBe(true);
    expect(result.actual).toBeCloseTo(107.5);
  });
});

/* ------------------------------------------------------------------ *
 * Definitions and maps
 * ------------------------------------------------------------------ */

describe('definitions', () => {
  it('accepts a sound definition', () => {
    const { errors } = validateDefinition(TEST_DEF, 4096);
    expect(errors).toEqual([]);
  });

  it('rejects a map that runs off the end of the image', () => {
    const bad = { ...TEST_DEF, maps: [{ ...TEST_DEF.maps[0], address: 4090 }] };
    expect(validateDefinition(bad, 4096).errors[0]).toMatch(/outside/);
  });

  it('rejects an axis whose length disagrees with the table', () => {
    const bad = {
      ...TEST_DEF,
      maps: [{ ...TEST_DEF.maps[0], xAxis: { name: 'RPM', count: 3, values: [1, 2, 3] } }],
    };
    expect(validateDefinition(bad, 4096).errors[0]).toMatch(/breakpoints but the table is 8 wide/);
  });

  it('warns when two maps overlap, because that is a typo in an address', () => {
    const overlapping = {
      ...TEST_DEF,
      maps: [
        TEST_DEF.maps[0],
        { ...TEST_DEF.maps[0], id: 'second', address: MAP_OFFSET + 4 },
      ],
    };
    expect(validateDefinition(overlapping, 4096).warnings[0]).toMatch(/overlap/);
  });

  it('rejects a definition sized for a different ECU', () => {
    expect(validateDefinition(TEST_DEF, 524288).errors[0]).toMatch(/expects a 4096-byte ROM/);
  });
});

describe('map access', () => {
  it('reads a map row-major', () => {
    const rom = makeRom();
    const map = TEST_DEF.maps[0];
    const values = readMap(rom, map);
    expect(values).toHaveLength(4);
    expect(values[0]).toHaveLength(8);
    // Second row, first column is element index 8.
    expect(values[1][0]).toBeCloseTo(map.scaling.toReal(rom[MAP_OFFSET + 8]));
  });

  it('round-trips a written map through quantization', () => {
    const rom = makeRom();
    const map = TEST_DEF.maps[0];
    const wanted = Array.from({ length: 4 }, (_, r) =>
      Array.from({ length: 8 }, (_, c) => 10 + r + c * 0.5)
    );
    const report = writeMap(rom, map, wanted);
    expect(report.clamped).toBe(0);
    expect(report.quantized).toBe(0); // every value lands on a half-degree
    expect(readMap(rom, map)).toEqual(wanted);
  });

  it('refuses a cell outside the table', () => {
    const rom = makeRom();
    expect(() => writeMap(rom, TEST_DEF.maps[0], [[1, 2]])).toThrow(/wants 4 rows/);
  });

  it('diffs two images in real units', () => {
    const before = makeRom();
    const after = new Uint8Array(before);
    writeMap(after, TEST_DEF.maps[0], readMap(before, TEST_DEF.maps[0]).map((row, r) =>
      row.map((v, c) => (r === 2 && c === 3 ? v + 1 : v))
    ));

    const diff = diffMaps(before, after, TEST_DEF);
    expect(diff).toHaveLength(1);
    expect(diff[0].changes).toHaveLength(1);
    expect(diff[0].changes[0]).toMatchObject({ row: 2, col: 3 });
    expect(diff[0].changes[0].to - diff[0].changes[0].from).toBeCloseTo(1);
  });
});

/* ------------------------------------------------------------------ *
 * RomImage
 * ------------------------------------------------------------------ */

describe('RomImage', () => {
  it('rejects a truncated dump', () => {
    expect(() => new RomImage(new Uint8Array(4095))).toThrow(/truncated/);
    expect(() => new RomImage(new Uint8Array(0))).toThrow();
  });

  it('keeps the original dump safe from edits', () => {
    const image = new RomImage(makeRom(), TEST_DEF);
    const before = image.readMap('ignition')[0][0];
    image.writeCell('ignition', 0, 0, before + 2);
    expect(image.readMap('ignition')[0][0]).toBeCloseTo(before + 2);
    // The original is what gets flashed back if this goes wrong. It must not move.
    expect(readRaw(image.original, MAP_OFFSET, 'uint8')).not.toBe(
      readRaw(image.bytes, MAP_OFFSET, 'uint8')
    );
  });

  it('reverts cleanly', () => {
    const image = new RomImage(makeRom(), TEST_DEF);
    image.writeCell('ignition', 1, 1, 40);
    expect(image.changedBytes().length).toBeGreaterThan(0);
    image.revert();
    expect(image.changedBytes()).toEqual([]);
  });

  it('reports edits as map cells, not just bytes', () => {
    const image = new RomImage(makeRom(), TEST_DEF);
    image.writeCell('ignition', 3, 2, 25);
    const changed = image.changedCells();
    expect(changed).toHaveLength(1);
    expect(changed[0].mapId).toBe('ignition');
    expect(changed[0].changes[0]).toMatchObject({ row: 3, col: 2 });
  });

  it('exports an image whose checksum verifies', () => {
    const image = new RomImage(makeRom(), TEST_DEF);
    image.writeCell('ignition', 0, 0, 35);
    const out = image.export();
    expect(verify(out, SUM_OFFSET, XOR_OFFSET).valid).toBe(true);
  });

  it('exports via the correction strategy without moving the stored words', () => {
    const rom = makeRom();
    const originalSum = readU32BE(rom, SUM_OFFSET);
    const image = new RomImage(rom, TEST_DEF);
    image.writeCell('ignition', 0, 0, 35);

    const out = image.export({ strategy: 'correction' });
    expect(verify(out, SUM_OFFSET, XOR_OFFSET).valid).toBe(true);
    expect(readU32BE(out, SUM_OFFSET)).toBe(originalSum);
  });

  it('refuses to export when it cannot locate the checksum', () => {
    const nonsense = new Uint8Array(256);
    nonsense.fill(0xab);
    const image = new RomImage(nonsense);
    expect(() => image.export()).toThrow(/refusing to export/);
    // ...unless you explicitly say it is for analysis, not for flashing.
    expect(image.export({ allowBadChecksum: true })).toHaveLength(256);
  });

  it('locates the checksum from the original image even after edits invalidate it', () => {
    const image = new RomImage(makeRom()); // no definition at all
    image.bytes[MAP_OFFSET] ^= 0xff;
    const located = image.locateChecksum();
    expect(located?.sumOffset).toBe(SUM_OFFSET);
    expect(located?.source).toBe('derived');
  });

  it('finds a Nissan part number in the strings', () => {
    const rom = makeRom();
    const text = '23710 CD000';
    for (let i = 0; i < text.length; i++) rom[0x800 + i] = text.charCodeAt(i);
    rom[0x800 - 1] = 0;
    rom[0x800 + text.length] = 0;
    expect(findPartNumbers(rom).map((p) => p.text)).toContain('23710 CD000');
  });
});

/* ------------------------------------------------------------------ *
 * RomRaider import
 * ------------------------------------------------------------------ */

const SAMPLE_DEF = `<?xml version="1.0" encoding="UTF-8"?>
<!-- a comment that must not confuse the parser -->
<roms>
  <scalingbase>
    <scaling name="Timing" units="degrees" storagetype="uint8" endian="big"
             toexpr="x*0.5-20" frexpr="(x+20)/0.5" format="%.1f" />
    <scaling name="RPMAxis" units="RPM" storagetype="uint16" endian="big"
             toexpr="x*7.8125" frexpr="x/7.8125" format="%.0f" />
    <scaling name="Raw" storagetype="uint8" endian="big" />
  </scalingbase>

  <rom>
    <romid>
      <xmlid>Z33_BASE</xmlid>
      <make>Nissan</make>
      <model>350Z</model>
      <year>2005</year>
      <transmission>MT</transmission>
      <memmodel>SH7055</memmodel>
      <filesize>4kb</filesize>
      <ecuid>23710CD000</ecuid>
    </romid>
    <table name="Ignition timing" category="Ignition" type="3D"
           storageaddress="0x400" sizex="8" sizey="4" scaling="Timing">
      <description>Base spark advance.</description>
      <table type="X Axis" name="RPM" storageaddress="0x300" sizex="8" scaling="RPMAxis" />
      <table type="Y Axis" name="Load" scaling="Raw">
        <data>20</data><data>50</data><data>80</data><data>101</data>
      </table>
    </table>
    <table name="Rev limiter" category="Limits" type="2D"
           storageaddress="0x380" sizex="1" sizey="1" scaling="RPMAxis" />
  </rom>

  <rom base="Z33_BASE">
    <romid>
      <xmlid>Z33_DERIVED</xmlid>
      <make>Nissan</make>
      <model>350Z</model>
      <year>2006</year>
      <memmodel>SH7055</memmodel>
      <filesize>4kb</filesize>
    </romid>
    <table name="Ignition timing" storageaddress="0x420" />
  </rom>
</roms>`;

describe('XML reader', () => {
  it('handles comments, declarations, CDATA and entities', () => {
    const root = parseXml('<?xml version="1.0"?><!-- hi --><a x="1 &amp; 2"><b><![CDATA[<raw>]]></b></a>');
    expect(root.name).toBe('a');
    expect(root.attrs.x).toBe('1 & 2');
    expect(root.children[0].text).toBe('<raw>');
  });

  it('throws on mismatched tags rather than silently recovering', () => {
    expect(() => parseXml('<a><b></a></b>')).toThrow();
    expect(() => parseXml('<a>')).toThrow(/unclosed/);
  });
});

describe('RomRaider import', () => {
  it('reads tables, scalings and axes', () => {
    const { definition, problems } = importRomRaider(SAMPLE_DEF);
    expect(problems).toEqual([]);
    expect(definition.cpu).toBe('SH7055');
    expect(definition.romSize).toBe(4096);
    expect(definition.name).toContain('350Z');

    const ignition = definition.maps.find((m) => m.id === 'Ignition timing');
    expect(ignition).toBeDefined();
    expect(ignition?.address).toBe(0x400);
    expect(ignition?.cols).toBe(8);
    expect(ignition?.rows).toBe(4);
    expect(ignition?.scaling.toReal(100)).toBeCloseTo(30);
    expect(ignition?.scaling.toRaw(30)).toBeCloseTo(100);
    expect(ignition?.xAxis?.address).toBe(0x300);
    expect(ignition?.yAxis?.values).toEqual([20, 50, 80, 101]);
  });

  it('produces a definition that validates and reads against a real image', () => {
    const { definition } = importRomRaider(SAMPLE_DEF);
    // Drop the 2D table, which the synthetic ROM has no meaningful data for.
    const trimmed = { ...definition, maps: definition.maps.filter((m) => m.id === 'Ignition timing') };
    expect(validateDefinition(trimmed, 4096).errors).toEqual([]);

    const image = new RomImage(makeRom(), trimmed);
    expect(image.readMap('Ignition timing')).toHaveLength(4);
    expect(image.readAxes('Ignition timing').y).toEqual([20, 50, 80, 101]);
  });

  it('resolves base inheritance, with the derived ROM winning', () => {
    const { definition } = importRomRaider(SAMPLE_DEF, { romId: 'Z33_DERIVED' });
    const ignition = definition.maps.find((m) => m.id === 'Ignition timing');
    // Address overridden by the derived definition...
    expect(ignition?.address).toBe(0x420);
    // ...but the dimensions, scaling and axes inherited from the base.
    expect(ignition?.cols).toBe(8);
    expect(ignition?.yAxis?.values).toEqual([20, 50, 80, 101]);
    // And the table only the base declares is still present.
    expect(definition.maps.map((m) => m.id)).toContain('Rev limiter');
  });

  it('lists what is in the file when asked for a ROM that is not', () => {
    expect(() => importRomRaider(SAMPLE_DEF, { romId: 'nope' })).toThrow(/Z33_BASE/);
  });

  it('reports a broken table without losing the good ones', () => {
    const broken = SAMPLE_DEF.replace('scaling="Timing"', 'scaling="DoesNotExist"');
    const { definition, problems } = importRomRaider(broken);
    expect(problems.join(' ')).toMatch(/DoesNotExist/);
    expect(definition.maps.map((m) => m.id)).toContain('Rev limiter');
  });

  /* ---------------------------------------------------------------- *
   * The shape real Nissan definitions actually have
   *
   * Written from github.com/murphyslaw05/NissanDefs, which is what you would
   * actually use on a 350Z. It differs from the fixture above in three ways that
   * each broke the importer when it first met a real file:
   *
   *   - a template ROM carries table sizes, storage types, scalings and axis
   *     names but NO addresses; a child ROM supplies only the addresses
   *   - scalings are inline <scaling> children, not named references
   *   - the attributes are `expression` / `to_byte`, not `toexpr` / `frexpr`,
   *     and numbers are written ".5" with no leading zero
   * ---------------------------------------------------------------- */

  const NISSAN_SHAPED = `<?xml version="1.0" encoding="utf-8"?>
<roms>
  <rom>
    <romid><xmlid>TEMPLATE</xmlid></romid>
    <table type="3D" name="Fuel Target" category="Fuel" storagetype="uint8" endian="big" sizex="8" sizey="4">
      <scaling units="AFR(Gasoline Scale)" expression="14.7/(x*.0078125)" to_byte="(14.7/x)/.0078125" format="0.00" />
      <table type="X Axis" name="RPM" storagetype="uint8" endian="big">
        <scaling units="RPM" expression="x*50" to_byte="x/50" format="0" />
      </table>
      <table type="Y Axis" name="Load" storagetype="uint8" endian="big">
        <scaling units="Load" expression="x*0.151875" to_byte="x/0.151875" format="0.00" />
      </table>
    </table>
    <table type="3D" name="Intake Cam" category="Cams" storagetype="uint8" endian="big" sizex="8" sizey="4">
      <scaling units="Degrees Advance" expression="(x-128)*.5" to_byte="(x/.5)+128" format="0.0" />
    </table>
  </rom>

  <rom base="TEMPLATE">
    <romid>
      <xmlid>CF43D</xmlid>
      <make>Nissan</make><model>350Z</model><year>06</year><transmission>MT</transmission>
      <memmodel>SH7058</memmodel><filesize>4kb</filesize><ecuid>CF43D</ecuid>
    </romid>
    <table name="Fuel Target" storageaddress="0x400">
      <table type="X Axis" storageaddress="0x300"/>
      <table type="Y Axis" storageaddress="0x320"/>
    </table>
    <table name="Intake Cam" storageaddress="0x500"/>
  </rom>
</roms>`;

  it('assembles a table from a template that has no addresses', () => {
    const { definition, problems } = importRomRaider(NISSAN_SHAPED, { romId: 'CF43D' });
    expect(problems).toEqual([]);

    const fuel = definition.maps.find((m) => m.id === 'Fuel Target');
    // The sizes come from the template, the address from the child. Getting this
    // wrong yields a 1x1 map that reads one plausible-looking byte.
    expect(fuel?.rows).toBe(4);
    expect(fuel?.cols).toBe(8);
    expect(fuel?.address).toBe(0x400);
    expect(fuel?.category).toBe('Fuel');
  });

  it('reads inline scalings written with expression/to_byte', () => {
    const { definition } = importRomRaider(NISSAN_SHAPED, { romId: 'CF43D' });
    const fuel = definition.maps.find((m) => m.id === 'Fuel Target');
    // Stoichiometric gasoline: raw 128 is 14.7:1, and it must round-trip.
    expect(fuel?.scaling.toReal(128)).toBeCloseTo(14.7, 3);
    expect(fuel?.scaling.toRaw(14.7)).toBeCloseTo(128, 3);
    expect(fuel?.scaling.units).toBe('AFR(Gasoline Scale)');
    expect(fuel?.scaling.decimals).toBe(2);
  });

  it('parses numbers written without a leading zero', () => {
    // ".5" and ".0078125" appear throughout real definitions. Rejecting them
    // silently cost seven tables the first time this met a real file.
    expect(compileExpression('(x-128)*.5')(138)).toBeCloseTo(5);
    expect(compileExpression('x*.0078125')(128)).toBeCloseTo(1);

    const { definition } = importRomRaider(NISSAN_SHAPED, { romId: 'CF43D' });
    const cam = definition.maps.find((m) => m.id === 'Intake Cam');
    expect(cam?.scaling.toReal(128)).toBe(0);
    expect(cam?.scaling.toReal(138)).toBe(5);
  });

  it('inherits axes from the template and addresses from the child', () => {
    const { definition } = importRomRaider(NISSAN_SHAPED, { romId: 'CF43D' });
    const fuel = definition.maps.find((m) => m.id === 'Fuel Target');
    expect(fuel?.xAxis?.name).toBe('RPM');
    expect(fuel?.xAxis?.address).toBe(0x300);
    expect(fuel?.xAxis?.count).toBe(8);
    expect(fuel?.yAxis?.name).toBe('Load');
    expect(fuel?.yAxis?.address).toBe(0x320);
    expect(fuel?.yAxis?.count).toBe(4);
  });

  it('treats "NA" units as raw counts rather than a unit called NA', () => {
    const raw = importRomRaider(
      NISSAN_SHAPED.replace('units="Degrees Advance"', 'units="NA"'),
      { romId: 'CF43D' }
    );
    expect(raw.definition.maps.find((m) => m.id === 'Intake Cam')?.scaling.units).toBe('');
  });

  it('reads the ECU identity a real definition carries', () => {
    const { definition } = importRomRaider(NISSAN_SHAPED, { romId: 'CF43D' });
    expect(definition.cpu).toBe('SH7058');
    expect(definition.ecuPartNumber).toBe('CF43D');
    expect(definition.name).toContain('350Z');
  });

  it('refuses a little-endian definition, which is a different ECU family', () => {
    const wrong = SAMPLE_DEF.replace('storagetype="uint8" endian="big"\n             toexpr="x*0.5-20"', 'storagetype="uint8" endian="little"\n             toexpr="x*0.5-20"');
    const { problems } = importRomRaider(wrong);
    expect(problems.join(' ')).toMatch(/big-endian/);
  });
});
