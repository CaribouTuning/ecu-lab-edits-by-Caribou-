/**
 * TUNE's table layout switch: breakpoints sized to this engine (16 × 16, from cranking to
 * past its limiter and from overrun to past its peak boost), or the breakpoints the
 * engine's own computer uses where they were read from a real calibration (sim/layouts.js).
 * Shown above AIR, SPARK and FUEL; the career runs on its own tables, so not there.
 */

import React from 'react';

import { ECU_LAYOUTS, PRESET_ECU_LAYOUT, layoutById } from '../../sim/index.js';
import { Button } from '../primitives/Button.jsx';
import { Seg } from '../primitives/Seg.jsx';
import { T } from '../theme.js';
import { engineOutgrowsTables, extendAxes, layoutSwitch } from '../state/layoutSwitch.js';
import { useBuild, useSession, useTune } from '../state/StoreProvider.jsx';

/** @returns {React.ReactElement|null} */
export function LayoutSwitch() {
  const [build, dispatch] = useBuild();
  const [tune] = useTune();
  const [session] = useSession();
  // The engine reaches past its tables (a turbo fitted, the limiter raised): the ECU reads
  // the edge there until the player extends the axes. Offered in the career too, where the
  // layout itself is not the player's to choose.
  const extend = engineOutgrowsTables({ build, tune }) ? (
    <div data-testid="extend-axes" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, margin: '4px 0 10px' }}>
      <Button size="sm" variant="primary" onClick={() => dispatch(/** @type {any} */ (extendAxes({ build, tune })))}>Extend the axes to this engine</Button>
      <span style={{ fontSize: 12, color: T.ink2, lineHeight: 1.5 }}>
        The engine now reaches past these tables. Past the edge the ECU reads the edge row; extending adds the cells, marked not tuned, for you to tune.
      </span>
    </div>
  ) : null;
  if (session.mode === 'career') return extend;
  const own = build.presetId ? PRESET_ECU_LAYOUT[build.presetId] : null;
  const active = layoutById(tune.layout);
  const options = [
    { id: 'engine', label: 'Sized to this engine' },
    ...[...new Set([own, ECU_LAYOUTS[active.id] ? active.id : null].filter(Boolean))]
      .map((id) => ({ id, label: ECU_LAYOUTS[id].ecu.split(',')[0] })),
  ];
  return (
    <>
    {extend}
    <div data-testid="layout-switch" style={{ margin: '4px 0 10px' }}>
      <div style={{ fontSize: 9.5, letterSpacing: 1, color: T.ink2, fontWeight: 800, marginBottom: 5 }}>TABLE LAYOUT</div>
      <Seg
        label="Table layout"
        options={options}
        value={active.id === 'game' ? '' : active.id}
        onChange={(id) => dispatch(/** @type {any} */ (layoutSwitch({ build, tune }, String(id))))}
      />
      <div style={{ fontSize: 11, color: T.ink2, marginTop: 6, lineHeight: 1.5 }}>
        {active.id === 'engine'
          ? <>{active.ve.rpm.length} RPM × {active.ve.load.length} load breakpoints, from {active.ve.rpm[0]} to {active.ve.rpm[active.ve.rpm.length - 1].toLocaleString('en-US')} RPM and {active.ve.load[active.ve.load.length - 1]} to {active.ve.load[0]} kPa: the range this engine runs, at the depth of a typical standalone or factory computer. Like a real ECU's, they stay put when the build changes: past them the ECU reads the edge, and you extend them.</>
          : active.id === 'game'
            ? <>On the old 8 × 6 grid. Switch to tables sized to this engine.</>
            : <>{active.label.replace(/^[^(]*\(|\)$/g, '')}: the breakpoints of {active.ecu}, read from its own calibrations. {active.note}</>}
      </div>
    </div>
    </>
  );
}
