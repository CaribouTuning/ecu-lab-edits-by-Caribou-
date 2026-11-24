/**
 * The simulator runs anywhere the same: the browser, a worker, the Discord bot on Vercel, and
 * one day a server that re-runs a submitted pull to check it before it goes on a leaderboard
 * (docs/scaling-and-leaderboard.md). That only holds while src/sim reaches nothing outside
 * itself and nothing that differs from one run to the next. These keep it so.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const SIM = fileURLToPath(new URL('../src/sim/', import.meta.url));
const files = readdirSync(SIM, { recursive: true, withFileTypes: true })
  .filter((e) => e.isFile() && e.name.endsWith('.js'))
  .map((e) => join(e.parentPath ?? e.path, e.name));
/** A file's code with its comments blanked, so prose that names `window` is not a hit. */
const code = (f) => readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

describe('the simulator is portable', () => {
  it('imports only its own modules: no UI, no packages', () => {
    const outside = [];
    for (const f of files) {
      for (const m of code(f).matchAll(/\bfrom\s+['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)) {
        const spec = m[1] ?? m[2];
        const target = spec.startsWith('.') ? join(f, '..', spec) : spec;
        if (!target.startsWith(SIM)) outside.push(`${relative(SIM, f)} → ${spec}`);
      }
    }
    expect(outside).toEqual([]);
  });

  it('touches no browser, no network and no clock', () => {
    const hits = [];
    // As code is written, not as words: the pull log speaks of a rev window and a nitrous window.
    const banned = /\b(?:window|document|navigator|localStorage|sessionStorage|indexedDB)\s*[.[]|\bfetch\s*\(|\bnew\s+(?:XMLHttpRequest|WebSocket)\b|\b(?:Date|performance)\.now\s*\(|\bnew\s+Date\s*\(/;
    // Strings blanked too: help text is prose ("burbles as it falls through the window.").
    const noStrings = (src) => src.replace(/'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\.|[^`\\])*`/g, "''");
    for (const f of files) {
      noStrings(code(f)).split('\n').forEach((line, i) => { if (banned.test(line)) hits.push(`${relative(SIM, f)}:${i + 1} ${line.trim().slice(0, 80)}`); });
    }
    expect(hits).toEqual([]);
  });

  it('draws random numbers only from the live engine\'s own seeded generator', () => {
    const hits = [];
    for (const f of files) {
      code(f).split('\n').forEach((line, i) => {
        // liveCore.js: `liveRandom` falls back to Math.random only when no state carries a seed.
        if (/Math\.random/.test(line) && !(relative(SIM, f) === 'liveCore.js' && /if \(!s\) return Math\.random\(\)/.test(line))) hits.push(`${relative(SIM, f)}:${i + 1}`);
      });
    }
    expect(hits).toEqual([]);
  });
});
