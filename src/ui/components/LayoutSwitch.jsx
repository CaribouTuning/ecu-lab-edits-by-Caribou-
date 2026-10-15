/**
 * TUNE's table layout switch: the ECU Lab grid, or the breakpoints the engine's own
 * computer uses (sim/layouts.js). Shown above AIR, SPARK and FUEL, for an engine whose
 * computer's breakpoints were read from a real calibration; the career and the
 * tutorials always run on the ECU Lab grid, so it is not shown there.
 */

import React from 'react';

import { ECU_LAYOUTS, GAME_LAYOUT, PRESET_ECU_LAYOUT, layoutById } from '../../sim/index.js';
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
  const current = tune.layout ?? null;
  const ids = [...new Set([own, current].filter(Boolean))];
  if (!ids.length) return null;
  const options = [
    { id: GAME_LAYOUT.id, label: 'ECU Lab grid' },
    ...ids.map((id) => ({ id, label: ECU_LAYOUTS[id].ecu.split(',')[0] })),
  ];
  const active = layoutById(current);
  return (
    <div data-testid="layout-switch" style={{ margin: '4px 0 10px' }}>
      <div style={{ fontSize: 9.5, letterSpacing: 1, color: T.ink3, fontWeight: 800, marginBottom: 5 }}>TABLE LAYOUT</div>
      <Seg
        label="Table layout"
        options={options}
        value={active.id}
        onChange={(id) => dispatch(/** @type {any} */ (layoutSwitch({ build, tune }, id === GAME_LAYOUT.id ? null : String(id))))}
      />
      <div style={{ fontSize: 11, color: T.ink2, marginTop: 6, lineHeight: 1.5 }}>
        {current
          ? <>{active.label.replace(/^[^(]*\(|\)$/g, '')}: the breakpoints of {active.ecu}, read from its own calibrations. {active.note}</>
          : <>On ECU Lab&apos;s 8 × 6 grid. Switch to the breakpoints this engine&apos;s own computer uses.</>}
      </div>
    </div>
  );
}

/**
 * The table screens' note when cell advice is about the ECU Lab grid, not these cells.
 * @returns {React.ReactElement|null}
 */
export function LayoutAdviceNote() {
  const [tune] = useTune();
  if (!tune.layout) return null;
  return (
    <div style={{ fontSize: 11, color: T.ink2, margin: '0 0 8px', lineHeight: 1.5 }}>
      This advice is worked out on the ECU Lab grid: it names RPM and manifold pressure, not this
      table&apos;s cells. Pull logs work on either layout.
    </div>
  );
}
