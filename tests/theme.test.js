/**
 * Theme tests.
 *
 * `T` is consumed at 500+ call sites in the UI, so a missing key is a blank screen
 * rather than a type error. These pin the whole surface, plus the two functions
 * that turn a number into a colour.
 */

import { readFileSync } from 'node:fs';
import { URL as NodeURL } from 'node:url';

import { describe, expect, it } from 'vitest';

import { tokens } from '../src/ui/tokens.js';
import { T, heat, statusColor, statusTone, utilisationColor } from '../src/ui/theme.js';

describe('T', () => {
  it('exposes every key the existing screens read', () => {
    const required = [
      'bg', 'panel', 'panel2', 'panel3', 'line', 'lineHi',
      'ink', 'inkSoft', 'ink2', 'ink3',
      'acc', 'accInk', 'accBg', 'accOn',
      'ok', 'okInk', 'okBg', 'warn', 'warnInk', 'warnBg',
      'danger', 'dangerInk', 'dangerBg',
      'okLine', 'warnLine', 'dangerLine', 'violetLine',
      'cyan', 'cyanBg', 'violet', 'violetBg', 'mono', 'sans',
    ];
    for (const key of required) {
      expect(T[key], `T.${key} is missing`).toBeTruthy();
    }
  });

  it('no longer contains the old orange anywhere', () => {
    expect(Object.values(T)).not.toContain('#ff6a2c');
    expect(Object.values(T)).not.toContain('#ffab7a');
  });
});

describe('statusColor', () => {
  it('is green at and above 90', () => {
    expect(statusColor(90)).toBe(tokens.ok);
    expect(statusColor(100)).toBe(tokens.ok);
  });

  it('is amber between 55 and 89', () => {
    expect(statusColor(55)).toBe(tokens.warn);
    expect(statusColor(89)).toBe(tokens.warn);
  });

  it('is red below 55', () => {
    expect(statusColor(54)).toBe(tokens.danger);
    expect(statusColor(0)).toBe(tokens.danger);
  });
});

describe('utilisationColor', () => {
  it('is green at and below 75', () => {
    expect(utilisationColor(0)).toBe(tokens.ok);
    expect(utilisationColor(75)).toBe(tokens.ok);
  });

  it('is amber between 76 and 90', () => {
    expect(utilisationColor(76)).toBe(tokens.warn);
    expect(utilisationColor(90)).toBe(tokens.warn);
  });

  it('is red above 90', () => {
    expect(utilisationColor(91)).toBe(tokens.danger);
    expect(utilisationColor(100)).toBe(tokens.danger);
  });
});

describe('statusTone', () => {
  it('names a tone for every band, and every name is a real token', () => {
    // This used to compare `map[statusTone(v)]` against `statusColor(v)` across a
    // spread of values. That test could not fail any more: `statusColor` is now
    // `T[statusTone(v)]`, so the comparison reduced to `T[x] === T[x]` and held for
    // any thresholds and any implementation. The property it claimed to guard —
    // that the two cannot disagree — is now true by construction, which is why the
    // restructure was worth making.
    //
    // What the restructure DID introduce is a new way to fail. `statusColor` used to
    // name `T.ok`/`T.warn`/`T.danger` directly, so renaming one broke at the
    // reference. It is now a dynamic lookup, and a rename would make `statusColor`
    // return `undefined` — a colour that silently disappears rather than an error.
    // That is what is worth pinning.
    [100, 95, 90, 89, 60, 55, 54, 20, 0].forEach((v) => {
      const tone = statusTone(v);
      expect(Object.keys(T)).toContain(tone);
      expect(typeof statusColor(v)).toBe('string');
      expect(statusColor(v)).toMatch(/^#[0-9a-f]{6}$/i);
    });
  });

  it('returns exactly the three status names', () => {
    expect(new Set([100, 60, 10].map(statusTone))).toEqual(new Set(['ok', 'warn', 'danger']));
  });
});

describe('heat', () => {
  it('returns an hsl string', () => {
    expect(heat(50, 0, 100)).toMatch(/^hsl\(/);
  });

  it('clamps out-of-range values instead of running off the scale', () => {
    expect(heat(-999, 0, 100)).toBe(heat(0, 0, 100));
    expect(heat(999, 0, 100)).toBe(heat(100, 0, 100));
  });

  it('moves monotonically from cool to warm across the range', () => {
    const hue = (v) => Number(heat(v, 0, 100).match(/hsl\((-?[\d.]+)/)[1]);
    expect(hue(0)).toBeGreaterThan(hue(50));
    expect(hue(50)).toBeGreaterThan(hue(100));
  });
});

describe('pull-log event tones', () => {
  it('derives the tone from severity instead of listing event types', () => {
    // EcuLab used to classify pull-log events with three hand-kept lists of type names.
    // They covered eleven of the twelve types `src/sim` emits — `bearing` matched none,
    // fell through to the default, and rendered in `T.cyan`, the chart-series hue. A
    // warning about accumulating bottom-end stress was drawn as decoration while
    // `pressure`, its acute sibling, was drawn red.
    //
    // It now reads `e.severity`, which every event already carries, so no type can fall
    // through and a thirteenth needs no edit here at all.
    //
    // That makes the obvious test — "every emitted type gets a non-cyan tone" — a
    // tautology: the derivation is total, so it cannot fail. I wrote that version first
    // and only caught it by breaking it. What is actually worth guarding is the
    // approach, because reverting to enumerated type names reopens the hole exactly as
    // it was.
    const source = readFileSync(new NodeURL('../src/ui/EcuLab.jsx', import.meta.url), 'utf8');
    const classification = source
      .split('\n')
      .filter((l) => /const is(Danger|Warn|Violet) =/.test(l));

    expect(classification.length).toBe(3);

    const derivesFromSeverity = classification.some((l) => /e\.severity/.test(l));
    expect(derivesFromSeverity).toBe(true);

    // `maf` is the one legitimate name check: it is a calibration observation rather
    // than damage, so it takes violet on identity, not on severity. Any OTHER type name
    // appearing here means the lists are back.
    const named = classification.flatMap((l) => [...l.matchAll(/e\.type === '([a-z]+)'/g)].map((m) => m[1]));
    expect(named).toEqual(['maf']);
  });
});
