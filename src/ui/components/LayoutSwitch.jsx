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
import { Info } from '../primitives/Info.jsx';
import { engineOutgrowsTables, extendAxes, layoutSwitch } from '../state/layoutSwitch.js';
import { useBuild, useSession, useTune } from '../state/StoreProvider.jsx';

/** @returns {React.ReactElement|null} */
export function LayoutSwitch() {
  const [build, dispatch] = useBuild();
  const [tune] = useTune();
  const [session] = useSession();
  const [picking, setPicking] = React.useState(false);
  // The engine reaches past its tables (a turbo fitted, the limiter raised): the ECU reads
  // the edge there until the player extends the axes. Offered in the career too, where the
  // layout itself is not the player's to choose.
  const outgrown = engineOutgrowsTables({ build, tune });
  const extend = outgrown ? (
    <div data-testid="extend-axes" style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '4px 0 10px' }}>
      {outgrown && (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <Button size="sm" variant="primary" onClick={() => dispatch(/** @type {any} */ (extendAxes({ build, tune })))}>Extend the axes to this engine</Button>
          <span style={{ fontSize: 12, color: 'var(--ink2)', lineHeight: 1.5 }}>
            The engine now reaches past these tables. Past the edge the ECU reads the edge row; extending adds the cells, marked not tuned, for you to tune.
          </span>
        </div>
      )}
    </div>
  ) : null;
  if (session.mode === 'career') return extend;
  const own = build.presetId ? PRESET_ECU_LAYOUT[build.presetId] : null;
  const active = layoutById(tune.layout);
  // The game's 8 × 6 first: where every engine that fits it starts, and quick to read and tune on
  // any screen. The finer grid sized to the engine, and the engine computer's own, beside it.
  const options = [
    // Its size as it stands: extending the game grid for boost adds rows to it.
    { id: 'game', label: active.id === 'game' ? `${active.ve.rpm.length} × ${active.ve.load.length}` : '8 × 6' },
    { id: 'engine', label: 'Sized, 16 × 16' },
    ...[...new Set([own, ECU_LAYOUTS[active.id] ? active.id : null].filter(Boolean))]
      .map((id) => ({ id, label: ECU_LAYOUTS[id].ecu.split(',')[0] })),
  ];
  // One line: the axes' size and span, the whole story behind its info button.
  const why = active.id === 'engine'
    ? `The range this engine runs, at the depth of a typical standalone or factory computer. Like a real ECU's, they never move a value you have tuned: a build that reaches past them adds rows and columns (in SANDBOX as you build; in CAREER when you extend them), and past the edge the ECU reads the edge.`
    : active.id === 'game' ? 'The game\'s 8 × 6 grid: few enough cells to read at a glance and tune on a phone. "Sized" lays 16 × 16 breakpoints over the range this engine runs, for finer control between speeds and loads.'
      : `The breakpoints of ${active.ecu}, read from its own calibrations. ${active.note ?? ''}`;
  return (
    <>
    {extend}
    <div data-testid="layout-switch" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {/* One line: which grid, its span, and Change. The picker opens only when asked for:
          a layout is set once, and three keys above every table read as one more thing to do. */}
      <Info label="About the table layout" text={why}>
        <span style={{ fontSize: 12, color: 'var(--ink2)', fontVariantNumeric: 'tabular-nums' }}>
          Table layout <b style={{ color: 'var(--ink)', fontWeight: 600 }}>{options.find((o) => o.id === active.id)?.label ?? active.ecu}</b>
          {' · '}{active.ve.rpm[0]}–{active.ve.rpm[active.ve.rpm.length - 1].toLocaleString('en-US')} rpm, {active.ve.load[active.ve.load.length - 1]}–{active.ve.load[0]} kPa
        </span>
        {options.length > 1 && (
          <Button size="sm" variant="quiet" aria-expanded={picking} onClick={() => setPicking(!picking)}>{picking ? 'Done' : 'Change'}</Button>
        )}
      </Info>
      {picking && options.length > 1 && (
        <Seg
          label="Table layout"
          options={options}
          value={active.id}
          // The layout already in use is not a change: switching to it would re-sample the tables
          // onto a fresh grid and blur what the player has tuned.
          onChange={(id) => { if (String(id) !== active.id) dispatch(/** @type {any} */ (layoutSwitch({ build, tune }, String(id)))); }}
        />
      )}
    </div>
    </>
  );
}
