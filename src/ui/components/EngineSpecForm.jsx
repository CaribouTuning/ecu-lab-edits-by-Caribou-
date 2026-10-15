/**
 * An engine described by its own figures: the cylinder layout, bore, stroke, compression
 * and redline from the owner's manual or the build sheet, and anything else the player
 * knows. Nothing is pre-filled. A figure the player leaves out is filled with a stated
 * typical value and listed afterwards, so no number on a later screen is a quiet guess.
 *
 * The same form starts a blank game (EngineStart) and replaces the engine from BUILD.
 */

import React, { useState } from 'react';

import {
  CONFIG_OPTS, CUSTOM_ENGINE_LIMITS, CYL_COUNT, INJECTION_OPTS, MATERIAL_OPTS, VALVES_PER_CYL_OPTS,
  VALVETRAIN_OPTS, customEnginePatch, validateCustomEngine,
} from '../../sim/index.js';
import { Button } from '../primitives/Button.jsx';
import { Note } from '../primitives/Note.jsx';
import { Seg } from '../primitives/Seg.jsx';

import styles from './EngineSpecForm.module.css';

/** The required figures, in the order a build sheet lists them. */
const REQUIRED = [
  { key: 'bore', label: 'Bore', hint: 'Cylinder diameter' },
  { key: 'stroke', label: 'Stroke', hint: 'Piston travel' },
  { key: 'compression', label: 'Compression ratio', hint: 'Static, e.g. 10.5' },
  { key: 'redline', label: 'Redline', hint: 'Rev limit' },
];

/**
 * @param {object} props
 * @param {(patch: object) => void} props.onCreate gets the `customEnginePatch` for a valid spec
 * @param {string} [props.submitLabel]
 * @returns {React.ReactElement}
 */
export function EngineSpecForm({ onCreate, submitLabel = 'CREATE THIS ENGINE' }) {
  const [spec, setSpec] = useState(/** @type {Record<string, any>} */ ({
    configuration: '', bore: '', stroke: '', compression: '', redline: '',
    camDuration: '', valvetrain: '', valvesPerCyl: '', injection: '', blockMaterial: '', headMaterial: '',
  }));
  const [tried, setTried] = useState(false);
  const set = (patch) => setSpec((s) => ({ ...s, ...patch }));
  const check = validateCustomEngine(spec);
  const errors = /** @type {Record<string, string>} */ (tried ? /** @type {any} */ (check).errors ?? {} : {});

  const submit = (e) => {
    e.preventDefault();
    setTried(true);
    if (check.ok) onCreate(customEnginePatch(check.engine, check.assumed));
  };

  // What the entered figures come to, shown as soon as they are valid: the player can
  // compare it with the number on their own spec sheet before creating anything.
  const displacement = check.ok
    ? (Math.PI / 4) * (check.engine.bore / 10) ** 2 * (check.engine.stroke / 10) * CYL_COUNT[check.engine.configuration] / 1000
    : null;

  return (
    <form className={styles.form} onSubmit={submit} noValidate aria-label="Describe your engine">
      <div className={styles.group}>
        <div className={styles.label} id="spec-layout">Cylinder layout</div>
        <Seg
          label="Cylinder layout" equal value={spec.configuration}
          options={CONFIG_OPTS.map((c) => ({ id: c, label: `${c} · ${CYL_COUNT[c]} cyl` }))}
          onChange={(v) => set({ configuration: v })}
        />
        {errors.configuration && <div className={styles.error} role="alert">{errors.configuration}</div>}
      </div>

      <div className={styles.grid}>
        {REQUIRED.map(({ key, label, hint }) => {
          const lim = CUSTOM_ENGINE_LIMITS[key];
          return (
            <label key={key} className={styles.field}>
              <span className={styles.label}>{label}</span>
              <span className={styles.inputRow}>
                <input
                  className={styles.input} inputMode="decimal" autoComplete="off"
                  value={spec[key]} placeholder={hint}
                  aria-invalid={errors[key] ? 'true' : undefined}
                  onChange={(e) => set({ [key]: e.target.value })}
                />
                <span className={styles.unit}>{lim.unit}</span>
              </span>
              {errors[key] && <span className={styles.error} role="alert">{errors[key]}</span>}
            </label>
          );
        })}
      </div>

      <details className={styles.more}>
        <summary>More about this engine (optional)</summary>
        <p className={styles.note}>
          Fill in what you know. Anything you leave blank is filled with the typical value named
          beside it, and listed for you after the engine is created.
        </p>
        <label className={styles.field}>
          <span className={styles.label}>Intake cam duration</span>
          <span className={styles.inputRow}>
            <input
              className={styles.input} inputMode="decimal" autoComplete="off" placeholder="210 if unknown"
              value={spec.camDuration} aria-invalid={errors.camDuration ? 'true' : undefined}
              onChange={(e) => set({ camDuration: e.target.value })}
            />
            <span className={styles.unit}>{CUSTOM_ENGINE_LIMITS.camDuration.unit}</span>
          </span>
          {errors.camDuration && <span className={styles.error} role="alert">{errors.camDuration}</span>}
        </label>
        <div className={styles.label}>Valvetrain</div>
        <Seg label="Valvetrain" equal value={spec.valvetrain} options={VALVETRAIN_OPTS} onChange={(v) => set({ valvetrain: v })} />
        <div className={styles.label}>Valves per cylinder</div>
        <Seg label="Valves per cylinder" equal value={spec.valvesPerCyl} options={VALVES_PER_CYL_OPTS.map((n) => ({ id: n, label: String(n) }))} onChange={(v) => set({ valvesPerCyl: Number(v) })} />
        <div className={styles.label}>Fuel injection</div>
        <Seg label="Fuel injection" equal value={spec.injection} options={INJECTION_OPTS} onChange={(v) => set({ injection: v })} />
        <div className={styles.label}>Block</div>
        <Seg label="Block material" equal value={spec.blockMaterial} options={MATERIAL_OPTS.map((m) => ({ id: m, label: m }))} onChange={(v) => set({ blockMaterial: v })} />
        <div className={styles.label}>Cylinder head</div>
        <Seg label="Head material" equal value={spec.headMaterial} options={MATERIAL_OPTS.map((m) => ({ id: m, label: m }))} onChange={(v) => set({ headMaterial: v })} />
      </details>

      {displacement != null && (
        <div className={styles.result} data-testid="spec-displacement">
          That is <b>{displacement.toFixed(2)} L</b> ({(displacement * 61.0237).toFixed(0)} cu in). Check it against your engine&apos;s own figure before creating it.
        </div>
      )}
      {check.ok && check.estimated.length > 0 && (
        <Note>Not entered, so typical values will be used: {check.estimated.join('; ')}. You can change each on BUILD afterwards.</Note>
      )}
      <div>
        <Button type="submit" size="lg" onClick={submit}>{submitLabel}</Button>
      </div>
    </form>
  );
}
