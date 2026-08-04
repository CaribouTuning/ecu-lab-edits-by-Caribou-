#!/usr/bin/env node
/**
 * Regenerates the committed behavioural fingerprint hash.
 *
 * Run this ONLY when you have deliberately changed the physics and have satisfied
 * yourself the new numbers are correct:
 *
 *   npm run test:fingerprint:update
 *
 * Then explain the change in your pull request. Reviewers should be able to read
 * why the dyno numbers moved without re-deriving it themselves.
 *
 * Pass --report to also write a full JSON dump to `fingerprint.report.json`
 * (gitignored) so you can diff two runs cell by cell.
 */

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as S from '../src/sim/index.js';
import { buildFingerprint, serialiseFingerprint } from '../tests/fingerprint.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixture = join(root, 'tests', 'fixtures', 'fingerprint.sha256');

const serialised = serialiseFingerprint(buildFingerprint(S));
const hash = createHash('sha256').update(serialised).digest('hex');

mkdirSync(dirname(fixture), { recursive: true });
writeFileSync(fixture, `${hash}\n`);

if (process.argv.includes('--report')) {
  const report = join(root, 'fingerprint.report.json');
  writeFileSync(report, serialised);
  console.log(`wrote ${report} (${(serialised.length / 1e6).toFixed(1)} MB)`);
}

console.log(`fingerprint updated: ${hash}`);
