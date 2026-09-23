/**
 * The exhaust note, as the reference build (v4.8, the single-file prototype) made it.
 *
 * WHY THIS IS A PORT AND NOT A MODEL
 *
 * `main` replaced this note with a sample-rate waveguide, and a blowdown-and-turbulence
 * model was tried after it. Neither sounded like the engine the people who use this app
 * tested and signed off. For a presentation layer the ear is the acceptance test, so the
 * note is built the way the reference built it, with the reference's own numbers. Where a
 * number here differs from v4.8 the comment beside it says why.
 *
 * WHAT MAKES THE CHARACTER
 *
 *   1. WHERE THE PULSES FALL. One pulse per firing event, at the crank angles
 *      `firingEvents` reports. A cross-plane V8's banks are offset, so its pulses are
 *      unevenly spaced and that unevenness IS the rumble. A 60/120 V6 fires evenly and
 *      rings hard and hornlike. A four fires twice a revolution, far enough apart to hear
 *      separately — the buzzy, hollow four.
 *
 *   2. THAT NO TWO PULSES ARE ALIKE. Six pre-rendered variants with different decay,
 *      thump pitch and crack, picked per event (soft ones at light load, sharp ones under
 *      it), plus a small random playback-rate wobble and level scatter.
 *
 *   3. THAT THE PIPE RINGS. A delay line with damped feedback stands in for the tube, and
 *      two band resonances stand in for the rest of the system. That is the difference
 *      between a filtered buzz and something that came out of a tailpipe.
 *
 * Under the pulses sits a faint underlay: two slightly detuned pulse-shaped oscillators at
 * the firing frequency, a sub an octave down, and combustion roughness — noise gated at
 * the firing rate, so it arrives in pulses rather than as hiss. They add body; they do not
 * carry the note.
 *
 * WHY THERE ARE TWO PULSE LAYERS
 *
 * Below about 90 events a second the ear resolves individual pulses, which is where
 * rumble, lope and firing order live, so the scheduler does the work. Above about 200 the
 * ear fuses them, and scheduling a node per event is pure cost. So a pre-rendered engine
 * cycle — the same pulses with this layout's spacing baked in, pitched by playback rate —
 * fades in as the scheduler fades out. Crossfade, never decimate: playing fewer, louder
 * pulses up top sounds like hitting a tin can, because that is what it is.
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

/** Length of one rendered pulse, seconds. */
const PULSE_SECONDS = 0.13;

/** How many pulse variants to render. */
const PULSE_VARIANTS = 6;

/** Engine speed the looped cycle is rendered at; playback rate carries it everywhere else. */
const LOOP_REF_RPM = 3000;

/** Loop variants to crossfade between. Each is an always-running source. */
const LOOP_VARIANTS = 2;

/** Events per second at which the scheduler starts, and finishes, handing over to the loop. */
const FUSE_START = 90;
const FUSE_SPAN = 110;

/** Fixed trim on everything the pulses feed, before the layout's own. */
const BUS_GAIN = 2.3;

/**
 * THE VOICING, the same for every layout, and it is the reference's six-cylinder voicing.
 *
 * v4.8 gave the V8 and the four their own resonance, underlay and trim. The V8's was a
 * broad, dull resonance and a pure-sine sub at twice the six's level; the four's was the
 * loudest oscillator underlay and the quietest pulses. With the reference's output
 * clipping, neither mattered much — clipping buried both under harmonics. Without it the
 * V8 and the four came out quiet and synthetic while the six still sounded right, so every
 * layout gets the six's. What makes a V8 a V8 is untouched: its firing rhythm (the uneven
 * cross-plane spacing is in the event times), its body pitch, its displacement and its pipe.
 */
const VOICE = {
  toneQ: 6.0, bodyQ: 3.6, body2Q: 5.0, body2Gain: 0.34, busTrim: 1.05, pipeOut: 0.88,
  oscGain: 0.035, subGain: 0.08, subRise: 0.05,
};

/** Where each layout's body resonance sits, Hz — the one voicing number that is its own. */
const BODY_HZ = { 4: 420, 6: 320, 8: 240 };

/** How far the two underlay oscillators are detuned, cents: a four buzzes, a V8 is smooth. */
const DETUNE = { 4: 16, 6: 9, 8: 6 };

/**
 * One rendered combustion pulse: a pressure thump with a broadband crack on the front of
 * it, under an exponential decay. `variant` slides from soft and lingering to sharp and
 * snappy, so an idling cylinder vents a dull thud and a loaded one cracks.
 *
 * @param {BaseAudioContext} ctx
 * @param {number} variant 0 (softest) to PULSE_VARIANTS-1 (sharpest)
 * @param {number} [thumpScale] this layout's `thumpBalance`, 1 for an even-firing six
 * @returns {AudioBuffer}
 */
function renderPulse(ctx, variant, thumpScale = 1) {
  const length = Math.floor(ctx.sampleRate * PULSE_SECONDS);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  const decay = 30 + variant * 9;
  const thumpHz = 62 + variant * 9;
  const crack = 0.16 + variant * 0.11;
  // The soft variants open gently; the sharp ones snap. That attack difference is most of
  // what separates an idle vent from a wide-open crack.
  const attackSeconds = variant < PULSE_VARIANTS / 2 ? 0.0035 : 0.0010;
  for (let i = 0; i < length; i++) {
    const x = i / ctx.sampleRate;
    const env = Math.exp(-x * decay) * Math.min(1, x / attackSeconds);
    data[i] = (Math.sin(2 * Math.PI * thumpHz * x) * 0.9 * thumpScale
      + (Math.random() * 2 - 1) * crack) * env;
  }
  return buffer;
}

/**
 * One engine cycle of pulses, rendered to a seamless loop, with the events at their real
 * crank angles so the layout's rhythm is inside the buffer and survives resampling. Seeded,
 * so a rebuild is bit-identical: anything that changed at the loop period would be heard
 * as a woosh.
 *
 * @param {BaseAudioContext} ctx
 * @param {{angleDeg: number}[]} events one engine cycle's firing events
 * @param {number} variant which timbre to render
 * @returns {AudioBuffer}
 */
function renderCycle(ctx, events, variant) {
  const cycleSeconds = 120 / LOOP_REF_RPM;
  const length = Math.max(1, Math.round(ctx.sampleRate * cycleSeconds));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  const decay = 40 + variant * 7;
  const thumpHz = 70 + variant * 11;
  const crack = 0.24 + variant * 0.07;
  const thump = 0.9 * thumpBalance(events, thumpHz, decay, cycleSeconds);
  let seed = 12345 + variant * 7919;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const eventLength = Math.floor(ctx.sampleRate * 0.09);
  for (const event of events) {
    const start = Math.floor((event.angleDeg / 720) * cycleSeconds * ctx.sampleRate);
    for (let i = 0; i < eventLength; i++) {
      // Wrap rather than truncate, so a pulse near the end of the cycle finishes at the
      // start of it and the loop point is seamless.
      const j = (start + i) % length;
      const x = i / ctx.sampleRate;
      const env = Math.exp(-x * decay) * Math.min(1, x / 0.0012);
      data[j] += (Math.sin(2 * Math.PI * thumpHz * x) * thump + (rnd() * 2 - 1) * crack) * env;
    }
  }
  return buffer;
}

/**
 * How much of the thump a layout's loop keeps, relative to an even-firing six.
 *
 * Every pulse opens with a low sine thump that rings for several firing intervals once the
 * engine is fast enough for the loop to be playing, so neighbouring thumps sum — and how
 * they sum depends on where the events fall. A six's are evenly spaced about half a thump
 * period apart and largely cancel, which leaves the crack and the pipe ring carrying the
 * note: that is the reference's six, and the one layout that still sounded like it once
 * its output stopped clipping. A cross-plane V8's uneven spacing and a four's wide gaps
 * cancel far less, so per cycle they kept 6-10 dB and 3-8 dB more thump against their
 * crack. That is a steady low sine a phone speaker cannot play, the limiter spends itself
 * on it, and what is left sounds quiet and synthetic. The reference's clipping disguised
 * it by turning the sine into a buzz.
 *
 * So each layout's thump is scaled towards the six's, found by summing the thumps exactly
 * as the loop does and reading the strongest line in the spectrum. Scaling the amplitude
 * by the square root of the line ratio matches the lines' power; by the ratio itself,
 * overshoots it. The square root left the four's high-rpm note one tone at its firing
 * frequency — at 5500 that is 183 Hz, below where a phone speaker plays, where the six's
 * equivalent is 275 Hz and above it — and the full ratio took the rumble out of a V8. The
 * exponent between them, 0.75, measured the four and the V8 within about 5 dB of the six
 * in the band a phone plays, with the V8's rumble intact. The rhythm — which is the
 * layout — is untouched; only how much of one tonal component survives the sum is
 * evened out. Never above 1: nothing gets more thump.
 *
 * @param {{angleDeg: number}[]} events
 * @param {number} thumpHz
 * @param {number} decay the thump's decay rate, 1/s
 * @param {number} cycleSeconds
 * @returns {number} 0..1
 */
export function thumpBalance(events, thumpHz, decay, cycleSeconds) {
  // Render just the thumps of one cycle, wrapped as the loop wraps them, and find the
  // strongest line in its spectrum. The loop repeats every cycle, so its spectrum is
  // lines at multiples of the cycle rate, and what the ear hears as a tone is the biggest
  // of them. Coarse sampling is plenty: the thump is below 100 Hz.
  const rate = 4000;
  const length = Math.max(1, Math.round(rate * cycleSeconds));
  const strongestLine = (angles) => {
    const d = new Float64Array(length);
    const n = Math.floor(rate * 0.09);
    for (const deg of angles) {
      const start = Math.floor((deg / 720) * cycleSeconds * rate);
      for (let i = 0; i < n; i++) {
        const x = i / rate;
        d[(start + i) % length] += Math.sin(2 * Math.PI * thumpHz * x) * Math.exp(-x * decay);
      }
    }
    let best = 0;
    // Lines up to 400 Hz: the thump has nothing above that worth counting.
    for (let k = 1; k <= Math.min(length / 2, 400 * cycleSeconds); k++) {
      let re = 0; let im = 0;
      for (let i = 0; i < length; i++) {
        const ph = (2 * Math.PI * k * i) / length;
        re += d[i] * Math.cos(ph); im += d[i] * Math.sin(ph);
      }
      best = Math.max(best, re * re + im * im);
    }
    return best;
  };
  const six = strongestLine([0, 120, 240, 360, 480, 600]);
  const own = strongestLine(events.map((e) => e.angleDeg));
  if (!(own > 0)) return 1;
  return clamp(Math.pow(six / own, 0.75), 0, 1);
}

/**
 * A pulse-shaped periodic wave: many harmonics falling off about 1/n, with a little phase
 * scatter so they do not all peak together, which is what makes a pure synthetic wave
 * sound artificial.
 *
 * @param {BaseAudioContext} ctx
 * @returns {PeriodicWave}
 */
function pulseWave(ctx) {
  const n = 48;
  const re = new Float32Array(n);
  const im = new Float32Array(n);
  for (let k = 1; k < n; k++) {
    im[k] = Math.pow(1 / k, 0.85) * Math.exp(-k / 26);
    re[k] = im[k] * 0.35 * Math.sin(k * 1.7);
  }
  return ctx.createPeriodicWave(re, im, { disableNormalization: false });
}

/**
 * Build the note.
 *
 * @param {AudioContext} ctx
 * @returns {Record<string, any>}
 */
export function createPulseExhaust(ctx) {
  // Where the note is summed. Its gain is also where lope acts, so a lumpy cam swells and
  // dips the whole note the way it does in the car.
  const sum = ctx.createGain();
  sum.gain.value = 1;
  // A DC BLOCK, and the reason the reference distorted at high revs. Each pulse's thump
  // starts on a positive half-cycle and decays, so its average is not zero — about +0.002
  // of a second's worth per pulse — and above about 200 events a second the offsets add
  // up to a constant push several times full scale. No speaker reproduces DC, so none of
  // it was ever heard as sound; all of it was heard as the limiter and the output pinned
  // against the ceiling. Below the lowest note the engine makes, so nothing else changes.
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

  // Everything the pulses and loops feed.
  const bus = ctx.createGain(); bus.gain.value = BUS_GAIN;
  const busTrim = ctx.createGain(); busTrim.gain.value = 1.05;
  bus.connect(busTrim);
  busTrim.connect(tone); busTrim.connect(body); busTrim.connect(body2); busTrim.connect(pipeDelay);

  // The underlay. Two detuned pulse oscillators — an engine never holds a perfectly pure
  // pitch, and the beating between them is what stops it sounding like one — and a sub.
  const wave = pulseWave(ctx);
  const oscA = ctx.createOscillator(); oscA.setPeriodicWave(wave); oscA.frequency.value = 40;
  const oscB = ctx.createOscillator(); oscB.setPeriodicWave(wave); oscB.frequency.value = 40;
  oscB.detune.value = 9;
  const oscGain = ctx.createGain(); oscGain.gain.value = 0;
  oscA.connect(oscGain); oscB.connect(oscGain);
  oscGain.connect(tone); oscGain.connect(body); oscGain.connect(body2);
  const sub = ctx.createOscillator(); sub.type = 'sine'; sub.frequency.value = 20;
  const subGain = ctx.createGain(); subGain.gain.value = 0;
  sub.connect(subGain); subGain.connect(tone);

  // Combustion roughness, gated at the firing rate so the noise arrives in pulses. It also
  // carries the starter's grind and knock's rattle, as the reference's did.
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

  // LOPE: overlap makes combustion inconsistent at idle, so the note surges and dips at a
  // slow sub-multiple of the firing rate — the classic cammed idle.
  const lopeLfo = ctx.createOscillator(); lopeLfo.type = 'triangle'; lopeLfo.frequency.value = 6;
  const lopeDepth = ctx.createGain(); lopeDepth.gain.value = 0;
  lopeLfo.connect(lopeDepth); lopeDepth.connect(sum.gain);

  for (const src of [oscA, oscB, sub, noise, gateLfo, lopeLfo]) {
    try { src.start(); } catch { /* a suspended context starts it on resume */ }
  }

  const pulses = [];
  for (let v = 0; v < PULSE_VARIANTS; v++) pulses.push(renderPulse(ctx, v));

  return {
    out, sum, dcBlock, bus, busTrim, tone, body, bodyGain, body2, body2Gain,
    pipeDelay, pipeFeedback, pipeDamp, pipeOut,
    oscA, oscB, oscGain, sub, subGain, noiseGain, gateLfo, lopeLfo, lopeDepth,
    pulses,
    /** The same pulses with this layout's thump balance, for once the events run together. */
    pulsesFused: pulses,
    /** @type {{src: AudioBufferSourceNode, gain: GainNode}[]} */
    loops: [],
    /** @type {{angleDeg: number}[]} */
    events: [{ angleDeg: 0 }],
    cyl: 6,
    displacementL: 3.0,
    /** Tailpipe bore in inches and compression ratio, from the geometry. */
    pipeDiaIn: 2.5,
    compression: 10.3,
    nextPulse: 0,
    eventIndex: 0,
    blend: new Array(LOOP_VARIANTS).fill(1),
    nextSwap: 0,
    geomKey: '',
    loopKey: '',
  };
}

/**
 * Point the note at a new build.
 *
 * Only a change of firing pattern rebuilds the loops — they are always-running sources,
 * and replacing one restarts it from silence, so rebuilding on every geometry key (which
 * moves with exhaust temperature) left the top end ramping up from zero mid-pull.
 *
 * @param {Record<string, any>} a
 * @param {AudioContext} ctx
 * @param {Record<string, any>} geometry an `exhaustGeometry`
 * @param {string} key a `geometryKey` for it
 */
export function setPulseExhaustGeometry(a, ctx, geometry, key) {
  if (key === a.geomKey) return;
  a.geomKey = key;
  if (geometry.events && geometry.events.length) a.events = geometry.events;
  a.cyl = Math.max(1, geometry.cyl || a.cyl);
  const swept = geometry.sweptM3 ?? 5e-4;
  a.displacementL = safe(swept * 1000 * a.cyl, 0.5, 12);
  a.compression = safe(swept / Math.max(1e-7, geometry.clearanceM3 ?? swept / 9.3) + 1, 6, 16);
  // The tailpipe menu arrives as an area; the reference's voicing is written in inches.
  a.pipeDiaIn = safe(2 * Math.sqrt((geometry.tailArea ?? 0.0032) / Math.PI) / 0.0254, 1.5, 5);

  const loopKey = a.events.map((e) => e.angleDeg.toFixed(2)).join(',');
  if (loopKey === a.loopKey) return;
  a.loopKey = loopKey;
  for (const loop of a.loops) {
    try { loop.src.stop(); loop.src.disconnect(); loop.gain.disconnect(); } catch { /* gone */ }
  }
  // The scheduled pulses overlap too once the engine is quick, so a second bank carries the
  // same balance as the loop they hand over to — measured on the loop's first variant. At
  // idle they are far enough apart not to sum, and keep the reference's full thump, which
  // is a V8's idle rumble. An even-firing six's balance is exactly 1: one bank, twice.
  const scale = thumpBalance(a.events, 70, 40, 120 / LOOP_REF_RPM);
  a.pulsesFused = [];
  for (let v = 0; v < PULSE_VARIANTS; v++) a.pulsesFused.push(renderPulse(ctx, v, scale));
  a.loops = [];
  for (let v = 0; v < LOOP_VARIANTS; v++) {
    const src = ctx.createBufferSource();
    src.buffer = renderCycle(ctx, a.events, v);
    src.loop = true;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(gain);
    gain.connect(a.bus);
    try { src.start(); } catch { /* starts on resume */ }
    a.loops.push({ src, gain });
  }
}

/**
 * Schedule pulses for one frame and set the loop layer's pitch and level.
 *
 * Unthrottled: call it every engine tick. It schedules ahead and keeps its own event
 * cursor, so it tolerates being late and the rhythm never restarts.
 *
 * @param {Record<string, any>} a
 * @param {AudioContext} ctx
 * @param {{rpm: number, level: number, load: number, overlapDeg: number,
 *   audible: boolean}} frame
 */
export function schedulePulseExhaust(a, ctx, frame) {
  const now = ctx.currentTime;
  const rpm = safe(frame.rpm, 0, 12000);
  const level = safe(frame.level, 0, 4);
  const load = safe(frame.load, 0, 1);
  const overlapDeg = safe(frame.overlapDeg, 0, 90);
  const events = a.events.length ? a.events : [{ angleDeg: 0 }];

  const firingRate = (rpm / 120) * a.cyl;
  const pulseMix = clamp(1 - (firingRate - FUSE_START) / FUSE_SPAN, 0, 1);
  const loopMix = clamp((firingRate - FUSE_START) / FUSE_SPAN, 0, 1);

  // Wander between loop variants at irregular intervals, so the top end's timbre keeps
  // shifting without anything lining up with the loop period.
  if (now > a.nextSwap) {
    const target = (Math.random() * LOOP_VARIANTS) | 0;
    a.blend = a.blend.map((_, k) => (k === target ? 1 : 0.2 + Math.random() * 0.25));
    a.nextSwap = now + 0.25 + Math.random() * 0.55;
  }
  // A real engine's speed micro-fluctuates, so the loop pitch drifts a little. Both
  // variants drift TOGETHER: the reference also detuned them 0.15% from each other, and
  // two near-identical loops at slightly different rates comb-filter against each other
  // with a slowly sweeping notch — heard as a whoosh on every rev.
  const drift = 1 + (Math.random() - 0.5) * 0.006;
  const blendTotal = a.blend.reduce((x, y) => x + y, 0) || 1;
  a.loops.forEach((loop, k) => {
    loop.src.playbackRate.setTargetAtTime(safe((rpm / LOOP_REF_RPM) * drift, 0.2, 3.2), now, 0.05);
    loop.gain.gain.setTargetAtTime(
      frame.audible && level > 0 ? loopMix * (0.62 + load * 0.55) * (a.blend[k] / blendTotal) : 0,
      now, 0.18);
  });

  if (rpm < 200 || level <= 0.001 || pulseMix <= 0.02 || !frame.audible) {
    a.nextPulse = now + 0.02;
    return;
  }

  const fused = clamp((firingRate - 45) / 90, 0, 1);
  // Bigger engines make longer, lower-pitched pulses.
  const rate = clamp(1.35 - (a.displacementL - 2.0) * 0.14, 0.55, 1.5);
  const cycleSeconds = 120 / Math.max(rpm, 200);
  if (a.nextPulse < now + 0.005) a.nextPulse = now + 0.02;

  let guard = 0;
  while (a.nextPulse < now + 0.14 && guard++ < 48) {
    const src = ctx.createBufferSource();
    const half = PULSE_VARIANTS / 2;
    const pick = level < 0.35 ? (Math.random() * half) | 0 : half + ((Math.random() * half) | 0);
    // Fading from the reference's pulses to the balanced ones as the events start to run
    // together, by picking per event rather than switching at a threshold.
    const bank = Math.random() < fused && a.pulsesFused ? a.pulsesFused : a.pulses;
    src.buffer = bank[pick];
    src.playbackRate.value = rate * (0.97 + Math.random() * 0.06);

    // LOPE, per event. Overlap lets exhaust back into the intake at low speed, so some
    // cycles get a diluted charge and burn weakly — that is what a lumpy idle actually is.
    let lope = 1;
    if (overlapDeg > 1.5 && rpm < 2400) {
      const severity = Math.min(0.85, overlapDeg * 0.028) * clamp(1 - (rpm - 800) / 1800, 0.2, 1);
      const wander = 0.5 + 0.5 * Math.sin(a.eventIndex * 0.55) * Math.sin(a.eventIndex * 0.17);
      const misfire = Math.random() < severity * 0.30 ? 0.25 : 1;
      lope = (1 - severity * wander * 0.75) * misfire;
    }

    const gain = ctx.createGain();
    gain.gain.value = safe(level * pulseMix * lope * (0.85 + Math.random() * 0.3), 0, 6);
    src.connect(gain);
    gain.connect(a.bus);
    try { src.start(a.nextPulse); } catch { /* raced the clock */ }
    src.onended = () => { try { src.disconnect(); gain.disconnect(); } catch { /* gone */ } };

    // The gap to the next pulse is the crank angle to the next firing event, which is
    // where the uneven layouts get their rhythm.
    const here = events[a.eventIndex % events.length];
    const next = events[(a.eventIndex + 1) % events.length];
    let gapDeg = next.angleDeg - here.angleDeg;
    if (gapDeg <= 0) gapDeg += 720;
    a.nextPulse += (gapDeg / 720) * cycleSeconds;
    a.eventIndex++;
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
 *   cranking: boolean, catBack: boolean, audible: boolean, overlapDeg: number}} frame
 */
export function tonePulseExhaust(a, ctx, frame) {
  const t = ctx.currentTime;
  const rpm = safe(frame.rpm, 0, 12000);
  const load = safe(frame.load, 0, 1);
  const rasp = safe(frame.rasp, 0, 1);
  const richness = safe(frame.richness, -0.4, 0.8);
  const knock = safe(frame.knock, 0, 1);
  const overlap = safe(frame.overlapDeg, 0, 90);
  const cyl = a.cyl;

  const fire = Math.max(6, (rpm / 60) * (cyl / 2));
  const firingRate = (rpm / 120) * cyl;
  const contMix = clamp((firingRate - FUSE_START) / FUSE_SPAN, 0, 1);
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

  a.oscA.frequency.setTargetAtTime(fire, t, 0.02);
  a.oscB.frequency.setTargetAtTime(fire, t, 0.02);
  a.sub.frequency.setTargetAtTime(fire / 2, t, 0.02);
  a.gateLfo.frequency.setTargetAtTime(fire, t, 0.02);
  a.oscB.detune.setTargetAtTime(DETUNE[cyl] ?? DETUNE[6], t, 0.2);
  a.oscGain.gain.setTargetAtTime(VOICE.oscGain, t, 0.1);
  a.subGain.gain.setTargetAtTime(VOICE.subGain + contMix * VOICE.subRise, t, 0.1);

  a.body.frequency.setTargetAtTime(safe((BODY_HZ[cyl] ?? BODY_HZ[6]) * dispDepth, 60, 2000), t, 0.15);
  a.tone.frequency.setTargetAtTime(
    safe((300 + fire * 7 + load * 2400) * diaOpen * dispDepth * (1 + rasp * 0.45 + crBite), 80, 18000), t, 0.05);
  a.tone.Q.setTargetAtTime(VOICE.toneQ * (1 + crBite), t, 0.1);
  a.body.Q.setTargetAtTime(VOICE.bodyQ, t, 0.15);
  a.body2.Q.setTargetAtTime(VOICE.body2Q, t, 0.15);
  a.body2Gain.gain.setTargetAtTime((VOICE.body2Gain + rasp * 0.18) * (0.35 + 0.65 * load), t, 0.12);
  a.busTrim.gain.setTargetAtTime(VOICE.busTrim, t, 0.15);
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

  // Roughness: the starter's grind while cranking; otherwise combustion noise that rises
  // with load and speed, thickens when rich, and rattles when it knocks.
  a.noiseGain.gain.setTargetAtTime(frame.cranking ? 0.12
    : 0.03 + load * 0.045 + contMix * 0.11 + Math.max(0, richness) * 0.03 + knock * 0.06, t, 0.05);

  // Lope is loudest at idle and washes out as revs rise and combustion evens up.
  a.lopeLfo.frequency.setTargetAtTime(clamp(fire / 7, 1.8, 11), t, 0.15);
  const lope = frame.audible && overlap > 1.5 && rpm < 2600
    ? Math.min(0.42, overlap * 0.013) * clamp(1 - (rpm - 800) / 2000, 0.12, 1)
    : 0;
  a.lopeDepth.gain.setTargetAtTime(lope, t, 0.12);
}

/**
 * Stop the note now. Pulses already handed to the clock cannot be unscheduled, so the bus
 * is pinned to zero and the cursor pushed past them.
 *
 * @param {Record<string, any>} a
 * @param {AudioContext} ctx
 */
export function silencePulseExhaust(a, ctx) {
  const t = ctx.currentTime;
  const kill = (p) => { try { p.cancelScheduledValues(t); p.setValueAtTime(0, t); } catch { /* closed */ } };
  kill(a.bus.gain);
  kill(a.pipeOut.gain);
  kill(a.lopeDepth.gain);
  kill(a.noiseGain.gain);
  for (const loop of a.loops) kill(loop.gain.gain);
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
