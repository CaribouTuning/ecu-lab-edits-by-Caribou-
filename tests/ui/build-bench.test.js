/**
 * The build bench's stock, modified and own-engine split (desk/BuildBench.jsx): a factory
 * engine as loaded is stock, and each change marks the part it belongs to.
 */

import { describe, expect, it } from 'vitest';

import { ENGINE_PRESETS, applyPreset } from '../../src/sim/index.js';
import { changedParts } from '../../src/ui/desk/BuildBench.jsx';

describe('changedParts', () => {
  it('finds nothing changed on any factory engine as loaded', () => {
    for (const p of ENGINE_PRESETS) expect([...changedParts(applyPreset(p), p)]).toEqual([]);
  });

  it('marks the part each change belongs to', () => {
    const p = ENGINE_PRESETS[0];
    const stock = applyPreset(p);
    const with_ = (patch) => [...changedParts({ ...stock, ...patch }, p)];
    expect(with_({ engineConfig: { ...stock.engineConfig, bore: stock.engineConfig.bore + 1 } })).toEqual(['block']);
    expect(with_({ engineConfig: { ...stock.engineConfig, camDuration: stock.engineConfig.camDuration + 8 } })).toEqual(['head']);
    expect(with_({ mods: { ...stock.mods, intake: !stock.mods.intake } })).toEqual(['induction']);
    expect(with_({ injIdx: stock.injIdx + 1 })).toEqual(['fuel']);
    expect(with_({ mods: { ...stock.mods, headers: !stock.mods.headers } })).toEqual(['exhaust']);
  });

  it('has no stock to compare an engine of the player\'s own with', () => {
    expect(changedParts(applyPreset(ENGINE_PRESETS[0]), null).size).toBe(0);
  });
});
