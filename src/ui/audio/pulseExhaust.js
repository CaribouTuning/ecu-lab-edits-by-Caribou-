/**
 * The exhaust note, synthesised from blowdown physics and pipe acoustics.
 *
 * WHAT MAKES AN EXHAUST NOTE, PHYSICALLY
 *
 * When the exhaust valve cracks, the cylinder is still at several atmospheres. Gas escapes
 * through a small hole at very high speed — choked, for most of the useful rev range — and
 * the cylinder empties on an exponential decay. That pressure pulse is the EXCITATION. It
 * is not a tone; it is close to a one-sided pressure step, and its shape is set by how fast
 * the cylinder empties:
 *
 *     tau = V_cylinder / (c * A_valve * Cd)      the blowdown time constant
 *     PR  = p_EVO / p_ambient                    what is driving the flow
 *
 * A big cylinder behind a small valve empties slowly, so its pulse is long and its energy
 * sits low. A small cylinder behind a proportionally large valve cracks. That, not a
 * voicing knob, is why a lazy big-bore thumps and a small four barks.
 *
 * The pulse then runs into the pipes, and THE PIPES MAKE THE PITCH. A primary is closed at
 * the valve and open into the collector, so it rings at its quarter wave; the collector and
 * tailpipe together are open at the mouth and ring at their half wave:
 *
 *     f_primary = c / (4 * L_primary)
 *     f_tail    = c / (2 * (L_collector + L_tail))
 *
 * and c is the speed of sound IN EXHAUST GAS — around 600 m/s, not 343. Every term in all
 * of that already exists in `exhaustGeometry` and `acousticDrive`.
 *
 * WHY THAT MATTERS MORE THAN IT SOUNDS
 *
 * It means the note is not authored. Anything that would change how a real engine sounds
 * changes it here, through the same mechanism it changes it in the metal:
 *
 *   retard the timing   → the burn is still going at valve opening → gas temperature rises
 *                         → c rises → every resonance rises and the note hardens
 *   fit headers         → L_primary changes → the header ring moves
 *   open the exhaust    → less reflection at the mouth → it rings less
 *   bigger tailpipe     → more radiated, less reflected, less top end lost
 *   more boost or load  → p_EVO up → a harder pulse with more harmonics
 *   longer stroke       → V_cylinder up → tau up → a deeper, lazier pulse
 *   a turbine in it     → the geometry reports it absorbing → it damps
 *
 * None of those are special-cased below. They arrive as numbers and the model responds.
 *
 * WHAT IS SCHEDULED RATHER THAN SOLVED
 *
 * WHERE the pulses fall. One per firing event, at the crank angles `firingEvents` gives,
 * because that is cheap and exact. A cross-plane V8's banks are offset, so its pulses are
 * unevenly spaced, and that unevenness is the rumble. Nothing here describes how a layout
 * sounds; the layout's firing order is played and the sound follows.
 *
 * Above roughly 200 events/sec the ear stops resolving individual pulses, so a pre-rendered
 * cycle — the same excitation, the same spacing — fades in as the scheduler fades out.
 * Crossfade, never decimate: playing fewer, louder pulses up top sounds like hitting a tin
 * can, because that is what it is.
 */

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

/** Ambient pressure, kPa. What the cylinder is blowing down towards. */
const BARO_KPA = 101.325;

/** Gas constant for air, J/(kg·K). Burnt gas is close enough at these temperatures. */
const R_GAS = 287;

/**
 * Pressure ratio above which flow through the valve chokes.
 *
 * ((gamma+1)/2)^(gamma/(gamma-1)) for burnt gas at gamma 1.3. Past it the gas leaves at the
 * local speed of sound however much more pressure is behind it, so the jet noise stops
 * growing with pressure and the pulse sharpens instead of getting louder. That transition
 * is audible — it is part of the difference between a big engine loafing and one loaded.
 */
const CHOKED_PR = 1.832;

/**
 * Blowdown time constants the excitation is rendered at, seconds.
 *
 * Rendering a buffer every frame would be absurd; rendering one per engine would stop the
 * pulse responding to gas temperature, which is one of the things that has to respond.
 * These bracket a large slow cylinder to a small quick one, the nearest is picked, and the
 * pulse is resampled the rest of the way — which is exact for an exponential.
 */
const TAU_STEPS = [0.0004, 0.0007, 0.0011, 0.0016, 0.0023, 0.0033];

/** How much of the excitation is jet turbulence rather than pressure, choked and not. */
const JET_CHOKED = 0.42;
const JET_SOFT = 0.16;

/** Engine speed the looped cycle is rendered at. Playback rate carries it elsewhere. */
const LOOP_REF_RPM = 3000;

/** How many loop variants to crossfade between, so the top end is not a held note. */
const LOOP_VARIANTS = 2;

/** Events per second over which the scheduler hands over to the loop. */
const FUSE_START = 90;
const FUSE_SPAN = 110;

/**
 * Output staging.
 *
 * The note leaves by four parallel paths — the primary's ring, the tail's ring, the body
 * resonance and the direct pulse — and they SUM. An earlier version gave each of them near
 * unity and multiplied the lot by an enthusiastic bus gain, which put about 20 dB more into
 * the output than it could carry: half of every sample hard-clipped and the crest factor
 * fell to 2 dB. A pulse train flattened to 2 dB of crest is a square wave and sounds like
 * one. These are set so the loudest thing the model can make peaks near -20 dBFS here,
 * which the app's limiter and make-up gain bring to about -5.
 */
const BUS_GAIN = 1.0;
const OUT_TRIM = 0.055;

/**
 * One blowdown pulse.
 *
 * A fast rise as the valve cracks, then the cylinder emptying on `exp(-t/tau)`, with jet
 * noise mixed in proportionally to how hard the gas is being pushed through the seat. The
 * rise is a fraction of tau rather than instant because a valve takes real time to lift,
 * and an instant edge is a click rather than a thump.
 *
 * Deliberately NOT a tone. This is the excitation; the tubes make the pitch. Baking a pitch
 * in here is exactly what makes a synthesised engine sound synthesised, because the baked
 * pitch does not move when the pipes do.
 *
 * @param {BaseAudioContext} ctx
 * @param {number} tau blowdown time constant, seconds
 * @param {number} jet fraction that is turbulence rather than pressure
 * @returns {AudioBuffer}
 */
function renderBlowdown(ctx, tau, jet) {
  // Six time constants is 0.2% of the peak — past that it is silence with a cost.
  const length = Math.max(8, Math.floor(ctx.sampleRate * tau * 6));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  const rise = tau / 8;
  // The turbulence is made by this flow, so it cannot outlast it or hold detail finer than
  // it: the noise is lowpassed by the same time constant the pressure decays on.
  const a = Math.exp(-1 / (ctx.sampleRate * tau * 0.35));
  let smoothed = 0;
  for (let i = 0; i < length; i++) {
    const t = i / ctx.sampleRate;
    const env = Math.exp(-t / tau) * (1 - Math.exp(-t / rise));
    smoothed = a * smoothed + (1 - a) * (Math.random() * 2 - 1);
    data[i] = env * (1 - jet) + smoothed * env * jet * 2.2;
  }
  return buffer;
}

/**
 * One engine cycle of blowdown pulses, rendered to a seamless loop.
 *
 * The events sit at their real crank angles, so the layout's rhythm is inside the buffer
 * and survives resampling. Seeded, so a rebuild is bit-identical: variation comes from
 * crossfading between variants at irregular intervals, never from anything baked in at the
 * loop period, because anything periodic at the loop rate is heard as a woosh.
 *
 * @param {BaseAudioContext} ctx
 * @param {{angleDeg: number}[]} events
 * @param {number} tau
 * @param {number} jet
 * @param {number} variant
 * @returns {AudioBuffer}
 */
function renderCycle(ctx, events, tau, jet, variant) {
  const cycleSeconds = 120 / LOOP_REF_RPM;
  const length = Math.max(1, Math.round(ctx.sampleRate * cycleSeconds));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let seed = 12345 + variant * 7919;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  // Real cycles are not identical: combustion varies, so the pressure at valve opening
  // varies. A few percent is enough that the loop does not read as one repeated event.
  const spread = 1 + (variant - (LOOP_VARIANTS - 1) / 2) * 0.06;
  const rise = tau / 8;
  const eventLength = Math.min(length, Math.floor(ctx.sampleRate * tau * 6));
  const a = Math.exp(-1 / (ctx.sampleRate * tau * 0.35));
  let smoothed = 0;
  for (const event of events) {
    const start = Math.floor((event.angleDeg / 720) * cycleSeconds * ctx.sampleRate);
    for (let i = 0; i < eventLength; i++) {
      // Wrapping rather than truncating is what makes the loop point seamless: a pulse near
      // the end of the cycle finishes at the start of it, as it would played end to end.
      const j = (start + i) % length;
      const t = i / ctx.sampleRate;
      const env = Math.exp(-t / tau) * (1 - Math.exp(-t / rise)) * spread;
      smoothed = a * smoothed + (1 - a) * (rnd() * 2 - 1);
      data[j] += env * (1 - jet) + smoothed * env * jet * 2.2;
    }
  }
  return buffer;
}

/**
 * A resonant tube, as a damped delay line.
 *
 * A pulse travels its length, loses its highs to the walls, reflects off the impedance step
 * at the far end and comes back. That is all a delay with filtered feedback is, and it is
 * the difference between a filtered buzz and something that came out of a pipe.
 *
 * @param {BaseAudioContext} ctx
 * @param {number} maxDelay longest delay the line must support, seconds
 * @returns {Record<string, any>}
 */
function makeTube(ctx, maxDelay) {
  const delay = ctx.createDelay(maxDelay);
  const feedback = ctx.createGain();
  feedback.gain.value = 0.4;
  const damp = ctx.createBiquadFilter();
  damp.type = 'lowpass';
  damp.frequency.value = 2200;
  const out = ctx.createGain();
  out.gain.value = 0.4;
  delay.connect(damp);
  damp.connect(feedback);
  feedback.connect(delay);
  damp.connect(out);
  return { delay, feedback, damp, out };
}

/**
 * The blowdown time constant and jet fraction for a given state.
 *
 * `tau = V / (c * A * Cd)`: the time a volume takes to empty through an effective area at
 * the local speed of sound. Every term is a real measured property of the engine, which is
 * the point — change the stroke, the valve or the gas temperature and the pulse changes
 * shape by itself.
 *
 * @param {Record<string, any>} geometry an `exhaustGeometry`
 * @param {number} evoKpa cylinder pressure when the exhaust valve opens
 * @param {number} gasTempK exhaust gas temperature at the port
 * @returns {{tau: number, jet: number, pressureRatio: number}}
 */
export function blowdown(geometry, evoKpa, gasTempK) {
  const volume = Math.max(1e-6, (geometry.sweptM3 ?? 5e-4) + (geometry.clearanceM3 ?? 5e-5));
  const area = Math.max(1e-5, (geometry.valveArea ?? 1e-3) * (geometry.valveCd ?? 0.7));
  const gamma = geometry.gamma ?? 1.3;
  const speed = Math.sqrt(gamma * R_GAS * Math.max(300, gasTempK));
  const tau = safe(volume / (speed * area), 0.0002, 0.006);
  const pressureRatio = safe(Math.max(1, evoKpa) / BARO_KPA, 1, 12);
  const jet = pressureRatio >= CHOKED_PR
    ? JET_CHOKED
    : JET_SOFT + (JET_CHOKED - JET_SOFT) * ((pressureRatio - 1) / (CHOKED_PR - 1));
  return { tau, jet, pressureRatio };
}

/**
 * Build the exhaust.
 *
 * @param {AudioContext} ctx
 * @returns {Record<string, any>}
 */
export function createPulseExhaust(ctx) {
  const bus = ctx.createGain();
  bus.gain.value = BUS_GAIN;

  // The two tubes that make the pitch. The primary is short and rings high — that is the
  // hard edge a set of headers gives an engine. The tail is long and rings low, and is most
  // of what a bystander hears.
  const primary = makeTube(ctx, 0.02);
  const tail = makeTube(ctx, 0.08);

  // Everything between the two rings that is not a clean mode: the collector volume, the
  // muffler's chambers, the body of the car around it.
  const body = ctx.createBiquadFilter();
  body.type = 'bandpass';
  body.frequency.value = 220;
  body.Q.value = 0.8;
  const bodyGain = ctx.createGain();
  bodyGain.gain.value = 0.30;

  // Radiation from the mouth. A pipe radiates its highs far better than its lows, so what a
  // listener hears outside is brighter than what is inside the pipe.
  const mouth = ctx.createBiquadFilter();
  mouth.type = 'highshelf';
  mouth.frequency.value = 900;
  mouth.gain.value = 3;

  // A little of the raw blowdown goes straight out: the mouth radiates the pulse itself,
  // not only what the tubes did with it.
  const direct = ctx.createGain();
  direct.gain.value = 0.18;

  const out = ctx.createGain();
  out.gain.value = OUT_TRIM;

  bus.connect(primary.delay);
  bus.connect(tail.delay);
  bus.connect(body);
  bus.connect(direct);
  primary.out.connect(mouth);
  tail.out.connect(mouth);
  body.connect(bodyGain);
  bodyGain.connect(mouth);
  direct.connect(mouth);
  mouth.connect(out);

  return {
    out, bus, primary, tail, body, bodyGain, mouth, direct,
    /** @type {{src: AudioBufferSourceNode, gain: GainNode}[]} */
    loops: [],
    /** @type {{angleDeg: number}[]} */
    events: [{ angleDeg: 0 }],
    cyl: 6,
    /** The rendered excitation, and the physics it was rendered for. */
    pulse: null,
    pulseTau: TAU_STEPS[2],
    tau: TAU_STEPS[2],
    jet: JET_SOFT,
    pressureRatio: 1.6,
    /** @type {Record<string, any>|null} */
    geometry: null,
    nextPulse: 0,
    eventIndex: 0,
    blend: new Array(LOOP_VARIANTS).fill(1),
    nextSwap: 0,
    geomKey: '',
    tauKey: -1,
  };
}

/**
 * Re-render the excitation, if the blowdown has moved far enough to matter.
 *
 * @param {Record<string, any>} a
 * @param {AudioContext} ctx
 */
function rebuildExcitation(a, ctx) {
  let nearest = 0;
  for (let i = 1; i < TAU_STEPS.length; i++) {
    if (Math.abs(TAU_STEPS[i] - a.tau) < Math.abs(TAU_STEPS[nearest] - a.tau)) nearest = i;
  }
  const jetKey = Math.round(a.jet * 6);
  const key = nearest * 16 + jetKey;
  if (key === a.tauKey) return;
  a.tauKey = key;
  const tau = TAU_STEPS[nearest];
  const jet = jetKey / 6;
  a.pulse = renderBlowdown(ctx, tau, jet);
  a.pulseTau = tau;

  for (const loop of a.loops) {
    try { loop.src.stop(); loop.src.disconnect(); loop.gain.disconnect(); } catch { /* gone */ }
  }
  a.loops = [];
  for (let v = 0; v < LOOP_VARIANTS; v++) {
    const src = ctx.createBufferSource();
    src.buffer = renderCycle(ctx, a.events, tau, jet, v);
    src.loop = true;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(gain);
    gain.connect(a.bus);
    try { src.start(); } catch { /* a suspended context starts it on resume */ }
    a.loops.push({ src, gain });
  }
}

/**
 * Point the model at a new exhaust system.
 *
 * Tunes both tubes from the real lengths and the real speed of sound, and rebuilds the
 * looped cycle, whose firing pattern is baked in. Keyed, so an unchanged system does not
 * rebuild and re-glitch the loop.
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
  const t = ctx.currentTime;

  // A primary is closed at the valve and open into the collector, so it is a quarter-wave
  // resonator: its round trip is FOUR lengths, and a delay line carries a round trip, so
  // the delay is two lengths. The tail is open at the mouth and open at the collector, a
  // half-wave resonator, so its delay is one length.
  const cPrimary = Math.max(250, geometry.cPrimary ?? 600);
  const cTail = Math.max(250, geometry.cTail ?? 500);
  const primaryLength = Math.max(0.15, geometry.primaryLength ?? 0.5);
  const tailLength = Math.max(0.3, (geometry.collectorLength ?? 0.4) + (geometry.tailLength ?? 1.2));
  a.primary.delay.delayTime.setValueAtTime(safe(2 * primaryLength / cPrimary, 0.0005, 0.019), t);
  a.tail.delay.delayTime.setValueAtTime(safe(tailLength / cTail, 0.001, 0.079), t);

  // How much comes back off the end is an impedance mismatch. A wide mouth reflects little;
  // a muffler absorbs most of what reaches it. That is the whole audible difference a
  // cat-back makes, and it belongs here rather than in a gain.
  const muffled = !key.startsWith('open');
  const absorb = clamp(geometry.catKeep ?? 1, 0.2, 1);
  a.tail.feedback.gain.setValueAtTime(safe((muffled ? 0.30 : 0.50) * absorb, 0.05, 0.62), t);
  a.primary.feedback.gain.setValueAtTime(safe(0.34 * absorb, 0.05, 0.5), t);
  // A larger pipe radiates more, reflects less, and loses less of its top end on the way.
  const tailArea = Math.max(1e-4, geometry.tailArea ?? 0.004);
  a.tail.damp.frequency.setValueAtTime(safe(1200 + tailArea * 260000, 500, 6000), t);
  a.primary.damp.frequency.setValueAtTime(safe(2600 + tailArea * 200000, 800, 9000), t);
  a.body.frequency.setValueAtTime(safe(cTail / (4 * tailLength), 60, 600), t);

  a.tauKey = -1;
  rebuildExcitation(a, ctx);
}

/**
 * Drive the note for one frame.
 *
 * @param {Record<string, any>} a
 * @param {AudioContext} ctx
 * @param {{rpm: number, level: number, evoKpa: number, gasTempK: number,
 *          overlapDeg: number, lopeSeverity: number}} frame
 */
export function schedulePulseExhaust(a, ctx, frame) {
  const now = ctx.currentTime;
  const rpm = safe(frame.rpm, 0, 12000);
  const level = safe(frame.level, 0, 4);

  // This frame's blowdown. Amplitude follows the overpressure driving the flow: a cylinder
  // at four atmospheres pushes far harder than one at two, which is why load and boost are
  // audible without anything mapping them to a volume.
  if (a.geometry) {
    const b = blowdown(a.geometry, frame.evoKpa ?? BARO_KPA, frame.gasTempK ?? 900);
    a.tau = b.tau;
    a.jet = b.jet;
    a.pressureRatio = b.pressureRatio;
    rebuildExcitation(a, ctx);
  }
  const drive = clamp((a.pressureRatio - 1) / 1.6, 0.04, 3.5);

  const firingRate = (rpm / 120) * a.cyl;
  const pulseMix = clamp(1 - (firingRate - FUSE_START) / FUSE_SPAN, 0, 1);
  const loopMix = clamp((firingRate - FUSE_START) / FUSE_SPAN, 0, 1);

  // A real engine's speed micro-fluctuates cycle to cycle, so a dead-steady pitch is a
  // giveaway for synthesis.
  const drift = 1 + (Math.random() - 0.5) * 0.006;
  if (now > a.nextSwap) {
    const target = (Math.random() * LOOP_VARIANTS) | 0;
    a.blend = a.blend.map((_, k) => (k === target ? 1 : 0.2 + Math.random() * 0.25));
    // Irregular on purpose: anything periodic here beats against the loop period.
    a.nextSwap = now + 0.25 + Math.random() * 0.55;
  }
  const blendTotal = a.blend.reduce((x, y) => x + y, 0) || 1;
  a.loops.forEach((loop, k) => {
    // The loop was rendered at LOOP_REF_RPM, so playback rate carries it to this speed —
    // which scales the pulse width with it, exactly as a shorter cycle would.
    loop.src.playbackRate.setTargetAtTime(
      safe((rpm / LOOP_REF_RPM) * drift * (1 + (k - 1) * 0.0015), 0.2, 3.2), now, 0.05);
    loop.gain.gain.setTargetAtTime(
      safe(loopMix * level * drive * (a.blend[k] / blendTotal), 0, 4), now, 0.18);
  });

  if (rpm < 200 || level <= 0.001 || pulseMix <= 0.02 || !a.pulse) {
    a.nextPulse = now + 0.02;
    return;
  }

  const cycleSeconds = 120 / Math.max(rpm, 200);
  if (a.nextPulse < now) a.nextPulse = now + 0.02;

  let guard = 0;
  while (a.nextPulse < now + 0.14 && guard++ < 48) {
    const src = ctx.createBufferSource();
    src.buffer = a.pulse;
    // The rendered pulse is an exponential of a known time constant, so resampling reaches
    // the tau between two rendered steps exactly. Plus a little scatter, because no two
    // combustion events empty a cylinder identically.
    src.playbackRate.value = safe(
      (a.pulseTau / Math.max(1e-5, a.tau)) * (0.97 + Math.random() * 0.06), 0.25, 4);

    // LOPE. Overlap lets exhaust back into the intake at low speed, so some cycles get a
    // diluted charge and burn weakly. Modulating INDIVIDUAL events is what a lumpy idle
    // actually is — modulating the whole mix is nearly inaudible by comparison.
    let lope = 1;
    const severity = safe(frame.lopeSeverity ?? 0, 0, 1)
      || Math.min(0.85, safe(frame.overlapDeg, 0, 90) * 0.028);
    if (severity > 0.02 && rpm < 2400) {
      const scaled = severity * clamp(1 - (rpm - 800) / 1800, 0.2, 1);
      const wander = 0.5 + 0.5 * Math.sin(a.eventIndex * 0.55) * Math.sin(a.eventIndex * 0.17);
      const misfire = Math.random() < scaled * 0.30 ? 0.25 : 1;
      lope = (1 - scaled * wander * 0.75) * misfire;
    }

    const gain = ctx.createGain();
    gain.gain.value = safe(level * drive * pulseMix * lope * (0.88 + Math.random() * 0.24), 0, 6);
    src.connect(gain);
    gain.connect(a.bus);
    try { src.start(a.nextPulse); } catch { /* scheduling raced the clock */ }
    src.onended = () => { try { src.disconnect(); gain.disconnect(); } catch { /* gone */ } };

    const here = a.events[a.eventIndex % a.events.length];
    const next = a.events[(a.eventIndex + 1) % a.events.length];
    let gapDeg = next.angleDeg - here.angleDeg;
    if (gapDeg <= 0) gapDeg += 720;
    a.nextPulse += (gapDeg / 720) * cycleSeconds;
    a.eventIndex++;
  }
}

/**
 * Set how the system radiates for this frame.
 *
 * Separate from scheduling because it is about heat and flow rather than timing. There are
 * no voicing constants here: the tubes were tuned from the geometry, and this only says how
 * hot the gas in them is and how hard it is moving.
 *
 * @param {Record<string, any>} a
 * @param {AudioContext} ctx
 * @param {{load: number, gasTempK: number, rasp: number}} frame
 */
export function tonePulseExhaust(a, ctx, frame) {
  const t = ctx.currentTime;
  const load = safe(frame.load, 0, 1);
  const rasp = safe(frame.rasp, 0, 1);

  if (a.geometry) {
    // GAS TEMPERATURE IS THE TUNING. Every tube is a length divided by the speed of sound
    // in what is inside it, and that speed goes as the square root of temperature. Retard
    // the timing and the burn is still going as the valve opens, so the gas is hotter, so
    // the whole system tunes UP and the note hardens. That is the mechanism in the metal,
    // and it is the mechanism here — no rasp coefficient is doing it.
    const gamma = a.geometry.gamma ?? 1.3;
    const portK = safe(frame.gasTempK, 300, 1800);
    const tailFrac = clamp((a.geometry.tailK ?? 700) / Math.max(1, a.geometry.portK ?? 900), 0.4, 1);
    const cPrimary = Math.sqrt(gamma * R_GAS * portK);
    const cTail = Math.sqrt(gamma * R_GAS * portK * tailFrac);
    const primaryLength = Math.max(0.15, a.geometry.primaryLength ?? 0.5);
    const tailLength = Math.max(0.3,
      (a.geometry.collectorLength ?? 0.4) + (a.geometry.tailLength ?? 1.2));
    a.primary.delay.delayTime.setTargetAtTime(
      safe(2 * primaryLength / cPrimary, 0.0005, 0.019), t, 0.2);
    a.tail.delay.delayTime.setTargetAtTime(safe(tailLength / cTail, 0.001, 0.079), t, 0.2);
    a.body.frequency.setTargetAtTime(safe(cTail / (4 * tailLength), 60, 600), t, 0.2);
  }

  // How hard a pipe rings depends on how much gas is moving through it. At idle the flow is
  // slow and the system is well muffled, so leaving it ringing gives a metallic clang no
  // real engine makes; under load the pulses are strong and it genuinely rings.
  const flow = clamp(0.2 + load * 0.8, 0.14, 1);
  a.primary.out.gain.setTargetAtTime(safe(0.16 + 0.30 * flow + rasp * 0.12, 0, 0.8), t, 0.12);
  a.tail.out.gain.setTargetAtTime(safe(0.24 + 0.28 * flow, 0, 0.8), t, 0.12);
  a.bodyGain.gain.setTargetAtTime(safe(0.34 - 0.12 * flow, 0.1, 0.5), t, 0.15);
  // A pipe radiates its highs far better than its lows, and radiates more of everything the
  // faster the gas is leaving it.
  a.mouth.gain.setTargetAtTime(safe(1.5 + flow * 4 + rasp * 2.5, 0, 10), t, 0.1);
}

/**
 * Stop the note now.
 *
 * Pulses already handed to the clock cannot be unscheduled, so the bus is pinned to zero and
 * the cursor pushed past them — otherwise a stopped engine keeps firing for the length of
 * the scheduling horizon.
 *
 * @param {Record<string, any>} a
 * @param {AudioContext} ctx
 */
export function silencePulseExhaust(a, ctx) {
  const t = ctx.currentTime;
  try {
    a.bus.gain.cancelScheduledValues(t);
    a.bus.gain.setValueAtTime(0, t);
  } catch { /* a closed context has nothing to silence */ }
  for (const loop of a.loops) {
    try {
      loop.gain.gain.cancelScheduledValues(t);
      loop.gain.gain.setValueAtTime(0, t);
    } catch { /* as above */ }
  }
  a.nextPulse = t + 0.2;
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
