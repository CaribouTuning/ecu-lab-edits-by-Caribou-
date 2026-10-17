/**
 * Dressing the shop: wall paint, floor, the neon, a few extras. Things you buy stay bought
 * and can be swapped for free. The shop looks like what you chose; it earns the same.
 */

/** @typedef {import('./shop.js').Career} Career */

export const WALLS = [
  { id: 'wallShop', name: 'Warm grey', price: 0 }, { id: 'wallCream', name: 'Cream', price: 250 }, { id: 'wallBlue', name: 'Garage blue', price: 300 },
  { id: 'wallGreen', name: 'Racing green', price: 300 }, { id: 'wallRed', name: 'Brick red', price: 300 }, { id: 'wallPurple', name: 'Plum', price: 350 }, { id: 'wallBlack', name: 'Charcoal', price: 400 },
];
export const FLOORS = [
  { id: 'epoxy', name: 'Grey epoxy', price: 0 }, { id: 'checker', name: 'Black and white checker', price: 500 }, { id: 'wood', name: 'Timber', price: 700 }, { id: 'red', name: 'Red tile', price: 450 },
];
export const NEONS = [
  { id: 'neonPink', name: 'Pink', price: 0 }, { id: 'neonCyan', name: 'Cyan', price: 150 }, { id: 'neonGreen', name: 'Green', price: 150 }, { id: 'neonAmber', name: 'Amber', price: 150 },
];
export const EXTRAS = [
  { id: 'plants', name: 'Pot plants', price: 140, needs: null },
  { id: 'flags', name: 'String of flags', price: 220, needs: null },
  { id: 'tyrewall', name: 'Tyre wall', price: 260, needs: null },
  { id: 'banner', name: 'Chequered banner', price: 320, needs: null },
  { id: 'trophycase', name: 'Glass trophy case', price: 900, needs: { rep: 60 } },
];

/** What a save has chosen. @param {Career} c */
export const decorOf = (c) => ({ wall: 'wallShop', floor: 'epoxy', neon: 'neonPink', extras: [], ...(c.decor ?? {}) });

/**
 * Choose a decor item; pay for it the first time.
 * @param {Career} c @param {'wall'|'floor'|'neon'} slot @param {string} id @returns {Career}
 */
export function setDecor(c, slot, id) {
  const list = { wall: WALLS, floor: FLOORS, neon: NEONS }[slot];
  const item = list?.find((x) => x.id === id);
  if (!item) return c;
  const tag = `decor:${slot}:${id}`;
  const owned = (c.looks ?? []).includes(tag) || item.price === 0;
  if (!owned && c.money < item.price) return c;
  return { ...c, money: c.money - (owned ? 0 : item.price), looks: owned ? c.looks : [...(c.looks ?? []), tag], decor: { ...decorOf(c), [slot]: id } };
}

/** Why an extra cannot be bought. @param {Career} c @param {string} id */
export function cannotBuyExtra(c, id) {
  const x = EXTRAS.find((e) => e.id === id);
  if (!x) return 'No such thing.';
  if (decorOf(c).extras.includes(id)) return 'Already up.';
  if (x.needs?.rep && c.rep < x.needs.rep) return `Needs reputation ${x.needs.rep}.`;
  if (c.money < x.price) return `Costs $${x.price}.`;
  return null;
}

/** @param {Career} c @param {string} id @returns {Career} */
export function buyExtra(c, id) {
  if (cannotBuyExtra(c, id)) return c;
  const d = decorOf(c);
  return { ...c, money: c.money - EXTRAS.find((e) => e.id === id).price, decor: { ...d, extras: [...d.extras, id] } };
}
