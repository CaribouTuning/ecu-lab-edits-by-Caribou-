/**
 * Garage Bridge tests.
 *
 * The bridge lives in `bridge/` under its own licence, but its tests live here so
 * the repository has one test command and one CI job. They run against a fake
 * nisprog (`bridge/test/fake-nisprog.js`) — no serial port and no ECU involved.
 *
 * The safety tests are the important ones. "This build is read-only" is a claim,
 * and a claim about something that can damage an engine controller should be
 * backed by tests that try to break it.
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { fileURLToPath } from 'node:url';

import { checkCommand, describeAllowed, READ_ONLY_COMMANDS, WRITE_COMMANDS } from '../bridge/src/safety.js';
import { Nisprog, connectSequence, parseIdentity } from '../bridge/src/nisprog.js';
import { createBridge } from '../bridge/src/server.js';
import { BridgeClient } from '../src/bridge/client.js';
import { RomImage } from '../src/rom/index.js';

const FAKE = fileURLToPath(new URL('../bridge/test/fake-nisprog.js', import.meta.url));

/** Spawn the fake through the current node binary, so it works on every platform. */
const fakeNisprog = () =>
  new Nisprog({ binary: process.execPath, args: [FAKE], defaultTimeoutMs: 5000 });

/* ------------------------------------------------------------------ *
 * The read-only gate
 * ------------------------------------------------------------------ */

describe('the read-only gate', () => {
  it('permits the commands needed to reach a dump', () => {
    for (const command of ['nc', 'setdev 7055', 'runkernel npkern.bin', 'dm out.bin 0 0', 'gk']) {
      expect(checkCommand(command).allowed, command).toBe(true);
    }
  });

  it('refuses every command that writes to an ECU', () => {
    for (const command of ['flrom new.bin', 'flblock rom.bin 15 Y', 'writevin JN1AZ34D']) {
      const verdict = checkCommand(command);
      expect(verdict.allowed, command).toBe(false);
      expect(verdict.reason).toMatch(/read-only|not implemented/i);
    }
  });

  it('refuses source, which would hand away the whole allowlist in one call', () => {
    // freediag's `source <file>` executes commands from a file. Found by running
    // the real binary's help; it is the one bypass that matters.
    const verdict = checkCommand('source /tmp/commands.txt');
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toMatch(/bypass this allowlist/);
  });

  it('refuses freediag subsystems that can put arbitrary traffic on the bus', () => {
    for (const command of ['test 1', 'diag foo', 'vw bar', '850 baz', 'dyno x']) {
      expect(checkCommand(command).allowed, command).toBe(false);
    }
  });

  it('refuses the undocumented test command', () => {
    // `npt` runs whatever the nisprog author left in there. Unknown effects on an
    // engine controller is not a risk worth taking for a convenience.
    expect(checkCommand('npt 3').allowed).toBe(false);
  });

  it('refuses anything it does not recognise, rather than passing it through', () => {
    const verdict = checkCommand('somethingnew --force');
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toMatch(/allowlist/);
  });

  it('cannot be bypassed by smuggling a second command on a new line', () => {
    // The whole gate would be worthless if an approved command could carry an
    // unapproved one into nisprog's stdin behind it.
    for (const attack of ['nc\nflrom evil.bin', 'nc\rflrom evil.bin', 'nc\0flrom evil.bin']) {
      const verdict = checkCommand(attack);
      expect(verdict.allowed).toBe(false);
      expect(verdict.reason).toMatch(/newlines|null/);
    }
  });

  it('is not fooled by case or padding', () => {
    expect(checkCommand('  FLROM new.bin  ').allowed).toBe(false);
    expect(checkCommand('  NC  ').allowed).toBe(true);
  });

  it('refuses empty, oversized and non-string commands', () => {
    expect(checkCommand('').allowed).toBe(false);
    expect(checkCommand('   ').allowed).toBe(false);
    expect(checkCommand('dm ' + 'x'.repeat(600)).allowed).toBe(false);
    expect(checkCommand(null).allowed).toBe(false);
    expect(checkCommand(42).allowed).toBe(false);
  });

  it('keeps the allowlist and the write list disjoint', () => {
    // A command in both lists would resolve by whichever check ran first, which
    // is exactly the kind of ambiguity this gate must not have.
    for (const command of WRITE_COMMANDS.keys()) {
      expect(READ_ONLY_COMMANDS.has(command), command).toBe(false);
    }
    expect(describeAllowed().length).toBe(READ_ONLY_COMMANDS.size);
  });
});

/* ------------------------------------------------------------------ *
 * Driving the process
 * ------------------------------------------------------------------ */

describe('the nisprog driver', () => {
  /** @type {Nisprog | null} */
  let np = null;
  afterEach(async () => { if (np) await np.stop(); np = null; });

  it('starts, reads the banner and answers a command', async () => {
    np = fakeNisprog();
    const banner = await np.start();
    expect(banner).toMatch(/test double/);

    const output = await np.send('nc');
    expect(output).toMatch(/Connected to ECU/);
    expect(output).toMatch(/23710 CD000/);
  });

  it('serialises overlapping commands instead of interleaving them', async () => {
    np = fakeNisprog();
    await np.start();
    // nisprog has one stdin and no request ids, so these must not overlap.
    const [a, b, c] = await Promise.all([
      np.send('setdev 7055'),
      np.send('gk'),
      np.send('npconf p3 0'),
    ]);
    expect(a).toMatch(/setdev 7055/);
    expect(b).toMatch(/gk/);
    expect(c).toMatch(/npconf p3 0/);
  });

  it('keeps working after a refused command', async () => {
    np = fakeNisprog();
    await np.start();
    await expect(np.send('flrom evil.bin')).rejects.toThrow(/read-only/);
    // A rejection must not wedge the queue.
    expect(await np.send('nc')).toMatch(/Connected/);
  });

  it('never writes a refused command to the process', async () => {
    np = fakeNisprog();
    await np.start();
    const seen = [];
    np.on('output', (line) => seen.push(line));
    await expect(np.send('writevin ABC')).rejects.toThrow();
    expect(seen.join('\n')).not.toMatch(/writevin/);
  });

  it('strips the command echo freediag prints when stdin is a pipe', async () => {
    np = fakeNisprog();
    await np.start();
    const output = await np.send('setdev 7055');
    // The reply must be the answer, not the question repeated back.
    expect(output.startsWith('setdev 7055')).toBe(false);
    expect(output).toMatch(/^ok: setdev 7055/);
  });

  it('times out rather than hanging when no prompt comes back', async () => {
    np = new Nisprog({
      binary: process.execPath,
      args: [FAKE],
      defaultTimeoutMs: 300,
    });
    // FAKE_SLOW makes the double never print a prompt. It has to be set before
    // start() spawns the child, which inherits the environment.
    process.env.FAKE_SLOW = '1';
    try {
      await expect(np.start(300)).rejects.toThrow(/timed out/);
    } finally {
      delete process.env.FAKE_SLOW;
    }
  });

  it('refuses to start with -f, which would run commands before the gate sees them', () => {
    // `nisprog -f <file>` executes a whole command file at startup. Allowing it
    // would make the allowlist decorative.
    expect(() => new Nisprog({ binary: 'nisprog', args: ['-f', 'commands.txt'] }))
      .toThrow(/bypassing the read-only gate/);
    expect(() => new Nisprog({ binary: 'nisprog', args: ['+f', 'commands.txt'] }))
      .toThrow(/bypassing the read-only gate/);
    // Ordinary arguments are still fine.
    expect(() => new Nisprog({ binary: 'nisprog', args: ['-h'] })).not.toThrow();
  });

  it('reports a missing binary as a useful message', async () => {
    np = new Nisprog({ binary: '/nonexistent/nisprog', defaultTimeoutMs: 500 });
    await expect(np.start(1500)).rejects.toThrow(/could not start|timed out/);
  });
});

describe('output parsing', () => {
  it('pulls identity out of connect output without insisting on a format', () => {
    const identity = parseIdentity('Connected to ECU\nECUID: 23710 CD000\nkeyset: 0x1C07CD33');
    expect(identity.ecuId).toMatch(/23710/);
    expect(identity.keyset).toBe('1C07CD33');
    expect(identity.partNumber).toBe('23710 CD000');
  });

  it('returns nulls rather than guessing when the output says nothing', () => {
    expect(parseIdentity('some unrelated text')).toEqual({
      ecuId: null, keyset: null, partNumber: null,
    });
  });

  it('builds the documented connect sequence, ending in the connect command', () => {
    const sequence = connectSequence({ port: '/dev/ttyUSB0' });
    expect(sequence[0]).toBe('set interface dumb');
    expect(sequence).toContain('set port /dev/ttyUSB0');
    expect(sequence).toContain('set l2protocol iso14230');
    expect(sequence.at(-1)).toBe('nc');
    // Every step has to survive the gate, or connecting would refuse itself.
    for (const step of sequence) expect(checkCommand(step).allowed, step).toBe(true);
  });
});

/* ------------------------------------------------------------------ *
 * The HTTP API
 * ------------------------------------------------------------------ */

describe('the bridge server', () => {
  let bridge = null;
  let base = '';

  beforeEach(async () => {
    bridge = createBridge({ nisprog: fakeNisprog(), token: 'test-token' });
    await new Promise((resolve) => bridge.server.listen(0, '127.0.0.1', resolve));
    const address = bridge.server.address();
    base = `http://127.0.0.1:${typeof address === 'object' ? address.port : address}`;
  });
  afterEach(async () => { if (bridge) await bridge.close(); bridge = null; });

  const call = (path, options = {}) =>
    fetch(base + path, {
      ...options,
      headers: { 'content-type': 'application/json', 'x-bridge-token': 'test-token', ...options.headers },
    });

  it('refuses a request with no token', async () => {
    const res = await fetch(base + '/status');
    expect(res.status).toBe(401);
  });

  it('refuses a request with the wrong token', async () => {
    const res = await fetch(base + '/status', { headers: { 'x-bridge-token': 'nope' } });
    expect(res.status).toBe(401);
  });

  it('refuses a browser origin that is not localhost', async () => {
    // The attack this blocks: any page you happen to be visiting probing for a
    // local server that can command your ECU.
    const res = await fetch(base + '/status', {
      headers: { 'x-bridge-token': 'test-token', origin: 'https://evil.example.com' },
    });
    expect(res.status).toBe(403);
  });

  it('allows a localhost origin', async () => {
    const res = await fetch(base + '/status', {
      headers: { 'x-bridge-token': 'test-token', origin: 'http://localhost:5173' },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
  });

  it('announces itself as read-only and lists what it will run', async () => {
    const body = await (await call('/status')).json();
    expect(body.readOnly).toBe(true);
    expect(body.allowedCommands.map((c) => c.command)).toContain('dm');
    expect(body.allowedCommands.map((c) => c.command)).not.toContain('flrom');
    expect(body.runkernelNote).toMatch(/does not touch flash/);
  });

  it('connects and reports the ECU identity', async () => {
    const res = await call('/connect', {
      method: 'POST',
      body: JSON.stringify({ port: '/dev/ttyUSB0' }),
    });
    const body = await res.json();
    expect(body.connected).toBe(true);
    expect(body.identity.partNumber).toBe('23710 CD000');
  });

  it('requires a port to connect', async () => {
    const res = await call('/connect', { method: 'POST', body: JSON.stringify({}) });
    expect(res.status).toBe(400);
  });

  it('dumps memory and serves the bytes back with a matching hash', async () => {
    await call('/connect', { method: 'POST', body: JSON.stringify({ port: '/dev/ttyUSB0' }) });

    const dump = await (await call('/dump', {
      method: 'POST',
      body: JSON.stringify({ start: 0, length: 256 }),
    })).json();

    expect(dump.size).toBe(256);
    expect(dump.sha256).toMatch(/^[0-9a-f]{64}$/);

    const bytesRes = await call(`/dump/${dump.id}`);
    const bytes = new Uint8Array(await bytesRes.arrayBuffer());
    expect(bytes).toHaveLength(256);
    // The fake writes a known pattern; this proves the file survived the round trip.
    expect(bytes[3]).toBe(9);
    expect(bytesRes.headers.get('x-dump-sha256')).toBe(dump.sha256);
  });

  it('404s an unknown dump id rather than serving something else', async () => {
    expect((await call('/dump/deadbeef')).status).toBe(404);
  });

  it('refuses a write command sent through the passthrough route', async () => {
    await call('/connect', { method: 'POST', body: JSON.stringify({ port: '/dev/ttyUSB0' }) });
    const res = await call('/command', {
      method: 'POST',
      body: JSON.stringify({ command: 'flrom hacked.bin' }),
    });
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/read-only/);
  });

  it('rejects a malformed body instead of crashing', async () => {
    const res = await call('/connect', { method: 'POST', body: '{not json' });
    expect(res.status).toBe(500);
  });

  it('404s an unknown route', async () => {
    expect((await call('/nope')).status).toBe(404);
  });

  /* ---------------------------------------------------------------- *
   * End to end: client -> bridge -> fake nisprog -> RomImage
   * ---------------------------------------------------------------- */

  it('carries a dump from the client all the way into a RomImage', async () => {
    const client = new BridgeClient({ url: base, token: 'test-token' });

    const status = await client.status();
    expect(status.readOnly).toBe(true);

    const connected = await client.connect({ port: '/dev/ttyUSB0' });
    expect(connected.identity.partNumber).toBe('23710 CD000');

    const dump = await client.dump({ start: 0, length: 4096 });
    const bytes = await client.fetchDump(dump.id, dump.sha256);
    expect(bytes).toHaveLength(4096);

    // The point of the whole exercise: bytes off the ECU become an editable image.
    const image = new RomImage(bytes);
    expect(image.size).toBe(4096);
    expect(image.changedBytes()).toEqual([]);
  });

  it('tells the user plainly when the token is wrong', async () => {
    const client = new BridgeClient({ url: base, token: 'wrong' });
    await expect(client.status()).rejects.toThrow(/rejected the token/);
  });

  it('tells the user plainly when the bridge is not running', async () => {
    const client = new BridgeClient({ url: 'http://127.0.0.1:1', token: 'test-token' });
    await expect(client.status()).rejects.toThrow(/could not reach the bridge/);
  });

  it('surfaces a refused write command as the bridge worded it', async () => {
    const client = new BridgeClient({ url: base, token: 'test-token' });
    await client.connect({ port: '/dev/ttyUSB0' });
    await expect(client.command('flrom evil.bin')).rejects.toThrow(/read-only/);
  });

  it('refuses a dump whose hash does not match what was reported', async () => {
    const client = new BridgeClient({ url: base, token: 'test-token' });
    await client.connect({ port: '/dev/ttyUSB0' });
    const dump = await client.dump({ start: 0, length: 128 });
    await expect(client.fetchDump(dump.id, 'a'.repeat(64))).rejects.toThrow(/do not trust this image/);
  });
});
