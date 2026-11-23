/** Sandbox: how to start tuning an engine just built (state/tuneStart.js). */

import React from 'react';
import { Check, ChevronDown, ChevronRight, Circle, Gauge, ListChecks, Wrench, X } from 'lucide-react';

import { Button } from '../primitives/Button.jsx';
import { warm } from '../sim/warm.js';
import { ACTIONS } from '../state/reducer.js';
import { safeBaseMap, turboWithoutBoost } from '../state/safeBaseMap.js';
import { buildChanges, buildSignature, guideStepNow, guidedSteps, offersTuneStart, publishGuideStep, useTuneStartChoice, writeTuneStart } from '../state/tuneStart.js';
import { useBuild, useSession, useTune } from '../state/StoreProvider.jsx';
import styles from './TuneStart.module.css';

/** The safe base map for each build already worked out this visit: it takes a few pulls. */
const MADE = new Map();

/**
 * @param {object} props
 * @param {(page: string) => void} props.onGo open a TUNE page by id, or `dyno`
 * @param {boolean} [props.force] show it whatever the browser kept (tests)
 * @param {any} [props.advice] TUNE's advisor on the tables as they stand: the guide names its cells
 * @param {string|null} [props.page] the TUNE page open: the guide's line shows that page's step
 * @returns {React.ReactElement|null}
 */
export function TuneStart({ onGo, force = false, advice = null, page = null }) {
  const [build, dispatch] = useBuild();
  const [tune] = useTune();
  const [session] = useSession();
  const sig = buildSignature(build);
  const [busy, setBusy] = React.useState(false);
  const [made, setMade] = React.useState(() => MADE.get(sig) ?? null);
  React.useEffect(() => { setMade(MADE.get(sig) ?? null); }, [sig]);

  const offered = offersTuneStart({ mode: session.mode, build });
  const choice = useTuneStartChoice(sig);
  const testMode = /** @type {any} */ (import.meta).env?.MODE === 'test';
  const shown = offered && (force || !testMode);

  /** Work the map out (a few pulls), letting the screen say so first. */
  const make = (then) => {
    const have = MADE.get(sig);
    if (have) { then(have); return; }
    setBusy(true);
    // The checking pulls' breathing is solved off the drawing thread first (sim/warm.js), so
    // the screen keeps moving; then the same sums here read it back at once.
    // What a pull is solved from, and nothing else (a worker message must clone): as EcuLab's warmStateRef.
    const state = {
      build,
      tune: { ve: tune.ve, timing: tune.timing, afr: tune.afr, layout: tune.layout, ecu: tune.ecu },
      session: { env: session.env, faults: session.faults, liveAux: session.liveAux, loadKpa: 100, mode: session.mode },
    };
    const finish = () => {
      const m = safeBaseMap(state);
      MADE.set(sig, m);
      setMade(m);
      setBusy(false);
      then(m);
    };
    const ready = warm('safemap', { state });
    if (ready) ready.then(finish); else setTimeout(finish, 30);
  };
  // The guide's targets are the safe base map's: worked out when the guide opens.
  const needTargets = shown && choice === 'guided' && !made && !busy;
  React.useEffect(() => { if (needTargets) make(() => {}); });

  if (!shown) return null;
  const choose = (c) => writeTuneStart(sig, c);

  // A choice made: the base map's result, or the guide's steps, until the player closes them.
  if (choice === 'base' && made) return <BaseMapResult made={made} onClose={() => choose('advice')} />;
  if (choice === 'guided') {
    if (!made) {
      return <section className={styles.bar} aria-busy="true"><div className={styles.barRow}><span className={styles.barText}>Working out the targets: checking a base map for these parts on the dyno…</span></div></section>;
    }
    return <Guide sig={sig} made={made} build={build} tune={tune} advice={advice} page={page} onGo={onGo} onClose={() => choose('advice')} />;
  }
  // Chosen: one line, so the safe map or the guide is still there for later.
  if (choice) {
    return (
      <div className={styles.again} data-testid="tune-start-again">
        <span>Start the tune:</span>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => make((m) => { dispatch(/** @type {any} */ (m.action)); choose('base'); })}>Load a safe base map</Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => choose('guided')}>Open the guide</Button>
        {busy && <span role="status">Checking it on the dyno…</span>}
      </div>
    );
  }

  const options = [
    {
      id: 'base', Icon: Gauge, name: 'Load a safe base map',
      text: 'The game makes one for these parts and proves it on the dyno: safe, with power left for you to find.',
      onPick: () => make((m) => { dispatch(/** @type {any} */ (m.action)); choose('base'); }),
    },
    { id: 'guided', Icon: ListChecks, name: 'Build it with the guide', text: 'The game walks you through making a safe base map; you type each cell, and each step is checked.', onPick: () => choose('guided') },
    { id: 'advice', Icon: Wrench, name: 'Tune it yourself', text: 'Keep your tables. The pull log and the cell advisor tell you what is wrong; the rest is up to you.', onPick: () => choose('advice') },
  ];
  return (
    <section className={styles.card} data-testid="tune-start" aria-labelledby="tune-start-title">
      <div className={styles.head}>
        <h2 id="tune-start-title" className={styles.title}>Start the tune</h2>
        <p className={styles.lead}>Make it safe before chasing power. Undo puts your tables back.</p>
        {turboWithoutBoost(build) && (
          <p className={styles.lead} role="note"><b>The turbo has no boost target yet.</b> Set one on TUNE → BOOST first: at 0 psi it only restricts the exhaust. The guide starts there.</p>
        )}
      </div>
      <ul className={styles.list}>
        {options.map(({ id, Icon, name, text, onPick }) => (
          <li key={id}>
            <button type="button" className={styles.row} disabled={busy} onClick={onPick} data-option={id}>
              <span className={styles.rowIcon} aria-hidden="true"><Icon size={16} /></span>
              <span className={styles.rowBody}>
                <span className={styles.rowName}>{name}</span>
                <span className={styles.rowText}>{text}</span>
              </span>
              <ChevronRight size={16} aria-hidden="true" className={styles.rowChev} />
            </button>
          </li>
        ))}
      </ul>
      {busy && <p className={styles.note} role="status">Checking a base map for these parts on the dyno…</p>}
    </section>
  );
}

/** @param {{items: {type: string, msg: string, fix: string}[], title: string}} props */
function Entries({ items, title }) {
  if (!items.length) return null;
  return (
    <div className={styles.parts}>
      <div className={styles.partsTitle}>{title}</div>
      <ul className={styles.partsList}>
        {items.map((e, i) => <li key={`${e.type}-${i}`}><b>{e.msg}.</b> {e.fix}</li>)}
      </ul>
    </div>
  );
}

/**
 * The safe base map's result as one line: how it ran, with the work and the parts behind
 * Details, so the table below it is still in sight.
 * @param {{made: import('../state/safeBaseMap.js').SafeBaseMap, onClose: () => void}} props
 */
function BaseMapResult({ made, onClose }) {
  const [open, setOpen] = React.useState(!made.clean || !!made.noBoost);
  // Safe, but at 0 psi: proven, yet it says nothing about the turbo until it has a target.
  const tone = made.clean && !made.noBoost ? 'ok' : 'warn';
  return (
    <section className={styles.bar} data-testid="tune-start-result" data-tone={tone} aria-label="Safe base map">
      <div className={styles.barRow}>
        <span className={styles.dot} aria-hidden="true" />
        <span className={styles.barText}>
          <b>{!made.clean ? 'Base map loaded: not safe yet' : made.noBoost ? 'Base map loaded at 0 psi of boost' : 'Safe base map loaded'}</b>
          <span className={styles.barMeta}> · {made.peakHp} whp · {made.pulls} pulls{!made.clean ? ` · ${made.parts.length ? 'a part is the limit' : 'see why'}` : made.noBoost ? ' · set a boost target' : ''}</span>
        </span>
        <button type="button" className={styles.barToggle} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          Details <ChevronDown size={14} aria-hidden="true" className={styles.chev} data-open={open ? 'true' : 'false'} />
        </button>
        <button type="button" className={styles.barClose} aria-label="Close" onClick={onClose}><X size={14} aria-hidden="true" /></button>
      </div>
      {open && (
        <div className={styles.barBody}>
          {made.noBoost && (
            <p className={styles.lead}>
              <b>The turbo has no boost target.</b> Its gate holds 0 psi, so the turbine only stands in the exhaust and the engine makes less than it did without it. Set a boost target on TUNE → BOOST (6–8 psi is a common first step on pump fuel), then load the safe base map again: it proves the turbo a step at a time, from the low boost up.
            </p>
          )}
          <p className={styles.lead}>
            {made.clean
              ? <>Proven on the dyno as a tuner does it, with no knock and no lean. It is a safe start, not a finished tune: the timing sits a few degrees under what the engine can take, so a hot day or a poor tank of fuel does not hurt it. The power left is yours to find: tap a SPARK cell to see the room the last pull measured there, add a degree or two at a time, and pull again. The pull log speaks up only when something is wrong.</>
              : <>As safe as a map can make it, but at what the build asks for it still {made.left.some((e) => /knock/.test(e.type)) ? 'knocks' : 'runs lean'}. Change what is listed before pulling hard.</>}
          </p>
          <ol className={styles.workLog} aria-label="What was done, in order">
            {made.steps.map((t, i) => <li key={i}>{t}</li>)}
          </ol>
          <Entries title="Still in the log" items={made.left} />
          <Entries title="Parts that limit this build" items={made.parts} />
        </div>
      )}
    </section>
  );
}

/**
 * The guide as one line: which step of how many, the step to do now (in order: the first not
 * done), and a way to its page. All steps opens the list, so the table below stays in sight.
 * @param {{sig: string, made: import('../state/safeBaseMap.js').SafeBaseMap, build: any, tune: any, advice: any, page?: string|null, onGo: (page: string) => void, onClose: () => void}} props
 */
function Guide({ sig, made, build, tune, advice, page = null, onGo, onClose }) {
  const [open, setOpen] = React.useState(false);
  const [, dispatchTune] = useTune();
  // Opening the steps closes the cell editor: its sheet docks over the page, and left open it
  // covered the list the player had just asked to read.
  const toggle = () => {
    if (!open) dispatchTune({ type: ACTIONS.SET_TUNE_FIELD, field: 'selection', value: null });
    setOpen(!open);
  };
  const steps = guidedSteps({ build, tune, target: made.action, samples: made.samples, advice: advice?.overAdvanced ? advice : null });
  const done = steps.filter((s) => s.done).length;
  const changes = buildChanges(build);
  const now = guideStepNow(steps);
  const n = steps.indexOf(now) + 1;
  const here = now.go === page;
  React.useEffect(() => {
    publishGuideStep({ sig, n, of: steps.length, title: now.short ?? now.title, go: now.go, checkable: now.done !== null });
  });
  return (
    <section className={styles.bar} data-testid="tune-start-guide" aria-label="Base map guide">
      <div className={styles.barRow}>
        <span className={styles.progress} aria-label={`Step ${n} of ${steps.length}, ${done} done`}>{n}/{steps.length}</span>
        <span className={styles.barText}>
          <b>{now.short ?? now.title}</b>
          {here && <span className={styles.barMeta}> · this page</span>}
        </span>
        {!here && <Button size="sm" variant="ghost" onClick={() => onGo(now.go)}>{now.go === 'dyno' ? 'Dyno' : 'Go'}</Button>}
        <button type="button" className={styles.barToggle} aria-expanded={open} onClick={toggle}>
          {open ? 'Hide' : 'All steps'} <ChevronDown size={14} aria-hidden="true" className={styles.chev} data-open={open ? 'true' : 'false'} />
        </button>
        <button type="button" className={styles.barClose} aria-label="Close the guide" onClick={onClose}><X size={14} aria-hidden="true" /></button>
      </div>
      {/* The step that matters now, in full: what to type, on the page it is typed on. */}
      {!open && <p className={styles.barStep}><span className={styles.clamp}>{now.text}</span></p>}
      {open && (
        <div className={styles.barBody}>
          <p className={styles.lead}><b>This build: {changes.join(', ')}.</b> The steps below are what this build needs before the engine is pulled hard, in the order a tuner does them. The numbers come from a map the game checked on the dyno for this engine. You type every cell yourself; a step ticks off when your cells get there and TUNE&apos;s advisor agrees.</p>
          <ol className={styles.steps}>
            {steps.map((s) => (
              <li key={s.id} className={styles.step} data-done={s.done ? 'true' : 'false'} data-now={s === now ? 'true' : 'false'}>
                {s.done ? <Check size={16} aria-label="Done" className={styles.stepMark} /> : <Circle size={16} aria-label={s.done === null ? 'To do' : 'Not yet'} className={styles.stepMark} />}
                <div className={styles.stepBody}>
                  <div className={styles.stepName}>{s.title}</div>
                  <div className={styles.stepText}>{s.text}</div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => onGo(s.go)}>{s.go === 'dyno' ? 'Open the dyno' : 'Open'}</Button>
              </li>
            ))}
          </ol>
          <Entries title="Parts that limit this build" items={made.parts} />
        </div>
      )}
    </section>
  );
}
