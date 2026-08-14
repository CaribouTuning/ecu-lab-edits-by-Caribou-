/**
 * Talking to Garage Bridge.
 *
 * This file is MIT, like the rest of the app. It contains no GPL code and
 * imports nothing from `bridge/` — it speaks the bridge's HTTP API over a
 * socket, which is the whole point of the bridge being a separate program.
 *
 * The bridge is read-only by construction, so there is nothing here that can
 * write to an ECU. If that changes, it changes on the bridge side first, behind
 * its own gate.
 */

/** Where the bridge listens by default. */
export const DEFAULT_BRIDGE_URL = 'http://127.0.0.1:8347';

export class BridgeError extends Error {}

export class BridgeClient {
  /**
   * @param {object} [options]
   * @param {string} [options.url]
   * @param {string} [options.token] printed by the bridge at startup
   * @param {typeof fetch} [options.fetch] injectable for tests
   */
  constructor(options = {}) {
    this.url = (options.url ?? DEFAULT_BRIDGE_URL).replace(/\/$/, '');
    this.token = options.token ?? '';
    this.fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  /**
   * @param {string} path
   * @param {object} [init]
   * @returns {Promise<Response>}
   */
  async #call(path, init = {}) {
    let response;
    try {
      response = await this.fetch(this.url + path, {
        ...init,
        headers: {
          'content-type': 'application/json',
          'x-bridge-token': this.token,
          ...init.headers,
        },
      });
    } catch (err) {
      // A connection refused here almost always means the bridge is not running,
      // which is worth saying plainly rather than surfacing a network error.
      throw new BridgeError(
        `could not reach the bridge at ${this.url}. Is it running? (${err instanceof Error ? err.message : err})`
      );
    }

    if (response.status === 401) {
      throw new BridgeError('the bridge rejected the token. Copy the one it printed at startup.');
    }
    if (!response.ok) {
      let detail = `HTTP ${response.status}`;
      try {
        const body = await response.json();
        if (body?.error) detail = body.error;
      } catch {
        // Not JSON; the status alone will have to do.
      }
      throw new BridgeError(detail);
    }
    return response;
  }

  /** @param {string} path @param {object} [body] */
  async #post(path, body) {
    const res = await this.#call(path, { method: 'POST', body: JSON.stringify(body ?? {}) });
    return res.json();
  }

  /**
   * What the bridge is and what it will run.
   *
   * @returns {Promise<object>}
   */
  async status() {
    return (await this.#call('/status')).json();
  }

  /**
   * Open the K-line session.
   *
   * @param {{port: string, iface?: string, dumbopts?: string}} options
   * @returns {Promise<{connected: boolean, identity: object, transcript: object[]}>}
   */
  async connect(options) {
    return this.#post('/connect', options);
  }

  /**
   * Upload npkern, so a full read takes ninety seconds instead of ninety minutes.
   *
   * @param {{device: string, kernelPath: string}} options
   */
  async loadKernel(options) {
    return this.#post('/kernel', options);
  }

  /**
   * Read memory. `{start: 0, length: 0}` means the whole ROM.
   *
   * @param {{start?: number, length?: number}} [options]
   * @returns {Promise<{id: string, size: number, sha256: string, output: string}>}
   */
  async dump(options = {}) {
    return this.#post('/dump', options);
  }

  /**
   * Fetch a completed dump's bytes.
   *
   * The hash is checked against what the bridge reported. A dump that arrives
   * corrupted and is then edited and flashed is the worst outcome this whole
   * project has, so it is worth one comparison.
   *
   * @param {string} id
   * @param {string} [expectedSha256]
   * @returns {Promise<Uint8Array>}
   */
  async fetchDump(id, expectedSha256) {
    const res = await this.#call(`/dump/${id}`);
    const bytes = new Uint8Array(await res.arrayBuffer());

    const reported = res.headers.get('x-dump-sha256');
    if (expectedSha256 && reported && reported !== expectedSha256) {
      throw new BridgeError(
        'the dump changed between being read and being fetched — do not trust this image'
      );
    }
    return bytes;
  }

  /** End the session and stop nisprog. */
  async disconnect() {
    return this.#post('/disconnect');
  }

  /**
   * Send one command straight through. Still allowlisted on the bridge side.
   *
   * @param {string} command
   * @returns {Promise<{output: string}>}
   */
  async command(command) {
    return this.#post('/command', { command });
  }

  /**
   * Subscribe to nisprog's output.
   *
   * Returns a function that unsubscribes, or null when the environment has no
   * EventSource (Node, and the tests).
   *
   * @param {(line: string) => void} onLine
   * @returns {(() => void) | null}
   */
  streamOutput(onLine) {
    const Source = globalThis.EventSource;
    if (!Source) return null;

    // EventSource cannot set headers, so the token goes in the query string. It
    // never leaves this machine — the bridge only listens on the loopback.
    const source = new Source(`${this.url}/events?token=${encodeURIComponent(this.token)}`);
    source.addEventListener('output', (event) => {
      try { onLine(JSON.parse(event.data).line); } catch { /* ignore a malformed frame */ }
    });
    return () => source.close();
  }
}
