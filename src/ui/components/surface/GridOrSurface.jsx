/**
 * The RPM × MAP grids (VE, spark, AFR) with a Table / 3-D switch above them. The grid is
 * stored with the highest load first (sim/tables.js LOAD); the surface wants both axes
 * ascending, so the rows are turned over here and nowhere else.
 */

import React from 'react';

import { LOAD, RPM } from '../../../sim/index.js';

import styles from './surface.module.css';
import { TableSurface, ViewToggle, useTableView } from './TableSurface.jsx';

const LOAD_UP = [...LOAD].reverse();

/**
 * @param {object} props
 * @param {number[][]} props.data rows against LOAD (highest first), columns against RPM
 * @param {number} props.min
 * @param {number} props.max
 * @param {number} props.decimals
 * @param {string} props.unit
 * @param {string} props.title
 * @param {{label: string, read: (p: object) => number}} [props.commanded]
 * @param {React.ReactNode} props.children the grid
 */
export function GridOrSurface({ data, min, max, decimals, unit, title, commanded, children }) {
  const [view, setView] = useTableView();
  const z = React.useMemo(() => [...data].reverse(), [data]);
  return (
    <div className={styles.wrap}>
      <div className={styles.switchRow}><ViewToggle mode={view} onChange={setView} /></div>
      {view === '3d'
        ? <TableSurface x={RPM} y={LOAD_UP} z={z} lo={min} hi={max} xLabel="RPM" yLabel="MAP kPa" unit={unit} decimals={decimals}
          title={title} xVar="rpm" yVar="map" commanded={commanded} />
        : children}
    </div>
  );
}
