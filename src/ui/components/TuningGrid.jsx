/**
 * The RPM x MAP calibration grid: one cell per (load, RPM) pair, coloured by a
 * heat scale and clickable by cell, row or column to build a `Selection` for
 * `SelectionDock` to edit.
 *
 * Shared by TUNE's AIR, SPARK and FUEL screens — the ECU screen uses neither this
 * nor `SelectionDock`, which is why both live here rather than beside any one
 * screen. See this folder's README for what that distinction means.
 *
 * Relocated from EcuLab.jsx by the screen split, markup unchanged — still inline
 * styles, same as this folder's other shared components.
 */

import React from 'react';

import { LOAD, RPM } from '../../sim/index.js';
import { T, heat, shadowAlpha } from '../theme.js';

/** @typedef {{type: 'cell'|'row'|'col', row?: number, col?: number}} Selection */

/**
 * @param {object} props
 * @param {number[][]} props.data rows of values, indexed [row][col] against LOAD/RPM
 * @param {number} props.min lower bound of the heat scale
 * @param {number} props.max upper bound of the heat scale
 * @param {number} props.decimals how many decimal places to render each cell at
 * @param {Selection|null} props.selection the current cell/row/col selection, or none
 * @param {(next: Selection) => void} props.setSelection
 * @returns {React.ReactElement}
 */
export function TuningGrid({ data, min, max, decimals, selection, setSelection }) {
  const fmt = (v) => (decimals ? v.toFixed(decimals) : Math.round(v));
  const selectCell = (row, col) => setSelection({ type: 'cell', row, col });
  const selectRow = (row) => setSelection({ type: 'row', row });
  const selectCol = (col) => setSelection({ type: 'col', col });
  const isSelected = (row, col) => {
    if (!selection) return false;
    if (selection.type === 'cell') return selection.row === row && selection.col === col;
    if (selection.type === 'row') return selection.row === row;
    if (selection.type === 'col') return selection.col === col;
    return false;
  };
  return (
    <div data-testid="tuning-grid">
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9.5, color: T.ink3, fontWeight: 700, letterSpacing: 0.8, marginBottom: 4 }}>
      <span>MAP kPa &darr;</span><span>RPM &rarr;</span>
    </div>
    <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', border: `1px solid ${T.line}`, borderRadius: 10 }}>
      <div style={{ display: 'inline-block', minWidth: '100%' }}>
        <div style={{ display: 'flex' }}>
          <div style={{ width: 44, flexShrink: 0, background: T.panel }} />
          {RPM.map((r, ci) => (
            <button key={r} onClick={() => selectCol(ci)} style={{
              width: 51, height: 30, flexShrink: 0, border: 'none', borderBottom: `1px solid ${T.line}`, borderLeft: `1px solid ${T.line}`,
              background: selection?.type === 'col' && selection.col === ci ? T.acc : T.panel,
              color: selection?.type === 'col' && selection.col === ci ? T.accOn : T.ink2,
              fontFamily: T.mono, fontSize: 10, fontWeight: 700,
            }}>{r}</button>
          ))}
        </div>
        {LOAD.map((load, ri) => (
          <div key={load} style={{ display: 'flex' }}>
            <button onClick={() => selectRow(ri)} style={{
              width: 44, height: 37, flexShrink: 0, border: 'none', borderRight: `1px solid ${T.line}`, borderTop: `1px solid ${T.line}`,
              background: selection?.type === 'row' && selection.row === ri ? T.acc : T.panel,
              color: selection?.type === 'row' && selection.row === ri ? T.accOn : T.ink2,
              fontFamily: T.mono, fontSize: 10, fontWeight: 700,
            }}>{load}</button>
            {data[ri].map((val, ci) => (
              <button key={ci} onClick={() => selectCell(ri, ci)} style={{
                width: 51, height: 37, flexShrink: 0,
                border: isSelected(ri, ci) ? `2px solid ${T.ink}` : `1px solid ${shadowAlpha(0.35)}`,
                background: heat(val, min, max), color: T.ink,
                fontFamily: T.mono, fontSize: 12, fontWeight: 700,
              }}>{fmt(val)}</button>
            ))}
          </div>
        ))}
      </div>
    </div>
    </div>
  );
}
