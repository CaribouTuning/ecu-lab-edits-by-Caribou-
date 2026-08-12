/**
 * Rewrites `src/version.js` from the version in `package.json`.
 *
 * Run automatically by npm's `version` lifecycle hook, which fires after the version
 * in package.json is bumped but before the release commit is made — so the bump, the
 * source change and the tag all land in one commit. See the Releasing section of
 * CONTRIBUTING.md.
 *
 * This exists because the build version is shown in the app header and quoted in bug
 * reports. Kept by hand it silently drifts, and a published build that misreports its
 * own version makes every bug report from it untrustworthy.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

const contents = `/**
 * Build version, shown on the start screen and in the header so a tester can confirm
 * which build they are actually running.
 *
 * GENERATED — do not edit by hand. Run \`npm version <patch|minor|major>\`, which
 * rewrites this file from package.json via scripts/sync-version.js.
 */
export const BUILD_VERSION = 'v${version}';
`;

const target = join(root, 'src', 'version.js');
const before = readFileSync(target, 'utf8');

if (before === contents) {
  console.log(`src/version.js already at v${version}`);
} else {
  writeFileSync(target, contents);
  console.log(`src/version.js -> v${version}`);
}
