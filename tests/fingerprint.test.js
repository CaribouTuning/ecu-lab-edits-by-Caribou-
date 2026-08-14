/**
 * The behavioural regression gate.
 *
 * If this fails, the simulation now produces different numbers than the committed
 * baseline. See the header of `fingerprint.js` for what to do about it. The short
 * version: work out whether you meant to change the physics. If you did, review the
 * diff and run `npm run test:fingerprint:update`. If you did not, you have a bug.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import * as S from '../src/sim/index.js';
import { buildFingerprint, serialiseFingerprint } from './fingerprint.js';

const here = dirname(fileURLToPath(import.meta.url));
const expected = readFileSync(join(here, 'fixtures', 'fingerprint.sha256'), 'utf8').trim();

describe('simulation fingerprint', () => {
  it('matches the committed baseline', () => {
    const serialised = serialiseFingerprint(buildFingerprint(S));
    const actual = createHash('sha256').update(serialised).digest('hex');

    expect(
      actual,
      'The simulation produced different numbers than the committed fingerprint.\n'
      + 'If this change was intentional, review it and run:\n'
      + '  npm run test:fingerprint:update\n'
      + 'To see exactly what moved, run it with --report on both revisions and diff\n'
      + 'the resulting fingerprint.report.json files.',
    ).toBe(expected);
  });

  it('is deterministic across runs', () => {
    // The sweep and point layers must contain no randomness — only the live engine's
    // simulated sensors are allowed to be noisy, and those are excluded above.
    const a = serialiseFingerprint(buildFingerprint(S));
    const b = serialiseFingerprint(buildFingerprint(S));
    expect(a).toBe(b);
  });

  it('produces no NaN or Infinity anywhere in the matrix', () => {
    const serialised = serialiseFingerprint(buildFingerprint(S));
    // JSON.stringify turns NaN and Infinity into null, so a null in a numeric slot is
    // the signature of a physics blow-up. Legitimate absent readings (e.g. bsfc when
    // the engine makes no power) are remapped to the string "n/a" in roundAll, so a
    // bare `null` surviving to here still means only one thing: a blow-up.
    expect(serialised).not.toMatch(/NaN|Infinity/);
    expect(serialised.match(/: null/g) ?? []).toHaveLength(0);
  });
});
