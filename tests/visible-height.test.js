import { describe, expect, it } from 'vitest';

import { coveredFoot } from '../src/ui/visibleHeight.js';

// An iPhone 13 (390 × 844 pt), the frame under the Claude app's header as a player's screenshot showed it.
const phone = { embedded: true, ios: true, screenW: 390, screenH: 844, upright: true };

describe('the foot an iPhone host covers', () => {
  it('keeps the home indicator clear in a frame that runs to the screen\'s foot', () => {
    expect(coveredFoot({ ...phone, visibleH: 741 })).toBe(34);
    expect(coveredFoot({ ...phone, upright: false, visibleH: 340 })).toBe(21);
  });
  it('leaves everything else alone', () => {
    expect(coveredFoot({ ...phone, embedded: false, visibleH: 844 })).toBe(0); // its own tab: env() handles it
    expect(coveredFoot({ ...phone, ios: false, visibleH: 741 })).toBe(0);
    expect(coveredFoot({ ...phone, screenW: 375, screenH: 667, visibleH: 560 })).toBe(0); // a home button
    expect(coveredFoot({ ...phone, visibleH: 600 })).toBe(0); // ends above a host toolbar
  });
});
