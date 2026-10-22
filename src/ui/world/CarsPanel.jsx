/**
 * The tuner's own cars: what they are, what they do on the dyno and the strip, and what to
 * do with them (drive, tune, show, dress up, sell), plus the dealer's lot when you are at
 * the dealer.
 */

import { Gauge, Paintbrush, Wrench } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';

import { engineById, engineForPreset } from '../career/engines.js';
import {
  ENGINES, KITS, PAINTS, SPOILERS, STRIPES, UNDERGLOWS, WHEEL_FINISHES, WHEEL_SETS, buyCar, cannotBuyCar, cannotSwap, carLimit, carState, dealerStock, ownJobId, parkOnLift,
  restyleCar, sellCar, stowFromLift, swapEngine, valueOf, partById,
} from '../career/ownedCars.js';
import { capacity } from '../career/shop.js';
import { Button } from '../primitives/Button.jsx';
import { world as W } from '../tokens.js';

import { bodyFor } from './levels/common.js';
import styles from './Panels.module.css';
import { driveSetup } from './vehicle.js';

const money = (n) => `$${Math.round(n).toLocaleString('en-US')}`;

/** A spec sheet, measured on the simulator when asked: a dyno pull and the strip. @param {{car: any, state: {build: any, tune: any}}} p */
function Specs({ car, state }) {
  const [specs, setSpecs] = useState(null);
  useEffect(() => {
    setSpecs(null);
    const t = setTimeout(() => {
      try {
        const job = { own: true, customer: { body: car.body }, id: ownJobId(car.id) };
        const setup = driveSetup(state, { body: bodyFor(job), drag: { ...car.drag, lowered: car.look.lowered } });
        const run = setup.strip();
        setSpecs({ hp: setup.peakHp, tq: setup.peakTq, redline: setup.redline, mass: setup.car.massKg, sixty: run.zeroToSixty, et: run.et, trap: run.trapMph, spun: run.wheelspun });
      } catch { setSpecs({ error: true }); }
    }, 30);
    return () => clearTimeout(t);
  }, [car, state]);
  if (!specs) return <p className={styles.small}>Measuring on the dyno&hellip;</p>;
  if (specs.error) return <p className={styles.small}>The simulator could not measure this one.</p>;
  return (
    <dl className={styles.stats}>
      <dt>Peak power</dt><dd>{Math.round(specs.hp)} whp</dd>
      <dt>Peak torque</dt><dd>{Math.round(specs.tq)} lb-ft</dd>
      <dt>Redline</dt><dd>{Math.round(specs.redline)} rpm</dd>
      <dt>Weight</dt><dd>{Math.round(specs.mass)} kg</dd>
      <dt>0 to 60</dt><dd>{specs.sixty ? `${specs.sixty.toFixed(2)} s` : '--'}</dd>
      <dt>Quarter mile</dt><dd>{specs.et.toFixed(2)} s at {specs.trap.toFixed(0)} mph{specs.spun ? ' (tyres spun)' : ''}</dd>
    </dl>
  );
}

/**
 * @param {object} p
 * @param {import('../career/shop.js').Career} p.career
 * @param {(c: any) => void} p.update
 * @param {string} p.place where the player is
 * @param {string|null} p.focus an owned car id to open
 * @param {(id: string) => void} p.onDrive
 * @param {(place: string) => void} p.onGo
 * @param {(tab: string) => void} p.onTab
 */
export function CarsPanel({ career, update, place, focus, onDrive, onGo, onTab }) {
  const cars = career.cars ?? [];
  const [open, setOpen] = useState(focus ?? cars[0]?.id ?? null);
  const [mode, setMode] = useState('cars');
  useEffect(() => { if (focus) setOpen(focus); }, [focus]);
  const atDealer = place === 'dealer';
  const stock = useMemo(() => dealerStock(career), [career.day, career.rep, career.seed]); // eslint-disable-line react-hooks/exhaustive-deps
  const sel = cars.find((x) => x.id === open) ?? null;
  const owned = new Set(career.looks ?? []);
  const free = capacity(career) - career.lifts.length;
  const canSwap = place === 'garage' || place === 'supply';

  return (
    <div className={styles.panel}>
      <div className={styles.slotTabs} role="tablist" aria-label="Cars">
        <button type="button" role="tab" className={styles.slotTab} aria-selected={mode === 'cars'} onClick={() => setMode('cars')}>MY CARS {cars.length}/{carLimit(career)}</button>
        <button type="button" role="tab" className={styles.slotTab} aria-selected={mode === 'looks'} onClick={() => setMode('looks')} disabled={!sel}>LOOKS</button>
        <button type="button" role="tab" className={styles.slotTab} aria-selected={mode === 'engine'} onClick={() => setMode('engine')} disabled={!sel}>ENGINE</button>
        <button type="button" role="tab" className={styles.slotTab} aria-selected={mode === 'lot'} onClick={() => setMode('lot')}>FOR SALE</button>
      </div>

      {mode === 'cars' && (cars.length === 0 ? (
        <section className={styles.card}>
          <div className={styles.tag}>NO CARS OF YOUR OWN YET</div>
          <p className={styles.small}>Customers&rsquo; cars go home. Yours stay. Caribou Motors sells project cars from $900, ready to be tuned and raced.</p>
          <Button size="sm" onClick={() => (atDealer ? setMode('lot') : onGo('dealer'))}>{atDealer ? 'SEE THE LOT' : 'GO TO CARIBOU MOTORS'}</Button>
        </section>
      ) : cars.map((car) => {
        const st = carState(career, car.id);
        const onLift = career.lifts.some((l) => l.jobId === ownJobId(car.id));
        const isOpen = open === car.id;
        return (
          <section key={car.id} className={styles.card} data-active={isOpen} aria-label={car.name}>
            <button type="button" className={styles.itemBtn} aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : car.id)}>
              <span className={styles.dot} style={{ background: W.paint[car.look.color] }} />
              <b>{car.name}</b>
              <i>{onLift ? 'ON A LIFT' : 'PARKED'}</i>
            </button>
            {isOpen && st && (
              <>
                <Specs car={car} state={st} />
                <p className={styles.small}>Engine: {engineById(car.engine ?? engineForPreset(car.preset) ?? '')?.name ?? 'factory'}. Parts fitted: {car.parts.length ? car.parts.map((id) => partById(id)?.name ?? id).join(', ') : 'none: it is as it left the factory.'}</p>
                <div className={styles.row}>
                  {!onLift && <Button size="sm" onClick={() => onDrive(car.id)}><Gauge size={13} aria-hidden="true" /> DRIVE</Button>}
                  {onLift ? <Button size="sm" variant="ghost" onClick={() => update(stowFromLift(career, car.id))}>LOWER IT OFF THE LIFT</Button> : (
                    <Button size="sm" variant="ghost" disabled={free <= 0} onClick={() => update(parkOnLift(career, car.id))}><Wrench size={13} aria-hidden="true" /> {free <= 0 ? 'NO FREE LIFT' : 'PUT IT ON A LIFT'}</Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setMode('looks')}><Paintbrush size={13} aria-hidden="true" /> LOOKS</Button>
                  <Button size="sm" variant="ghost" onClick={() => onTab('parts')}>PARTS</Button>
                </div>
                <div className={styles.row}>
                  <Button size="sm" variant="quiet" onClick={() => { if (window.confirm(`Sell the ${car.name} for ${money(valueOf(car))}?`)) update(sellCar(career, car.id)); }}>SELL FOR {money(valueOf(car))}</Button>
                </div>
              </>
            )}
          </section>
        );
      }))}

      {mode === 'looks' && sel && (
        <div className={styles.grid1}>
          <section className={styles.card}>
            <div className={styles.tag}>PAINT · {sel.name}</div>
            <div className={styles.swatches}>
              {PAINTS.map((p) => {
                const bought = p.price === 0 || owned.has(`paint:${p.id}`);
                return <button key={p.id} type="button" className={styles.swatch} style={{ background: W.paint[p.id] }} aria-pressed={sel.look.color === p.id} aria-label={`${p.id} paint${bought ? '' : `, ${money(p.price)}`}`} title={bought ? p.id : `${p.id} ${money(p.price)}`} data-locked={!bought} disabled={!bought && career.money < p.price} onClick={() => update(restyleCar(career, sel.id, { color: p.id }))} />;
              })}
            </div>
            <p className={styles.dim}>Standard colours are free. Specials cost once; after that they are yours to put on any car.</p>
          </section>
          <section className={styles.card}>
            <div className={styles.tag}>WHEELS</div>
            <div className={styles.chips}>
              {WHEEL_SETS.map((w) => { const bought = w.price === 0 || owned.has(`wheels:${w.id}`); return <button key={w.id} type="button" className={styles.chip} aria-pressed={sel.look.wheels === w.id} disabled={!bought && career.money < w.price} onClick={() => update(restyleCar(career, sel.id, { wheels: w.id }))}>{w.id}{bought ? '' : ` ${money(w.price)}`}</button>; })}
            </div>
          </section>
          <section className={styles.card}>
            <div className={styles.tag}>SPOILER</div>
            <div className={styles.chips}>
              {SPOILERS.map((w) => { const bought = w.price === 0 || owned.has(`spoiler:${w.id}`); return <button key={w.id} type="button" className={styles.chip} aria-pressed={sel.look.spoiler === w.id} disabled={!bought && career.money < w.price} onClick={() => update(restyleCar(career, sel.id, { spoiler: w.id }))}>{w.id}{bought ? '' : ` ${money(w.price)}`}</button>; })}
            </div>
          </section>
          <section className={styles.card}>
            <div className={styles.tag}>WHEEL FINISH</div>
            <div className={styles.chips}>
              {WHEEL_FINISHES.map((f) => <button key={f} type="button" className={styles.chip} aria-pressed={(sel.look.wheelColor ?? 'chrome') === f} onClick={() => update(restyleCar(career, sel.id, { wheelColor: f }))}>{f}</button>)}
            </div>
          </section>
          <section className={styles.card}>
            <div className={styles.tag}>STRIPES</div>
            <div className={styles.chips}>
              {STRIPES.map((c) => <button key={String(c)} type="button" className={styles.chip} aria-pressed={(sel.look.stripes ?? null) === c} onClick={() => update(restyleCar(career, sel.id, { stripes: c }))}>{c ? `${c} stripes` : 'no stripes'}</button>)}
            </div>
          </section>
          <section className={styles.card}>
            <div className={styles.tag}>BODY KIT</div>
            <div className={styles.chips}>
              {KITS.map((k) => {
                const bought = owned.has(`kit:${k.id}`);
                const on = !!sel.look[k.id];
                return <button key={k.id} type="button" className={styles.chip} aria-pressed={on} disabled={!on && !bought && career.money < k.price} onClick={() => update(restyleCar(career, sel.id, { [k.id]: !on }))}>{k.name.toLowerCase()}{bought ? '' : ` ${money(k.price)}`}</button>;
              })}
            </div>
            <p className={styles.dim}>Arches and scoops change how a car looks, not how it goes: the car meet scores them, the strip does not.</p>
          </section>
          <section className={styles.card}>
            <div className={styles.tag}>STANCE, GLOW</div>
            <div className={styles.chips}>
              {[0, 0.4, 0.8].map((v) => <button key={v} type="button" className={styles.chip} aria-pressed={sel.look.lowered === v} onClick={() => update(restyleCar(career, sel.id, { lowered: v }))}>{v === 0 ? 'stock height' : v < 0.5 ? 'lowered' : 'slammed'}</button>)}
              {UNDERGLOWS.map((u) => { const bought = u.price === 0 || owned.has(`glow:${u.id}`); return <button key={String(u.id)} type="button" className={styles.chip} aria-pressed={sel.look.underglow === u.id} disabled={!bought && career.money < u.price} onClick={() => update(restyleCar(career, sel.id, { underglow: u.id }))}>{u.id ? `${u.id.replace('neon', '').toLowerCase()} glow${bought ? '' : ` ${money(u.price)}`}` : 'no glow'}</button>; })}
            </div>
            <p className={styles.dim}>Lowering a car really does bring its centre of gravity down, so it shifts less weight under braking and cornering. The rest is for the car meet.</p>
          </section>
        </div>
      )}

      {mode === 'engine' && sel && (
        <div className={styles.grid1}>
          <section className={styles.card}>
            <div className={styles.tag}>ENGINE SWAP · {sel.name}</div>
            <p className={styles.small}>A swapped engine comes out of its donor with its own ECU, on its factory calibration. The old engine&rsquo;s intake, exhaust, injectors and boost go with it; the tyres, gearing and weight work stay with the car. A heavier engine is a heavier car.{!canSwap && ' Swaps are done at your shop or at Gearhead Supply.'}</p>
          </section>
          {ENGINES.map((e) => {
            const why = cannotSwap(career, sel.id, e.id);
            const fitted = (sel.engine ?? engineForPreset(sel.preset)) === e.id;
            return (
              <section key={e.id} className={styles.card} data-active={fitted} aria-label={e.name}>
                <div className={styles.itemHead}><b>{e.name}</b>{fitted && <i>FITTED</i>}</div>
                <p className={styles.small}>{e.blurb} {e.kg ? `About ${e.kg} kg more than the little 1.6.` : ''}</p>
                {why && !fitted && <p className={styles.blocked}>{why}</p>}
                {!fitted && <Button size="sm" disabled={!canSwap || !!why} onClick={() => { if (window.confirm(`Swap the ${e.name} into the ${sel.name} for ${money(e.price)}? The parts on the old engine go with it.`)) update(swapEngine(career, sel.id, e.id)); }}>SWAP IN · {money(e.price)}</Button>}
              </section>
            );
          })}
        </div>
      )}

      {mode === 'lot' && (
        <div className={styles.grid1}>
          {!atDealer && (
            <section className={styles.card}>
              <div className={styles.tag}>CARIBOU MOTORS</div>
              <p className={styles.small}>Today&rsquo;s stock is below. You can only buy at the dealership.</p>
              <Button size="sm" variant="ghost" onClick={() => onGo('dealer')}>GO THERE</Button>
            </section>
          )}
          {stock.length === 0 && <p className={styles.small}>Nothing on the lot for a shop of your standing today.</p>}
          {stock.map((s) => {
            const why = cannotBuyCar(career, s);
            return (
              <section key={s.id} className={styles.card} aria-label={s.name}>
                <div className={styles.itemHead}><span className={styles.dot} style={{ background: W.paint[s.color] }} /><b>{s.name}</b></div>
                <p className={styles.small}>{s.pitch}</p>
                {why && <p className={styles.blocked}>{why}</p>}
                <Button size="sm" disabled={!atDealer || !!why} onClick={() => update(buyCar(career, s))}>{atDealer ? `BUY ${money(s.price)}` : `${money(s.price)}`}</Button>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

