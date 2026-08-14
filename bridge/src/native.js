/**
 * Driving npbridge — the native helper that links nisprog's code directly.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * This is the replacement for `nisprog.js`, which drove the nisprog CLI by
 * writing to its stdin and matching its prompt. That worked, but it depended on
 * a prompt string, on stripping a command echo that only appears when stdin is a
 * pipe, and on reading English prose to decide whether a command succeeded.
 *
 * `bridge/native/npbridge.c` links against freediag and nisprog and calls their
 * command handlers directly, so every operation comes back as a structured
 * reply with a boolean. Nothing here parses prose.
 *
 * THE TWO STREAMS
 * freediag prints progress with printf and there is no intercepting that, so the
 * helper keeps stdout as the human-readable log and writes its replies to file
 * descriptor 3. This module opens that extra pipe. They cannot interleave
 * because they are different pipes — which is the whole reason for the split.
 *
 * WHY THERE IS NO ALLOWLIST HERE
 * There is nothing to allow. The helper implements a fixed set of read
 * operations and has no command dispatch: an unrecognised word is not looked up
 * anywhere, because there is no table to look it up in. Read-only stopped being
 * a check and became a property of the binary.
 */

import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';

export class NativeBridgeError extends Error {}

/** Operations the helper implements. Every one of them reads. */
export const OPERATIONS = [
  'connect', 'ecuid', 'setdev', 'guesskey', 'kernel', 'dump',
  'stopkernel', 'disconnect', 'ping', 'quit',
];

/**
 * A running npbridge process.
 *
 * Emits:
 *  - `output` (string) — each line the underlying libraries logged
 *  - `exit`   ({code, signal})
 */
export class NativeBridge extends EventEmitter {
  /**
   * @param {object} [options]
   * @param {string} [options.binary] path to the npbridge executable
   * @param {number} [options.defaultTimeoutMs]
   */
  constructor(options = {}) {
    super();
    this.binary = options.binary ?? 'npbridge';
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 20000;

    /** @type {import('node:child_process').ChildProcess | null} */
    this.child = null;
    this.exited = null;

    /** Replies arrive one JSON object per line; this holds a partial line. */
    this.replyBuffer = '';
    /** @type {Array<{resolve: Function, reject: Function, timer: any}>} */
    this.waiting = [];
    /** One operation at a time: the helper answers in order and has no request ids. */
    this.queue = Promise.resolve();
  }

  /** @returns {boolean} */
  get running() {
    return this.child !== null && this.exited === null;
  }

  /**
   * Start the helper and wait for its `start` reply.
   *
   * @param {number} [timeoutMs]
   * @returns {Promise<object>} the start reply, which carries the version
   */
  start(timeoutMs = 15000) {
    if (this.child) throw new NativeBridgeError('already started');

    this.child = spawn(this.binary, [], {
      // Four streams: stdin, stdout (log), stderr, and fd 3 for replies.
      stdio: ['pipe', 'pipe', 'pipe', 'pipe'],
      shell: false,
    });

    const log = (chunk) => {
      for (const line of String(chunk).split('\n')) {
        if (line.trim()) this.emit('output', line.replace(/\s+$/, ''));
      }
    };
    this.child.stdout.setEncoding('utf8');
    this.child.stdout.on('data', log);
    this.child.stderr.setEncoding('utf8');
    this.child.stderr.on('data', log);

    // stdio[3] is the reply pipe. It is typed as either half of a duplex pair,
    // so narrow it to the readable side we actually opened.
    const replyStream = /** @type {import('node:stream').Readable} */ (this.child.stdio[3]);
    replyStream.setEncoding('utf8');
    replyStream.on('data', (chunk) => this.#onReply(chunk));

    this.child.on('error', (err) => {
      this.exited = { code: null, signal: null };
      this.#failAll(
        new NativeBridgeError(
          `could not start "${this.binary}": ${err.message}. ` +
            'Build it with bridge/native/CMakeLists.txt, or pass --npbridge <path>.'
        )
      );
      this.emit('exit', { code: null, signal: null });
    });

    this.child.on('exit', (code, signal) => {
      this.exited = { code, signal };
      this.#failAll(new NativeBridgeError(`npbridge exited (code ${code}) mid-operation`));
      this.emit('exit', { code, signal });
    });

    return this.#await(timeoutMs);
  }

  /** @param {string} chunk */
  #onReply(chunk) {
    this.replyBuffer += chunk;

    let index;
    while ((index = this.replyBuffer.indexOf('\n')) >= 0) {
      const line = this.replyBuffer.slice(0, index).trim();
      this.replyBuffer = this.replyBuffer.slice(index + 1);
      if (!line) continue;

      let parsed;
      try {
        parsed = JSON.parse(line);
      } catch {
        // A malformed reply means the helper and this module disagree about the
        // protocol. Surface it rather than silently dropping it.
        this.#settle(new NativeBridgeError(`unparseable reply from npbridge: ${line.slice(0, 200)}`));
        continue;
      }
      this.#settle(null, parsed);
    }
  }

  /** @param {Error | null} err @param {object} [value] */
  #settle(err, value) {
    const pending = this.waiting.shift();
    if (!pending) return; // an unsolicited reply; nothing is waiting for it
    clearTimeout(pending.timer);
    if (err) pending.reject(err);
    else pending.resolve(value);
  }

  /** @param {Error} err */
  #failAll(err) {
    while (this.waiting.length) {
      const pending = this.waiting.shift();
      clearTimeout(pending.timer);
      pending.reject(err);
    }
  }

  /**
   * @param {number} timeoutMs
   * @returns {Promise<object>}
   */
  #await(timeoutMs) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        // Drop the entry so a late reply is not matched to the next request.
        const index = this.waiting.findIndex((w) => w.timer === timer);
        if (index >= 0) this.waiting.splice(index, 1);
        reject(new NativeBridgeError(`npbridge did not answer within ${timeoutMs} ms`));
      }, timeoutMs);
      this.waiting.push({ resolve, reject, timer });
    });
  }

  /**
   * Send one operation and wait for its reply.
   *
   * @param {string} op one of {@link OPERATIONS}
   * @param {Array<string|number>} [args]
   * @param {{timeoutMs?: number}} [options]
   * @returns {Promise<object>} the reply object
   */
  send(op, args = [], options = {}) {
    const parts = [op, ...args.map(String)];

    // The protocol is one line per operation and splits on whitespace, so an
    // argument containing whitespace or a newline would be read as several
    // arguments — or several operations. Refuse rather than mangle.
    for (const part of parts) {
      if (/[\s]/.test(part)) {
        return Promise.reject(
          new NativeBridgeError(
            `"${part}" contains whitespace. npbridge splits its input on whitespace, ` +
              'so paths with spaces are not supported — the same restriction nisprog itself has.'
          )
        );
      }
    }

    const run = async () => {
      if (!this.running) throw new NativeBridgeError('npbridge is not running');
      const waiting = this.#await(options.timeoutMs ?? this.defaultTimeoutMs);
      this.child.stdin.write(parts.join(' ') + '\n');
      return waiting;
    };

    const result = this.queue.then(run, run);
    this.queue = result.then(() => undefined, () => undefined);
    return result;
  }

  /**
   * Send an operation and throw unless it reports success.
   *
   * @param {string} op
   * @param {Array<string|number>} [args]
   * @param {{timeoutMs?: number}} [options]
   * @returns {Promise<object>}
   */
  async require(op, args, options) {
    const reply = await this.send(op, args, options);
    if (!reply.ok) {
      throw new NativeBridgeError(`${op} failed: ${reply.detail ?? 'no detail given'}`);
    }
    return reply;
  }

  /* ---- the operations, as methods ---- */

  /**
   * Open the K-line session.
   *
   * @param {{port: string, iface?: string, dumbopts?: string}} options
   * @returns {Promise<{connected: boolean, identity: {ecuId: string|null}, transcript?: object[]}>}
   *          `transcript` is always absent here — there is no prose to hand back.
   *          The CLI driver returns one, so the shape stays compatible.
   */
  async connectEcu({ port, iface = 'dumb', dumbopts = '0x48' }) {
    const reply = await this.require('connect', [port, iface, dumbopts], { timeoutMs: 30000 });
    return { connected: true, identity: { ecuId: reply.ecuid ?? null } };
  }

  /**
   * Declare the MCU and upload npkern.
   *
   * @param {{device: string, kernelPath: string}} options
   */
  async loadKernel({ device, kernelPath }) {
    await this.require('setdev', [device]);
    await this.require('kernel', [kernelPath], { timeoutMs: 60000 });
    return { device };
  }

  /**
   * Read memory into a file.
   *
   * @param {{file: string, start?: number, length?: number}} options
   */
  async dumpMemory({ file, start = 0, length = 0 }) {
    // A whole 1 MB ROM at 5.4 kB/s is around three minutes; allow well over that,
    // since a slow link is not a failure.
    const reply = await this.require('dump', [file, start, length], { timeoutMs: 900000 });
    // Same shape the CLI driver returns, so the server does not branch. There is
    // no prose to hand back here — that is the point — so `output` is empty.
    return { ok: true, output: reply.detail ?? '', file: reply.file ?? file };
  }

  /** Reset the ECU out of the kernel and close the session. */
  async endSession() {
    await this.send('stopkernel', [], { timeoutMs: 30000 }).catch(() => {});
    await this.send('disconnect', [], { timeoutMs: 15000 }).catch(() => {});
  }

  /** Stop the helper. */
  async stop() {
    if (!this.child || this.exited) return;
    const done = new Promise((resolve) => this.child.once('exit', () => resolve(undefined)));
    try {
      this.child.stdin.write('quit\n');
    } catch {
      // Already closed; the kill below is the real path.
    }
    const timer = setTimeout(() => this.child?.kill('SIGTERM'), 2000);
    await done;
    clearTimeout(timer);
  }
}
