/**
 * What SANDBOX shows until an engine exists: nothing loaded, two ways to get one.
 *
 * A prebuilt factory engine, with the published figures it was built from; or an engine of
 * the player's own, from the numbers on their engine's spec sheet. Until one is chosen,
 * TUNE, LIVE, DYNO and DRAG have nothing true to show, so they show this instead of
 * someone else's engine.
 */

import React, { useState } from 'react';

import { PRESET_GROUPS, applyPreset } from '../../../sim/index.js';
import { ownEnginePatch } from '../../state/ownEngine.js';
import { warm } from '../../sim/warm.js';
import { ACTIONS } from '../../state/reducer.js';
import { useBuild } from '../../state/StoreProvider.jsx';

import styles from './EngineStart.module.css';
import { useUnits } from '../../units.js';

/**
 * @returns {React.ReactElement}
 */
/**
 * The factory engines, by maker, as cards: the start screen's first choice and the Build
 * app's Factory engines list.
 * @param {{onPick: (preset: any) => void, picked?: any, detail?: (preset: any) => React.ReactNode}} props
 *   `detail` is drawn under the picked engine, in place: what is chosen and what to do with
 *   it stay together, not a screen's length apart.
 */
export function PrebuiltEngines({ onPick, picked = null, detail = undefined }) {
  const U = useUnits();
  return (
    <>
      {PRESET_GROUPS.map((g) => (
        <div key={g.manufacturer} className={styles.group}>
          <div className={styles.maker}>{g.manufacturer}</div>
          <div className={styles.cards}>
            {g.presets.map((p) => (
              <React.Fragment key={p.id}>
                <button type="button" className={styles.card} onClick={() => onPick(p)} aria-pressed={picked ? picked.id === p.id : undefined}>
                  <span className={styles.name}>{p.name}</span>
                  <span className={styles.spec}>
                    {p.factory.displacementL.toFixed(1)} L {p.engine.configuration}
                    {p.induction.turboOn ? ' turbo' : ''}, {U.fmtPower(p.factory.crankHp)}, {p.years}
                  </span>
                </button>
                {detail && picked?.id === p.id && detail(p)}
              </React.Fragment>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

/**
 * Where the engine comes from, chosen first: a factory engine, or one of the player's own.
 * Nothing of either path shows until it is chosen. The factory path is a catalogue to pick
 * from, the engine's published figures to read, and a confirm; the custom path puts a typical
 * engine on the bench at once, for the player to set part by part from its short block.
 * Both land on the same build bench with the engine loaded. The factory engine picked
 * survives Back, for as long as this screen is up.
 */
/**
 * @param {object} [props]
 * @param {() => void} [props.onCancel] swapping an engine already on the bench: keep it after all
 * @param {() => void} [props.onDone] the new engine is on the bench
 * @param {boolean} [props.replacing] the tables on the bench hold work this replaces: said on the button
 * @returns {React.ReactElement}
 */
export function EngineStart({ onCancel, onDone, replacing = false } = {}) {
  const [, dispatch] = useBuild();
  const U = useUnits();
  const [path, setPath] = useState(/** @type {null|'factory'} */ (null));
  const [picked, setPicked] = useState(/** @type {any} */ (null));
  // A factory engine's calibration is worked out from its breathing, seconds of the gas
  // exchange on a new engine: the simulator worker starts it as soon as the engine is picked
  // (sim/warm.js), and putting it on the bench waits for that, not for a frozen screen.
  const [loading, setLoading] = useState(/** @type {string|null} */ (null));
  const pick = (p) => { setPicked(p); if (p) warm('preset', { id: p.id }); };
  const load = (preset) => {
    const put = () => { dispatch({ type: ACTIONS.APPLY_PRESET, preset: applyPreset(preset) }); setLoading(null); onDone?.(); };
    const ready = warm('preset', { id: preset.id });
    if (!ready) { put(); return; }
    setLoading(preset.id);
    ready.then(put);
  };
  const create = (patch) => { dispatch({ type: ACTIONS.APPLY_PRESET, preset: patch }); onDone?.(); };

  if (!path) {
    return (
      <div className={styles.page} data-testid="engine-start">
        <div className={styles.bar}>
          {onCancel && <button type="button" className={styles.back} onClick={onCancel}>Keep this engine</button>}
          <h2 className={styles.title}>{onCancel ? 'Change the engine' : 'Put an engine on the bench'}</h2>
        </div>
        <div className={styles.paths}>
          <button type="button" className={styles.path} onClick={() => setPath('factory')}>
            <span className={styles.pathName}>Start with a factory engine</span>
            <span className={styles.pathWhat}>A production engine as it left the factory, with its published figures and its factory calibration. Change any part of it after.</span>
          </button>
          <button type="button" className={styles.path} onClick={() => create(ownEnginePatch())}>
            <span className={styles.pathName}>Build a custom engine</span>
            <span className={styles.pathWhat}>Your own engine, set part by part on the bench, starting with the short block: layout, bore, stroke, compression and redline. It runs on a safe base map generated from the physics, for you to tune.</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page} data-testid="engine-start">
      <div className={styles.bar}>
        <button type="button" className={styles.back} onClick={() => setPath(null)}>Back</button>
        <h2 className={styles.title}>Factory engines</h2>
      </div>
      <div className={styles.catalog} data-plain="">
        <PrebuiltEngines
            onPick={(p) => pick(picked?.id === p.id ? null : p)} picked={picked}
            detail={(p) => (
              <div className={styles.sheet} role="region" aria-label={`${p.name} specifications`}>
                <dl className={styles.specs}>
                  <div><dt>Layout</dt><dd>{p.engine.configuration}{p.induction.turboOn ? ', turbo' : ''}</dd></div>
                  <div><dt>Displacement</dt><dd>{p.factory.displacementL.toFixed(1)} L</dd></div>
                  <div><dt>Bore × stroke</dt><dd>{p.engine.bore} × {p.engine.stroke} mm</dd></div>
                  <div><dt>Compression</dt><dd>{p.engine.compression}:1</dd></div>
                  <div><dt>Redline</dt><dd>{p.engine.redline.toLocaleString('en-US')} rpm</dd></div>
                  <div className={styles.wide}><dt>Factory rating</dt><dd>{U.fmtPower(p.factory.crankHp)}, {U.fmtTorque(p.factory.crankTq)}</dd></div>
                </dl>
                <button type="button" className={styles.use} onClick={() => load(p)} disabled={loading === p.id} aria-busy={loading === p.id || undefined} aria-label={`Use ${p.name}`}>{loading === p.id ? 'Putting it on the bench…' : replacing ? 'Replace the engine and its tune' : 'Put it on the bench'}</button>
              </div>
            )}
          />
        </div>
    </div>
  );
}
