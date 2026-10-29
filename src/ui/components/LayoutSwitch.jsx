/**
 * TUNE's table layout switch: breakpoints sized to this engine (16 × 16, from cranking to
 * past its limiter and from overrun to past its peak boost), or the breakpoints the
 * engine's own computer uses where they were read from a real calibration (sim/layouts.js).
 * Shown above AIR, SPARK and FUEL; the career runs on its own tables, so not there.
 */

import React from 'react';

import { ECU_LAYOUTS, PRESET_ECU_LAYOUT, layoutById } from '../../sim/index.js';
import { Seg } from '../primitives/Seg.jsx';
import { T } from '../theme.js';
import { layoutSwitch } from '../state/layoutSwitch.js';
import { useBuild, useSession, useTune } from '../state/StoreProvider.jsx';

/** @returns {React.ReactElement|null} */
export function LayoutSwitch() {
  const [build, dispatch] = useBuild();
  const [tune] = useTune();
  const [session] = useSession();
  if (session.mode === 'career') return null;
  const own = build.presetId ? PRESET_ECU_LAYOUT[build.presetId] : null;
  const active = layoutById(tune.layout);
  const options = [
    { id: 'engine', label: 'Sized to this engine' },
    ...[...new Set([own, ECU_LAYOUTS[active.id] ? active.id : null].filter(Boolean))]
      .map((id) => ({ id, label: ECU_LAYOUTS[id].ecu.split(',')[0] })),
  ];
  // One line: the axes' size and span, the whole story in the tooltip.
  const why = active.id === 'engine'
    ? `The range this engine runs, at the depth of a typical standalone or factory computer. The axes follow the build: raise the limiter or the boost and they grow with it.`
    : active.id === 'game' ? 'On the old 8 × 6 grid. Switch to tables sized to this engine.'
      : `The breakpoints of ${active.ecu}, read from its own calibrations. ${active.note ?? ''}`;
  return (
    <div data-testid="layout-switch" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }} title={why}>
      <Seg
        label="Table layout"
        options={options}
        value={active.id === 'game' ? '' : active.id}
        onChange={(id) => dispatch(/** @type {any} */ (layoutSwitch({ build, tune }, String(id))))}
      />
      <span style={{ fontSize: 12, color: T.ink2, fontVariantNumeric: 'tabular-nums' }}>
        {active.ve.rpm.length} × {active.ve.load.length}, {active.ve.rpm[0]}–{active.ve.rpm[active.ve.rpm.length - 1].toLocaleString('en-US')} rpm, {active.ve.load[active.ve.load.length - 1]}–{active.ve.load[0]} kPa
      </span>
    </div>
  );
}
