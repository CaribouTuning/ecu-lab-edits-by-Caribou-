/**
 * What the tuner can wear: the wardrobe catalogue, plain data.
 *
 * Nothing here knows about WebGL. A `look` is a handful of ids, an item names a palette
 * key for its colours, and `models/person.js` turns the two into a character. That keeps
 * the boutique, the outfit preview and the tests free of the renderer.
 *
 * Clothes change how the tuner looks and how the car-meet judges the shop. They do not
 * change the physics, or what a job pays: nothing in a wardrobe adds horsepower.
 */

/** @typedef {'top'|'bottom'|'shoes'|'hat'|'glasses'|'extra'} Slot */

/**
 * @typedef {object} Item
 * @property {string} id
 * @property {Slot} slot
 * @property {string} name
 * @property {number} price 0 means the tuner starts with it
 * @property {number} rep reputation needed before the boutique will sell it
 * @property {string} style how the model draws it (see models/person.js)
 * @property {string} color a `world.cloth` key
 * @property {string} [accent] a second `world.cloth` key
 * @property {number} flair how much a car-meet judge likes it, 0-5
 * @property {string} blurb one line for the shelf
 * @property {string} [set] the outfit it belongs to
 */

/** @type {Item[]} */
export const ITEMS = [
  // ---- tops ----
  { id: 'tee-white', slot: 'top', name: 'White tee', price: 0, rep: 0, style: 'tee', color: 'white', flair: 0, blurb: 'Plain and clean. Hides nothing, needs nothing.' },
  { id: 'tee-black', slot: 'top', name: 'Black tee', price: 0, rep: 0, style: 'tee', color: 'black', flair: 0, blurb: 'Shows less grease.' },
  { id: 'tee-teal', slot: 'top', name: 'Teal tee', price: 0, rep: 0, style: 'tee', color: 'teal', flair: 0, blurb: 'The shop colour.' },
  { id: 'polo-shop', slot: 'top', name: 'Shop polo', price: 110, rep: 0, style: 'polo', color: 'navy', accent: 'white', flair: 1, blurb: 'Looks like you run the place.' },
  { id: 'tank-orange', slot: 'top', name: 'Garage tank', price: 70, rep: 0, style: 'tank', color: 'orange', flair: 1, blurb: 'For the dyno room in August.' },
  { id: 'hawaiian', slot: 'top', name: 'Dyno-day shirt', price: 150, rep: 5, style: 'shirt', color: 'teal', accent: 'yellow', flair: 2, blurb: 'Loud on purpose.' },
  { id: 'hoodie-grey', slot: 'top', name: 'Grey hoodie', price: 170, rep: 0, style: 'hoodie', color: 'grey', flair: 1, blurb: 'The unofficial uniform of late nights.' },
  { id: 'hoodie-neon', slot: 'top', name: 'Neon hoodie', price: 320, rep: 20, style: 'hoodie', color: 'neon', accent: 'black', flair: 3, blurb: 'You will be seen from the next lot.' },
  { id: 'vest-hivis', slot: 'top', name: 'Hi-vis vest', price: 80, rep: 0, style: 'vest', color: 'hivis', accent: 'silver', flair: 1, blurb: 'Safety first. Also very yellow.' },
  { id: 'jacket-denim', slot: 'top', name: 'Denim jacket', price: 260, rep: 10, style: 'jacket', color: 'denim', accent: 'tan', flair: 2, blurb: 'Broken in before you bought it.' },
  { id: 'jacket-bomber', slot: 'top', name: 'Bomber jacket', price: 340, rep: 25, style: 'jacket', color: 'olive', accent: 'orange', flair: 3, blurb: 'Orange lining, in case of emergency.' },
  { id: 'jacket-leather', slot: 'top', name: 'Leather jacket', price: 520, rep: 40, style: 'jacket', color: 'black', accent: 'silver', flair: 4, blurb: 'Zips, studs and attitude.' },
  { id: 'coverall-blue', slot: 'top', name: 'Mechanic coveralls', price: 240, rep: 0, style: 'coverall', color: 'blue', accent: 'yellow', flair: 2, blurb: 'One piece, many pockets.', set: 'mechanic' },
  { id: 'coverall-red', slot: 'top', name: 'Pit-crew coveralls', price: 420, rep: 45, style: 'coverall', color: 'red', accent: 'white', flair: 3, blurb: 'Fireproof, they say.', set: 'pit' },
  { id: 'suit-racing', slot: 'top', name: 'Racing suit', price: 900, rep: 70, style: 'racing', color: 'white', accent: 'red', flair: 5, blurb: 'Sponsors on both sleeves.', set: 'racer' },
  { id: 'jacket-drift', slot: 'top', name: 'Drift-king jacket', price: 700, rep: 80, style: 'jacket', color: 'purple', accent: 'neon', flair: 5, blurb: 'Matching stripes on the sleeves.', set: 'drift' },
  { id: 'labcoat', slot: 'top', name: "Engineer's lab coat", price: 450, rep: 30, style: 'labcoat', color: 'white', accent: 'sky', flair: 3, blurb: 'The air-fuel ratio is not going to calculate itself.', set: 'engineer' },
  { id: 'blazer', slot: 'top', name: 'Concours blazer', price: 1200, rep: 110, style: 'blazer', color: 'navy', accent: 'gold', flair: 5, blurb: 'For when the car wins best in show.' },

  // ---- bottoms ----
  { id: 'jeans', slot: 'bottom', name: 'Jeans', price: 0, rep: 0, style: 'long', color: 'denim', flair: 0, blurb: 'Go with everything.' },
  { id: 'cargo', slot: 'bottom', name: 'Cargo trousers', price: 0, rep: 0, style: 'long', color: 'olive', flair: 0, blurb: 'Pockets for sockets.' },
  { id: 'shorts-khaki', slot: 'bottom', name: 'Khaki shorts', price: 70, rep: 0, style: 'short', color: 'tan', flair: 1, blurb: 'Summer in the shop.' },
  { id: 'joggers', slot: 'bottom', name: 'Joggers', price: 110, rep: 0, style: 'long', color: 'charcoal', accent: 'white', flair: 1, blurb: 'Comfortable for twelve hours under a car.' },
  { id: 'slacks', slot: 'bottom', name: 'Black slacks', price: 140, rep: 15, style: 'long', color: 'black', flair: 2, blurb: 'Smart enough for a customer\'s boss.' },
  { id: 'coverall-legs', slot: 'bottom', name: 'Coverall legs', price: 60, rep: 0, style: 'long', color: 'blue', flair: 1, blurb: 'Matches the coveralls.', set: 'mechanic' },
  { id: 'racing-pants', slot: 'bottom', name: 'Racing trousers', price: 500, rep: 70, style: 'long', color: 'white', accent: 'red', flair: 4, blurb: 'Matches the suit.', set: 'racer' },
  { id: 'pit-pants', slot: 'bottom', name: 'Pit-crew trousers', price: 220, rep: 45, style: 'long', color: 'red', flair: 3, blurb: 'Matches the coveralls.', set: 'pit' },
  { id: 'drift-pants', slot: 'bottom', name: 'Drift track pants', price: 300, rep: 80, style: 'long', color: 'purple', accent: 'neon', flair: 4, blurb: 'Stripe down the leg.', set: 'drift' },

  // ---- shoes ----
  { id: 'sneakers', slot: 'shoes', name: 'Sneakers', price: 0, rep: 0, style: 'sneaker', color: 'white', accent: 'red', flair: 0, blurb: 'Light on the pedals.' },
  { id: 'trainers-black', slot: 'shoes', name: 'Black trainers', price: 0, rep: 0, style: 'sneaker', color: 'black', accent: 'grey', flair: 0, blurb: 'Hides oil.' },
  { id: 'slides', slot: 'shoes', name: 'Slides', price: 40, rep: 0, style: 'slide', color: 'grey', flair: 0, blurb: 'Against every safety rule.' },
  { id: 'work-boots', slot: 'shoes', name: 'Work boots', price: 150, rep: 0, style: 'boot', color: 'brown', flair: 1, blurb: 'Laced to the ankle.' },
  { id: 'steel-toe', slot: 'shoes', name: 'Steel-toe boots', price: 220, rep: 10, style: 'boot', color: 'tan', accent: 'black', flair: 2, blurb: 'A dropped brake rotor is a story, not an injury.' },
  { id: 'hi-tops-neon', slot: 'shoes', name: 'Neon hi-tops', price: 260, rep: 20, style: 'hightop', color: 'neon', accent: 'black', flair: 3, blurb: 'High-visibility, high-top.' },
  { id: 'racing-shoes', slot: 'shoes', name: 'Driving shoes', price: 300, rep: 50, style: 'sneaker', color: 'red', accent: 'white', flair: 4, blurb: 'Thin soles to feel the pedals.', set: 'racer' },
  { id: 'pit-boots', slot: 'shoes', name: 'Pit-crew boots', price: 180, rep: 45, style: 'boot', color: 'red', accent: 'black', flair: 3, blurb: 'Oil-proof.', set: 'pit' },

  // ---- hats ----
  { id: 'cap-red', slot: 'hat', name: 'Red cap', price: 40, rep: 0, style: 'cap', color: 'red', flair: 1, blurb: 'The first thing every tuner owns.' },
  { id: 'cap-shop', slot: 'hat', name: 'Shop cap', price: 60, rep: 0, style: 'cap', color: 'teal', accent: 'white', flair: 1, blurb: 'Your logo on the front.' },
  { id: 'beanie', slot: 'hat', name: 'Beanie', price: 50, rep: 0, style: 'beanie', color: 'charcoal', flair: 1, blurb: 'Winter on the dyno floor.' },
  { id: 'bucket', slot: 'hat', name: 'Bucket hat', price: 80, rep: 5, style: 'bucket', color: 'cream', flair: 2, blurb: 'Casual Friday.' },
  { id: 'hardhat', slot: 'hat', name: 'Hard hat', price: 110, rep: 0, style: 'hardhat', color: 'yellow', flair: 1, blurb: 'Under a lift for hours? Reasonable.' },
  { id: 'bandana', slot: 'hat', name: 'Bandana', price: 40, rep: 0, style: 'bandana', color: 'red', flair: 1, blurb: 'Keeps the sweat out of the eyes.' },
  { id: 'headband', slot: 'hat', name: 'Sweatband', price: 30, rep: 0, style: 'headband', color: 'white', flair: 1, blurb: 'A two-hour dyno session.' },
  { id: 'helmet-open', slot: 'hat', name: 'Open-face helmet', price: 400, rep: 60, style: 'helmet', color: 'white', accent: 'red', flair: 4, blurb: 'Stripes included.', set: 'racer' },
  { id: 'helmet-full', slot: 'hat', name: 'Full-face helmet', price: 650, rep: 80, style: 'fullhelmet', color: 'black', accent: 'neon', flair: 5, blurb: 'Visor down, nobody knows it is you.' },
  { id: 'tophat', slot: 'hat', name: 'Top hat', price: 999, rep: 120, style: 'tophat', color: 'black', accent: 'gold', flair: 5, blurb: 'Because you can.' },

  // ---- glasses ----
  { id: 'safety-glasses', slot: 'glasses', name: 'Safety glasses', price: 40, rep: 0, style: 'safety', color: 'sky', flair: 1, blurb: 'Eyes are not replaceable.' },
  { id: 'shades', slot: 'glasses', name: 'Sunglasses', price: 90, rep: 0, style: 'shades', color: 'black', flair: 2, blurb: 'Dark. Obviously.' },
  { id: 'aviators', slot: 'glasses', name: 'Aviators', price: 180, rep: 20, style: 'aviator', color: 'gold', flair: 3, blurb: 'Gold frames.' },
  { id: 'nerd', slot: 'glasses', name: 'Thick glasses', price: 60, rep: 0, style: 'round', color: 'black', flair: 1, blurb: 'Reads dyno graphs for fun.' },
  { id: 'goggles', slot: 'glasses', name: 'Goggles', price: 150, rep: 25, style: 'goggles', color: 'orange', flair: 3, blurb: 'Lens tinted amber.' },
  { id: 'visor', slot: 'glasses', name: 'Racing visor', price: 300, rep: 60, style: 'visor', color: 'neon', flair: 4, blurb: 'A single curved lens.' },

  // ---- extras ----
  { id: 'headset', slot: 'extra', name: 'Pit headset', price: 150, rep: 10, style: 'headset', color: 'black', flair: 2, blurb: 'Talk to the driver.' },
  { id: 'toolbelt', slot: 'extra', name: 'Tool belt', price: 200, rep: 0, style: 'toolbelt', color: 'brown', accent: 'silver', flair: 2, blurb: 'Every spanner within reach.' },
  { id: 'backpack', slot: 'extra', name: 'Backpack', price: 180, rep: 0, style: 'backpack', color: 'orange', flair: 1, blurb: 'Laptop, cables, snacks.' },
  { id: 'scarf', slot: 'extra', name: 'Scarf', price: 70, rep: 0, style: 'scarf', color: 'red', flair: 1, blurb: 'Warm neck.' },
  { id: 'gloves', slot: 'extra', name: 'Mechanic gloves', price: 60, rep: 0, style: 'gloves', color: 'hivis', accent: 'black', flair: 1, blurb: 'Grip and grease protection.' },
  { id: 'gold-chain', slot: 'extra', name: 'Gold chain', price: 800, rep: 70, style: 'chain', color: 'gold', flair: 4, blurb: 'Paid for by dyno runs.' },
  { id: 'cape', slot: 'extra', name: 'Champion cape', price: 1500, rep: 130, style: 'cape', color: 'maroon', accent: 'gold', flair: 5, blurb: 'You earned it.' },
];

/** Outfits: the pieces that go together. Buying a set takes a tenth off. */
export const OUTFITS = [
  { id: 'mechanic', name: 'Mechanic', items: ['coverall-blue', 'work-boots', 'hardhat', 'gloves'], blurb: 'The honest overalls.' },
  { id: 'pit', name: 'Pit crew', items: ['coverall-red', 'pit-boots', 'headset'], blurb: 'Fast hands.' },
  { id: 'racer', name: 'Racer', items: ['suit-racing', 'racing-shoes', 'helmet-open'], blurb: 'Matching, as promised.' },
  { id: 'drift', name: 'Drift king', items: ['jacket-drift', 'hi-tops-neon', 'visor'], blurb: 'Smoke and stripes.' },
  { id: 'engineer', name: 'Engineer', items: ['labcoat', 'slacks', 'nerd'], blurb: 'The data is on the screen.' },
  { id: 'street', name: 'Streetwear', items: ['hoodie-neon', 'joggers', 'hi-tops-neon', 'beanie'], blurb: 'After-hours.' },
];

/** The haircuts are free; the colours are free. */
export const HAIR_STYLES = [
  { id: 'short', name: 'Short' }, { id: 'buzz', name: 'Buzz' }, { id: 'spiky', name: 'Spiky' },
  { id: 'long', name: 'Long' }, { id: 'ponytail', name: 'Ponytail' }, { id: 'mohawk', name: 'Mohawk' },
  { id: 'afro', name: 'Afro' }, { id: 'bun', name: 'Bun' }, { id: 'slick', name: 'Slicked back' },
  { id: 'curly', name: 'Curly' }, { id: 'bald', name: 'Bald' },
];

export const HAIR_COLORS = ['black', 'brown', 'chestnut', 'blonde', 'ginger', 'grey', 'white', 'red', 'blue', 'pink', 'green', 'purple'];

/** @typedef {{skin: number, hair: string, hairColor: string, top: string, bottom: string, shoes: string, hat: string|null, glasses: string|null, extra: string|null}} Look */

/** The tuner a new career starts with. @returns {Look} */
export const defaultLook = () => ({
  skin: 1, hair: 'short', hairColor: 'brown', top: 'tee-teal', bottom: 'jeans', shoes: 'sneakers', hat: null, glasses: null, extra: null,
});

/** @param {string} id @returns {Item|undefined} */
export const itemById = (id) => ITEMS.find((i) => i.id === id);

/** What a new career already owns: everything priced at nothing. */
export const STARTING_WARDROBE = ITEMS.filter((i) => i.price === 0).map((i) => i.id);

/**
 * Why an item cannot be bought, or null.
 * @param {{money: number, rep: number, wardrobe?: string[]}} c
 * @param {string} id
 * @returns {string|null}
 */
export function cannotBuyItem(c, id) {
  const it = itemById(id);
  if (!it) return 'No such item.';
  if ((c.wardrobe ?? STARTING_WARDROBE).includes(id)) return 'Already yours.';
  if (c.rep < it.rep) return `Needs reputation ${it.rep}.`;
  if (c.money < it.price) return `Costs $${it.price.toLocaleString('en-US')}.`;
  return null;
}

/** The price of a whole outfit: its pieces you do not already own, less a tenth. @param {string[]} owned @param {string} id */
export function outfitPrice(owned, id) {
  const o = OUTFITS.find((x) => x.id === id);
  if (!o) return 0;
  const missing = o.items.filter((i) => !owned.includes(i));
  return Math.round(missing.reduce((s, i) => s + (itemById(i)?.price ?? 0), 0) * 0.9);
}

/**
 * The style score car-meet judges give a look: what you wear, and a bonus for a whole set.
 * @param {Look} look
 * @returns {number} 0-100
 */
export function styleScore(look) {
  const worn = [look.top, look.bottom, look.shoes, look.hat, look.glasses, look.extra].filter(Boolean).map(itemById).filter(Boolean);
  const flair = worn.reduce((s, i) => s + i.flair, 0);
  const sets = new Set(worn.map((i) => i.set).filter(Boolean));
  const matched = [...sets].some((s) => worn.filter((i) => i.set === s).length >= 3);
  return Math.min(100, Math.round(flair * 3.4 + (matched ? 18 : 0) + (look.hair !== 'bald' && look.hairColor && ['blue', 'pink', 'green', 'purple', 'red'].includes(look.hairColor) ? 4 : 0)));
}

/**
 * A look for a customer or a passer-by, the same every time for the same hash. Drawn from
 * the whole catalogue (so the street is as varied as the boutique), never from the sets,
 * whose pieces are a tuner's own.
 * @param {number} h a hash
 * @param {{formal?: boolean}} [o]
 * @returns {Look}
 */
export function npcLook(h, o = {}) {
  const pick = (xs, salt) => xs[(Math.imul(h ^ (salt * 2654435761), 2246822519) >>> 0) % xs.length];
  const of = (slot, formalOnly) => ITEMS.filter((i) => i.slot === slot && !i.set && (!formalOnly || i.flair >= 2));
  return {
    skin: (h >>> 3) % 6,
    hair: pick(HAIR_STYLES, 1).id,
    hairColor: pick(HAIR_COLORS.slice(0, 9), 2),
    top: pick(of('top', o.formal), 3).id,
    bottom: pick(of('bottom'), 4).id,
    shoes: pick(of('shoes'), 5).id,
    hat: (h >>> 9) % 4 === 0 ? pick(of('hat'), 6).id : null,
    glasses: (h >>> 11) % 5 === 0 ? pick(of('glasses'), 7).id : null,
    extra: (h >>> 13) % 6 === 0 ? pick(of('extra'), 8).id : null,
  };
}
