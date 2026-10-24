/**
 * The game's flow (src/ui/flow.js): one next step, worked out from what is true now.
 */

import { describe, expect, it } from 'vitest';

import { nextStep, spotOf } from '../../src/ui/flow.js';

/** @param {Partial<import('../../src/ui/flow.js').FlowFacts>} f */
const sandbox = (f) => nextStep({ mode: 'sandbox', engineMissing: false, heard: false, pulled: false, fresh: false, attention: [], ...f });
/** @param {Partial<import('../../src/ui/flow.js').FlowFacts>} f */
const career = (f) => nextStep({ mode: 'career', engineMissing: false, heard: false, pulled: false, fresh: false, attention: [], working: true, unread: 0, ...f });
const fault = [{ page: 'spark', label: 'Spark', count: 3 }];

describe('SANDBOX, step by step', () => {
  it('walks build, hear, pull, fix, pull again', () => {
    expect(sandbox({ engineMissing: true }).go).toBe('build');
    expect(sandbox({}).go).toBe('live');
    expect(sandbox({ heard: true }).go).toBe('dyno');
    expect(sandbox({ heard: true, pulled: true, fresh: true, attention: fault })).toMatchObject({ go: 'tune:spark', label: 'Spark' });
    // The fix changed the tune, so the pull is no longer of this setup: pull again.
    expect(sandbox({ heard: true, pulled: true, fresh: false }).text).toMatch(/again/);
    expect(sandbox({ heard: true, pulled: true, fresh: true, peakHp: 251.4 })).toMatchObject({ id: 'more', go: 'build' });
    expect(sandbox({ heard: true, pulled: true, fresh: true, peakHp: 251.4 }).text).toMatch(/251 whp/);
  });

  it('does not send a player at the dyno back to the stand to hear it first', () => {
    expect(sandbox({ atDyno: true }).go).toBe('dyno');
  });

  it('does not ask to hear an engine again once it has a fresh pull', () => {
    expect(sandbox({ heard: false, pulled: true, fresh: true }).id).toBe('more');
  });
});

describe('CAREER, step by step', () => {
  it('starts at the job board, or at Pops\'s message', () => {
    expect(career({ working: false }).go).toBe('board');
    expect(career({ working: false, unread: 2, newShop: true })).toMatchObject({ go: 'messages' });
    expect(career({ working: false, unread: 2, newShop: true }).text).toMatch(/2 messages.*Read them/);
    // After the first job a day's tip does not stand between the player and the next car.
    expect(career({ working: false, unread: 1 }).go).toBe('board');
  });

  it('walks pull, fix, pull again, hand back', () => {
    expect(career({}).go).toBe('dyno');
    expect(career({ pulled: true, fresh: true, attention: fault }).go).toBe('tune:spark');
    expect(career({ pulled: true, fresh: false }).text).toMatch(/again/);
    expect(career({ pulled: true, fresh: true }).go).toBe('ticket');
  });

  it('road tests without a dyno, and builds first on an engine-building job', () => {
    expect(career({ roadTest: true })).toMatchObject({ go: 'dyno', label: 'Road test' });
    expect(career({ buildJob: true }).go).toBe('build');
  });

  it('sends a clean pull on your own car back to the stand, not to a ticket', () => {
    expect(career({ own: true, pulled: true, fresh: true }).go).toBe('build');
  });
});

describe('the shop floor marker for a step', () => {
  it('is the place the step happens', () => {
    expect(spotOf('build')).toBe('build');
    expect(spotOf('live')).toBe('stand');
    expect(spotOf('dyno')).toBe('dyno');
    expect(spotOf('ticket')).toBe('dyno');
    expect(spotOf('board')).toBe('board');
    expect(spotOf('tune:fuel')).toBe('laptop');
    expect(spotOf('messages')).toBe('laptop');
  });
});
