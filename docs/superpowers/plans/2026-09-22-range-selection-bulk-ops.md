# Range Selection, Bulk Table Ops and Keyboard Tuning — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the player select a rectangle of AIR, SPARK or FUEL and add, scale, set,
interpolate or smooth it in one undo step, by mouse, touch or keyboard (#105).

**Architecture:** Pure table ops in `src/sim/tables.js` take an ordered rectangle. A small
UI module `src/ui/components/selection.js` turns any `Selection` (cell/row/col/new
`range`) into that rectangle and builds undo labels. `TuningGrid` gains drag, shift-click,
two-tap and keyboard input; `SelectionDock` gains ADD/SCALE/SET tabs plus
INTERPOLATE/SMOOTH, all through `setData(next, label)`; `SET_TABLE` carries the label.

**Tech Stack:** React 18, Vite, Vitest + Testing Library on jsdom 25, JSDoc-typed JS.

Spec: `docs/superpowers/specs/2026-09-22-range-selection-bulk-ops-design.md`.

## Global Constraints

- Table maths lives in `src/sim/tables.js`, never in UI components.
- `tables.js` must not import from `math.js` (`math.js` imports `tables.js`).
- Every written cell: clamped to `[min, max]`, rounded to 2 dp.
- Every bulk op, stepper press and `+`/`-` key press is exactly one `SET_TABLE` dispatch.
- `SelectionDock`'s draft/commit logic (`draft`, `commitDraft`, `COMMIT_KEYS`, the
  prop-change reset) keeps its behaviour; existing tests in `tests/ui/undo-controls.test.jsx`
  are the gate.
- `rangeMode` is outside the undo snapshot (`history.js`'s `TUNE_KEYS` is unchanged).
- Buttons from `primitives/Button.jsx` carry exactly one variant (see
  `tests/ui/button-call-sites.test.jsx`).
- Fingerprint unchanged: `npx vitest run tests/fingerprint.test.js` passes.
- Run with Node 22 (`nvm use 22`).

## File map

| File | Change |
|---|---|
| `src/sim/tables.js` | + `orderRect`, `addRect`, `scaleRect`, `setRect`, `interpolateRect`, `smoothRect` |
| `tests/table-ops.test.js` | new, unit tests for the above |
| `src/ui/components/selection.js` | new: `rectOf`, `inRect`, `cellCount`, `anchorOf`, `spanSelection`, `selectionKey`, `stepsFor`, `opLabel`, `signed` |
| `tests/ui/selection.test.js` | new |
| `src/ui/state/reducer.js` | `SET_TABLE` optional `label`; `labelFor` uses it |
| `src/ui/state/initialState.js` | `tune.rangeMode: false`; `Selection` typedef gains `range` |
| `tests/ui/state/reducer.test.js` | label tests |
| `src/ui/components/advisorReports.js` | `countIn` via `rectOf` |
| `tests/ui/advisor-reports.test.js` | range count test |
| `src/ui/components/SelectionDock.jsx` | ops via `tables.js`, range title, tabs, interpolate/smooth, labels |
| `src/ui/components/SelectModeBar.jsx` | new |
| `src/ui/components/TuningGrid.jsx` | range highlight, drag, shift-click, two-tap, keyboard |
| `src/ui/screens/tune/{Airflow,Spark,Fuel}Screen.jsx` | wire `rangeMode`, `SelectModeBar`, labelled `setData` |
| `tests/ui/range-selection.test.jsx` | new, UI tests |
| `src/ui/components/README.md` | mention `SelectModeBar` and `selection.js` |

---

### Task 1: Table ops in `tables.js`

**Files:** Modify `src/sim/tables.js` (append). Test: `tests/table-ops.test.js`.

**Produces:**
- `type Rect = {r1, c1, r2, c2}`; `type Bounds = {min, max}`
- `orderRect(rect): Rect` (r1<=r2, c1<=c2; extra keys dropped)
- `addRect(table, rect, delta, bounds)`, `scaleRect(table, rect, pct, bounds)`,
  `setRect(table, rect, value, bounds)`, `interpolateRect(table, rect, bounds)`,
  `smoothRect(table, rect, bounds)` — each returns a new `number[][]`. `rect` may be unordered.

- [ ] **Step 1: Write the failing tests** — `tests/table-ops.test.js`:

```js
import { describe, expect, it } from 'vitest';

import {
  addRect, interpolateRect, orderRect, scaleRect, setRect, smoothRect,
} from '../src/sim/tables.js';

const B = { min: 0, max: 100 };
const grid = () => [
  [10, 20, 30, 40],
  [50, 60, 70, 80],
  [90, 95, 99, 100],
];
const all = { r1: 0, c1: 0, r2: 2, c2: 3 };

describe('orderRect', () => {
  it('orders corners given in any direction', () => {
    expect(orderRect({ r1: 2, c1: 3, r2: 0, c2: 1 })).toEqual({ r1: 0, c1: 1, r2: 2, c2: 3 });
  });
});

describe('addRect', () => {
  it('changes only cells inside the rectangle', () => {
    expect(addRect(grid(), { r1: 0, c1: 1, r2: 1, c2: 2 }, 5, B)).toEqual([
      [10, 25, 35, 40],
      [50, 65, 75, 80],
      [90, 95, 99, 100],
    ]);
  });
  it('accepts unordered corners', () => {
    expect(addRect(grid(), { r1: 1, c1: 2, r2: 0, c2: 1 }, 5, B))
      .toEqual(addRect(grid(), { r1: 0, c1: 1, r2: 1, c2: 2 }, 5, B));
  });
  it('clamps at both bounds', () => {
    expect(addRect(grid(), all, 5, B)[2]).toEqual([95, 100, 100, 100]);
    expect(addRect(grid(), all, -15, B)[0]).toEqual([0, 5, 15, 25]);
  });
  it('rounds to 2 dp', () => {
    expect(addRect([[0.1]], { r1: 0, c1: 0, r2: 0, c2: 0 }, 0.2, B)).toEqual([[0.3]]);
  });
  it('does not mutate its input', () => {
    const t = grid();
    addRect(t, all, 1, B);
    expect(t).toEqual(grid());
  });
  it('edits a single cell', () => {
    expect(addRect(grid(), { r1: 1, c1: 1, r2: 1, c2: 1 }, -10, B)[1]).toEqual([50, 50, 70, 80]);
  });
});

describe('scaleRect', () => {
  it('multiplies by 1 + pct/100', () => {
    expect(scaleRect(grid(), { r1: 0, c1: 0, r2: 0, c2: 3 }, 10, B)[0]).toEqual([11, 22, 33, 44]);
  });
  it('clamps and rounds', () => {
    expect(scaleRect(grid(), { r1: 2, c1: 0, r2: 2, c2: 3 }, 5, B)[2]).toEqual([94.5, 99.75, 100, 100]);
  });
});

describe('setRect', () => {
  it('sets every cell in the rectangle, clamped', () => {
    expect(setRect(grid(), { r1: 0, c1: 0, r2: 1, c2: 0 }, 42, B).map((r) => r[0])).toEqual([42, 42, 90]);
    expect(setRect(grid(), { r1: 0, c1: 0, r2: 0, c2: 0 }, 500, B)[0][0]).toBe(100);
  });
});

describe('interpolateRect', () => {
  it('keeps the four corners exactly', () => {
    const t = [[10.123, 0, 30], [0, 0, 0], [70, 0, 90]];
    const out = interpolateRect(t, { r1: 0, c1: 0, r2: 2, c2: 2 }, B);
    expect([out[0][0], out[0][2], out[2][0], out[2][2]]).toEqual([10.123, 30, 70, 90]);
  });
  it('fills the inside bilinearly', () => {
    const t = [[10, 0, 30], [0, 0, 0], [70, 0, 90]];
    expect(interpolateRect(t, { r1: 0, c1: 0, r2: 2, c2: 2 }, B)).toEqual([
      [10, 20, 30],
      [40, 50, 60],
      [70, 80, 90],
    ]);
  });
  it('reduces to a straight line on one row', () => {
    expect(interpolateRect([[0, 7, 7, 30]], { r1: 0, c1: 0, r2: 0, c2: 3 }, B)).toEqual([[0, 10, 20, 30]]);
  });
  it('reduces to a straight line on one column', () => {
    expect(interpolateRect([[0], [7], [20]], { r1: 0, c1: 0, r2: 2, c2: 0 }, B)).toEqual([[0], [10], [20]]);
  });
  it('leaves a single cell alone', () => {
    expect(interpolateRect(grid(), { r1: 1, c1: 1, r2: 1, c2: 1 }, B)).toEqual(grid());
  });
  it('leaves cells outside the rectangle alone', () => {
    const out = interpolateRect(grid(), { r1: 0, c1: 0, r2: 0, c2: 2 }, B);
    expect(out.slice(1)).toEqual(grid().slice(1));
    expect(out[0][3]).toBe(40);
  });
});

describe('smoothRect', () => {
  it('averages each selected cell with its 3x3 neighbourhood', () => {
    const t = [[0, 0, 0], [0, 90, 0], [0, 0, 0]];
    expect(smoothRect(t, { r1: 1, c1: 1, r2: 1, c2: 1 }, B)[1][1]).toBe(10);
  });
  it('clips the neighbourhood at the table edge', () => {
    const t = [[40, 0], [0, 0]];
    expect(smoothRect(t, { r1: 0, c1: 0, r2: 0, c2: 0 }, B)[0][0]).toBe(10);
  });
  it('reads neighbours from the original table, not already-smoothed cells', () => {
    const t = [[0, 0, 0, 0], [0, 90, 0, 0], [0, 0, 0, 0]];
    const out = smoothRect(t, { r1: 1, c1: 1, r2: 1, c2: 2 }, B);
    expect(out[1][1]).toBe(10);
    expect(out[1][2]).toBe(10);
  });
  it('writes only inside the rectangle', () => {
    const t = [[0, 0, 0], [0, 90, 0], [0, 0, 0]];
    const out = smoothRect(t, { r1: 1, c1: 1, r2: 1, c2: 1 }, B);
    expect(out[0]).toEqual([0, 0, 0]);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run tests/table-ops.test.js` — Expected: FAIL (`orderRect` is not exported).

- [ ] **Step 3: Implement** — append to `src/sim/tables.js`:

```js
// ---------------------------------------------------------------------------
// Bulk edits over a rectangle of a calibration table.
//
// These are the operations TUNE's grids apply to a selection. They live here, next to
// the tables and their clamps, so they are tested without a DOM and the UI only decides
// WHICH cells and WHICH op. Every one returns a new table and writes only inside the
// rectangle. Written values are clamped and rounded to 2 dp — the storage precision the
// dock's steppers have always used, not the display precision (VE carries decimals from
// the re-logged values, and rounding those away would change cells nobody meant to move).
//
// Clamping is local rather than `math.js`'s `clamp`: `math.js` imports this module's
// axes, and importing back would make the two a cycle.

/** @typedef {{r1: number, c1: number, r2: number, c2: number}} Rect */
/** @typedef {{min: number, max: number}} Bounds */

/**
 * @param {number} v
 * @param {Bounds} bounds
 * @returns {number}
 */
const fit = (v, { min, max }) => Number(Math.min(Math.max(v, min), max).toFixed(2));

/**
 * A rectangle with its corners in order, whichever two corners it was given by.
 * @param {Rect} rect
 * @returns {Rect}
 */
export function orderRect({ r1, c1, r2, c2 }) {
  return { r1: Math.min(r1, r2), c1: Math.min(c1, c2), r2: Math.max(r1, r2), c2: Math.max(c1, c2) };
}

/**
 * @param {number[][]} table
 * @param {Rect} rect
 * @param {(v: number, ri: number, ci: number) => number} fn
 * @returns {number[][]}
 */
function mapRect(table, rect, fn) {
  const { r1, c1, r2, c2 } = orderRect(rect);
  return table.map((row, ri) => row.map((v, ci) => (
    ri >= r1 && ri <= r2 && ci >= c1 && ci <= c2 ? fn(v, ri, ci) : v
  )));
}

/**
 * @param {number[][]} table
 * @param {Rect} rect
 * @param {number} delta
 * @param {Bounds} bounds
 * @returns {number[][]}
 */
export const addRect = (table, rect, delta, bounds) => mapRect(table, rect, (v) => fit(v + delta, bounds));

/**
 * Percent scaling: the edit that answers a VE histogram correction, which IS a percentage.
 * @param {number[][]} table
 * @param {Rect} rect
 * @param {number} pct
 * @param {Bounds} bounds
 * @returns {number[][]}
 */
export const scaleRect = (table, rect, pct, bounds) => mapRect(table, rect, (v) => fit(v * (1 + pct / 100), bounds));

/**
 * @param {number[][]} table
 * @param {Rect} rect
 * @param {number} value
 * @param {Bounds} bounds
 * @returns {number[][]}
 */
export const setRect = (table, rect, value, bounds) => mapRect(table, rect, () => fit(value, bounds));

/**
 * Bilinear fill from the rectangle's four corners, which keep their values exactly. By
 * cell index, not axis value: the axes are unevenly spaced, but a tuner reads and
 * blends the grid by cell. One row or column reduces to a straight line; one cell is
 * left alone.
 * @param {number[][]} table
 * @param {Rect} rect
 * @param {Bounds} bounds
 * @returns {number[][]}
 */
export function interpolateRect(table, rect, bounds) {
  const { r1, c1, r2, c2 } = orderRect(rect);
  const tl = table[r1][c1], tr = table[r1][c2], bl = table[r2][c1], br = table[r2][c2];
  return mapRect(table, rect, (v, ri, ci) => {
    if ((ri === r1 || ri === r2) && (ci === c1 || ci === c2)) return v;
    const u = (ci - c1) / (c2 - c1 || 1);
    const w = (ri - r1) / (r2 - r1 || 1);
    const top = tl + (tr - tl) * u;
    const bottom = bl + (br - bl) * u;
    return fit(top + (bottom - top) * w, bounds);
  });
}

/**
 * One pass of a 3x3 box average. Neighbours are read from the ORIGINAL table, including
 * cells outside the rectangle, so a range blends into what surrounds it and the result
 * does not depend on the order cells are visited. The neighbourhood is clipped at the
 * table's edges.
 * @param {number[][]} table
 * @param {Rect} rect
 * @param {Bounds} bounds
 * @returns {number[][]}
 */
export function smoothRect(table, rect, bounds) {
  return mapRect(table, rect, (v, ri, ci) => {
    let sum = 0, n = 0;
    for (let r = ri - 1; r <= ri + 1; r++) {
      for (let c = ci - 1; c <= ci + 1; c++) {
        if (r < 0 || r >= table.length || c < 0 || c >= table[r].length) continue;
        sum += table[r][c];
        n++;
      }
    }
    return fit(sum / n, bounds);
  });
}
```

- [ ] **Step 4: Run** `npx vitest run tests/table-ops.test.js tests/fingerprint.test.js` — Expected: PASS.

- [ ] **Step 5: Commit** — `git add src/sim/tables.js tests/table-ops.test.js && git commit -m "Give tables.js the five bulk edits a range selection needs (#105)"`

---

### Task 2: `selection.js` helpers

**Files:** Create `src/ui/components/selection.js`. Test: `tests/ui/selection.test.js`.

**Consumes:** `orderRect` (Task 1), `LOAD`, `RPM` from `src/sim/index.js`.

**Produces:**
- `rectOf(selection): Rect` — ordered, for cell/row/col/range
- `inRect(rect, ri, ci): boolean`, `cellCount(rect): number`
- `anchorOf(selection): {r, c}` — cell: itself; range: `(r1, c1)`; row: `(row, 0)`; col: `(0, col)`
- `spanSelection(anchor, end, forceRange = false): Selection` — a `cell` if the two are the same point and `!forceRange`, else `{type:'range', r1: anchor.r, c1: anchor.c, r2: end.r, c2: end.c}`
- `selectionKey(selection|null): string`
- `stepsFor(decimals): {small, big}` — `{0.1, 1}` if decimals else `{1, 5}`
- `signed(n): string` — `+5`, `-0.1`
- `opLabel(desc, rect): string` — `` `${desc} · ${n} cell(s)` ``

- [ ] **Step 1: Write the failing tests** — `tests/ui/selection.test.js`:

```js
import { describe, expect, it } from 'vitest';

import { LOAD, RPM } from '../../src/sim/index.js';
import {
  anchorOf, cellCount, inRect, opLabel, rectOf, selectionKey, signed, spanSelection, stepsFor,
} from '../../src/ui/components/selection.js';

const lastR = LOAD.length - 1;
const lastC = RPM.length - 1;

describe('rectOf', () => {
  it('covers each selection type', () => {
    expect(rectOf({ type: 'cell', row: 2, col: 3 })).toEqual({ r1: 2, c1: 3, r2: 2, c2: 3 });
    expect(rectOf({ type: 'row', row: 1 })).toEqual({ r1: 1, c1: 0, r2: 1, c2: lastC });
    expect(rectOf({ type: 'col', col: 4 })).toEqual({ r1: 0, c1: 4, r2: lastR, c2: 4 });
    expect(rectOf({ type: 'range', r1: 3, c1: 5, r2: 1, c2: 2 })).toEqual({ r1: 1, c1: 2, r2: 3, c2: 5 });
  });
});

describe('inRect / cellCount', () => {
  const r = { r1: 1, c1: 2, r2: 3, c2: 5 };
  it('tests membership inclusively', () => {
    expect(inRect(r, 1, 2)).toBe(true);
    expect(inRect(r, 3, 5)).toBe(true);
    expect(inRect(r, 0, 2)).toBe(false);
    expect(inRect(r, 2, 6)).toBe(false);
  });
  it('counts cells', () => {
    expect(cellCount(r)).toBe(12);
    expect(cellCount({ r1: 0, c1: 0, r2: 0, c2: 0 })).toBe(1);
  });
});

describe('anchorOf', () => {
  it('names the fixed corner of each type', () => {
    expect(anchorOf({ type: 'cell', row: 2, col: 3 })).toEqual({ r: 2, c: 3 });
    expect(anchorOf({ type: 'range', r1: 3, c1: 5, r2: 1, c2: 2 })).toEqual({ r: 3, c: 5 });
    expect(anchorOf({ type: 'row', row: 1 })).toEqual({ r: 1, c: 0 });
    expect(anchorOf({ type: 'col', col: 4 })).toEqual({ r: 0, c: 4 });
  });
});

describe('spanSelection', () => {
  it('is a cell when both ends are the same point', () => {
    expect(spanSelection({ r: 1, c: 1 }, { r: 1, c: 1 })).toEqual({ type: 'cell', row: 1, col: 1 });
  });
  it('is a one-cell range when forced', () => {
    expect(spanSelection({ r: 1, c: 1 }, { r: 1, c: 1 }, true)).toEqual({ type: 'range', r1: 1, c1: 1, r2: 1, c2: 1 });
  });
  it('keeps the anchor as r1/c1', () => {
    expect(spanSelection({ r: 3, c: 4 }, { r: 1, c: 2 })).toEqual({ type: 'range', r1: 3, c1: 4, r2: 1, c2: 2 });
  });
});

describe('selectionKey', () => {
  it('differs for different ranges and is empty for none', () => {
    expect(selectionKey(null)).toBe('');
    expect(selectionKey({ type: 'range', r1: 0, c1: 0, r2: 1, c2: 1 }))
      .not.toBe(selectionKey({ type: 'range', r1: 0, c1: 0, r2: 1, c2: 2 }));
    expect(selectionKey({ type: 'cell', row: 1, col: 2 })).toBe(selectionKey({ type: 'cell', row: 1, col: 2 }));
  });
});

describe('labels and steps', () => {
  it('steps by table precision', () => {
    expect(stepsFor(0)).toEqual({ small: 1, big: 5 });
    expect(stepsFor(1)).toEqual({ small: 0.1, big: 1 });
  });
  it('signs numbers', () => {
    expect(signed(5)).toBe('+5');
    expect(signed(-0.1)).toBe('-0.1');
  });
  it('pluralises the cell count', () => {
    expect(opLabel('smooth', { r1: 0, c1: 0, r2: 2, c2: 3 })).toBe('smooth · 12 cells');
    expect(opLabel('+1', { r1: 0, c1: 0, r2: 0, c2: 0 })).toBe('+1 · 1 cell');
  });
});
```

- [ ] **Step 2: Run** `npx vitest run tests/ui/selection.test.js` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement** — `src/ui/components/selection.js`:

```js
/**
 * What a `TuningGrid` selection covers, and the words for what an edit did to it.
 *
 * Every selection type — a cell, a row, a column or a range — resolves to one ordered
 * rectangle, and everything that EDITS works on that rectangle through the ops in
 * `src/sim/tables.js`. Only the grid's highlight, the dock's title and the advisor care
 * which type it was.
 *
 * Shared by `TuningGrid`, `SelectionDock` and `advisorReports.js`, so it lives beside
 * them rather than inside any one.
 */

import { LOAD, RPM, orderRect } from '../../sim/index.js';

/**
 * @typedef {{type: 'cell', row: number, col: number}
 *   | {type: 'row', row: number}
 *   | {type: 'col', col: number}
 *   | {type: 'range', r1: number, c1: number, r2: number, c2: number}} Selection
 *   A range's (r1, c1) is its anchor — the corner a drag or shift-click started from —
 *   so its corners are NOT necessarily ordered. `rectOf` orders them.
 */
/** @typedef {import('../../sim/tables.js').Rect} Rect */

/**
 * @param {Selection} selection
 * @returns {Rect}
 */
export function rectOf(selection) {
  if (selection.type === 'cell') return { r1: selection.row, c1: selection.col, r2: selection.row, c2: selection.col };
  if (selection.type === 'row') return { r1: selection.row, c1: 0, r2: selection.row, c2: RPM.length - 1 };
  if (selection.type === 'col') return { r1: 0, c1: selection.col, r2: LOAD.length - 1, c2: selection.col };
  return orderRect(selection);
}

/**
 * @param {Rect} rect ordered
 * @param {number} ri
 * @param {number} ci
 * @returns {boolean}
 */
export const inRect = (rect, ri, ci) => ri >= rect.r1 && ri <= rect.r2 && ci >= rect.c1 && ci <= rect.c2;

/**
 * @param {Rect} rect ordered
 * @returns {number}
 */
export const cellCount = (rect) => (rect.r2 - rect.r1 + 1) * (rect.c2 - rect.c1 + 1);

/**
 * The corner a shift-click or shift+arrow extends FROM.
 * @param {Selection} selection
 * @returns {{r: number, c: number}}
 */
export function anchorOf(selection) {
  if (selection.type === 'cell') return { r: selection.row, c: selection.col };
  if (selection.type === 'range') return { r: selection.r1, c: selection.c1 };
  if (selection.type === 'row') return { r: selection.row, c: 0 };
  return { r: 0, c: selection.col };
}

/**
 * The selection running from `anchor` to `end`. A plain cell when the two coincide —
 * unless `forceRange`, which SELECT RANGE mode uses so its first tap reads as the start
 * of a range rather than an ordinary cell.
 * @param {{r: number, c: number}} anchor
 * @param {{r: number, c: number}} end
 * @param {boolean} [forceRange]
 * @returns {Selection}
 */
export function spanSelection(anchor, end, forceRange = false) {
  if (!forceRange && anchor.r === end.r && anchor.c === end.c) return { type: 'cell', row: end.r, col: end.c };
  return { type: 'range', r1: anchor.r, c1: anchor.c, r2: end.r, c2: end.c };
}

/**
 * A string that changes whenever the selection does — the dock's "is this a new
 * selection?" test, and why a new rectangle drops a stale slider draft.
 * @param {Selection|null} selection
 * @returns {string}
 */
export function selectionKey(selection) {
  if (!selection) return '';
  if (selection.type === 'range') return `range:${selection.r1}:${selection.c1}:${selection.r2}:${selection.c2}`;
  return `${selection.type}:${selection.type === 'col' ? '' : selection.row}:${selection.type === 'row' ? '' : selection.col}`;
}

/**
 * The fine and coarse nudge for a table, shared by the dock's steppers and the grid's
 * `+`/`-` keys so the two can never disagree.
 * @param {number} decimals
 * @returns {{small: number, big: number}}
 */
export const stepsFor = (decimals) => (decimals ? { small: 0.1, big: 1 } : { small: 1, big: 5 });

/**
 * @param {number} n
 * @returns {string}
 */
export const signed = (n) => `${n > 0 ? '+' : ''}${n}`;

/**
 * The undo label's detail: what was done, and to how many cells.
 * @param {string} desc
 * @param {Rect} rect ordered
 * @returns {string}
 */
export function opLabel(desc, rect) {
  const n = cellCount(rect);
  return `${desc} · ${n} ${n === 1 ? 'cell' : 'cells'}`;
}
```

- [ ] **Step 4: Run** `npx vitest run tests/ui/selection.test.js` — Expected: PASS.

- [ ] **Step 5: Commit** — `git add src/ui/components/selection.js tests/ui/selection.test.js && git commit -m "Resolve every grid selection to one rectangle (#105)"`

---

### Task 3: Labelled `SET_TABLE`, `rangeMode` state, range-aware advisor

**Files:** Modify `src/ui/state/reducer.js` (`SetTableAction` typedef ~line 102, `labelFor` ~line 738);
`src/ui/state/initialState.js` (typedef ~line 60, `tune` ~line 210);
`src/ui/components/advisorReports.js` (`countIn` ~line 37).
Tests: `tests/ui/state/reducer.test.js`, `tests/ui/advisor-reports.test.js`.

**Consumes:** `rectOf`, `inRect` (Task 2).
**Produces:** `{type:'SET_TABLE', table, value, label?: string}`; `tune.rangeMode: boolean` (default `false`).

- [ ] **Step 1: Write the failing tests.** Append to `tests/ui/state/reducer.test.js` (uses the file's existing `reducer`, `ACTIONS`, `makeInitialState` imports):

```js
describe('SET_TABLE labels (#105)', () => {
  it('appends the detail to the table name', () => {
    const s = reducer(makeInitialState(), { type: ACTIONS.SET_TABLE, table: 've', value: [[1]], label: 'scale +5% · 12 cells' });
    expect(s.history.past[0].label).toBe('VE edit · scale +5% · 12 cells');
  });
  it('keeps the bare name without one', () => {
    const s = reducer(makeInitialState(), { type: ACTIONS.SET_TABLE, table: 'afr', value: [[1]] });
    expect(s.history.past[0].label).toBe('Fuel edit');
  });
});

describe('tune.rangeMode (#105)', () => {
  it('starts off and is not undoable work', () => {
    const s0 = makeInitialState();
    expect(s0.tune.rangeMode).toBe(false);
    const edited = reducer(s0, { type: ACTIONS.SET_TABLE, table: 've', value: [[1]] });
    const undone = reducer(edited, { type: ACTIONS.UNDO });
    const toggled = reducer(undone, { type: ACTIONS.SET_TUNE_FIELD, field: 'rangeMode', value: true });
    expect(toggled.tune.rangeMode).toBe(true);
    expect(toggled.history.past).toHaveLength(0);
    expect(toggled.history.future).toHaveLength(1);
  });
});
```

Check the existing import names at the top of `reducer.test.js` first and match them.

Append to `tests/ui/advisor-reports.test.js`:

```js
describe('a range selection (#105)', () => {
  it('counts only flagged cells inside the rectangle', () => {
    const cal = {
      spark: [], underAdvanced: [], pastMbt: [],
      overAdvanced: [{ ri: 0, ci: 0 }, { ri: 1, ci: 1 }, { ri: 3, ci: 3 }],
    };
    const r = sparkReport(cal, { type: 'range', r1: 1, c1: 1, r2: 0, c2: 0 });
    expect(r.state).toBe('group-over');
    expect(r.detail.count).toBe(2);
  });
  it('fuel counts a range the same way', () => {
    const cal = { fuelAdv: [], wrongMix: [{ ri: 2, ci: 2 }, { ri: 5, ci: 7 }] };
    expect(fuelReport(cal, { type: 'range', r1: 2, c1: 2, r2: 4, c2: 4 }).detail.count).toBe(1);
  });
});
```

Match the file's existing `sparkReport`/`fuelReport` imports and the exact `calAdvice` field names its other tests use.

- [ ] **Step 2: Run** `npx vitest run tests/ui/state/reducer.test.js tests/ui/advisor-reports.test.js` — Expected: FAIL on the new tests.

- [ ] **Step 3: Implement.**

`reducer.js` — typedef: `@typedef {{type: 'SET_TABLE', table: 've'|'timing'|'afr', value: number[][], label?: string}} SetTableAction`,
with a line: `label` is the undo entry's detail, e.g. "scale +5% · 12 cells". In `labelFor`, replace `return label;` with:

```js
      // A bulk edit names itself ("VE edit · smooth · 20 cells"); an edit that doesn't
      // — ACCEPT RE-LOGGED VALUES, a test's bare dispatch — keeps the table's name.
      return action.label ? `${label} · ${action.label}` : label;
```

`initialState.js` — in `tune`, after `selection: null,` add `rangeMode: false,`. Typedef: `selection` becomes
`@property {import('../components/selection.js').Selection|null} selection the currently selected calibration-grid cell, row, column or range, or null`
and add `@property {boolean} rangeMode true while TUNE's grids take two taps as a range (touch); shared by AIR, SPARK and FUEL, and outside the undo snapshot`.

`advisorReports.js` — import `{ inRect, rectOf } from './selection.js'` and replace `countIn`:

```js
/** How many of a category fall inside the selected row, column or range? */
function countIn(arr, selection) {
  const rect = rectOf(selection);
  return arr.filter((c) => inRect(rect, c.ri, c.ci)).length;
}
```

Also update the two `// A row or column.` comments in `sparkReport`/`fuelReport` to `// A row, column or range.`

- [ ] **Step 4: Run** `npx vitest run tests/ui/state tests/ui/advisor-reports.test.js tests/ui/undo-controls.test.jsx` — Expected: PASS.

- [ ] **Step 5: Commit** — `git commit -am "Let a table edit name itself, and count a range in the advisor (#105)"`

---

### Task 4: `SelectionDock` — ops, tabs, range title, labels

**Files:** Modify `src/ui/components/SelectionDock.jsx`; screens
`src/ui/screens/tune/{Airflow,Spark,Fuel}Screen.jsx` (the `setData` prop only).
Test: `tests/ui/range-selection.test.jsx` (new).

**Consumes:** Task 1 ops; Task 2 helpers; Task 3 `label`.
**Produces:** `SelectionDock` prop `setData: (next: number[][], label: string) => void`.

Behaviour:
- `rect = rectOf(selection)`, `count = cellCount(rect)`, `current` = mean over `rect` (same values as today for cell/row/col).
- `apply(delta)` → `setData(addRect(data, rect, delta, b), opLabel(signed(delta), rect))`, after `setDraft(null)`.
- `setAbs(v)` → `setData(setRect(...), opLabel(\`set ${Number(v.toFixed(2))}\`, rect))`.
- Tabs via `Seg` (`label="Edit mode"`, options ADD/SCALE/SET, ids `add`/`scale`/`set`).
  SCALE steppers `[-5, -1, 1, 5]` → `scaleRect`, label `scale ${signed(p)}%`, button text `+5%`.
  SET: `<input type="number" aria-label="Set value">` + `<Button variant="ghost" size="sm">APPLY</Button>`; Enter applies; empty/non-finite does nothing; applying clears the field.
- If `count > 1`: `<Button variant="ghost" size="sm">INTERPOLATE</Button>` and `SMOOTH` → `interpolateRect`/`smoothRect`, labels `interpolate`/`smooth`.
- Title for a range: `Range · ${RPM[c1]}–${RPM[c2]} RPM × ${LOAD[r2]}–${LOAD[r1]} kPa · ${count} cells`, collapsing an axis to one number when its two ends are equal.
- `selKey = selectionKey(selection)`. In the prop-change reset block, also `if (!selection) { setMode('add'); setSetText(''); }`.
- `commitDraft`'s no-op check becomes `count === 1 && draft === current`.

- [ ] **Step 1: Write the failing tests** — create `tests/ui/range-selection.test.jsx`:

```jsx
// @vitest-environment jsdom

/**
 * Range selection, bulk ops and keyboard tuning on TUNE's grids (#105).
 *
 * Mounted through the real screens and store, because the property that matters most —
 * every bulk edit is exactly ONE undo step with a label saying what it did — lives in
 * the join between the dock, the reducer and the undo button.
 */

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import React from 'react';
import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { AirflowScreen } from '../../src/ui/screens/tune/AirflowScreen.jsx';
import { FuelScreen } from '../../src/ui/screens/tune/FuelScreen.jsx';
import { SparkScreen } from '../../src/ui/screens/tune/SparkScreen.jsx';
import { ACTIONS } from '../../src/ui/state/reducer.js';
import { StoreProvider, useHistory, useTune } from '../../src/ui/state/StoreProvider.jsx';

class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }
const hadResizeObserver = 'ResizeObserver' in window;
if (!hadResizeObserver) window.ResizeObserver = ResizeObserverStub;
// jsdom 25 has no PointerEvent, and without one `pointerType`, `shiftKey` and `buttons`
// never reach React. MouseEvent carries the last two; this adds the first.
class PointerEventStub extends MouseEvent {
  constructor(type, init = {}) { super(type, init); this.pointerType = init.pointerType ?? ''; }
}
const hadPointerEvent = 'PointerEvent' in window;
if (!hadPointerEvent) window.PointerEvent = PointerEventStub;
afterAll(() => {
  if (!hadResizeObserver) delete window.ResizeObserver;
  if (!hadPointerEvent) delete window.PointerEvent;
});
afterEach(cleanup);

/** Exposes the store so tests can read tables and the undo stack. */
let store;
function Spy() {
  const [tune, dispatch] = useTune();
  const history = useHistory();
  store = { tune, dispatch, history };
  return null;
}

const VE_ADVICE = { inSync: true, maxAbs: 0, recs: [], deltas: [] };
function mountAir() {
  return render(<StoreProvider><Spy /><AirflowScreen veAdvice={VE_ADVICE} veTruth={[[0]]} /></StoreProvider>);
}
const select = (value) => store.dispatch({ type: ACTIONS.SET_TUNE_FIELD, field: 'selection', value });
const dock = () => screen.getByTestId('selection-dock');
const undoLabel = () => store.history.past.at(-1)?.label;

describe('SelectionDock on a range', () => {
  it('titles the range by its axes and cell count', () => {
    mountAir();
    select({ type: 'range', r1: 3, c1: 2, r2: 1, c2: 5 });
    // LOAD = [200,150,100,70,40,20], RPM = [800,...,7500]
    expect(within(dock()).getByText('Range · 2500–5500 RPM × 70–150 kPa · 12 cells')).toBeTruthy();
  });

  it('adds to every cell in one undo step, with a label', () => {
    mountAir();
    const before = store.tune.ve.map((r) => [...r]);
    select({ type: 'range', r1: 0, c1: 0, r2: 1, c2: 1 });
    fireEvent.click(within(dock()).getByRole('button', { name: '+5' }));
    expect(store.tune.ve[1][1]).toBe(Number((before[1][1] + 5).toFixed(2)));
    expect(store.tune.ve[2][2]).toBe(before[2][2]);
    expect(store.history.past).toHaveLength(1);
    expect(undoLabel()).toBe('VE edit · +5 · 4 cells');
  });

  it('scales by percent', () => {
    mountAir();
    const before = store.tune.ve.map((r) => [...r]);
    select({ type: 'row', row: 2 });
    fireEvent.click(within(dock()).getByRole('button', { name: 'SCALE' }));
    fireEvent.click(within(dock()).getByRole('button', { name: '+5%' }));
    expect(store.tune.ve[2][4]).toBe(Number(Math.min(before[2][4] * 1.05, 130).toFixed(2)));
    expect(undoLabel()).toBe('VE edit · scale +5% · 8 cells');
  });

  it('sets a typed value with Enter, and ignores an empty field', () => {
    mountAir();
    select({ type: 'range', r1: 0, c1: 0, r2: 0, c2: 2 });
    fireEvent.click(within(dock()).getByRole('button', { name: 'SET' }));
    const field = within(dock()).getByLabelText('Set value');
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(store.history.past).toHaveLength(0);
    fireEvent.change(field, { target: { value: '77' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(store.tune.ve[0].slice(0, 3)).toEqual([77, 77, 77]);
    expect(undoLabel()).toBe('VE edit · set 77 · 3 cells');
  });

  it('interpolates and smooths, one undo step each', () => {
    mountAir();
    select({ type: 'range', r1: 0, c1: 0, r2: 2, c2: 3 });
    fireEvent.click(within(dock()).getByRole('button', { name: 'INTERPOLATE' }));
    fireEvent.click(within(dock()).getByRole('button', { name: 'SMOOTH' }));
    expect(store.history.past.map((e) => e.label)).toEqual([
      'VE edit · interpolate · 12 cells',
      'VE edit · smooth · 12 cells',
    ]);
  });

  it('hides INTERPOLATE and SMOOTH for a single cell', () => {
    mountAir();
    select({ type: 'cell', row: 1, col: 1 });
    expect(within(dock()).queryByRole('button', { name: 'SMOOTH' })).toBeNull();
    expect(within(dock()).queryByRole('button', { name: 'INTERPOLATE' })).toBeNull();
  });

  it('goes back to ADD after the dock closes', () => {
    mountAir();
    select({ type: 'row', row: 2 });
    fireEvent.click(within(dock()).getByRole('button', { name: 'SCALE' }));
    fireEvent.click(within(dock()).getByRole('button', { name: 'DONE' }));
    select({ type: 'row', row: 2 });
    expect(within(dock()).getByRole('button', { name: 'ADD' }).getAttribute('aria-pressed')).toBe('true');
  });
});
```

- [ ] **Step 2: Run** `npx vitest run tests/ui/range-selection.test.jsx` — Expected: FAIL (range title missing, no SCALE tab).

- [ ] **Step 3: Implement** the behaviour list above in `SelectionDock.jsx`. Imports:

```js
import { LOAD, RPM, addRect, interpolateRect, scaleRect, setRect, smoothRect } from '../../sim/index.js';
import { Button } from '../primitives/Button.jsx';
import { Panel } from '../primitives/Panel.jsx';
import { Seg } from '../primitives/Seg.jsx';
import { T, shadowAlpha } from '../theme.js';
import { cellCount, opLabel, rectOf, selectionKey, signed, stepsFor } from './selection.js';
```

(`clamp`/`clone2D` are no longer used.) Core:

```js
  const [mode, setMode] = React.useState(/** @type {'add'|'scale'|'set'} */ ('add'));
  const [setText, setSetText] = React.useState('');
  const selKey = selectionKey(selection);
  // ...existing prevSelKey / prevData state...
  if (selKey !== prevSelKey || data !== prevData) {
    setPrevSelKey(selKey);
    setPrevData(data);
    setDraft(null);
    // A closed dock forgets which op it was on: the next selection opens on ADD, the
    // one every table edit starts from.
    if (!selection) { setMode('add'); setSetText(''); }
  }

  if (!selection) return null;
  const rect = rectOf(selection);
  const count = cellCount(rect);
  const bounds = { min, max };
  let sum = 0;
  for (let r = rect.r1; r <= rect.r2; r++) for (let c = rect.c1; c <= rect.c2; c++) sum += data[r][c];
  const current = sum / count;

  /** Every edit the dock makes goes through here: one table write, one undo step. */
  const write = (next, desc) => { setDraft(null); setData(next, opLabel(desc, rect)); };
  const apply = (delta) => write(addRect(data, rect, delta, bounds), signed(delta));
  const scale = (pct) => write(scaleRect(data, rect, pct, bounds), `scale ${signed(pct)}%`);
  const setAbs = (v) => write(setRect(data, rect, v, bounds), `set ${Number(v.toFixed(2))}`);
  const applySet = () => {
    const v = Number(setText);
    if (setText.trim() === '' || !Number.isFinite(v)) return;
    setAbs(v);
    setSetText('');
  };
```

Keep the existing comment above `apply` about abandoning the draft (now on `write`).
`commitDraft` keeps its body except `if (count === 1 && draft === current)` and updates its comment
("A single cell only: for anything larger `current` is the MEAN…"). Title:

```js
  const span = (lo, hi) => (lo === hi ? `${lo}` : `${lo}–${hi}`);
  let sel;
  if (selection.type === 'row') sel = `Row · ${LOAD[selection.row]} kPa MAP`;
  else if (selection.type === 'col') sel = `Column · ${RPM[selection.col]} RPM`;
  else if (selection.type === 'range') sel = `Range · ${span(RPM[rect.c1], RPM[rect.c2])} RPM × ${span(LOAD[rect.r2], LOAD[rect.r1])} kPa · ${count} ${count === 1 ? 'cell' : 'cells'}`;
  else sel = `${RPM[selection.col]} RPM · ${LOAD[selection.row]} kPa MAP`;
```

Reference panel condition: `selection.type === 'cell' && kind`. Steps: `const { small: smallStep, big: bigStep } = stepsFor(decimals);`.
Replace the stepper row with:

```jsx
      <div style={{ marginTop: 9 }}>
        <Seg label="Edit mode" value={mode} onChange={(id) => setMode(/** @type {any} */ (id))} options={[
          { id: 'add', label: 'ADD' }, { id: 'scale', label: 'SCALE' }, { id: 'set', label: 'SET' },
        ]} />
      </div>
      {mode === 'set' ? (
        <div style={{ display: 'flex', gap: 7, marginTop: 9 }}>
          <input
            type="number" aria-label="Set value" value={setText} step={smallStep}
            onChange={(e) => setSetText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') applySet(); }}
            style={{ flex: 1, padding: '9px 10px', borderRadius: 8, border: `1px solid ${T.line}`, background: T.panel2, color: T.ink, fontFamily: T.mono, fontSize: 13 }}
          />
          <Button variant="ghost" size="sm" onClick={applySet}>APPLY</Button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 7, marginTop: 9 }}>
          {/* existing comment about one colour for all four */}
          {(mode === 'scale' ? [-5, -1, 1, 5] : [-bigStep, -smallStep, smallStep, bigStep]).map((d, i) => (
            <button key={i} onClick={() => (mode === 'scale' ? scale(d) : apply(d))} style={{ /* existing stepper style */ }}>
              {signed(d)}{mode === 'scale' ? '%' : ''}
            </button>
          ))}
        </div>
      )}
      {count > 1 && (
        <div style={{ display: 'flex', gap: 7, marginTop: 9 }}>
          <Button variant="ghost" size="sm" onClick={() => write(interpolateRect(data, rect, bounds), 'interpolate')}>INTERPOLATE</Button>
          <Button variant="ghost" size="sm" onClick={() => write(smoothRect(data, rect, bounds), 'smooth')}>SMOOTH</Button>
        </div>
      )}
```

Update the header JSDoc: the dock edits a cell, row, column or range; `setData` takes `(next, label)`.

In each screen, change `setData={(value) => dispatch({ type: ACTIONS.SET_TABLE, table: 've', value })}` to
`setData={(value, label) => dispatch({ type: ACTIONS.SET_TABLE, table: 've', value, label })}` (`'timing'` in Spark, `'afr'` in Fuel).

- [ ] **Step 4: Run** `npx vitest run tests/ui/range-selection.test.jsx tests/ui/undo-controls.test.jsx tests/ui/tune-screens.test.jsx tests/ui/button-call-sites.test.jsx` — Expected: PASS. Existing stepper tests that assert the stepper text `+1`/`-5` still match (`signed` yields the same strings).

- [ ] **Step 5: Commit** — `git commit -am "Give the dock scale, set, interpolate and smooth, one undo step each (#105)"`

---

### Task 5: Grid input — range highlight, drag, shift-click, two-tap, `SelectModeBar`

**Files:** Create `src/ui/components/SelectModeBar.jsx`. Modify `src/ui/components/TuningGrid.jsx`,
the three screens. Test: extend `tests/ui/range-selection.test.jsx`.

**Consumes:** `rectOf`, `inRect`, `anchorOf`, `spanSelection` (Task 2); `tune.rangeMode` (Task 3).
**Produces:** `TuningGrid` props add `rangeMode?: boolean`; `SelectModeBar({ rangeMode, setRangeMode, setSelection })`.

Cells get `aria-label={\`${RPM[ci]} RPM, ${LOAD[ri]} kPa\`}` so tests (and screen readers) can find one.

- [ ] **Step 1: Write the failing tests** — append to `tests/ui/range-selection.test.jsx`:

```jsx
const cell = (rpm, kpa) => within(screen.getByTestId('tuning-grid')).getByRole('button', { name: `${rpm} RPM, ${kpa} kPa` });
const mouse = { pointerType: 'mouse', button: 0, buttons: 1 };

describe('selecting a range on the grid', () => {
  it('a mouse drag selects the rectangle it covers', () => {
    mountAir();
    fireEvent.pointerDown(cell(1500, 150), mouse);
    fireEvent.pointerEnter(cell(3500, 70), mouse);
    fireEvent.pointerUp(window, mouse);
    expect(store.tune.selection).toEqual({ type: 'range', r1: 1, c1: 1, r2: 3, c2: 3 });
    // the click that follows a mouse press must not collapse it back to one cell
    fireEvent.click(cell(3500, 70), { detail: 1 });
    expect(store.tune.selection.type).toBe('range');
  });

  it('moving after release does not keep dragging', () => {
    mountAir();
    fireEvent.pointerDown(cell(1500, 150), mouse);
    fireEvent.pointerUp(window, mouse);
    fireEvent.pointerEnter(cell(3500, 70), { pointerType: 'mouse', buttons: 0 });
    expect(store.tune.selection).toEqual({ type: 'cell', row: 1, col: 1 });
  });

  it('shift-click extends from the anchor', () => {
    mountAir();
    fireEvent.pointerDown(cell(2500, 100), mouse);
    fireEvent.pointerUp(window, mouse);
    fireEvent.pointerDown(cell(5500, 40), { ...mouse, shiftKey: true });
    fireEvent.pointerUp(window, mouse);
    expect(store.tune.selection).toEqual({ type: 'range', r1: 2, c1: 2, r2: 4, c2: 5 });
  });

  it('a touch press does not start a drag', () => {
    mountAir();
    fireEvent.pointerDown(cell(1500, 150), { pointerType: 'touch', buttons: 1 });
    fireEvent.pointerEnter(cell(3500, 70), { pointerType: 'touch', buttons: 1 });
    expect(store.tune.selection).toBeNull();
  });

  it('highlights every cell in the range', () => {
    mountAir();
    select({ type: 'range', r1: 0, c1: 0, r2: 1, c2: 1 });
    expect(cell(1500, 150).getAttribute('aria-pressed')).toBe('true');
    expect(cell(2500, 150).getAttribute('aria-pressed')).toBe('false');
  });

  it('SELECT RANGE takes two taps, and a third starts over', () => {
    mountAir();
    fireEvent.click(screen.getByRole('button', { name: 'SELECT RANGE' }));
    fireEvent.click(cell(1500, 150));
    expect(store.tune.selection).toEqual({ type: 'range', r1: 1, c1: 1, r2: 1, c2: 1 });
    fireEvent.click(cell(3500, 70));
    expect(store.tune.selection).toEqual({ type: 'range', r1: 1, c1: 1, r2: 3, c2: 3 });
    fireEvent.click(cell(800, 20));
    expect(store.tune.selection).toEqual({ type: 'range', r1: 5, c1: 0, r2: 5, c2: 0 });
  });

  it('ALL selects the whole table, and switching mode clears', () => {
    mountAir();
    fireEvent.click(screen.getByRole('button', { name: 'ALL' }));
    expect(store.tune.selection).toEqual({ type: 'range', r1: 0, c1: 0, r2: 5, c2: 7 });
    fireEvent.click(screen.getByRole('button', { name: 'SELECT RANGE' }));
    expect(store.tune.selection).toBeNull();
  });

  it('range mode is one flag shared by AIR, SPARK and FUEL', () => {
    const calAdvice = { spark: [], overAdvanced: [], underAdvanced: [], pastMbt: [], fuelAdv: [], wrongMix: [] };
    render(
      <StoreProvider>
        <Spy />
        <SparkScreen calAdvice={calAdvice} />
        <FuelScreen calAdvice={calAdvice} />
      </StoreProvider>,
    );
    const [sparkRange, fuelRange] = screen.getAllByRole('button', { name: 'SELECT RANGE' });
    fireEvent.click(sparkRange);
    expect(store.tune.rangeMode).toBe(true);
    expect(fuelRange.getAttribute('aria-pressed')).toBe('true');
  });
});
```

Before writing the last test, check the real props `SparkScreen`/`FuelScreen` take
(`grep -n "export function" src/ui/screens/tune/SparkScreen.jsx src/ui/screens/tune/FuelScreen.jsx`)
and the `calAdvice` fields `tune-screens.test.jsx` passes, and match them.

- [ ] **Step 2: Run** `npx vitest run tests/ui/range-selection.test.jsx` — Expected: FAIL (no cell aria-labels / no SELECT RANGE).

- [ ] **Step 3: Implement.**

`src/ui/components/SelectModeBar.jsx`:

```jsx
/**
 * The calibration grid's selection mode, shown above each table.
 *
 * Airflow and spark errors come in BANDS — a lean patch across high load, a
 * knock-limited corner — so the edit that answers one is a region, not a point. A mouse
 * already selects one by dragging or shift-clicking; a finger cannot, because a drag
 * across the grid scrolls it. SELECT RANGE is how touch gets there: two taps, two
 * corners. ALL is the whole table, which is what a global trim is.
 *
 * `rangeMode` is one flag on the TUNE slice, so it is the same on AIR, SPARK and FUEL.
 * Shared by those three screens, like `TuningGrid` beside it.
 */

import React from 'react';

import { LOAD, RPM } from '../../sim/index.js';
import { Button } from '../primitives/Button.jsx';
import { Seg } from '../primitives/Seg.jsx';

/**
 * @param {object} props
 * @param {boolean} props.rangeMode
 * @param {(next: boolean) => void} props.setRangeMode
 * @param {(next: import('./selection.js').Selection|null) => void} props.setSelection
 * @returns {React.ReactElement}
 */
export function SelectModeBar({ rangeMode, setRangeMode, setSelection }) {
  return (
    <div style={{ display: 'flex', gap: 7, alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
      {/* Changing mode clears the selection: a half-taken range means nothing in
          single-cell mode, and a single cell is not an anchor. */}
      <Seg
        label="Selection mode"
        value={rangeMode ? 'range' : 'cell'}
        onChange={(id) => { setRangeMode(id === 'range'); setSelection(null); }}
        options={[{ id: 'cell', label: 'SINGLE CELL' }, { id: 'range', label: 'SELECT RANGE' }]}
      />
      <Button
        variant="quiet" size="sm"
        onClick={() => setSelection({ type: 'range', r1: 0, c1: 0, r2: LOAD.length - 1, c2: RPM.length - 1 })}
      >ALL</Button>
    </div>
  );
}
```

`TuningGrid.jsx` — imports `{ anchorOf, inRect, rectOf, spanSelection } from './selection.js'`;
`Selection` typedef becomes `/** @typedef {import('./selection.js').Selection} Selection */`
(keep the export name so screens' `import('.../TuningGrid.jsx').Selection` still resolves). Logic:

```js
export function TuningGrid({ data, min, max, decimals, selection, setSelection, rangeMode = false }) {
  const fmt = (v) => (decimals ? v.toFixed(decimals) : Math.round(v));
  const rect = selection ? rectOf(selection) : null;
  const anchor = selection ? anchorOf(selection) : null;
  // The anchor of a mouse drag in progress, or null. A ref, not state: it changes on
  // every press and release and nothing renders from it.
  const dragFrom = React.useRef(/** @type {{r: number, c: number}|null} */ (null));
  // Which kind of pointer pressed last. A mouse press has already selected by the time
  // its click arrives, so that click must not select again (it would collapse a drag
  // back to one cell). Keyboard clicks carry `detail === 0` and always go through.
  const lastPointer = React.useRef('');

  React.useEffect(() => {
    const end = () => { dragFrom.current = null; };
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    return () => {
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };
  }, []);

  /**
   * A tap or plain press on a cell. In SELECT RANGE mode the first tap is a one-cell
   * range (the anchor) and the second completes it; a tap on anything else starts over.
   * @returns {{r: number, c: number}} the anchor the new selection extends from
   */
  const tap = (ri, ci) => {
    const here = { r: ri, c: ci };
    if (rangeMode && selection?.type === 'range' && selection.r1 === selection.r2 && selection.c1 === selection.c2) {
      const from = { r: selection.r1, c: selection.c1 };
      setSelection(spanSelection(from, here, true));
      return from;
    }
    setSelection(rangeMode ? spanSelection(here, here, true) : { type: 'cell', row: ri, col: ci });
    return here;
  };

  const onCellPointerDown = (e, ri, ci) => {
    lastPointer.current = e.pointerType;
    // Touch and pen keep scrolling the grid; they select on click, below.
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    if (e.shiftKey && anchor) {
      setSelection(spanSelection(anchor, { r: ri, c: ci }, rangeMode));
      dragFrom.current = anchor;
      return;
    }
    dragFrom.current = tap(ri, ci);
  };
  const onCellPointerEnter = (e, ri, ci) => {
    if (!dragFrom.current || !(e.buttons & 1)) return;
    setSelection(spanSelection(dragFrom.current, { r: ri, c: ci }, rangeMode));
  };
  const onCellClick = (e, ri, ci) => {
    if (e.detail > 0 && lastPointer.current === 'mouse') return;
    tap(ri, ci);
  };
  const selectRow = (row) => setSelection({ type: 'row', row });
  const selectCol = (col) => setSelection({ type: 'col', col });
  const isSelected = (ri, ci) => Boolean(rect && inRect(rect, ri, ci));
  const isAnchor = (ri, ci) => selection?.type === 'range' && anchor.r === ri && anchor.c === ci;
```

Cell button:

```jsx
              <button
                key={ci}
                aria-label={`${RPM[ci]} RPM, ${LOAD[ri]} kPa`}
                aria-pressed={isSelected(ri, ci)}
                onPointerDown={(e) => onCellPointerDown(e, ri, ci)}
                onPointerEnter={(e) => onCellPointerEnter(e, ri, ci)}
                onClick={(e) => onCellClick(e, ri, ci)}
                style={{
                  width: 51, height: 37, flexShrink: 0,
                  border: isAnchor(ri, ci) ? `2px solid ${T.acc}` : isSelected(ri, ci) ? `2px solid ${T.ink}` : `1px solid ${shadowAlpha(0.35)}`,
                  background: heat(val, min, max), color: T.ink,
                  fontFamily: T.mono, fontSize: 12, fontWeight: 700,
                  // A mouse drag across cells must not start a text selection.
                  userSelect: 'none',
                }}
              >{fmt(val)}</button>
```

Row/col header buttons: `onClick={() => selectRow(ri)}` / `selectCol(ci)`, highlight unchanged.
Update the header comment: cells select by click, drag, shift-click or two taps in range mode.

Screens — each of the three:

```js
  const { ve, selection, rangeMode } = tune;
  const setRangeMode = (value) => dispatch({ type: ACTIONS.SET_TUNE_FIELD, field: 'rangeMode', value });
```

render `<SelectModeBar rangeMode={rangeMode} setRangeMode={setRangeMode} setSelection={setSelection} />`
immediately above `<TuningGrid …>`, and pass `rangeMode={rangeMode}` to `TuningGrid`. Update the intro copy's
"Tap any cell for reference data." to "Tap any cell for reference data; drag or shift-click for a range." on all three.

- [ ] **Step 4: Run** `npx vitest run tests/ui` — Expected: PASS (existing tests that click cells by
  `fireEvent.click` without `detail` still select: `detail` defaults to 0).

- [ ] **Step 5: Commit** — `git add -A src/ui tests/ui && git commit -m "Select a range by drag, shift-click or two taps (#105)"`

---

### Task 6: Keyboard tuning

**Files:** Modify `src/ui/components/TuningGrid.jsx`, the three screens (pass `setData`).
Test: extend `tests/ui/range-selection.test.jsx`.

**Consumes:** `addRect` (Task 1); `rectOf`, `anchorOf`, `spanSelection`, `stepsFor`, `opLabel`, `signed` (Task 2).
**Produces:** `TuningGrid` props add `setData?: (next: number[][], label: string) => void`.

- [ ] **Step 1: Write the failing tests** — append:

```jsx
const grid = () => screen.getByTestId('tuning-grid');

describe('keyboard tuning', () => {
  it('arrows move a single cell, clamped to the table', () => {
    mountAir();
    select({ type: 'cell', row: 0, col: 0 });
    fireEvent.keyDown(grid(), { key: 'ArrowRight' });
    fireEvent.keyDown(grid(), { key: 'ArrowDown' });
    expect(store.tune.selection).toEqual({ type: 'cell', row: 1, col: 1 });
    select({ type: 'cell', row: 0, col: 0 });
    fireEvent.keyDown(grid(), { key: 'ArrowUp' });
    expect(store.tune.selection).toEqual({ type: 'cell', row: 0, col: 0 });
  });

  it('an arrow with nothing selected selects the first cell', () => {
    mountAir();
    fireEvent.keyDown(grid(), { key: 'ArrowDown' });
    expect(store.tune.selection).toEqual({ type: 'cell', row: 0, col: 0 });
  });

  it('shift+arrows grow and shrink a range from the anchor', () => {
    mountAir();
    select({ type: 'cell', row: 1, col: 1 });
    fireEvent.keyDown(grid(), { key: 'ArrowRight', shiftKey: true });
    fireEvent.keyDown(grid(), { key: 'ArrowRight', shiftKey: true });
    fireEvent.keyDown(grid(), { key: 'ArrowDown', shiftKey: true });
    expect(store.tune.selection).toEqual({ type: 'range', r1: 1, c1: 1, r2: 2, c2: 3 });
    fireEvent.keyDown(grid(), { key: 'ArrowLeft', shiftKey: true });
    expect(store.tune.selection).toEqual({ type: 'range', r1: 1, c1: 1, r2: 2, c2: 2 });
  });

  it('+ and - nudge the selection, Shift for the big step, one undo step each', () => {
    mountAir();
    const v0 = store.tune.ve[1][1];
    select({ type: 'cell', row: 1, col: 1 });
    fireEvent.keyDown(grid(), { key: '=', code: 'Equal' });
    fireEvent.keyDown(grid(), { key: '+', code: 'Equal', shiftKey: true });
    fireEvent.keyDown(grid(), { key: '-', code: 'NumpadSubtract' });
    expect(store.tune.ve[1][1]).toBe(Number((v0 + 1 + 5 - 1).toFixed(2)));
    expect(store.history.past.map((e) => e.label)).toEqual([
      'VE edit · +1 · 1 cell', 'VE edit · +5 · 1 cell', 'VE edit · -1 · 1 cell',
    ]);
  });

  it('Esc clears the selection', () => {
    mountAir();
    select({ type: 'cell', row: 1, col: 1 });
    fireEvent.keyDown(grid(), { key: 'Escape' });
    expect(store.tune.selection).toBeNull();
  });

  it('ignores Ctrl/Cmd combinations, so undo is left to the global handler', () => {
    mountAir();
    select({ type: 'cell', row: 1, col: 1 });
    fireEvent.keyDown(grid(), { key: '=', code: 'Equal', metaKey: true });
    fireEvent.keyDown(grid(), { key: 'ArrowRight', ctrlKey: true });
    expect(store.history.past).toHaveLength(0);
    expect(store.tune.selection).toEqual({ type: 'cell', row: 1, col: 1 });
  });

  it('the grid is focusable', () => {
    mountAir();
    expect(grid().getAttribute('tabindex')).toBe('0');
  });
});
```

Add one test to `tests/ui/undo-controls.test.jsx`'s full-app section (it already renders `EcuLab`): after
editing a cell via `+` on the focused grid, `fireEvent.keyDown(grid, { key: 'z', metaKey: true })` restores the
value — proving the grid does not swallow undo. Follow that file's existing navigation helpers to reach TUNE > AIR.

- [ ] **Step 2: Run** `npx vitest run tests/ui/range-selection.test.jsx` — Expected: FAIL on the keyboard tests.

- [ ] **Step 3: Implement** in `TuningGrid.jsx` — add `setData` to props and JSDoc, import `addRect` from
`../../sim/index.js` and `opLabel, signed, stepsFor` from `./selection.js`:

```js
  const ARROWS = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
  const NUDGE = { Equal: 1, NumpadAdd: 1, Minus: -1, NumpadSubtract: -1 };
  const lastR = LOAD.length - 1, lastC = RPM.length - 1;
  const clampR = (r) => Math.min(Math.max(r, 0), lastR);
  const clampC = (c) => Math.min(Math.max(c, 0), lastC);

  const onKeyDown = (e) => {
    // Ctrl/Cmd/Alt belong to the global undo handler and to the browser.
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'Escape') {
      if (selection) { e.preventDefault(); setSelection(null); }
      return;
    }
    const move = ARROWS[e.key];
    if (move) {
      e.preventDefault();
      if (!selection) { setSelection({ type: 'cell', row: 0, col: 0 }); return; }
      if (e.shiftKey) {
        // The moving corner is whichever one is not the anchor.
        const far = selection.type === 'range'
          ? { r: selection.r2, c: selection.c2 }
          : { r: rect.r1 === anchor.r ? rect.r2 : rect.r1, c: rect.c1 === anchor.c ? rect.c2 : rect.c1 };
        setSelection(spanSelection(anchor, { r: clampR(far.r + move[0]), c: clampC(far.c + move[1]) }));
      } else {
        setSelection({ type: 'cell', row: clampR(anchor.r + move[0]), col: clampC(anchor.c + move[1]) });
      }
      return;
    }
    // By physical key, not character: `+` already needs Shift on most layouts, so
    // `e.key` could not tell "+" from "coarse +".
    const sign = NUDGE[e.code];
    if (sign && selection && setData) {
      e.preventDefault();
      const { small, big } = stepsFor(decimals);
      const delta = sign * (e.shiftKey ? big : small);
      setData(addRect(data, rect, delta, { min, max }), opLabel(signed(delta), rect));
    }
  };
```

On the outer `<div data-testid="tuning-grid">` add `tabIndex={0}`, `onKeyDown={onKeyDown}`, and
`aria-label="Calibration table: arrows move, Shift+arrows select a range, plus and minus adjust"`.

Screens: pass `setData={(value, label) => dispatch({ type: ACTIONS.SET_TABLE, table: '<table>', value, label })}` to
`TuningGrid` too — hoist it to a `const setTable = …` used by both grid and dock.

- [ ] **Step 4: Run** `npx vitest run tests/ui` — Expected: PASS.

- [ ] **Step 5: Commit** — `git commit -am "Tune the grid from the keyboard (#105)"`

---

### Task 7: Docs and full verification

**Files:** Modify `src/ui/components/README.md`.

- [ ] **Step 1:** In the README paragraph on `TuningGrid` and `SelectionDock`, add: `SelectModeBar` sits above each
  grid for the same reason; `selection.js` is the one place a selection becomes a rectangle and an edit gets its undo
  label, and the maths it hands to stays in `src/sim/tables.js`.

- [ ] **Step 2: Run everything:**

```bash
npx vitest run
npm run lint
npm run typecheck
npm run build
```

Expected: all tests pass (1308 before this PR, plus the new ones), lint clean with 0 warnings, typecheck clean,
build succeeds, `tests/fingerprint.test.js` unchanged.

- [ ] **Step 3: Check it in the browser** — `npm run dev`, open TUNE > AIR: drag a range, shift-click, SCALE +5%,
  INTERPOLATE, undo each; switch to SELECT RANGE at phone width and do two taps.

- [ ] **Step 4: Commit** — `git commit -am "Document where range selection lives (#105)"`
