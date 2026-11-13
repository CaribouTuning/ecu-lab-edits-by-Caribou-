/**
 * The simulator worker (src/ui/sim/simWorker.js) solves an engine's breathing off the drawing
 * thread and hands back the nodes it solved (`breathingSnapshot`); the page takes them in
 * (`seedBreathing`). That is only a saving of time if the numbers are the ones the page would
 * have worked out itself. A fresh module instance stands in for each thread here.
 */

import { describe, expect, it, vi } from 'vitest';

const engine = async () => {
  vi.resetModules();
  return import('../src/sim/index.js');
};

describe('breathing solved on another thread', () => {
  it('reads exactly as the page would have solved it', async () => {
    const at = [[1500, 40], [3300, 71], [5550, 98], [6900, 100]];
    const read = (S) => {
      const p = S.applyPreset(S.presetById('ls1'));
      const ve = S.hardwareVeAt(p.engineConfig, p.mods);
      return at.map(([rpm, kpa]) => ve(rpm, kpa));
    };

    const worker = await engine();
    const solved = read(worker);
    const snap = worker.breathingSnapshot();
    expect(snap.grids.length).toBeGreaterThan(0);

    const page = await engine();
    page.seedBreathing(JSON.parse(JSON.stringify(snap)));
    const seeded = read(page);

    const alone = read(await engine());
    expect(seeded).toEqual(alone);
    expect(solved).toEqual(alone);
  }, 120_000);
});
