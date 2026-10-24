/**
 * The engine stand's build software: the engine on the stand is built here, a part at a
 * time, and it changes on the stand as you choose (shopScene.js redraws it from the build).
 *
 * Laid out as engine-building software is: the engine's parts down the left, each with what
 * is on it now, and the chosen part's options on the right, the figures that part decides at
 * the head of its sheet. The options are BUILD's own screens (screens/build), shown one part
 * at a time (BuildBenchMode), so every control is the same control writing the same build.
 *
 * On a screen taller than wide the stand's camera has only the computer in view, so the
 * software shows the engine itself, turning above the sheet, where the stand would be.
 */

import React, { useEffect, useState } from 'react';

import {
  EXHAUST_DIA_OPTS, FUEL_CHOICES, INJECTOR_OPTS, TURBINE_OPTS, VALVETRAIN_OPTS, blowerOf, deriveEngine,
} from '../../sim/index.js';
import { BuildBenchMode } from '../components/BuildSection.jsx';
import { useBuild, useSession } from '../state/StoreProvider.jsx';
import { engineSpecOf } from '../world/models/engine.js';

import { EngineViewer } from './EngineViewer.jsx';

import styles from './BuildBench.module.css';

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
    engine: `${preset ? preset.name : 'Custom build'}, ${derived.displacementL.toFixed(1)} L ${cfg.configuration}`,
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
 * @param {{name: string}|null} props.preset the factory engine it was built from, if any
 * @param {React.ReactNode} [props.notice] a line over the sheet: in CAREER, whose parts these are
 * @param {React.ReactNode} props.children the open part's options
 * @returns {React.ReactElement}
 */
export function BuildBench({ part, onPart, preset, notice = null, children }) {
  const [build] = useBuild();
  const [session] = useSession();
  const derived = deriveEngine(build.engineConfig);
  const sums = partSummaries(build, derived, preset);
  const open = BENCH_PARTS.find((p) => p.id === part) ?? BENCH_PARTS[0];
  const tall = useTall();
  const spec = engineSpecOf(build, derived);
  return (
    <div className={styles.wrap}>
    <div className={styles.bench}>
      <nav className={styles.parts} aria-label="Engine parts">
        {BENCH_PARTS.map((p) => (
          <button key={p.id} type="button" className={styles.part} aria-current={p.id === open.id ? 'true' : undefined} onClick={() => onPart(p.id)}>
            <span className={styles.partName}>{p.label}</span>
            <span className={styles.partNow}>{sums[p.id]}</span>
          </button>
        ))}
      </nav>
      <section className={styles.sheet} aria-label={open.label}>
        {tall && (
          <EngineViewer spec={spec} rpm={session.live.running ? session.live.rpm : 0} label={`The engine on the stand: ${sums.engine}`} />
        )}
        <header className={styles.sheetHead}>
          <h2 className={styles.sheetTitle}>{open.label}</h2>
          <p className={styles.sheetLead}>{open.lead}</p>
        </header>
        {notice && <div className={styles.notice}>{notice}</div>}
        <div className={styles.sheetBody}>
          <BuildBenchMode.Provider value>{children}</BuildBenchMode.Provider>
        </div>
      </section>
    </div>
    </div>
  );
}
