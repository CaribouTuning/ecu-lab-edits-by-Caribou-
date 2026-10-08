/**
 * DYNO's physics view: the simulator's working for any point of the last pull, the same
 * step-by-step view LIVE has (components/PhysicsWorking.jsx).
 *
 * A pull does not keep its cylinder pressure traces (they would make every banked run
 * hundreds of times larger), so the view asks the shell to solve the chosen point again
 * with the recorder on: the same sweep inputs, the same pure functions, so the same
 * numbers — `simulateSweep`'s `traceRpm`, pinned by tests/physics-trace.test.js. While a
 * pull runs, the view follows the point the chart has just drawn; afterwards, any point
 * can be stepped to.
 */

import { Sigma } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';

import { DRIVETRAIN_EFF } from '../../../sim/index.js';
import { PhysicsWorking, Step, fmt, physicsStyles as styles } from '../../components/PhysicsWorking.jsx';
import { Button } from '../../primitives/Button.jsx';
import { Eyebrow } from '../../primitives/Eyebrow.jsx';
import { Panel } from '../../primitives/Panel.jsx';
import { ACTIONS } from '../../state/reducer.js';
import { useSession } from '../../state/StoreProvider.jsx';

/**
 * @param {object} props
 * @param {{points: object[]}} props.result the pull on the chart
 * @param {boolean} props.running whether that pull is still being drawn
 * @param {number} props.revealCount how many of its points the chart has drawn
 * @param {(result: object, rpm: number) => (object|null)} props.tracePoint the point at
 *   `rpm` solved again with its trace, or null when this pull's inputs are not at hand
 *   (a run restored from history)
 * @param {{cyl: number, displacementL: number}} props.engineDerived
 */
export function DynoPhysics({ result, running, revealCount, tracePoint, engineDerived }) {
  const [session, dispatch] = useSession();
  const open = !!session.dynoPhysicsOpen;
  const points = result.points;
  const peakIdx = useMemo(() => points.reduce((best, p, i) => (p.hp > points[best].hp ? i : best), 0), [points]);
  const [picked, setPicked] = useState(/** @type {number|null} */ (null));
  // A new pull starts the view over: following it while it runs, at its peak after.
  useEffect(() => { setPicked(null); }, [result]);
  const idx = Math.min(points.length - 1, picked ?? (running ? Math.max(0, revealCount - 1) : peakIdx));
  const rpm = points[idx]?.rpm;
  const traced = useMemo(() => (open && rpm != null ? tracePoint(result, rpm) : null), [open, result, rpm, tracePoint]);

  const setOpen = (value) => dispatch({ type: ACTIONS.SET_SESSION_FIELD, field: 'dynoPhysicsOpen', value });

  if (!open) {
    return (
      <div className={styles.opener}>
        <Button variant="ghost" onClick={() => setOpen(true)}>SHOW THE PHYSICS</Button>
        <span className={styles.openerText}>See how the simulator worked out each point of this pull, step by step.</span>
      </div>
    );
  }

  const step = (d) => setPicked(Math.max(0, Math.min(points.length - 1, idx + d)));
  const head = (
    <div className={styles.head}>
      <Eyebrow icon={Sigma}>The physics of this pull</Eyebrow>
      <div className={styles.headButtons}>
        <Button size="sm" variant="ghost" onClick={() => step(-1)} disabled={idx === 0} aria-label="Previous point">◀</Button>
        <Button size="sm" variant="ghost" onClick={() => step(1)} disabled={idx === points.length - 1} aria-label="Next point">▶</Button>
        {picked != null && <Button size="sm" variant="ghost" onClick={() => setPicked(null)}>{running ? 'FOLLOW THE PULL' : 'PEAK POWER'}</Button>}
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>HIDE</Button>
      </div>
    </div>
  );
  const scrubber = (
    <label className={styles.scrub}>
      <span>{rpm} rpm · point {idx + 1} of {points.length}{picked == null ? (running ? ' · following the pull' : ' · peak power') : ''}</span>
      <input
        type="range" min={0} max={points.length - 1} step={1} value={idx}
        onChange={(e) => setPicked(Number(e.target.value))}
        aria-label="Point of the pull"
      />
    </label>
  );

  if (!traced) {
    return (
      <Panel className={styles.panel}>
        {head}
        <p className={styles.note}>This pull was restored from history, so the inputs it was solved from are not at hand. Run a pull to see its physics.</p>
      </Panel>
    );
  }

  const ph = { trace: traced.physics.trace, inputs: traced.physics.inputs, cyl: engineDerived.cyl, displacementL: engineDerived.displacementL };
  const crankLbFt = traced.torque / DRIVETRAIN_EFF;
  return (
    <Panel className={styles.panel}>
      {head}
      {scrubber}
      <p className={styles.note}>
        The dyno holds the engine at {rpm} rpm at this pull&apos;s throttle, and the simulator solves the point to a steady state.
        These are the numbers this pull reported at {rpm} rpm, worked through.
      </p>
      <PhysicsWorking pt={traced} ph={ph}>
        <section className={styles.block}>
          <h3 className={styles.blockTitle}>6 · On the dyno</h3>
          <Step
            name="At the wheels"
            eq={<>crank torque × drivetrain efficiency = {fmt(crankLbFt, 0)} lb·ft × {DRIVETRAIN_EFF}</>}
            result={<>{traced.torque} lb·ft</>}
          />
          <Step
            name="Power"
            eq={<>hp = torque × rpm ÷ 5252 = {traced.torque} × {rpm} ÷ 5252</>}
            result={<>{traced.hp} whp</>}
          />
          <Step name="Exhaust" eq={<>blowdown and displacement from the cycle&apos;s end state</>} result={<>EGT {traced.egt} °C</>} />
        </section>
      </PhysicsWorking>
    </Panel>
  );
}
