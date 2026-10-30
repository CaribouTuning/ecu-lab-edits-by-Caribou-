/**
 * TUNE's table layout switch: breakpoints sized to this engine (16 × 16, from cranking to
 * past its limiter and from overrun to past its peak boost), or the breakpoints the
 * engine's own computer uses where they were read from a real calibration (sim/layouts.js).
 * Shown above AIR, SPARK and FUEL; the career runs on its own tables, so there it only
 * offers to extend them when the engine has outgrown them.
 */

import React from 'react';

import { ECU_LAYOUTS, PRESET_ECU_LAYOUT, layoutById } from '../../sim/index.js';
import { Button } from '../primitives/Button.jsx';
import { Seg } from '../primitives/Seg.jsx';
import { T } from '../theme.js';
import { baseMapAction, offersBaseMap } from '../state/baseMap.js';
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
  const outgrown = engineOutgrowsTables({ build, tune });
  // A factory engine with parts changed: its tables are the factory's, written for parts it
  // no longer has. Tuning them is the point; a base start-up map is there for a player who
  // wants to see where a tuner would start. Offered, never loaded by the build change.
  // Not in the career: a customer's car is the job, and a base map would hand over the answer.
  const baseMap = session.mode !== 'career' && offersBaseMap(build);
  const extend = outgrown || baseMap ? (
    <div data-testid="extend-axes" style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '4px 0 10px' }}>
      {outgrown && (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <Button size="sm" variant="primary" onClick={() => dispatch(/** @type {any} */ (extendAxes({ build, tune })))}>Extend the axes to this engine</Button>
          <span style={{ fontSize: 12, color: T.ink2, lineHeight: 1.5 }}>
            The engine now reaches past these tables. Past the edge the ECU reads the edge row; extending adds the cells, marked not tuned, for you to tune.
          </span>
        </div>
      )}
      {baseMap && (
        <div data-testid="base-map-offer" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <Button size="sm" variant="ghost" onClick={() => dispatch(/** @type {any} */ (baseMapAction(build)))}>Load a base start-up map</Button>
          <span style={{ fontSize: 12, color: T.ink2, lineHeight: 1.5 }}>
            These are the factory&apos;s tables, and the parts have changed. Tune them from the pull log, or load what a tuner would start from for these parts: safe and conservative, not tuned. It replaces your tables; Undo brings them back.
          </span>
        </div>
      )}
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
  // One line: the axes' size and span, the whole story in the tooltip.
  const why = active.id === 'engine'
    ? `The range this engine runs, at the depth of a typical standalone or factory computer. Like a real ECU's, the axes stay put when the build changes: past them the ECU reads the edge, and you extend them yourself.`
    : active.id === 'game' ? 'On the old 8 × 6 grid. Switch to tables sized to this engine.'
      : `The breakpoints of ${active.ecu}, read from its own calibrations. ${active.note ?? ''}`;
  return (
    <>
    {extend}
    <div data-testid="layout-switch" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 12, rowGap: 0 }} title={why}>
      {/* A choice of one is not a choice: the only layout is named in the caption, and a
          switch appears when the engine's computer offers another. */}
      {options.length > 1 && (
        <Seg
          variant="tabs"
          label="Table layout"
          options={options}
          value={active.id === 'game' ? '' : active.id}
          onChange={(id) => dispatch(/** @type {any} */ (layoutSwitch({ build, tune }, String(id))))}
        />
      )}
      <span style={{ fontSize: 12, color: T.ink2, fontVariantNumeric: 'tabular-nums', padding: '6px 0' }}>
        {active.ve.rpm.length} × {active.ve.load.length} · {active.ve.rpm[0]}–{active.ve.rpm[active.ve.rpm.length - 1].toLocaleString('en-US')} rpm · {active.ve.load[active.ve.load.length - 1]}–{active.ve.load[0]} kPa
      </span>
    </div>
    </>
  );
}
