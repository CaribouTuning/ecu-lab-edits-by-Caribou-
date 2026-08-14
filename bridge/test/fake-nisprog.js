#!/usr/bin/env node
/**
 * A stand-in for nisprog, so the bridge can be tested without an ECU.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * It imitates the parts of the real program's behaviour the driver depends on: a
 * banner, a prompt, one response per command, and a prompt again. It is not a
 * simulation of an ECU and does not pretend to be — it exists to prove the
 * process driving, the command queue, the allowlist and the dump plumbing work.
 *
 * Behaviour can be steered by environment variables so tests can provoke the
 * failure paths:
 *   FAKE_SLOW=1       never print a prompt, to exercise the timeout
 *   FAKE_CONNECT_FAIL=1  make `nc` report an error
 */

import { writeFileSync } from 'node:fs';

const prompt = () => process.stdout.write('nisprog> ');

process.stdout.write('nisprog fake v0.0 (test double)\n');
if (!process.env.FAKE_SLOW) prompt();

let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let index;
  while ((index = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, index).trim();
    buffer = buffer.slice(index + 1);
    handle(line);
  }
});

/** @param {string} line */
function handle(line) {
  const [command, ...rest] = line.split(/\s+/);

  // Real freediag echoes the command back when stdin is a pipe rather than a
  // terminal, so the double does too — otherwise the driver's echo stripping
  // would go untested.
  process.stdout.write(line + '\n');

  if (command === 'quit' || command === 'exit') {
    process.exit(0);
  }

  if (command === 'nc' || command === 'npconn') {
    if (process.env.FAKE_CONNECT_FAIL) {
      process.stdout.write('Error: could not connect to ECU\n');
    } else {
      process.stdout.write('Connected to ECU\nECUID: 23710 CD000\nkeyset: 0x1C07CD33\n');
    }
  } else if (command === 'dm' || command === 'dumpmem') {
    // Write a small deterministic file where the caller asked for one.
    const file = rest[0];
    const length = Number(rest[2] ?? 0) || 256;
    const bytes = Buffer.alloc(length);
    for (let i = 0; i < length; i++) bytes[i] = (i * 3) & 0xff;
    writeFileSync(file, bytes);
    process.stdout.write(`dumped ${length} bytes to ${file}\n`);
  } else if (command === 'runkernel') {
    process.stdout.write('kernel uploaded and running\n');
  } else {
    process.stdout.write(`ok: ${line}\n`);
  }

  if (!process.env.FAKE_SLOW) prompt();
}
