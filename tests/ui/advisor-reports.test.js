import { describe, expect, it } from 'vitest';

import { OPEN_LOOP_KPA } from '../../src/sim/index.js';
import { fuelReport, sparkReport, veReport } from '../../src/ui/components/advisorReports.js';

/** A spark entry; only the fields the report reads. */
const cell = (ri, ci, over) => ({
  ri, ci, rpm: 1000 * (ci + 1), map: 100 + ri * 20,
  current: over ? 24 : 18, suggested: 18, delta: over ? -6 : 0,
  mbt: 22, knockCeiling: 20, knockLimited: false,
});

/** Assembles a calAdvice whose category arrays genuinely contain the cells named. */
function advice({ over = [], under = [], past = [] } = {}) {
  const all = [...over, ...under, ...past];
  return { spark: all, fuelAdv: [], overAdvanced: over, underAdvanced: under, pastMbt: past, wrongMix: [] };
}

/**
 * A fuelAdv entry; only the fields `fuelReport` reads. `map` defaults well
 * above `OPEN_LOOP_KPA` (open loop, mixture advice applies); `delta` defaults
 * negative (suggested is richer than current, i.e. the cell is lean).
 */
const afrCell = (ri, ci, { map = OPEN_LOOP_KPA + 10, delta = -0.8 } = {}) => ({
  ri, ci, rpm: 1000 * (ci + 1), map,
  current: 12.5, suggested: Number((12.5 + delta).toFixed(2)), delta,
  delivered: 12.3, target: 12.0, duty: 50,
});

/** Assembles a calAdvice whose fuel arrays genuinely contain the cells named. */
function fuelAdvice({ fuelAdv = [], wrongMix = [] } = {}) {
  return { spark: [], overAdvanced: [], underAdvanced: [], pastMbt: [], fuelAdv, wrongMix };
}

describe('sparkReport, no selection', () => {
  it('leads with the knock limit when any cell is past it', () => {
    const r = sparkReport(advice({ over: [cell(3, 4, true)] }), null);
    expect(r.state).toBe('table-over');
    expect(r.tone).toBe('danger');
    expect(r.headline).toBe('1 cell beyond the knock limit');
  });

  it('pluralises the headline', () => {
    const r = sparkReport(advice({ over: [cell(3, 4, true), cell(3, 5, true)] }), null);
    expect(r.headline).toBe('2 cells beyond the knock limit');
  });

  it('reports timing left on the table only past the four-cell floor', () => {
    const four = [cell(0, 0), cell(0, 1), cell(0, 2), cell(0, 3)];
    expect(sparkReport(advice({ under: four }), null).state).toBe('table-clean');
    expect(sparkReport(advice({ under: [...four, cell(0, 4)] }), null).state).toBe('table-under');
  });

  it('ranks the knock limit above every other finding', () => {
    // A table that is simultaneously over-advanced somewhere and under-advanced
    // in six places leads with the danger, never with the opportunity.
    const under = [cell(0, 0), cell(0, 1), cell(0, 2), cell(0, 3), cell(0, 4), cell(0, 5)];
    const r = sparkReport(advice({ over: [cell(3, 4, true)], under }), null);
    expect(r.state).toBe('table-over');
  });

  it('is clean when every category is empty', () => {
    const r = sparkReport(advice(), null);
    expect(r.state).toBe('table-clean');
    expect(r.tone).toBe('ok');
  });

  it('keeps the table-wide fall-through order, which is the reverse', () => {
    // Under-advanced is checked first table-wide, but only past a four-cell floor,
    // so a single under-advanced cell loses to any past-MBT cell here.
    const r = sparkReport(advice({ under: [cell(0, 0)], past: [cell(0, 1)] }), null);
    expect(r.state).toBe('table-past-mbt');
  });
});

describe('sparkReport, one cell selected', () => {
  it('classifies by membership, not by comparing against the ceilings itself', () => {
    // This cell's own numbers say it is inside both ceilings (current 18 < mbt 22,
    // < knockCeiling 20). The advisor nonetheless filed it as over-advanced. The
    // report must follow the advisor, because the advisor is the single source of
    // truth for what counts as over-advanced — a UI that recomputed the answer is
    // exactly the disagreement advisors.js warns about.
    const c = { ...cell(3, 4), current: 18 };
    const r = sparkReport(advice({ over: [c] }), { type: 'cell', row: 3, col: 4 });
    expect(r.state).toBe('cell-over');
    expect(r.tone).toBe('danger');
  });

  it('names the gap to the ceiling that bound it', () => {
    const c = { ...cell(3, 4), current: 24, knockCeiling: 20 };
    const r = sparkReport(advice({ over: [c] }), { type: 'cell', row: 3, col: 4 });
    expect(r.headline).toBe('4.0 deg past the knock limit');
    expect(r.detail.cell).toBe(c);
  });

  it('says a cell the engine never reaches is unreachable, not clean', () => {
    // calibrationAdvice skips unreachable cells entirely (its rule 2), so the
    // lookup misses. Reporting that as "inside both ceilings" would tell the
    // player their 200 kPa cell at 800 RPM is fine, when it simply never happens.
    const r = sparkReport(advice({ over: [cell(3, 4, true)] }), { type: 'cell', row: 0, col: 0 });
    expect(r.state).toBe('cell-unreachable');
    expect(r.tone).toBe('info');
  });

  it('reports a cell in no category as inside both ceilings', () => {
    const c = cell(2, 2);
    const r = sparkReport({ ...advice(), spark: [c] }, { type: 'cell', row: 2, col: 2 });
    expect(r.state).toBe('cell-ok');
    expect(r.tone).toBe('ok');
  });

  it('names the gap past MBT', () => {
    const c = { ...cell(2, 2), current: 25, mbt: 22 };
    const r = sparkReport(advice({ past: [c] }), { type: 'cell', row: 2, col: 2 });
    expect(r.headline).toBe('3.0 deg past MBT');
  });

  it('names the gap for a cell past BOTH ceilings, with MBT the lower one', () => {
    // The exact geometry advisors.js warns about: this cell is detonating, and a
    // classifier that ordered by which ceiling is lower would file it as merely
    // wasteful. The existing membership test uses mbt ABOVE knockCeiling, so it
    // never reproduces this shape.
    const c = { ...cell(3, 4), current: 26, mbt: 18, knockCeiling: 22, knockLimited: false };
    const r = sparkReport(advice({ over: [c] }), { type: 'cell', row: 3, col: 4 });
    expect(r.state).toBe('cell-over');
    expect(r.headline).toBe('4.0 deg past the knock limit');
  });

  it('names the gap for an under-advanced cell', () => {
    const c = { ...cell(1, 1), delta: 5 };
    const r = sparkReport(advice({ under: [c] }), { type: 'cell', row: 1, col: 1 });
    expect(r.headline).toBe('5.0 deg below what this build allows');
  });
});

describe('sparkReport, a row or column selected', () => {
  it('counts the flagged cells inside the selected row', () => {
    const r = sparkReport(
      advice({ over: [cell(3, 1, true), cell(3, 2, true), cell(1, 5, true)] }),
      { type: 'row', row: 3 },
    );
    expect(r.state).toBe('group-over');
    expect(r.headline).toBe('2 of these cells are past the knock limit');
  });

  it('counts down the column when a column is selected', () => {
    const r = sparkReport(
      advice({ over: [cell(1, 4, true), cell(3, 4, true), cell(3, 0, true)] }),
      { type: 'col', col: 4 },
    );
    expect(r.headline).toBe('2 of these cells are past the knock limit');
  });

  it('is clean when nothing in the group is flagged', () => {
    const r = sparkReport(advice({ over: [cell(1, 5, true)] }), { type: 'row', row: 3 });
    expect(r.state).toBe('group-clean');
  });

  it('puts past-MBT ahead of under-advanced within a band', () => {
    const r = sparkReport(advice({ under: [cell(3, 0)], past: [cell(3, 1)] }), { type: 'row', row: 3 });
    expect(r.state).toBe('group-past-mbt');
  });

  it('uses singular verb agreement for a single flagged cell', () => {
    const r = sparkReport(advice({ over: [cell(3, 1, true)] }), { type: 'row', row: 3 });
    expect(r.headline).toBe('1 of these cells is past the knock limit');
  });
});

describe('fuelReport, no selection', () => {
  it('flags high-load cells off best power', () => {
    const r = fuelReport(fuelAdvice({ wrongMix: [afrCell(3, 4)] }), null);
    expect(r.state).toBe('table-off');
    expect(r.tone).toBe('warn');
    expect(r.headline).toBe('1 high-load cell off best power');
  });

  it('pluralises the headline', () => {
    const r = fuelReport(fuelAdvice({ wrongMix: [afrCell(3, 4), afrCell(3, 5)] }), null);
    expect(r.headline).toBe('2 high-load cells off best power');
  });

  it('is clean when wrongMix is empty', () => {
    const r = fuelReport(fuelAdvice(), null);
    expect(r.state).toBe('table-clean');
    expect(r.tone).toBe('ok');
    expect(r.headline).toBe('High-load mixture is on best power');
  });
});

describe('fuelReport, one cell selected', () => {
  it('classifies by membership in wrongMix, not by comparing delta itself', () => {
    // This cell's own delta (0.1) is well under MIX_NOTABLE_AFR and would never
    // land in wrongMix if the report recomputed the threshold itself. The
    // advisor nonetheless filed it as off-target — the report must follow that,
    // the same membership rule sparkReport pins.
    const c = afrCell(3, 4, { delta: 0.1 });
    const r = fuelReport(fuelAdvice({ fuelAdv: [c], wrongMix: [c] }), { type: 'cell', row: 3, col: 4 });
    expect(r.state).toBe('cell-off');
    expect(r.tone).toBe('warn');
  });

  it('names a negative delta as lean of best power — the suggestion is richer, so the cell is lean', () => {
    const c = afrCell(3, 4, { delta: -0.8 });
    const r = fuelReport(fuelAdvice({ fuelAdv: [c], wrongMix: [c] }), { type: 'cell', row: 3, col: 4 });
    expect(r.headline).toBe('0.8 AFR lean of best power');
  });

  it('names a positive delta as rich of best power — the suggestion is leaner, so the cell is rich', () => {
    const c = afrCell(3, 4, { delta: 0.8 });
    const r = fuelReport(fuelAdvice({ fuelAdv: [c], wrongMix: [c] }), { type: 'cell', row: 3, col: 4 });
    expect(r.headline).toBe('0.8 AFR rich of best power');
  });

  it('reports closed loop even when the cell has a large delta', () => {
    // Below OPEN_LOOP_KPA the trims own the cell — this is deliberately
    // fabricated with both a huge delta AND wrongMix membership, to prove the
    // closed-loop check binds first and unconditionally, not because a real
    // wrongMix could ever contain a sub-OPEN_LOOP_KPA cell (calibrationAdvice's
    // own filter would never put one there).
    const c = afrCell(3, 4, { map: OPEN_LOOP_KPA - 5, delta: -5 });
    const r = fuelReport(fuelAdvice({ fuelAdv: [c], wrongMix: [c] }), { type: 'cell', row: 3, col: 4 });
    expect(r.state).toBe('cell-closed-loop');
    expect(r.tone).toBe('info');
    expect(r.headline).toBe('Closed loop — the trims own this cell');
  });

  it('says a cell the engine never reaches is unreachable, not on target', () => {
    const c = afrCell(3, 4);
    const r = fuelReport(fuelAdvice({ fuelAdv: [c], wrongMix: [c] }), { type: 'cell', row: 0, col: 0 });
    expect(r.state).toBe('cell-unreachable');
    expect(r.tone).toBe('info');
  });

  it('reports an open-loop cell not in wrongMix as on target', () => {
    const c = afrCell(2, 2);
    const r = fuelReport(fuelAdvice({ fuelAdv: [c] }), { type: 'cell', row: 2, col: 2 });
    expect(r.state).toBe('cell-ok');
    expect(r.tone).toBe('ok');
    expect(r.headline).toBe('On best power');
  });
});

describe('fuelReport, a row or column selected', () => {
  it('counts the flagged cells inside the selected row', () => {
    const r = fuelReport(
      fuelAdvice({ wrongMix: [afrCell(3, 1), afrCell(3, 2), afrCell(1, 5)] }),
      { type: 'row', row: 3 },
    );
    expect(r.state).toBe('group-off');
    expect(r.headline).toBe('2 of these cells are off best power');
  });

  it('counts down the column when a column is selected', () => {
    const r = fuelReport(
      fuelAdvice({ wrongMix: [afrCell(1, 4), afrCell(3, 4), afrCell(3, 0)] }),
      { type: 'col', col: 4 },
    );
    expect(r.headline).toBe('2 of these cells are off best power');
  });

  it('is clean when nothing in the group is flagged', () => {
    const r = fuelReport(fuelAdvice({ wrongMix: [afrCell(1, 5)] }), { type: 'row', row: 3 });
    expect(r.state).toBe('group-clean');
    expect(r.tone).toBe('ok');
  });

  it('uses singular verb agreement for a single flagged cell', () => {
    const r = fuelReport(fuelAdvice({ wrongMix: [afrCell(3, 1)] }), { type: 'row', row: 3 });
    expect(r.headline).toBe('1 of these cells is off best power');
  });
});

/**
 * A `deltas` entry as `veRecommendations` builds it: `RPM.map((rpm, ci) => ({rpm,
 * pct, from, to}))`. There is no `ci` field on the object itself — the array's own
 * index IS the column index, which is the whole reason `veReport` is allowed to
 * read `deltas[selection.col]` without inventing a lookup.
 */
const delta = (rpm, pct, from = 50, to = 50) => ({ rpm, pct, from, to });

describe('veReport, no selection (table-wide)', () => {
  it('reports sync when veRecommendations found nothing notable', () => {
    const r = veReport({ inSync: true, recs: [], deltas: [delta(800, 0.4)], maxAbs: 0.4 }, null);
    expect(r.state).toBe('table-sync');
    expect(r.tone).toBe('ok');
    expect(r.headline).toBe('VE matches your hardware');
  });

  it('reports the max gap when out of sync', () => {
    const r = veReport({ inSync: false, recs: [], deltas: [delta(800, 12.3)], maxAbs: 12.3 }, null);
    expect(r.state).toBe('table-stale');
    expect(r.tone).toBe('warn');
    expect(r.headline).toBe('VE out of sync — 12% max gap');
  });

  it('carries the recs through in detail, for the panel to render one per band', () => {
    const recs = [{ band: 'low-RPM', rpmText: '800–1500 RPM', pct: 12, text: 'Raise the low-RPM cells...', cells: ['800 RPM: 50 -> 56'] }];
    const r = veReport({ inSync: false, recs, deltas: [delta(800, 12)], maxAbs: 12 }, null);
    expect(r.detail.recs).toBe(recs);
  });

  it('returns a no-advice state instead of throwing when veAdvice is null', () => {
    const r = veReport(null, null);
    expect(r.state).toBe('no-advice');
    expect(r.tone).toBe('info');
    expect(r.headline).toBe('No airflow comparison available for this build yet.');
  });

  it('returns no-advice even with a selection present — there is nothing to narrow to without veAdvice', () => {
    const r = veReport(null, { type: 'cell', row: 2, col: 3 });
    expect(r.state).toBe('no-advice');
  });
});

describe('veReport, a cell or column selected', () => {
  it('reports the COLUMN delta for a cell selection, never a per-cell gap that does not exist', () => {
    const veAdvice = { inSync: false, recs: [], maxAbs: 20, deltas: [delta(800, 2), delta(1500, 2), delta(2500, 2), delta(3500, 20.4, 60, 72)] };
    const r = veReport(veAdvice, { type: 'cell', row: 5, col: 3 });
    expect(r.state).toBe('cell-gap');
    expect(r.headline).toBe('20% more air at 3500 RPM than your table assumes');
    expect(r.detail).toEqual({ rpm: 3500, from: 60, to: 72, pct: 20.4 });
  });

  it('reports the same column delta for a column selection', () => {
    const veAdvice = { inSync: false, recs: [], maxAbs: 20, deltas: [delta(800, 2), delta(1500, 2), delta(2500, 2), delta(3500, 20.4, 60, 72)] };
    const r = veReport(veAdvice, { type: 'col', col: 3 });
    expect(r.state).toBe('col-gap');
    expect(r.headline).toBe('20% more air at 3500 RPM than your table assumes');
  });

  it('says "less" and reports a warn tone for a negative delta', () => {
    const veAdvice = { inSync: false, recs: [], maxAbs: 15, deltas: [delta(800, -15.4, 60, 50)] };
    const r = veReport(veAdvice, { type: 'col', col: 0 });
    expect(r.tone).toBe('warn');
    expect(r.headline).toBe('15% less air at 800 RPM than your table assumes');
  });

  // The Critical regression test: veRecommendations' own VE_NOTABLE_PCT (2.5)
  // is the threshold, not a UI-invented one. A pct of 0.4 rounds to a 0%
  // display either way, but the point of this test is that the boundary is
  // 2.5, not 0.5 — proven by the sibling test below at pct 1 (also under 2.5,
  // and nowhere near rounding to 0% on its own).
  it('is sync-toned when the column delta rounds to a 0% display, never claiming a gap that would not show', () => {
    const veAdvice = { inSync: true, recs: [], maxAbs: 0.4, deltas: [delta(800, 0.4)] };
    const r = veReport(veAdvice, { type: 'col', col: 0 });
    expect(r.state).toBe('col-sync');
    expect(r.tone).toBe('ok');
    expect(r.headline).toBe('Matches your hardware at 800 RPM');
  });

  // The Critical's exact regression shape: a pct between 0.5 and 2.5 (here,
  // -0.87 — the real default build's 800 RPM column) must be 'ok'/'col-sync',
  // never the 'warn'/'col-gap' a 0.5%-ish threshold would have produced.
  it('is ok/col-sync for a delta between 0.5 and 2.5, below VE_NOTABLE_PCT', () => {
    const veAdvice = { inSync: true, recs: [], maxAbs: 0.87, deltas: [delta(800, -0.87, 60, 59.5)] };
    const r = veReport(veAdvice, { type: 'col', col: 0 });
    expect(r.state).toBe('col-sync');
    expect(r.tone).toBe('ok');
  });

  // Finding 2's regression: pct === 0 must not hit the ungrammatical
  // "0% less air" — it has to land in col-sync, whose headline has no
  // more/less word to get wrong.
  it('routes pct exactly 0 into col-sync, not a "0% less" headline', () => {
    const veAdvice = { inSync: true, recs: [], maxAbs: 0, deltas: [delta(4500, 0, 60, 60)] };
    const r = veReport(veAdvice, { type: 'col', col: 0 });
    expect(r.state).toBe('col-sync');
    expect(r.tone).toBe('ok');
    expect(r.headline).toBe('Matches your hardware at 4500 RPM');
  });

  it('never indexes deltas by a row — two different rows selected with the same column agree', () => {
    const veAdvice = { inSync: false, recs: [], maxAbs: 20, deltas: [delta(800, 5), delta(1500, 20, 60, 72)] };
    const a = veReport(veAdvice, { type: 'cell', row: 0, col: 1 });
    const b = veReport(veAdvice, { type: 'cell', row: 5, col: 1 });
    expect(a).toEqual(b);
  });

  it('falls through to the table-wide report when deltas is missing entirely', () => {
    const veAdvice = { inSync: false, recs: [], maxAbs: 33 };
    const r = veReport(veAdvice, { type: 'col', col: 0 });
    expect(r.state).toBe('table-stale');
  });
});

describe('veReport, a row selected', () => {
  // Finding 4: a row selection must never fall through to table-stale, whose
  // body carries the whole-table ACCEPT RE-LOGGED VALUES button — a row
  // selection has no column-scoped answer, so it gets its own state instead,
  // with no accept button.
  it('reports group-ve for a row selection instead of falling back to the table-wide report', () => {
    const veAdvice = { inSync: false, recs: [], maxAbs: 33, deltas: [delta(800, 33)] };
    const r = veReport(veAdvice, { type: 'row', row: 2 });
    expect(r.state).toBe('group-ve');
    expect(r.tone).toBe('info');
    expect(r.headline).toBe('VE is measured per RPM column');
  });

  it('reports group-ve for a row selection even when the table is in sync', () => {
    const veAdvice = { inSync: true, recs: [], maxAbs: 0.1, deltas: [delta(800, 0.1)] };
    const r = veReport(veAdvice, { type: 'row', row: 2 });
    expect(r.state).toBe('group-ve');
  });
});
