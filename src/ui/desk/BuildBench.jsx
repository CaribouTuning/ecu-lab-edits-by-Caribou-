/**
 * The build bench's software: the engine on the bench is built here, a part at a
 * time, and it changes on the stand as you choose (shopScene.js redraws it from the build).
 *
 * Laid out as engine-building software is: the engine's parts down the left, each with what
 * is on it now, and the chosen part's options on the right, the figures that part decides at
 * the head of its sheet. The options are BUILD's own screens (screens/build), shown one part
 * at a time (BuildBenchMode), so every control is the same control writing the same build.
 *
 * On a screen taller than wide the bench's camera has only the computer in view, so the
 * software shows the engine itself, turning above the sheet, where the stand would be.
 *
 * It says which of three things is being built: a factory engine as it was built (stock), a
 * factory engine with parts changed (modified, each changed part marked), or the player's own.
 */

import React, { useEffect, useMemo, useState } from 'react';

import {
  EXHAUST_DIA_OPTS, FUEL_CHOICES, INJECTOR_OPTS, TURBINE_OPTS, VALVETRAIN_OPTS, blowerOf,
} from '../../sim/index.js';
import { BuildBenchMode } from '../components/BuildSection.jsx';
import { EngineStart } from '../screens/build/EngineStart.jsx';
import { changedParts } from '../state/baseMap.js';
import { useBuild, useTune } from '../state/StoreProvider.jsx';
import { engineSpecOf } from '../world/models/engine.js';

import { EngineViewer } from './EngineViewer.jsx';

import styles from './BuildBench.module.css';

/** How the parts list names where the engine came from. */
const ORIGIN_TAG = { stock: 'Stock', modified: 'Modified', own: 'Your own' };

/** The engine's parts, in the order an engine is built up: the block, then on top of it. */
export const BENCH_PARTS = [
  { id: 'engine', label: 'Engine', lead: 'The engine you start from: a factory engine, or your own.' },
  { id: 'block', label: 'Short block', lead: 'Cylinders, bore and stroke, compression, and the pistons and rods that carry them.' },
  { id: 'head', label: 'Heads and cam', lead: 'How it breathes: the cam, the springs that follow it, the valves, the spark.' },
  { id: 'induction', label: 'Induction', lead: 'What feeds it air: the intake, a turbo or a supercharger, and nitrous.' },
  { id: 'fuel', label: 'Fuel system', lead: 'What is in the tank, and the pump, rail and injectors that deliver it.' },
  { id: 'exhaust', label: 'Exhaust', lead: 'The pipe, the headers and the cat-back.' },
];

/**
 * What is on each part now, in a line: the parts list's second line.
 * @param {any} build @param {any} derived @param {{name: string}|null} preset
 * @returns {Record<string, string>}
 */
export function partSummaries(build, derived, preset) {
  const cfg = build.engineConfig;
  const blower = blowerOf(build);
  const vt = VALVETRAIN_OPTS.find((o) => o.id === (cfg.valvetrain ?? 'dohc'))?.label ?? 'DOHC';
  const fuel = FUEL_CHOICES[build.octaneIdx];
  const housing = TURBINE_OPTS[build.turbineIdx].label.split(' ')[0];
  const turbo = build.turboOn
    ? `Turbo, ${build.turbineCount > 1 ? `Twin ${housing.toLowerCase()}` : housing} turbine, peak ${Math.max(...build.boostCurve)} psi`
    : blower ? `${blower.label}, ${(build.blowerRatio ?? blower.defaultRatio ?? 1).toFixed(2)}:1 pulley` : 'Naturally aspirated';
  const bolt = [build.mods?.intake && 'intake', build.nitrous && `${build.nitrous.shotHp} shot`].filter(Boolean).join(', ');
  const ex = [build.mods?.headers && 'headers', build.mods?.exhaust && 'cat-back'].filter(Boolean).join(', ');
  return {
    engine: preset ? `${preset.name}, ${derived.displacementL.toFixed(1)} L ${cfg.configuration}` : `Your own engine, ${derived.displacementL.toFixed(1)} L ${cfg.configuration}`,
    block: `${cfg.bore.toFixed(1)} × ${cfg.stroke.toFixed(1)} mm, ${cfg.compression.toFixed(1)}:1`,
    head: `${vt}, ${cfg.valvesPerCyl ?? 4} valves, ${cfg.camDuration}° cam`,
    induction: bolt ? `${turbo}, ${bolt}` : turbo,
    fuel: `${fuel.flex ? `Flex E${Math.round(build.ethanolPct ?? 0)}` : fuel.label}, ${INJECTOR_OPTS[build.injIdx].label}`,
    exhaust: ex ? `${EXHAUST_DIA_OPTS[build.exhaustDiaIdx].label}, ${ex}` : EXHAUST_DIA_OPTS[build.exhaustDiaIdx].label,
  };
}

/** @returns {boolean} the screen is taller than wide, where the stand is out of view */
function useTall() {
  const q = '(max-aspect-ratio: 9/10)';
  const read = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(q).matches;
  const [tall, setTall] = useState(read);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const mq = window.matchMedia(q);
    const on = () => setTall(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return tall;
}

/**
 * @param {object} props
 * @param {string} props.part the part open
 * @param {(id: string) => void} props.onPart choose another part
 * @param {any} props.preset the factory engine it was built from, if any
 * @param {(preset: any) => void} props.onStock put it back to that factory engine as it was built
 * @param {() => void} props.onRun the build done: over to the engine stand to start it
 * @param {boolean} [props.locked] CAREER on a customer's car: the engine is theirs, not to be swapped
 * @param {React.ReactNode} [props.notice] a line over the sheet: in CAREER, whose parts these are
 * @param {any} props.derived the engine on the bench, derived (the shell's `engineDerived`:
 *   derived once per build, not here on every live-engine step)
 * @param {number} [props.rpm] the engine's speed when it is running on the stand
 * @param {React.ReactNode} props.children the open part's options
 * @param {(() => void)|null} [props.onBaseMap] load a base start-up map for the parts fitted,
 *   offered on a factory engine with parts changed (null: not offered)
 * @param {boolean} [props.full] full screen (the bench's own page) rather than inside a
 *   monitor: the engine turns at the head of the parts list, always in view
 * @returns {React.ReactElement}
 */
export function BuildBench({ part, onPart, preset, onStock, onRun, derived, rpm = 0, locked = false, notice = null, full = false, onBaseMap = null, children }) {
  const [build] = useBuild();
  const [tune] = useTune();
  // Swapping the engine on the bench: the same two ways in as an empty bench, in the sheet.
  const [changing, setChanging] = useState(false);
  const sums = useMemo(() => partSummaries(build, derived, preset), [build, derived, preset]);
  const open = BENCH_PARTS.find((p) => p.id === part) ?? BENCH_PARTS[0];
  const tall = useTall();
  const spec = useMemo(() => engineSpecOf(build, derived), [build, derived]);
  const changed = useMemo(() => changedParts(build, preset), [build, preset]);
  // Where the engine stands against the factory: three different things to be building.
  const origin = !preset ? 'own' : changed.size ? 'modified' : 'stock';
  const changedNames = BENCH_PARTS.filter((p) => changed.has(p.id)).map((p) => p.label);
  return (
    <div className={styles.wrap} data-full={full ? 'true' : undefined}>
    <div className={styles.bench}>
      <nav className={styles.parts} aria-label="Engine parts">
        {full && <EngineViewer spec={spec} rpm={rpm} label={`The engine on the stand: ${sums.engine}`} />}
        {BENCH_PARTS.map((p, i) => (
          <button key={p.id} type="button" className={styles.part} aria-current={p.id === open.id ? 'true' : undefined} onClick={() => { setChanging(false); onPart(p.id); }}>
            <span className={styles.partName}>
              <span className={styles.step} aria-hidden="true">{i + 1}</span>{p.label}
              {p.id === 'engine' && <span className={styles.origin} data-origin={origin}>{ORIGIN_TAG[origin]}</span>}
              {changed.has(p.id) && <span className={styles.changed}>Changed</span>}
            </span>
            <span className={styles.partNow}>{sums[p.id]}</span>
          </button>
        ))}
      </nav>
      <section className={styles.sheet} aria-label={open.label}>
        {tall && !full && (
          <EngineViewer spec={spec} rpm={rpm} label={`The engine on the stand: ${sums.engine}`} />
        )}
        <header className={styles.sheetHead}>
          <h2 className={styles.sheetTitle}>{open.label}</h2>
          <p className={styles.sheetLead}>{open.lead}</p>
        </header>
        {notice && <div className={styles.notice}>{notice}</div>}
        {open.id === 'engine' && (
          <div className={styles.originPanel} data-origin={origin}>
            {origin === 'stock' && <p><b>Stock {preset.name}.</b> Every part is as the factory built it, and so is the calibration. Change any part to make it your own build of it.</p>}
            {origin === 'modified' && (
              <>
                <p><b>Modified {preset.name}.</b> Changed from stock: {BENCH_PARTS.filter((p) => changed.has(p.id)).map((p) => p.label).join(', ')}. The calibration is still the factory&apos;s, so log and tune what you changed{onBaseMap ? <>, or load a base start-up map: what a tuner would start from for these parts, safe and conservative, not tuned. It replaces your tables; Undo brings them back</> : null}.</p>
                {onBaseMap && <button type="button" className={styles.originBtn} onClick={onBaseMap}>Load a base start-up map</button>}
                <button type="button" className={styles.originBtn} onClick={() => onStock(preset)}>Return to stock</button>
              </>
            )}
            {origin === 'own' && <p><b>Your own engine.</b> Built from your figures, its calibration generated from the physics.</p>}
            {!locked && !changing && <button type="button" className={styles.originBtn} onClick={() => setChanging(true)}>Change engine</button>}
          </div>
        )}
        <div className={styles.sheetBody}>
          {open.id === 'engine' && changing
            ? <EngineStart onCancel={() => setChanging(false)} onDone={() => setChanging(false)} replacing={tune.tablesDirty} />
            : <BuildBenchMode.Provider value>{children}</BuildBenchMode.Provider>}
        </div>
        {/* Built up in order, block first: the next part, or, the last one done, the stand. */}
        {!changing && (
          <footer className={styles.steps}>
            {/* What this build is, against the factory, always in view: what has been done. */}
            <span className={styles.changes} data-testid="build-changes">
              {origin === 'own' ? 'Your own engine' : changedNames.length ? <>Changed from stock: <b>{changedNames.join(', ')}</b></> : 'Stock: nothing changed yet'}
            </span>
            {BENCH_PARTS.indexOf(open) > 0 && (
              <button type="button" className={styles.stepBtn} onClick={() => onPart(BENCH_PARTS[BENCH_PARTS.indexOf(open) - 1].id)}>
                Back<span className={styles.stepName}>: {BENCH_PARTS[BENCH_PARTS.indexOf(open) - 1].label}</span>
              </button>
            )}
            {BENCH_PARTS.indexOf(open) < BENCH_PARTS.length - 1 ? (
              <button type="button" className={styles.stepGo} onClick={() => onPart(BENCH_PARTS[BENCH_PARTS.indexOf(open) + 1].id)}>
                Next: {BENCH_PARTS[BENCH_PARTS.indexOf(open) + 1].label}
              </button>
            ) : (
              <button type="button" className={styles.stepGo} onClick={onRun}>Start it on the engine stand</button>
            )}
          </footer>
        )}
      </section>
    </div>
    </div>
  );
}
