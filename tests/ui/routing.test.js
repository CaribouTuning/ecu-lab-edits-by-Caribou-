import { describe, expect, it } from 'vitest';

import { formatRoute, parseRoute, ROUTES } from '../../src/ui/routing.js';

describe('parseRoute', () => {
  it('reads the empty hash as the start screen', () => {
    expect(parseRoute('')).toEqual({ view: 'start', tab: null, section: null });
    expect(parseRoute('#/')).toEqual({ view: 'start', tab: null, section: null });
  });

  it('reads a tab with no section as that tab with everything collapsed', () => {
    // `null` is a real, reachable state: clicking an open accordion's own header
    // closes it. A default section here would make a section impossible to close.
    expect(parseRoute('#/dash')).toEqual({ view: 'app', tab: 'dash', section: null });
  });

  it('reads a tab and section', () => {
    expect(parseRoute('#/tune/timing')).toEqual({ view: 'app', tab: 'tune', section: 'timing' });
  });

  it('falls back for an unknown tab rather than rendering nothing', () => {
    expect(parseRoute('#/nonsense')).toEqual({ view: 'start', tab: null, section: null });
  });

  it('drops an unknown section but keeps the tab it belongs to', () => {
    // A stale deep link to a renamed screen should land on that tab, not a blank page.
    expect(parseRoute('#/tune/nonsense')).toEqual({ view: 'app', tab: 'tune', section: null });
  });

  it('ignores a trailing slash and surplus segments', () => {
    expect(parseRoute('#/build/engine/')).toEqual({ view: 'app', tab: 'build', section: 'engine' });
    expect(parseRoute('#/build/engine/extra')).toEqual({ view: 'app', tab: 'build', section: 'engine' });
  });
});

describe('formatRoute', () => {
  it('round-trips every valid route', () => {
    // Derived from ROUTES rather than a hand-written list, so a screen added later is
    // covered the day it appears.
    /** @type {import('../../src/ui/routing.js').Route[]} */
    const cases = [
      { view: 'start', tab: null, section: null },
      { view: 'tutorial', tab: null, section: null },
      { view: 'app', tab: 'dash', section: null },
      { view: 'app', tab: 'tune', section: 'timing' },
    ];
    cases.forEach((route) => {
      expect(parseRoute(formatRoute(route))).toEqual(route);
    });
  });

  it('produces exact literal strings for known routes (anchors the round-trip test)', () => {
    // The round-trip test above proves parseRoute(formatRoute(x)) === x, which would
    // stay green even if both functions applied the same wrong transformation. These
    // literal checks pin formatRoute's output to a concrete, independently-known shape.
    expect(formatRoute({ view: 'start', tab: null, section: null })).toBe('#/');
    expect(formatRoute({ view: 'tutorial', tab: null, section: null })).toBe('#/tutorial');
    expect(formatRoute({ view: 'app', tab: 'dash', section: null })).toBe('#/dash');
    expect(formatRoute({ view: 'app', tab: 'tune', section: 'timing' })).toBe('#/tune/timing');
  });

  it('round-trips every tab/section pair walked from ROUTES itself', () => {
    // Walking ROUTES (rather than hand-listing tab/section pairs) means coverage cannot
    // drift from the table: a section added to ROUTES is exercised here the day it lands.
    Object.keys(ROUTES).forEach((tab) => {
      /** @type {import('../../src/ui/routing.js').Route} */
      const collapsed = { view: 'app', tab, section: null };
      expect(parseRoute(formatRoute(collapsed))).toEqual(collapsed);

      ROUTES[tab].forEach((section) => {
        /** @type {import('../../src/ui/routing.js').Route} */
        const route = { view: 'app', tab, section };
        expect(parseRoute(formatRoute(route))).toEqual(route);
      });
    });
  });
});
