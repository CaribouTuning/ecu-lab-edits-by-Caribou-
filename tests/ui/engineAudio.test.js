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
    createBiquadFilter: () => node({ frequency: param(1000), Q: param(1), type: 'lowpass' }),
    createDelay: () => node({ delayTime: param(0.01) }),
    createDynamicsCompressor: () => node({
      threshold: param(-24), knee: param(30), ratio: param(12), attack: param(0.003), release: param(0.25),
    }),
    createPeriodicWave: () => ({}),
    createWaveShaper: () => node({ curve: null, oversample: 'none' }),
    createBuffer: (_ch, len) => ({ length: len, getChannelData: () => new Float32Array(len) }),
    createBufferSource: () => node({ buffer: null, loop: false, playbackRate: param(1), onended: null }),
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

  it('builds silent, so nothing is heard before a frame is pushed', () => {
    expect(graph.master.gain.value).toBe(0);
  });

  it('starts every source it creates', () => {
    expect(ctx.started.length).toBeGreaterThan(10);
  });

  it('tunes the pipe delay to the resonance the physics reported', () => {
    const frame = frameFor();
    updateEngineAudio(graph, frame);
    expect(graph.pipeDelay.delayTime.value).toBeCloseTo(1 / (2 * frame.drive.pipeHz), 9);
  });

  it('goes quiet when the engine is not audible', () => {
    updateEngineAudio(graph, frameFor({ audible: false }));
    expect(graph.master.gain.value).toBe(0);
  });

  it('is louder pulling hard than idling, but never silent at idle', () => {
    updateEngineAudio(graph, frameFor({ rpm: 4500 }));
    const wot = graph.master.gain.value;
    updateEngineAudio(graph, frameFor({ rpm: 800 }));
    const idle = graph.master.gain.value;
    expect(wot).toBeGreaterThan(idle);
    expect(idle).toBeGreaterThan(0);
  });

  it('connects only the running layout, so idle layouts cost nothing', () => {
    updateEngineAudio(graph, frameFor({ configuration: 'V8' }));
    expect(graph.loopConnected.V8).toBe(true);
    expect(graph.loopConnected.I4).toBe(false);
    updateEngineAudio(graph, frameFor({ configuration: 'I4' }));
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

  it('spaces a cross-plane V8 evenly at the tailpipe but unevenly within a bank', () => {
    // Both halves matter. The tailpipe hears all eight, 90 degrees apart; each collector
    // hears only four, and those four are what rumbles.
    const derived = deriveEngine({ ...DEFAULT_ENGINE_CONFIG, configuration: 'V8' });
    const times = collect(frameFor({ rpm: 1200, configuration: 'V8', derived }), 0.6);
    const gaps = times.slice(1).map((t, i) => t - times[i]);
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThan(Math.min(...gaps) * 0.05);

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
