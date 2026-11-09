/**
 * The RPM x MAP calibration grid: one cell per (load, RPM) pair, coloured by a
 * heat scale, building a `Selection` for `SelectionDock` to edit.
 *
 * A cell selects on click. A mouse also drags out a range or shift-clicks one from the
 * anchor; a finger cannot drag (that scrolls the grid), so in SELECT RANGE mode
 * (`SelectModeBar`) two taps make the two corners. Row and column headers select the
 * whole row or column.
 *
 * Focused, it also takes the keyboard: arrows move, Shift+arrows grow a range from the
 * anchor, `+`/`-` nudge the selection (Shift for the coarse step), Esc clears.
 *
 * In the CHANGES view (`SelectModeBar`) each cell shows its change from `baseline` —
 * the calibration as it was loaded — tinted violet up and cyan down. Only the drawing
 * changes: selection, keys and the dock still work on the real values.
 *
 * Shared by TUNE's AIR, SPARK and FUEL screens — the ECU screen uses neither this
 * nor `SelectionDock`, which is why both live here rather than beside any one
 * screen. See this folder's README for what that distinction means.
 *
 * Relocated from EcuLab.jsx by the screen split — still inline styles, same as this
 * folder's other shared components.
 */

import React from 'react';

import { GAME_LAYOUT, addRect, diffTable } from '../../sim/index.js';
import { diffTint, heat } from '../theme.js';

import styles from './TuningGrid.module.css';
import { anchorOf, formatDelta, inRect, opLabel, rectOf, signed, spanSelection, stepsFor } from './selection.js';

/** @typedef {import('./selection.js').Selection} Selection */

/** Arrow key -> [row step, column step]. */
const ARROWS = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
/**
 * Physical key -> nudge direction. By `code` first: `+` already needs Shift on most
 * layouts, so `key` could not tell "+" from "coarse +".
 */
const NUDGE = { Equal: 1, NumpadAdd: 1, Minus: -1, NumpadSubtract: -1 };
/**
 * ...and by character when there is no physical key to go on. On-screen keyboards and
 * remote-input tools can send an empty `code`; without this, + and - did nothing at all
 * there. Shift still means coarse, so a Shift+= that arrives as "+" is the coarse step.
 */
const NUDGE_BY_KEY = { '=': 1, '+': 1, '-': -1, _: -1 };

/** What a load axis measures, for its header. */
export const LOAD_UNIT_LABEL = Object.freeze({ kPa: 'MAP kPa', 'g/cyl': 'AIR g/cyl', 'mg/cyl': 'AIR mg/cyl' });

/** A load breakpoint as its axis writes it. */
export const loadText = (unit, v) => (unit === 'g/cyl' ? v.toFixed(2) : String(v));

/**
 * True when the ECU reads its tables by THROTTLE (the alpha-N air-mass strategy). The
 * rows are the same breakpoints (a load row of 101.3 kPa is a wide-open throttle, as a
 * pull's load is), written as the throttle opening the ECU looks them up at.
 */
export const ThrottleLoadContext = React.createContext(false);

/**
 * How a table's load axis reads on screen: its label, and each breakpoint's text.
 * @param {string} unit the axis's load unit
 * @param {boolean} throttle the ECU reads this axis by throttle (alpha-N)
 */
export function loadAxisText(unit, throttle) {
  if (!(throttle && unit === 'kPa')) {
    return { label: LOAD_UNIT_LABEL[unit] ?? unit, unit: unit === 'kPa' ? 'kPa' : unit, word: unit === 'kPa' ? ' MAP' : ' air', text: (v) => loadText(unit, v) };
  }
  // Past a wide-open throttle the ECU reads the top row it can reach: rows above it are
  // boost rows, which a throttle-indexed table cannot address.
  return { label: 'THROTTLE %', unit: '%', word: ' throttle', text: (v) => (v > 101.5 ? `>${100}` : String(Math.round(Math.min(100, (v / 101.3) * 100)))) };
}

/**
 * @param {object} props
 * @param {number[][]} props.data rows of values, indexed [row][col] against `axes`
 * @param {import('../../sim/layouts.js').TableAxes} [props.axes] the table's breakpoints:
 *   the ECU Lab grid unless the tune sits on an engine computer's own (sim/layouts.js)
 * @param {number} props.min lower bound of the heat scale
 * @param {number} props.max upper bound of the heat scale
 * @param {number} props.decimals how many decimal places to render each cell at
 * @param {Selection|null} props.selection the current selection, or none
 * @param {(next: Selection|null) => void} props.setSelection
 * @param {boolean} [props.rangeMode] whether a tap starts or completes a range (the
 *   touch path) rather than selecting one cell
 * @param {(next: number[][], label: string) => void} [props.setData] one table write,
 *   one undo step — what `+`/`-` call. Without it the keys only move the selection.
 * @param {number[][]} [props.baseline] the table as loaded; without it there is no
 *   CHANGES view to draw
 * @param {boolean} [props.diffView] draw each cell's change from `baseline`
 * @param {number} [props.diffScale] the change at which the tint stops brightening
 * @param {string[]|null} [props.untuned] cells (`row:col`) the axes were extended into and
 *   nobody has tuned yet: drawn plain and dashed, so the work left shows
 * @param {string[]|null} [props.unreached] cells (`row:col`) above the boost the engine
 *   makes at that column's speed (state/reach.js): greyed, still editable
 * @returns {React.ReactElement}
 */
export function TuningGrid({ data, min, max, decimals, selection, setSelection, rangeMode = false, setData, baseline, diffView = false, diffScale = 1, axes = GAME_LAYOUT.ve, untuned = null, unreached = null }) {
  const notTuned = React.useMemo(() => new Set(untuned ?? []), [untuned]);
  const notReached = React.useMemo(() => new Set(unreached ?? []), [unreached]);
  const clampR = (r) => Math.min(Math.max(r, 0), axes.load.length - 1);
  const clampC = (c) => Math.min(Math.max(c, 0), axes.rpm.length - 1);
  // An engine computer's own grid has three or four times the cells: smaller ones, so
  // more of it is in view at once.
  const dense = axes.rpm.length > 12;
  const fmt = (v) => (decimals ? v.toFixed(decimals) : Math.round(v));
  // 96 subtractions, on renders that already walk every cell — not memoised.
  const diff = diffView && baseline ? diffTable(data, baseline) : null;
  const rect = selection ? rectOf(selection, { rows: axes.load.length, cols: axes.rpm.length }) : null;
  const anchor = selection ? anchorOf(selection) : null;
  // The anchor of a mouse drag in progress, or null. A ref, not state: it changes on
  // every press and release and nothing renders from it.
  const dragFrom = React.useRef(/** @type {{r: number, c: number}|null} */ (null));
  // Which kind of pointer pressed last. A mouse press has already selected by the time
  // its click arrives, so that click must not select again — it would collapse a drag
  // back to one cell. A keyboard click carries `detail === 0` and always goes through.
  const lastPointer = React.useRef('');

  // THE CELL STAYS IN SIGHT. On a phone the edit panel (SelectionDock, sticky at the
  // bottom) slides up over the lower rows, and a tapped cell there was edited out of sight.
  // Once the panel has drawn, the page scrolls just enough to lift the selected cell above it.
  const gridRef = React.useRef(/** @type {HTMLDivElement|null} */ (null));
  const selKey = selection?.type === 'cell' ? `${selection.row}:${selection.col}` : null;
  React.useEffect(() => {
    if (!selKey || typeof window === 'undefined') return undefined;
    const raf = window.requestAnimationFrame(() => {
      const cell = gridRef.current?.querySelector(`[data-rc="${selKey}"]`);
      const dock = document.querySelector('[data-testid="selection-dock"]');
      if (!cell || !dock) return;
      const c = cell.getBoundingClientRect();
      const dockTop = dock.getBoundingClientRect().top;
      const over = c.bottom + 12 - dockTop;
      if (over <= 0) return;
      // The pane that scrolls: the nearest ancestor that can, else the page.
      // (From outside the grid: the table's own sideways scroller computes overflow-y auto too.)
      let el = gridRef.current?.parentElement ?? null;
      while (el && !(el.scrollHeight > el.clientHeight + 4 && /(auto|scroll)/.test(window.getComputedStyle(el).overflowY))) el = el.parentElement;
      (el ?? window).scrollBy({ top: over, behavior: 'smooth' });
    });
    return () => window.cancelAnimationFrame(raf);
  }, [selKey]);

  // A drag ends wherever the button comes up, which need not be over the grid.
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
   * range (the anchor) and the second completes it; any tap after that starts over.
   * @param {number} ri
   * @param {number} ci
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
    // `buttons` as well as the ref: a release outside the window never reaches the
    // listener above, and without this the next hover would still be dragging.
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
  // Only a range marks its anchor: it is the corner a shift-click extends from, so it
  // has to be findable. A lone cell is its own anchor and needs no second mark.
  const isAnchor = (ri, ci) => selection?.type === 'range' && anchor.r === ri && anchor.c === ci;

  const onKeyDown = (e) => {
    // Ctrl/Cmd/Alt belong to EcuLab's global undo handler and to the browser.
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
        // The corner that moves is whichever one is not the anchor.
        const far = selection.type === 'range'
          ? { r: selection.r2, c: selection.c2 }
          : { r: rect.r1 === anchor.r ? rect.r2 : rect.r1, c: rect.c1 === anchor.c ? rect.c2 : rect.c1 };
        setSelection(spanSelection(anchor, { r: clampR(far.r + move[0]), c: clampC(far.c + move[1]) }));
      } else {
        setSelection({ type: 'cell', row: clampR(anchor.r + move[0]), col: clampC(anchor.c + move[1]) });
      }
      return;
    }
    const sign = NUDGE[e.code] ?? NUDGE_BY_KEY[e.key];
    if (sign && selection && setData) {
      e.preventDefault();
      const { small, big } = stepsFor(decimals);
      const delta = sign * (e.shiftKey ? big : small);
      setData(addRect(data, rect, delta, { min, max }), opLabel(signed(delta), rect));
    }
  };

  // The colour scale runs over this table's own values, so the shape of the data shows:
  // over the field's whole legal range (10-130 % for VE) a real table sat in one band.
  // A flat table (every cell alike) keeps the field's range rather than a scale of zero.
  let lo = Infinity; let hi = -Infinity;
  for (const row of data) for (const v of row) { if (v < lo) lo = v; if (v > hi) hi = v; }
  if (!(hi - lo > (max - min) * 0.02)) { lo = min; hi = max; }
  const cross = selection?.type === 'cell' ? { r: selection.row, c: selection.col } : null;
  const lx = loadAxisText(axes.loadUnit, React.useContext(ThrottleLoadContext));
  const loadUnit = lx.label;

  return (
    <div
      data-testid="tuning-grid"
      ref={gridRef}
      className={styles.grid}
      data-dense={dense || undefined}
      // The column count, so the cells can share out a phone's width (TuningGrid.module.css).
      style={/** @type {any} */ ({ '--cols': axes.rpm.length })}
      tabIndex={0}
      onKeyDown={onKeyDown}
      aria-label="Calibration table: arrows move, Shift+arrows select a range, plus and minus adjust"
    >
    <div className={styles.scroll}>
      <table className={styles.table} role="presentation">
        <thead>
          {/* `data-tour` hooks are for the tutorial's callouts, which point at this grid. */}
          <tr data-tour="grid-rpm-axis">
            <th className={styles.corner} scope="col"><span>{loadUnit}</span><span>rpm</span></th>
            {axes.rpm.map((r, ci) => (
              <th key={r} scope="col" className={styles.colHead}>
                <button type="button" onClick={() => selectCol(ci)}
                  data-on={(selection?.type === 'col' && selection.col === ci) || undefined}
                  data-cross={(cross?.c === ci) || undefined}>{r}</button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {axes.load.map((load, ri) => (
            <tr key={load}>
              <th scope="row" className={styles.rowHead}>
                <button type="button" onClick={() => selectRow(ri)} data-tour={axes.loadUnit === 'kPa' ? `grid-load-${load}` : undefined}
                  data-on={(selection?.type === 'row' && selection.row === ri) || undefined}
                  data-cross={(cross?.r === ri) || undefined}>{lx.text(load)}</button>
              </th>
              {data[ri].map((val, ci) => {
                const untunedHere = notTuned.has(`${ri}:${ci}`);
                const selected = isSelected(ri, ci);
                return (
                  <td key={ci}>
                    <button
                      type="button"
                      className={styles.cell}
                      data-rc={`${ri}:${ci}`}
                      aria-label={`${axes.rpm[ci]} RPM, ${lx.text(load)} ${lx.unit}${untunedHere ? ', not tuned' : ''}${notReached.has(`${ri}:${ci}`) ? ', not reached yet' : ''}`}
                      data-untuned={untunedHere ? 'true' : undefined}
                      data-unreached={notReached.has(`${ri}:${ci}`) ? 'true' : undefined}
                      data-anchor={isAnchor(ri, ci) || undefined}
                      data-unchanged={(diff && diff[ri][ci] === 0) || undefined}
                      aria-pressed={selected} data-cell
                      onPointerDown={(e) => onCellPointerDown(e, ri, ci)}
                      onPointerEnter={(e) => onCellPointerEnter(e, ri, ci)}
                      onClick={(e) => onCellClick(e, ri, ci)}
                      style={{
                        // Not tuned: no heat colour, so it does not pass for a value someone chose.
                        background: untunedHere && !diff ? undefined
                          : !diff ? heat(val, lo, hi) : diff[ri][ci] === 0 ? undefined : diffTint(diff[ri][ci], diffScale),
                      }}
                    >{diff ? formatDelta(diff[ri][ci], decimals) : fmt(val)}</button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    {!diff && (
      <div className={styles.key} aria-hidden="true">
        <span>{fmt(lo)}</span>
        <span className={styles.ramp} style={{ background: `linear-gradient(to right, ${[0, 0.25, 0.5, 0.66, 0.83, 1].map((t) => heat(lo + t * (hi - lo), lo, hi)).join(', ')})` }} />
        <span>{fmt(hi)}</span>
        <span className={styles.keyNote}>this table&apos;s lowest to highest cell</span>
      </div>
    )}
    {notReached.size > 0 && (
      <p data-testid="unreached-note" className={styles.note}>
        Faded cells are above the boost this engine makes at that speed (on its last full-throttle pull, or its boost target before the first). They brighten once the engine reaches them.
      </p>
    )}
    {notTuned.size > 0 && (
      <p data-testid="untuned-note" className={styles.note}>
        Dashed cells are not tuned yet: they hold the edge row&apos;s values, which is what the ECU read there before the axes were extended. Each one is yours once you change it.
      </p>
    )}
    </div>
  );
}
