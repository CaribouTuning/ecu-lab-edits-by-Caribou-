#!/usr/bin/env node
/**
 * A stand-in for the compiled npbridge, so the native driver can be tested
 * without a toolchain, a cable or an ECU.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * It speaks the same protocol the real helper does: operations in on stdin, one
 * JSON reply per line out on file descriptor 3, and free-form log lines on
 * stdout. It mirrors the real helper's most important property — there is no
 * command dispatch table, so an unknown word is refused rather than looked up.
 *
 * Steerable for the failure paths:
 *   FAKE_SILENT=1     answer nothing, to exercise the timeout
 *   FAKE_GARBAGE=1    emit a malformed reply
 *   FAKE_NO_CONNECT=1 make connect report failure
 */

import { writeFileSync, writeSync } from 'node:fs';

const VERSION = '0.2.0-fake';

/** Structured replies go to fd 3, exactly as the real helper does. */
function reply(obj) {
  if (process.env.FAKE_SILENT) return;
  if (process.env.FAKE_GARBAGE) {
    writeSync(3, 'this is not json\n');
    return;
  }
  writeSync(3, JSON.stringify(obj) + '\n');
}

/** Human-readable progress goes to stdout, like freediag's printf output. */
const log = (line) => process.stdout.write(line + '\n');

let connected = false;

log('npbridge fake (test double)');
reply({ op: 'start', ok: true, version: VERSION });

let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let index;
  while ((index = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, index).trim();
    buffer = buffer.slice(index + 1);
    if (line) handle(line);
  }
});

/** @param {string} line */
function handle(line) {
  const [op, ...args] = line.split(/\s+/);

  switch (op.toLowerCase()) {
    case 'ping':
      return reply({ op: 'ping', ok: true, version: VERSION });

    case 'connect':
      if (!args[0]) return reply({ op: 'connect', ok: false, detail: 'usage: connect <port>' });
      if (process.env.FAKE_NO_CONNECT) {
        return reply({ op: 'connect', ok: false, detail: 'command failed' });
      }
      log('connecting on ' + args[0]);
      connected = true;
      return reply({ op: 'connect', ok: true, ecuid: 'CF43D' });

    case 'ecuid':
      return connected
        ? reply({ op: 'ecuid', ok: true, ecuid: 'CF43D' })
        : reply({ op: 'ecuid', ok: false, detail: 'not connected' });

    case 'setdev':
      if (!['7051', '7055', '7058'].includes(args[0])) {
        return reply({ op: 'setdev', ok: false, detail: 'command failed' });
      }
      return reply({ op: 'setdev', ok: true });

    case 'guesskey':
      return reply({ op: 'guesskey', ok: true });

    case 'kernel':
      if (!args[0]) return reply({ op: 'kernel', ok: false, detail: 'usage: kernel <path>' });
      log('kernel uploaded');
      return reply({ op: 'kernel', ok: true });

    case 'dump': {
      if (args.length < 3) {
        return reply({ op: 'dump', ok: false, detail: 'usage: dump <file> <start> <length>' });
      }
      const length = Number(args[2]) || 256;
      const bytes = Buffer.alloc(length);
      for (let i = 0; i < length; i++) bytes[i] = (i * 3) & 0xff;
      writeFileSync(args[0], bytes);
      log(`dumped ${length} bytes`);
      return reply({ op: 'dump', ok: true, file: args[0] });
    }

    case 'stopkernel':
      return reply({ op: 'stopkernel', ok: true });

    case 'disconnect':
      connected = false;
      return reply({ op: 'disconnect', ok: true });

    case 'quit':
      reply({ op: 'quit', ok: true });
      return process.exit(0);

    default:
      // The real helper has no dispatch table either — this is not a lookup
      // that failed, it is the absence of any lookup at all.
      return reply({
        op,
        ok: false,
        detail: 'unknown operation; this build is read-only',
      });
  }
}
