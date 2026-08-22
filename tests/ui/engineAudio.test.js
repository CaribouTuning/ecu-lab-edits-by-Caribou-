/**
 * Engine synthesiser tests, against a stub AudioContext.
 *
 * The point is not to check that it sounds good — nothing automated can. It is to check
 * that the renderer stays HONEST to the physics it is handed: that the pipe delay really
 * is 1 / 2f for the resonance the model reported, that the pulse train really does land
 * on the crank angles the layout fires at, and that "stop" really does stop.
 *
 * The last one is the reason this file exists at all. A parked gain from a scheduled
 * ramp is silent in every unit test and screaming in the browser.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { acousticDrive, deriveEngine, firingEvents, DEFAULT_ENGINE_CONFIG, DEFAULT_MODS,
  BARO_KPA, COMPRESSOR_OPTS, TURBINE_OPTS, OCTANE_OPTS, DEFAULT_VE, interp2,
  evaluatePoint } from '../../src/sim/index.js';
import { createEngineAudio, scheduleExhaustPulses, silenceEngineAudio, updateEngineAudio }
  from '../../src/ui/audio/engineAudio.js';

/** A minimal AudioParam that records what was written to it. */
function param(value = 0) {
  return {
    value,
    targets: [], values: [],
    setTargetAtTime(v) { this.targets.push(v); this.value = v; },
    setValueAtTime(v) { this.values.push(v); this.value = v; },
    cancelScheduledValues() {},
    exponentialRampToValueAtTime() {},
    linearRampToValueAtTime() {},
  };
}

/**
 * A stub AudioContext, enough of one for the graph to build and be driven.
 *
 * Typed loosely on purpose: it implements the handful of factory methods the graph
 * calls and none of the other thirty on the real interface, so pinning it to
 * `AudioContext` would only mean stubbing methods nothing exercises.
 *
 * @returns {any}
 */
function stubContext() {
  const started = [];
  const node = (extra = {}) => ({
    connect() {}, disconnect() {}, start(when) { started.push(when ?? 0); }, ...extra,
  });
  return {
    started,
    sampleRate: 44100,
    currentTime: 0,
    destination: node(),
    createGain: () => node({ gain: param(1) }),
    createOscillator: () => node({ frequency: param(440), detune: param(0), type: 'sine', setPeriodicWave() {} }),
    createBiquadFilter: () => node({ frequency: param(1000), Q: param(1), gain: param(0), type: 'lowpass' }),
    createDelay: () => node({ delayTime: param(0.01) }),
    createDynamicsCompressor: () => node({
      threshold: param(-24), knee: param(30), ratio: param(12), attack: param(0.003), release: param(0.25),
    }),
    createPeriodicWave: () => ({}),
    createWaveShaper: () => node({ curve: null, oversample: 'none' }),
    createBuffer: (_ch, len) => {
      const data = new Float32Array(len);
      return { length: len, getChannelData: () => data };
    },
    createBufferSource: () => node({ buffer: null, loop: false, playbackRate: param(1), onended: null }),
    createStereoPanner: () => node({ pan: param(0) }),
  };
}

const DERIVED = deriveEngine(DEFAULT_ENGINE_CONFIG);

/** A drive for a stock V6 pulling hard, plus a frame around it. */
function frameFor(overrides = {}) {
  const configuration = overrides.configuration ?? DEFAULT_ENGINE_CONFIG.configuration;
  const derived = overrides.derived ?? DERIVED;
  const rpm = overrides.rpm ?? 4500;
  const pt = evaluatePoint({
    rpm, mapKpa: BARO_KPA, boostPsi: 0, veVal: interp2(DEFAULT_VE, rpm, BARO_KPA),
    timingVal: 26, afrCommanded: 12.8, fuel: OCTANE_OPTS[0],
    mods: { ...DEFAULT_MODS, turboFitted: false },
    mafScalar: 1, mafErrorBase: 1, injectorCc: 550, ecuInjectorCc: 550,
    derived, compressor: COMPRESSOR_OPTS[1], turbine: TURBINE_OPTS[1],
  });
  return {
    drive: acousticDrive({ rpm, derived, point: pt, configuration, pipeDiaIn: 2.5 }),
    rpm, configuration, load: 1, audible: true, cut: false, cranking: false,
    pipeDiaIn: 2.5, openExhaust: false, intakeFitted: false, boostPsi: 0,
    ...overrides,
  };
}

describe('the engine synthesiser', () => {
  let ctx, graph;
  beforeEach(() => { ctx = stubContext(); graph = createEngineAudio(ctx, firingEvents); });

  /** Pushes a frame, advancing the clock first so the parameter throttle lets it through. */
  const push = (frame) => { ctx.currentTime += 0.1; updateEngineAudio(graph, frame); };

  it('builds silent, so nothing is heard before a frame is pushed', () => {
    expect(graph.master.gain.value).toBe(0);
  });

  it('starts every source it creates', () => {
    expect(ctx.started.length).toBeGreaterThan(10);
  });

  it('tunes the pipe delay to the resonance the physics reported', () => {
    const frame = frameFor();
    push(frame);
    expect(graph.pipeDelay.delayTime.value).toBeCloseTo(1 / (2 * frame.drive.pipeHz), 9);
  });

  it('goes quiet when the engine is not audible', () => {
    push(frameFor({ audible: false }));
    expect(graph.master.gain.value).toBe(0);
  });

  it('is louder pulling hard than idling, but never silent at idle', () => {
    push(frameFor({ rpm: 4500 }));
    const wot = graph.master.gain.value;
    push(frameFor({ rpm: 800 }));
    const idle = graph.master.gain.value;
    expect(wot).toBeGreaterThan(idle);
    expect(idle).toBeGreaterThan(0);
  });

  it('connects only the running layout, so idle layouts cost nothing', () => {
    push(frameFor({ configuration: 'V8' }));
    expect(graph.loopConnected.V8).toBe(true);
    expect(graph.loopConnected.I4).toBe(false);
    push(frameFor({ configuration: 'I4' }));
    expect(graph.loopConnected.V8).toBe(false);
    expect(graph.loopConnected.I4).toBe(true);
  });
});

describe('the exhaust pulse train', () => {
  let ctx, graph;
  beforeEach(() => { ctx = stubContext(); graph = createEngineAudio(ctx, firingEvents); });

  /** Runs the scheduler forward and returns the times pulses were scheduled at. */
  function collect(frame, seconds) {
    const before = ctx.started.length;
    for (let t = 0; t < seconds; t += 0.05) {
      ctx.currentTime = t;
      scheduleExhaustPulses(graph, frame);
    }
    return ctx.started.slice(before).sort((a, b) => a - b);
  }

  it('schedules one pulse per cylinder per two revolutions', () => {
    const rpm = 1200, seconds = 1;
    const times = collect(frameFor({ rpm }), seconds);
    // 1200 RPM is 10 engine cycles a second; a V6 fires six times in each.
    const expected = (rpm / 120) * DERIVED.cyl * seconds;
    expect(times.length).toBeGreaterThan(expected * 0.8);
    expect(times.length).toBeLessThan(expected * 1.25);
  });

  it('spaces an inline four evenly', () => {
    const derived = deriveEngine({ ...DEFAULT_ENGINE_CONFIG, configuration: 'I4' });
    const times = collect(frameFor({ rpm: 1200, configuration: 'I4', derived }), 0.6);
    const gaps = times.slice(1).map((t, i) => t - times[i]);
    const spread = Math.max(...gaps) - Math.min(...gaps);
    expect(spread).toBeLessThan(Math.min(...gaps) * 0.05);
  });

  it('pairs a cross-plane V8\'s pulses, which is the rumble', () => {
    // Each bank fires unevenly, and the two collectors deliver a beat apart, so the train
    // that reaches the ear alternates long-short instead of sitting at one spacing.
    const derived = deriveEngine({ ...DEFAULT_ENGINE_CONFIG, configuration: 'V8' });
    const times = collect(frameFor({ rpm: 1200, configuration: 'V8', derived }), 0.6);
    const gaps = times.slice(1).map((t, i) => t - times[i]);
    expect(Math.max(...gaps)).toBeGreaterThan(Math.min(...gaps) * 1.4);

    const events = firingEvents('V8').filter((e) => e.bank === 0).map((e) => e.angleDeg);
    const bankGaps = events.slice(1).map((a, i) => a - events[i]);
    expect(new Set(bankGaps).size).toBeGreaterThan(1);
  });

  it('stops scheduling once the pulses fuse, leaving the looped train to it', () => {
    const times = collect(frameFor({ rpm: 7000 }), 0.5);
    expect(times).toHaveLength(0);
  });

  it('schedules nothing when the engine is not audible', () => {
    expect(collect(frameFor({ audible: false }), 0.5)).toHaveLength(0);
  });
});

describe('stopping', () => {
  it('pins every layer to zero rather than gliding towards it', () => {
    const ctx = stubContext();
    const graph = createEngineAudio(ctx, firingEvents);
    ctx.currentTime = 0.5;
    updateEngineAudio(graph, frameFor());
    expect(graph.master.gain.value).toBeGreaterThan(0);

    silenceEngineAudio(graph);
    for (const node of [graph.master, graph.pipeOut, graph.indG, graph.whistleG,
      graph.bladeG, graph.rushG, graph.bovG, graph.flutEnv]) {
      expect(node.gain.value).toBe(0);
    }
    for (const layout of Object.keys(graph.loopGains)) {
      for (const g of graph.loopGains[layout]) expect(g.gain.value).toBe(0);
    }
  });
});

/**
 * The two things that decided whether this renderer sounded like an engine or like a
 * synthesiser, and neither of them is audible in any other test here.
 */
describe('what makes it sound real', () => {
  /**
   * Collects every buffer the graph renders at build time.
   * @returns {Float32Array[]} the rendered pulse and cycle buffers
   */
  function renderedBuffers() {
    const ctx = stubContext();
    const built = [];
    const inner = ctx.createBuffer;
    ctx.createBuffer = (ch, len, sr) => {
      const buf = inner(ch, len, sr);
      built.push(buf.getChannelData(0));
      return buf;
    };
    createEngineAudio(ctx, firingEvents);
    // The noise beds are long flat random fills; the pulses (90 ms) and cycle loops
    // (40 ms) are the rendered ones.
    return built.filter((d) => d.length > 1000 && d.length < 10000);
  }

  it('renders pulses with real high-frequency content, not a filtered thud', () => {
    // A blowdown leaving an open pipe radiates as dq/dt above ka = 1, so its leading edge
    // is broadband. Measured as the ratio of first-difference energy to total energy,
    // which rises with spectral centroid: a signal band-limited to a few hundred hertz
    // scores near zero however loud it is.
    const buffers = renderedBuffers();
    expect(buffers.length).toBeGreaterThan(4);
    for (const data of buffers) {
      let sq = 0;
      let dsq = 0;
      for (let i = 1; i < data.length; i++) {
        sq += data[i] * data[i];
        const d = data[i] - data[i - 1];
        dsq += d * d;
      }
      expect(sq).toBeGreaterThan(0);
      // The renderer this replaced scored 0.0012 to 0.0015 — its entire leading edge was
      // below a kilohertz, which is a thud. These score 0.013 and up.
      expect(dsq / sq).toBeGreaterThan(0.006);
    }
  });

  it('renders pulses free of DC and normalised to unit peak', () => {
    for (const data of renderedBuffers()) {
      let sum = 0;
      let peak = 0;
      for (let i = 0; i < data.length; i++) {
        sum += data[i];
        const a = Math.abs(data[i]);
        if (a > peak) peak = a;
      }
      expect(peak).toBeCloseTo(1, 5);
      // A pressure pulse at an open tailpipe has no DC. An offset left in is a thud on
      // every event, and it eats the headroom the leading edge needs.
      expect(Math.abs(sum / data.length)).toBeLessThan(0.02);
    }
  });

  it('leaves headroom for the transients instead of pinning the limiter', () => {
    // AN ENGINE IS A TRANSIENT TRAIN AND ITS CREST FACTOR IS THE SOUND. If the renderer's
    // own maximum static gain is above unity, every pulse is flattened into the ceiling
    // and the peak-to-average ratio collapses to a couple of decibels — measured, that is
    // exactly what a listener calls "digital", and no work on the pulse survives it.
    // So the chain must be able to reach full scale only on peaks, never on the bed.
    const ctx = stubContext();
    const a = createEngineAudio(ctx, firingEvents);
    ctx.currentTime += 0.1;
    updateEngineAudio(a, frameFor({ rpm: 6000, load: 1 }));
    // Whatever the physics asks for, master gain times make-up cannot reach full scale.
    expect(a.master.gain.value * a.outGain.gain.value).toBeLessThan(1);
    // And the limiter is a safety net: it may not be catching the running level.
    expect(a.limiter.threshold.value).toBeGreaterThanOrEqual(-6);
  });
});
