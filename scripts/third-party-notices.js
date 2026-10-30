/**
 * Writes THIRD-PARTY-NOTICES.md from the installed runtime dependencies: name, version,
 * licence, the copyright line from the package's own licence file, and where it comes from.
 * MIT, ISC and the SIL Open Font Licence all ask that their notice travel with the software
 * that uses them; this keeps the list true to package.json.
 *
 *   node scripts/third-party-notices.js
 */

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

const rows = Object.keys(pkg.dependencies).sort().map((name) => {
  const dir = join(root, 'node_modules', name);
  const q = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  const licenceFile = readdirSync(dir).find((f) => /^licen[cs]e/i.test(f));
  const copyright = licenceFile
    ? (readFileSync(join(dir, licenceFile), 'utf8').split('\n').find((l) => /copyright/i.test(l)) ?? '').trim() : '';
  const source = String(q.homepage ?? q.repository?.url ?? q.repository ?? '').replace(/^git\+/, '').replace(/\.git$/, '');
  return `| ${name} | ${q.version} | ${typeof q.license === 'string' ? q.license : JSON.stringify(q.license)} | ${(copyright || 'see the package').replace(/\|/g, '/')} | ${source} |`;
});

writeFileSync(join(root, 'THIRD-PARTY-NOTICES.md'), `# Third-party notices

ECU Lab is MIT licensed (see LICENSE). It ships with the open-source packages below, each
under its own licence. This file is generated from the installed packages; after changing
the dependencies, regenerate it with \`node scripts/third-party-notices.js\`.

| Package | Version | Licence | Copyright | Source |
|---|---|---|---|---|
${rows.join('\n')}

The Patrick Hand typeface (@fontsource/patrick-hand) is licensed under the SIL Open Font
Licence 1.1, which allows it to be bundled and redistributed with software provided its
licence and copyright notice travel with it. The full text is in
\`node_modules/@fontsource/patrick-hand/LICENSE\`, and in the package it comes from.
`);
console.log(`wrote THIRD-PARTY-NOTICES.md (${rows.length} packages)`);
