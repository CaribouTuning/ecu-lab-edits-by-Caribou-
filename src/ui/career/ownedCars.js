/**
 * The tuner's own cars: bought from the dealer, fitted with real parts, painted, driven,
 * raced and shown. Pure functions from one save to the next, like the rest of shop.js.
 *
 * An owned car is not a customer's. It has no job to pass and nobody to pay for it, so it
 * rides the same machinery as a customer car (a lift, the bay, the tuning screens) under a
 * synthetic job, `own:<id>`, that has no checks and pays nothing; what it costs and what it
 * is worth are decided here.
 *
 * Nothing in here adds horsepower. A part is a change to hardware (an intake, a cam, a
 * turbine, a tyre compound) and it leaves the old calibration exactly as it found it, which
 * is the whole lesson of the shop: new hardware invalidates the tune.
 */

import { INJECTOR_OPTS, presetById } from '../../sim/index.js';

import { customerCar } from './cars.js';
import { ENGINES, engineById, engineForPreset, engineState } from './engines.js';
import { rng, mix } from './generate.js';
import { ownIdOf, ownJob, ownJobId, registerCars } from './ownRegistry.js';
import { capacity } from './shop.js';

/** @typedef {import('./shop.js').Career} Career */

export { ownIdOf, ownJob, ownJobId, registerCars };

/**
 * @typedef {object} Look what a car looks like: all cosmetic
 * @property {string} color a `world.paint` key
 * @property {string} wheels a models/car.js wheel style
 * @property {string} wheelColor
 * @property {string} spoiler none, lip, wing or gt
 * @property {string|null} stripes
 * @property {number} lowered 0..1
 * @property {string|null} underglow a `world` neon key
 * @property {boolean} scoop
 */

/**
 * @typedef {object} OwnedCar
 * @property {string} id
 * @property {string} name
 * @property {string|null} preset the factory engine it started as
 * @property {string} body a models/car.js body key
 * @property {Look} look
 * @property {string} plate
 * @property {{build: any, tune: any}} car hardware and calibration, when parked
 * @property {{gripIdx?: number, finalDrive?: number, massDelta?: number, engineKg?: number}} drag what the strip and the road see
 * @property {number} paid
 * @property {number} bought the day
 * @property {number} km
 * @property {string[]} parts installed part ids
 * @property {boolean} [onLift] the hardware lives on its lift, in `lifts`
 * @property {string|null} [engine] the swap-catalogue engine in it now (engines.js)
 */

/**
 * The cars the dealer sells: an engine in a body, with the reputation it takes to be offered
 * it. The cheap end is cheap on purpose: a project car is how a tuner learns, and the
 * first few should be within reach of a week of customers.
 */
export const MODELS = [
  { preset: null, engine: 'i4-16', name: 'City car', body: 'kei', years: [1994, 2001], minRep: 0, price: 900, blurb: 'Tiny, light and slow: a 1.6 four in a car that weighs nothing. Every part you fit shows.' },
  { preset: null, engine: 'i4-20', name: 'Hot hatch project', body: 'hatch', years: [1996, 2003], minRep: 0, price: 1900, blurb: 'The 2.0 sixteen-valve hatch, before anyone tuned it.' },
  { preset: null, name: 'Project V6 coupe', body: 'coupe', years: [1999, 2004], minRep: 0, price: 2400, blurb: 'A tired 3.5 V6. Cheap, honest and unloved.' },
  { preset: null, engine: 'i6-30', name: 'Straight-six roadster', body: 'roadster', years: [1998, 2004], minRep: 3, price: 3400, blurb: 'Two seats, no roof and a smooth three-litre six.' },
  { preset: 'lr4', name: 'Chevrolet Silverado 1500', body: 'pickup', years: [2003, 2006], minRep: 3, price: 4200, blurb: 'A 4.8 L pushrod V8 in a work truck.' },
  { preset: 'vq35de-revup', name: 'Nissan 350Z', body: 'coupe', years: [2003, 2006], minRep: 8, price: 7800, blurb: 'The VQ35DE Rev-Up: a high-revving V6 in a rear-drive coupe.' },
  { preset: 'ea888-gti', name: 'Volkswagen GTI', body: 'hatch', years: [2015, 2019], minRep: 10, price: 9800, blurb: 'Turbocharged four from the factory. Learn what boost already does.' },
  { preset: 'lm7', name: 'Chevrolet Tahoe', body: 'suv', years: [2003, 2006], minRep: 10, price: 6500, blurb: 'A 5.3 L Vortec in a big SUV. Heavy, torquey, patient.' },
  { preset: 'ls1', name: 'Chevrolet Corvette (C5)', body: 'coupe', years: [1997, 2004], minRep: 15, price: 11500, blurb: 'The LS1 small-block in a light, low coupe.' },
  { preset: 'vq35hr', name: 'Nissan 350Z (HR)', body: 'coupe', years: [2007, 2009], minRep: 18, price: 10500, blurb: 'The revised VQ with the later head and cam.' },
  { preset: 'ls6', name: 'Cadillac CTS-V', body: 'sedan', years: [2004, 2005], minRep: 22, price: 12500, blurb: 'LS6 power in a four-door.' },
  { preset: 'n54', name: 'BMW 335i', body: 'sedan', years: [2007, 2010], minRep: 25, price: 13500, blurb: 'The twin-turbo straight six every tuner wants to understand.' },
  { preset: 'b58-m0', name: 'BMW 340i', body: 'sedan', years: [2016, 2019], minRep: 32, price: 18500, blurb: 'The B58 in its first calibration.' },
  { preset: 'ea888-r', name: 'Volkswagen Golf R', body: 'hatch', years: [2015, 2019], minRep: 35, price: 19500, blurb: 'A harder-worked EA888 with all-wheel drive underneath.' },
  { preset: 'hemi-392', name: 'Dodge Challenger 392', body: 'muscle', years: [2015, 2022], minRep: 45, price: 28000, blurb: 'A 6.4 L Hemi. The loudest answer to any question.' },
  { preset: 'b58-m1', name: 'BMW M340i', body: 'sedan', years: [2020, 2023], minRep: 50, price: 29500, blurb: 'The B58 in its second calibration, hotter and pickier.' },
];

export { STARTER, withStarter } from './starter.js';

const COLORS = ['silver', 'red', 'blue', 'white', 'orange', 'green', 'black', 'purple', 'teal', 'copper', 'yellow', 'grey', 'pewter', 'pearl'];

/** What is for sale: five cars, the same all day, different tomorrow. @param {Career} c @returns {StockCar[]} */
export function dealerStock(c) {
  const r = rng(mix(c.seed >>> 0, c.day, 0xca2));
  const pool = MODELS.filter((m) => c.rep >= m.minRep);
  const stock = [];
  const used = new Set();
  for (let i = 0; i < Math.min(5, pool.length); i += 1) {
    let m = r.pick(pool);
    // Tilt towards the best the shop can have: the new customer sees the cheap ones too.
    for (let k = 0; k < 3 && used.has(m.name); k += 1) m = r.pick(pool);
    if (used.has(m.name)) continue;
    used.add(m.name);
    const year = r.int(m.years[0], m.years[1]);
    const worn = r.next() < 0.35;
    const price = Math.round((m.price * (worn ? 0.62 : r.range(0.88, 1.08))) / 50) * 50;
    stock.push({
      id: `s${c.day}-${i}`, model: m.name, preset: m.preset, body: m.body, year, name: `${year} ${m.name}`,
      color: r.pick(COLORS), price, worn, minRep: m.minRep, pitch: worn ? `${m.blurb} Tired: a bargain if you can tune it.` : m.blurb,
      wheels: r.pick(['steel', 'alloy5', 'mesh', 'deep']),
      engine: { layout: m.engine ? engineById(m.engine)?.spec?.configuration ?? 'I4' : engineLayout(m.preset) },
      engineId: m.engine ?? engineForPreset(m.preset),
      plate: `${m.name.slice(0, 3).toUpperCase()} ${r.int(100, 999)}`,
    });
  }
  return stock;
}

/** @typedef {{id: string, model: string, preset: string|null, body: string, year: number, name: string, color: string, price: number, worn: boolean, minRep: number, pitch: string, wheels: string, engine: {layout: string}, plate: string, engineId?: string|null}} StockCar */

/** @param {string|null} preset */
function engineLayout(preset) {
  const p = preset ? presetById(preset) : null;
  const cfg = p?.engine?.configuration ?? 'V6';
  return ['I4', 'I6', 'V6', 'V8'].includes(cfg) ? cfg : 'V6';
}

/** Why a stock car cannot be bought now, or null. @param {Career} c @param {StockCar} s */
export function cannotBuyCar(c, s) {
  if (c.rep < s.minRep) return `Needs reputation ${s.minRep}.`;
  if (c.money < s.price) return `Costs $${s.price.toLocaleString('en-US')}.`;
  if ((c.cars ?? []).length >= carLimit(c)) return `No room: the shop keeps ${carLimit(c)} of its own cars.`;
  return null;
}

/** How many cars of its own the shop has room for: the drive, and more with every lift. @param {Career} c */
export const carLimit = (c) => 2 + capacity(c);

/** A plausible plate for a car that did not come with one. */
const plateFor = (id) => `ECU ${String(mix(...[...id].map((ch) => ch.charCodeAt(0))) % 900 + 100)}`;

/**
 * Buy a car off the lot. It comes on its factory calibration; a worn one has been let go
 * (an old injector size, a stale air meter) the way customers' cars are.
 * @param {Career} c @param {StockCar} s @returns {Career}
 */
export function buyCar(c, s) {
  if (cannotBuyCar(c, s)) return c;
  const eng = s.engineId && engineById(s.engineId);
  const st = eng && !eng.preset ? engineState(eng.id) : customerCar({ preset: s.preset });
  let build = st.build;
  if (s.worn) build = { ...build, mafScalar: 1.08, octaneIdx: 0 };
  const id = `${s.id}`;
  /** @type {OwnedCar} */
  const car = {
    id, name: s.name, preset: s.preset, body: s.body,
    look: { color: s.color, wheels: s.wheels, wheelColor: 'chrome', spoiler: 'none', stripes: null, lowered: 0, underglow: null, scoop: false },
    plate: s.plate ?? plateFor(id),
    car: { build, tune: st.tune }, drag: {}, paid: s.price, bought: c.day, km: 0, parts: [], engine: s.engineId ?? engineForPreset(s.preset),
  };
  const next = { ...c, money: c.money - s.price, cars: [...(c.cars ?? []), car] };
  registerCars(next);
  return next;
}

/**
 * What a car is worth: most of what was paid, and half of what was spent on parts. A tuned
 * car sells better, but only on its own merits: parts count, a score does not.
 * @param {OwnedCar} car
 */
export function valueOf(car) {
  const partsCost = car.parts.reduce((s, id) => s + (partById(id)?.price ?? 0), 0);
  return Math.round((car.paid * 0.72 + partsCost * 0.45) / 10) * 10;
}

/** Sell a car, wherever it is. @param {Career} c @param {string} id @returns {Career} */
export function sellCar(c, id) {
  const car = ownedCar(c, id);
  if (!car) return c;
  const jobId = ownJobId(id);
  const lifts = c.lifts.filter((l) => l.jobId !== jobId);
  return { ...c, money: c.money + valueOf(car), cars: c.cars.filter((x) => x.id !== id), lifts, working: c.working === jobId ? null : c.working };
}

/** @param {Career} c @param {string} id @returns {OwnedCar|undefined} */
export const ownedCar = (c, id) => (c.cars ?? []).find((x) => x.id === id);

/** The hardware and calibration of an owned car, wherever it is. @param {Career} c @param {string} id */
export function carState(c, id) {
  const lift = c.lifts.find((l) => l.jobId === ownJobId(id));
  return lift ? lift.car : ownedCar(c, id)?.car ?? null;
}

/** @param {Career} c @param {string} id @param {{build: any, tune: any}} car @returns {Career} */
function setCarState(c, id, car) {
  const jobId = ownJobId(id);
  const onLift = c.lifts.some((l) => l.jobId === jobId);
  return {
    ...c,
    lifts: onLift ? c.lifts.map((l) => (l.jobId === jobId ? { ...l, car } : l)) : c.lifts,
    cars: c.cars.map((x) => (x.id === id ? { ...x, car: onLift ? x.car : car } : x)),
  };
}

// ---- lifts ----

/**
 * Wheel a car onto a free lift and put it on the bay.
 * @param {Career} c @param {string} id @returns {Career}
 */
export function parkOnLift(c, id) {
  const car = ownedCar(c, id);
  const jobId = ownJobId(id);
  if (!car || c.lifts.some((l) => l.jobId === jobId) || c.lifts.length >= capacity(c)) return c;
  return { ...c, lifts: [...c.lifts, { jobId, car: car.car, day: c.day }], working: jobId, cars: c.cars.map((x) => (x.id === id ? { ...x, onLift: true } : x)) };
}

/** Lower a car off its lift, with the work done on it. @param {Career} c @param {string} id @returns {Career} */
export function stowFromLift(c, id) {
  const jobId = ownJobId(id);
  const lift = c.lifts.find((l) => l.jobId === jobId);
  if (!lift) return c;
  return {
    ...c, lifts: c.lifts.filter((l) => l.jobId !== jobId), working: c.working === jobId ? null : c.working,
    cars: c.cars.map((x) => (x.id === id ? { ...x, car: lift.car, onLift: false } : x)),
  };
}

// ---- parts ----

/**
 * @typedef {object} Part
 * @property {string} id
 * @property {string} name
 * @property {'air'|'exhaust'|'fuel'|'boost'|'engine'|'drive'} group
 * @property {number} price
 * @property {string} does the physics, in a sentence
 * @property {string} then what the tuner has to do about it
 * @property {{training?: string[], equipment?: string[]}} [needs]
 * @property {(build: any, car: OwnedCar) => string|null} [blocked] why it cannot go on
 * @property {(build: any) => object} [build] the change to the hardware
 * @property {(drag: OwnedCar['drag']) => OwnedCar['drag']} [drag] the change to tyres, gearing or weight
 */

const BOOST = {
  small: [0, 0, 3, 6, 7, 7, 7, 6],
  medium: [0, 0, 4, 8, 11, 12, 12, 11],
  large: [0, 0, 0, 6, 14, 18, 18, 17],
};
const notBoosted = (b) => (b.turboOn || b.blowerId ? 'Already boosted: remove the old kit first by buying a different one.' : null);

/** @type {Part[]} */
export const PARTS = [
  { id: 'cai', name: 'Cold air intake', group: 'air', price: 350, does: 'A freer intake pipe and a cone filter: less restriction, and a different shape of pipe around the air meter.', then: 'The MAF now reads differently: rescale it, then check the fuelling.', blocked: (b) => (b.mods.intake ? 'Already fitted.' : null), build: (b) => ({ mods: { ...b.mods, intake: true } }) },
  { id: 'catback', name: 'Cat-back exhaust', group: 'exhaust', price: 650, does: 'A freer-flowing back box and pipe: less backpressure at high flow.', then: 'Small change to the breathing; check the high-rpm fuelling.', blocked: (b) => (b.mods.exhaust ? 'Already fitted.' : null), build: (b) => ({ mods: { ...b.mods, exhaust: true } }) },
  { id: 'headers', name: 'Long-tube headers', group: 'exhaust', price: 950, does: 'Equal-length primaries scavenge each cylinder with the pulse of the one before it.', then: 'More air at the top end: re-run the VE and fuel tables there.', blocked: (b) => (b.mods.headers ? 'Already fitted.' : null), build: (b) => ({ mods: { ...b.mods, headers: true } }) },
  { id: 'intercooler', name: 'Front-mount intercooler', group: 'boost', price: 1100, does: 'Cools the compressed charge, so it is denser and knocks less.', then: 'With cooler air you can run more timing under boost.', blocked: (b) => (!b.turboOn && !b.blowerId ? 'Only useful on a boosted car.' : b.mods.intercooler ? 'Already fitted.' : null), build: (b) => ({ mods: { ...b.mods, intercooler: true } }) },
  ...INJECTOR_OPTS.map((o, i) => (i < 2 ? null : {
    id: `inj${o.cc}`, name: `${o.cc} cc injectors`, group: /** @type {const} */ ('fuel'), price: [0, 0, 250, 300, 450, 600, 800][i], does: `Fuel injectors that flow ${o.cc} cc a minute instead of the old size.`,
    then: 'The ECU still thinks they are the old size: tell it the new flow rate, then recalibrate the fuel table and the small-pulse offset.',
    blocked: (b) => (b.injIdx >= i ? 'You already have these or bigger.' : null), build: () => ({ injIdx: i }),
  })).filter(Boolean),
  { id: 'cam1', name: 'Mild performance cam', group: 'engine', price: 1400, does: 'More lift and 14 degrees more duration: the engine breathes better at the top and idles a little rougher.', then: 'The VE table is wrong everywhere the cam changed: re-learn it, then re-time the spark.', needs: { training: ['spark'] }, blocked: (b) => (b.engineConfig.camDuration >= 224 ? 'Already past a mild cam.' : null), build: (b) => ({ engineConfig: { ...b.engineConfig, camDuration: Math.min(300, b.engineConfig.camDuration + 14), springRate: b.engineConfig.springRate + 10 } }) },
  { id: 'cam2', name: 'Aggressive cam', group: 'engine', price: 2600, does: 'Long duration and heavy springs: a big top end, and a lumpy, high idle.', then: 'Overlap hurts low-speed filling and idle: expect to rework the idle and the whole VE.', needs: { training: ['spark', 'idle'] }, blocked: (b) => (b.engineConfig.camDuration >= 246 ? 'Already aggressive.' : null), build: (b) => ({ engineConfig: { ...b.engineConfig, camDuration: Math.min(300, Math.max(b.engineConfig.camDuration + 30, 248)), springRate: Math.max(b.engineConfig.springRate, 74) } }) },
  { id: 'turbo-s', name: 'Small turbo kit (7 psi)', group: 'boost', price: 4200, does: 'A small turbo spools early and holds about 7 psi. Intercooled, but the kit does not include injectors.', then: 'You are on a naturally aspirated calibration: add fuel, take out spark, build a boost row.', needs: { training: ['boost', 'spark'] }, blocked: notBoosted, build: (b) => ({ turboOn: true, turbineIdx: 0, compressorIdx: 0, boostCurve: BOOST.small, mods: { ...b.mods, intercooler: true } }) },
  { id: 'turbo-m', name: 'Medium turbo kit (12 psi)', group: 'boost', price: 6500, does: 'A balanced turbo: reaches about 12 psi in the midrange. Intercooled; injectors are your problem.', then: 'More boost means more fuel and less spark, and it spools later than the small one.', needs: { training: ['boost', 'spark'] }, blocked: notBoosted, build: (b) => ({ turboOn: true, turbineIdx: 1, compressorIdx: 1, boostCurve: BOOST.medium, mods: { ...b.mods, intercooler: true } }) },
  { id: 'turbo-l', name: 'Large turbo kit (18 psi)', group: 'boost', price: 9500, does: 'A big turbo: a huge top end at 18 psi, and a long wait for it. Injectors, tune and fuel are all yours.', then: 'This will not survive an untuned pull: it needs fuel, timing, boost control and probably better fuel.', needs: { training: ['boost', 'spark', 'knock'] }, blocked: notBoosted, build: (b) => ({ turboOn: true, turbineIdx: 2, compressorIdx: 2, boostCurve: BOOST.large, mods: { ...b.mods, intercooler: true } }) },
  { id: 'blower', name: 'Supercharger kit', group: 'boost', price: 5500, does: 'A belt-driven blower: boost from idle with no lag, and an engine-speed whine.', then: 'Boost is linear with rpm; the spark and fuel need rows for it.', needs: { training: ['boost', 'spark'] }, blocked: notBoosted, build: (b) => ({ blowerId: 'm90', blowerRatio: 1.6, mods: { ...b.mods, intercooler: true } }) },
  { id: 'nitrous', name: 'Wet nitrous kit (100 shot)', group: 'boost', price: 1300, does: 'Nitrous brings its own oxygen, so it needs its own fuel, and it lowers the knock limit while it sprays.', then: 'Set the spray fuel and the spray spark retard, and leave the base tune alone.', needs: { training: ['nitrous', 'spark'] }, blocked: (b) => (b.nitrous ? 'Already fitted.' : null), build: () => ({ nitrous: { kit: 'wet', shotHp: 100, heater: true, bottleLb: 10 } }) },
  { id: 'tyres-sport', name: 'Sport tyres', group: 'drive', price: 500, does: 'A softer summer compound: grip rises from about 0.85 to 1.05.', then: 'More grip hooks up more power: look at the launch.', blocked: (b, c) => ((c.drag.gripIdx ?? 0) >= 1 ? 'Already on these or better.' : null), drag: (d) => ({ ...d, gripIdx: 1 }) },
  { id: 'tyres-race', name: 'Race slicks', group: 'drive', price: 1600, does: 'A racing slick: grip of about 1.75, but only when warm and dry.', then: 'With this much grip the car is power-limited, not traction-limited.', blocked: (b, c) => ((c.drag.gripIdx ?? 0) >= 2 ? 'Already on these or better.' : null), drag: (d) => ({ ...d, gripIdx: 2 }) },
  { id: 'tyres-drag', name: 'Drag radials', group: 'drive', price: 2400, does: 'A drag radial on a prepared surface: grip over 2.', then: 'The strip is the only place this makes sense.', blocked: (b, c) => ((c.drag.gripIdx ?? 0) >= 3 ? 'Already fitted.' : null), drag: (d) => ({ ...d, gripIdx: 3 }) },
  { id: 'gear-short', name: 'Short final drive (4.10)', group: 'drive', price: 450, does: 'A higher numerical final drive multiplies torque at the wheels: harder acceleration, lower top speed.', then: 'Engine speed at motorway pace goes up; you will shift more.', blocked: (b, c) => ((c.drag.finalDrive ?? 3.54) >= 4.1 ? 'Already fitted.' : null), drag: (d) => ({ ...d, finalDrive: 4.1 }) },
  { id: 'gear-tall', name: 'Tall final drive (3.08)', group: 'drive', price: 450, does: 'A lower final drive: higher top speed and quieter cruising, slower off the line.', then: 'Check the car still pulls in top gear.', blocked: (b, c) => ((c.drag.finalDrive ?? 3.54) <= 3.08 ? 'Already fitted.' : null), drag: (d) => ({ ...d, finalDrive: 3.08 }) },
  { id: 'weight', name: 'Weight reduction pack', group: 'drive', price: 900, does: 'Rear seats, sound deadening and a lighter battery: 60 kg less to accelerate.', then: 'Mass is on both sides of every equation: faster, stops sooner, turns quicker.', blocked: (b, c) => ((c.drag.massDelta ?? 0) <= -60 ? 'Already stripped out.' : null), drag: (d) => ({ ...d, massDelta: -60 }) },
];

/** @param {string} id */
export const partById = (id) => PARTS.find((p) => p.id === id);

/**
 * Why a part cannot be fitted now, or null.
 * @param {Career} c @param {string} carId @param {string} partId
 */
export function cannotFit(c, carId, partId) {
  const part = partById(partId);
  const car = ownedCar(c, carId);
  const st = carState(c, carId);
  if (!part || !car || !st) return 'No such part or car.';
  if (car.parts.includes(partId) && !part.group.startsWith('boost')) return 'Already fitted.';
  const why = part.blocked?.(st.build, car);
  if (why) return why;
  const lacks = (part.needs?.training ?? []).filter((t) => !c.trained.includes(t));
  if (lacks.length) return `Train first: ${lacks.join(', ')}.`;
  if (c.money < part.price) return `Costs $${part.price.toLocaleString('en-US')}.`;
  return null;
}

/**
 * Fit a part. The hardware changes and the calibration does not: the car now needs a tune.
 * @param {Career} c @param {string} carId @param {string} partId @returns {Career}
 */
export function fitPart(c, carId, partId) {
  if (cannotFit(c, carId, partId)) return c;
  const part = partById(partId);
  const car = ownedCar(c, carId);
  const st = carState(c, carId);
  const build = part.build ? { ...st.build, ...part.build(st.build), presetId: null } : st.build;
  let next = setCarState(c, carId, { build, tune: st.tune });
  next = {
    ...next, money: next.money - part.price,
    cars: next.cars.map((x) => (x.id === carId ? { ...x, parts: [...x.parts, partId], drag: part.drag ? part.drag(car.drag) : x.drag } : x)),
  };
  registerCars(next);
  return next;
}

// ---- engine swaps ----

/**
 * Why an engine cannot go in a car now, or null.
 * @param {Career} c @param {string} carId @param {string} engineId
 */
export function cannotSwap(c, carId, engineId) {
  const car = ownedCar(c, carId);
  const e = engineById(engineId);
  if (!car || !e) return 'No such car or engine.';
  if ((car.engine ?? engineForPreset(car.preset)) === engineId) return 'That is the engine in it now.';
  if (c.rep < e.minRep) return `Needs reputation ${e.minRep}.`;
  if (c.money < e.price) return `Costs $${e.price.toLocaleString('en-US')}.`;
  return null;
}

/** Parts that belong to the engine and leave with it. */
const ENGINE_GROUPS = new Set(['air', 'exhaust', 'fuel', 'boost', 'engine']);

/**
 * Swap the engine. The new one comes from its donor with its own ECU and factory
 * calibration; the old engine's bolt-ons go with it; the car keeps its tyres, gearing and
 * weight, and gains or loses what the new engine weighs.
 * @param {Career} c @param {string} carId @param {string} engineId @returns {Career}
 */
export function swapEngine(c, carId, engineId) {
  if (cannotSwap(c, carId, engineId)) return c;
  const car = ownedCar(c, carId);
  const st = carState(c, carId);
  const e = engineById(engineId);
  const donor = engineState(engineId);
  const oldKg = engineById(car.engine ?? engineForPreset(car.preset) ?? '')?.kg ?? 0;
  // The fuel in the tank stays in the tank.
  const build = { ...donor.build, octaneIdx: st.build.octaneIdx, ethanolPct: st.build.ethanolPct };
  let next = setCarState(c, carId, { build, tune: donor.tune });
  next = {
    ...next, money: next.money - e.price,
    cars: next.cars.map((x) => (x.id === carId ? {
      ...x, engine: engineId, preset: e.preset ?? null,
      parts: x.parts.filter((id) => !ENGINE_GROUPS.has(partById(id)?.group ?? '')),
      drag: { ...x.drag, engineKg: (x.drag.engineKg ?? 0) + e.kg - oldKg },
    } : x)),
  };
  registerCars(next);
  return next;
}

export { ENGINES };

// ---- looks ----

export const PAINTS = [
  ...['silver', 'red', 'blue', 'white', 'orange', 'green', 'black', 'purple', 'teal', 'yellow', 'grey'].map((id) => ({ id, price: 0 })),
  ...['copper', 'pewter', 'pearl', 'lime', 'pink', 'mint', 'sky', 'graphite'].map((id) => ({ id, price: 180 })),
  ...['candy', 'midnight', 'sunset', 'gold', 'bronze'].map((id) => ({ id, price: 420 })),
];
export const WHEEL_SETS = [
  { id: 'steel', price: 0 }, { id: 'alloy5', price: 250 }, { id: 'mesh', price: 450 }, { id: 'deep', price: 700 }, { id: 'race', price: 900 },
];
export const SPOILERS = [{ id: 'none', price: 0 }, { id: 'lip', price: 200 }, { id: 'wing', price: 500 }, { id: 'gt', price: 900 }];
export const UNDERGLOWS = [{ id: null, price: 0 }, { id: 'neonCyan', price: 400 }, { id: 'neonPink', price: 400 }, { id: 'neonGreen', price: 400 }, { id: 'neonAmber', price: 400 }];

/**
 * Change a car's looks. Things bought once stay bought: a colour or a set of wheels is paid
 * for the first time it goes on any car and free after.
 * @param {Career} c @param {string} carId @param {Partial<Look>} patch @returns {Career}
 */
export function restyleCar(c, carId, patch) {
  const car = ownedCar(c, carId);
  if (!car) return c;
  const owned = new Set(c.looks ?? []);
  let cost = 0;
  const bought = [];
  const priced = (kind, list, key, value) => {
    const item = list.find((x) => x.id === value);
    if (!item) return false;
    const tag = `${kind}:${value}`;
    if (item.price > 0 && !owned.has(tag)) { cost += item.price; bought.push(tag); }
    return true;
  };
  for (const [k, v] of Object.entries(patch)) {
    if (k === 'color' && !priced('paint', PAINTS, k, v)) return c;
    if (k === 'wheels' && !priced('wheels', WHEEL_SETS, k, v)) return c;
    if (k === 'spoiler' && !priced('spoiler', SPOILERS, k, v)) return c;
    if (k === 'underglow' && !priced('glow', UNDERGLOWS, k, v)) return c;
  }
  if (c.money < cost) return c;
  const next = { ...c, money: c.money - cost, looks: [...(c.looks ?? []), ...bought], cars: c.cars.map((x) => (x.id === carId ? { ...x, look: { ...x.look, ...patch } } : x)) };
  registerCars(next);
  return next;
}

// ---- fuel ----

/** What the pump sells, by the sim's fuel index, and what a tank costs. E85 needs the ethanol analyser. */
export const FUELS = [
  { idx: 0, label: '91 octane', price: 35, note: 'The cheap one. Knocks first.' },
  { idx: 1, label: '93 octane', price: 45, note: 'More knock resistance, same energy.' },
  { idx: 2, label: '100 octane racing fuel', price: 95, note: 'A lot more knock resistance. A tank of it costs.' },
  { idx: 3, label: 'E85 ethanol', price: 40, note: 'Cheap, knock resistant, but it needs about half as much fuel again.', needs: 'flex' },
];

/** Why a tank cannot be filled with this, or null. @param {Career} c @param {number} idx */
export function cannotFill(c, idx) {
  const f = FUELS.find((x) => x.idx === idx);
  if (!f) return 'No such fuel.';
  if (f.needs && !c.owned.includes(f.needs)) return 'Needs the ethanol content analyser from Gearhead Supply.';
  if (c.money < f.price) return `Costs $${f.price}.`;
  return null;
}

/**
 * Fill a car's tank. The hardware's fuel changes, the calibration does not: change grade and
 * the mixture, the knock margin and the spark the car wants all move.
 * @param {Career} c @param {string} carId @param {number} idx @returns {Career}
 */
export function refuel(c, carId, idx) {
  if (cannotFill(c, idx)) return c;
  const st = carState(c, carId);
  if (!st) return c;
  const price = FUELS.find((x) => x.idx === idx).price;
  const next = setCarState(c, carId, { build: { ...st.build, octaneIdx: idx, ethanolPct: idx === 3 ? 85 : st.build.ethanolPct }, tune: st.tune });
  return { ...next, money: next.money - price };
}
