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
 * A NOTE ON `oscGain` AND `subGain`. They are a steady tonal bed at the firing order and
 * at half of it, and they are deliberately small. A real engine's tone is not a drone with
 * pulses laid over it — the tone IS the pulse train, heard fast enough that the ear fuses
 * it. Anything held steady underneath is the most static thing in the mix by definition,
 * and static is what a listener identifies as synthetic: measured, running these an octave
 * louder buries a third of the spectrum above 2 kHz and flattens the peak-to-average ratio
 * that makes the note read as mechanical. They are here to fill the very bottom, not to
 * carry the note.
 *
 * These are mixing decisions, not physics — the physics of why a V8 rumbles is the
 * firing geometry in `acoustics.js`, and it arrives here as the event list. What is
 * here is how each layout's exhaust system is shaped: a V8's collectors are large and
 * loose and blur its uneven pulses into a rumble, an inline four's are small and tight
 * so its widely spaced pulses stay individually audible.
 */
const VOICING = {
  I4: { bodyHz: 420, bodyQ: 1.4, body2Q: 2.2, body2Gain: 0.20, lowQ: 4.5, pulseGain: 0.95, pipeGain: 0.68, headerGain: 0.85, dryGain: 0.84, subGain: 0.020, oscGain: 0.016, detune: 16 },
  I6: { bodyHz: 300, bodyQ: 3.2, body2Q: 4.6, body2Gain: 0.32, lowQ: 5.6, pulseGain: 1.05, pipeGain: 0.86, headerGain: 0.72, dryGain: 0.68, subGain: 0.036, oscGain: 0.012, detune: 8 },
  V6: { bodyHz: 320, bodyQ: 3.6, body2Q: 5.0, body2Gain: 0.34, lowQ: 6.0, pulseGain: 1.05, pipeGain: 0.88, headerGain: 0.70, dryGain: 0.68, subGain: 0.032, oscGain: 0.012, detune: 9 },
  V8: { bodyHz: 240, bodyQ: 0.6, body2Q: 0.9, body2Gain: 0.10, lowQ: 1.1, pulseGain: 1.25, pipeGain: 1.10, headerGain: 0.55, dryGain: 0.60, subGain: 0.064, oscGain: 0.009, detune: 6 },
};

/** Layouts the looped pulse train is pre-rendered for. Must cover `VOICING`. */
const LAYOUTS = ['I4', 'I6', 'V6', 'V8'];

/** Engine speed the looped buffers are rendered at; playback rate scales from here. */
const LOOP_REF_RPM = 3000;

/**
 * Runner ring the pulse buffers are rendered at, Hz.
 *
 * Roughly a 3.5 L engine at load. Every build is pitched from here, so this is the one
 * number that decides whether a pulse sounds like a bark or a thud.
 */
const RUNNER_REF_HZ = 350;

/**
 * Where the open end of the tailpipe stops radiating like a piston and starts radiating
 * like a monopole, Hz — the frequency at which ka = 1.
 *
 * This is the single most important number in the whole renderer and it is why every
 * synthesised engine before this one sounded like a thud. A pipe mouth is not a
 * loudspeaker: below ka = 1 it radiates the gas flow itself, and above it the far-field
 * pressure follows the TIME DERIVATIVE of that flow. A derivative is +6 dB/octave, so the
 * same blowdown that is a soft chuff inside the pipe leaves the mouth with its leading
 * edge lifted by twenty-odd decibels. That lift is the crack.
 *
 * ka = 1 at f = c / (2*pi*a). A 2.75" tailpipe has a = 35 mm, and gas leaving it at
 * around 700 K carries c ~ 490 m/s, so f ~ 2.2 kHz. The buffers are rendered at that
 * reference and the runtime pipe diameter is carried by `diaOpen` on the filters
 * downstream, the same way `RUNNER_REF_HZ` is a rendering reference that playback rate
 * moves off.
 */
const RADIATION_REF_HZ = 2200;

/**
 * The shape of one blowdown, as flow rather than as sound.
 *
 * Everything here describes the gas: how fast the valve cracks (`RISE_*`), how long the
 * cylinder takes to vent (`TAU_*`), how hard the primary runner rings on the way out
 * (`RING_*`), and how much broadband noise the sonic jet at the valve seat makes
 * (`JET_*`). Turning that into what a listener hears is the radiation model above — none
 * of these numbers try to describe the sound directly, which is exactly why the result
 * survives being pitched, filtered and resonated downstream.
 *
 * The `_SOFT` value applies to an unchoked blowdown and the `_HARD` one to a fully choked
 * blowdown; `sharpness` from the physics crossfades between them.
 */
const PULSE = {
  /** Buffer length. Long enough for the body to decay, short enough to stay cheap. */
  LEN_S: 0.09,
  /** Valve-crack rise time: 0.30 ms unchoked, 0.08 ms choked. */
  RISE_SOFT_S: 0.00030,
  RISE_HARD_S: 0.00008,
  /** Blowdown time constant: 6.0 ms unchoked, 3.8 ms choked. */
  TAU_SOFT_S: 0.0060,
  TAU_HARD_S: 0.0038,
  /** How deeply the primary's quarter-wave modulates the escaping flow. */
  RING_MOD: 0.55,
  /** Ring decay, 1/s. A short lossy primary, so it rings for ~10 ms. */
  RING_DECAY_SOFT: 70,
  RING_DECAY_HARD: 130,
  /** Jet-noise level, and how far it is spread across the variants. */
  JET_SOFT: 0.07,
  JET_HARD: 0.16,
  /**
   * Where the jet noise sits. A sonic jet through a valve seat peaks at the Strouhal
   * frequency, St*U/D — with U near sonic and a seat gap of a few millimetres that lands
   * in the low kHz, and it climbs as the blowdown chokes harder. This is the rasp.
   */
  JET_HP_SOFT_HZ: 2200,
  JET_HP_HARD_HZ: 4800,
  JET_LP_HZ: 9000,
  /** How fast the jet dies: it stops when the flow stops being sonic, well before the ring. */
  JET_DECAY: 260,
  /** Filter make-up for the two-pole low-pass and one-pole high-pass on the noise. */
  JET_TRIM: 8,
  /** The collector volume underneath, as a fraction of the runner ring. */
  BODY_RATIO: 0.30,
  BODY_AMT: 0.30,
  BODY_DECAY: 45,
};

/**
 * Sharpness the looped buffers are rendered at.
 *
 * The loop only ever runs above the fusion point, and an engine spinning that fast is
 * choked on every event — so it is rendered hard rather than crossfaded, which keeps the
 * loop to two variants instead of four.
 */
const LOOP_SHARPNESS = 0.85;


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

/**
 * How much harder individual pulses vary than the mix as a whole.
 *
 * Modulating single combustion events is what "lumpy" IS; modulating the whole mix is a
 * tremolo. So the per-pulse term is the loud one and the mix-level swell underneath it is
 * comparatively gentle — get that balance the wrong way round and an engine wobbles
 * instead of loping.
 */
const LOPE_PULSE_RATIO = 2.15;

/** Pulse-to-pulse scatter that every engine has, lope or not. Small on purpose. */
const COMBUSTION_SCATTER = 0.06;

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
 * Overall trim.
 *
 * AN ENGINE IS A TRANSIENT TRAIN, AND ITS CREST FACTOR IS THE SOUND. Measured at the
 * pulse bus this renderer produces about 10 dB of crest — peaks around ten times the
 * running level, which is what a microphone in front of a real exhaust records. Run the
 * output stage hot enough and every one of those peaks is flattened into the ceiling: the
 * crest collapses to two or three decibels, the waveform becomes a slab, and no amount of
 * work on the pulse itself can be heard through it. That is what "digital" sounds like,
 * and it is a mixing fault rather than a synthesis one.
 *
 * So the whole chain is trimmed to leave the crest intact. This lands the bus at roughly
 * unity peak going into the limiter, the limiter is a safety net rather than a sound, and
 * the output sits around -12 dBFS RMS with peaks near -2 dBFS — which is a normal,
 * comfortable listening level with the dynamics still in it.
 */
const MASTER_TRIM = 0.30;

/** Make-up gain after the limiter, before the brickwall. */
const MAKEUP_GAIN = 2.4;

/** Quietest and loudest the exhaust may render, as a master gain. */
const GAIN_FLOOR = 0.055;
const GAIN_CEILING = 0.35;

/**
 * Trim on the layers that bypass the limiter — blow-off, flutter, gearchange.
 *
 * They go straight to the output so the compression that makes the engine dense cannot
 * duck them, which also means they are the only things in the mix not held down by it.
 * With the bed no longer slammed into the ceiling they need to come down with it.
 */
const EFFECT_TRIM = 0.45;

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
 * Writes one blowdown into `dest` at `offset`, wrapping at the end.
 *
 * WHAT A BLOWDOWN ACTUALLY IS, in the order it happens:
 *
 *   1. THE VALVE CRACKS. The cylinder is several bar above the manifold, so gas leaves
 *      through a sonic orifice the instant there is a gap. The flow rises in a fraction
 *      of a millisecond and then decays as the cylinder empties.
 *
 *   2. THE PRIMARY RINGS. The runner is closed at the valve and open into the collector,
 *      so it is a quarter-wave resonator at c/4L. The step excites it and it rings for
 *      about ten milliseconds. This is the bark.
 *
 *   3. THE JET ROARS. Sonic gas tearing past a valve seat is loud broadband noise,
 *      peaking near the Strouhal frequency of the gap — the low kHz. It stops as soon as
 *      the flow stops being sonic, so it is a leading rasp, not a hiss laid over
 *      everything.
 *
 * And then — this is the part that matters — it has to LEAVE THE PIPE. The mouth is not a
 * loudspeaker reproducing the pressure inside it. Below ka = 1 it radiates the flow; above
 * ka = 1 the far-field pressure follows dq/dt, which lifts the leading edge by 6 dB per
 * octave. Rendering the pressure inside the pipe and calling it the sound is precisely
 * what makes a synthesised engine a soft thud with no high frequency in it at all. See
 * {@link RADIATION_REF_HZ}.
 *
 * The flow is built first, radiated second, and only then is the jet noise added — the
 * jet is already sound when it is made, so it must not be differentiated a second time.
 *
 * @param {Float32Array} dest buffer to add into
 * @param {number} offset sample to start at
 * @param {number} sr sample rate
 * @param {number} sharpness 0..1 from `AcousticDrive.sharpness`
 * @param {number} ringHz the primary's quarter-wave ring
 * @param {() => number} rnd uniform 0..1 source
 */
function writeBlowdown(dest, offset, sr, sharpness, ringHz, rnd) {
  const len = Math.min(Math.floor(sr * PULSE.LEN_S), dest.length);
  const mix = (soft, hard) => soft + (hard - soft) * sharpness;

  const riseS = mix(PULSE.RISE_SOFT_S, PULSE.RISE_HARD_S);
  const tauS = mix(PULSE.TAU_SOFT_S, PULSE.TAU_HARD_S);
  const ringDecay = mix(PULSE.RING_DECAY_SOFT, PULSE.RING_DECAY_HARD);

  // 1-2: the gas flow leaving the port, with the primary ringing on top of it.
  const q = new Float32Array(len + 1);
  for (let i = 0; i <= len; i++) {
    const x = i / sr;
    const env = (1 - Math.exp(-x / riseS)) * Math.exp(-x / tauS);
    const ring = Math.sin(2 * Math.PI * ringHz * x) * Math.exp(-x * ringDecay);
    q[i] = env * (1 + PULSE.RING_MOD * ring);
  }

  // Radiation from the open end: flat below ka = 1, +6 dB/octave above it.
  const kRad = 1 / (2 * Math.PI * RADIATION_REF_HZ);
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) out[i] = q[i] + (q[i + 1] - q[i]) * sr * kRad;

  // 3: jet noise, band-limited around its Strouhal peak and gated by the sonic flow.
  // Two poles down at JET_LP_HZ, one pole up at the peak — a real jet rolls off both
  // sides, and white noise gated by an envelope is a hiss, not a rasp.
  const jetAmt = mix(PULSE.JET_SOFT, PULSE.JET_HARD);
  const kLp = Math.exp(-2 * Math.PI * PULSE.JET_LP_HZ / sr);
  const kHp = Math.exp(-2 * Math.PI * mix(PULSE.JET_HP_SOFT_HZ, PULSE.JET_HP_HARD_HZ) / sr);
  const bodyHz = ringHz * PULSE.BODY_RATIO;
  let lp1 = 0, lp2 = 0, hpY = 0, hpX = 0;
  for (let i = 0; i < len; i++) {
    const x = i / sr;
    const w = rnd() * 2 - 1;
    lp1 = w * (1 - kLp) + lp1 * kLp;
    lp2 = lp1 * (1 - kLp) + lp2 * kLp;
    hpY = kHp * (hpY + lp2 - hpX);
    hpX = lp2;
    out[i] += jetAmt * hpY * PULSE.JET_TRIM * Math.exp(-x * PULSE.JET_DECAY);
    // The collector volume underneath. It is a resonance of the space downstream, not a
    // feature of the flow through the valve, so it is added after the radiation term.
    out[i] += Math.sin(2 * Math.PI * bodyHz * x) * Math.exp(-x * PULSE.BODY_DECAY) * PULSE.BODY_AMT;
  }

  for (let i = 0; i < len; i++) dest[(offset + i) % dest.length] += out[i];
}

/** Removes DC and scales to unit peak, in place. */
function normalise(data) {
  let sum = 0;
  for (let i = 0; i < data.length; i++) sum += data[i];
  const mean = sum / data.length;
  let peak = 1e-9;
  for (let i = 0; i < data.length; i++) {
    data[i] -= mean;
    const a = Math.abs(data[i]);
    if (a > peak) peak = a;
  }
  for (let i = 0; i < data.length; i++) data[i] /= peak;
}

/**
 * Builds one exhaust pulse into a buffer, for the scheduled train.
 *
 * Rendered at a reference ring and pitched at playback: the ring and the vent duration
 * both scale with c/L, so they are exact inverses and one playback rate moves the whole
 * pulse correctly — a bigger engine's longer primary rings lower AND vents over a longer
 * time, together.
 *
 * @param {AudioContext} ctx
 * @param {number} sharpness 0..1 from `AcousticDrive.sharpness`
 * @param {number} runnerHz the primary's ring, from `AcousticDrive.runnerHz`
 * @param {number} variant which of the rendered variants this is
 * @returns {AudioBuffer}
 */
function renderPulse(ctx, sharpness, runnerHz, variant) {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * PULSE.LEN_S);
  const buf = ctx.createBuffer(1, len, sr);
  const data = buf.getChannelData(0);
  // Real runners are not all the same length, so each cylinder rings slightly differently.
  writeBlowdown(data, 0, sr, sharpness, runnerHz * (0.94 + variant * 0.05), Math.random);
  normalise(data);
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
 * It writes the SAME blowdown the scheduled train plays. Rendering something simpler here
 * would mean the sound changed character as the crossfade came in, which is audible and is
 * exactly what a listener hears as the moment it "turns into a synthesiser".
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
  const sr = ctx.sampleRate;
  const cycleSec = 120 / LOOP_REF_RPM;
  const len = Math.round(sr * cycleSec);
  const buf = ctx.createBuffer(1, len, sr);
  const data = buf.getChannelData(0);
  // A deterministic generator, so a buffer is identical every time it is built.
  let seed = 12345 + variant * 7919;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

  const ring = RUNNER_REF_HZ * (0.92 + variant * 0.06);
  for (const ev of events) {
    // The two collectors are different lengths, so they ring slightly differently.
    const bankRing = ring * (ev.bank === 1 ? 1.045 : 1);
    const start = Math.floor((ev.angleDeg / 720) * cycleSec * sr);
    writeBlowdown(data, start, sr, LOOP_SHARPNESS, bankRing, rnd);
  }
  normalise(data);
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
  // A SAFETY NET, NOT A SOUND. It is set to catch the top few decibels of the loudest
  // pulses and nothing else — see MASTER_TRIM for why it used to be doing far more than
  // that, and why an engine cannot survive it.
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -3;
  limiter.knee.value = 3;
  limiter.ratio.value = 4;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.15;
  const outGain = ctx.createGain(); outGain.gain.value = MAKEUP_GAIN;

  // A brickwall after the make-up gain. The limiter is a compressor, so a fast enough
  // transient still gets past it, and anything over full scale is HARD clipped by the
  // output — which is audible as a tearing edge on exactly the loudest pulses.
  //
  // Linear below the knee and rounded above it. A plain tanh is a saturator: it is
  // already bending the curve at half scale, so it eats the very transients this renderer
  // exists to produce. This one is transparent until the signal is nearly at the ceiling
  // and only then rounds over, which is what makes it a brickwall rather than a colour.
  const softClip = ctx.createWaveShaper();
  const curve = new Float32Array(1024);
  const knee = 0.72;
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    const a = Math.abs(x);
    curve[i] = a <= knee ? x
      : Math.sign(x) * (knee + (1 - knee) * Math.tanh((a - knee) / (1 - knee)));
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

  // LOPE, at the mix level. The per-pulse variation below is where a lumpy idle really
  // comes from, but a diluted engine also surges and dips as a whole across several
  // cycles, and that slow swell is a large part of what the ear recognises. One is the
  // texture, the other is the shape; both are needed.
  const lopeLfo = ctx.createOscillator(); lopeLfo.type = 'triangle'; lopeLfo.frequency.value = 6;
  const lopeDepth = ctx.createGain(); lopeDepth.gain.value = 0;
  lopeLfo.connect(lopeDepth); lopeDepth.connect(master.gain);

  // SHIFT CLUNK. A gear change is mechanical — dogs or synchros engaging make a short,
  // low, woody knock. Without it a shift is just a dip in level, which reads as a glitch
  // rather than as a gearchange. Straight to the output, so the limiter cannot duck it.
  const clunkFilt = ctx.createBiquadFilter();
  clunkFilt.type = 'bandpass'; clunkFilt.frequency.value = 190; clunkFilt.Q.value = 3.5;
  const clunkG = ctx.createGain(); clunkG.gain.value = 0;
  const clunkNoise = noiseSource();
  clunkNoise.connect(clunkFilt); clunkFilt.connect(clunkG); clunkG.connect(outGain);

  // TORQUE CONVERTER. A slipping converter has a fluid whine that rises with slip —
  // loudest off the line where the engine is spinning far faster than the gearbox input,
  // fading as it couples up. A manual has nothing equivalent, which is a large part of
  // why the two sound so different from a standstill.
  const convOsc = ctx.createOscillator(); convOsc.type = 'triangle'; convOsc.frequency.value = 320;
  const convFilt = ctx.createBiquadFilter();
  convFilt.type = 'bandpass'; convFilt.frequency.value = 500; convFilt.Q.value = 2.0;
  const convG = ctx.createGain(); convG.gain.value = 0;
  convOsc.connect(convFilt); convFilt.connect(convG); convG.connect(master);

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

  // THE EXHAUST AS TWO RESONATORS, because that is what it is.
  //
  // HEADER PRIMARY — short, closed at the valve, open into the collector. A quarter-wave
  // tube at c/4L, 300-450 Hz on real geometry. This is the BARK: the mid-band edge that
  // separates an engine note from a thump. It is short and lossy, so it rings only briefly.
  const hdrDelay = ctx.createDelay(0.02);
  hdrDelay.delayTime.value = 1 / (2 * RUNNER_REF_HZ);
  const hdrFb = ctx.createGain(); hdrFb.gain.value = 0.30;
  const hdrDamp = ctx.createBiquadFilter();
  hdrDamp.type = 'lowpass'; hdrDamp.frequency.value = 3200;
  hdrDelay.connect(hdrDamp); hdrDamp.connect(hdrFb); hdrFb.connect(hdrDelay);
  const hdrOut = ctx.createGain(); hdrOut.gain.value = 0;
  hdrDamp.connect(hdrOut);

  // TAILPIPE — long, open at the far end, f = c/2L, 50-130 Hz. This is the body.
  //
  // TWO OF THEM, a few per cent different in length, panned apart. A real car has two banks
  // down two pipes of different length, and a real listener has two ears; a single mono
  // resonator is the reason synthesised engines sound like they are inside your head rather
  // than in front of you. Two independent resonators decorrelate genuinely, so this widens
  // without the phasiness a delay-and-invert trick would bring.
  const makePipe = (lengthScale, pan) => {
    const delay = ctx.createDelay(0.05);
    delay.delayTime.value = (1 / (2 * 100)) * lengthScale;
    const fb = ctx.createGain(); fb.gain.value = 0.35;
    const damp = ctx.createBiquadFilter(); damp.type = 'lowpass'; damp.frequency.value = 1800;
    delay.connect(damp); damp.connect(fb); fb.connect(delay);
    const out = ctx.createGain(); out.gain.value = 0;
    const panner = ctx.createStereoPanner(); panner.pan.value = pan;
    damp.connect(out); out.connect(panner); panner.connect(master);
    return { delay, fb, damp, out, lengthScale };
  };
  const pipeA = makePipe(1.0, -0.55);
  const pipeB = makePipe(1.035, 0.55);
  // Kept under the old names so callers that only know about "the pipe" still work.
  const pipeDelay = pipeA.delay, pipeFb = pipeA.fb, pipeDamp = pipeA.damp, pipeOut = pipeA.out;
  hdrOut.connect(master);

  const pulseBus = ctx.createGain(); pulseBus.gain.value = 2.3;
  pulseBus.connect(filter); pulseBus.connect(body); pulseBus.connect(body2);
  pulseBus.connect(pipeA.delay); pulseBus.connect(pipeB.delay); pulseBus.connect(hdrDelay);

  // THE DIRECT PATH, and it is not optional.
  //
  // Every branch above is a resonator or a band, and every one of them is low-passed:
  // 900 Hz on the tone filter, 1.8 kHz in the pipes, 3.2 kHz in the header. Routed only
  // through those, a pulse loses its entire leading edge before it reaches the output —
  // measured, less than half a per cent of the energy above 2 kHz, which is a thud with
  // some resonance behind it and not an engine.
  //
  // A listener standing beside a car hears the mouth of the pipe directly as well as
  // everything the system rings at, so the pulse train also goes STRAIGHT to master at
  // full bandwidth. A gentle tilt takes the very top off, because air absorption and the
  // mouth's directivity do too — but the crack survives.
  const dryTilt = ctx.createBiquadFilter();
  dryTilt.type = 'highshelf';
  dryTilt.frequency.value = 5200;
  dryTilt.gain.value = -6;
  const pulseDry = ctx.createGain(); pulseDry.gain.value = 0;
  pulseBus.connect(dryTilt); dryTilt.connect(pulseDry); pulseDry.connect(master);

  // Six pulse variants at each end of the sharpness range. Real combustion events are
  // never identical, and one reused sample reads as synthetic no matter how it is
  // filtered.
  // Rendered once at a reference runner frequency and pitched at playback. The ring and
  // the envelope both scale with c/L, so one playback rate moves the whole pulse correctly:
  // a bigger engine's longer primary rings lower AND vents over a longer time, together.
  const softPulses = [0, 1, 2].map((v) => renderPulse(ctx, 0.15, RUNNER_REF_HZ, v));
  const hardPulses = [0, 1, 2].map((v) => renderPulse(ctx, 0.95, RUNNER_REF_HZ, v));

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
  lopeLfo.start(); convOsc.start();
  noise.start(); indNoise.start(); bladeNoise.start(); rushNoise.start();
  bovNoise.start(); flutNoise.start(); clunkNoise.start();

  return {
    ctx, limiter, outGain, softClip, master, filter, body, bodyG, body2, body2G,
    oscA, oscB, oscG, sub, subG, ng, pulseLfo,
    indG, indFilt, whistle, whistleG, bladeFilt, bladeG, rushFilt, rushG,
    bovFilt, bovG, flutFilt, flutEnv, flutLfo, lopeLfo, lopeDepth,
    pulseDry, dryTilt,
    clunkFilt, clunkG, convOsc, convFilt, convG,
    pipeDelay, pipeFb, pipeDamp, pipeOut, pipeA, pipeB,
    hdrDelay, hdrFb, hdrDamp, hdrOut, pulseBus,
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
 * @property {number} [volume] player-facing master volume, 1 being the tuned balance
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
  const drift = 1 + (Math.random() - 0.5) * Math.min(drive.cov, 0.06) * 0.3;
  // Each variant also gets its own slow rate offset, redrawn on an unrelated schedule.
  if (t > a.loopNextWander) {
    // Capped: this is meant to stop two loops phase-locking, not to add vibrato.
    a.loopWander = a.loopWander.map(
      () => (Math.random() - 0.5) * Math.min(drive.cov, 0.06) * LOOP_WANDER_PER_COV);
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
      // Rate carries engine speed. The loop's pulses were baked at RUNNER_REF_HZ and the
      // firing angles are baked with them, so pitching by RPM keeps both correct; the
      // header resonator downstream is what re-tunes the bark for this engine.
      a.loopSources[layout][k].playbackRate.setTargetAtTime(
        Math.min(3.2, Math.max(0.2, (rpm / LOOP_REF_RPM) * drift * spread)), t, 0.12);
      g.gain.setTargetAtTime(
        audible ? contMix * levelToGain(drive.pulseLevel) * (a.loopBlend[k] / blendSum) : 0, t, 0.18);
    });
  }

  // --- How the tune is VOICED -------------------------------------------------------
  // These are rendering decisions about measurements the drive reports, not physics:
  // the model says the burn finished late and the gas left hot, and what follows decides
  // that this should be heard as rasp rather than as anything else.
  //
  // RASP. Burning later dumps more of the heat through the valve instead of into the
  // crank, and an exhaust carrying more energy is harder and brighter.
  const rasp = clamp01(drive.retardDeg / 12);
  // RICHNESS. A rich charge burns slower and softer; lean is sharp and thin.
  const richness = Math.max(-0.4, Math.min(0.8, (1 - drive.lambda) * 2.2));
  // BITE. A higher-compression engine has a faster pressure rise behind each pulse.
  const crBite = Math.max(-0.2, Math.min(0.25, (drive.compression - 10.3) * 0.06));
  // DEPTH. A bigger engine moves more gas per pulse, so its exhaust system is larger and
  // everything about it sits lower.
  const dispDepth = Math.max(0.6, Math.min(1.6, 3.5 / Math.max(drive.displacementL, 1.2)));

  // THE EXHAUST SYSTEM. The pipe's fundamental is physics and arrives in the drive; how
  // hard it rings is not — a bigger bore radiates more at the mouth and reflects less,
  // and a cat-back removes the chambers that were doing the reflecting.
  const diaOpen = 0.72 + (pipeDiaIn - 2.5) * 0.20;
  for (const pipe of [a.pipeA, a.pipeB]) {
    pipe.delay.delayTime.setTargetAtTime((1 / (2 * drive.pipeHz)) * pipe.lengthScale, t, 0.15);
  }
  // The header rings at the runner's quarter-wave, which moves with gas temperature — so
  // the bark sharpens as the engine heats, exactly as the body does.
  a.hdrDelay.delayTime.setTargetAtTime(1 / (2 * drive.runnerHz), t, 0.15);
  // How hard the pipe is driven is an ENERGY question, not a volume one: what excites the
  // system is the enthalpy leaving through it, which is mass flow times how far above
  // ambient the gas is. Driving it from airflow alone would mean a retarded engine — which
  // sends the same air out much hotter — sounded identical to one at MBT.
  //
  // It also fixes idle. There the flow is slow and cool and the whole system is muffled;
  // leaving the pipe ringing there gives a metallic clang no real engine makes.
  const flow = Math.min(1, Math.max(0.14, 0.16 + drive.exhaustDrive * 0.9));
  const fb = Math.min(0.46, Math.max(0.16,
    (0.30 + flow * 0.20) - (pipeDiaIn - 2.5) * 0.05 - (openExhaust ? 0.04 : 0)));
  const damp = 420 + flow * (900 + diaOpen * 1200) + rasp * 500;
  for (const pipe of [a.pipeA, a.pipeB]) {
    pipe.fb.gain.setTargetAtTime(fb, t, 0.12);
    pipe.damp.frequency.setTargetAtTime(damp, t, 0.1);
    // Each side carries half, so the pair sums to the level one mono pipe used to.
    pipe.out.gain.setTargetAtTime(audible ? voice.pipeGain * (0.45 + 0.55 * flow) * 0.62 : 0, t, 0.12);
  }
  // The header's ring is short and stiff. It leads with load rather than with flow, because
  // what excites it is the shock at the valve, not the volume moving downstream.
  a.hdrFb.gain.setTargetAtTime(0.20 + drive.sharpness * 0.20, t, 0.12);
  a.hdrDamp.frequency.setTargetAtTime(1600 + drive.sharpness * 2600 + rasp * 900, t, 0.1);
  a.hdrOut.gain.setTargetAtTime(
    audible ? voice.headerGain * (0.30 + 0.70 * clamp01(drive.sharpness)) : 0, t, 0.12);

  // Blowdown sharpness opens the whole system up: a choked pulse carries far more high
  // frequency than a chuff, which is what "coming on song" sounds like. Retard brightens
  // it further, a bigger engine sits lower, and compression sharpens the leading edge.
  a.filter.frequency.setTargetAtTime(
    (300 + fire * 7 + Math.max(load, drive.sharpness) * 2400)
      * diaOpen * (1 / dispDepth) * (1 + rasp * 0.45 + crBite), t, 0.05);
  a.filter.Q.setTargetAtTime(voice.lowQ * (1 + crBite), t, 0.1);
  a.body.frequency.setTargetAtTime(voice.bodyHz / dispDepth, t, 0.15);
  a.body.Q.setTargetAtTime(voice.bodyQ, t, 0.15);
  a.body2.frequency.setTargetAtTime((720 + fire * 4) * diaOpen * (1 + rasp * 0.3), t, 0.1);
  a.body2.Q.setTargetAtTime(voice.body2Q, t, 0.15);
  a.body2G.gain.setTargetAtTime(
    (voice.body2Gain + rasp * 0.18) * (0.35 + 0.65 * load), t, 0.12);
  a.bodyG.gain.setTargetAtTime((0.5 + (pipeDiaIn - 2.5) * 0.22) * dispDepth, t, 0.15);
  a.pulseBus.gain.setTargetAtTime(voice.pulseGain, t, 0.15);

  // How much of the raw pulse train reaches the output unfiltered. A choked blowdown
  // radiates a far harder edge than a chuff does, and an open exhaust has no chambers
  // left to absorb it — so this leads with sharpness and opens further with the pipe.
  // At idle it is small: the flow there is slow and subsonic and there is very little
  // edge to hear.
  a.dryTilt.frequency.setTargetAtTime(4200 + drive.sharpness * 2600, t, 0.1);
  a.pulseDry.gain.setTargetAtTime(
    audible ? voice.dryGain * (0.22 + 0.78 * clamp01(drive.sharpness))
      * (openExhaust ? 1.25 : 1) * diaOpen : 0, t, 0.12);

  // The slow swell of a diluted idle, on top of the per-pulse variation. It runs at a
  // sub-multiple of the firing rate and washes out as the engine revs and the burn evens
  // up — which is why a cammed engine loafs at idle and cleans up on the way to redline.
  a.lopeLfo.frequency.setTargetAtTime(Math.max(1.8, Math.min(11, fire / 7)), t, 0.15);
  // Zero on a stock cam. This modulates the whole mix, so anything above zero here is
  // heard on every engine — which is exactly the wobble a smooth idle must not have.
  a.lopeDepth.gain.setTargetAtTime(audible ? Math.min(0.42, drive.lopeSeverity) : 0, t, 0.12);

  // Induction noise is the sound of air being moved, so it tracks airflow directly.
  a.indG.gain.setTargetAtTime(intakeFitted && audible ? drive.inductionLevel * 0.09 : 0, t, 0.06);

  if (drive.whistleHz > 0) {
    const boostFrac = Math.min(1.4, Math.max(0, boostPsi / 14));
    a.whistle.frequency.setTargetAtTime(drive.whistleHz, t, 0.07);
    a.whistleG.gain.setTargetAtTime(audible ? Math.min(0.012, boostPsi * 0.0014) * load : 0, t, 0.08);
    // The blade band sits at the same frequency but is noise, not a tone, and it carries
    // most of the character.
    a.bladeFilt.frequency.setTargetAtTime(drive.whistleHz, t, 0.07);
    a.bladeG.gain.setTargetAtTime(audible ? Math.min(0.22, boostFrac * 0.19) * (0.35 + 0.65 * load) : 0, t, 0.08);
    a.rushFilt.frequency.setTargetAtTime(800 + drive.inductionLevel * 1600, t, 0.1);
    // A small boosted engine is mostly induction noise — on a turbo four the whoosh
    // genuinely dominates the exhaust, which is why they sound so unlike a big naturally
    // aspirated engine making the same power.
    const smallEngineBias = Math.max(0.7, Math.min(2.1, 2.6 / Math.max(drive.displacementL, 1.2)));
    a.rushG.gain.setTargetAtTime(
      audible ? Math.min(0.21, drive.inductionLevel * 0.10 * (0.4 + boostFrac) * smallEngineBias) : 0, t, 0.1);
    a.rushFilt.Q.setTargetAtTime(configuration === 'I4' ? 0.45 : 0.8, t, 0.15);
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
    a.flutEnv.gain.setValueAtTime(EFFECT_TRIM * Math.min(0.85, 0.30 + stored * 0.030), t);
    a.flutEnv.gain.exponentialRampToValueAtTime(0.0001, t + 0.65);

    a.bovG.gain.cancelScheduledValues(t);
    a.bovG.gain.setValueAtTime(EFFECT_TRIM * Math.min(1.25, 0.55 + stored * 0.045), t);
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
    cranking ? 0.12
      : 0.03 + load * 0.045 + contMix * 0.11
        + Math.max(0, richness) * 0.03 + drive.knockLevel * 0.06, t, 0.05);

  a.outGain.gain.setTargetAtTime(MAKEUP_GAIN * (frame.volume ?? 1), t, 0.08);
  const gain = cut ? 0.10 : levelToGain(drive.pulseLevel);
  a.master.gain.setTargetAtTime(
    audible ? gain * (openExhaust ? 1.18 : 1) : 0, t, cut ? 0.015 : 0.06);
}

/**
 * Fires a gear-change noise.
 *
 * A manual disconnects completely: the note falls away, the dogs engage with a hard
 * mechanical knock, and it catches again as the clutch comes back out. An automatic never
 * disconnects at all — a converter is a fluid coupling, so the engine keeps driving the
 * car through the change and you get a soft dip and a swell instead of a gap, with no
 * engagement noise to hear.
 *
 * @param {object} a the graph from {@link createEngineAudio}
 * @param {{automatic: boolean}} opts
 */
export function shiftEngineAudio(a, { automatic }) {
  const t = a.ctx.currentTime;
  const back = a.master.gain.value > 0.05 ? a.master.gain.value : 0.7;
  a.master.gain.cancelScheduledValues(t);
  a.master.gain.setValueAtTime(a.master.gain.value, t);
  a.clunkG.gain.cancelScheduledValues(t);
  a.clunkFilt.frequency.cancelScheduledValues(t);

  if (automatic) {
    a.master.gain.linearRampToValueAtTime(back * 0.62, t + 0.05);   // slips, never releases
    a.master.gain.linearRampToValueAtTime(back * 1.06, t + 0.15);   // clutch packs take up
    a.master.gain.linearRampToValueAtTime(back, t + 0.26);
    // A soft low swell rather than a knock — the shift you feel more than hear.
    a.clunkG.gain.setValueAtTime(0.0001, t + 0.03);
    a.clunkG.gain.linearRampToValueAtTime(EFFECT_TRIM * 0.13, t + 0.09);
    a.clunkG.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
    a.clunkFilt.frequency.setValueAtTime(120, t + 0.03);
    a.clunkFilt.Q.setValueAtTime(1.2, t + 0.03);
  } else {
    a.master.gain.linearRampToValueAtTime(0.03, t + 0.045);         // clutch in
    a.master.gain.setValueAtTime(0.03, t + 0.13);                   // gap while shifting
    a.master.gain.linearRampToValueAtTime(back * 1.12, t + 0.20);   // clutch out, flare
    a.master.gain.linearRampToValueAtTime(back, t + 0.30);
    a.clunkG.gain.setValueAtTime(0.0001, t + 0.10);
    a.clunkG.gain.linearRampToValueAtTime(EFFECT_TRIM * 0.55, t + 0.118);
    a.clunkG.gain.exponentialRampToValueAtTime(0.0001, t + 0.20);
    a.clunkFilt.Q.setValueAtTime(3.5, t + 0.10);
    a.clunkFilt.frequency.setValueAtTime(240, t + 0.10);
    a.clunkFilt.frequency.exponentialRampToValueAtTime(140, t + 0.20);
  }
}

/**
 * Sets the torque-converter whine.
 *
 * @param {object} a the graph from {@link createEngineAudio}
 * @param {{rpm: number, slip: number, audible: boolean}} opts slip is 0 (locked up) to 1
 */
export function converterEngineAudio(a, { rpm, slip, audible }) {
  const t = a.ctx.currentTime;
  a.convOsc.frequency.setTargetAtTime(240 + rpm * 0.055, t, 0.08);
  a.convFilt.frequency.setTargetAtTime(420 + rpm * 0.09, t, 0.08);
  a.convG.gain.setTargetAtTime(audible ? Math.max(0, Math.min(1, slip)) * 0.055 : 0, t, 0.1);
}

/**
 * Plays a short tone. Used for the staging-tree lights, and as an audio self-test —
 * if this is silent the problem is the device or the browser, not the engine model.
 *
 * @param {object} a the graph from {@link createEngineAudio}
 * @param {{hz: number, seconds: number, gain: number}} opts
 */
export function beepEngineAudio(a, { hz, seconds, gain }) {
  const t = a.ctx.currentTime;
  const osc = a.ctx.createOscillator(); osc.type = 'sine'; osc.frequency.value = hz;
  const g = a.ctx.createGain(); g.gain.value = 0;
  osc.connect(g); g.connect(a.outGain);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
  osc.start(t); osc.stop(t + seconds + 0.05);
  osc.onended = () => { try { osc.disconnect(); g.disconnect(); } catch { /* already gone */ } };
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
    // Pitched from the RUNNER RING, because that is the audible constraint: the buffer was
    // rendered at RUNNER_REF_HZ and has to land on this engine's primary. The envelope
    // follows for free — ring frequency and vent duration both scale with c/L, so they are
    // exact inverses and one rate moves both correctly. `drive.pulseRate` is the same
    // scaling seen from the blowdown-duration side and is what the physics bench reports.
    src.playbackRate.value = (drive.runnerHz / RUNNER_REF_HZ) * (0.97 + Math.random() * 0.06);
    const g = a.ctx.createGain();

    // CYCLE-TO-CYCLE VARIATION, WITH MEMORY. A diluted charge burns weakly, and a weak
    // cycle leaves more residual behind, so the cycle after it starts diluted too. That
    // correlation is the whole difference between a lope and a fizz: white noise on the
    // pulse amplitudes sounds like a gate chattering, and the same amount of variation
    // carried forward sounds like an engine loafing. See ACOUSTIC.COV_PERSISTENCE.
    // A diluted charge burns weakly, and occasionally not at all. This is where a lumpy
    // idle actually comes from — individual combustion events being unequal, not the whole
    // mix being modulated. On a stock cam `lopeSeverity` is zero and this is a no-op.
    //
    // Two shapes, because a lope has both. The product of two slow sines is a
    // deterministic drift with no repeat period the ear can latch onto, and it is what
    // makes it LOAF rather than merely wobble. The first-order term is the stochastic
    // part — one weak cycle making the next one weak — kept small so it textures the
    // loafing rather than replacing it with noise.
    const severity = Math.min(0.85, drive.lopeSeverity * LOPE_PULSE_RATIO);
    const p = drive.covPersistence;
    a.cycleWander = a.cycleWander * p + (Math.random() * 2 - 1) * (1 - p);
    const loaf = 0.5 + 0.5 * Math.sin(a.pulseIdx * 0.55) * Math.sin(a.pulseIdx * 0.17);
    const misfired = Math.random() < drive.misfireRate;
    const wander = (1 - severity * loaf * 0.75) * (1 + a.cycleWander * COMBUSTION_SCATTER);
    g.gain.value = Math.max(0, level * pulseMix * (misfired ? 0.25 : 1) * wander);
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
  kill(a.master); kill(a.pipeA.out); kill(a.pipeB.out); kill(a.hdrOut);
  kill(a.pulseDry); kill(a.indG);
  kill(a.whistleG); kill(a.bladeG); kill(a.rushG); kill(a.bovG); kill(a.flutEnv);
  kill(a.clunkG); kill(a.convG); kill(a.lopeDepth);
  for (const layout of LAYOUTS) for (const g of a.loopGains[layout]) kill(g);
  a.prevBoostPsi = 0;
}
