import { describe, expect, it } from 'vitest';

import { sparkReport } from '../../src/ui/components/advisorReports.js';

/** A spark entry; only the fields the report reads. */
const cell = (ri, ci, over) => ({
  ri, ci, rpm: 1000 * (ci + 1), map: 100 + ri * 20,
  current: over ? 24 : 18, suggested: 18, delta: over ? -6 : 0,
  mbt: 22, knockCeiling: 20,
});

/** Assembles a calAdvice whose category arrays genuinely contain the cells named. */
function advice({ over = [], under = [], past = [] } = {}) {
  const all = [...over, ...under, ...past];
  return { spark: all, fuelAdv: [], overAdvanced: over, underAdvanced: under, pastMbt: past, wrongMix: [] };
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
});
