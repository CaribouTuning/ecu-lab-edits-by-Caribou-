/**
 * The exhaust note: every firing event computed from the engine, played through the
 * exhaust system computed from the build.
 *
 * WHERE THE SOUND COMES FROM
 *
 * Each time a cylinder's exhaust valve opens, `exhaustEvent` (src/sim/acoustics.js) works
 * out the gas leaving it, sample by sample: the blowdown through a valve opening along
 * the cam's flank, choked and then subsonic, and then the piston pushing out what is left.
 * That flow, with the turbulence it carries, is the SOURCE. Nothing about it is drawn by
 * hand: the pressure the cylinder opens at is the tune (timing, boost, load, fuelling), the
 * valve is the bore, the volume being emptied is the displacement and the compression, and
 * how the event is spread in time is the cam and the engine speed.
 *
 * The source then goes through the EXHAUST SYSTEM, which is `exhaustImpulseResponse`: the
 * primaries, collector, converter, muffler and tailpipe as tubes that carry, reflect and
 * absorb a pressure wave, computed from the build and played through a convolver. That is
 * what turns a train of gas pulses into a note — and the same approach, a gas-dynamics
 * source convolved with an exhaust's response, is what the best-regarded engine simulator
 * there is (AngeTheGreat's Engine Simulator) does with a recorded one. Here it is computed,
 * so a bigger pipe, headers, a cat-back or a turbine are each heard for what they do.
 *
 * WHY THIS IS NOT THE VERSION BEFORE IT
 *
 * That one radiated each event's rate of change straight to the speaker, through the
 * reference build's (v4.8) fixed filters, with wide-band hiss on top. Its sixes came out
 * "computery" — a fixed comb and fixed resonances with nothing around them — and at the
 * redline everything sounded like air blowing, because hiss rises with flow faster than
 * the note does. Now:
 *
 *   1. The source is the FLOW, the way engine-sim feeds its convolver, and its turbulence
 *      rides on the flow (it cannot exist without it) and is band-limited to what a pipe
 *      carries, about 2 kHz. The pipes decide what reaches the treble, as they do.
 *   2. The pipes are real pipes. Many resonances, not two, set by lengths and areas, each
 *      decaying at its own rate — which is what the ear hears as a system rather than a
 *      filter.
 *   3. Each cylinder reaches the collector through its own primary, so a cast manifold's
 *      unequal runners stagger the pulses by milliseconds and tuned headers line them up.
 *   4. The note plays into a space — a ground bounce, a few reflections and a short tail —
 *      because a tailpipe in a vacuum is what "computery" sounds like.
 *   5. A level-follower, as engine-sim's, brings every layout and every speed to a
 *      listenable level without flattening the difference between idle and full noise.
 *
 * A REAL ENGINE NEVER REPEATS ITSELF, so neither does this: combustion scatters from cycle
 * to cycle (`combustionScatter`), each cylinder breathes a little differently, and a strong
 * cycle speeds the crank so the next event arrives early. Where the pulses fall is still
 * `firingEvents`: a cross-plane V8's banks are offset, so its events are unevenly spaced,
 * and that unevenness is the rumble.
 *
 * STARTING. The starter turns the engine against compression: every cylinder coming up on
 * its compression stroke slows the crank and every one going over the top lets it run, so
 * the crank surges several times a revolution. The starter's gear whine follows that
 * surge, which is the "rur-rur-rur" of an engine turning over. When it catches the starter
 * lets go and spins down.
 *
 * HOW IT REACHES THE SPEAKER. Events are laid into rings of samples, one per bank, as they
 * are computed, and the rings are played out in short buffers scheduled back to back a
 * little ahead of the clock, each into its bank's convolver.
 */

import {
  ACOUSTIC, combustionScatter, exhaustEvent, exhaustImpulseResponse, primaryLengthsM,
} from '../../sim/acoustics.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * Clamp, but treat a non-finite value as the low end rather than passing it on.
 *
 * A single NaN written to an AudioParam THROWS, and the throw unwinds the whole frame, so
 * one bad number upstream takes every other layer's update with it and the app goes silent
 * — a failure that is invisible until someone notices there is no sound.
 *
 * @param {number} v
 * @param {number} lo
 * @param {number} hi
 * @returns {number}
 */
const safe = (v, lo, hi) => (Number.isFinite(v) ? clamp(v, lo, hi) : lo);

/** Samples in each scheduled buffer. */
const CHUNK = 1024;

/** How far ahead of the clock the stream is computed, seconds. */
const LOOKAHEAD = 0.15;

/** Rings of pending samples; a power of two, and longer than the slowest event. */
const RING = 1 << 16;
const RING_MASK = RING - 1;

/** Fixed trim on everything the events feed. */
const BUS_GAIN = 1;

/**
 * Converts flow, kg/s, into signal before the exhaust system. Fixed for every engine: a
 * bigger cylinder moving more gas is louder because it is, not because it was turned up.
 */
const SOURCE_GAIN = 6;

/**
 * How deeply turbulence modulates the flow: a floor for gas forced through a seat and down
 * a pipe at any speed, and more as the jet through the seat nears sonic. engine-sim runs
 * its equivalent at full depth; this is set against recordings of real engines, which
 * keep a clear firing tone under their rush at every speed.
 */
const RUSH_DEPTH = 0.3;
const JET_DEPTH = 0.42;

/** Where turbulence stops, Hz: what a pipe carries, and where engine-sim band-limits its own. */
const RUSH_HZ = 2000;

/**
 * How far a cycle's scatter moves the crank's arrival at the next event, per unit of it.
 * A cycle 10% strong speeds the crank by about 1% over the gap that follows.
 */
const CRANK_WOBBLE = 0.1;

/** Chance per unit of lope severity that a cycle barely burns at all. */
const MISFIRE_PER_SEVERITY = 0.3;

/** What a barely-burning cycle opens the valve at, as a fraction of a good one. */
const MISFIRE_EVO = 0.45;

/**
 * LEVEL. The radiated level of a real exhaust rises about 30 dB from idle to full power,
 * which no phone speaker and no ear at a comfortable volume can take in one piece. So two
 * things happen, both from the build rather than by ear:
 *
 *   - Every engine is brought to the same level at one reference condition — wide open at
 *     3000 rpm — measured by running one cycle of its own events through `exhaustEvent`.
 *     A V8 and a four are then equally present, the way a recording engineer would set
 *     them, and what differs between them is the note.
 *   - A gentle follower then brings idle up and full noise down, but only part of the way
 *     (`amount`) and never by more than `maxGain` or less than `minGain`, so a lift or a
 *     fuel cut still drops away the way a real one does, and full throttle is still
 *     clearly louder than idle.
 */
const LEVEL = {
  reference: { rpm: 3000, evoKpa: 450, portKpa: 115 },
  target: 0.3, amount: 0.5, maxGain: 3, minGain: 0.35, attack: 0.05, release: 0.8,
};

/**
 * The space the engine is heard in: a listener a few metres from the tailpipe, outdoors
 * near buildings. The ground bounce arrives a couple of milliseconds after the direct
 * sound, a few walls later, and a short diffuse tail after that. Mixed well below the
 * direct sound.
 */
const SPACE = { seconds: 0.55, t60: 0.45, groundMs: 2.4, groundGain: 0.55, wet: 0.22 };

/**
 * THE STARTER. A starter pinion drives the flywheel's ring gear — about 135 teeth — so its
 * mesh whines at the crank's revolutions per second times that; the motor itself turns
 * about 14 times faster than the crank and its commutator adds a thinner whine above.
 * `ripple` is how hard the crank surges against compression per unit of compression ratio
 * over 10, for a four; more cylinders overlap their compressions and surge less.
 */
const STARTER = {
  ringTeeth: 135, motorRatio: 14, commutatorBars: 24, level: 0.16, ripple: 0.3,
  releaseSeconds: 0.18, spinDownSeconds: 0.45,
};

/** How long a change of exhaust system takes to crossfade, seconds. */
const SWAP_SECONDS = 0.12;

/**
 * A small fast random source, so a stream can own its own and tests can seed it.
 *
 * @param {number} seed
 * @returns {() => number} uniform on [0, 1)
 */
function random(seed) {
  let x = (seed >>> 0) || 0x9e3779b9;
  return () => {
    x ^= x << 13; x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5; x >>>= 0;
    return x / 4294967296;
  };
}

/**
 * A standard normal draw.
 *
 * @param {() => number} rnd
 * @returns {number}
 */
function gauss(rnd) {
  const u = Math.max(1e-12, rnd());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd());
}

/**
 * A string's hash, for seeding the cylinder spread from the build.
 *
 * @param {string} text
 * @returns {number}
 */
function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * Wrap a response in an AudioBuffer for a convolver.
 *
 * @param {BaseAudioContext} ctx
 * @param {Float32Array} ir
 * @returns {AudioBuffer}
 */
function responseBuffer(ctx, ir) {
  const buffer = ctx.createBuffer(1, ir.length, ctx.sampleRate);
  buffer.getChannelData(0).set(ir);
  return buffer;
}

/**
 * The space's response: direct-sound excluded, so it is mixed in beside the dry note.
 *
 * @param {BaseAudioContext} ctx
 * @returns {AudioBuffer}
 */
function spaceBuffer(ctx) {
  const sr = ctx.sampleRate;
  const n = Math.round(SPACE.seconds * sr);
  const ir = new Float32Array(n);
  const rnd = random(0x5eed);
  // The ground bounce: the same sound from a mirror image of the tailpipe below the ground.
  ir[Math.round((SPACE.groundMs / 1000) * sr)] = SPACE.groundGain;
  // A handful of walls and cars, each a delayed, softened copy.
  for (let k = 0; k < 7; k++) {
    const at = Math.round((0.008 + rnd() * 0.05) * sr);
    ir[at] += (0.18 + rnd() * 0.18) * (rnd() < 0.5 ? -1 : 1);
  }
  // The diffuse tail, decaying at the space's T60, losing its treble faster than its bass.
  let lp = 0;
  const decay = Math.log(1000) / SPACE.t60;
  for (let i = Math.round(0.02 * sr); i < n; i++) {
    const t = i / sr;
    const pole = Math.exp((-2 * Math.PI * (6000 / (1 + 8 * t))) / sr);
    lp = (rnd() * 2 - 1) + pole * (lp - (rnd() * 2 - 1));
    ir[i] += 0.05 * lp * Math.exp(-decay * t);
  }
  return responseBuffer(ctx, ir);
}

/**
 * One bank's path through the exhaust system: two convolvers, so a new response can fade in
 * over the old one instead of cutting it off.
 *
 * @param {BaseAudioContext} ctx
 * @param {AudioNode} into
 * @returns {Record<string, any>}
 */
function bankPath(ctx, into) {
  const input = ctx.createGain();
  input.gain.value = 1;
  const slots = [0, 1].map(() => {
    const conv = ctx.createConvolver();
    conv.normalize = false;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    input.connect(conv);
    conv.connect(gain);
    gain.connect(into);
    return { conv, gain };
  });
  return { input, slots, live: -1, key: '' };
}

/**
 * Build the note.
 *
 * @param {AudioContext} ctx
 * @returns {Record<string, any>}
 */
export function createPulseExhaust(ctx) {
  const sum = ctx.createGain();
  sum.gain.value = 1;
  // A DC block. The flow leaving a pipe is always outward, so the source carries an offset
  // that the exhaust's response removes — but a change of response mid-note can leave a
  // step. Below the lowest note the engine makes, so nothing else changes.
  const dcBlock = ctx.createBiquadFilter();
  dcBlock.type = 'highpass';
  dcBlock.frequency.value = 12;
  dcBlock.Q.value = 0.7;
  const out = ctx.createGain();
  out.gain.value = 1;
  sum.connect(dcBlock);
  dcBlock.connect(out);
  // The space, beside the dry note.
  const space = ctx.createConvolver();
  space.normalize = false;
  space.buffer = spaceBuffer(ctx);
  const spaceGain = ctx.createGain();
  spaceGain.gain.value = SPACE.wet;
  dcBlock.connect(space);
  space.connect(spaceGain);
  spaceGain.connect(out);

  // Everything the exhaust events feed, per bank, and what the engine itself makes (the
  // starter), which does not go down the pipe.
  const bus = ctx.createGain(); bus.gain.value = BUS_GAIN;
  bus.connect(sum);
  const banks = [bankPath(ctx, bus), bankPath(ctx, bus)];
  const mech = ctx.createGain(); mech.gain.value = 1;
  mech.connect(sum);

  // Knock's rattle and a rich mixture's rougher burn, gated at the firing rate so they
  // arrive in pulses rather than as hiss.
  const noiseLength = 2 * ctx.sampleRate;
  const noiseBuffer = ctx.createBuffer(1, noiseLength, ctx.sampleRate);
  const nd = noiseBuffer.getChannelData(0);
  for (let i = 0; i < noiseLength; i++) nd[i] = (Math.random() * 2 - 1) * 0.35;
  const noise = ctx.createBufferSource(); noise.buffer = noiseBuffer; noise.loop = true;
  const noiseGain = ctx.createGain(); noiseGain.gain.value = 0;
  const gateLfo = ctx.createOscillator(); gateLfo.type = 'sawtooth'; gateLfo.frequency.value = 40;
  const gateDepth = ctx.createGain(); gateDepth.gain.value = 0.03;
  gateLfo.connect(gateDepth); gateDepth.connect(noiseGain.gain);
  const noiseTone = ctx.createBiquadFilter();
  noiseTone.type = 'bandpass'; noiseTone.frequency.value = 5500; noiseTone.Q.value = 1.2;
  noise.connect(noiseTone); noiseTone.connect(noiseGain); noiseGain.connect(sum);

  for (const src of [noise, gateLfo]) {
    try { src.start(); } catch { /* a suspended context starts it on resume */ }
  }

  return {
    out, sum, dcBlock, bus, banks, mech, space, spaceGain,
    noiseGain, gateLfo,
    /** @type {Record<string, any>|null} the `exhaustGeometry` the events are computed in */
    geometry: null,
    /** @type {{angleDeg: number, bank?: number}[]} */
    events: [{ angleDeg: 0 }],
    /** Each cylinder's fixed share of the charge, around 1. */
    trims: [1],
    /** Each cylinder's extra travel to the collector over the shortest, in samples. */
    primaryDelays: [0],
    cyl: 6,
    displacementL: 3.0,
    compression: 10.3,
    catBack: false,
    /** This engine's source gain at the reference condition, from `referenceLevel`. */
    norm: 1,
    stream: {
      rings: [new Float32Array(RING), new Float32Array(RING), new Float32Array(RING)],
      /** Absolute sample the next scheduled buffer starts at; -1 when stopped. */
      head: -1,
      /** Absolute sample, fractional, where the next exhaust event starts. */
      next: 0,
      index: 0,
      /** The combustion scatter's running state: this cycle's deviation, in CoVs. */
      walk: 0,
      /** The turbulence's band-limiting state. */
      rushLp: 0,
      /** The level-follower's envelope and the gain it last applied. */
      envelope: 0,
      gain: 1,
      /** The starter: how engaged, its phase, and the crank speed it last saw. */
      starter: 0, starterPhase: 0, commutatorPhase: 0, starterRpm: 0,
      rnd: random((Math.random() * 4294967296) >>> 0),
    },
    /**
     * The last events computed, newest last: when (seconds), which cylinder, the pressure
     * its valve opened at and the gap to the one before it. For tests and for anyone
     * asking what the note is made of.
     *
     * @type {{at: number, cylinder: number, evoKpa: number, gapSeconds: number}[]}
     */
    log: [],
    geomKey: '',
    trimKey: '',
  };
}

/**
 * Load the exhaust system's response into each bank, fading from the old one.
 *
 * @param {Record<string, any>} a
 * @param {BaseAudioContext} ctx
 */
function refreshResponse(a, ctx) {
  const g = a.geometry;
  if (!g) return;
  const t = ctx.currentTime;
  const bankCount = Math.max(1, g.banks || 1);
  a.banks.forEach((path, b) => {
    if (b >= bankCount) {
      for (const slot of path.slots) slot.gain.gain.setTargetAtTime(0, t, SWAP_SECONDS / 3);
      path.live = -1; path.key = '';
      return;
    }
    const key = `${a.geomKey}|${a.catBack}|${b}`;
    if (key === path.key) return;
    path.key = key;
    const next = path.live === 0 ? 1 : 0;
    const ir = exhaustImpulseResponse(g, ctx.sampleRate, { bank: b, catBack: a.catBack });
    path.slots[next].conv.buffer = responseBuffer(ctx, ir);
    path.slots[next].gain.gain.setTargetAtTime(1, t, SWAP_SECONDS / 3);
    if (path.live >= 0) path.slots[path.live].gain.gain.setTargetAtTime(0, t, SWAP_SECONDS / 3);
    path.live = next;
  });
}

/**
 * Point the note at a new build.
 *
 * @param {Record<string, any>} a
 * @param {AudioContext} ctx
 * @param {Record<string, any>} geometry an `exhaustGeometry`
 * @param {string} key a `geometryKey` for it
 */
export function setPulseExhaustGeometry(a, ctx, geometry, key) {
  if (key === a.geomKey) return;
  a.geomKey = key;
  a.geometry = geometry;
  if (geometry.events && geometry.events.length) a.events = geometry.events;
  a.cyl = Math.max(1, geometry.cyl || a.cyl);
  const swept = geometry.sweptM3 ?? 5e-4;
  a.displacementL = safe(swept * 1000 * a.cyl, 0.5, 12);
  a.compression = safe(swept / Math.max(1e-7, geometry.clearanceM3 ?? swept / 9.3) + 1, 6, 16);

  // Each cylinder's own run to the collector, as a delay past the shortest one.
  const lengths = primaryLengthsM(geometry);
  const shortest = Math.min(...lengths);
  const c = geometry.cPrimary || 600;
  a.primaryDelays = lengths.map((l) => Math.round(((l - shortest) / c) * ctx.sampleRate));

  // The cylinders' spread is the engine's own, so it is seeded from the parts that make it
  // and does not change when only the gas temperature does.
  const trimKey = `${a.events.map((e) => e.angleDeg.toFixed(1)).join(',')}|${swept.toFixed(7)}`;
  if (trimKey !== a.trimKey) {
    a.trimKey = trimKey;
    const rnd = random(hash(trimKey));
    a.trims = a.events.map(() => 1 + ACOUSTIC.CYLINDER_SPREAD * gauss(rnd));
    const ref = referenceLevel(a, ctx.sampleRate);
    a.norm = ref > 0 ? LEVEL.target / ref : 1;
  }
  refreshResponse(a, ctx);
}

/**
 * Compute one exhaust event into its bank's ring.
 *
 * @param {Record<string, any>} a
 * @param {number} sampleRate
 * @param {number} at absolute sample it starts at
 * @param {Record<string, any>} f the frame, already made safe
 * @returns {number} the gap to the next event, seconds
 */
function addEvent(a, sampleRate, at, f) {
  const s = a.stream;
  const n = a.events.length;
  const k = s.index % n;
  const here = a.events[k];
  const next = a.events[(k + 1) % n];

  // This cycle's combustion, carrying some of the last one's. A cranking engine is not
  // burning, so there is nothing to scatter.
  const rho = f.persistence;
  s.walk = rho * s.walk + Math.sqrt(1 - rho * rho) * gauss(s.rnd);
  const cov = f.cranking ? 0 : combustionScatter(f.load, f.lope);
  let evo = f.evoKpa * (a.trims[k] ?? 1) * (1 + cov * s.walk);
  if (f.lope > 0 && s.rnd() < f.lope * MISFIRE_PER_SEVERITY) evo *= MISFIRE_EVO;
  evo = Math.max(20, evo);

  const { flow, jet } = exhaustEvent({
    geometry: a.geometry, evoKpa: evo, rpm: f.rpm, sampleRate, backKpa: f.portKpa,
  });
  const bank = a.geometry && a.geometry.banks > 1 && here.bank === 1 ? 1 : 0;
  const ring = s.rings[bank];
  const gain = SOURCE_GAIN * f.level;
  const rushPole = Math.exp((-2 * Math.PI * RUSH_HZ) / sampleRate);
  // A one-pole low-pass of white noise at 2 kHz keeps about a fifth of its amplitude;
  // this puts the band-limited rush back at unit size.
  const rushNorm = Math.sqrt((1 + rushPole) / (1 - rushPole));
  const start = Math.round(at) + (a.primaryDelays[k] ?? 0);
  for (let i = 0; i < flow.length; i++) {
    const q = flow[i];
    const m = jet[i];
    const white = s.rnd() * 2 - 1;
    s.rushLp = white + rushPole * (s.rushLp - white);
    const rush = s.rushLp * rushNorm * (RUSH_DEPTH + JET_DEPTH * m * m);
    ring[(start + i) & RING_MASK] += gain * q * (1 + rush);
  }

  let gapDeg = next.angleDeg - here.angleDeg;
  if (gapDeg <= 0) gapDeg += 720;
  const gap = (gapDeg / (6 * f.rpm)) * (1 - CRANK_WOBBLE * cov * s.walk);
  a.log.push({ at: start / sampleRate, cylinder: k, evoKpa: evo, gapSeconds: gap });
  if (a.log.length > 256) a.log.splice(0, a.log.length - 256);
  s.index++;
  return gap;
}

/**
 * The starter, for one buffer: its gear whine and its motor, following a crank that surges
 * against every compression. Written into the engine's own ring, which does not go down
 * the pipe.
 *
 * @param {Record<string, any>} a
 * @param {number} sampleRate
 * @param {number} head absolute sample the buffer starts at
 * @param {Record<string, any>} f the frame
 */
function addStarter(a, sampleRate, head, f) {
  const s = a.stream;
  if (!f.cranking && s.starter < 1e-4) return;
  const ring = s.rings[2];
  const release = Math.exp(-1 / (STARTER.releaseSeconds * sampleRate));
  const spinDown = Math.exp(-1 / (STARTER.spinDownSeconds * sampleRate));
  // How hard the crank surges: harder with more compression, softer with more cylinders,
  // because their compressions overlap and fill in each other's dips.
  const ripple = STARTER.ripple * (a.compression / 10) * Math.sqrt(4 / Math.max(1, a.cyl));
  const compressionsPerRev = Math.max(1, a.cyl) / 2;
  for (let i = 0; i < CHUNK; i++) {
    if (f.cranking) {
      s.starter += (1 - s.starter) * 0.002;
      s.starterRpm = f.rpm;
    } else {
      s.starter *= release;
      s.starterRpm *= spinDown;
    }
    // Where the crank is in its surge: slowest as each cylinder comes up on compression.
    const crankPhase = s.starterPhase / STARTER.ringTeeth;
    const surge = f.cranking ? 1 - ripple * Math.cos(2 * Math.PI * compressionsPerRev * crankPhase) : 1;
    const revPerSecond = (s.starterRpm / 60) * surge;
    s.starterPhase += (revPerSecond * STARTER.ringTeeth) / sampleRate;
    s.commutatorPhase += (revPerSecond * STARTER.motorRatio * STARTER.commutatorBars) / sampleRate;
    if (s.starterPhase > 1e6) s.starterPhase -= STARTER.ringTeeth * 1e3;
    if (s.commutatorPhase > 1e6) s.commutatorPhase -= 1e6;
    const mesh = 2 * Math.PI * s.starterPhase;
    // Gear mesh is a tooth-shaped whine, not a sine: several harmonics, and a little grit.
    const whine = Math.sin(mesh) + 0.55 * Math.sin(2 * mesh + 0.7) + 0.3 * Math.sin(3 * mesh + 1.9)
      + 0.2 * Math.sin(2 * Math.PI * s.commutatorPhase) + 0.12 * (s.rnd() * 2 - 1);
    // The motor labours as the crank slows: louder on each compression.
    const labour = 0.6 + 0.8 * Math.max(0, 1 - surge + ripple * 0.5);
    ring[(head + i) & RING_MASK] += STARTER.level * s.starter * labour * whine;
  }
}

/**
 * How loud this engine's source is at the reference condition: one cycle of its own
 * events, laid out at their crank angles, measured as the rate of change of the flow —
 * which is what a pipe radiates.
 *
 * @param {Record<string, any>} a
 * @param {number} sampleRate
 * @returns {number}
 */
function referenceLevel(a, sampleRate) {
  const { rpm, evoKpa, portKpa } = LEVEL.reference;
  const cycle = Math.round((120 / rpm) * sampleRate);
  const sum = new Float64Array(cycle);
  const { flow } = exhaustEvent({ geometry: a.geometry, evoKpa, rpm, sampleRate, backKpa: portKpa });
  for (const e of a.events) {
    const start = Math.round((e.angleDeg / 720) * cycle);
    for (let i = 0; i < flow.length; i++) sum[(start + i) % cycle] += flow[i];
  }
  let sq = 0;
  for (let i = 0; i < cycle; i++) {
    const d = sum[i] - sum[(i + cycle - 1) % cycle];
    sq += d * d;
  }
  return SOURCE_GAIN * Math.sqrt(sq / cycle) * (sampleRate / 1000);
}

/**
 * Bring a buffer of exhaust to this engine's level, and part of the way towards the
 * target from wherever the engine is running.
 *
 * @param {Record<string, any>} a
 * @param {Float32Array[]} data one buffer per bank
 * @param {number} sampleRate
 */
function level(a, data, sampleRate) {
  const s = a.stream;
  // The note's level: the rate of change of the source, which is what the pipe radiates.
  let sq = 0;
  let count = 0;
  for (const d of data) {
    let prev = d[0];
    for (let i = 1; i < d.length; i++) { const dv = d[i] - prev; sq += dv * dv; prev = d[i]; count++; }
  }
  const rms = a.norm * Math.sqrt(sq / Math.max(1, count)) * (sampleRate / 1000);
  const seconds = CHUNK / sampleRate;
  const coeff = Math.exp(-seconds / (rms > s.envelope ? LEVEL.attack : LEVEL.release));
  s.envelope = rms + coeff * (s.envelope - rms);
  const follow = s.envelope > 0
    ? clamp(Math.pow(LEVEL.target / s.envelope, LEVEL.amount), LEVEL.minGain, LEVEL.maxGain)
    : LEVEL.maxGain;
  const want = a.norm * follow;
  // Glide across the buffer so the gain never steps.
  const from = s.gain;
  for (const d of data) {
    for (let i = 0; i < d.length; i++) d[i] *= from + ((want - from) * i) / d.length;
  }
  s.gain = want;
}

/**
 * Compute and schedule the stream up to a little ahead of the clock.
 *
 * Unthrottled: call it every engine tick. It keeps its own cursor, so it tolerates being
 * late, and the rhythm never restarts unless it fell so far behind that it has to.
 *
 * @param {Record<string, any>} a
 * @param {AudioContext} ctx
 * @param {{rpm: number, level: number, load: number, audible: boolean, cranking?: boolean,
 *   evoKpa?: number, portKpa?: number, lopeSeverity?: number, covPersistence?: number}} frame
 */
export function schedulePulseExhaust(a, ctx, frame) {
  const s = a.stream;
  const sr = ctx.sampleRate;
  const rpm = safe(frame.rpm, 0, 12000);
  const lvl = safe(frame.level, 0, 4);
  const starterRunning = s.starter > 1e-4;
  if (!frame.audible || !a.geometry || ((rpm < 200 || lvl <= 0.001) && !frame.cranking && !starterRunning)) {
    s.head = -1;
    s.starter = 0;
    return;
  }
  const now = Math.ceil(ctx.currentTime * sr);
  if (s.head < 0 || s.head < now) {
    // Starting, or so late that the clock has passed the stream: begin again just ahead.
    for (const r of s.rings) r.fill(0);
    s.head = now + Math.ceil(0.02 * sr);
    s.next = s.head;
  }
  const f = {
    rpm: Math.max(rpm, 60),
    level: lvl,
    load: safe(frame.load, 0, 1),
    lope: safe(frame.lopeSeverity, 0, 1),
    persistence: safe(frame.covPersistence ?? 0.55, 0, 0.95),
    evoKpa: safe(frame.evoKpa ?? 300, 20, 2000),
    portKpa: safe(frame.portKpa ?? 105, 50, 400),
    cranking: Boolean(frame.cranking),
  };
  const firing = rpm >= 200 && lvl > 0.001;
  const bankCount = Math.max(1, Math.min(2, a.geometry.banks || 1));
  const until = now + Math.ceil(LOOKAHEAD * sr);
  let guard = 0;
  while (s.head < until && guard++ < 64) {
    const end = s.head + CHUNK;
    if (firing) {
      while (s.next < end) s.next += addEvent(a, sr, s.next, f) * sr;
    } else {
      s.next = end;
    }
    addStarter(a, sr, s.head, f);
    const data = [];
    for (let b = 0; b < 3; b++) {
      const d = new Float32Array(CHUNK);
      const ring = s.rings[b];
      for (let i = 0; i < CHUNK; i++) {
        const j = (s.head + i) & RING_MASK;
        d[i] = ring[j];
        ring[j] = 0;
      }
      data.push(d);
    }
    level(a, data.slice(0, bankCount), sr);
    for (let b = 0; b < 3; b++) {
      if (b === 1 && bankCount < 2) continue;
      if (b === 2 && !f.cranking && s.starter < 1e-4) continue;
      const buffer = ctx.createBuffer(1, CHUNK, sr);
      buffer.getChannelData(0).set(data[b]);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(b === 2 ? a.mech : a.banks[b].input);
      try { src.start(s.head / sr); } catch { /* raced the clock */ }
      src.onended = () => { try { src.disconnect(); } catch { /* gone */ } };
    }
    s.head = end;
  }
}

/**
 * Update what the events do not carry, for one frame: the exhaust system when a cat-back
 * goes on or off, knock's rattle and a rich burn's roughness.
 *
 * Everything else the player builds or tunes is already in the events and the pipes:
 * displacement, bore, compression and cam in each event; the pipe, headers, a turbine and
 * the gas temperature in the exhaust's response; timing, boost, load and mixture in the
 * pressure each cylinder opens at.
 *
 * @param {Record<string, any>} a
 * @param {AudioContext} ctx
 * @param {{rpm: number, load: number, rasp: number, richness: number, knock: number,
 *   cranking: boolean, catBack: boolean, audible: boolean}} frame
 */
export function tonePulseExhaust(a, ctx, frame) {
  const t = ctx.currentTime;
  const rpm = safe(frame.rpm, 0, 12000);
  const richness = safe(frame.richness, -0.4, 0.8);
  const knock = safe(frame.knock, 0, 1);
  const catBack = Boolean(frame.catBack);
  if (catBack !== a.catBack) {
    a.catBack = catBack;
    refreshResponse(a, ctx);
  }
  a.gateLfo.frequency.setTargetAtTime(Math.max(6, (rpm / 60) * (a.cyl / 2)), t, 0.02);
  // Knock is a shock wave ringing the cylinder at its own acoustic modes — 5-8 kHz for a
  // road engine's bore — and it rattles through the block, not down the pipe.
  a.noiseGain.gain.setTargetAtTime(
    frame.audible && !frame.cranking ? Math.max(0, richness) * 0.02 + knock * 0.08 : 0, t, 0.05);
}

/**
 * Stop the note now. Buffers already handed to the clock cannot be unscheduled, so the bus
 * is pinned to zero and the stream dropped; it starts clean on the next frame.
 *
 * @param {Record<string, any>} a
 * @param {AudioContext} ctx
 */
export function silencePulseExhaust(a, ctx) {
  const t = ctx.currentTime;
  const kill = (p) => { try { p.cancelScheduledValues(t); p.setValueAtTime(0, t); } catch { /* closed */ } };
  kill(a.bus.gain);
  kill(a.mech.gain);
  kill(a.noiseGain.gain);
  a.stream.head = -1;
  a.stream.starter = 0;
}

/**
 * Let the note run again after a `silencePulseExhaust`.
 *
 * @param {Record<string, any>} a
 * @param {AudioContext} ctx
 */
export function wakePulseExhaust(a, ctx) {
  try {
    a.bus.gain.setTargetAtTime(BUS_GAIN, ctx.currentTime, 0.02);
    a.mech.gain.setTargetAtTime(1, ctx.currentTime, 0.02);
  } catch { /* noop */ }
}
