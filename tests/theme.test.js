/**
 * Theme tests.
 *
 * `T` is consumed at 500+ call sites in the UI, so a missing key is a blank screen
 * rather than a type error. These pin the whole surface, plus the two functions
 * that turn a number into a colour.
 */

import { describe, expect, it } from 'vitest';

import { tokens } from '../src/ui/tokens.js';
import { T, heat, statusColor, utilisationColor } from '../src/ui/theme.js';

describe('T', () => {
  it('exposes every key the existing screens read', () => {
    const required = [
      'bg', 'panel', 'panel2', 'panel3', 'line', 'lineHi',
      'ink', 'inkSoft', 'ink2', 'ink3',
      'acc', 'accInk', 'accBg', 'accOn',
      'ok', 'okInk', 'okBg', 'warn', 'warnInk', 'warnBg',
      'danger', 'dangerInk', 'dangerBg',
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
