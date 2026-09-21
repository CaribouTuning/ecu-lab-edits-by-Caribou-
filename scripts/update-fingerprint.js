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
 *
 * REFUSES TO RUN on a Node major that CI does not use. This is now belt-and-braces
 * rather than the load-bearing defence it was: the matrix is quantised to seven
 * SIGNIFICANT figures (see the SIG_FIGS note in tests/fingerprint.js), which absorbs the
 * ULP-scale drift in V8's transcendentals with an order of magnitude to spare, and
 * `is immune to floating-point noise` in tests/fingerprint.test.js holds that down. The
 * hash used to round to six ABSOLUTE decimals, which was well inside that drift, so one
 * untouched commit passed on 20.18.1 and 22.23.2 and failed on 26.0.0 on the same
 * machine. That was issue #48, and it is fixed.
 *
 * The guard stays because the quantiser proves a narrower thing than this guard covers.
 * The immunity test models a new V8 by perturbing Math.pow, Math.exp and Math.log; it
 * cannot speak for a genuinely different libm, a different rounding mode, or a quantity
 * that becomes unstable later. And the failure mode it protects against is expensive out
 * of proportion to the inconvenience: the documented ritual for a failing gate is "review
 * the diff, then run this", so a contributor meets what looks like "you broke the
 * physics" and is walked into rebaselining the whole behavioural gate against their own
 * toolchain.
 *
 * Override with ALLOW_ANY_NODE=1 if you are deliberately investigating that drift.
 */

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as S from '../src/sim/index.js';
import { buildFingerprint, serialiseFingerprint } from '../tests/fingerprint.js';

/** Node majors the CI matrix runs, and therefore the only ones that may write the hash. */
const CI_NODE_MAJORS = [20, 22];

const major = Number(process.versions.node.split('.')[0]);
if (!CI_NODE_MAJORS.includes(major) && process.env.ALLOW_ANY_NODE !== '1') {
  console.error(
    `\nRefusing to regenerate the fingerprint on Node ${process.versions.node}.\n\n`
    + `CI runs Node ${CI_NODE_MAJORS.join(' and ')}, and this hash is float-sensitive: a\n`
    + `baseline written here would not reproduce there, and the gate would be dead.\n\n`
    + `Use a matching runtime — \`nvm use\` reads the .nvmrc in this repo — then rerun.\n`
    + `If you are deliberately investigating cross-version drift, set ALLOW_ANY_NODE=1.\n`,
  );
  process.exit(1);
}

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
