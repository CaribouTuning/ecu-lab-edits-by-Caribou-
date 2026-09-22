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
 * WHERE the events fall. One per firing event, at the crank angles `firingEvents` gives,
 * because that is cheap and exact. A cross-plane V8's banks are offset, so its events are
 * unevenly spaced, and that unevenness is the rumble. Nothing here describes how a layout
 * sounds; the layout's firing order is played and the sound follows.
 *
 * Every event is scheduled at every engine speed. There is no looped layer: an earlier
 * version crossfaded to a pre-rendered cycle at high revs and ran two detuned copies of it,
 * which is a flanger, and was heard as a whoosh on the way up and down.
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

/**
 * The two things that push gas out of a cylinder, and their share of the note.
 *
 * BLOWDOWN is the overpressure pulse: the cylinder is above atmospheric when the valve
 * cracks and the difference drives the flow. It is most of the note under load.
 *
 * DISPLACEMENT is the piston sweeping the rest out on the exhaust stroke. It is there
 * whether or not there is any overpressure left, which matters more than it sounds: ON A
 * CLOSED THROTTLE WITH THE FUEL CUT THERE IS NO BLOWDOWN AT ALL. The cylinder reaches valve
 * opening at around 48 kPa, well BELOW atmospheric, so a model with only a blowdown term
 * goes silent exactly where a real engine does not — and then slams back in under load,
 * which is what a first cut of this did. An overrun is quiet, not mute, and what you hear
 * is this term. A firing idle still burns and arrives at about 150 kPa, so it has both.
 *
 * Their ratio is what it is because they are different mechanisms, not a mix knob: one
 * scales with pressure difference, the other with how fast the piston is moving the gas.
 */
const BLOWDOWN_GAIN = 0.30;
const DISPLACEMENT_GAIN = 2.0;

/**
 * The flow event.
 *
 * WHAT A REAL EXHAUST MOSTLY IS. Measured against real recordings, an earlier version of
 * this was twenty to a hundred times too TONAL: 82-96% of its energy sat in twenty
 * frequency bins, against 35-63% for real engines, with a spectral flatness of 0.001-0.008
 * against 0.07-0.13. It was a short, smooth pulse per event rung through resonant pipes,
 * which is a tone generator — and it sounded like one.
 *
 * What was missing is that gas does not leave a cylinder as a click. It leaves over the
 * whole exhaust stroke, half a revolution, and most of what you hear is the TURBULENCE of
 * that flow: broadband noise whose loudness follows the gas velocity through the stroke,
 * and whose brightness rises with it (a Strouhal scaling — faster flow sheds smaller
 * eddies, which are higher-pitched). On top sits the low-frequency pressure the moving gas
 * radiates, which for a monopole source is the RATE OF CHANGE of the volume flow — a
 * single zero-mean cycle per event, not a bump — and, under load, the blowdown crack at the
 * front of it.
 *
 * Events overlap: a V8 fires every 90 degrees and each stroke lasts 180, so two are always
 * in flight. That overlap is why a V8 burbles continuously where a four putts.
 *
 * Rendered on a small pool of always-running noise VOICES with scheduled gain curves, not a
 * node per event — so nothing is allocated per firing and nothing repeats: the noise never
 * loops audibly and no two events share a waveform.
 */
const VOICES = 6;
const NOISE_SECONDS = 3;
const CURVE_POINTS = 32;
/** How the event's energy divides between turbulence, radiated flow and the blowdown crack. */
const NOISE_SHARE = 1.0;
const FLOW_SHARE = 0.35;
const SPIKE_SHARE = 1.8;

/**
 * Cycle-to-cycle variation.
 *
 * No two combustion events are alike — COV of IMEP runs about 1-3% under load and far more
 * at a throttled idle — and no two arrive exactly on time. A perfectly periodic train has a
 * perfectly harmonic line spectrum, and the ear reads that as synthesis immediately. These
 * scatter each event's size and timing by about what a real engine does.
 */
const COV_LOADED = 0.03;
const COV_IDLE = 0.08;
const JITTER_OF_GAP = 0.006;

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
const OUT_TRIM = 0.05;

/**
 * The listener stage.
 *
 * `blowdown` returns a PHYSICAL amplitude and is left alone, because the physics is what
 * makes the note respond to the engine. But physical amplitude is not what a listener
 * hears. A real engine spans roughly 75 dB(A) at idle to 105 at full load, and everything
 * in the chain between the tailpipe and an ear compresses that: the ear itself is
 * logarithmic, a recording is limited, and a phone speaker has perhaps 40 dB to work with
 * in a room that is not silent.
 *
 * Rendered linearly the way a microphone at the pipe would see it, idle came out 30 dB
 * under full load — and, because the starter layer is fixed, QUIETER THAN ITS OWN STARTER.
 * The engine caught and appeared to die. Raising the physics to a power below one keeps
 * the ordering and the responses exactly as the model computes them and compresses the
 * range to something a listener has a hope of hearing at both ends: about 16 dB.
 *
 * This is the one deliberately perceptual number in the file, which is why it is here
 * rather than buried in `blowdown`.
 */
const LISTENER_EXPONENT = 0.45;

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

/** A standard normal deviate, by Box-Muller. */
function gauss() {
  const u = 1 - Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random());
}

/**
 * One flow voice: a never-repeating turbulence source and a radiated-flow source, each
 * behind a gain that a firing event drives with a curve.
 *
 * @param {AudioContext} ctx
 * @param {AudioNode} bus
 * @returns {Record<string, any>}
 */
function makeVoice(ctx, bus) {
  const length = Math.floor(ctx.sampleRate * NOISE_SECONDS);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  // PINK, not white. Turbulent jet noise falls with frequency above its Strouhal peak, and
  // white noise read by an ear, which hears in proportional bands, is a hiss that rises
  // three decibels an octave. Paul Kellet's economy filter: within half a decibel of 1/f.
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < length; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.99765 * b0 + w * 0.0990460;
    b1 = 0.96300 * b1 + w * 0.2965164;
    b2 = 0.57000 * b2 + w * 1.0526913;
    data[i] = (b0 + b1 + b2 + w * 0.1848) * 0.25;
  }
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  noise.loop = true;
  const floor = ctx.createBiquadFilter();
  floor.type = 'highpass';
  floor.frequency.value = 45;
  floor.Q.value = 0.5;
  // Turbulence is a BAND, not a hiss: it peaks at a Strouhal frequency set by how fast the
  // gas is moving and falls away either side. The floor under it and the shelf over it
  // both follow gas velocity, set per event. Without the floor, the pink bed's lows piled
  // up into a hum at idle; without the shelf being gentle, the top end died and it booped.
  const turbulence = ctx.createBiquadFilter();
  turbulence.type = 'highshelf';
  turbulence.frequency.value = 900;
  turbulence.gain.value = -6;
  const noiseGain = ctx.createGain();
  noiseGain.gain.value = 0;
  noise.connect(floor);
  floor.connect(turbulence);
  turbulence.connect(noiseGain);
  noiseGain.connect(bus);

  // The radiated flow is a shaped DC source: a ConstantSource where the platform has one,
  // otherwise a looping buffer of ones, which is the same signal.
  let flow;
  if (typeof ctx.createConstantSource === 'function') {
    flow = ctx.createConstantSource();
  } else {
    flow = ctx.createBufferSource();
    const ones = ctx.createBuffer(1, 128, ctx.sampleRate);
    ones.getChannelData(0).fill(1);
    flow.buffer = ones;
    flow.loop = true;
  }
  const flowGain = ctx.createGain();
  flowGain.gain.value = 0;
  flow.connect(flowGain);
  flowGain.connect(bus);

  try { noise.start(ctx.currentTime + Math.random() * 0.01); flow.start(); } catch { /* resumes later */ }
  return { noise, floor, turbulence, noiseGain, flow, flowGain, busyUntil: 0 };
}

/**
 * Drive one voice with one exhaust event.
 *
 * @param {Record<string, any>} v a `makeVoice`
 * @param {number} start context time the valve opens
 * @param {number} duration seconds the stroke lasts
 * @param {{noise: number, flow: number, burst: number, burstTau: number, brightHz: number}} e
 * @returns {boolean} false if the voice could not take it
 */
function driveVoice(v, start, duration, e) {
  if (start < v.busyUntil) return false;
  const noise = new Float32Array(CURVE_POINTS);
  const flow = new Float32Array(CURVE_POINTS);
  // Gas velocity through the valve over the stroke. NOT a smooth sine: the gas surges as
  // the valve cracks and the pressure difference is largest, peaks early, and decays as
  // the piston pushes out what is left. That early surge is the attack of each event — the
  // "putt" of an idle — and a smooth profile has none, which is why a symmetric version of
  // this sounded like a sub-bass hum at idle.
  const velocity = (s) => Math.pow(Math.sin(Math.PI * s), 0.7) * Math.exp(-1.6 * s);
  let peakV = 0;
  for (let i = 0; i < CURVE_POINTS; i++) peakV = Math.max(peakV, velocity(i / (CURVE_POINTS - 1)));
  let peakD = 0;
  const dq = [];
  for (let i = 0; i < CURVE_POINTS; i++) {
    const s = i / (CURVE_POINTS - 1);
    const h = 1 / (CURVE_POINTS - 1);
    // A monopole radiates the RATE OF CHANGE of its volume flow, so the pressure the pipe
    // sends out is the derivative of the velocity profile: a sharp push as the gas surges,
    // a gentler pull as it tails off. Asymmetric, so it carries harmonics.
    dq.push((velocity(Math.min(1, s + h)) - velocity(Math.max(0, s - h))) / (2 * h));
    peakD = Math.max(peakD, Math.abs(dq[i]));
  }
  for (let i = 0; i < CURVE_POINTS; i++) {
    const s = i / (CURVE_POINTS - 1);
    const u = velocity(s) / (peakV || 1);
    // Turbulence loudness goes with velocity; the blowdown jet sits on the front of it.
    noise[i] = e.noise * (Math.pow(u, 1.5) + e.burst * Math.exp(-(s * duration) / e.burstTau));
    flow[i] = e.flow * dq[i] / (peakD || 1);
  }
  noise[CURVE_POINTS - 1] = 0;
  flow[CURVE_POINTS - 1] = 0;
  try {
    v.turbulence.frequency.setValueAtTime(e.brightHz, start);
    v.floor.frequency.setValueAtTime(e.brightHz * 0.5, start);
    v.noiseGain.gain.setValueCurveAtTime(noise, start, duration);
    v.flowGain.gain.setValueCurveAtTime(flow, start, duration);
  } catch { return false; }
  v.busyUntil = start + duration + 0.001;
  return true;
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
 * Tune a tube to a physical length, with the right end conditions.
 *
 * A DELAY LINE'S FEEDBACK SIGN IS AN END CONDITION, and getting it wrong changes the
 * instrument. An open end is a pressure release: the wave arrives, finds no resistance and
 * reflects INVERTED, as a rarefaction — Burns Stainless put it as "part of the wave is
 * reflected back towards the cylinder as a negative pressure (or vacuum) wave", which is
 * the whole basis of header tuning. A closed end reflects in phase.
 *
 * So the two tubes here are different instruments:
 *
 *   PRIMARY   closed at the valve, open into the collector. One inversion per round trip,
 *             so the feedback is NEGATIVE and it rings at ODD multiples of c/4L — a
 *             quarter-wave resonator. This was positive, which made it ring every harmonic
 *             like a stopped pipe, and is a large part of why the note was wrong.
 *
 *   TAIL      open at the collector and open at the mouth. Two inversions cancel, so the
 *             feedback is POSITIVE and it rings at every multiple of c/2L.
 *
 * Both round trips are TWICE the length. The tail was set to one length, which put its
 * whole note an octave high.
 *
 * @param {Record<string, any>} tube from `makeTube`
 * @param {AudioContext} ctx
 * @param {number} lengthM
 * @param {number} speedMs speed of sound in the gas actually inside it
 * @param {number} reflection 0..1, how much comes back off the far end
 * @param {boolean} openEnd true for a tube open at one end only (inverting)
 * @param {number} [smoothing] seconds; 0 sets the value outright
 */
function tuneTube(tube, ctx, lengthM, speedMs, reflection, openEnd, smoothing = 0) {
  const t = ctx.currentTime;
  const roundTrip = safe(2 * lengthM / Math.max(120, speedMs), 0.0004, 0.079);
  const gain = safe(openEnd ? -reflection : reflection, -0.85, 0.85);
  if (smoothing > 0) {
    tube.delay.delayTime.setTargetAtTime(roundTrip, t, smoothing);
    tube.feedback.gain.setTargetAtTime(gain, t, smoothing);
  } else {
    tube.delay.delayTime.setValueAtTime(roundTrip, t);
    tube.feedback.gain.setValueAtTime(gain, t);
  }
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
 * @param {number} [rpm] engine speed, for the displacement term
 * @returns {{tau: number, jet: number, pressureRatio: number, displacementMach: number,
 *   amplitude: number, blowTerm: number, dispTerm: number, gasSpeed: number}}
 */
export function blowdown(geometry, evoKpa, gasTempK, rpm = 800) {
  const swept = Math.max(1e-6, geometry.sweptM3 ?? 5e-4);
  const volume = swept + Math.max(0, geometry.clearanceM3 ?? 5e-5);
  const area = Math.max(1e-5, (geometry.valveArea ?? 1e-3) * (geometry.valveCd ?? 0.7));
  const gamma = geometry.gamma ?? 1.3;
  const speed = Math.sqrt(gamma * R_GAS * Math.max(300, gasTempK));
  const tau = safe(volume / (speed * area), 0.0002, 0.006);

  // Not clamped at 1: a throttled engine genuinely arrives at valve opening below
  // atmospheric, and that has to read as "no blowdown" rather than as "the minimum".
  const pressureRatio = safe(evoKpa / BARO_KPA, 0.2, 12);
  const jet = pressureRatio >= CHOKED_PR
    ? JET_CHOKED
    : JET_SOFT + (JET_CHOKED - JET_SOFT)
      * clamp((pressureRatio - 1) / (CHOKED_PR - 1), 0, 1);

  // The exhaust stroke is a quarter of the cycle, and the piston pushes a swept volume
  // through the valve in that time. Divided by the area that is a gas velocity, and as a
  // fraction of the speed of sound it is how hard the port is working — which is why an
  // engine gets louder with revs even off throttle.
  const strokeSeconds = Math.max(1e-3, (120 / Math.max(200, rpm)) / 4);
  const displacementMach = safe((swept / strokeSeconds) / area / speed, 0, 1.2);

  const blowTerm = BLOWDOWN_GAIN * Math.max(0, pressureRatio - 1);
  const dispTerm = DISPLACEMENT_GAIN * displacementMach;
  const amplitude = safe(blowTerm + dispTerm, 0.01, 4);
  return { tau, jet, pressureRatio, displacementMach, amplitude, blowTerm, dispTerm,
    gasSpeed: speed };
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
  mouth.gain.value = 1;

  // The muffler and the catalyst. Everything that leaves the car passes through them, raw
  // turbulence included, and what they take off the top is most of why a road car is not a
  // race car. Too little and the flow noise came out as hiss (a spectral centroid of 1600 Hz
  // against 300-600 for real engines); too much and the top octave died 30 dB down where a
  // real idle recording sits 13 down, and what was left was a hum.
  const muffler = ctx.createBiquadFilter();
  muffler.type = 'lowpass';
  muffler.frequency.value = 1100;
  muffler.Q.value = 0.5;

  // A little of the raw blowdown goes straight out: the mouth radiates the pulse itself,
  // not only what the tubes did with it.
  const direct = ctx.createGain();
  direct.gain.value = 0.55;

  const out = ctx.createGain();
  out.gain.value = OUT_TRIM;
  // A pipe cannot radiate DC. Anything the curves leave below here is an artefact.
  const dcBlock = ctx.createBiquadFilter();
  dcBlock.type = 'highpass';
  dcBlock.frequency.value = 22;
  dcBlock.Q.value = 0.7;

  bus.connect(primary.delay);
  bus.connect(tail.delay);
  bus.connect(body);
  bus.connect(direct);
  primary.out.connect(mouth);
  tail.out.connect(mouth);
  body.connect(bodyGain);
  bodyGain.connect(mouth);
  direct.connect(mouth);
  mouth.connect(muffler);
  muffler.connect(dcBlock);
  dcBlock.connect(out);
  const voices = [];
  for (let i = 0; i < VOICES; i++) voices.push(makeVoice(ctx, bus));

  return {
    out, bus, primary, tail, body, bodyGain, mouth, muffler, direct, dcBlock, voices,
    voiceIndex: 0,
    /** @type {{angleDeg: number}[]} */
    events: [{ angleDeg: 0 }],
    cyl: 6,
    /** The rendered excitation, and the physics it was rendered for. */
    pulse: null,
    pulseTau: TAU_STEPS[2],
    tau: TAU_STEPS[2],
    jet: JET_SOFT,
    pressureRatio: 1.6,
    amplitude: 0.3,
    /** @type {Record<string, any>|null} */
    geometry: null,
    nextPulse: 0,
    eventIndex: 0,
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
  const key = nearest * 16 + Math.round(a.jet * 6);
  if (key === a.tauKey) return;
  a.tauKey = key;
  a.pulseTau = TAU_STEPS[nearest];
  a.pulse = renderBlowdown(ctx, a.pulseTau, Math.round(a.jet * 6) / 6);
}

/**
 * Point the model at a new exhaust system.
 *
 * Tunes both tubes from the real lengths and the real speed of sound. Keyed, so an
 * unchanged system is not retuned from scratch every frame, which would snap the delays
 * back from wherever gas temperature had moved them.
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

  // How much comes back off the end is an impedance mismatch. A wide mouth reflects little;
  // a muffler absorbs most of what reaches it. That is the whole audible difference a
  // cat-back makes, and it belongs here rather than in a gain.
  const muffled = !key.startsWith('open');
  const absorb = clamp(geometry.catKeep ?? 1, 0.2, 1);
  // Real systems are lossy — wall friction, heat, and a muffler absorbing most of what
  // reaches it — so a pipe colours the note rather than ringing a clean tone. High
  // reflections here are most of what made an earlier version sound like a synthesiser.
  tuneTube(a.primary, ctx, primaryLength, cPrimary, 0.22 * absorb, true);
  tuneTube(a.tail, ctx, tailLength, cTail, (muffled ? 0.16 : 0.30) * absorb, false);
  // A larger pipe radiates more, reflects less, and loses less of its top end on the way.
  const tailArea = Math.max(1e-4, geometry.tailArea ?? 0.004);
  a.tail.damp.frequency.setValueAtTime(safe(1200 + tailArea * 260000, 500, 6000), t);
  a.primary.damp.frequency.setValueAtTime(safe(2600 + tailArea * 200000, 800, 9000), t);
  a.body.frequency.setValueAtTime(safe(cTail / (4 * tailLength), 60, 600), t);
  // A straight-through system passes far more top end than a chambered muffler, and a
  // turbine in the stream takes more of it out again.
  a.muffler.frequency.setValueAtTime(
    safe((muffled ? 2000 : 3600) * (0.6 + 0.4 * absorb), 400, 8000), t);

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
    const b = blowdown(a.geometry, frame.evoKpa ?? BARO_KPA, frame.gasTempK ?? 900, rpm);
    a.tau = b.tau;
    a.jet = b.jet;
    a.pressureRatio = b.pressureRatio;
    a.amplitude = b.amplitude;
    a.blowTerm = b.blowTerm;
    a.dispTerm = b.dispTerm;
    a.gasVelocity = b.displacementMach * b.gasSpeed;
    rebuildExcitation(a, ctx);
  }
  const drive = safe(Math.pow(safe(a.amplitude ?? 0.3, 0.001, 8), LISTENER_EXPONENT), 0.01, 4);

  if (rpm < 200 || level <= 0.001 || !a.pulse) {
    a.nextPulse = now + 0.02;
    return;
  }

  const cycleSeconds = 120 / Math.max(rpm, 200);
  // Never schedule into the past, or so close to now that the first gap is squeezed.
  if (a.nextPulse < now + 0.005) a.nextPulse = now + 0.02;

  // The exhaust stroke is half a revolution: 180 of the cycle's 720 degrees.
  const strokeSeconds = cycleSeconds / 4;
  const total = Math.max(1e-6, a.amplitude ?? 0.3);
  const blowShare = clamp((a.blowTerm ?? 0) / total, 0, 1);
  const dispShare = clamp((a.dispTerm ?? total) / total, 0, 1);
  // Faster gas sheds smaller eddies, which are higher-pitched — a Strouhal scaling. Capped,
  // because what reaches the mouth has slowed in the wider pipe: the valve's velocity is
  // not the tailpipe's, and letting it through unscaled put a loaded engine's note up in
  // the kilohertz with nothing underneath it.
  const brightHz = safe(200 + 2.5 * (a.gasVelocity ?? 30) + 300 * blowShare, 200, 1200);
  const cov = a.pressureRatio < 1 ? COV_IDLE : COV_LOADED;

  let guard = 0;
  while (a.nextPulse < now + 0.14 && guard++ < 64) {
    const gap = (() => {
      const here = a.events[a.eventIndex % a.events.length];
      const next = a.events[(a.eventIndex + 1) % a.events.length];
      let d = next.angleDeg - here.angleDeg;
      if (d <= 0) d += 720;
      return (d / 720) * cycleSeconds;
    })();

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

    const size = safe(level * drive * lope * (1 + gauss() * cov), 0, 6);
    // Jitter the start, never the cursor: a late event must not make every later one late.
    const start = Math.max(now + 0.005, a.nextPulse + gap * gauss() * JITTER_OF_GAP);

    // The flow: turbulence and radiated flow over the whole stroke, on the next free voice.
    for (let tries = 0; tries < a.voices.length; tries++) {
      const v = a.voices[a.voiceIndex % a.voices.length];
      a.voiceIndex++;
      if (driveVoice(v, start, strokeSeconds * 1.1, {
        noise: size * NOISE_SHARE,
        flow: size * FLOW_SHARE * dispShare,
        burst: 1.6 * blowShare,
        burstTau: Math.max(0.002, a.tau * 3),
        brightHz,
      })) break;
    }

    // The crack at the front of a loaded event: blowdown, only when there is overpressure
    // left to blow down. At idle there is none, so there is no crack — which is right.
    if (blowShare > 0.04 && a.pulse) {
      const src = ctx.createBufferSource();
      src.buffer = a.pulse;
      src.playbackRate.value = safe((a.pulseTau / Math.max(1e-5, a.tau)) * (0.97 + Math.random() * 0.06), 0.25, 4);
      const g = ctx.createGain();
      g.gain.value = safe(size * SPIKE_SHARE * blowShare, 0, 6);
      src.connect(g);
      g.connect(a.bus);
      try { src.start(start); } catch { /* raced the clock */ }
      src.onended = () => { try { src.disconnect(); g.disconnect(); } catch { /* gone */ } };
    }

    a.nextPulse += gap;
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
      safe(2 * primaryLength / cPrimary, 0.0004, 0.079), t, 0.2);
    a.tail.delay.delayTime.setTargetAtTime(safe(2 * tailLength / cTail, 0.0004, 0.079), t, 0.2);
    a.body.frequency.setTargetAtTime(safe(cTail / (4 * tailLength), 60, 600), t, 0.2);
  }

  // How hard a pipe rings depends on how much gas is moving through it. At idle the flow is
  // slow and the system is well muffled, so leaving it ringing gives a metallic clang no
  // real engine makes; under load the pulses are strong and it genuinely rings.
  const flow = clamp(0.2 + load * 0.8, 0.14, 1);
  a.primary.out.gain.setTargetAtTime(safe(0.16 + 0.30 * flow + rasp * 0.12, 0, 0.8), t, 0.12);
  a.tail.out.gain.setTargetAtTime(safe(0.24 + 0.28 * flow, 0, 0.8), t, 0.12);
  a.bodyGain.gain.setTargetAtTime(safe(0.10 - 0.04 * flow, 0, 0.5), t, 0.15);
  // A pipe radiates its highs far better than its lows, and radiates more of everything the
  // faster the gas is leaving it.
  a.mouth.gain.setTargetAtTime(safe(0.5 + flow * 1.5 + rasp * 1.5, 0, 6), t, 0.1);
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
  for (const v of a.voices ?? []) {
    try {
      v.noiseGain.gain.cancelScheduledValues(t);
      v.noiseGain.gain.setValueAtTime(0, t);
      v.flowGain.gain.cancelScheduledValues(t);
      v.flowGain.gain.setValueAtTime(0, t);
    } catch { /* as above */ }
    v.busyUntil = t;
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
