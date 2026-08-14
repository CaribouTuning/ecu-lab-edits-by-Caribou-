#!/usr/bin/env node
/**
 * Garage Bridge — command-line entry point.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Starts the local HTTP API and prints the token the web app needs.
 */

import { createBridge, BRIDGE_VERSION } from '../src/server.js';

const args = process.argv.slice(2);
/** @param {string} name @param {string} [fallback] */
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

if (args.includes('--help') || args.includes('-h')) {
  process.stdout.write(
    `Garage Bridge ${BRIDGE_VERSION} — read-only Nissan ECU access for ECU Lab\n\n` +
      'Usage: garage-bridge [--port 8347] [--nisprog /path/to/nisprog] [--token TOKEN]\n\n' +
      'Binds to 127.0.0.1 only. Every request needs the token printed below.\n' +
      'This build cannot write to an ECU: flrom, flblock and writevin are refused.\n'
  );
  process.exit(0);
}

const port = Number(arg('port', '8347'));
const { server, token, close } = createBridge({
  binary: arg('nisprog', 'nisprog'),
  token: arg('token'),
});

server.listen(port, '127.0.0.1', () => {
  process.stdout.write(
    `\nGarage Bridge ${BRIDGE_VERSION}  ·  READ-ONLY\n` +
      `  http://127.0.0.1:${port}\n` +
      `  token: ${token}\n\n` +
      'Paste that token into ECU Lab to connect. Nothing off this machine can reach\n' +
      'the bridge, and this build refuses every command that writes to an ECU.\n\n'
  );
});

const shutdown = () => { close().finally(() => process.exit(0)); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
