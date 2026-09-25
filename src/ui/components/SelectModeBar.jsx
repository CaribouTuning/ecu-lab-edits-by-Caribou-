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
