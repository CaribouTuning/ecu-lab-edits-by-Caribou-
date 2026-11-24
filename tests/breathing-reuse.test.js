/**
 * The breathing solved once is not solved again: handed between threads, and kept on the
 * device between sessions. Neither may change a single number. A grid kept from an earlier
 * session is used only if a few of its nodes, solved again, come out exactly the same, so a
 * later change to the breathing can never be served from an old save.
 */

import { describe, it, expect, vi } from 'vitest';
import { solveIncreasing } from '../src/sim/math.js';

/** A fresh copy of the simulator, with nothing solved yet: a new thread or a new session. */
async function freshSim() {
  vi.resetModules();
  return import('../src/sim/index.js');
}

/** VE across an engine's range, read from its breathing grid. */
function sweep(S, id) {
  const p = S.applyPreset(S.presetById(id));
  const ve = S.hardwareVeAt(p.engineConfig, p.mods, { turboOn: p.turboOn });
  const out = [];
  for (let rpm = 1000; rpm <= 6000; rpm += 650) for (const kpa of [35, 62, 98]) out.push(ve(rpm, kpa));
  return out;
}

describe('breathing kept between sessions', { timeout: 60000 }, () => {
  it('reads exactly the same from a kept grid as from one solved from scratch', async () => {
    const A = await freshSim();
    const solved = sweep(A, 'ls6');
    const snap = JSON.parse(JSON.stringify(A.breathingSnapshot()));
    expect(snap.grids.length).toBeGreaterThan(0);

    const B = await freshSim();
    B.seedBreathing(snap, { verify: true });
    expect(sweep(B, 'ls6')).toEqual(solved);
  });

  it('uses the kept nodes once the check passes, rather than solving them again', async () => {
    const A = await freshSim();
    const solved = sweep(A, 'ls6');
    const snap = JSON.parse(JSON.stringify(A.breathingSnapshot()));
    // Mark every node but the eight the check solves again, spread across the grid in its own
    // order (airflow.js): if the reading moves, it was read from the kept grid.
    for (const [, nodes] of snap.grids) {
      const keys = nodes.map(([k]) => k).sort((a, b) => a - b);
      const count = Math.min(8, keys.length);
      const probes = new Set(Array.from({ length: count }, (_, i) => keys[Math.round((i * (keys.length - 1)) / Math.max(1, count - 1))]));
      for (const n of nodes) if (!probes.has(n[0])) n[1] *= 1.01;
    }
    const B = await freshSim();
    B.seedBreathing(snap, { verify: true });
    expect(sweep(B, 'ls6')).not.toEqual(solved);
  });

  it('drops a kept grid that changed in one corner only, the probes spread across all of it', async () => {
    const A = await freshSim();
    const solved = sweep(A, 'ls6');
    const snap = JSON.parse(JSON.stringify(A.breathingSnapshot()));
    // As if a later build changed only the top of the speed range: the highest-speed nodes.
    for (const [, nodes] of snap.grids) {
      const top = Math.max(...nodes.map(([k]) => Math.floor(k / 4096)));
      for (const n of nodes) if (Math.floor(n[0] / 4096) === top) n[1] *= 1.01;
    }
    const B = await freshSim();
    B.seedBreathing(snap, { verify: true });
    expect(sweep(B, 'ls6')).toEqual(solved);
  });

  it('drops a kept grid whose nodes no longer come out the same, and solves it afresh', async () => {
    const A = await freshSim();
    const solved = sweep(A, 'ls6');
    const snap = JSON.parse(JSON.stringify(A.breathingSnapshot()));
    // As if the breathing had changed in a later build: every kept node is off by 1%.
    for (const [, nodes] of snap.grids) for (const n of nodes) n[1] *= 1.01;

    const B = await freshSim();
    B.seedBreathing(snap, { verify: true });
    expect(sweep(B, 'ls6')).toEqual(solved);
  });

  it('takes another thread\'s nodes as they are, solved by this same code', async () => {
    const A = await freshSim();
    const solved = sweep(A, 'b58-m1');
    const snap = A.breathingSnapshot();
    const B = await freshSim();
    B.seedBreathing(snap);
    expect(sweep(B, 'b58-m1')).toEqual(solved);
  });
});

describe('solveIncreasing', () => {
  /** What it replaced: bisection, 40 halvings. */
  const bisect = (f, target, lo, hi) => {
    for (let i = 0; i < 40; i += 1) { const mid = (lo + hi) / 2; if (f(mid) < target) lo = mid; else hi = mid; }
    return (lo + hi) / 2;
  };
  /** @type {[(x: number) => number, number, number, number][]} */
  const cases = [
    [(x) => x ** 3, 27, 0, 10],
    [(x) => Math.log(x), 1, 0.1, 50],
    [(x) => 1 - Math.exp(-x / 7), 0.9, 0, 100],
    [(x) => (x < 40 ? x * 0.5 : 20 + (x - 40) * 3), 80, 0, 300],
  ];
  it('finds the root bisection finds, in a handful of evaluations', () => {
    for (const [f, target, lo, hi] of cases) {
      let calls = 0;
      const x = solveIncreasing((v) => { calls += 1; return f(v); }, target, lo, hi, 1e-7);
      expect(Math.abs(x - bisect(f, target, lo, hi))).toBeLessThan(1e-6);
      expect(calls).toBeLessThan(30);
    }
  });
  it('still finds the root where f gives no number over part of the bracket, as bisection did', () => {
    // No reading below 2 (a pressure with no solve, say): taken as not below the target.
    const f = (x) => (x < 2 ? NaN : x * x);
    const x = solveIncreasing(f, 16, 0, 10, 1e-7);
    expect(Number.isFinite(x)).toBe(true);
    expect(Math.abs(x - bisect(f, 16, 0, 10))).toBeLessThan(1e-6);
    // And where it never gives one, a finite number inside the bracket, never NaN.
    expect(Number.isFinite(solveIncreasing(() => NaN, 1, 0, 10))).toBe(true);
  });
  it('returns the end of the bracket the target lies beyond', () => {
    expect(solveIncreasing((x) => x, -5, 0, 10)).toBe(0);
    expect(solveIncreasing((x) => x, 50, 0, 10)).toBe(10);
  });
});
