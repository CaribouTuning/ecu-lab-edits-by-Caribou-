/**
 * The top of the Build app: the engine as built, turning on screen and redrawn as you change
 * it, and the Factory engines list to start from a factory engine.
 *
 * Loading a factory engine replaces the calibration with its own. When the tables have work
 * in them it asks first, as BUILD's engine section always has: the ask is that section's,
 * so choosing here opens it.
 */

import React, { useState } from 'react';

import { applyPreset, deriveEngine } from '../../sim/index.js';
import { PrebuiltEngines } from '../screens/build/EngineStart.jsx';
import { ACTIONS } from '../state/reducer.js';
import { useBuild, useSession, useTune } from '../state/StoreProvider.jsx';
import { engineSpecOf } from '../world/models/engine.js';

import { EngineViewer } from './EngineViewer.jsx';

import styles from './Apps.module.css';

/**
 * @param {object} props
 * @param {() => void} props.onAsk open BUILD's engine section, where loading over a tune is confirmed
 * @returns {React.ReactElement}
 */
export function BuildTop({ onAsk }) {
  const [build, dispatch] = useBuild();
  const [tune] = useTune();
  const [session] = useSession();
  const [listOpen, setListOpen] = useState(false);
  const derived = deriveEngine(build.engineConfig);
  const spec = engineSpecOf(build, derived);
  const rpm = session.live.running ? session.live.rpm : 0;
  const pick = (preset) => {
    setListOpen(false);
    if (tune.tablesDirty) {
      dispatch({ type: ACTIONS.SET_PRESET_PROMPT, value: preset });
      onAsk();
    } else dispatch({ type: ACTIONS.APPLY_PRESET, preset: applyPreset(preset) });
  };
  const label = `${spec.layout}${spec.turbo ? ' turbo' : spec.supercharger ? ' supercharged' : ''}, ${derived.displacementL.toFixed(1)} L, ${String(spec.valvetrain).toUpperCase()}`;
  return (
    <div className={styles.buildTop}>
      <EngineViewer spec={spec} rpm={rpm} label={`The engine as built: ${label}`} />
      <div className={styles.buildRow}>
        <button type="button" className={styles.oem} aria-expanded={listOpen} onClick={() => setListOpen((o) => !o)}>
          Factory engines
        </button>
        <span className={styles.buildNote}>{label}. Change it below and watch the engine change.</span>
      </div>
      {listOpen && (
        <div className={styles.oemList}>
          <PrebuiltEngines onPick={pick} />
        </div>
      )}
    </div>
  );
}
