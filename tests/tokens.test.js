/**
 * Token contract tests.
 *
 * `tokens.js` and `tokens.css` describe the same palette in two languages, and
 * nothing but a test can stop them drifting. These also pin the one rule the whole
 * colour system rests on: the accent is never a status colour, and the one rule
 * that makes the font-size/radius/spacing additions a scale rather than a bag of
 * numbers: each step is strictly larger than the last.
 */

import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { camelToKebab, tokens } from '../src/ui/tokens.js';

const css = readFileSync(new URL('../src/ui/tokens.css', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
// The capped content column lived in EcuLab.jsx as an inline style until Task 8 moved
// it (and the nav and status strip around it) into AppShell.jsx/AppShell.module.css —
// see that file's `.content` rule. The binding this test guards moved with it.
const appShellCss = readFileSync(new URL('../src/ui/AppShell.module.css', import.meta.url), 'utf8');

/** @returns {Map<string,string>} every `--name: value` declared in tokens.css */
function parseCss() {
  const out = new Map();
  for (const m of css.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    out.set(m[1], m[2].trim());
  }
  return out;
}

describe('token contract', () => {
  it('declares every JS token as a CSS custom property with the same value', () => {
    const declared = parseCss();
    for (const [key, value] of Object.entries(tokens)) {
      const cssName = camelToKebab(key);
      expect(declared.get(cssName), `--${cssName} missing from tokens.css`).toBe(value);
    }
  });

  it('declares no CSS custom property that JS does not know about', () => {
    const known = new Set(Object.keys(tokens).map(camelToKebab));
    for (const name of parseCss().keys()) {
      expect(known.has(name), `--${name} exists in CSS but not in tokens.js`).toBe(true);
    }
  });

  it('never uses a status colour as the accent', () => {
    // The defect this whole overhaul exists to fix: when the accent IS the alarm
    // colour, a real alarm has nowhere to escalate to.
    for (const status of [tokens.ok, tokens.warn, tokens.danger]) {
      expect(tokens.acc).not.toBe(status);
      expect(tokens.accInk).not.toBe(status);
    }
  });

  it('is frozen so no screen can mutate the palette at runtime', () => {
    expect(Object.isFrozen(tokens)).toBe(true);
  });

  it('caps the content column so it cannot span an unbounded display', () => {
    // The app had no max-width anywhere: the root is 100dvh tall with unconstrained
    // width, so every container was the viewport. That is why buttons spanned the
    // screen, and why Button's `block` prop shipped with no adopters.
    expect(tokens.contentMax).toMatch(/^\d+px$/);
    expect(Number.parseInt(tokens.contentMax, 10)).toBeLessThan(1600);
  });

  it('binds the scrolling content column to --content-max, not just declares the token', () => {
    // The test above only pins the token's existence and shape — it would still pass
    // if nothing in the app ever read --content-max. This one fails if `.content` in
    // AppShell.module.css stops referencing the token, or hard-codes a pixel value
    // instead.
    expect(appShellCss).toMatch(/\.content\s*{[^}]*max-width:\s*var\(--content-max\)/);
  });
});

/** @param {string} px e.g. "10.5px" @returns {number} */
const num = (px) => Number.parseFloat(px);

/** @returns {number[]} the value of each token name, in the order given */
const ramp = (...names) => names.map((name) => num(tokens[name]));

describe('scale contract', () => {
  it('declares the font-size scale, each step larger than the last', () => {
    const steps = ramp('fsMicro', 'fsXs', 'fsSm', 'fsBase', 'fsMd', 'fsLg');
    for (const step of steps) expect(Number.isNaN(step)).toBe(false);
    for (let i = 1; i < steps.length; i += 1) {
      expect(steps[i], `${steps[i]} is not larger than ${steps[i - 1]}`).toBeGreaterThan(steps[i - 1]);
    }
  });

  it('declares the radius scale, each step larger than the last', () => {
    const steps = ramp('rXs', 'rSm', 'rMd', 'rLg');
    for (const step of steps) expect(Number.isNaN(step)).toBe(false);
    for (let i = 1; i < steps.length; i += 1) {
      expect(steps[i], `${steps[i]} is not larger than ${steps[i - 1]}`).toBeGreaterThan(steps[i - 1]);
    }
  });

  it('declares the spacing scale, each step larger than the last', () => {
    const steps = ramp('spXs', 'spSm', 'spMd', 'spLg', 'spXl', 'spXxl');
    for (const step of steps) expect(Number.isNaN(step)).toBe(false);
    for (let i = 1; i < steps.length; i += 1) {
      expect(steps[i], `${steps[i]} is not larger than ${steps[i - 1]}`).toBeGreaterThan(steps[i - 1]);
    }
  });
});

describe('pre-mount styles', () => {
  it('keeps index.html on the same palette', () => {
    // index.html is exempt from the colour guard because the pre-mount background
    // cannot wait for a stylesheet. That exemption needs this assertion, or it is
    // just a place for the palette to drift out of sight.
    expect(html).toContain(tokens.bg);
    expect(html).toContain(tokens.acc);
  });
});
