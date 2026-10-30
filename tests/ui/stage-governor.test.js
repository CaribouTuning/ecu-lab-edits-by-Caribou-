/**
 * The rule by which a 3D stage that cannot hold its frame rate gives up resolution
 * (desk/stageGovernor.js), tested with made-up frame times: no GPU in a test runner.
 */

import { describe, expect, it } from 'vitest';

import { DPR_LADDER, SLOW_FRAME_MS, SLOW_RUN, STALL_MS, createGovernor } from '../../src/ui/desk/stageGovernor.js';

/** Feeds `n` drawn frames, `ms` apart, returning how many stepped down. */
function feed(g, n, ms) {
  let steps = 0;
  for (let i = 0; i < n; i += 1) if (g.frame(ms, true)) steps += 1;
  return steps;
}

describe('the stage governor', () => {
  it('holds full resolution for a stage that keeps its frame rate', () => {
    const g = createGovernor();
    expect(feed(g, 600, 16.7)).toBe(0);
    expect(g.dpr).toBe(DPR_LADDER[0]);
  });

  it('steps down after a sustained run of slow frames, and keeps stepping while it stays slow', () => {
    const g = createGovernor();
    // The first frame has nothing before it to be judged against.
    expect(feed(g, SLOW_RUN + 1, SLOW_FRAME_MS + 10)).toBe(1);
    expect(g.rung).toBe(1);
    expect(g.dpr).toBe(DPR_LADDER[1]);
    feed(g, 10 * SLOW_RUN, 60);
    expect(g.rung).toBe(DPR_LADDER.length - 1);
    expect(g.dpr).toBe(1);
  });

  it('never steps back up once it has stepped down', () => {
    const g = createGovernor();
    feed(g, SLOW_RUN + 1, 50);
    expect(g.rung).toBe(1);
    feed(g, 5000, 8);
    expect(g.rung).toBe(1);
  });

  it('a few slow frames among fast ones are not a run: a fast frame pays back two', () => {
    const g = createGovernor();
    for (let i = 0; i < 400; i += 1) g.frame(i % 3 === 0 ? 40 : 14, true);
    expect(g.rung).toBe(0);
  });

  it('does not judge an idle picture, or the gap after one', () => {
    const g = createGovernor();
    for (let i = 0; i < 1000; i += 1) {
      g.frame(1000 / 60, false);
      g.frame(900, true);
    }
    expect(g.rung).toBe(0);
  });

  it('does not take a hidden tab\'s long gap for a slow frame', () => {
    const g = createGovernor();
    for (let i = 0; i < 500; i += 1) g.frame(i % 2 ? STALL_MS + 1 : 16, true);
    expect(g.rung).toBe(0);
  });

  it('starts where a previous visit settled, clamped to the ladder', () => {
    expect(createGovernor(2).dpr).toBe(DPR_LADDER[2]);
    expect(createGovernor(99).rung).toBe(DPR_LADDER.length - 1);
    expect(createGovernor(-3).rung).toBe(0);
  });
});
