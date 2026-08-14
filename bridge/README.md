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

## Two drivers

**`npbridge` (recommended).** A small C program in `native/` that links against
freediag and nisprog and calls their command handlers directly. Every operation
returns a status code, so nothing here parses English prose to decide whether a
command worked. This is the approach nisprog's author recommended when asked
about front ends:

> "Interfacing to the CLI will be messy, you'd almost be better off linking
> against libdiag and some of the nisprog code, then calling command handlers
> directly instead of trying to pipe stuff through stdin/stdout."
> — fenugrec, romraider.com thread 14867

**`nisprog` (fallback).** Drives the stock CLI over a pipe, matching its prompt
and gating commands through the allowlist in `src/safety.js`. It works, and it is
there if you have nisprog but have not built npbridge.

### Read-only means something different in each

The CLI driver is read-only because a string allowlist rejects the dangerous
command names. That is a check, and a check can have gaps — `source`, which runs
commands from a file, had to be found and blocked by hand.

npbridge is read-only because **there is no code path to those commands**. It has
no dispatch table: the protocol is a fixed set of operations, each wired to a
specific function at compile time. An unrecognised word is not looked up
anywhere, because there is nothing to look it up in. `cmd_flrom`, `cmd_flblock`
and `cmd_writevin` are never called from `npbridge.c`, so no input can reach
them.

## Building npbridge

Build nisprog first — this links its libraries and uses its generated
`version.c`:

```bash
git clone --recursive https://github.com/fenugrec/nisprog.git
cmake -S nisprog -B nisprog/build && cmake --build nisprog/build

cmake -S bridge/native -B build/native -DNISPROG_SRC=$PWD/nisprog
cmake --build build/native
```

That produces `build/native/npbridge`.

## Running it

Needs Node 20+.

```bash
# the good path
node bin/garage-bridge.js --port 8347 --npbridge /path/to/npbridge

# or, without building the helper
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
| `POST /command` | Raw passthrough, allowlisted — CLI driver only; npbridge has none, by design |
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

With `--npbridge` the scraping is gone: operations return status codes, and the
helper's replies travel on their own pipe (fd 3) so they cannot interleave with
freediag's `printf` logging. What remains is that npbridge has only been exercised
against a fake ECU and against the real binary with no hardware attached. The
command handlers it calls are nisprog's own, so the protocol work is not
reimplemented — but nobody has yet watched it dump a real ECU.

With `--nisprog` the original caveat stands in full: it is screen-scraping a
human-facing CLI whose output format is not a stable interface.

Either way, the first time you run this against a real ECU, watch the log in the
app and check it agrees with what the bridge claims happened.

## Credit

nisprog, npkern and nissutils are fenugrec's work — thousands of hours of reverse
engineering, given away. This bridge is a thin wrapper around them and would not
exist otherwise. They take donations.
