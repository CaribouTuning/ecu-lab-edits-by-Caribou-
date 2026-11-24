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
    // After a reload the runs come back without the last result: same setup, not a change.
    expect(sandbox({ heard: true, pulled: true, fresh: false, changed: false }).text).not.toMatch(/changed/);
    expect(career({ pulled: true, fresh: false, changed: false }).text).not.toMatch(/changed/);
    expect(sandbox({ heard: true, pulled: true, fresh: true, peakHp: 251.4 })).toMatchObject({ id: 'more', go: 'build' });
    expect(sandbox({ heard: true, pulled: true, fresh: true, peakHp: 251.4 }).text).toMatch(/251 whp/);
  });

  it('keeps naming the guide\'s step through its pulls, never seeming to drop it', () => {
    // From a play test: "step 4 of 7: Safe timing", then "Start it on the stand", then "a clean
    // pull: build more", with the boost steps still to do.
    const guide = { n: 6, of: 7, title: 'First pull', go: 'dyno', checkable: false };
    expect(sandbox({ guide }).text).toMatch(/^Base map guide, step 6 of 7: First pull\. First start it on the stand/);
    expect(sandbox({ guide, heard: true }).text).toMatch(/^Base map guide, step 6 of 7: First pull\. Put it on the dyno/);
    const boost = { n: 7, of: 7, title: 'Raise the boost', go: 'boost', checkable: false };
    const six = { n: 6, of: 7, title: 'First pull', go: 'boost', checkable: false };
    expect(sandbox({ guide: six, heard: true, pulled: true, fresh: true, peakHp: 297 })).toMatchObject({ id: 'guide', go: 'tune:boost' });
    expect(sandbox({ guide: six, heard: true, pulled: true, fresh: true, peakHp: 297 }).text).toMatch(/A clean pull, 297 whp\. Base map guide, step 6 of 7/);
    // On its last step, a clean pull is the end of the guide: the bar moves on.
    expect(sandbox({ guide: boost, heard: true, pulled: true, fresh: true, peakHp: 297 }).id).toBe('more');
  });

  it('does not send a player at the dyno back to the stand to hear it first', () => {
    expect(sandbox({ atDyno: true }).go).toBe('dyno');
  });

  it('asks how to start the tune of a new build before it is started, and the Next bar says what the card offers', () => {
    const s = sandbox({ startTune: true });
    expect(s).toMatchObject({ id: 'start-tune', label: 'Start the tune', go: 'tune:airflow' });
    // The three starts by the names the card gives them.
    expect(s.text).toMatch(/safe base map.*with the guide.*tune it yourself/);
    // Chosen: on to the stand as before.
    expect(sandbox({ startTune: false }).go).toBe('live');
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

  it('builds first on an engine-building job', () => {
    expect(career({ buildJob: true }).go).toBe('build');
  });
});

describe('the shop floor marker for a step', () => {
  it('is the place the step happens', () => {
    expect(spotOf('build')).toBe('build');
    expect(spotOf('live')).toBe('stand');
    expect(spotOf('dyno')).toBe('dyno');
    expect(spotOf('ticket')).toBe('dyno');
    expect(spotOf('board')).toBe('laptop');
    expect(spotOf('tune:fuel')).toBe('laptop');
    expect(spotOf('messages')).toBe('laptop');
  });
});

describe('a failed engine', () => {
  it('comes before every other step: rebuild it on the stand', () => {
    const s = sandbox({ failed: 'spun rod bearing', heard: true, pulled: true, fresh: true });
    expect(s.id).toBe('rebuild');
    expect(s.go).toBe('live');
    expect(s.text).toContain('spun rod bearing');
  });

  it('does not stand in for choosing an engine', () => {
    expect(sandbox({ failed: 'burnt-through exhaust valve', engineMissing: true }).id).toBe('choose');
  });
});

describe('a pull being made', () => {
  it('says nothing about the pull until its log is up (it once read "a clean pull" mid-sweep)', () => {
    const s = sandbox({ heard: true, pulled: true, fresh: true, running: true, peakHp: 309, attention: [] });
    expect(s.id).toBe('pulling');
    expect(s.text).not.toMatch(/clean/);
    expect(sandbox({ heard: true, pulled: true, fresh: true, running: false, peakHp: 309, attention: [] }).id).toBe('more');
  });
});
