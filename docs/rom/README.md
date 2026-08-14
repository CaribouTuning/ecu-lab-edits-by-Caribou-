# The ROM layer

`src/rom/` reads, edits and re-checksums real Nissan ECU binaries. It is the
offline half of putting a real ECU on the other end of ECU Lab: it works on a
dump, on your laptop, with no serial port and no way to damage anything.

This is the layer everything else waits on. A flashing tool without it is a way
to write bytes you have not inspected.

## What is here

| File | Job |
|---|---|
| `checksum.js` | The SUM/XOR words the ECU verifies at startup, and two ways to repair them |
| `scaling.js` | Storage types, and the conversion between raw integers and real units |
| `definition.js` | The map catalogue — where each table lives, its size, axes and scaling |
| `image.js` | `RomImage`: a loaded dump, its edits, and a guarded export |
| `formats/romraider.js` | Import a RomRaider XML definition |
| `formats/xml.js` | A small XML reader, so definitions need no dependency |

## The checksum, and why it gets this much attention

A Nissan SH705x ROM stores two 32-bit values computed over the whole image: the
running sum of every big-endian `u32`, and the running xor of the same words. The
ECU checks both at startup. Get them wrong and it will not run, and the recovery
for that is a bench harness or another ECU.

So the module is written to fail loudly rather than plausibly. `export()` fixes
the checksum, verifies the result, and **throws** if verification fails rather
than handing back an image that looks fine. Offsets are bounds- and
alignment-checked before anything is indexed with them. The original dump is held
untouched for the life of the `RomImage`.

Two repair strategies:

- **`fixByRewrite`** — recompute the two words and store the new values. What you
  want when you are flashing the whole image yourself.
- **`fixByCorrection`** — leave the factory checksum values exactly where they are
  and adjust three spare words elsewhere so the totals still come out to the
  original numbers. Needed when something else in the ROM expects the factory
  values unchanged.

There is also `findChecksumOffsets`, which solves for where the two words live
using nothing but arithmetic — useful on a fresh dump you have no definition for.
It only returns an answer that actually verifies, because a coincidental byte
match elsewhere in a 512 kB image is entirely possible.

## Quantization is a feature, not a rounding error

A real ignition table holds bytes. The ROM says "multiply by 0.5, subtract 20",
and now they are degrees — which means the table cannot express 30.3°. Ask for it
and the ECU runs 30.5°.

Every write reports what the ECU will actually run:

```js
const result = image.writeCell('Ignition timing', 2, 5, 30.3);
// { raw: 101, actual: 30.5, clamped: false, quantized: true }
```

This is exactly the thing ECU Lab's floating-point calibration tables cannot
currently express, and it is one of the reasons the simulator and a real ROM do
not yet share a table model.

## Using it

```js
import { RomImage, importRomRaider } from './src/rom/index.js';

const { definition, problems } = importRomRaider(await file.text());
if (problems.length) console.warn('skipped maps:', problems);

const image = new RomImage(new Uint8Array(await dump.arrayBuffer()), definition);

console.log(image.cpuGuess);              // "SH7055 (512 kB)"
console.log(image.checkChecksum().valid); // true on a good stock dump

const timing = image.readMap('Ignition timing');
image.writeCell('Ignition timing', 3, 6, timing[3][6] - 2);

console.log(image.changedCells());        // what moved, in degrees
const out = image.export();               // checksum fixed and verified, or throws
```

## Honest limitations

- **The RomRaider importer has not been run against a real Nissan definition
  file.** It is tested against fixtures written to match the documented structure.
  Check a few known map values by hand on your first real import before trusting
  it, and certainly before writing anything to an ECU.
- **No TunerPro XDF importer yet.** RomRaider XML first because the Nissan
  definitions are better covered there.
- **No ROM is checked in.** They are copyrighted and large. The tests build a
  synthetic 4 kB image with the same structure.
- **Part-number detection is a heuristic** — it scans for the `23710-XXXXX` shape
  in printable strings. The authoritative identification is the ECUID the ECU
  reports over K line, which needs hardware.
- **Nothing here talks to a car.** Dumping is still a nisprog command line; see
  `docs/hardware/z33-kline-setup.md`.

## Provenance and licensing

The checksum algorithms in `checksum.js` are ports of `sum32()` and
`checksum_fix()` from fenugrec's **nissutils** (`cli_utils/nislib.c`), which is
**GPLv3**. The derivation trick in `findChecksumOffsets` comes from
`checksum_alt2()` in the same file.

ECU Lab is MIT. Porting the logic of GPLv3 code into an MIT file is the kind of
boundary that only holds if someone has actually decided where it is — so it is
recorded here rather than left implicit:

- These are ports, not copied source, but "clean-room" would be a lie: they were
  written while reading the originals.
- The safe reading is that this file is a derivative work of nissutils and the
  distributed result should be GPLv3.
- No nisprog or npkern **code** is linked into this app. When the serial bridge is
  built it goes in a separate process, in its own repository, so the boundary is a
  socket rather than an import.

Practically: GPL obligations attach on *distribution*. A build you keep on your
own laptop to tune your own car carries none of them. This repository is public,
which is distribution — so if the ROM layer ships as part of a public release, the
straightforward answer is to license that distribution GPLv3 and stop worrying
about it.

**fenugrec's work here represents thousands of hours of reverse engineering, given
away for free.** If this project is useful to you, nisprog/npkern/nissutils take
donations, and that is where the credit belongs.
