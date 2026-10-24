/**
 * Clothes, as part of the save. Pure functions from one career to the next, like the rest
 * of shop.js. Looks are cosmetic; the one thing a look feeds is the car meet's style
 * score (world/appearance.js).
 */

import { ITEMS, STARTING_WARDROBE, cannotBuyItem, defaultLook, itemById, outfitPrice, OUTFITS } from '../world/appearance.js';

/** @typedef {import('./shop.js').Career} Career */

/** The look a save wears, with anything missing filled in. @param {Career} c */
export const lookOf = (c) => ({ ...defaultLook(), ...(c.look ?? {}) });

/** What a save owns. @param {Career} c */
export const wardrobeOf = (c) => c.wardrobe ?? STARTING_WARDROBE;

/**
 * Put an owned item on (or take a hat, glasses or extra off with `null`).
 * @param {Career} c @param {'top'|'bottom'|'shoes'|'hat'|'glasses'|'extra'} slot @param {string|null} id
 * @returns {Career}
 */
export function wear(c, slot, id) {
  if (id != null) {
    const it = itemById(id);
    if (!it || it.slot !== slot || !wardrobeOf(c).includes(id)) return c;
  } else if (slot === 'top' || slot === 'bottom' || slot === 'shoes') return c;
  return { ...c, look: { ...lookOf(c), [slot]: id } };
}

/** @param {Career} c @param {Partial<import('../world/appearance.js').Look>} patch */
export const restyle = (c, patch) => ({ ...c, look: { ...lookOf(c), ...patch } });

/**
 * Buy one item. The money comes off and the item is owned; it is not put on, so a
 * purchase never changes the look without being asked.
 * @param {Career} c @param {string} id @returns {Career}
 */
export function buyItem(c, id) {
  if (cannotBuyItem({ money: c.money, rep: c.rep, wardrobe: wardrobeOf(c) }, id)) return c;
  return { ...c, money: c.money - itemById(id).price, wardrobe: [...wardrobeOf(c), id] };
}

/** Buy every piece of an outfit you do not have, a tenth off the lot. @param {Career} c @param {string} id @returns {Career} */
export function buyOutfit(c, id) {
  const o = OUTFITS.find((x) => x.id === id);
  if (!o) return c;
  const owned = wardrobeOf(c);
  const price = outfitPrice(owned, id);
  const locked = o.items.some((i) => !owned.includes(i) && c.rep < itemById(i).rep);
  if (price <= 0 || c.money < price || locked) return c;
  return { ...c, money: c.money - price, wardrobe: [...new Set([...owned, ...o.items])] };
}

/** Put on a whole outfit you own. @param {Career} c @param {string} id @returns {Career} */
export function wearOutfit(c, id) {
  const o = OUTFITS.find((x) => x.id === id);
  if (!o || !o.items.every((i) => wardrobeOf(c).includes(i))) return c;
  let next = c;
  for (const i of o.items) next = wear(next, itemById(i).slot, i);
  return next;
}

export { ITEMS };
