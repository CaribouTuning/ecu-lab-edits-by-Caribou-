/**
 * The engine synthesiser.
 *
 * Presentation only. Every number that describes the ENGINE arrives in an
 * `AcousticDrive` from `src/sim/acoustics.js`; nothing here works out what the engine is
 * doing. What lives here is how to turn those numbers into Web Audio nodes — which is a
 * rendering problem, not a physics one, and is why this file sits in `src/ui/`.
 *
 * HOW THE SOUND IS BUILT
 *
 * The note is a train of discrete exhaust pulses, not a waveform. That is the single
 * decision the whole file turns on. An oscillator sweeping in pitch sounds like a
 * synthesiser because it is one; a burst of individually scheduled pressure pulses,
 * arriving at the crank angles the engine actually fires at, sounds like an engine
 * because the ear resolves the pulses and hears their rhythm.
 *
 * Three layers, crossfaded by how fast the pulses are arriving:
 *
 *   PULSE TRAIN     below roughly 90 events/sec the ear separates individual pulses, so
 *                   each firing event is scheduled as its own buffer with its own gain.
 *                   Rumble, lope and misfire all live here.
 *   LOOPED TRAIN    above that, one node per firing event costs more than it is worth,
 *                   so a pre-rendered buffer holding ONE COMPLETE ENGINE CYCLE — with
 *                   this layout's real firing angles baked into it — is looped and
 *                   pitched by playback rate. Same pulses, same rhythm, one node.
 *   OSCILLATORS     a faint pulse-wave underlay that only fills in body. If this layer
 *                   is ever loud enough to notice on its own, the result stops sounding
 *                   like an engine.
 *
 * Everything then passes through an exhaust model: two resonant bodies, a lowpass, and
 * a delay line with feedback standing in for the pipe itself. A pipe is a resonant tube
 * — a pulse travels down it, reflects off the open end, and comes back — and a short
 * feedback delay reproduces that directly. It is the largest single difference between
 * "filtered buzz" and something that sounds like it came out of a car.
 *
 * WHY THERE IS A LIMITER. Exhaust pulses are sharp transients, so raw gain clips long
 * before it sounds loud. Compressing the output lets the average level come up a long
 * way while the peaks stay clean, which is the same reason engine recordings are
 * compressed before anyone hears them.
 */

/**
 * How each layout is voiced.
 *
 * These are mixing decisions, not physics — the physics of why a V8 rumbles is the
 * firing geometry in `acoustics.js`, and it arrives here as the event list. What is
 * here is how each layout's exhaust system is shaped: a V8's collectors are large and
 * loose and blur its uneven pulses into a rumble, an inline four's are small and tight
 * so its widely spaced pulses stay individually audible.
 */
const VOICING = {
  I4: { bodyHz: 420, bodyQ: 1.4, body2Q: 2.2, body2Gain: 0.20, lowQ: 4.5, pulseGain: 0.95, pipeGain: 0.68, subGain: 0.05, oscGain: 0.045, detune: 16 },
  I6: { bodyHz: 300, bodyQ: 3.2, body2Q: 4.6, body2Gain: 0.32, lowQ: 5.6, pulseGain: 1.05, pipeGain: 0.86, subGain: 0.09, oscGain: 0.033, detune: 8 },
  V6: { bodyHz: 320, bodyQ: 3.6, body2Q: 5.0, body2Gain: 0.34, lowQ: 6.0, pulseGain: 1.05, pipeGain: 0.88, subGain: 0.08, oscGain: 0.035, detune: 9 },
  V8: { bodyHz: 240, bodyQ: 0.6, body2Q: 0.9, body2Gain: 0.10, lowQ: 1.1, pulseGain: 1.25, pipeGain: 1.10, subGain: 0.16, oscGain: 0.025, detune: 6 },
};

/** Layouts the looped pulse train is pre-rendered for. Must cover `VOICING`. */
const LAYOUTS = ['I4', 'I6', 'V6', 'V8'];

/** Engine speed the looped buffers are rendered at; playback rate scales from here. */
const LOOP_REF_RPM = 3000;

/** Pre-rendered variants per layout. Each is an always-running source, so keep it lean. */
const LOOP_VARIANTS = 2;

/**
 * How far apart the looped variants are held in playback rate, as a fraction.
 *
 * Two loops of identical length played at identical rates phase-lock, and a pair of
 * phase-locked periodic buffers is a synthesiser however they were rendered. Holding
 * them a fraction of a percent apart makes them drift continuously against each other,
 * which is what real cylinders do — they never stay in lockstep either.
 */
const LOOP_DETUNE = 0.0018;

/** How often the slow per-variant rate wander is redrawn, seconds. */
const LOOP_WANDER_S = 0.55;

/** How much of the wander comes from cycle-to-cycle variation. */
const LOOP_WANDER_PER_COV = 0.35;

/** Parameter updates per second. Pulse scheduling is unthrottled; this is not. */
const PARAM_HZ = 14;

/**
 * Firing events per second at which the ear stops resolving individual pulses, and the
 * span over which the scheduled train hands over to the looped one.
 *
 * Below the first number discrete pulses do all the work. Above the sum of the two the
 * loop does. Crossfade, never decimate: playing sparse loud pulses up there sounds like
 * hitting a tin can, because that is what it is.
 */
const PULSE_FUSE_HZ = 130;
const PULSE_FUSE_SPAN_HZ = 150;

/** How far ahead pulses are scheduled, and the most that may be queued in one call. */
const SCHEDULE_AHEAD_S = 0.14;
const MAX_PULSES_PER_CALL = 64;

/**
 * Pulse amplitude, in pressure, that renders at unity gain.
 *
 * `drive.pulseLevel` is linear in pressure and spans about 30 dB between idle and
 * wide-open throttle. Gain is mapped as a power law rather than linearly so that the
 * span is audible at both ends: idle has to be quiet without vanishing.
 */
const LEVEL_EXPONENT = 0.45;

/**
 * Overall trim, chosen so a wide-open pull peaks below full scale.
 *
 * Measured rather than guessed: with this at 1 the loudest cases sat pinned against the
 * output for seconds at a time, which means the brickwall below is doing the mixing and
 * every layer is being flattened into every other. Leaving headroom is what lets the
 * pulses stay separate.
 */
const MASTER_TRIM = 0.72;

/** Quietest and loudest the exhaust may render, as a master gain. */
const GAIN_FLOOR = 0.08;
const GAIN_CEILING = 0.80;

/**
 * Maps a physical pulse amplitude to a rendering gain.
 * @param {number} level pressure amplitude from `AcousticDrive.pulseLevel`
 * @returns {number} gain, 0..1
 */
function levelToGain(level) {
  const g = Math.pow(Math.max(0, level), LEVEL_EXPONENT) * MASTER_TRIM;
  return Math.min(GAIN_CEILING, Math.max(GAIN_FLOOR, g));
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Builds one exhaust pulse into a buffer.
 *
 * A blowdown pulse is a pressure spike with a fast attack and an exponential decay,
 * riding on the lower-frequency thump of the gas column starting to move. `sharpness`
 * is the physics input: a choked blowdown cracks, an unchoked one chuffs.
 *
 * @param {AudioContext} ctx
 * @param {number} sharpness 0..1 from `AcousticDrive.sharpness`
 * @param {number} seed variation index, so no two pulses are identical
 * @returns {AudioBuffer}
 */
function renderPulse(ctx, sharpness, seed) {
  const len = Math.floor(ctx.sampleRate * 0.13);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  // A sharp pulse opens fast and dies fast; a soft one loafs.
  const decay = 26 + sharpness * 26 + seed * 4;
  const attackS = 0.0038 - sharpness * 0.0028;
  const thumpHz = 62 + seed * 9;
  const crackAmt = 0.10 + sharpness * 0.30;
  for (let i = 0; i < len; i++) {
    const x = i / ctx.sampleRate;
    const env = Math.exp(-x * decay);
    const attack = Math.min(1, x / attackS);
    const thump = Math.sin(2 * Math.PI * thumpHz * x) * 0.9;
    const crack = (Math.random() * 2 - 1) * crackAmt;
    data[i] = (thump + crack) * env * attack;
  }
  return buf;
}

/**
 * Pre-renders one complete engine cycle for a layout, at `LOOP_REF_RPM`.
 *
 * The firing angles come straight from the physics, so the cross-plane V8's uneven bank
 * spacing is inside the sample and survives at any playback rate. Each bank gets its own
 * pulse colour, because two collectors of different length do not sound identical — and
 * that difference is what the ear picks the rumble out of.
 *
 * Each buffer is internally periodic; variation comes from crossfading BETWEEN buffers at
 * random intervals, so the variation rate is decoupled from the loop rate and cannot beat
 * against it.
 *
 * @param {AudioContext} ctx
 * @param {{angleDeg: number, bank: number}[]} events one engine cycle of firing events
 * @param {number} variant which variant to render
 * @returns {AudioBuffer}
 */
function renderCycleLoop(ctx, events, variant) {
  const cycleSec = 120 / LOOP_REF_RPM;
  const len = Math.round(ctx.sampleRate * cycleSec);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  // A deterministic generator, so a buffer is identical every time it is built.
  let seed = 12345 + variant * 7919;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (const ev of events) {
    const decay = 40 + variant * 7 + ev.bank * 5;
    const thumpHz = 70 + variant * 11 + ev.bank * 6;
    const crackAmt = 0.24 + variant * 0.07;
    const start = Math.floor((ev.angleDeg / 720) * cycleSec * ctx.sampleRate);
    const evLen = Math.floor(ctx.sampleRate * 0.09);
    for (let i = 0; i < evLen; i++) {
      const j = (start + i) % len;                  // wrap, so the loop point is seamless
      const x = i / ctx.sampleRate;
      const env = Math.exp(-x * decay);
      const attack = Math.min(1, x / 0.0012);
      data[j] += (Math.sin(2 * Math.PI * thumpHz * x) * 0.9 + (rnd() * 2 - 1) * crackAmt) * env * attack;
    }
  }
  return buf;
}

/**
 * Builds the whole audio graph. Call once; it stays alive for the session.
 *
 * @param {AudioContext} ctx
 * @param {(configuration: string) => {angleDeg: number, bank: number}[]} eventsFor
 *   supplies each layout's firing events — passed in rather than imported so this file
 *   holds no opinion about engine geometry
 * @returns {object} the node graph, or null if the context cannot be built
 */
export function createEngineAudio(ctx, eventsFor) {
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -14;
  limiter.knee.value = 8;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.12;
  const outGain = ctx.createGain(); outGain.gain.value = 1.25;  // make-up for the limiter

  // A brickwall after the make-up gain. The limiter is a compressor, so a fast enough
  // transient still gets past it, and anything over full scale is HARD clipped by the
  // output — which is audible as a tearing edge on exactly the loudest pulses. A tanh
  // curve rounds those over instead, which is what a real microphone in front of a real
  // exhaust does anyway.
  const softClip = ctx.createWaveShaper();
  const curve = new Float32Array(1024);
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * 1.6) / Math.tanh(1.6);
  }
  softClip.curve = curve;
  softClip.oversample = '2x';
  limiter.connect(outGain); outGain.connect(softClip); softClip.connect(ctx.destination);

  const master = ctx.createGain(); master.gain.value = 0; master.connect(limiter);

  // A pulse train is close to a train of impulses, which means a lot of harmonics with
  // only gentle roll-off. Too few and it sounds like a synthesiser; the phase scatter
  // stops every harmonic peaking together, which is the other half of that.
  const N = 48;
  const re = new Float32Array(N), im = new Float32Array(N);
  for (let n = 1; n < N; n++) {
    im[n] = Math.pow(1 / n, 0.85) * Math.exp(-n / 26);
    re[n] = im[n] * 0.35 * Math.sin(n * 1.7);
  }
  const pulseWave = ctx.createPeriodicWave(re, im, { disableNormalization: false });

  const oscA = ctx.createOscillator(); oscA.setPeriodicWave(pulseWave); oscA.frequency.value = 40;
  const oscB = ctx.createOscillator(); oscB.setPeriodicWave(pulseWave); oscB.frequency.value = 40; oscB.detune.value = 9;
  const oscG = ctx.createGain(); oscG.gain.value = 0.04;
  const sub = ctx.createOscillator(); sub.type = 'sine'; sub.frequency.value = 20;
  const subG = ctx.createGain(); subG.gain.value = 0.08;

  // The exhaust system: two resonances plus an overall lowpass. One peak is a filtered
  // buzz; two is enough to read as a system with a shape.
  const body = ctx.createBiquadFilter(); body.type = 'bandpass'; body.frequency.value = 320; body.Q.value = 0.9;
  const bodyG = ctx.createGain(); bodyG.gain.value = 0.8;
  const body2 = ctx.createBiquadFilter(); body2.type = 'bandpass'; body2.frequency.value = 900; body2.Q.value = 1.6;
  const body2G = ctx.createGain(); body2G.gain.value = 0.3;
  const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 900; filter.Q.value = 2;
  filter.connect(master);
  body.connect(bodyG); bodyG.connect(master);
  body2.connect(body2G); body2G.connect(master);
  oscA.connect(oscG); oscB.connect(oscG);
  oscG.connect(filter); oscG.connect(body); oscG.connect(body2);
  sub.connect(subG); subG.connect(filter);

  const noiseLen = 2 * ctx.sampleRate;
  const noiseBuf = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
  const nd = noiseBuf.getChannelData(0);
  for (let i = 0; i < noiseLen; i++) nd[i] = (Math.random() * 2 - 1) * 0.35;
  const noiseSource = () => {
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true; return src;
  };

  // Combustion roughness, amplitude-modulated at the firing rate so it arrives in pulses
  // rather than as constant hiss.
  const noise = noiseSource();
  const ng = ctx.createGain(); ng.gain.value = 0.04;
  const pulseLfo = ctx.createOscillator(); pulseLfo.type = 'sawtooth'; pulseLfo.frequency.value = 40;
  const pulseDepth = ctx.createGain(); pulseDepth.gain.value = 0.03;
  pulseLfo.connect(pulseDepth); pulseDepth.connect(ng.gain);
  noise.connect(ng); ng.connect(filter);

  // Induction: air being dragged past a filter and down a runner.
  const indG = ctx.createGain(); indG.gain.value = 0;
  const indFilt = ctx.createBiquadFilter(); indFilt.type = 'bandpass'; indFilt.frequency.value = 1800; indFilt.Q.value = 1.2;
  const indNoise = noiseSource();
  indNoise.connect(indFilt); indFilt.connect(indG); indG.connect(master);

  // TURBO. A real turbo is not a pure tone — it is a narrow band of noise at the shaft's
  // rotating pressure field, sitting on a broadband rush of moving air. A bare sine is
  // the single biggest reason synthesised turbos sound fake, so the sine only marks the
  // pitch centre and the noise band carries the character.
  const whistle = ctx.createOscillator(); whistle.type = 'sine'; whistle.frequency.value = 3000;
  const whistleG = ctx.createGain(); whistleG.gain.value = 0;
  whistle.connect(whistleG); whistleG.connect(master);
  const bladeFilt = ctx.createBiquadFilter(); bladeFilt.type = 'bandpass';
  bladeFilt.frequency.value = 3000; bladeFilt.Q.value = 9;
  const bladeG = ctx.createGain(); bladeG.gain.value = 0;
  const bladeNoise = noiseSource();
  bladeNoise.connect(bladeFilt); bladeFilt.connect(bladeG); bladeG.connect(master);
  const rushFilt = ctx.createBiquadFilter(); rushFilt.type = 'bandpass';
  rushFilt.frequency.value = 1200; rushFilt.Q.value = 0.7;
  const rushG = ctx.createGain(); rushG.gain.value = 0;
  const rushNoise = noiseSource();
  rushNoise.connect(rushFilt); rushFilt.connect(rushG); rushG.connect(master);

  // Blow-off: trapped boost venting when the throttle shuts. It goes STRAIGHT to the
  // output — routed through master it gets ducked by the very compression that makes the
  // engine note loud, so it never cuts through.
  const bovFilt = ctx.createBiquadFilter(); bovFilt.type = 'bandpass'; bovFilt.frequency.value = 1500; bovFilt.Q.value = 0.9;
  const bovG = ctx.createGain(); bovG.gain.value = 0;
  const bovNoise = noiseSource();
  bovNoise.connect(bovFilt); bovFilt.connect(bovG); bovG.connect(outGain);

  // COMPRESSOR FLUTTER — the "stu-tu-tu". With the throttle shut and the wheel still
  // spinning, air stalls back across the compressor and surges forward again, over and
  // over. That is a PULSATION at 20-48 Hz, not a hiss, so it has to be gated air rather
  // than filtered noise. The gate's base value is 0.5 with a +/-0.5 square LFO so it
  // swings fully closed to fully open; leaving the base at 0 lets audio through at both
  // extremes, because negative gain only inverts phase.
  const flutFilt = ctx.createBiquadFilter(); flutFilt.type = 'bandpass';
  flutFilt.frequency.value = 850; flutFilt.Q.value = 2.4;
  const flutGate = ctx.createGain(); flutGate.gain.value = 0.5;
  const flutEnv = ctx.createGain(); flutEnv.gain.value = 0;
  const flutLfo = ctx.createOscillator(); flutLfo.type = 'square'; flutLfo.frequency.value = 28;
  const flutDepth = ctx.createGain(); flutDepth.gain.value = 0.55;
  flutLfo.connect(flutDepth); flutDepth.connect(flutGate.gain);
  const flutNoise = noiseSource();
  flutNoise.connect(flutFilt); flutFilt.connect(flutGate); flutGate.connect(flutEnv);
  flutEnv.connect(outGain);

  // EXHAUST WAVEGUIDE. Delay time sets the pipe's fundamental: f = 1 / (2 x delay).
  const pipeDelay = ctx.createDelay(0.05);
  pipeDelay.delayTime.value = 1 / (2 * 100);
  const pipeFb = ctx.createGain(); pipeFb.gain.value = 0.35;
  const pipeDamp = ctx.createBiquadFilter(); pipeDamp.type = 'lowpass'; pipeDamp.frequency.value = 1800;
  pipeDelay.connect(pipeDamp); pipeDamp.connect(pipeFb); pipeFb.connect(pipeDelay);
  const pipeOut = ctx.createGain(); pipeOut.gain.value = 0;
  pipeDamp.connect(pipeOut); pipeOut.connect(master);

  const pulseBus = ctx.createGain(); pulseBus.gain.value = 2.3;
  pulseBus.connect(filter); pulseBus.connect(body); pulseBus.connect(body2); pulseBus.connect(pipeDelay);

  // Six pulse variants at each end of the sharpness range. Real combustion events are
  // never identical, and one reused sample reads as synthetic no matter how it is
  // filtered.
  const softPulses = [0, 1, 2].map((v) => renderPulse(ctx, 0.15, v));
  const hardPulses = [0, 1, 2].map((v) => renderPulse(ctx, 0.95, v));

  const loopSources = {}, loopGains = {}, loopConnected = {};
  for (const layout of LAYOUTS) {
    const events = eventsFor(layout);
    loopSources[layout] = []; loopGains[layout] = []; loopConnected[layout] = false;
    for (let v = 0; v < LOOP_VARIANTS; v++) {
      const src = ctx.createBufferSource();
      src.buffer = renderCycleLoop(ctx, events, v);
      src.loop = true;
      const g = ctx.createGain(); g.gain.value = 0;
      src.connect(g);
      loopSources[layout].push(src); loopGains[layout].push(g);
    }
  }

  // Start each variant at a different point in its own cycle. Starting them together
  // means they begin phase-aligned and the ear hears one buffer, not two.
  for (const layout of LAYOUTS) {
    loopSources[layout].forEach((src, v) => {
      const cycleSec = 120 / LOOP_REF_RPM;
      src.start(0, (v / LOOP_VARIANTS) * cycleSec);
    });
  }
  oscA.start(); oscB.start(); sub.start(); pulseLfo.start(); flutLfo.start();
  noise.start(); indNoise.start(); bladeNoise.start(); rushNoise.start();
  bovNoise.start(); flutNoise.start();

  return {
    ctx, limiter, outGain, softClip, master, filter, body, bodyG, body2, body2G,
    oscA, oscB, oscG, sub, subG, ng, pulseLfo,
    indG, indFilt, whistle, whistleG, bladeFilt, bladeG, rushFilt, rushG,
    bovFilt, bovG, flutFilt, flutEnv, flutLfo,
    pipeDelay, pipeFb, pipeDamp, pipeOut, pulseBus,
    softPulses, hardPulses,
    loopSources, loopGains, loopConnected,
    loopBlend: new Array(LOOP_VARIANTS).fill(1), loopNextSwap: 0,
    // Slow per-variant rate offsets, redrawn on their own schedule so the loops keep
    // drifting rather than settling into a fixed beat.
    loopWander: new Array(LOOP_VARIANTS).fill(0), loopNextWander: 0,
    nextPulse: 0, pulseIdx: 0, prevBoostPsi: 0,
    // Cycle-to-cycle variation carries memory; see ACOUSTIC.COV_PERSISTENCE.
    // Far enough in the past that the first frame is never throttled away.
    cycleWander: 0, paramsAt: -1e9,
  };
}

/**
 * @typedef {object} EngineAudioFrame
 * @property {object} drive an `AcousticDrive` from `src/sim/acoustics.js`
 * @property {number} rpm engine speed
 * @property {string} configuration engine layout, keying {@link VOICING}
 * @property {number} load driver demand, 0..1 — a throttle position, not a physics term
 * @property {boolean} audible whether this engine should be heard at all right now
 * @property {boolean} cut whether fuel is cut (limiter, overrun)
 * @property {boolean} cranking whether the starter is turning it
 * @property {number} pipeDiaIn exhaust pipe diameter, inches
 * @property {boolean} openExhaust whether a cat-back or headers are fitted
 * @property {boolean} intakeFitted whether an intake is fitted
 * @property {number} boostPsi current boost, for detecting a lift
 */

/**
 * Pushes one frame of engine state into the graph.
 *
 * Everything is written with `setTargetAtTime` rather than stepped, so the parameters
 * glide and no update can click.
 *
 * @param {object} a the graph from {@link createEngineAudio}
 * @param {EngineAudioFrame} frame
 */
export function updateEngineAudio(a, frame) {
  const { drive, rpm, configuration, load, audible, cut, cranking, pipeDiaIn, openExhaust, intakeFitted, boostPsi } = frame;
  const t = a.ctx.currentTime;
  // A caller may push frames far faster than any of these values can be heard changing,
  // and each one is a scheduled automation event. Rate-limit them; the pulse scheduler
  // is deliberately not rate-limited, because its timing is the sound.
  if (t - a.paramsAt < 1 / PARAM_HZ) return;
  a.paramsAt = t;
  const voice = VOICING[configuration] || VOICING.I4;

  const fire = Math.max(6, drive.firingHz);
  a.oscA.frequency.setTargetAtTime(fire, t, 0.02);
  a.oscB.frequency.setTargetAtTime(fire, t, 0.02);
  a.sub.frequency.setTargetAtTime(fire / 2, t, 0.02);
  a.pulseLfo.frequency.setTargetAtTime(fire, t, 0.02);
  a.oscB.detune.setTargetAtTime(voice.detune, t, 0.2);
  a.oscG.gain.setTargetAtTime(voice.oscGain, t, 0.1);

  // Hand over from scheduled pulses to the looped train as the events fuse.
  const contMix = clamp01((fire - PULSE_FUSE_HZ) / PULSE_FUSE_SPAN_HZ);
  a.subG.gain.setTargetAtTime(voice.subGain + contMix * 0.06, t, 0.1);

  // Wander between loop variants at irregular intervals, so the top end never settles
  // into a held note. The interval is random, so it cannot line up with the loop period.
  if (t > a.loopNextSwap) {
    const target = Math.floor(Math.random() * LOOP_VARIANTS);
    a.loopBlend = a.loopBlend.map((_, k) => (k === target ? 1 : 0.2 + Math.random() * 0.25));
    a.loopNextSwap = t + 0.25 + Math.random() * 0.55;
  }
  // A real engine's speed micro-fluctuates from combustion variation, so its pitch is
  // never perfectly steady — and a dead-steady pitch is the giveaway for synthesis. The
  // depth of the wobble is the cycle-to-cycle variation the physics reported.
  const drift = 1 + (Math.random() - 0.5) * drive.cov * 0.3;
  // Each variant also gets its own slow rate offset, redrawn on an unrelated schedule.
  if (t > a.loopNextWander) {
    a.loopWander = a.loopWander.map(() => (Math.random() - 0.5) * drive.cov * LOOP_WANDER_PER_COV);
    a.loopNextWander = t + LOOP_WANDER_S * (0.6 + Math.random() * 0.8);
  }
  const blendSum = a.loopBlend.reduce((x, y) => x + y, 0);
  for (const layout of LAYOUTS) {
    const active = layout === configuration;
    // A gain of zero does not stop Web Audio processing a node, so inactive layouts are
    // disconnected outright rather than merely silenced.
    if (a.loopConnected[layout] !== active) {
      for (const g of a.loopGains[layout]) {
        try { if (active) g.connect(a.pulseBus); else g.disconnect(); } catch { /* already in that state */ }
      }
      a.loopConnected[layout] = active;
    }
    if (!active) continue;
    a.loopGains[layout].forEach((g, k) => {
      // Held apart by LOOP_DETUNE plus each variant's own wander, so they never lock.
      const spread = 1 + (k - (LOOP_VARIANTS - 1) / 2) * LOOP_DETUNE + a.loopWander[k];
      a.loopSources[layout][k].playbackRate.setTargetAtTime(
        Math.min(3.2, Math.max(0.2, (rpm / LOOP_REF_RPM) * drift * spread)), t, 0.12);
      g.gain.setTargetAtTime(
        audible ? contMix * levelToGain(drive.pulseLevel) * (a.loopBlend[k] / blendSum) : 0, t, 0.18);
    });
  }

  // THE EXHAUST SYSTEM. The pipe's fundamental is physics and arrives in the drive; how
  // hard it rings is not — a bigger bore radiates more at the mouth and reflects less,
  // and a cat-back removes the chambers that were doing the reflecting.
  const diaOpen = 0.72 + (pipeDiaIn - 2.5) * 0.20;
  a.pipeDelay.delayTime.setTargetAtTime(1 / (2 * drive.pipeHz), t, 0.15);
  // How hard the pipe is driven is an ENERGY question, not a volume one: what excites the
  // system is the enthalpy leaving through it, which is mass flow times how far above
  // ambient the gas is. Driving it from airflow alone would mean a retarded engine — which
  // sends the same air out much hotter — sounded identical to one at MBT.
  //
  // It also fixes idle. There the flow is slow and cool and the whole system is muffled;
  // leaving the pipe ringing there gives a metallic clang no real engine makes.
  const flow = Math.min(1, Math.max(0.14, 0.16 + drive.exhaustDrive * 0.9));
  a.pipeFb.gain.setTargetAtTime(
    Math.min(0.46, Math.max(0.16, (0.30 + flow * 0.20) - (pipeDiaIn - 2.5) * 0.05 - (openExhaust ? 0.04 : 0))), t, 0.12);
  a.pipeDamp.frequency.setTargetAtTime(420 + flow * (900 + diaOpen * 1200) + drive.sharpness * 500, t, 0.1);
  a.pipeOut.gain.setTargetAtTime(audible ? voice.pipeGain * (0.45 + 0.55 * flow) : 0, t, 0.12);

  // Blowdown sharpness opens the whole system up: a choked pulse carries far more high
  // frequency than a chuff, which is what "coming on song" sounds like.
  a.filter.frequency.setTargetAtTime((300 + fire * 7 + drive.sharpness * 2400) * diaOpen, t, 0.05);
  a.filter.Q.setTargetAtTime(voice.lowQ, t, 0.1);
  a.body.frequency.setTargetAtTime(voice.bodyHz, t, 0.15);
  a.body.Q.setTargetAtTime(voice.bodyQ, t, 0.15);
  a.body2.frequency.setTargetAtTime((720 + fire * 4) * diaOpen, t, 0.1);
  a.body2.Q.setTargetAtTime(voice.body2Q, t, 0.15);
  a.body2G.gain.setTargetAtTime(voice.body2Gain * (0.35 + 0.65 * clamp01(drive.sharpness)), t, 0.12);
  a.bodyG.gain.setTargetAtTime(0.5 + (pipeDiaIn - 2.5) * 0.22, t, 0.15);
  a.pulseBus.gain.setTargetAtTime(voice.pulseGain, t, 0.15);

  // Induction noise is the sound of air being moved, so it tracks airflow directly.
  a.indG.gain.setTargetAtTime(intakeFitted && audible ? drive.inductionLevel * 0.09 : 0, t, 0.06);

  if (drive.whistleHz > 0) {
    a.whistle.frequency.setTargetAtTime(drive.whistleHz, t, 0.07);
    a.whistleG.gain.setTargetAtTime(audible ? Math.min(0.012, boostPsi * 0.0014) * load : 0, t, 0.08);
    // The blade band sits at the same frequency but is noise, not a tone, and it carries
    // most of the character.
    a.bladeFilt.frequency.setTargetAtTime(drive.whistleHz, t, 0.07);
    a.bladeG.gain.setTargetAtTime(audible ? Math.min(0.22, (boostPsi / 14) * 0.19) * (0.35 + 0.65 * load) : 0, t, 0.08);
    a.rushFilt.frequency.setTargetAtTime(800 + drive.inductionLevel * 1600, t, 0.1);
    a.rushG.gain.setTargetAtTime(audible ? Math.min(0.21, drive.inductionLevel * 0.16) : 0, t, 0.1);
  } else {
    a.whistleG.gain.setTargetAtTime(0, t, 0.1);
    a.bladeG.gain.setTargetAtTime(0, t, 0.1);
    a.rushG.gain.setTargetAtTime(0, t, 0.1);
  }

  // A lift with boost still in the pipe vents it, and if there is nowhere for it to go it
  // stalls back across the compressor instead.
  const lifted = load < 0.15 || cut;
  if (a.prevBoostPsi > 1.5 && lifted && audible) {
    const stored = a.prevBoostPsi;
    a.flutLfo.frequency.setValueAtTime(Math.min(48, 20 + stored * 1.7), t);
    a.flutFilt.frequency.cancelScheduledValues(t);
    a.flutFilt.frequency.setValueAtTime(1000 + stored * 25, t);
    a.flutFilt.frequency.exponentialRampToValueAtTime(500, t + 0.55);
    a.flutEnv.gain.cancelScheduledValues(t);
    a.flutEnv.gain.setValueAtTime(Math.min(0.85, 0.30 + stored * 0.030), t);
    a.flutEnv.gain.exponentialRampToValueAtTime(0.0001, t + 0.65);

    a.bovG.gain.cancelScheduledValues(t);
    a.bovG.gain.setValueAtTime(Math.min(1.25, 0.55 + stored * 0.045), t);
    a.bovG.gain.exponentialRampToValueAtTime(0.0001, t + 0.95);
    a.bovFilt.frequency.cancelScheduledValues(t);
    a.bovFilt.frequency.setValueAtTime(3200 + stored * 95, t);
    a.bovFilt.frequency.exponentialRampToValueAtTime(420, t + 0.85);
    a.prevBoostPsi = 0;
  } else {
    a.prevBoostPsi = boostPsi;
  }

  // Combustion roughness rises with load, and knock adds a hard rattly edge on top —
  // the audible reason tuners fear it.
  a.ng.gain.setTargetAtTime(
    cranking ? 0.12 : 0.03 + load * 0.045 + contMix * 0.11 + drive.knockLevel * 0.06, t, 0.05);

  const gain = cut ? 0.10 : levelToGain(drive.pulseLevel);
  a.master.gain.setTargetAtTime(
    audible ? gain * (openExhaust ? 1.18 : 1) : 0, t, cut ? 0.015 : 0.06);
}

/**
 * Schedules the individual exhaust pulses due in the next frame.
 *
 * Call this every engine tick — it is what keeps the pulse train in step with RPM. Each
 * event is placed at its real crank angle, so the layout's firing rhythm comes out
 * without anything here knowing what a V8 is.
 *
 * @param {object} a the graph from {@link createEngineAudio}
 * @param {EngineAudioFrame} frame
 */
export function scheduleExhaustPulses(a, frame) {
  const { drive, rpm, audible, cut } = frame;
  if (!audible || rpm < 200) return;
  const now = a.ctx.currentTime;
  if (a.nextPulse < now) a.nextPulse = now + 0.02;

  const events = drive.events;
  if (events.length === 0) return;

  // Below the fusion point discrete pulses do the work; above it the looped train does.
  const pulseMix = 1 - clamp01((drive.firingHz - PULSE_FUSE_HZ) / PULSE_FUSE_SPAN_HZ);
  if (pulseMix <= 0.02) { a.nextPulse = now + 0.02; return; }

  const cycleSec = 120 / Math.max(rpm, 200);
  const level = (cut ? 0.14 : 1) * levelToGain(drive.pulseLevel);
  // A choked blowdown cracks, an unchoked one chuffs — pick the pulse to match.
  const bank = drive.sharpness > 0.5 ? a.hardPulses : a.softPulses;

  let guard = 0;
  while (a.nextPulse < now + SCHEDULE_AHEAD_S && guard++ < MAX_PULSES_PER_CALL) {
    const idx = a.pulseIdx % events.length;
    const src = a.ctx.createBufferSource();
    src.buffer = bank[Math.floor(Math.random() * bank.length)];
    // The rendered pulse is stretched to the duration the physics says this cylinder
    // takes to blow down — which tracks stroke and gas temperature. A long-stroke engine
    // gets a longer, lower pulse; a hot one a shorter, sharper one. Then a fraction of a
    // percent of per-event scatter on top, because no two combustion events are identical
    // and perfectly identical pulses are what make synthesis sound mechanical.
    src.playbackRate.value = drive.pulseRate * (0.97 + Math.random() * 0.06);
    const g = a.ctx.createGain();

    // CYCLE-TO-CYCLE VARIATION, WITH MEMORY. A diluted charge burns weakly, and a weak
    // cycle leaves more residual behind, so the cycle after it starts diluted too. That
    // correlation is the whole difference between a lope and a fizz: white noise on the
    // pulse amplitudes sounds like a gate chattering, and the same amount of variation
    // carried forward sounds like an engine loafing. See ACOUSTIC.COV_PERSISTENCE.
    const p = drive.covPersistence;
    a.cycleWander = a.cycleWander * p + (Math.random() * 2 - 1) * (1 - p);
    const misfired = Math.random() < drive.misfireRate;
    // sqrt(1 - p^2) keeps the variance the same as the uncorrelated case, so adding
    // memory changes the CHARACTER of the variation without quietly changing its depth.
    const wander = 1 + a.cycleWander * drive.cov * 2 / Math.sqrt(1 - p * p);
    g.gain.value = Math.max(0, level * pulseMix * (misfired ? 0.22 : 1) * wander);
    src.connect(g); g.connect(a.pulseBus);
    try { src.start(a.nextPulse); } catch { /* scheduling raced; skip this one */ }
    src.onended = () => { try { src.disconnect(); g.disconnect(); } catch { /* already gone */ } };

    // Advance to the next firing event by its real crank-angle gap.
    const next = events[(a.pulseIdx + 1) % events.length];
    const gapDeg = ((next.angleDeg - events[idx].angleDeg) + 720) % 720 || 720;
    a.nextPulse += (gapDeg / 720) * cycleSec;
    a.pulseIdx++;
  }
}

/**
 * Cancels every scheduled ramp and pins each layer to zero.
 *
 * Scheduled ramps — a blow-off, a flutter burst — can leave a gain parked open if a run
 * ends mid-ramp, so stopping is its own operation rather than a smoothed target the main
 * update happens to write.
 *
 * @param {object} a the graph from {@link createEngineAudio}
 */
export function silenceEngineAudio(a) {
  const t = a.ctx.currentTime;
  const kill = (node) => {
    if (!node) return;
    try { node.gain.cancelScheduledValues(t); node.gain.setValueAtTime(0, t); } catch { /* noop */ }
  };
  kill(a.master); kill(a.pipeOut); kill(a.indG);
  kill(a.whistleG); kill(a.bladeG); kill(a.rushG); kill(a.bovG); kill(a.flutEnv);
  for (const layout of LAYOUTS) for (const g of a.loopGains[layout]) kill(g);
  a.prevBoostPsi = 0;
}
