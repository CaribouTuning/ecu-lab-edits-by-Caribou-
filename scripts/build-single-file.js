/**
 * Builds the game as ONE html file with its script, styles and fonts inside it, for places that
 * serve a single page and nothing beside it: a Claude artifact, an email attachment, a file
 * opened from a phone.
 *   node scripts/build-single-file.js [out.html]
 *
 * Its own build, into dist-single/: the app's build splits its code into chunks, fetches
 * three.js only when a 3D view draws and runs the simulator worker from its own file, none of
 * which a single page can do. Here everything is one script and the worker rides inside it.
 */

import { Buffer } from 'node:buffer';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { build } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist-single');
const out = resolve(process.argv[2] ?? join(dist, 'ecu-lab.html'));

/** The simulator worker carried inside the script as a blob, not fetched from beside it. */
const inlineWorker = {
  name: 'single-file-worker',
  enforce: /** @type {const} */ ('pre'),
  /** @param {string} code @param {string} id */
  transform(code, id) {
    return id.endsWith('/src/ui/sim/warm.js') ? code.replace("./simWorker.js?worker'", "./simWorker.js?worker&inline'") : null;
  },
};
await build({
  root, configFile: false, base: './', logLevel: 'warn',
  plugins: [react(), inlineWorker],
  build: { outDir: dist, emptyOutDir: true, sourcemap: false, chunkSizeWarningLimit: 4096, rollupOptions: { output: { inlineDynamicImports: true } } },
});

const MIME = { '.woff2': 'font/woff2', '.woff': 'font/woff', '.png': 'image/png', '.svg': 'image/svg+xml' };
const html = readFileSync(join(dist, 'index.html'), 'utf8');

/** The first capture of `re` in `html`. @param {RegExp} re */
const grab = (re) => html.match(re)?.[1] ?? '';

const title = grab(/<title>([\s\S]*?)<\/title>/);
const description = grab(/<meta\s+name="description"\s+content="([^"]*)"/);
const viewport = grab(/<meta\s+name="viewport"\s+content="([^"]*)"/);
const inlineStyles = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]);
const body = grab(/<body[^>]*>([\s\S]*?)<\/body>/).replace(/<script\b[^>]*><\/script>/g, '');

const cssHref = grab(/<link\s+rel="stylesheet"[^>]*href="([^"]+)"/);
const jsSrc = grab(/<script\s+type="module"[^>]*src="([^"]+)"/);
if (!title || !cssHref || !jsSrc) throw new Error('dist-single/index.html is not the build this script expects');

const cssFile = join(dist, cssHref);
const css = readFileSync(cssFile, 'utf8').replace(/url\(\s*["']?([^"')]+)["']?\s*\)/g, (whole, ref) => {
  if (/^(data:|https?:|#)/.test(ref)) return whole;
  const type = MIME[extname(ref)];
  if (!type) return whole;
  return `url(data:${type};base64,${readFileSync(join(dirname(cssFile), ref)).toString('base64')})`;
});

// A script inside a page ends at the first "</script" and treats "<!--" specially; both are
// the same string with a backslash in front of one character.
const js = readFileSync(join(dist, jsSrc), 'utf8')
  .replace(/<\/script/gi, '<\\/script')
  .replace(/<!--/g, '<\\!--');

// The charset at the top, inside the first 1024 bytes where a browser looks for it: opened as a
// plain file with none, Chromium guessed Latin-1 and printed "99.0 Ã— 92.0" for "99.0 × 92.0".
const page = [
  // Standards mode: without a doctype a browser opening the file lays it out in quirks mode
  // (another box model, percentage heights against nothing), so the page a phone opens as a
  // file was not the page the app is. A host that wraps the page in its own document ignores
  // a doctype inside it.
  '<!doctype html>',
  '<meta charset="utf-8">',
  `<title>${title}</title>`,
  // Without the viewport a phone lays the page out 980 px wide and shrinks it to fit.
  viewport && `<meta name="viewport" content="${viewport}">`,
  '<meta name="color-scheme" content="dark">',
  description && `<meta name="description" content="${description}">`,
  ...inlineStyles.map((s) => `<style>${s}</style>`),
  `<style>${css}</style>`,
  body.trim(),
  `<script type="module">${js}</script>`,
].filter(Boolean).join('\n');

writeFileSync(out, page);
console.log(`wrote ${out} (${(Buffer.byteLength(page) / 1e6).toFixed(2)} MB)`);
