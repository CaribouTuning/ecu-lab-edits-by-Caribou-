/**
 * The town's two ladders of rivals, the drag strip's and the circuit's, and how a race is
 * settled.
 *
 * A rival is a real car (an engine from the catalogue in a body, perhaps with parts fitted
 * the way yours are) driven on the SAME vehicle model as yours, with its torque measured on
 * the simulator. Nobody is given a time. A fast rival is a car that really is faster, and
 * the way to beat one is the way it is built: more air, more grip, less weight, better
 * gearing, and on the circuit, braking in the right place.
 *
 * Each ladder is a short story: beat a rival and the next one hears about it. You cannot
 * skip a rung, and a rival you have already beaten will race you again for less.
 */

import { customerCar } from './cars.js';
import { engineState } from './engines.js';

/** @typedef {import('./shop.js').Career} Career */

/**
 * @typedef {object} Rival
 * @property {string} id
 * @property {string} name
 * @property {string} car what they drive
 * @property {string} body
 * @property {string} color
 * @property {string|null} [preset] a factory engine
 * @property {string} [engine] or a swap-catalogue engine (engines.js)
 * @property {(b: any) => object} [build] hardware they have fitted
 * @property {{gripIdx?: number, finalDrive?: number, massDelta?: number}} [drag]
 * @property {number} minRep
 * @property {number} fee entry fee, refunded with the prize on a win
 * @property {number} prize paid in full the first time you beat them, a quarter after
 * @property {number} rt their reaction time at the tree, seconds
 * @property {number} [skill] on the circuit, the share of the grip they dare use in a corner
 * @property {string} says what they say before the race
 * @property {string} wins what they say if they win
 * @property {string} loses what they say if they lose
 * @property {string} [next] what you hear after beating them: the story moving on
 */

/** The drag strip: the Main Street Kings, and the Champ at the top. @type {Rival[]} */
export const RIVALS = [
  { id: 'edna', name: 'Edna', car: 'Station wagon, 1.6', body: 'wagon', color: 'mint', engine: 'i4-16', minRep: 0, fee: 0, prize: 150, rt: 0.42, says: 'I only come down here to watch, dear. But if you want a race, I have the groceries to get home anyway.', wins: 'Ha! The wagon still has it.', loses: 'Well done. You should meet Bo, he thinks he is very fast.', next: 'Word gets round. Bo, who drives a coupe with a two-litre in it, wants a go.' },
  { id: 'bo', name: 'Bo', car: 'Coupe, 2.0 four', body: 'coupe', color: 'orange', engine: 'i4-20', minRep: 0, fee: 20, prize: 250, rt: 0.3, says: 'Sixteen valves, friend. That is twice as many as yours.', wins: 'Sixteen valves. I told you.', loses: 'Okay. Kenny will eat you alive, though.', next: 'Kenny runs a city car with nothing in it: no rear seats, no carpet, no mercy.' },
  { id: 'kenny', name: 'Kenny', car: 'City car, 1.6, stripped', body: 'kei', color: 'yellow', engine: 'i4-16', minRep: 2, fee: 40, prize: 350, rt: 0.24, says: 'Eight hundred and fifty kilos. Power is nice. Weight is everything.', wins: 'Weight, mate. Weight.', loses: 'What did you DO to that thing?', next: 'Dutch hauls hay in a V8 pickup. He likes to say he could tow your car home after.' },
  { id: 'dutch', name: 'Dutch', car: 'Work truck, 4.8 V8', body: 'pickup', color: 'orange', preset: 'lr4', minRep: 4, fee: 60, prize: 450, rt: 0.28, says: 'My truck hauls a ton. Let’s see if your toy can pull away from it.', wins: 'Tonnes of torque, friend. Tonnes.', loses: 'Huh. I thought a pickup was quick enough.', next: 'Priya drives a GTI with the factory turbo. She is the first of the Kings, and she knows it.' },
  { id: 'priya', name: 'Priya', car: 'GTI, factory turbo', body: 'hatch', color: 'red', preset: 'ea888-gti', minRep: 6, fee: 80, prize: 600, rt: 0.21, says: 'The Main Street Kings start with me. Boost from the factory: you would need to tune for it.', wins: 'Boost is free speed if someone else calibrated it.', loses: 'Okay, you can run. Mia will want to see this.', next: 'Mia’s Golf R makes the same engine work harder. She is waiting by the tree.' },
  { id: 'mia', name: 'Mia', car: 'Golf R', body: 'hatch', color: 'blue', preset: 'ea888-r', minRep: 10, fee: 100, prize: 800, rt: 0.2, says: 'Same block as Priya’s, more boost, less mercy. Try to out-launch it.', wins: 'Same engine, more air. That is the whole trick.', loses: 'Okay, that was fast. Ryo will not like this.', next: 'Ryo has bolted everything he could find to a 350Z. He tuned none of it.' },
  { id: 'ryo', name: 'Ryo', car: '350Z, bolt-ons', body: 'coupe', color: 'white', preset: 'vq35de-revup', build: (b) => ({ mods: { ...b.mods, intake: true, exhaust: true, headers: true } }), drag: { gripIdx: 1 }, minRep: 15, fee: 200, prize: 1200, rt: 0.17, says: 'Intake, headers, back box and sport tyres. Respectable.', wins: 'Revs. It is all in the revs.', loses: 'You tuned that, didn’t you. Vee will want to know how.', next: 'Vee runs a twin-turbo 335i with a short final drive, and the Kings’ only dyno sheet.' },
  { id: 'vee', name: 'Vee', car: '335i, short gearing', body: 'sedan', color: 'black', preset: 'n54', drag: { gripIdx: 1, finalDrive: 3.9 }, minRep: 22, fee: 300, prize: 1800, rt: 0.15, says: 'Twin-turbo six with a short final drive. You will smell it first.', wins: 'Boost is boost. Boost wins.', loses: 'You have a better launch than me. How? Big Tom is next, and he is not friendly.', next: 'Big Tom’s Challenger has six point four litres and he will tell you about every one of them.' },
  { id: 'tom', name: 'Big Tom', car: 'Challenger 392, sport tyres', body: 'muscle', color: 'red', preset: 'hemi-392', drag: { gripIdx: 1 }, minRep: 30, fee: 500, prize: 2800, rt: 0.22, says: 'Six point four litres on summer tyres. Bring a lunch.', wins: 'Cubic inches. You cannot replace them.', loses: 'I need more rubber. Or fewer years. The Champ will race you now. Good luck.', next: 'The Champ has not lost on this strip in two years. Your dad raced him once, a long time ago.' },
  { id: 'champ', name: 'The Champ', car: 'Challenger 392, slicks and gears', body: 'muscle', color: 'graphite', preset: 'hemi-392', drag: { gripIdx: 2, finalDrive: 4.1, massDelta: -120 }, minRep: 40, fee: 800, prize: 6000, rt: 0.13, says: 'I have not lost on this strip in two years. Your old man Ray was the last one to come close.', wins: 'Two years and counting.', loses: 'Two years. Congratulations, King of Main Street. Tell Pops Ray’s kid finally got me.', next: 'You are the fastest thing on Main Street. Every rematch is a victory lap now.' },
];

/** The circuit: the Caribou Raceway club ladder. @type {Rival[]} */
export const TRACK_RIVALS = [
  { id: 'pip', name: 'Pip', car: 'City car, 1.6', body: 'kei', color: 'sky', engine: 'i4-16', minRep: 0, fee: 0, prize: 200, rt: 0.3, skill: 0.72, says: 'First time at the Raceway? Three laps. Brake in a straight line, turn, then power. Want to try?', wins: 'Smooth is fast! You will get it.', loses: 'Nice lines! Coach Hal says Sanjay is next.', next: 'Sanjay has a two-litre hatch and a notebook of braking points.' },
  { id: 'sanjay', name: 'Sanjay', car: 'Hatch, 2.0 four', body: 'hatch', color: 'teal', engine: 'i4-20', minRep: 0, fee: 30, prize: 350, rt: 0.26, skill: 0.8, says: 'I brake at the third board into turn one. Every time. Do you?', wins: 'Consistency. Write it down.', loses: 'Okay, you brake later than me. Rosa is quicker still.', next: 'Rosa races a straight-six roadster: light, balanced, and no roof to hide under.' },
  { id: 'rosa', name: 'Rosa', car: 'Roadster, 3.0 six', body: 'roadster', color: 'red', engine: 'i6-30', minRep: 3, fee: 60, prize: 600, rt: 0.22, skill: 0.85, says: 'A light car does not need to brake as much. Watch my mirrors.', wins: 'Light is right.', loses: 'You carried more speed than me through the long left. Marlow will notice.', next: 'Marlow brings a C5 Corvette to every club day and leaves with every trophy.' },
  { id: 'marlow', name: 'Marlow', car: 'Corvette C5, sport tyres', body: 'coupe', color: 'yellow', preset: 'ls1', drag: { gripIdx: 1 }, minRep: 8, fee: 120, prize: 1000, rt: 0.2, skill: 0.88, says: 'Five point seven litres and sticky tyres. The straights are mine.', wins: 'Torque out of the hairpin. Every lap.', loses: 'You were faster in the corners than I was on the straights. Klaus will want you.', next: 'Klaus runs a 335i on track days and keeps a spreadsheet of every lap.' },
  { id: 'klaus', name: 'Klaus', car: '335i, sport tyres', body: 'sedan', color: 'silver', preset: 'n54', drag: { gripIdx: 1 }, minRep: 15, fee: 200, prize: 1600, rt: 0.18, skill: 0.91, says: 'Twin turbos, a heavy car and good data. Data wins.', wins: 'My data said I would win. It was right.', loses: 'My data did not have you in it. The Ghost will.', next: 'Nobody knows the Ghost’s real name. An M340i on slicks, and a lap record.' },
  { id: 'ghost', name: 'The Ghost', car: 'M340i, slicks', body: 'sedan', color: 'graphite', preset: 'b58-m1', drag: { gripIdx: 2 }, minRep: 25, fee: 400, prize: 3000, rt: 0.16, skill: 0.94, says: '...', wins: '...', loses: 'Good race. Valentina holds the lap record. Go and take it.', next: 'Valentina Cruz holds the Raceway lap record in a stripped Corvette on slicks.' },
  { id: 'valentina', name: 'Valentina', car: 'Corvette C5, slicks, stripped', body: 'coupe', color: 'candy', preset: 'ls1', drag: { gripIdx: 2, massDelta: -90 }, minRep: 35, fee: 700, prize: 5500, rt: 0.14, skill: 0.97, says: 'The record is mine. If you want it, you will have to brake later than I do. Nobody does.', wins: 'The record stays with me.', loses: 'Raceway champion. You earned it, every corner.', next: 'You hold the Raceway. Every rematch is a defence of the title.' },
];

/** @param {string} id */
export const rivalById = (id) => RIVALS.find((r) => r.id === id) ?? TRACK_RIVALS.find((r) => r.id === id);

/** Which ladder a rival is on. @param {Rival} r */
export const seriesOf = (r) => (TRACK_RIVALS.includes(r) ? 'track' : 'drag');

/** The ladder a series climbs. @param {'drag'|'track'} series */
export const ladder = (series) => (series === 'track' ? TRACK_RIVALS : RIVALS);

/** @param {Career} c @param {'drag'|'track'} series */
const record = (c, series) => (series === 'track' ? c.track : c.races) ?? { won: [], best: {} };

/** Rivals of a series this shop has beaten. @param {Career} c @param {'drag'|'track'} series */
export const beaten = (c, series) => record(c, series).won;

/** The next rival on a ladder: the first one not yet beaten, or null when it is climbed. @param {Career} c @param {'drag'|'track'} series */
export const nextRival = (c, series) => ladder(series).find((r) => !beaten(c, series).includes(r.id)) ?? null;

/**
 * The build and calibration a rival races: their engine with whatever hardware they fitted,
 * on the factory calibration (rivals do not retune; that is your advantage).
 * @param {Rival} r
 */
const RIVAL_STATES = new Map();
export function rivalState(r) {
  if (!RIVAL_STATES.has(r.id)) {
    const base = r.engine ? engineState(r.engine) : null;
    const s = base
      ? { build: { ...base.build, ...(r.build ? r.build(base.build) : {}) }, tune: base.tune }
      : customerCar({ preset: r.preset ?? null, build: r.build });
    RIVAL_STATES.set(r.id, { build: s.build, tune: s.tune });
  }
  return RIVAL_STATES.get(r.id);
}

/**
 * Why a race cannot be entered, or null.
 * @param {Career} c @param {Rival} r @param {string|null} carId
 */
export function cannotRace(c, r, carId) {
  const series = seriesOf(r);
  const list = ladder(series);
  const i = list.indexOf(r);
  const won = beaten(c, series);
  if (i > 0 && !won.includes(list[i - 1].id)) return `Beat ${list[i - 1].name} first.`;
  if (c.rep < r.minRep) return `Needs reputation ${r.minRep}.`;
  if (!carId || !(c.cars ?? []).some((x) => x.id === carId)) return 'Choose one of your own cars.';
  if (c.lifts.some((l) => l.jobId === `own:${carId}`)) return 'That car is on a lift: lower it first.';
  if (c.money < r.fee) return `Entry costs $${r.fee}.`;
  return null;
}

/**
 * Decide a drag race from two runs and two reaction times: elapsed time from the green
 * light, the car's own ET plus how long the driver took to go.
 * @param {{et: number, trapMph: number}} player @param {{et: number, trapMph: number}} rival
 * @param {{playerRt: number, rivalRt: number}} rt
 */
export function decide(player, rival, rt) {
  const p = player.et + rt.playerRt;
  const r = rival.et + rt.rivalRt;
  return { won: p < r, margin: r - p, playerTotal: p, rivalTotal: r };
}

/** A reaction time for a quick replay: deterministic from the day, so a rematch is the same race. @param {number} seed @param {number} day */
export function playerReaction(seed, day) {
  const h = Math.imul((seed ^ (day * 2654435761)) >>> 0, 2246822519) >>> 0;
  return 0.16 + ((h >>> 8) % 100) / 1000;
}

/** What a win over this rival pays now: the whole prize the first time, a quarter after. @param {Career} c @param {Rival} r */
export function prizeFor(c, r) {
  return beaten(c, seriesOf(r)).includes(r.id) ? Math.round(r.prize / 4 / 10) * 10 : r.prize;
}

/**
 * What a race pays and costs, and what the save records. `time` is the drag ET or the
 * best lap, whichever the race was: the shorter the better either way.
 * @param {Career} c @param {Rival} r @param {string} carId @param {{won: boolean, et?: number, lap?: number}} res
 * @returns {Career}
 */
export function settleRace(c, r, carId, res) {
  const series = seriesOf(r);
  const prior = record(c, series);
  const first = res.won && !prior.won.includes(r.id);
  const time = res.et ?? res.lap ?? Infinity;
  const best = Math.min(prior.best[carId] ?? Infinity, time);
  const rec = { won: first ? [...prior.won, r.id] : prior.won, best: Number.isFinite(best) ? { ...prior.best, [carId]: best } : prior.best };
  const rd = c.raceDay?.day === c.day ? c.raceDay : { day: c.day, n: 0 };
  return {
    ...c,
    money: c.money - r.fee + (res.won ? r.fee + prizeFor(c, r) : 0),
    rep: c.rep + (first ? Math.max(2, Math.round(r.prize / 150)) : 0),
    ...(series === 'track' ? { track: rec } : { races: rec }),
    raceDay: { day: c.day, n: rd.n + 1 },
  };
}

/**
 * A practice lap or a solo pass: no rival, just the clock. Keeps the car's best.
 * @param {Career} c @param {'drag'|'track'} series @param {string} carId @param {number} time
 * @returns {Career}
 */
export function recordTime(c, series, carId, time) {
  const prior = record(c, series);
  if (!(time > 0) || (prior.best[carId] ?? Infinity) <= time) return c;
  const rec = { won: prior.won, best: { ...prior.best, [carId]: time } };
  return series === 'track' ? { ...c, track: rec } : { ...c, races: rec };
}

/**
 * What to say about a run, from what actually happened on the strip.
 * @param {{et: number, trapMph: number, sixtyFootT: number|null, wheelspun: boolean, topGearUsed: number}} run
 * @param {{gripIdx?: number}} drag
 * @param {number} gears
 */
export function sliptalk(run, drag, gears) {
  const out = [];
  if (run.wheelspun) {
    out.push(
      (drag.gripIdx ?? 0) < 1
        ? 'The tyres broke loose off the line. Street rubber caps what a launch can use: stickier tyres would turn that wheelspin into forward push.'
        : 'Even with good tyres the car spun on the launch: more power than grip. Gearing or a gentler first gear would put it down better.',
    );
  } else if (run.sixtyFootT != null) {
    out.push(`A 60-foot time of ${run.sixtyFootT.toFixed(2)} s: the launch hooked up. From here the quarter mile is power against weight and drag.`);
  }
  if (run.topGearUsed < gears) out.push('The run ended before the car reached top gear: shorter gearing helps here, because a quarter mile is short.');
  if (run.trapMph > 105) out.push(`Trap speed ${run.trapMph.toFixed(0)} mph: that is power. Elapsed time says how quickly you got moving; trap speed says how much engine is pushing at the end.`);
  else out.push(`Trap speed ${run.trapMph.toFixed(0)} mph: that reflects the power at the end of the run, more than the launch.`);
  return out;
}

/**
 * What to say about a circuit race, from the laps.
 * @param {{laps: number[], best: number, offTrack: number, topMph: number}} run
 * @param {{gripIdx?: number}} drag
 */
export function laptalk(run, drag) {
  const out = [];
  const spread = run.laps.length > 1 ? Math.max(...run.laps) - Math.min(...run.laps) : 0;
  out.push(`Best lap ${run.best.toFixed(2)} s, top speed ${run.topMph.toFixed(0)} mph.`);
  if (run.offTrack > 2) out.push(`You spent ${run.offTrack.toFixed(0)} s on the grass. Grass has about half the grip of tarmac: brake earlier, in a straight line, and the car turns.`);
  if (spread > 1.5) out.push(`Your laps varied by ${spread.toFixed(1)} s. A consistent braking point is worth more than one heroic corner.`);
  if ((drag.gripIdx ?? 0) < 1) out.push('Street tyres cap the cornering speed: in a corner, grip is the speed limit, and stickier tyres raise it more than horsepower does.');
  else out.push('Corner speed is set by grip (v = square root of mu g R): more power only helps on the straights.');
  return out;
}
