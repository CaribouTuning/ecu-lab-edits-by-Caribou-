# Getting a Z33 talking to a Windows laptop

For a 2003–2006 350Z / G35 (VQ35DE). This is the shopping list and the bring-up
procedure, in the order that fails fastest — every step here is designed to prove
something before the next step can hurt you.

Nothing in this document writes to your ECU. Flashing is deliberately not covered
yet; see "What is not built" at the end.

## What your ECU is

| | |
|---|---|
| CPU | Renesas (Hitachi) SH705x — **SH7058 on 2005-2006 Rev-Up cars** |
| ROM | 1024 kB on SH7058 (512 kB on SH7055), big-endian |
| Diagnostics | K line, ISO 14230 (KWP2000) |
| Flash endurance | **~100 write cycles**, per Renesas |

**Check which one you have before dumping.** The community definitions record the
2006 Rev-Up ECUs (`23710-CF43D`, `CF40E`) as SH7058 with a 1 MB ROM, so
`setdev 7058` and `npk_SH7058.bin` are the right choices there. Earlier Z33s use
the SH7055. Getting this wrong gives you a dump of the wrong length, which is the
easiest way to spot it. See `docs/rom/z33-definitions.md`.

The 2007+ cars (VQ35HR, 370Z, G37) moved diagnostics to CAN and **cannot** be
reached by these tools at all. If you ever put this on a different car, check that
first — it is the difference between "works" and "no path exists".

## The cable

You need a **genuine FTDI FT232-based K-line interface**. This is the single most
common place people lose a weekend.

**Why not the obvious options:**

- **ELM327 (any form — Bluetooth, wifi, USB).** Will not work, ever. An ELM327 is
  a sealed firmware black box that speaks standard OBD-II PIDs. nisprog needs to
  bit-bang a wake pattern on the K line with millisecond precision and then send
  Nissan's manufacturer-specific extended commands. An ELM327 cannot do either.
  It is the most commonly owned adapter and the most useless one here.
- **Counterfeit FTDI chips.** Widespread on cheap cables. Windows drivers have
  historically bricked them on purpose. Buy from somewhere that will tell you the
  chip is genuine.

**What to look for:** a "VAG-KKL 409.1" style cable with a stated FT232RL, or an
FTDI USB-to-serial breakout plus an L9637D K-line transceiver if you would rather
build it. Budget roughly $15–40. nisprog calls this a "dumb" interface and drives
the init through the DTR/RTS lines directly.

**Pinout you care about at the OBD-II port:** pin 7 is K line, pin 16 is +12 V
(always live), pins 4 and 5 are ground.

## Windows setup

1. Install the FTDI **VCP** (Virtual COM Port) driver from ftdichip.com. Do not
   use a driver bundled with the cable.
2. Plug the cable in, open Device Manager, and note the COM port number.
3. **Set the latency timer to 1 ms.** Device Manager → Ports → your cable →
   Properties → Port Settings → Advanced → Latency Timer. The default is 16 ms,
   which is longer than several of the K-line inter-byte timing windows, and
   leaving it at the default is the second most common cause of failure. Also
   raise the COM port number to under 10 if nisprog struggles with the name —
   ports above COM9 need the `\\.\COM19` form.
4. Build or download nisprog (`github.com/fenugrec/nisprog`). It carries freediag
   with it.

## First session, in the order that fails safe

Engine off, ignition on. Battery healthy — a marginal battery is a real risk later
and a source of comms errors now.

```
set
  interface dumb
  port \\.\COM3          # whatever Device Manager said
  dumbopts 0x48
  l2protocol iso14230
  initmode fast
  testerid 0xfc
  destaddr 0x10
  addrtype phys
  up

nc                       # connect. If this fails, nothing below matters.
```

If `nc` does not connect, stop and fix that. `debug l1 0x8c` turns on a dump of
every byte in and out, which is how you tell "wrong port" from "wrong timing"
from "cable not passing K line".

Once connected:

```
gk                       # guess the seed/key set for your ECUID
setdev 7058              # 7055 on earlier cars - check first
npconf p3 0              # usually faster and more reliable
runkernel npkern.bin     # npkern/precompiled/npk_SH7058.bin for a Rev-Up
dm stock-original.bin 0 0    # dump the entire ROM
```

**Dump it twice, to two different files, and compare them.** A dump that does not
reproduce byte-for-byte means your comms are marginal, and every conclusion you
draw from that file is unreliable. This costs you five minutes and is the cheapest
insurance in the entire project.

Keep `stock-original.bin` somewhere you will still have it in five years. It is
the only thing standing between you and a boat anchor.

### Which kernel binary

`npkern/precompiled/` ships `npk_SH7058.bin`, plus `npk_SH7055_18.bin` and
`npk_SH7055_35.bin` — the 180 nm and 350 nm variants of the SH7055, which have
different flash backends. For a 2006 Rev-Up use the SH7058 kernel. If you are only
dumping, an SH7055 mismatch simply fails to run; get it right before you ever write.

## What this repo does with the dump

Once you have `stock-original.bin`, the `src/rom/` layer in this repository reads
it offline — real maps, real scaling, real axes, no hardware attached and nothing
that can damage anything. See `docs/rom/README.md`.

## What is and is not built

- **A read-only bridge now exists.** `bridge/` runs nisprog for you and reads the
  ROM straight into the app's ROM screen, so the command line above is the
  fallback rather than the only route. It cannot write to an ECU. See
  `bridge/README.md` and `docs/hardware/building-nisprog.md`.
- **No flashing, from here.** Deliberately. Writing needs a verified transport, a
  held original dump, CRC verify-after-write, a flash-cycle budget and a written
  recovery procedure — and none of those exist yet.

## Two things worth saying plainly

**Flash endurance is a hard budget.** ~100 cycles is the rating. The natural
workflow — tweak a map, flash, drive, repeat — would spend a meaningful fraction
of your ECU's life in one afternoon. npkern's own README warns against live-tuning
applications for exactly this reason. Iterate in the simulator; flash validated
changes.

**Reflashing affects emissions compliance and may not be road-legal where you
live.** That is your call to make, but make it knowingly.
