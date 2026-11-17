/**
 * SANDBOX: how to start tuning an engine just built (state/tuneStart.js). Three ways, as a
 * shop would offer them:
 *
 *   - a safe base map: generated from the physics and checked on the dyno until it runs
 *     clean, what a tuner loads before the first power pull (state/safeBaseMap.js);
 *   - build that base map yourself, with the targets and a check on each step;
 *   - tune from the log and the advice, as always.
 *
 * Shown above TUNE's pages until the player picks one, and again when the build changes.
 * Loading the map is one LOAD_BASE_MAP: Undo brings the old tables back.
 */

import React from 'react';
import { Check, Circle, Gauge, ListChecks, Wrench } from 'lucide-react';

import { Button } from '../primitives/Button.jsx';
import { warm } from '../sim/warm.js';
import { safeBaseMap } from '../state/safeBaseMap.js';
import { buildSignature, guidedSteps, offersTuneStart, readTuneStart, writeTuneStart } from '../state/tuneStart.js';
import { useBuild, useSession, useTune } from '../state/StoreProvider.jsx';
import styles from './TuneStart.module.css';

/** The safe base map for each build already worked out this visit: it takes a few pulls. */
const MADE = new Map();

/**
 * @param {object} props
 * @param {(page: string) => void} props.onGo open a TUNE page by id, or `dyno`
 * @param {boolean} [props.force] show it whatever the browser kept (tests)
 * @returns {React.ReactElement|null}
 */
export function TuneStart({ onGo, force = false }) {
  const [build, dispatch] = useBuild();
  const [tune] = useTune();
  const [session] = useSession();
  const sig = buildSignature(build);
  const [kept, setKept] = React.useState(() => readTuneStart());
  const [busy, setBusy] = React.useState(false);
  const [made, setMade] = React.useState(() => MADE.get(sig) ?? null);
  React.useEffect(() => { setMade(MADE.get(sig) ?? null); }, [sig]);

  const offered = offersTuneStart({ mode: session.mode, build });
  const choice = kept?.sig === sig ? kept.choice : null;
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
  const choose = (c) => { writeTuneStart(sig, c); setKept({ sig, choice: c }); };

  // A choice made: the base map's result, or the guide's steps, until the player closes them.
  if (choice === 'base' && made) return <BaseMapResult made={made} onClose={() => choose('advice')} />;
  if (choice === 'guided') {
    if (!made) {
      return <section className={styles.card} aria-busy="true"><p className={styles.lead}>Working out the targets: checking a base map for these parts on the dyno…</p></section>;
    }
    return <Guide made={made} build={build} tune={tune} onGo={onGo} onClose={() => choose('advice')} />;
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

  return (
    <section className={styles.card} data-testid="tune-start" aria-labelledby="tune-start-title">
      <h2 id="tune-start-title" className={styles.title}>Start the tune</h2>
      <p className={styles.lead}>
        A tuner makes a new engine safe before chasing power: no knock and no lean on the first pull, then the timing and fuel found from the log.
        How do you want to start?
      </p>
      <div className={styles.options}>
        <button type="button" className={styles.option} disabled={busy}
          onClick={() => make((m) => { dispatch(/** @type {any} */ (m.action)); choose('base'); })}>
          <Gauge size={18} aria-hidden="true" className={styles.optionIcon} />
          <span className={styles.optionName}>Load a safe base map</span>
          <span className={styles.optionText}>What a tuner would load for these parts, generated from the physics and checked on the dyno until it runs clean, with power left to find. It replaces your tables; Undo brings them back.</span>
        </button>
        <button type="button" className={styles.option} disabled={busy} onClick={() => choose('guided')}>
          <ListChecks size={18} aria-hidden="true" className={styles.optionIcon} />
          <span className={styles.optionName}>Build the base map with a guide</span>
          <span className={styles.optionText}>You make it, step by step: injectors, air, mixture, safe spark. Each step gives the targets for a few speeds and ticks off when your tables get there.</span>
        </button>
        <button type="button" className={styles.option} disabled={busy} onClick={() => choose('advice')}>
          <Wrench size={18} aria-hidden="true" className={styles.optionIcon} />
          <span className={styles.optionName}>Tune from the advice</span>
          <span className={styles.optionText}>Keep the tables as they are and work from the pull log and TUNE&apos;s advice, as always.</span>
        </button>
      </div>
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

/** @param {{made: import('../state/safeBaseMap.js').SafeBaseMap, onClose: () => void}} props */
function BaseMapResult({ made, onClose }) {
  return (
    <section className={styles.card} data-testid="tune-start-result" data-tone={made.clean ? 'ok' : 'warn'}>
      <h2 className={styles.title}>{made.clean ? 'Safe base map loaded' : 'Base map loaded: not safe to lean on yet'}</h2>
      <p className={styles.lead}>
        {made.clean
          ? <>Checked on the dyno: it ran with no knock and no lean{made.pulls > 1 ? `, after ${made.pulls - 1} round${made.pulls > 2 ? 's' : ''} of taking spark out and adding fuel where it did` : ''}, at <b>{made.peakHp} whp</b>. The timing sits under what the engine can take: pull it, and the log and TUNE show where the rest is.</>
          : <>The map is as safe as a map can make it, at <b>{made.peakHp} whp</b>, but the parts or the fuel still let it knock or lean. Change what is listed before pulling hard.</>}
      </p>
      <Entries title="Still in the log" items={made.left} />
      <Entries title="Parts that limit this build" items={made.parts} />
      <div className={styles.actions}><Button size="sm" variant="ghost" onClick={onClose}>Close</Button></div>
    </section>
  );
}

/**
 * @param {{made: import('../state/safeBaseMap.js').SafeBaseMap, build: any, tune: any, onGo: (page: string) => void, onClose: () => void}} props
 */
function Guide({ made, build, tune, onGo, onClose }) {
  const steps = guidedSteps({ build, tune, target: made.action, samples: made.samples });
  const done = steps.filter((s) => s.done).length;
  const checkable = steps.filter((s) => s.done !== null).length;
  return (
    <section className={styles.card} data-testid="tune-start-guide">
      <h2 className={styles.title}>Build the base map: {done} of {checkable} done</h2>
      <p className={styles.lead}>The targets come from a base map the game checked on the dyno for these parts. You type every cell; each step ticks off when the cells the engine runs get there.</p>
      <ol className={styles.steps}>
        {steps.map((s) => (
          <li key={s.id} className={styles.step} data-done={s.done ? 'true' : 'false'}>
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
      <div className={styles.actions}><Button size="sm" variant="ghost" onClick={onClose}>Close the guide</Button></div>
    </section>
  );
}
