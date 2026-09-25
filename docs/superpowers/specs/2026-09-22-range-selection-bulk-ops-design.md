# Range Selection, Bulk Table Ops and Keyboard Tuning — Design

**Issue:** #105 (UI overhaul PR 4b), sub-issue of #6. Follows 4a (undo/redo, #93).
4c (diff-vs-stock overlay, #106) is separate and not in this spec.

**Goal:** Let the player edit a *region* of AIR, SPARK or FUEL in one move, the way
real tuning software does, without losing a single step of undo.

## Scope

| In | Out |
|---|---|
| Rectangular range selection: mouse drag, shift-click, two-tap on touch, ALL | Non-rectangular / multi-region selections |
| Bulk ops on any selection: add, scale %, set, interpolate, smooth | Diff-vs-stock overlay (4c, #106) |
| Keyboard: move, extend, adjust, clear | Copy/paste between tables |
| One undo step per op, with a label that says what it did | |

## What the code looks like today (verified against `7915ab8`)

- `TuningGrid` builds a `Selection` of `{type: 'cell'|'row'|'col', row?, col?}`.
- `SelectionDock` edits it. `apply(delta)` and `setAbs(v)` contain the maths inline,
  three branches each. `apply` rounds to 2 dp; `setAbs` does not round at all.
- The dock's draft/commit logic (`draft`, `commitDraft`, `COMMIT_KEYS`, and dropping the
  draft when `selection` or `data` changes) is what keeps a slider drag to one undo step
  and keeps an undo from being overwritten. It must not change.
- `SET_TABLE` is undoable, and `labelFor` names every table edit just "VE edit",
  "Spark edit" or "Fuel edit".
- `advisorReports.countIn` handles `row` and falls through to `col` for anything else,
  so a new selection type would silently count zero.
- `src/sim/math.js` imports `LOAD`/`RPM` from `tables.js`, so `tables.js` cannot import
  `clamp` back without a cycle.
- `EcuLab.jsx` owns a window-level Ctrl/Cmd+Z/Y handler.

## Decisions

### 1. Selection model: add a `range` type

`Selection` gains a fourth member:

```js
{ type: 'range', r1, c1, r2, c2 }   // any two corners; not necessarily ordered
```

`cell`, `row` and `col` stay exactly as they are. A UI helper `rectOf(selection)` in
`src/ui/components/selection.js` normalises any of the four types to an ordered rectangle
`{r1, c1, r2, c2}` (with `r1 <= r2`, `c1 <= c2`), plus `inRect(rect, ri, ci)` and a cell count.
Everything that edits works on the rectangle; only the grid, dock title and advisor care
about `type`.

Rejected: turning every selection into a rectangle (rewrites `advisorReports`, the dock
title and every test asserting `{type: 'row'}`, for no feature), and arbitrary cell sets
(nothing needs one; interpolate needs corners).

### 2. The maths lives in `src/sim/tables.js`

Pure functions, each returning a **new** table and writing **only** cells inside `rect`.
Every written value is clamped to `[min, max]` and rounded to 2 dp — today's `apply`
convention, which is the storage precision, not the display precision (VE cells carry
decimals from `veTruth` and must keep them). Clamping is a local helper, because of the
`math.js` import cycle above.

```js
addRect(table, rect, delta, { min, max })
scaleRect(table, rect, pct, { min, max })        // v * (1 + pct / 100)
setRect(table, rect, value, { min, max })
interpolateRect(table, rect, { min, max })
smoothRect(table, rect, { min, max })
```

- **Interpolate** is bilinear from the rectangle's four corner cells. Corners keep their
  values. A 1-row or 1-column rectangle reduces to a straight line between its two
  ends; a single cell is returned unchanged. Interpolation is by index, not by axis
  value — the axes are not evenly spaced, but tuning tools interpolate by cell and a
  player reads the grid by cell.
- **Smooth** sets each selected cell to the mean of its 3×3 neighbourhood, clipped at the
  table's edges. Neighbours are read from the **original** table, including cells outside
  the rectangle, so a range blends into its surroundings and the result does not depend
  on iteration order. One pass per click.

`SelectionDock`'s `apply` and `setAbs` are rewritten on top of `addRect` and `setRect`,
so the old cell/row/col paths and the new range path are one code path. `setAbs` gains
the 2 dp rounding as a side effect; the slider only produces step multiples, so no
existing value changes.

### 3. Grid input

- **Mouse, no mode needed.** `pointerdown` on a cell sets the anchor and selects that
  cell; moving onto another cell while the button is held extends a `range` from the
  anchor; `pointerup` ends it. Shift-click extends a `range` from the current anchor.
  Only `pointerType === 'mouse'` drags; touch keeps scrolling the grid.
- **Touch: `SelectModeBar`.** Above each grid: SINGLE CELL / SELECT RANGE, plus ALL.
  In SELECT RANGE, the first tap sets the anchor (shown as a one-cell range), the second
  completes the rectangle, and a third starts a new one. ALL selects the whole table.
  Changing mode clears the selection.
- **One flag.** `rangeMode` is a field on the TUNE slice, set with `SET_TUNE_FIELD`, so
  AIR, SPARK and FUEL share it and it survives switching between them. It is not
  undoable and does not mark the tables dirty.
- **Headers** keep selecting a row or column.
- **Highlight.** Every cell in the rectangle gets the selected border; the anchor is
  distinguishable so shift-click is predictable.

### 4. Keyboard

The grid container is focusable (`tabIndex=0`) and handles `keydown` while focused:

| Key | Does |
|---|---|
| Arrows | Move the selection to a single cell one step over (from the anchor), clamped to the table |
| Shift+arrows | Extend/shrink a `range` from the anchor |
| `=`/`+` and `-` (main row or numpad) | Add ± the small step to the selection; with Shift, the big step |
| Esc | Clear the selection |

Keys are matched on `e.code` (`Equal`, `Minus`, `NumpadAdd`, `NumpadSubtract`), because on
most layouts `+` already needs Shift and `e.key` could not tell "+" from "coarse +".
Any Ctrl/Cmd/Alt combination is ignored so the global undo handler keeps working. Each
`+`/`-` press is one dispatch, so one undo step. The steps are the dock's existing ones:
small `0.1`/`1`, big `1`/`5` depending on `decimals`.

### 5. Dock

- **Tabs** ADD / SCALE / SET choose what the stepper row does:
  - ADD: `−big −small +small +big`, as today.
  - SCALE: `−5% −1% +1% +5%`.
  - SET: a number field and APPLY (Enter also applies). Invalid or empty input does
    nothing.
- **INTERPOLATE** and **SMOOTH** are one-tap buttons under the steppers, shown only when
  the selection covers more than one cell.
- **Title:** `Range · 2500–5500 RPM × 70–150 kPa · 12 cells` for a range; cell, row and
  column titles unchanged. The readout shows the mean, as a row or column does today.
- **Reference panel:** still shown for a single cell only.
- **Slider and draft/commit:** unchanged. On a range, releasing the slider sets every
  cell to the released value, exactly as a row or column does now. `selKey` includes
  the range corners, so a new rectangle drops the draft.
- The tab choice is local component state and resets to ADD when the dock closes.

### 6. Undo labels

`SET_TABLE` takes an optional `label`. `labelFor` returns `` `${table label} · ${label}` ``
when it is present and the current bare label otherwise, so the undo button reads, for
example, *Undo VE edit · scale +5% · 12 cells* or *Undo Spark edit · smooth · 20 cells*.
Every op, stepper press and key press is exactly one `SET_TABLE` dispatch — one undo step.

### 7. Advisor panels

`countIn` gets a `range` branch that counts flagged cells inside the rectangle. Row and
column behaviour is unchanged. The single-cell branches in `sparkReport`, `fuelReport`
and `veReport` are unchanged, since a range is never `type: 'cell'`.

## Tests

- **`tests/` unit tests for each `tables.js` op:** clamping at both bounds, 2 dp rounding,
  single cell vs. range, cells outside the rectangle unchanged, input table not mutated,
  unordered corners. Interpolate: corners preserved, 1-D reduces to linear, bilinear
  centre value. Smooth: edge clipping, reads from the original table.
- **`rectOf` / `inRect` / `cellCount`** for all four selection types.
- **UI:** mouse drag and shift-click build the right range; touch taps do not drag;
  two-tap SELECT RANGE and ALL; `rangeMode` shared across AIR/SPARK/FUEL; keyboard move,
  extend, adjust (with and without Shift) and Esc; Ctrl/Cmd+Z still undoes while the
  grid has focus; every bulk op is one undo step with the expected label; the advisor
  counts a range correctly.
- **Existing tests** for the dock's draft/commit behaviour pass unchanged.
- **Fingerprint unchanged.**

## Risks

| Risk | Mitigation |
|---|---|
| Drag handling breaks touch scrolling | Drag only on `pointerType === 'mouse'`; tested |
| New keyboard handler steals undo | Ignore any Ctrl/Cmd/Alt combination; tested with focus on the grid |
| Refactoring `apply`/`setAbs` regresses the dock's undo guarantees | Draft/commit code is not touched; existing undo tests are the gate |
| Rounding change moves a stored value | Only `setAbs` gains rounding, and the slider only yields step multiples |
