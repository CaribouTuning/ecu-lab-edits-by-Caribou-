/**
 * The CHASSIS tab: suspension, tyre and transmission settings for one of your own cars, and
 * what they do, measured on the vehicle model. Every control says what it changes; a control
 * the car has no part for says which part opens it.
 */

import { Lock } from 'lucide-react';
import React, { useMemo } from 'react';

import { CHASSIS_PARTS, CONTROLS, effective, open, resetChassis, tuneChassis } from '../career/chassis.js';
import { carState, ownJobId } from '../career/ownedCars.js';
import { Button } from '../primitives/Button.jsx';

import { chassisReport } from './chassisReport.js';
import { bodyFor } from './levels/common.js';
import styles from './Panels.module.css';
import { driveSetup } from './vehicle.js';

const BALANCE = {
  understeer: 'The nose runs wide first (understeer): safe, and slow in a tight corner.',
  neutral: 'Both ends let go together: neutral, the way a driver wants it.',
  oversteer: 'The tail lets go first (oversteer): quick to turn in, and it bites back.',
};

/** @param {{career: import('../career/shop.js').Career, update: (c: any) => void, car: import('../career/ownedCars.js').OwnedCar}} p */
export function ChassisPanel({ career, update, car }) {
  const has = car.drag.chassis?.has ?? {};
  const set = car.drag.chassis?.set ?? {};
  const eff = effective(has, set);
  const state = carState(career, car.id);
  const report = useMemo(() => {
    if (!state) return null;
    try {
      const job = { own: true, customer: { body: car.body }, id: ownJobId(car.id) };
      return chassisReport(driveSetup(state, { body: bodyFor(job), drag: { ...car.drag, lowered: car.look.lowered } }).pt);
    } catch { return null; }
  }, [state, car.drag, car.body, car.look.lowered, car.id]);
  const fitted = Object.keys(CHASSIS_PARTS).filter((k) => has[k]);
  return (
    <div className={styles.grid1}>
      <section className={styles.card}>
        <div className={styles.tag}>Chassis: {car.name}</div>
        <p className={styles.small}>Fitted: {fitted.length ? fitted.map((k) => CHASSIS_PARTS[k]).join(', ') : 'nothing: stock suspension and gearing. Tyre pressure and brake bias are always yours to set; the rest open with parts from Gearhead Supply.'}</p>
        {report ? (
          <dl className={styles.stats}>
            <dt>Skidpad grip</dt><dd>{report.skidpadG.toFixed(2)} g</dd>
            <dt>100 to 0 km/h</dt><dd>{report.brakeM.toFixed(1)} m</dd>
            <dt>Balance</dt><dd>{report.balance}</dd>
          </dl>
        ) : <p className={styles.small}>Measuring&hellip;</p>}
        {report && <p className={styles.small}>{BALANCE[report.balance]}</p>}
      </section>
      {CONTROLS.map((c) => {
        const on = open(c, has);
        const id = `ch-${c.id}`;
        return (
          <section key={c.id} className={styles.card} data-owned={on}>
            <div className={styles.itemHead}>
              <label htmlFor={id}><b>{c.label}</b></label>
              <span className={styles.dim}>{eff[c.id]}{c.unit ? ` ${c.unit}` : ''}</span>
            </div>
            <input id={id} type="range" min={c.min} max={c.max} step={c.step} value={eff[c.id]} disabled={!on} style={{ width: '100%' }} onChange={(e) => update(tuneChassis(career, car.id, { [c.id]: Number(e.target.value) }))} />
            <p className={styles.small}>{c.does}</p>
            {!on && <p className={styles.blocked}><Lock size={11} aria-hidden="true" /> Needs: {c.needs?.map((p) => CHASSIS_PARTS[p]).join(' or ')}.</p>}
          </section>
        );
      })}
      <div className={styles.row}><Button size="sm" variant="ghost" onClick={() => update(resetChassis(career, car.id))}>Back to defaults</Button></div>
    </div>
  );
}
