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
import { EngineSpecForm } from '../../components/EngineSpecForm.jsx';
import { Panel } from '../../primitives/Panel.jsx';
import { ACTIONS } from '../../state/reducer.js';
import { useBuild } from '../../state/StoreProvider.jsx';

import styles from './EngineStart.module.css';

/**
 * @returns {React.ReactElement}
 */
/**
 * The factory engines, by maker, as cards: the start screen's first choice and the Build
 * app's Factory engines list.
 * @param {{onPick: (preset: any) => void, picked?: any}} props
 */
export function PrebuiltEngines({ onPick, picked = null }) {
  return (
    <>
      {PRESET_GROUPS.map((g) => (
        <div key={g.manufacturer} className={styles.group}>
          <div className={styles.maker}>{g.manufacturer}</div>
          <div className={styles.cards}>
            {g.presets.map((p) => (
              <button key={p.id} type="button" className={styles.card} onClick={() => onPick(p)} aria-pressed={picked ? picked.id === p.id : undefined}>
                <span className={styles.name}>{p.name}</span>
                <span className={styles.spec}>
                  {p.factory.displacementL.toFixed(1)} L {p.engine.configuration}
                  {p.induction.turboOn ? ' turbo' : ''}, {p.factory.crankHp} hp, {p.years}
                </span>
              </button>
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
 * from, the engine's published figures to read, and a confirm; the custom path is the spec
 * form. Both land on the same build bench with the engine loaded. The path and the engine
 * picked survive Back, for as long as this screen is up.
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
  const [path, setPath] = useState(/** @type {null|'factory'|'custom'} */ (null));
  const [picked, setPicked] = useState(/** @type {any} */ (null));
  const load = (preset) => { dispatch({ type: ACTIONS.APPLY_PRESET, preset: applyPreset(preset) }); onDone?.(); };
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
          <button type="button" className={styles.path} onClick={() => setPath('custom')}>
            <span className={styles.pathName}>Build a custom engine</span>
            <span className={styles.pathWhat}>Your own engine from its layout, bore, stroke, compression and redline. Its calibration is generated from the physics.</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page} data-testid="engine-start">
      <div className={styles.bar}>
        <button type="button" className={styles.back} onClick={() => setPath(null)}>Back</button>
        <h2 className={styles.title}>{path === 'factory' ? 'Factory engines' : 'Custom engine'}</h2>
      </div>
      {path === 'factory' ? (
        <div className={styles.catalog}>
          <div><PrebuiltEngines onPick={setPicked} picked={picked} /></div>
          {picked && (
            <aside className={styles.sheet} aria-label={`${picked.name} specifications`}>
              <div className={styles.sheetName}>{picked.name}</div>
              <dl className={styles.specs}>
                <dt>Layout</dt><dd>{picked.engine.configuration}{picked.induction.turboOn ? ', turbocharged' : ''}</dd>
                <dt>Displacement</dt><dd>{picked.factory.displacementL.toFixed(1)} L</dd>
                <dt>Bore × stroke</dt><dd>{picked.engine.bore} × {picked.engine.stroke} mm</dd>
                <dt>Compression</dt><dd>{picked.engine.compression}:1</dd>
                <dt>Redline</dt><dd>{picked.engine.redline.toLocaleString('en-US')} rpm</dd>
                <dt>Factory rating</dt><dd>{picked.factory.crankHp} hp, {picked.factory.crankTq} lb-ft</dd>
                <dt>Years</dt><dd>{picked.years}</dd>
              </dl>
              <button type="button" className={styles.use} onClick={() => load(picked)} aria-label={`Use ${picked.name}`}>{replacing ? 'Replace the engine and its tune' : 'Put it on the bench'}</button>
            </aside>
          )}
        </div>
      ) : (
        <Panel>
          <p className={styles.formLead}>
            Enter your engine&apos;s figures from its manual or build sheet. Everything past these is set on the bench after.
          </p>
          <EngineSpecForm onCreate={create} />
        </Panel>
      )}
    </div>
  );
}
