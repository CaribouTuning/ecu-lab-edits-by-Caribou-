/**
 * Gearhead Supply's parts counter: real hardware for your own cars. Every part says what it
 * does to the air, the fuel or the grip, and what the tuner now has to do about it.
 */

import { Check, Lock } from 'lucide-react';
import React, { useState } from 'react';

import { PARTS, cannotFit, fitPart, ownedCar } from '../career/ownedCars.js';
import { Button } from '../primitives/Button.jsx';

import styles from './Panels.module.css';

const GROUPS = [
  { id: 'air', label: 'AIR IN' }, { id: 'exhaust', label: 'EXHAUST OUT' }, { id: 'fuel', label: 'FUEL' }, { id: 'engine', label: 'ENGINE' },
  { id: 'boost', label: 'BOOST AND NITROUS' }, { id: 'drive', label: 'TYRES, GEARING, WEIGHT' },
];
const money = (n) => `$${Math.round(n).toLocaleString('en-US')}`;

/**
 * @param {{career: import('../career/shop.js').Career, update: (c: any) => void, canBuy: boolean, onGo: () => void}} p
 */
export function PartsPanel({ career, update, canBuy, onGo }) {
  const cars = career.cars ?? [];
  const [carId, setCarId] = useState(cars[0]?.id ?? null);
  const car = ownedCar(career, carId ?? '') ?? cars[0] ?? null;
  if (cars.length === 0) {
    return (
      <div className={styles.panel}>
        <section className={styles.card}>
          <div className={styles.tag}>PARTS ARE FOR YOUR OWN CARS</div>
          <p className={styles.small}>A customer&rsquo;s car arrives with whatever its owner fitted. Parts are for cars that are yours: buy one at Caribou Motors first.</p>
        </section>
      </div>
    );
  }
  return (
    <div className={styles.panel}>
      <div className={styles.summary}>
        <span>FITTING TO</span>
        <div className={styles.chips}>
          {cars.map((c) => <button key={c.id} type="button" className={styles.chip} aria-pressed={car?.id === c.id} onClick={() => setCarId(c.id)}>{c.name}</button>)}
        </div>
        <span className={styles.dim}>{canBuy ? 'Fitting a part changes the hardware and leaves the calibration alone. Retune afterwards.' : 'Parts are sold at Gearhead Supply.'}</span>
        {!canBuy && <Button size="sm" variant="ghost" onClick={onGo}>GO TO GEARHEAD SUPPLY</Button>}
      </div>
      {GROUPS.map((g) => (
        <div key={g.id} className={styles.grid1}>
          <h3 className={styles.partGroup}>{g.label}</h3>
          {PARTS.filter((p) => p.group === g.id).map((p) => {
            const why = car ? cannotFit(career, car.id, p.id) : 'Pick a car.';
            const fitted = car?.parts.includes(p.id) && !p.group.startsWith('boost');
            return (
              <section key={p.id} className={styles.card} data-owned={!!fitted} aria-label={p.name}>
                <div className={styles.itemHead}><b>{p.name}</b><span className={styles.dim}>{money(p.price)}</span></div>
                <p className={styles.small}>{p.does}</p>
                <p className={styles.then}>Then: {p.then}</p>
                {fitted ? <span className={styles.small}><Check size={12} aria-hidden="true" /> Fitted</span> : (
                  <>
                    {why && <p className={styles.blocked}><Lock size={11} aria-hidden="true" /> {why}</p>}
                    <Button size="sm" disabled={!canBuy || !!why} onClick={() => update(fitPart(career, car.id, p.id))}>{canBuy ? `FIT ${money(p.price)}` : 'SOLD AT SUPPLY'}</Button>
                  </>
                )}
              </section>
            );
          })}
        </div>
      ))}
    </div>
  );
}
