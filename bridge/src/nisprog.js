/**
 * Driving nisprog as a child process.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * nisprog is an interactive command-line program built on freediag. This module
 * spawns it, feeds it one command at a time, and waits for its prompt to come
 * back before sending the next.
 *
 * WHY A CHILD PROCESS AND NOT A REIMPLEMENTATION
 * The alternative is reimplementing ISO 14230 fast-init, the Nissan seed/key
 * exchange and npkern's extended SIDs in JavaScript, over a serial port, with
 * millisecond timing. nisprog and freediag already do all of that, including
 * bit-banging the wake pattern through the FTDI DTR/RTS lines. Running the
 * program that works is the right call, and it keeps GPL code in its own process
 * rather than linked into an MIT app.
 *
 * THE COST OF THAT CHOICE, STATED PLAINLY
 * We are screen-scraping a human-facing CLI. Its output format is not a stable
 * interface and can change between nisprog versions. Everything here is written
 * defensively: unknown output is passed through rather than parsed, commands time
 * out rather than hang, and the prompt pattern is configurable because the exact
 * prompt string was not something worth guessing at.
 */

import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';

import { checkCommand } from './safety.js';

/**
 * Default prompt matcher.
 *
 * Verified against nisprog v1.05 built from source: the prompt is the literal
 * `nisprog> `, printed without a trailing newline. Submenus change the leading
 * word, so this stays loose — "some word characters, then `>`, then optional
 * spaces, at the end of what we have buffered". Being too specific here means
 * every command times out on a version we did not anticipate.
 */
export const DEFAULT_PROMPT = /(^|\n)[\w .-]*>\s*$/;

export class NisprogError extends Error {}

/**
 * A running nisprog process.
 *
 * Emits:
 *  - `output` (string)  — each line nisprog prints
 *  - `exit`   ({code, signal})
 */
export class Nisprog extends EventEmitter {
  /**
   * @param {object} [options]
   * @param {string} [options.binary] path to the nisprog executable
   * @param {string[]} [options.args]
   * @param {RegExp} [options.prompt]
   * @param {number} [options.defaultTimeoutMs]
   */
  constructor(options = {}) {
    super();
    this.binary = options.binary ?? 'nisprog';
    this.args = options.args ?? [];
    this.prompt = options.prompt ?? DEFAULT_PROMPT;
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 20000;

    /** @type {import('node:child_process').ChildProcessWithoutNullStreams | null} */
    this.child = null;
    /** Output seen since the last command was sent. */
    this.buffer = '';
    /** Resolves when the current command's prompt comes back. */
    this.pending = null;
    /** Commands wait their turn; nisprog has one stdin and no request ids. */
    this.queue = Promise.resolve();
    /**
     * The command currently in flight.
     *
     * When stdin is a pipe rather than a terminal, freediag's line reader echoes
     * each command back before answering it, so the first line of every reply is
     * the command itself. Keeping it here lets that echo be stripped.
     */
    this.inFlight = null;
    this.exited = null;
  }

  /** @returns {boolean} */
  get running() {
    return this.child !== null && this.exited === null;
  }

  /**
   * Start nisprog and wait for its first prompt.
   *
   * @param {number} [timeoutMs]
   * @returns {Promise<string>} the banner it printed
   */
  start(timeoutMs = 15000) {
    if (this.child) throw new NisprogError('already started');

    this.child = spawn(this.binary, this.args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      // No shell: the command line is never interpreted, so there is nothing to
      // quote and nothing to inject.
      shell: false,
    });

    this.child.stdout.setEncoding('utf8');
    this.child.stderr.setEncoding('utf8');

    const onData = (chunk) => {
      this.buffer += chunk;
      for (const line of chunk.split('\n')) {
        if (line.trim()) this.emit('output', line.replace(/\s+$/, ''));
      }
      this.#checkPrompt();
    };
    this.child.stdout.on('data', onData);
    this.child.stderr.on('data', onData);

    this.child.on('error', (err) => {
      this.exited = { code: null, signal: null };
      const failure = new NisprogError(
        `could not start "${this.binary}": ${err.message}. Is nisprog installed and on PATH?`
      );
      if (this.pending) this.pending.reject(failure);
      this.pending = null;
      this.emit('exit', { code: null, signal: null });
    });

    this.child.on('exit', (code, signal) => {
      this.exited = { code, signal };
      if (this.pending) {
        this.pending.reject(new NisprogError(`nisprog exited (code ${code}) mid-command`));
        this.pending = null;
      }
      this.emit('exit', { code, signal });
    });

    return this.#awaitPrompt(timeoutMs);
  }

  /** Resolve the pending command if the buffer now ends in a prompt. */
  #checkPrompt() {
    if (!this.pending) return;
    if (!this.prompt.test(this.buffer)) return;

    let output = this.buffer.replace(this.prompt, '').trim();

    // Drop the echoed command, but only when it is exactly what we sent —
    // never guess, or a line of real output could be swallowed.
    if (this.inFlight) {
      if (output === this.inFlight) output = '';
      else if (output.startsWith(this.inFlight + '\n')) {
        output = output.slice(this.inFlight.length + 1);
      }
    }

    const { resolve, timer } = this.pending;
    clearTimeout(timer);
    this.pending = null;
    this.buffer = '';
    resolve(output);
  }

  /**
   * @param {number} timeoutMs
   * @returns {Promise<string>}
   */
  #awaitPrompt(timeoutMs) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending = null;
        const seen = this.buffer.trim();
        reject(
          new NisprogError(
            `timed out after ${timeoutMs} ms waiting for a prompt.` +
              (seen ? ` Last output: ${seen.slice(-300)}` : ' No output at all.')
          )
        );
      }, timeoutMs);

      this.pending = { resolve, reject, timer };
      // The prompt may already be sitting in the buffer.
      this.#checkPrompt();
    });
  }

  /**
   * Send one command and return everything it printed.
   *
   * Commands are serialised: nisprog has a single stdin and no way to correlate a
   * response with a request, so overlapping commands would interleave into
   * nonsense.
   *
   * @param {string} line
   * @param {{timeoutMs?: number, allowWrites?: boolean}} [options]
   * @returns {Promise<string>}
   */
  send(line, options = {}) {
    const verdict = checkCommand(line, options);
    if (!verdict.allowed) {
      return Promise.reject(new NisprogError(`refused: ${verdict.reason}`));
    }

    const run = async () => {
      if (!this.running) throw new NisprogError('nisprog is not running');
      this.buffer = '';
      this.inFlight = line.trim();
      const waiting = this.#awaitPrompt(options.timeoutMs ?? this.defaultTimeoutMs);
      this.child.stdin.write(line.trim() + '\n');
      return waiting;
    };

    // Chain onto the queue, and keep the queue alive when a command fails.
    const result = this.queue.then(run, run);
    this.queue = result.then(
      (value) => { this.inFlight = null; return value; },
      () => { this.inFlight = null; }
    ).then(() => undefined, () => undefined);
    return result;
  }

  /**
   * Send several commands in order, stopping at the first failure.
   *
   * @param {string[]} lines
   * @param {{timeoutMs?: number}} [options]
   * @returns {Promise<Array<{command: string, output: string}>>}
   */
  async sendAll(lines, options = {}) {
    const transcript = [];
    for (const line of lines) {
      transcript.push({ command: line, output: await this.send(line, options) });
    }
    return transcript;
  }

  /**
   * Stop nisprog.
   *
   * @returns {Promise<void>}
   */
  async stop() {
    if (!this.child || this.exited) return;
    const done = new Promise((resolve) => this.child.once('exit', () => resolve()));
    // "quit" is freediag's own exit command; fall back to a signal if the process
    // is wedged deep in a serial read and never gets to it.
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

/**
 * Pull an ECU identifier out of nisprog's connect output.
 *
 * Deliberately forgiving: it returns whatever it can find and null for what it
 * cannot, because the exact wording of these lines is not a contract. The
 * authoritative record is the raw transcript, which is always returned alongside.
 *
 * @param {string} output
 * @returns {{ecuId: string | null, keyset: string | null, partNumber: string | null}}
 */
export function parseIdentity(output) {
  const ecuId = /ecuid\s*[:=]?\s*([\w -]{4,})/i.exec(output);
  const keyset = /(?:keyset|s27k)\s*[:=]?\s*(?:0x)?([0-9a-f]{8})/i.exec(output);
  const partNumber = /\b(\d{5}[- ]?[0-9A-Z]{5})\b/.exec(output);
  return {
    ecuId: ecuId ? ecuId[1].trim() : null,
    keyset: keyset ? keyset[1].toUpperCase() : null,
    partNumber: partNumber ? partNumber[1] : null,
  };
}

/**
 * Build the connect sequence for a Nissan ECU over a dumb K-line interface.
 *
 * These are the settings from nisprog's own USING.txt, as one list so the order
 * is in one place rather than scattered through the server.
 *
 * @param {object} options
 * @param {string} options.port serial port, e.g. `\\\\.\\COM3` or `/dev/ttyUSB0`
 * @param {string} [options.iface] freediag interface name
 * @param {string} [options.dumbopts]
 * @returns {string[]}
 */
export function connectSequence({ port, iface = 'dumb', dumbopts = '0x48' }) {
  return [
    `set interface ${iface}`,
    `set port ${port}`,
    `set dumbopts ${dumbopts}`,
    'set l2protocol iso14230',
    'set initmode fast',
    'set testerid 0xfc',
    'set destaddr 0x10',
    'set addrtype phys',
    'nc',
  ];
}
