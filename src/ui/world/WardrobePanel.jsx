/**
 * The wardrobe: what the tuner wears, what there is to buy, and the free choices (skin,
 * hair). Shown in the drawer while the camera frames the tuner. Buying is only offered in
 * the boutique; the locker at the shop lets you change into what you already own.
 */

import { Check, Lock, Shirt, Sparkles } from 'lucide-react';
import React, { useState } from 'react';

import { Button } from '../primitives/Button.jsx';
import { lookOf, wardrobeOf, wear, restyle, buyItem, buyOutfit, wearOutfit } from '../career/wardrobe.js';
import { world as W } from '../tokens.js';

import { HAIR_COLORS, HAIR_STYLES, ITEMS, OUTFITS, cannotBuyItem, itemById, outfitPrice, styleScore } from './appearance.js';
import styles from './Panels.module.css';

const SLOTS = [
  { id: 'top', label: 'TOPS' }, { id: 'bottom', label: 'TROUSERS' }, { id: 'shoes', label: 'SHOES' },
  { id: 'hat', label: 'HATS' }, { id: 'glasses', label: 'EYEWEAR' }, { id: 'extra', label: 'EXTRAS' }, { id: 'outfits', label: 'OUTFITS' }, { id: 'me', label: 'ME' },
];

const money = (n) => `$${Math.round(n).toLocaleString('en-US')}`;

/**
 * @param {{career: import('../career/shop.js').Career, update: (c: any) => void, canBuy: boolean, onGo?: () => void}} p
 */
export function WardrobePanel({ career, update, canBuy, onGo }) {
  const [slot, setSlot] = useState('top');
  const look = lookOf(career);
  const owned = wardrobeOf(career);
  const score = styleScore(look);
  return (
    <div className={styles.panel}>
      <div className={styles.summary}>
        <span><Sparkles size={13} aria-hidden="true" /> STYLE <b>{score}</b>/100</span>
        <span className={styles.dim}>{canBuy ? 'You are in the boutique: everything is for sale.' : 'Change into anything you own. New clothes are sold at Threads, in town.'}</span>
        {!canBuy && onGo && <Button size="sm" variant="ghost" onClick={onGo}>GO TO THREADS</Button>}
      </div>
      <div className={styles.slotTabs} role="tablist" aria-label="Wardrobe sections">
        {SLOTS.map((s) => (
          <button key={s.id} type="button" role="tab" className={styles.slotTab} aria-selected={slot === s.id} onClick={() => setSlot(s.id)}>{s.label}</button>
        ))}
      </div>

      {slot === 'me' && (
        <div className={styles.grid1}>
          <section className={styles.card}>
            <div className={styles.tag}>SKIN</div>
            <div className={styles.swatches}>
              {W.skin.map((c, i) => <button key={c} type="button" className={styles.swatch} style={{ background: c }} aria-label={`Skin tone ${i + 1}`} aria-pressed={look.skin === i} onClick={() => update(restyle(career, { skin: i }))} />)}
            </div>
          </section>
          <section className={styles.card}>
            <div className={styles.tag}>HAIRCUT</div>
            <div className={styles.chips}>
              {HAIR_STYLES.map((h) => <button key={h.id} type="button" className={styles.chip} aria-pressed={look.hair === h.id} onClick={() => update(restyle(career, { hair: h.id }))}>{h.name}</button>)}
            </div>
          </section>
          <section className={styles.card}>
            <div className={styles.tag}>HAIR COLOUR</div>
            <div className={styles.swatches}>
              {HAIR_COLORS.map((c) => <button key={c} type="button" className={styles.swatch} style={{ background: W.hair[c] }} aria-label={`Hair colour ${c}`} aria-pressed={look.hairColor === c} onClick={() => update(restyle(career, { hairColor: c }))} />)}
            </div>
          </section>
        </div>
      )}

      {slot === 'outfits' && (
        <div className={styles.grid}>
          {OUTFITS.map((o) => {
            const have = o.items.every((i) => owned.includes(i));
            const price = outfitPrice(owned, o.id);
            const locked = o.items.some((i) => !owned.includes(i) && career.rep < itemById(i).rep);
            return (
              <section key={o.id} className={styles.card} data-owned={have}>
                <div className={styles.tag}>{o.name.toUpperCase()}</div>
                <p className={styles.small}>{o.blurb}</p>
                <ul className={styles.items}>{o.items.map((i) => <li key={i} data-have={owned.includes(i)}>{owned.includes(i) ? <Check size={11} aria-hidden="true" /> : <Lock size={11} aria-hidden="true" />} {itemById(i).name}</li>)}</ul>
                {have ? <Button size="sm" onClick={() => update(wearOutfit(career, o.id))}><Shirt size={13} aria-hidden="true" /> WEAR</Button> : (
                  <Button size="sm" disabled={!canBuy || locked || career.money < price} onClick={() => update(buyOutfit(career, o.id))}>
                    {!canBuy ? 'SOLD AT THREADS' : locked ? 'NEEDS MORE REP' : `BUY THE SET ${money(price)}`}
                  </Button>
                )}
              </section>
            );
          })}
        </div>
      )}

      {SLOTS.find((s) => s.id === slot) && !['outfits', 'me'].includes(slot) && (
        <div className={styles.grid}>
          {(slot === 'hat' || slot === 'glasses' || slot === 'extra') && (
            <section className={styles.card} data-active={look[slot] == null}>
              <div className={styles.tag}>NONE</div>
              <Button size="sm" variant="ghost" onClick={() => update(wear(career, slot, null))}>TAKE IT OFF</Button>
            </section>
          )}
          {ITEMS.filter((i) => i.slot === slot).map((it) => {
            const have = owned.includes(it.id);
            const why = have ? null : cannotBuyItem({ money: career.money, rep: career.rep, wardrobe: owned }, it.id);
            const on = look[slot] === it.id;
            return (
              <section key={it.id} className={styles.card} data-active={on} data-owned={have} aria-label={it.name}>
                <div className={styles.itemHead}>
                  <span className={styles.dot} style={{ background: W.cloth[it.color] }} />
                  {it.accent && <span className={styles.dot} style={{ background: W.cloth[it.accent] }} />}
                  <b>{it.name}</b>
                </div>
                <p className={styles.small}>{it.blurb}</p>
                {have ? (
                  <Button size="sm" variant={on ? 'ghost' : 'primary'} disabled={on} onClick={() => update(wear(career, slot, it.id))}>{on ? <><Check size={13} aria-hidden="true" /> WEARING</> : 'WEAR'}</Button>
                ) : (
                  <>
                    {why && <p className={styles.blocked}><Lock size={11} aria-hidden="true" /> {why}</p>}
                    <Button size="sm" disabled={!canBuy || !!why} onClick={() => update(buyItem(career, it.id))}>{canBuy ? `BUY ${money(it.price)}` : 'SOLD AT THREADS'}</Button>
                  </>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
