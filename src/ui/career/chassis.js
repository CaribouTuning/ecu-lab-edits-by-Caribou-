/**
 * Suspension, tyres and transmission: what you can fit and what you can set.
 *
 * Nothing here touches the engine. The engine makes the torque it makes (the simulator's
 * dyno pull); this is everything between that torque and the road. Each control is a
 * physical lever on one number in the vehicle model (world/driving.js):
 *
 *   springs and anti-roll bars  how the car's lateral weight transfer is shared front to rear,
 *                               and so which axle runs out of grip first (balance)
 *   ride height                 centre-of-gravity height: less weight transfer
 *   spring rate (overall)       how quickly the body takes its set: stiffer settles sooner
 *   tyre pressure               contact patch and carcass: peak grip, response, rolling drag
 *   camber                      cornering grip against braking and traction grip
 *   limited-slip diff           the driven axle keeps its traction when the inside wheel unloads
 *   final drive, close ratios   how torque is multiplied, and how far apart the gears are
 *   brake bias                  how braking force is shared between the axles
 *
 * A stock car lets you change its tyre pressures and its brake bias, and nothing else; every
 * other control opens when you fit the part that makes it adjustable.
 */

/** Parts that open controls. @type {Record<string, string>} */
export const CHASSIS_PARTS = {
  springs: 'Sport springs',
  coilovers: 'Coilovers',
  arb: 'Anti-roll bars',
  camber: 'Adjustable camber arms',
  lsd: 'Limited-slip differential',
  fdkit: 'Final-drive gear set',
  closeratio: 'Close-ratio gears',
  sequential: 'Sequential gearbox',
};

/** What a car has before anyone touches it. */
export const DEFAULT_SET = Object.freeze({
  rideMm: 0, springF: 5, springR: 5, arbF: 5, arbR: 5, psiF: 32, psiR: 32, camberF: -0.5, camberR: -0.5, diff: 0, brake: 65, finalDrive: 3.54,
});

/**
 * Every control: its range, the part that opens it (none for always adjustable) and what it does.
 * @type {{id: keyof typeof DEFAULT_SET, label: string, unit: string, min: number, max: number, step: number, needs: string[]|null, does: string}[]}
 */
export const CONTROLS = [
  { id: 'psiF', label: 'Front tyre pressure', unit: 'psi', min: 24, max: 42, step: 0.5, needs: null, does: 'Too low and the tyre squirms and overheats; too high and the contact patch shrinks. About 32 psi is the sweet spot for a street tyre.' },
  { id: 'psiR', label: 'Rear tyre pressure', unit: 'psi', min: 24, max: 42, step: 0.5, needs: null, does: 'Pressure moves the rear grip the same way. Changing one end changes the balance of the car.' },
  { id: 'brake', label: 'Brake bias', unit: '% front', min: 50, max: 78, step: 1, needs: null, does: 'More to the front is stable but wastes rear grip; more to the rear stops shorter until the tail locks.' },
  { id: 'rideMm', label: 'Ride height', unit: 'mm', min: -60, max: 10, step: 1, needs: ['springs', 'coilovers'], does: 'Lower brings the centre of gravity down: less weight transfer, more grip. Too low and the floor hits the road on bumps.' },
  { id: 'springF', label: 'Front spring rate', unit: '', min: 1, max: 10, step: 0.5, needs: ['coilovers'], does: 'A stiffer front takes more of the roll, so the front tyres do more of the work and run out of grip sooner: more understeer.' },
  { id: 'springR', label: 'Rear spring rate', unit: '', min: 1, max: 10, step: 0.5, needs: ['coilovers'], does: 'A stiffer rear moves the work to the rear tyres: less understeer, more oversteer.' },
  { id: 'arbF', label: 'Front anti-roll bar', unit: '', min: 1, max: 10, step: 0.5, needs: ['arb'], does: 'The cheapest balance tool: stiffer at the front adds understeer without touching ride comfort.' },
  { id: 'arbR', label: 'Rear anti-roll bar', unit: '', min: 1, max: 10, step: 0.5, needs: ['arb'], does: 'Stiffer at the rear tightens the car up: it turns in sharper and the tail steps out sooner.' },
  { id: 'camberF', label: 'Front camber', unit: 'deg', min: -4, max: 0, step: 0.1, needs: ['camber'], does: 'Leaning the top of the tyre in keeps it flat on the road in a corner. Past about 3 degrees you lose grip braking in a straight line.' },
  { id: 'camberR', label: 'Rear camber', unit: 'deg', min: -4, max: 0, step: 0.1, needs: ['camber'], does: 'More rear camber helps the tail hold in corners at the cost of straight-line traction.' },
  { id: 'diff', label: 'Differential lock', unit: '%', min: 0, max: 100, step: 5, needs: ['lsd'], does: 'An open diff sends power to the wheel with least grip. A limited-slip keeps driving the loaded outside tyre through a corner.' },
  { id: 'finalDrive', label: 'Final drive', unit: ':1', min: 2.8, max: 4.8, step: 0.05, needs: ['fdkit'], does: 'A higher number multiplies torque more: stronger acceleration, lower top speed, more revs at a cruise.' },
];

/** Whether a control is open on a car with these parts. @param {typeof CONTROLS[number]} c @param {Record<string, boolean>} has */
export const open = (c, has) => !c.needs || c.needs.some((p) => has[p]);

/**
 * The settings a car really runs: each one clamped to its range, and a control that is not open
 * sits at what the fitted hardware fixes it to (sport springs set a lower, stiffer car).
 * @param {Record<string, boolean>} has @param {Partial<Record<keyof typeof DEFAULT_SET, number>>} [set]
 */
export function effective(has, set = {}) {
  /** @type {Record<string, number>} */
  const out = { ...DEFAULT_SET };
  for (const c of CONTROLS) {
    const v = set[c.id];
    if (open(c, has) && Number.isFinite(v)) out[c.id] = Math.max(c.min, Math.min(c.max, /** @type {number} */ (v)));
  }
  if (has.springs && !has.coilovers) Object.assign(out, { rideMm: -25, springF: 7, springR: 7 });
  return out;
}

/** The raw roll stiffness of an axle: springs and bar. The front bar and springs are a size up on a road car. */
const stiff = (spring, arb, front) => (spring + 0.8 * arb) * (front ? 1.2 : 1);
const STOCK_SHARE = stiff(5, 5, true) / (stiff(5, 5, true) + stiff(5, 5, false));

/**
 * What the vehicle model uses, from the settings.
 * @param {Record<string, boolean>} has @param {Partial<Record<keyof typeof DEFAULT_SET, number>>} [set]
 */
export function physicsOf(has = {}, set = {}) {
  const e = effective(has, set);
  const share = stiff(e.springF, e.arbF, true) / (stiff(e.springF, e.arbF, true) + stiff(e.springR, e.arbR, false));
  /** Peak grip against pressure: best at 32, falling off either side. @param {number} psi */
  const press = (psi) => 1 - 0.0008 * (psi - 32) ** 2;
  /** Cornering grip gained from camber, against the stock half degree; past three degrees it falls away. @param {number} c */
  const lat = (c) => 1 + 0.02 * (Math.min(Math.abs(c), 3) - 0.5) - 0.025 * Math.max(0, Math.abs(c) - 3) ** 2;
  /** Grip in a straight line, lost as camber grows. @param {number} c */
  const long = (c) => 1 - 0.008 * (c * c - 0.25);
  const avgPsi = (e.psiF + e.psiR) / 2;
  return {
    rollShareF: 0.55 + (share - STOCK_SHARE),
    cgDropM: -e.rideMm * 0.0006,
    muF: press(e.psiF), muR: press(e.psiR),
    latF: lat(e.camberF), latR: lat(e.camberR), longF: long(e.camberF), longR: long(e.camberR),
    relaxScale: 1 - 0.012 * (avgPsi - 32),
    crrScale: 1 - 0.008 * (avgPsi - 32),
    lsd: e.diff / 100,
    brakeFront: e.brake / 100,
    finalDrive: has.fdkit ? e.finalDrive : null,
    closeRatio: !!has.closeratio,
    shiftScale: has.sequential ? 0.4 : 1,
    bottoming: e.rideMm < -45 && e.springF < 5,
    // The body's natural frequency against stock: it goes as the square root of the spring rate.
    bodyHz: Math.sqrt((e.springF + e.springR) / 10),
  };
}

/** The numbers a car with nothing changed runs on: the vehicle model's own defaults. */
export const NEUTRAL = Object.freeze(physicsOf({}, {}));

/**
 * Gearing with the steps closed up: each gear moves toward top, so shifts drop the revs less,
 * and first gear is a little taller for it.
 * @param {number[]} gears
 */
export function closeRatios(gears) {
  const top = gears[gears.length - 1];
  return gears.map((g) => top * (g / top) ** 0.86);
}

/** Set the controls on one car. Free to change; only open controls take. @param {any} c a career @param {string} carId @param {Partial<Record<keyof typeof DEFAULT_SET, number>>} patch */
export function tuneChassis(c, carId, patch) {
  const car = (c.cars ?? []).find((x) => x.id === carId);
  if (!car) return c;
  const ch = car.drag?.chassis ?? { has: {}, set: {} };
  const set = { ...ch.set, ...patch };
  return { ...c, cars: c.cars.map((x) => (x.id === carId ? { ...x, drag: { ...x.drag, chassis: { has: ch.has, set } } } : x)) };
}

/** Put the settings back to what the hardware fixes. @param {any} c @param {string} carId */
export function resetChassis(c, carId) {
  const car = (c.cars ?? []).find((x) => x.id === carId);
  if (!car) return c;
  return { ...c, cars: c.cars.map((x) => (x.id === carId ? { ...x, drag: { ...x.drag, chassis: { has: x.drag?.chassis?.has ?? {}, set: {} } } } : x)) };
}
