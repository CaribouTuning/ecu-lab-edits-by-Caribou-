/**
 * The exhaust note: every firing event computed from the engine, then played through the
 * exhaust system the reference build (v4.8, the single-file prototype) voiced.
 *
 * WHERE THE SOUND COMES FROM
 *
 * Each time a cylinder's exhaust valve opens, `exhaustEvent` (src/sim/acoustics.js) works
 * out the gas leaving it, sample by sample: the blowdown through a valve opening along
 * the cam's flank, choked and then subsonic, and then the piston pushing out what is left.
 * A tailpipe radiates the RATE OF CHANGE of the flow leaving it, so that derivative is the
 * event's sound, and the jet's turbulence rides on it — loud while the gas leaves near the
 * speed of sound, silent once the piston is only pushing. Nothing here is drawn by hand:
 * the pressure the cylinder opens at is the tune (timing, boost, load, fuelling), the
 * valve is the bore, the volume being emptied is the displacement and the compression,
 * and how the event is spread in time is the cam and the engine speed.
 *
 * WHY THAT SOUNDS LIKE AN ENGINE AND A LOOP DOES NOT
 *
 * The version before this played one pre-rendered engine cycle on a loop above about 90
 * events a second, and every pulse opened with a sine "thump" at a fixed pitch. Both are
 * what a synthesiser sounds like. Measured against recordings of real engines — a V8 at
 * idle, a four at idle and on the rev limiter — one cycle of a real engine resembles the
 * next with a correlation of 0.3 to 0.5, and a third to three quarters of its energy is
 * in harmonic lines; the loop scored 0.8 to 0.98 on both. A real engine never repeats:
 *
 *   1. COMBUSTION SCATTERS. The pressure each cylinder opens at varies cycle to cycle
 *      (`combustionScatter`), more at light load and far more with a lumpy cam, and one
 *      cycle's weakness carries into the next (`covPersistence`).
 *   2. CYLINDERS DIFFER. A fixed few-percent spread in charge between cylinders, the same
 *      every cycle, which is what puts lines between the firing harmonics.
 *   3. THE CRANK WOBBLES. A strong cycle speeds the crank up, so the next event arrives a
 *      touch early; a weak one lets it sag.
 *
 * WHERE THE PULSES FALL is still `firingEvents`: a cross-plane V8's banks are offset, so
 * its events are unevenly spaced, and that unevenness is the rumble. Every event is
 * computed at its own crank angle, at every engine speed — there is no second layer that
 * takes over at high revs, and so nothing to crossfade.
 *
 * HOW IT REACHES THE SPEAKER
 *
 * Events are laid into a ring of samples as they are computed — each overlaps the next at
 * speed — and the ring is played out in short buffers scheduled back to back, a little
 * ahead of the clock. The rest is the reference's exhaust system: two band resonances for
 * the body of it, a lowpass that opens with load, and a delay line standing in for the
 * pipe. A faint noise gated at the firing rate carries the starter's grind and knock's
 * rattle.
 */

import { ACOUSTIC, combustionScatter, exhaustEvent } from '../../sim/acoustics.js';

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

/** Ring of pending samples; a power of two, and longer than the slowest event. */
const RING = 1 << 16;
const RING_MASK = RING - 1;

/** Fixed trim on everything the events feed, before the layout's own. */
const BUS_GAIN = 2.3;

/**
 * Converts the radiated source, kg/s per second, into signal. Fixed for every engine: a
 * bigger cylinder moving more gas is louder because it is, not because it was turned up.
 */
const SOURCE_GAIN = 0.0024;

/**
 * Converts jet turbulence into signal. The turbulence goes as the flow times the square of
 * the jet's Mach number: nothing while the piston is only pushing, the most while the
 * blowdown is choked. Set against the recordings: a real idle is half noise.
 */
const JET_GAIN = 3.2;

/**
 * Converts plain flow noise into signal. Gas forced through a valve seat and down a pipe is
 * turbulent at any speed, not just near sonic, so while the piston pushes the rest out the
 * event still rushes rather than falling silent. It goes as the flow, and it is what fills
 * the gaps between an idling engine's events: a real idle has none.
 */
const FLOW_NOISE = 4;

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
 * THE VOICING, the same for every layout, and it is the reference's six-cylinder voicing.
 *
 * v4.8 gave the V8 and the four their own resonance, underlay and trim, and with the
 * reference's output clipping, neither mattered much. Without the clipping those two came
 * out quiet and synthetic while the six still sounded right, so every layout gets the
 * six's. What makes a V8 a V8 is untouched: its firing rhythm, its body pitch, its
 * displacement and its pipe.
 *
 * One number is not the reference's: the lowpass's resonance. v4.8 ran it at a Q of 6,
 * which on its narrow sine-and-crack pulses was a gentle lift. Fed a real exhaust event,
 * which carries energy right across the band, a Q of 6 stands a narrow peak up at the
 * corner — the resonant sweep of a synthesiser filter, and heard as exactly that. A
 * muffler is a broad absorber, not a tuned one.
 */
const VOICE = {
  toneQ: 1.2, bodyQ: 3.6, body2Q: 5.0, body2Gain: 0.34, busTrim: 1.47, pipeOut: 0.88,
};

/**
 * THE MUFFLER'S INSERTION LOSS, as a shelf on everything the events feed.
 *
 * A pipe radiates the rate of change of the flow leaving it, which tilts every event
 * towards the treble, and a packed muffler is there to take that treble back off: glass
 * pack and steel wool absorb the top end and leave the boom. Without it an engine at speed
 * came out fizzy — its 4 kHz band level with its loudest, where recordings of real engines
 * sit 6 to 15 dB down. A straight-through cat-back absorbs less; a turbine in the path,
 * which takes work out of the pulse and smears what is left, absorbs more.
 */
const MUFFLER = { cornerHz: 1000, stockDb: -8, catBackDb: -4, turbineDb: -6 };

/**
 * Where the lowpass's corner starts before speed and load open it, Hz. The reference's
 * 300 Hz suited pulses that carried nothing above a few hundred hertz but their crack; a
 * real event's edge and rush reach well into the kilohertz, and a real idle is heard
 * there — recordings of idling engines sit within about 10 dB of flat to 4 kHz.
 */
const TONE_BASE_HZ = 1200;

/** Where each layout's body resonance sits, Hz — the one voicing number that is its own. */
const BODY_HZ = { 4: 420, 6: 320, 8: 240 };

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
 * Build the note.
 *
 * @param {AudioContext} ctx
 * @returns {Record<string, any>}
 */
export function createPulseExhaust(ctx) {
  const sum = ctx.createGain();
  sum.gain.value = 1;
  // A DC block. Every event pushes a mass of gas out and none back, and a flow's rate of
  // change integrates to nothing, so in principle there is no offset — but a cut-off
  // event, or a fuel cut that pulls gas the wrong way, can leave one. Below the lowest
  // note the engine makes, so nothing else changes.
  const dcBlock = ctx.createBiquadFilter();
  dcBlock.type = 'highpass';
  dcBlock.frequency.value = 12;
  dcBlock.Q.value = 0.7;
  const out = ctx.createGain();
  out.gain.value = 1;
  sum.connect(dcBlock);
  dcBlock.connect(out);

  // The system: an overall lowpass that opens with load, two band resonances, and the pipe.
  const tone = ctx.createBiquadFilter();
  tone.type = 'lowpass'; tone.frequency.value = 900; tone.Q.value = 2;
  const body = ctx.createBiquadFilter();
  body.type = 'bandpass'; body.frequency.value = 320; body.Q.value = 0.9;
  const bodyGain = ctx.createGain(); bodyGain.gain.value = 0.8;
  const body2 = ctx.createBiquadFilter();
  body2.type = 'bandpass'; body2.frequency.value = 900; body2.Q.value = 1.6;
  const body2Gain = ctx.createGain(); body2Gain.gain.value = 0.3;
  tone.connect(sum);
  body.connect(bodyGain); bodyGain.connect(sum);
  body2.connect(body2Gain); body2Gain.connect(sum);

  // The pipe: a pulse travels down it, loses its highs at the walls, reflects and comes
  // back. Delay sets the pipe's fundamental, f = 1 / (2 x delay).
  const pipeDelay = ctx.createDelay(0.05);
  pipeDelay.delayTime.value = 0.0116;
  const pipeFeedback = ctx.createGain(); pipeFeedback.gain.value = 0.55;
  const pipeDamp = ctx.createBiquadFilter();
  pipeDamp.type = 'lowpass'; pipeDamp.frequency.value = 1800;
  const pipeOut = ctx.createGain(); pipeOut.gain.value = 0;
  pipeDelay.connect(pipeDamp); pipeDamp.connect(pipeFeedback); pipeFeedback.connect(pipeDelay);
  pipeDamp.connect(pipeOut); pipeOut.connect(sum);

  // Everything the events feed, through the muffler.
  const bus = ctx.createGain(); bus.gain.value = BUS_GAIN;
  const muffler = ctx.createBiquadFilter();
  muffler.type = 'highshelf';
  muffler.frequency.value = MUFFLER.cornerHz;
  muffler.gain.value = MUFFLER.stockDb;
  const busTrim = ctx.createGain(); busTrim.gain.value = VOICE.busTrim;
  bus.connect(muffler); muffler.connect(busTrim);
  busTrim.connect(tone); busTrim.connect(body); busTrim.connect(body2); busTrim.connect(pipeDelay);

  // The starter's grind and knock's rattle, gated at the firing rate so they arrive in
  // pulses rather than as hiss — as the reference's did.
  const noiseLength = 2 * ctx.sampleRate;
  const noiseBuffer = ctx.createBuffer(1, noiseLength, ctx.sampleRate);
  const nd = noiseBuffer.getChannelData(0);
  for (let i = 0; i < noiseLength; i++) nd[i] = (Math.random() * 2 - 1) * 0.35;
  const noise = ctx.createBufferSource(); noise.buffer = noiseBuffer; noise.loop = true;
  const noiseGain = ctx.createGain(); noiseGain.gain.value = 0;
  const gateLfo = ctx.createOscillator(); gateLfo.type = 'sawtooth'; gateLfo.frequency.value = 40;
  const gateDepth = ctx.createGain(); gateDepth.gain.value = 0.03;
  gateLfo.connect(gateDepth); gateDepth.connect(noiseGain.gain);
  noise.connect(noiseGain); noiseGain.connect(tone);

  for (const src of [noise, gateLfo]) {
    try { src.start(); } catch { /* a suspended context starts it on resume */ }
  }

  return {
    out, sum, dcBlock, bus, muffler, busTrim, tone, body, bodyGain, body2, body2Gain,
    pipeDelay, pipeFeedback, pipeDamp, pipeOut,
    noiseGain, gateLfo,
    /** @type {Record<string, any>|null} the `exhaustGeometry` the events are computed in */
    geometry: null,
    /** @type {{angleDeg: number, bank?: number}[]} */
    events: [{ angleDeg: 0 }],
    /** Each cylinder's fixed share of the charge, around 1. */
    trims: [1],
    cyl: 6,
    displacementL: 3.0,
    /** Tailpipe bore in inches and compression ratio, from the geometry. */
    pipeDiaIn: 2.5,
    compression: 10.3,
    stream: {
      ring: new Float32Array(RING),
      /** Absolute sample the next scheduled buffer starts at; -1 when stopped. */
      head: -1,
      /** Absolute sample, fractional, where the next exhaust event starts. */
      next: 0,
      index: 0,
      /** The combustion scatter's running state: this cycle's deviation, in CoVs. */
      walk: 0,
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
 * Point the note at a new build.
 *
 * @param {Record<string, any>} a
 * @param {AudioContext} _ctx
 * @param {Record<string, any>} geometry an `exhaustGeometry`
 * @param {string} key a `geometryKey` for it
 */
export function setPulseExhaustGeometry(a, _ctx, geometry, key) {
  if (key === a.geomKey) return;
  a.geomKey = key;
  a.geometry = geometry;
  if (geometry.events && geometry.events.length) a.events = geometry.events;
  a.cyl = Math.max(1, geometry.cyl || a.cyl);
  const swept = geometry.sweptM3 ?? 5e-4;
  a.displacementL = safe(swept * 1000 * a.cyl, 0.5, 12);
  a.compression = safe(swept / Math.max(1e-7, geometry.clearanceM3 ?? swept / 9.3) + 1, 6, 16);
  // The tailpipe menu arrives as an area; the reference's voicing is written in inches.
  a.pipeDiaIn = safe(2 * Math.sqrt((geometry.tailArea ?? 0.0032) / Math.PI) / 0.0254, 1.5, 5);

  // The cylinders' spread is the engine's own, so it is seeded from the parts that make it
  // and does not change when only the gas temperature does.
  const trimKey = `${a.events.map((e) => e.angleDeg.toFixed(1)).join(',')}|${swept.toFixed(7)}`;
  if (trimKey !== a.trimKey) {
    a.trimKey = trimKey;
    const rnd = random(hash(trimKey));
    a.trims = a.events.map(() => 1 + ACOUSTIC.CYLINDER_SPREAD * gauss(rnd));
  }
}

/**
 * Compute one exhaust event into the ring.
 *
 * @param {Record<string, any>} a
 * @param {number} sampleRate
 * @param {number} at absolute sample it starts at
 * @param {Record<string, number>} f the frame, already made safe
 * @returns {number} the gap to the next event, seconds
 */
function addEvent(a, sampleRate, at, f) {
  const s = a.stream;
  const n = a.events.length;
  const k = s.index % n;
  const here = a.events[k];
  const next = a.events[(k + 1) % n];

  // This cycle's combustion, carrying some of the last one's.
  const rho = f.persistence;
  s.walk = rho * s.walk + Math.sqrt(1 - rho * rho) * gauss(s.rnd);
  const cov = combustionScatter(f.load, f.lope);
  let evo = f.evoKpa * (a.trims[k] ?? 1) * (1 + cov * s.walk);
  if (f.lope > 0 && s.rnd() < f.lope * MISFIRE_PER_SEVERITY) evo *= MISFIRE_EVO;
  evo = Math.max(20, evo);

  const { flow, jet } = exhaustEvent({
    geometry: a.geometry, evoKpa: evo, rpm: f.rpm, sampleRate, backKpa: f.portKpa,
  });
  const ring = s.ring;
  const src = SOURCE_GAIN * sampleRate * f.level;
  const turb = JET_GAIN * f.level;
  const rush = FLOW_NOISE * f.level;
  let prev = 0;
  const start = Math.round(at);
  for (let i = 0; i < flow.length; i++) {
    const q = flow[i];
    const m = jet[i];
    ring[(start + i) & RING_MASK] += src * (q - prev)
      + (turb * q * m * m + rush * Math.max(0, q)) * (s.rnd() * 2 - 1);
    prev = q;
  }
  // The valve shuts on whatever is still moving; let that last step out too.
  ring[(start + flow.length) & RING_MASK] -= src * prev;

  let gapDeg = next.angleDeg - here.angleDeg;
  if (gapDeg <= 0) gapDeg += 720;
  const gap = (gapDeg / (6 * f.rpm)) * (1 - CRANK_WOBBLE * cov * s.walk);
  a.log.push({ at: start / sampleRate, cylinder: k, evoKpa: evo, gapSeconds: gap });
  if (a.log.length > 256) a.log.splice(0, a.log.length - 256);
  s.index++;
  return gap;
}

/**
 * Compute and schedule the stream up to a little ahead of the clock.
 *
 * Unthrottled: call it every engine tick. It keeps its own cursor, so it tolerates being
 * late, and the rhythm never restarts unless it fell so far behind that it has to.
 *
 * @param {Record<string, any>} a
 * @param {AudioContext} ctx
 * @param {{rpm: number, level: number, load: number, overlapDeg?: number, audible: boolean,
 *   evoKpa?: number, portKpa?: number, lopeSeverity?: number, covPersistence?: number}} frame
 */
export function schedulePulseExhaust(a, ctx, frame) {
  const s = a.stream;
  const sr = ctx.sampleRate;
  const rpm = safe(frame.rpm, 0, 12000);
  const level = safe(frame.level, 0, 4);
  if (rpm < 200 || level <= 0.001 || !frame.audible || !a.geometry) {
    s.head = -1;
    return;
  }
  const now = Math.ceil(ctx.currentTime * sr);
  if (s.head < 0 || s.head < now) {
    // Starting, or so late that the clock has passed the stream: begin again just ahead.
    s.ring.fill(0);
    s.head = now + Math.ceil(0.02 * sr);
    s.next = s.head;
  }
  const f = {
    rpm,
    level,
    load: safe(frame.load, 0, 1),
    lope: safe(frame.lopeSeverity, 0, 1),
    persistence: safe(frame.covPersistence ?? 0.55, 0, 0.95),
    evoKpa: safe(frame.evoKpa ?? 300, 20, 2000),
    portKpa: safe(frame.portKpa ?? 105, 50, 400),
  };
  const until = now + Math.ceil(LOOKAHEAD * sr);
  let guard = 0;
  while (s.head < until && guard++ < 64) {
    const end = s.head + CHUNK;
    while (s.next < end) s.next += addEvent(a, sr, s.next, f) * sr;
    const buffer = ctx.createBuffer(1, CHUNK, sr);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < CHUNK; i++) {
      const j = (s.head + i) & RING_MASK;
      data[i] = s.ring[j];
      s.ring[j] = 0;
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(a.bus);
    try { src.start(s.head / sr); } catch { /* raced the clock */ }
    src.onended = () => { try { src.disconnect(); } catch { /* gone */ } };
    s.head = end;
  }
}

/**
 * Voice the note for one frame, with the reference's formulas.
 *
 * Everything the player builds or tunes is audible here: displacement deepens it, a bigger
 * pipe opens it up, a cat-back or headers let it ring, retarded timing makes it rasp,
 * compression sharpens the crack, a rich mixture thickens the roughness, knock rattles.
 *
 * @param {Record<string, any>} a
 * @param {AudioContext} ctx
 * @param {{rpm: number, load: number, rasp: number, richness: number, knock: number,
 *   cranking: boolean, catBack: boolean, audible: boolean}} frame
 */
export function tonePulseExhaust(a, ctx, frame) {
  const t = ctx.currentTime;
  const rpm = safe(frame.rpm, 0, 12000);
  const load = safe(frame.load, 0, 1);
  const rasp = safe(frame.rasp, 0, 1);
  const richness = safe(frame.richness, -0.4, 0.8);
  const knock = safe(frame.knock, 0, 1);
  const cyl = a.cyl;

  const fire = Math.max(6, (rpm / 60) * (cyl / 2));
  // Above 1 for an engine smaller than 3.5 litres, below it for a bigger one. The reference
  // documented "a bigger engine moves more gas per pulse, so the resonant body sits lower
  // and the note is deeper" and then divided by this where it meant to multiply, which put
  // a 2-litre four's body and tone BELOW a 6-litre V8's: the four came out dark and boomy
  // and the V8 bright and thin, each the opposite of the real thing. A 3.5-litre six is
  // exactly 1 either way, which is why the six was the one layout that sounded right.
  const dispDepth = clamp(3.5 / Math.max(a.displacementL, 1.2), 0.6, 1.6);
  const dia = a.pipeDiaIn;
  const diaOpen = 0.72 + (dia - 2.5) * 0.20;
  const crBite = clamp((a.compression - 10.3) * 0.06, -0.2, 0.25);

  a.gateLfo.frequency.setTargetAtTime(fire, t, 0.02);

  a.body.frequency.setTargetAtTime(safe((BODY_HZ[cyl] ?? BODY_HZ[6]) * dispDepth, 60, 2000), t, 0.15);
  a.tone.frequency.setTargetAtTime(
    safe((TONE_BASE_HZ + fire * 7 + load * 2400) * diaOpen * dispDepth * (1 + rasp * 0.45 + crBite), 80, 18000), t, 0.05);
  a.tone.Q.setTargetAtTime(VOICE.toneQ * (1 + crBite), t, 0.1);
  a.body.Q.setTargetAtTime(VOICE.bodyQ, t, 0.15);
  a.body2.Q.setTargetAtTime(VOICE.body2Q, t, 0.15);
  a.body2Gain.gain.setTargetAtTime((VOICE.body2Gain + rasp * 0.18) * (0.35 + 0.65 * load), t, 0.12);
  a.busTrim.gain.setTargetAtTime(VOICE.busTrim, t, 0.15);
  a.muffler.gain.setTargetAtTime((frame.catBack ? MUFFLER.catBackDb : MUFFLER.stockDb)
    + (a.geometry?.turboFitted ? MUFFLER.turbineDb : 0), t, 0.15);
  a.bodyGain.gain.setTargetAtTime(safe((0.5 + (dia - 2.5) * 0.22) / dispDepth, 0, 2), t, 0.15);
  a.body2.frequency.setTargetAtTime(safe((720 + fire * 4) * diaOpen * (1 + rasp * 0.3), 100, 12000), t, 0.1);

  // The pipe, tied to the hardware: a bigger engine and a bigger pipe are a longer, larger
  // system, so the fundamental drops. A more open system reflects less at the outlet and
  // rings less, which is why a straight-through exhaust sounds opened up, not boomy.
  const pipeHz = clamp(105 - (a.displacementL - 2.0) * 9 - (dia - 2.5) * 8, 52, 130);
  a.pipeDelay.delayTime.setTargetAtTime(1 / (2 * pipeHz), t, 0.15);
  // How hard the pipe rings depends on how much gas is moving through it: damped at idle,
  // ringing under load — the "coming on song" effect.
  const flow = clamp(0.18 + load * 0.62 + (rpm / 7500) * 0.30, 0.14, 1);
  a.pipeFeedback.gain.setTargetAtTime(
    clamp(0.30 + flow * 0.20 - (dia - 2.5) * 0.05 - (frame.catBack ? 0.04 : 0), 0.16, 0.46), t, 0.12);
  a.pipeDamp.frequency.setTargetAtTime(420 + flow * (900 + diaOpen * 1200) + rasp * 500, t, 0.1);
  a.pipeOut.gain.setTargetAtTime(
    frame.audible ? VOICE.pipeOut * (0.45 + 0.55 * flow) : 0, t, 0.12);

  // The starter's grind while cranking; otherwise only what the events do not already
  // carry — a rich mixture's rougher burn and knock's rattle. The combustion roughness
  // itself is in the events, as the jet's turbulence and the cycles' scatter.
  a.noiseGain.gain.setTargetAtTime(frame.cranking ? 0.12
    : Math.max(0, richness) * 0.03 + knock * 0.06, t, 0.05);
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
  kill(a.pipeOut.gain);
  kill(a.noiseGain.gain);
  a.stream.head = -1;
}

/**
 * Let the note run again after a `silencePulseExhaust`.
 *
 * @param {Record<string, any>} a
 * @param {AudioContext} ctx
 */
export function wakePulseExhaust(a, ctx) {
  try { a.bus.gain.setTargetAtTime(BUS_GAIN, ctx.currentTime, 0.02); } catch { /* noop */ }
}
