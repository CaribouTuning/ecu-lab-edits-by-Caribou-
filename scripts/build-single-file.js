/**
 * Turns the production build (`dist/`) into ONE html file with its script, styles and fonts
 * inside it, for places that serve a single page and nothing beside it: a Claude artifact,
 * an email attachment, a file opened from a phone.
 *
 *   npm run build && node scripts/build-single-file.js [out.html]
 *
 * The page is written as the body of a document (a title, meta, styles, the app's markup and
 * its script, with no doctype, html, head or body tags), which is what an artifact host
 * wraps in a skeleton of its own. Opened as a plain file it still works: browsers build the
 * missing structure. Files the page only linked to (the manifest, the touch icon) are left
 * out, since nothing beside it would answer them.
 */

import { Buffer } from 'node:buffer';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const out = resolve(process.argv[2] ?? join(dist, 'ecu-lab.html'));

const MIME = { '.woff2': 'font/woff2', '.woff': 'font/woff', '.png': 'image/png', '.svg': 'image/svg+xml' };
const html = readFileSync(join(dist, 'index.html'), 'utf8');

/** The first capture of `re` in `html`. @param {RegExp} re */
const grab = (re) => html.match(re)?.[1] ?? '';

const title = grab(/<title>([\s\S]*?)<\/title>/);
const description = grab(/<meta\s+name="description"\s+content="([^"]*)"/);
const inlineStyles = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]);
const body = grab(/<body[^>]*>([\s\S]*?)<\/body>/).replace(/<script\b[^>]*><\/script>/g, '');

const cssHref = grab(/<link\s+rel="stylesheet"[^>]*href="([^"]+)"/);
const jsSrc = grab(/<script\s+type="module"[^>]*src="([^"]+)"/);
if (!title || !cssHref || !jsSrc) throw new Error('dist/index.html is not the build this script expects: run `npm run build` first');

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

const page = [
  `<title>${title}</title>`,
  '<meta name="color-scheme" content="dark">',
  description && `<meta name="description" content="${description}">`,
  ...inlineStyles.map((s) => `<style>${s}</style>`),
  `<style>${css}</style>`,
  body.trim(),
  `<script type="module">${js}</script>`,
].filter(Boolean).join('\n');

writeFileSync(out, page);
console.log(`wrote ${out} (${(Buffer.byteLength(page) / 1e6).toFixed(2)} MB)`);
