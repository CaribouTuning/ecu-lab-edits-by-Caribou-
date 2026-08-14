# Garage Bridge

A small local server that lets ECU Lab read from a real Nissan ECU. It wraps
fenugrec's [nisprog](https://github.com/fenugrec/nisprog), which does the actual
K-line work.

**This build is read-only.** It cannot write to an ECU. `flrom`, `flblock` and
`writevin` are refused by name, and every other command has to be on an
allowlist before it will run.

## Why this is a separate program

Three problems, one answer.

**Licensing.** nisprog and npkern are GPLv3; ECU Lab is MIT. Two programs talking
over a socket is the arrangement least likely to make the web app a derivative
work. This directory is GPLv3 and self-contained — it has its own `LICENSE`, no
imports from `../src`, and can be lifted into its own repository unchanged if the
boundary needs to be more obviously separate than a subdirectory.

**Timing.** ISO 14230 needs a wake pattern with tens-of-milliseconds precision,
then byte timing inside a few milliseconds, then a mid-session baud change to
62500. A browser's event loop cannot be trusted with that. nisprog bit-bangs the
init through the FTDI DTR/RTS lines, which a browser cannot reach at all.

**Blast radius.** Everything that can damage an ECU is on one side of this
boundary, behind one gate, in one file (`src/safety.js`).

## Running it

Needs Node 20+, and nisprog built and on your PATH.

```bash
node bin/garage-bridge.js --port 8347 --nisprog /path/to/nisprog
```

It prints a token. Paste that into ECU Lab. The bridge binds to `127.0.0.1` only,
so nothing off your machine can reach it, and every request must carry the token —
otherwise any web page you happened to be visiting could go looking for a local
server that talks to your engine controller.

## The API

All routes need an `x-bridge-token` header (or `?token=` for `/events`, since
`EventSource` cannot set headers).

| Route | Does |
|---|---|
| `GET /status` | Version, connection state, and the list of commands this build will run |
| `GET /events` | Server-sent stream of nisprog's output, line by line |
| `POST /connect` | `{port}` — runs the documented setup sequence and connects |
| `POST /kernel` | `{device, kernelPath}` — uploads npkern so dumps run at a usable speed |
| `POST /dump` | `{start, length}` — reads memory; `{start: 0, length: 0}` means the whole ROM |
| `GET /dump/:id` | The bytes, with a `x-dump-sha256` header |
| `POST /command` | Raw passthrough, still allowlisted |
| `POST /disconnect` | Stops the kernel, disconnects, exits nisprog |

## About `runkernel`

The allowlist permits `runkernel`, which does write — to ECU **RAM**, not flash.
It does not consume a flash write cycle and the ECU returns to stock behaviour on
reset. It is also not optional: without npkern loaded, reading a 512 kB ROM runs
at about 100 B/s instead of 5.4 kB/s, which is the difference between ninety
seconds and ninety minutes.

## What this does not do

- **No writing.** Not behind a flag, not with a confirmation. The flashing phase
  needs a held original dump, verify-after-write, a flash-cycle budget against the
  ~100-cycle rating, and a written recovery procedure — none of which exist yet.
- **No high-rate datalogging.** Repeated `dm` calls to RAM work, but that is a
  polled read through a CLI, not a stream. Real logging wants npkern's `0x23`
  driven directly.
- **No J2534.** nisprog drives dumb FTDI interfaces. A Tactrix Openport would need
  separate work.

## The honest caveat

The bridge drives nisprog by writing to its stdin and reading its stdout — it is
screen-scraping a human-facing CLI. That output format is not a stable interface
and may change between nisprog versions. The code is written defensively for it:
unknown output is passed through rather than parsed, the prompt pattern is
configurable, and commands time out rather than hang. But the first time you run
this against a real ECU, watch the raw output in the app and check it agrees with
what the bridge claims happened.

## Credit

nisprog, npkern and nissutils are fenugrec's work — thousands of hours of reverse
engineering, given away. This bridge is a thin wrapper around them and would not
exist otherwise. They take donations.
