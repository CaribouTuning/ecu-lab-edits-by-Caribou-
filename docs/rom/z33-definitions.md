# Definitions for a 2006 350Z Rev-Up (manual)

What exists publicly, what it says about the ECU, and what the importer in this
repo makes of it. Everything below was run, not assumed.

## Your ECU is SH7058 with a 1 MB ROM, not SH7055/512 kB

This corrects an earlier assumption in this repo's docs. The 2005–2006 Rev-Up
cars are **SH7058 with a 1024 kB ROM**, per the community definitions:

```xml
<xmlid>CF43D</xmlid>
<make>Nissan</make><model>350Z</model><year>06</year><transmission>MT</transmission>
<memmodel>SH7058</memmodel>
<filesize>1024kb</filesize>
<flashmethod>nisprog</flashmethod>
```

Three practical consequences:

| | Use |
|---|---|
| nisprog device | `setdev 7058` — **not** 7055 |
| npkern binary | `npkern/precompiled/npk_SH7058.bin` |
| Expected dump size | 1,048,576 bytes |

A dump that comes back 512 kB means something is wrong — most likely `setdev`.

## Candidate part numbers

The label on the ECU reads `23710-XXXXX`. For a 2006 Rev-Up manual the
candidates seen in parts listings are `23710-CF40C`, `CF40E`, `CF41E`, `CF43D`,
`CF44D` and neighbours. **Check yours before trusting any definition** — the
last five characters are the ECUID the definition is keyed by.

Two of those have definitions today: **CF43D** and **CF40E**.

## Where the definitions are

[github.com/murphyslaw05/NissanDefs](https://github.com/murphyslaw05/NissanDefs)
— one XML per ECUID. They are marked EXPERIMENTAL by their author, and that
warning is worth taking at face value.

RomRaider wants a single file, so the repo ships `combine_all.bat` to
concatenate the header, the shared table templates, every per-ECU file and the
footer. On Linux or macOS the same thing is:

```bash
{ cat xmlheader; cat table_templates; for f in *.xml; do cat "$f"; done; cat xmlfooter; } > nissandefs.xml
```

Load that combined file into ECU Lab's ROM screen, or into RomRaider.

## How a definition is actually assembled

Worth knowing, because it explains why a naive reader gets plausible-looking
nonsense. A table is the merge of a three-link chain:

```
NISSAN_01  →  table names, sizes, storage types, scalings, axis names.
              No addresses: those differ per ECU.
   ↑
CM31C      →  the same tables with storageaddress filled in
   ↑
CF43D      →  overrides for your ECU; often just the romid
```

A link carrying no address is not junk to skip — it is where the *shape* of the
table lives. Skipping it yields a 1×1 table that reads one byte from the right
address and looks almost right, which is worse than an outright failure. The
importer in `src/rom/formats/romraider.js` merges the whole chain.

## What the importer gets from CF43D

**34 maps, no import problems, no validation errors.**

```
0x8DED  16x16  Timing1                        uint8   raw
0x8EED  16x16  Timing Main Low Detonation     uint8   raw
0x8FED  16x16  Timing High Detonation         uint8   raw
0x9B2D  16x16  Intake Cam Timing              uint8   Degrees Advance
0x9A2D  16x16  Exhaust Cam Timing             uint8   Degrees Retard
0x948D  16x16  Fuel Compensation              uint8   raw
0x971D    8x8  Fuel Target                    uint8   AFR (gasoline scale)
0xC83E   64x1  MAF                            uint16
0xBD02   16x1  Idle Target                    uint8   RPM
0x8998    2x1  Rev Limit (Fuel Cut)           uint16  RPM
0xCB2C   16x1  Load Base Fuel Schedule        uint16  ms
        ...plus throttle, torque request, powertrain force, injector latency
```

Two scaling checks that confirm the conversions are being read correctly rather
than merely parsed:

- **Fuel Target**, `14.7/(x*.0078125)`: raw 128 → **14.700**, and back to 128.
  Stoichiometric gasoline landing exactly on a round raw value is what you would
  expect a factory table to do.
- **Intake Cam Timing**, `(x-128)*.5`: raw 128 → **0°**, raw 138 → **5°**.
  Centred at 128, half a degree per count.

## One defect found in the definition

The validator flagged a genuine overlap:

```
maps "MAF voltage limits" and "Open loop fuel target delay" overlap in the image
```

`MAF voltage limits` is declared at **0x7FFF** as a `uint16`, which is both
unaligned and runs straight into `Open loop fuel target delay` at 0x8001. At
least one of those two addresses is wrong.

Treat both as untrustworthy until checked against a real dump. This is exactly
what the overlap check exists for, and it is a good argument for reading the
warnings rather than clicking past them.

## Before you trust any of this on your own car

1. Confirm the part number on your ECU label matches the definition's ECUID.
2. Dump your ROM twice and confirm the two files are byte-identical.
3. Confirm the dump is 1,048,576 bytes.
4. Spot-check a map you can predict. `Rev Limit (Fuel Cut)` should read close to
   your car's actual limiter; `Fuel Target` should be near 14.7 in the cruise
   region. If those numbers are nonsense, the definition does not match your ROM
   and nothing else it says can be relied on either.

## On downloading someone else's ROM

Don't flash one. A ROM from another car carries that car's immobiliser pairing,
and Nissan ECUs are matched to the vehicle — a foreign image can leave you with a
car that will not start, on top of being someone else's copyrighted firmware.

The image you tune must be the one you read out of your own ECU. Other people's
dumps are useful for *comparison* — confirming a map address, seeing what a
different calibration did — and that is all they are for here.
