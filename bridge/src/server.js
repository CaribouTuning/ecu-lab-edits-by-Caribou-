/**
 * The bridge's local HTTP API.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Plain HTTP with a server-sent-event stream for live output. No WebSocket and no
 * dependencies: a browser can drive this with `fetch` and `EventSource`, and the
 * whole thing runs on `node:http`.
 *
 * SECURITY — WHY THIS IS NOT JUST AN OPEN PORT
 * A local server that can command an engine controller is exactly the kind of
 * thing any web page you happen to be visiting would like to find. Three things
 * stop that:
 *
 *  1. It binds to 127.0.0.1 only, so nothing off the machine can reach it.
 *  2. Every request must carry a token printed on the console at startup. A
 *     hostile page cannot guess it. This is the same arrangement Jupyter uses.
 *  3. Cross-origin requests are only answered for localhost origins, and the
 *     token lives in a custom header, which forces a CORS preflight that a
 *     hostile origin fails.
 *
 * Even so, the strongest protection is that this build cannot write to an ECU at
 * all — see `safety.js`.
 */

import { createServer } from 'node:http';
import { randomBytes, createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Nisprog } from './nisprog.js';
import { NativeBridge, OPERATIONS } from './native.js';
import { describeAllowed, RUNKERNEL_NOTE } from './safety.js';

export const BRIDGE_VERSION = '0.1.0';

/**
 * What /status reports when the native helper is in use.
 *
 * The CLI driver lists an allowlist because it needs one. The native helper has
 * no dispatch table, so this is simply the set of operations that exist.
 */
const OPERATIONS_AS_COMMANDS = OPERATIONS.map((command) => ({
  command,
  does: 'read-only operation compiled into npbridge',
}));

/** Only these origins may talk to the bridge from a browser. */
const ALLOWED_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

/**
 * Create the bridge server.
 *
 * @param {object} [options]
 * @param {string} [options.token] auth token; generated when omitted
 * @param {Nisprog|NativeBridge} [options.nisprog] injectable for tests
 * @param {string} [options.binary] path to the driver's executable
 * @param {boolean} [options.native] use the compiled npbridge helper, which calls
 *        nisprog's command handlers directly instead of driving its CLI
 * @param {string} [options.dumpDir]
 * @returns {{server: import('node:http').Server, token: string, nisprog: Nisprog|NativeBridge,
 *            close: () => Promise<void>, dumps: Map<string, object>}}
 */
export function createBridge(options = {}) {
  const token = options.token ?? randomBytes(24).toString('hex');
  // The native helper is the better path — structured replies, and read-only as
  // a property of the binary rather than a string check. The CLI driver stays
  // for anyone who has nisprog but has not built npbridge.
  const np = options.nisprog ??
    (options.native
      ? new NativeBridge({ binary: options.binary ?? 'npbridge' })
      : new Nisprog({ binary: options.binary }));
  const isNative = np instanceof NativeBridge || options.native === true;
  const dumpDir = options.dumpDir ?? mkdtempSync(join(tmpdir(), 'garage-bridge-'));

  /** @type {Map<string, {path: string, size: number, sha256: string, meta: object}>} */
  const dumps = new Map();

  /** @type {Set<import('node:http').ServerResponse>} */
  const listeners = new Set();

  /** Session facts, reported by /status so the UI can show where it is. */
  const state = { connected: false, kernelRunning: false, device: null, identity: null };

  const broadcast = (event, data) => {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of listeners) {
      // A disconnected listener throws on write; drop it rather than crash.
      try { res.write(payload); } catch { listeners.delete(res); }
    }
  };

  np.on('output', (line) => broadcast('output', { line }));
  np.on('exit', (info) => {
    state.connected = false;
    state.kernelRunning = false;
    broadcast('exit', info);
  });

  const cors = (req, res) => {
    const origin = req.headers.origin;
    if (origin && ALLOWED_ORIGIN.test(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Headers', 'content-type, x-bridge-token');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Vary', 'Origin');
    }
    return !origin || ALLOWED_ORIGIN.test(origin);
  };

  const send = (res, status, body) => {
    const text = JSON.stringify(body);
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(text);
  };

  const readBody = (req) =>
    new Promise((resolve, reject) => {
      let raw = '';
      req.on('data', (c) => {
        raw += c;
        // A request body this large is not something this API ever needs.
        if (raw.length > 1_000_000) reject(new Error('request body too large'));
      });
      req.on('end', () => {
        if (!raw) return resolve({});
        try { resolve(JSON.parse(raw)); } catch { reject(new Error('body is not valid JSON')); }
      });
      req.on('error', reject);
    });

  const server = createServer(async (req, res) => {
    const originOk = cors(req, res);

    if (req.method === 'OPTIONS') {
      res.writeHead(originOk ? 204 : 403);
      return res.end();
    }
    if (!originOk) return send(res, 403, { error: 'origin not permitted' });

    const url = new URL(req.url, 'http://localhost');
    const path = url.pathname;

    // The token may come as a header or, for EventSource — which cannot set
    // headers — as a query parameter.
    const supplied = req.headers['x-bridge-token'] ?? url.searchParams.get('token');
    if (supplied !== token) {
      return send(res, 401, {
        error: 'bad or missing token. The bridge prints one when it starts; paste it into the app.',
      });
    }

    try {
      /* ---- status ---- */
      if (req.method === 'GET' && path === '/status') {
        return send(res, 200, {
          version: BRIDGE_VERSION,
          readOnly: true,
          nisprogRunning: np.running,
          driver: isNative ? 'npbridge (linked)' : 'nisprog (cli)',
          allowedCommands: isNative ? OPERATIONS_AS_COMMANDS : describeAllowed(),
          runkernelNote: RUNKERNEL_NOTE,
          ...state,
        });
      }

      /* ---- live output stream ---- */
      if (req.method === 'GET' && path === '/events') {
        res.writeHead(200, {
          'content-type': 'text/event-stream',
          'cache-control': 'no-cache',
          connection: 'keep-alive',
        });
        res.write('retry: 2000\n\n');
        listeners.add(res);
        req.on('close', () => listeners.delete(res));
        return undefined;
      }

      /* ---- start nisprog and connect to the ECU ---- */
      if (req.method === 'POST' && path === '/connect') {
        const body = await readBody(req);
        if (!body.port) return send(res, 400, { error: 'port is required' });

        if (!np.running) await np.start();
        const result = await np.connectEcu(body);

        state.identity = result.identity;
        state.connected = result.connected;

        return send(res, 200, {
          connected: result.connected,
          identity: result.identity,
          transcript: result.transcript ?? [],
        });
      }

      /* ---- prepare for a fast dump ---- */
      if (req.method === 'POST' && path === '/kernel') {
        const body = await readBody(req);
        if (!body.device) return send(res, 400, { error: 'device is required, e.g. "7055"' });
        if (!body.kernelPath) return send(res, 400, { error: 'kernelPath is required' });

        const result = await np.loadKernel(body);
        state.device = body.device;
        state.kernelRunning = true;
        return send(res, 200, { ...result, note: RUNKERNEL_NOTE });
      }

      /* ---- read memory ---- */
      if (req.method === 'POST' && path === '/dump') {
        const body = await readBody(req);
        const start = body.start ?? 0;
        const length = body.length ?? 0; // 0,0 means "the whole ROM" to nisprog
        const id = randomBytes(8).toString('hex');
        const file = join(dumpDir, `${id}.bin`);

        const { output } = await np.dumpMemory({ file, start, length });

        let size = 0;
        try { size = statSync(file).size; } catch {
          return send(res, 502, { error: 'nisprog produced no dump file', output });
        }
        const bytes = readFileSync(file);
        const sha256 = createHash('sha256').update(bytes).digest('hex');
        dumps.set(id, { path: file, size, sha256, meta: { start, length } });

        return send(res, 200, { id, size, sha256, output });
      }

      /* ---- fetch a dump's bytes ---- */
      if (req.method === 'GET' && path.startsWith('/dump/')) {
        const id = path.slice('/dump/'.length);
        const entry = dumps.get(id);
        if (!entry) return send(res, 404, { error: 'no such dump' });
        const bytes = readFileSync(entry.path);
        res.writeHead(200, {
          'content-type': 'application/octet-stream',
          'content-length': String(bytes.length),
          'x-dump-sha256': entry.sha256,
        });
        return res.end(bytes);
      }

      /* ---- raw passthrough ---- */
      if (req.method === 'POST' && path === '/command') {
        if (isNative) {
          // There is deliberately no passthrough on the native driver. It has no
          // command dispatch table, so there is nothing to pass a command name
          // through to — that absence is what makes it read-only by
          // construction rather than by a check.
          return send(res, 400, {
            error: 'the npbridge driver has no passthrough: it exposes a fixed set of ' +
              'read operations and no way to name a handler. Use the specific routes, ' +
              'or run the CLI driver if you need arbitrary commands.',
          });
        }
        const body = await readBody(req);
        const output = await np.send(body.command ?? '', { timeoutMs: body.timeoutMs });
        return send(res, 200, { output });
      }

      /* ---- end the session ---- */
      if (req.method === 'POST' && path === '/disconnect') {
        if (np.running) {
          await np.endSession();
          await np.stop();
        }
        state.connected = false;
        state.kernelRunning = false;
        return send(res, 200, { ok: true });
      }

      return send(res, 404, { error: `no route for ${req.method} ${path}` });
    } catch (err) {
      // Errors here are usually "the ECU did not answer", which is information,
      // not a crash. Report them and stay up.
      return send(res, 500, { error: err instanceof Error ? err.message : String(err) });
    }
  });

  const close = async () => {
    for (const res of listeners) { try { res.end(); } catch { /* already gone */ } }
    listeners.clear();
    await np.stop().catch(() => {});
    await new Promise((resolve) => server.close(() => resolve(undefined)));
  };

  return { server, token, nisprog: np, close, dumps };
}
