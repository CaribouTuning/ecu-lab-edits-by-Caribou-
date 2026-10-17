/**
 * The shop's paint, floor and neon, and a few things to put up. Bought at Gearhead Supply;
 * bought once, swapped for free.
 */

import { Check, Lock } from 'lucide-react';
import React from 'react';

import { EXTRAS, FLOORS, NEONS, WALLS, buyExtra, cannotBuyExtra, decorOf, setDecor } from '../career/decor.js';
import { Button } from '../primitives/Button.jsx';
import { world as W } from '../tokens.js';

import styles from './Panels.module.css';

const money = (n) => `$${Math.round(n).toLocaleString('en-US')}`;

/** @param {{career: import('../career/shop.js').Career, update: (c: any) => void, canBuy: boolean, onGo: () => void}} p */
export function DecorPanel({ career, update, canBuy, onGo }) {
  const d = decorOf(career);
  const owned = new Set(career.looks ?? []);
  /** @param {{slot: 'wall'|'floor'|'neon', list: {id: string, name: string, price: number}[], label: string, swatch?: (id: string) => string}} r */
  const Row = ({ slot, list, label, swatch }) => (
    <section className={styles.card}>
      <div className={styles.tag}>{label}</div>
      <div className={styles.chips}>
        {list.map((it) => {
          const bought = it.price === 0 || owned.has(`decor:${slot}:${it.id}`);
          return (
            <button
              key={it.id} type="button" className={styles.chip} aria-pressed={d[slot] === it.id}
              disabled={(!bought && !canBuy) || (!bought && career.money < it.price)} onClick={() => update(setDecor(career, slot, it.id))}
            >
              {swatch && <span className={styles.dot} style={{ display: 'inline-block', marginRight: 5, background: swatch(it.id) }} />}
              {it.name}{bought ? '' : ` ${money(it.price)}`}
            </button>
          );
        })}
      </div>
    </section>
  );
  return (
    <div className={styles.panel}>
      <div className={styles.summary}>
        <span>YOUR SHOP, YOUR WAY</span>
        <span className={styles.dim}>{canBuy ? 'Everything here changes how the shop looks. None of it changes what it earns.' : 'Decor is sold at Gearhead Supply. You can swap what you own from anywhere.'}</span>
        {!canBuy && <Button size="sm" variant="ghost" onClick={onGo}>GO TO GEARHEAD SUPPLY</Button>}
      </div>
      <Row slot="wall" list={WALLS} label="WALLS" swatch={(id) => W[id]} />
      <Row slot="floor" list={FLOORS} label="FLOOR" />
      <Row slot="neon" list={NEONS} label="NEON SIGN" swatch={(id) => W[id]} />
      <section className={styles.card}>
        <div className={styles.tag}>EXTRAS</div>
        <div className={styles.grid1}>
          {EXTRAS.map((x) => {
            const have = d.extras.includes(x.id);
            const why = have ? null : cannotBuyExtra(career, x.id);
            return (
              <div key={x.id} className={styles.itemHead}>
                <b>{x.name}</b><span className={styles.dim}>{money(x.price)}</span>
                {have ? <span className={styles.small}><Check size={12} aria-hidden="true" /> Up</span> : (
                  <>
                    {why && <span className={styles.blocked}><Lock size={11} aria-hidden="true" /> {why}</span>}
                    <Button size="sm" disabled={!canBuy || !!why} onClick={() => update(buyExtra(career, x.id))}>BUY</Button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
