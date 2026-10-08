/**
 * LIVE's physics view: the simulator's own working for the instant you are watching.
 * The working itself (sections 1–5) is shared with DYNO (components/PhysicsWorking.jsx);
 * this view adds the crankshaft, which only a running engine has.
 *
 * Every number here is one the live engine computed this step — read from the operating
 * point `evaluatePoint` returned (`live.live`) and from the cylinder pressure trace
 * `runCycle` integrated (`live.physics`, recorded only while this view is open). The
 * equations are the ones those functions use, with this step's numbers put into them;
 * where a line is worked out here from the simulator's rounded outputs it is marked ≈.
 * The gauges above are sensor readings with lag and noise; this is the model itself.
 *
 * It refreshes four times a second rather than at the engine's 20 Hz so the numbers can
 * be read, and FREEZE holds one instant still.
 */

import { Sigma } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';

import { ENGINE_INERTIA } from '../../../sim/index.js';
import { PhysicsWorking, Step, fmt, physicsStyles as styles } from '../../components/PhysicsWorking.jsx';
import { Button } from '../../primitives/Button.jsx';
import { Eyebrow } from '../../primitives/Eyebrow.jsx';
import { Panel } from '../../primitives/Panel.jsx';
import { ACTIONS } from '../../state/reducer.js';
import { useSession } from '../../state/StoreProvider.jsx';

const REFRESH_MS = 250;

/** LIVE's physics view and the button that opens it. */
export function PhysicsPanel() {
  const [session, dispatch] = useSession();
  const open = !!session.physicsOpen;
  const live = /** @type {Record<string, any>} */ (session.live);
  const [frozen, setFrozen] = useState(false);
  const [snap, setSnap] = useState(/** @type {any} */ (null));
  const last = useRef(0);

  useEffect(() => {
    if (!open || frozen || !live.physics || !live.live) return;
    const now = Date.now();
    if (now - last.current < REFRESH_MS && snap) return;
    last.current = now;
    setSnap({ pt: live.live, ph: live.physics, rpm: live.rpm, fuelCut: live.fuelCut });
  }, [open, frozen, live, snap]);

  const setOpen = (value) => dispatch({ type: ACTIONS.SET_SESSION_FIELD, field: 'physicsOpen', value });

  if (!open) {
    return (
      <div className={styles.opener}>
        <Button variant="ghost" onClick={() => setOpen(true)}>SHOW THE PHYSICS</Button>
        <span className={styles.openerText}>Watch the simulator work out this engine, step by step, while it runs.</span>
      </div>
    );
  }

  const head = (
    <div className={styles.head}>
      <Eyebrow icon={Sigma}>The physics, live</Eyebrow>
      <div className={styles.headButtons}>
        <Button size="sm" variant={frozen ? 'primary' : 'ghost'} onClick={() => setFrozen(!frozen)}>{frozen ? 'RESUME' : 'FREEZE'}</Button>
        <Button size="sm" variant="ghost" onClick={() => { setFrozen(false); setOpen(false); }}>HIDE</Button>
      </div>
    </div>
  );

  if (!snap) {
    return (
      <Panel className={styles.panel}>
        {head}
        <p className={styles.note}>Start the engine: the simulator shows its working once a cylinder is firing.</p>
      </Panel>
    );
  }

  const { pt, ph, rpm } = snap;

  return (
    <Panel className={styles.panel}>
      {head}
      <p className={styles.note}>
        This engine at {Math.round(rpm)} rpm. These are the simulator&apos;s own numbers, not sensor
        readings{frozen ? ' — frozen' : ', four times a second'}.
        {snap.fuelCut && ' Fuel is cut this instant (limiter or overrun), so the engine is turning on its own inertia; the cycle below is the one it would fire at this speed and load, which is what returns when fuel does.'}
      </p>

      <PhysicsWorking pt={pt} ph={ph}>
        <section className={styles.block}>
          <h3 className={styles.blockTitle}>6 · The crankshaft</h3>
          <Step
            name="Speed change"
            eq={<>I · dω/dt = brake torque − loads; I = {ENGINE_INERTIA} kg·m², brake torque {fmt(ph.crankNm, 0)} N·m</>}
            result={<>{ph.rpmRate >= 0 ? '+' : ''}{fmt(ph.rpmRate, 0)} rpm/s</>}
          />
          <Step name="Exhaust" eq={<>blowdown and displacement from the cycle&apos;s end state</>} result={<>EGT {pt.egt} °C</>} />
        </section>
      </PhysicsWorking>
    </Panel>
  );
}
