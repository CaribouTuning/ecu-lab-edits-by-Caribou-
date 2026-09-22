/**
 * The exhaust note — a port of the reference build's (v4.8).
 *
 * Nothing automated can say it sounds right; the reference was signed off by ear. What
 * these pin down is that the port does what the reference did and keeps doing it: pulses
 * land on the layout's firing events, the loop layer takes over at high revs without
 * flanging, and what the player changes — displacement, pipe, cat-back, timing, cam,
 * throttle — reaches the note in the direction the reference voiced it.
 */

import { describe, it, expect } from 'vitest';
import { exhaustGeometry } from '../src/sim/acoustics.js';
import {
  createPulseExhaust, setPulseExhaustGeometry, schedulePulseExhaust, tonePulseExhaust,
  silencePulseExhaust, wakePulseExhaust,
} from '../src/ui/audio/pulseExhaust.js';
import { stubContext } from './ui/audioStub.js';

/** A real geometry, so the tests run against the same numbers the app does. */
function geom(over = {}) {
  return exhaustGeometry({
    configuration: 'V8', cyl: 8, displacementL: 5.0, bore: 95, compression: 10.5,
    pipeDiaIn: 3.0, gasTempK: 900, headers: false, turboFitted: false, ...over,
  });
}

/**
 * Build the note on a stub context, recording every pulse it schedules.
 *
 * @returns {{ctx: any, a: Record<string, any>, fired: {at: number, gain: number, rate: number}[]}}
 */
function model(g = geom(), key = 'muffled|x') {
  const ctx = stubContext();
  const fired = [];
  const make = ctx.createBufferSource;
  ctx.createBufferSource = () => {
    const src = make();
    const start = src.start;
    src.start = (when) => {
      start.call(src, when);
      if (src.pulseGain) fired.push({ at: when, gain: src.pulseGain.gain.value, rate: src.playbackRate.value });
    };
    const connect = src.connect;
    src.connect = (node) => { src.pulseGain = node; return connect.call(src, node); };
    return src;
  };
  const a = createPulseExhaust(ctx);
  setPulseExhaustGeometry(a, ctx, g, key);
  return { ctx, a, fired };
}

/** One scheduling pass. */
function run(m, frame = {}) {
  const before = m.fired.length;
  schedulePulseExhaust(m.a, m.ctx, {
    rpm: 1500, level: 1, load: 1, overlapDeg: 0, audible: true, ...frame,
  });
  return m.fired.slice(before);
}

/** One tone pass. */
function tone(m, frame = {}) {
  tonePulseExhaust(m.a, m.ctx, {
    rpm: 3000, load: 1, rasp: 0, richness: 0, knock: 0, cranking: false, catBack: false,
    audible: true, overlapDeg: 0, ...frame,
  });
}

const gaps = (p) => p.slice(1).map((v, i) => v.at - p[i].at);
const mean = (xs) => xs.reduce((x, y) => x + y, 0) / xs.length;
const spread = (g) => (Math.max(...g) - Math.min(...g)) / mean(g);

describe('the rhythm, which is the layout', () => {
  it('spaces a cross-plane V8 unevenly and an even-firing six evenly', () => {
    // The rumble. A V8's banks are offset, so its pulses alternate long and short; a
    // 60/120 V6 fires evenly. Even-fire the V8 and it stops sounding like one.
    const v8 = model(geom(), 'v8');
    const v6 = model(geom({ configuration: 'V6', cyl: 6, displacementL: 3.5 }), 'v6');
    expect(spread(gaps(run(v6, { rpm: 1200 })))).toBeLessThan(0.05);
    expect(spread(gaps(run(v8, { rpm: 1200 })))).toBeGreaterThan(0.2);
  });

  it('gives a four far wider gaps than an eight at the same engine speed', () => {
    const i4 = model(geom({ configuration: 'I4', cyl: 4, displacementL: 2.0 }), 'i4');
    const v8 = model(geom(), 'v8');
    expect(mean(gaps(run(i4, { rpm: 1000 }))) / mean(gaps(run(v8, { rpm: 1000 }))))
      .toBeGreaterThan(1.7);
  });

  it('hands over to the looped cycle once the pulses fuse, rather than decimating', () => {
    // Above about 200 events a second the ear stops resolving pulses. Playing fewer,
    // louder ones up there sounds like hitting a tin can; the loop takes over instead.
    const low = model();
    expect(run(low, { rpm: 1000 }).length).toBeGreaterThan(2);
    expect(low.a.loops.every((l) => l.gain.gain.value === 0)).toBe(true);
    const high = model();
    expect(run(high, { rpm: 6500 })).toHaveLength(0);
    expect(high.a.loops.some((l) => l.gain.gain.value > 0)).toBe(true);
  });

  it('keeps both loop variants at one pitch, so they cannot flange', () => {
    // Two near-identical loops at slightly different rates comb-filter against each other
    // with a sweeping notch — the whoosh on every rev. The reference detuned them 0.15%.
    const m = model();
    run(m, { rpm: 6000 });
    const [x, y] = m.a.loops.map((l) => l.src.playbackRate.value);
    expect(x).toBe(y);
  });
});

describe('the build', () => {
  it('does not rebuild the loops when only the exhaust temperature moves', () => {
    // Rebuilding restarts them from silence, which left the top end ramping up from zero
    // mid-pull. Temperature changes the geometry key but not the firing pattern.
    const m = model(geom(), 'k1');
    const loops = m.a.loops;
    setPulseExhaustGeometry(m.a, m.ctx, geom({ gasTempK: 1100 }), 'k2');
    expect(m.a.loops).toBe(loops);
  });

  it('rebuilds the loops when the layout changes, because the rhythm is baked in', () => {
    const m = model(geom(), 'v8');
    const loops = m.a.loops;
    setPulseExhaustGeometry(m.a, m.ctx, geom({ configuration: 'I4', cyl: 4, displacementL: 2 }), 'i4');
    expect(m.a.loops).not.toBe(loops);
  });

  it('makes a bigger engine\'s pulses longer and its pipe lower', () => {
    const small = model(geom({ configuration: 'I4', cyl: 4, displacementL: 2.0 }), 's');
    const big = model(geom({ displacementL: 6.2 }), 'b');
    expect(mean(run(big).map((p) => p.rate))).toBeLessThan(mean(run(small).map((p) => p.rate)));
    tone(small); tone(big);
    expect(big.a.pipeDelay.delayTime.value).toBeGreaterThan(small.a.pipeDelay.delayTime.value);
  });

  it('reads the tailpipe bore from the geometry, and a bigger pipe rings lower and less', () => {
    const narrow = model(geom({ pipeDiaIn: 2.5 }), 'n');
    const wide = model(geom({ pipeDiaIn: 3.5 }), 'w');
    expect(narrow.a.pipeDiaIn).toBeCloseTo(2.5, 1);
    expect(wide.a.pipeDiaIn).toBeCloseTo(3.5, 1);
    tone(narrow); tone(wide);
    expect(wide.a.pipeDelay.delayTime.value).toBeGreaterThan(narrow.a.pipeDelay.delayTime.value);
    expect(wide.a.pipeFeedback.gain.value).toBeLessThan(narrow.a.pipeFeedback.gain.value);
  });

  it('rings less with a cat-back fitted', () => {
    const m = model();
    tone(m, { catBack: false });
    const stock = m.a.pipeFeedback.gain.value;
    tone(m, { catBack: true });
    expect(m.a.pipeFeedback.gain.value).toBeLessThan(stock);
  });

  it('sharpens the crack with compression', () => {
    const low = model(geom({ compression: 9 }), 'l');
    const high = model(geom({ compression: 12 }), 'h');
    tone(low); tone(high);
    expect(high.a.tone.frequency.value).toBeGreaterThan(low.a.tone.frequency.value);
  });
});

describe('what the engine is doing', () => {
  it('hits harder and brighter with the throttle open', () => {
    const light = model();
    const heavy = model();
    expect(mean(run(heavy, { level: 1.04 }).map((p) => p.gain)))
      .toBeGreaterThan(mean(run(light, { level: 0.42 }).map((p) => p.gain)));
    tone(light, { load: 0.1 }); tone(heavy, { load: 1 });
    expect(heavy.a.tone.frequency.value).toBeGreaterThan(light.a.tone.frequency.value);
    expect(heavy.a.pipeOut.gain.value).toBeGreaterThan(light.a.pipeOut.gain.value);
  });

  it('rasps when the timing is retarded', () => {
    const m = model();
    tone(m, { rasp: 0 });
    const clean = m.a.tone.frequency.value;
    tone(m, { rasp: 1 });
    expect(m.a.tone.frequency.value).toBeGreaterThan(clean);
  });

  it('lopes with a big cam at idle and not with a stock one', () => {
    const stock = model();
    const cam = model();
    tone(stock, { rpm: 800, load: 0.1, overlapDeg: 0 });
    tone(cam, { rpm: 800, load: 0.1, overlapDeg: 40 });
    expect(stock.a.lopeDepth.gain.value).toBe(0);
    expect(cam.a.lopeDepth.gain.value).toBeGreaterThan(0.1);
    const g = run(cam, { rpm: 800, overlapDeg: 40, level: 0.5 }).map((p) => p.gain);
    expect(spread(g)).toBeGreaterThan(0.3);
  });

  it('grinds while cranking and rattles when it knocks', () => {
    const m = model();
    tone(m, { load: 0 });
    const running = m.a.noiseGain.gain.value;
    tone(m, { load: 0, knock: 1 });
    expect(m.a.noiseGain.gain.value).toBeGreaterThan(running);
    tone(m, { cranking: true });
    expect(m.a.noiseGain.gain.value).toBeCloseTo(0.12, 5);
  });

  it('never repeats a pulse exactly', () => {
    const p = run(model());
    expect(new Set(p.map((x) => x.gain.toFixed(6))).size).toBeGreaterThan(p.length / 2);
  });

  it('is silent below cranking speed, when not audible, and when silenced', () => {
    expect(run(model(), { rpm: 0 })).toHaveLength(0);
    expect(run(model(), { audible: false })).toHaveLength(0);
    const m = model();
    silencePulseExhaust(m.a, m.ctx);
    expect(run(m)).toHaveLength(0);
    expect(m.a.bus.gain.value).toBe(0);
    wakePulseExhaust(m.a, m.ctx);
    expect(m.a.bus.gain.value).toBeGreaterThan(0);
  });

  it('survives a non-finite number instead of throwing and killing every layer', () => {
    const m = model();
    expect(() => { run(m, { rpm: NaN, level: NaN }); tone(m, { rpm: NaN, load: NaN }); }).not.toThrow();
  });
});
