/**
 * The run log — pure, no DOM.
 *
 * Every test here names the mutation it exists to catch. PR 4a shipped seven suites
 * that each passed against a broken implementation, always in one of five shapes; the
 * two that bite hardest here are "asserts a count but not which end" (a FIFO undo
 * stack passed 871 tests) and "pins one side of a pair". Both are held below by
 * asserting the surviving IDS, not the surviving length.
 */

import { describe, expect, it } from 'vitest';

import { RUN_LIMIT, ghostLabel, ghostRun, makeRunRecord, pushRun, sparklinePath } from '../../../src/ui/state/runLog.js';

/** A minimal sweep result, shaped like `simulateSweep`'s output. */
function fakeResult({ peakHp = 300, peakTq = 280, knocks = 0 } = {}) {
  return {
    peakHp,
    peakTq,
    points: [
      { rpm: 1500, hp: 100, torque: 200, afr: 12.5, timing: 20 },
      { rpm: 1600, hp: 120, torque: 210, afr: 12.4, timing: 21 },
      { rpm: 1700, hp: 140, torque: 220, afr: 12.3, timing: 22 },
    ],
    events: [
      ...Array.from({ length: knocks }, () => ({ type: 'knock', severity: 3 })),
      { type: 'lean', severity: 2 },
    ],
  };
}

/** A run record with a caller-chosen id, so ordering assertions can name it. */
function run(id, over = {}) {
  return makeRunRecord({
    id, n: Number(id), at: 1000 + Number(id), label: 'VQ35DE',
    result: fakeResult(over.result ?? {}),
    scores: { tuning: { score: 80 }, engineer: { score: 70 } },
    pullScore: 640,
    inputs: { build: {}, tune: {}, loadKpa: 100 },
  });
}

describe('makeRunRecord', () => {
  it('keeps only rpm, hp and torque from each point', () => {
    // Mutation caught: storing `result.points` whole. That is 50 fields per point
    // against 3 — a 20x storage cost, which is the reason the record is slim at all.
    const r = run('1');
    expect(r.points).toEqual([
      { rpm: 1500, hp: 100, torque: 200 },
      { rpm: 1600, hp: 120, torque: 210 },
      { rpm: 1700, hp: 140, torque: 220 },
    ]);
  });

  it('counts knock events only, not every event', () => {
    // Mutation caught: `result.events.length`. The fixture always carries one 'lean'
    // event, so a total-count implementation reads 3 where the answer is 2.
    expect(run('1', { result: { knocks: 2 } }).knocks).toBe(2);
  });

  it('reduces each score object to its number', () => {
    // Mutation caught: storing the score OBJECTS, which carry `deductions` arrays and
    // would roughly double the record.
    expect(run('1').scores).toEqual({ tuning: 80, engineer: 70, pull: 640 });
  });
});

describe('pushRun', () => {
  it('puts the newest run at index 0', () => {
    const runs = pushRun(pushRun([], run('1')), run('2'));
    expect(runs.map((r) => r.id)).toEqual(['2', '1']);
  });

  it('evicts the OLDEST run, not the newest, at the cap', () => {
    // Mutation caught: `.slice(-RUN_LIMIT)` or appending instead of prepending —
    // either keeps the wrong end. Asserting `runs.length === RUN_LIMIT` alone would
    // pass under both, which is exactly how a FIFO undo stack survived 871 tests.
    let runs = [];
    for (let i = 1; i <= RUN_LIMIT + 1; i += 1) runs = pushRun(runs, run(String(i)));
    expect(runs).toHaveLength(RUN_LIMIT);
    expect(runs[0].id).toBe(String(RUN_LIMIT + 1));
    expect(runs[runs.length - 1].id).toBe('2');
    expect(runs.some((r) => r.id === '1')).toBe(false);
  });

  it('does not mutate the array it is given', () => {
    const before = [run('1')];
    pushRun(before, run('2'));
    expect(before.map((r) => r.id)).toEqual(['1']);
  });
});

describe('ghostRun', () => {
  const runs = [run('3'), run('2'), run('1')];

  it('returns the pinned run when one is pinned', () => {
    // Half one of the pair.
    expect(ghostRun(runs, '1')?.id).toBe('1');
  });

  it('falls back to the previous run when nothing is pinned', () => {
    // Half two. Index 1, not 0: index 0 is the pull just banked, which IS the current
    // result — a ghost of it would draw the live curve twice.
    expect(ghostRun(runs, null)?.id).toBe('2');
  });

  it('falls back to the previous run when the pinned run has been evicted', () => {
    // Mutation caught: `runs.find(...)` returned straight through, which is
    // `undefined` for an evicted pin and crashes at the first `.points` read.
    expect(ghostRun(runs, 'gone')?.id).toBe('2');
  });

  it('returns null when there is no previous run', () => {
    expect(ghostRun([run('1')], null)).toBe(null);
    expect(ghostRun([], null)).toBe(null);
  });
});

describe('ghostLabel', () => {
  const runs = [run('3'), run('2'), run('1')];

  it('names the run when it is the pinned one', () => {
    expect(ghostLabel(ghostRun(runs, '1'), '1')).toBe('Run 1');
  });

  it('says "Prev" when nothing is pinned', () => {
    // The other half. A label expression that always produced `Run ${n}` would pass a
    // test that only checked the pinned case, and the chart would then claim every
    // default comparison was a deliberate pin.
    expect(ghostLabel(ghostRun(runs, null), null)).toBe('Prev');
  });

  it('says "Prev" when the pin points at an evicted run', () => {
    // The pin is gone, so the ghost is the previous run and must be labelled as one.
    expect(ghostLabel(ghostRun(runs, 'gone'), 'gone')).toBe('Prev');
  });

  it('returns null when there is no ghost to label', () => {
    expect(ghostLabel(null, null)).toBe(null);
  });
});

describe('sparklinePath', () => {
  it('spans the full width and height of the box', () => {
    const path = sparklinePath(
      [{ rpm: 1500, hp: 0, torque: 0 }, { rpm: 1600, hp: 50, torque: 0 }, { rpm: 1700, hp: 100, torque: 0 }],
      100, 20,
    );
    // Lowest hp sits on the bottom edge, highest on the top edge, first x at 0 and
    // last x at the full width.
    expect(path).toBe('M0.00,20.00 L50.00,10.00 L100.00,0.00');
  });

  it('draws a flat line rather than dividing by zero when every point is equal', () => {
    // Mutation caught: `(hp - min) / (max - min)` with no guard is 0/0 = NaN, which
    // renders nothing and logs no error.
    const path = sparklinePath(
      [{ rpm: 1500, hp: 42, torque: 0 }, { rpm: 1600, hp: 42, torque: 0 }],
      100, 20,
    );
    expect(path).not.toMatch(/NaN/);
    expect(path).toBe('M0.00,20.00 L100.00,20.00');
  });

  it('returns an empty string for no points', () => {
    expect(sparklinePath([], 100, 20)).toBe('');
  });
});
