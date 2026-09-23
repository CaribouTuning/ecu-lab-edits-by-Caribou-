/**
 * The exhaust note: every firing event computed from the engine, played through the
 * reference build's (v4.8) exhaust system.
 *
 * Nothing automated can say it sounds right. What these pin down is what made it sound
 * right against recordings of real engines, and keeps it that way: every event lands on
 * the layout's own crank angle at every speed, no two cycles are alike, the stream is
 * continuous, and what the player changes — displacement, pipe, cat-back, turbo, timing,
 * cam, throttle — reaches the note in the direction a real engine goes.
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
 * Build the note on a stub context, recording every buffer it schedules.
 *
 * @returns {{ctx: any, a: Record<string, any>, played: {at: number, data: Float32Array}[]}}
 */
function model(g = geom(), key = 'muffled|x') {
  const ctx = stubContext();
  const played = [];
  const make = ctx.createBufferSource;
  ctx.createBufferSource = () => {
    const src = make();
    const start = src.start;
    src.start = (when) => {
      start.call(src, when);
      if (src.buffer && src.buffer.length < 4096) played.push({ at: when, data: src.buffer.getChannelData(0) });
    };
    return src;
  };
  const a = createPulseExhaust(ctx);
  setPulseExhaustGeometry(a, ctx, g, key);
  return { ctx, a, played };
}

/**
 * Run the stream for a while, a frame at a time, and return the events it computed.
 *
 * @returns {{at: number, cylinder: number, evoKpa: number, gapSeconds: number}[]}
 */
function run(m, frame = {}, seconds = 0.3) {
  const before = m.a.log.length ? m.a.log[m.a.log.length - 1] : null;
  for (let t = 0; t < seconds; t += 0.05) {
    schedulePulseExhaust(m.a, m.ctx, {
      rpm: 1500, level: 1, load: 1, audible: true, evoKpa: 350, portKpa: 110,
      lopeSeverity: 0, covPersistence: 0.55, ...frame,
    });
    m.ctx.currentTime += 0.05;
  }
  return m.a.log.filter((e) => !before || e.at > before.at);
}

/** One tone pass. */
function tone(m, frame = {}) {
  tonePulseExhaust(m.a, m.ctx, {
    rpm: 3000, load: 1, rasp: 0, richness: 0, knock: 0, cranking: false, catBack: false,
    audible: true, ...frame,
  });
}

const gaps = (events) => events.slice(1).map((e, i) => e.at - events[i].at);
const mean = (xs) => xs.reduce((x, y) => x + y, 0) / xs.length;
const spread = (g) => (Math.max(...g) - Math.min(...g)) / mean(g);
const sd = (xs) => Math.sqrt(mean(xs.map((x) => (x - mean(xs)) ** 2)));
const energy = (m) => m.played.reduce((t, p) => t + p.data.reduce((u, v) => u + v * v, 0), 0);

describe('the rhythm, which is the layout', () => {
  it('spaces a cross-plane V8 unevenly and an even-firing six evenly', () => {
    const v8 = run(model(geom({ configuration: 'V8' }), 'v8'), { rpm: 1000 }, 0.4);
    const v6 = run(model(geom({ configuration: 'V6', cyl: 6, displacementL: 3.5 }), 'v6'), { rpm: 1000 }, 0.4);
    // A V8's crank puts some events closer together than others; that is its burble. The
    // six's gaps only differ by the few percent a real crank wobbles.
    expect(spread(gaps(v8))).toBeGreaterThan(0.2);
    expect(spread(gaps(v6))).toBeLessThan(0.1);
  });

  it('gives a four far wider gaps than an eight at the same engine speed', () => {
    const i4 = model(geom({ configuration: 'I4', cyl: 4, displacementL: 2 }), 'i4');
    const v8 = model(geom(), 'v8');
    expect(mean(gaps(run(i4, { rpm: 1000 }, 0.5))))
      .toBeGreaterThan(1.7 * mean(gaps(run(v8, { rpm: 1000 }, 0.5))));
  });

  it('computes every event at every speed, with nothing taking over at the top', () => {
    // The version before this looped one pre-rendered cycle above about 90 events a
    // second, and a loop is what a synthesiser sounds like.
    const m = model(geom({ configuration: 'I6', cyl: 6, displacementL: 3 }), 'i6');
    const events = run(m, { rpm: 6500 }, 0.3);
    expect(events.length).toBeGreaterThan(80);
    expect(mean(events.map((e) => e.gapSeconds))).toBeCloseTo(120 / (6 * 6500), 4);
  });

  it('never plays the same cycle twice', () => {
    const events = run(model(), { rpm: 3000 }, 0.3);
    const cyl0 = events.filter((e) => e.cylinder === 0).map((e) => e.evoKpa);
    expect(cyl0.length).toBeGreaterThan(3);
    expect(new Set(cyl0.map((v) => v.toFixed(3))).size).toBe(cyl0.length);
  });

  it('gives each cylinder a fixed share of its own, the same every time it is built', () => {
    const a = model(geom(), 'a').a.trims;
    const b = model(geom(), 'b').a.trims;
    expect(a).toEqual(b);
    expect(new Set(a.map((v) => v.toFixed(4))).size).toBe(a.length);
    for (const v of a) expect(Math.abs(v - 1)).toBeLessThan(0.2);
  });

  it('plays out as one continuous stream, buffers back to back and ahead of the clock', () => {
    const m = model();
    run(m, { rpm: 2000 }, 0.5);
    const starts = m.played.map((p) => p.at);
    const step = starts[1] - starts[0];
    for (let i = 1; i < starts.length; i++) expect(starts[i] - starts[i - 1]).toBeCloseTo(step, 9);
    expect(starts[starts.length - 1]).toBeGreaterThan(m.ctx.currentTime);
  });

  it('starts again cleanly after falling behind the clock', () => {
    const m = model();
    run(m, { rpm: 2000 }, 0.2);
    m.ctx.currentTime += 1;
    run(m, { rpm: 2000 }, 0.1);
    expect(m.played[m.played.length - 1].at).toBeGreaterThan(m.ctx.currentTime - 0.1);
  });
});

describe('the build', () => {
  it('keeps the cylinders\' spread when only the exhaust temperature moves', () => {
    const m = model(geom(), 'k1');
    const trims = m.a.trims;
    setPulseExhaustGeometry(m.a, m.ctx, geom({ gasTempK: 1100 }), 'k2');
    expect(m.a.trims).toBe(trims);
    expect(m.a.geometry.portK).toBeGreaterThan(900);
  });

  it('draws a new spread when the engine changes', () => {
    const m = model(geom(), 'v8');
    const trims = m.a.trims;
    setPulseExhaustGeometry(m.a, m.ctx, geom({ configuration: 'I4', cyl: 4, displacementL: 2 }), 'i4');
    expect(m.a.trims).not.toBe(trims);
    expect(m.a.trims).toHaveLength(4);
  });

  it('makes a bigger engine louder per event and its pipe lower', () => {
    const small = model(geom({ configuration: 'I4', cyl: 4, displacementL: 2.0, bore: 86 }), 's');
    const big = model(geom({ configuration: 'I4', cyl: 4, displacementL: 4.0, bore: 104 }), 'b');
    run(small, { rpm: 2000 }); run(big, { rpm: 2000 });
    expect(energy(big)).toBeGreaterThan(energy(small));
    tone(small); tone(big);
    expect(big.a.pipeDelay.delayTime.value).toBeGreaterThan(small.a.pipeDelay.delayTime.value);
  });

  it('puts a bigger engine\'s body and tone lower, not higher', () => {
    // The reference said a bigger engine sounds deeper and then divided where it meant to
    // multiply, so a 2-litre four came out darker than a 6-litre V8.
    const small = model(geom({ configuration: 'I4', cyl: 4, displacementL: 2.0 }), 's');
    const big = model(geom({ configuration: 'I4', cyl: 4, displacementL: 6.0 }), 'b');
    tone(small); tone(big);
    expect(big.a.body.frequency.value).toBeLessThan(small.a.body.frequency.value);
    expect(big.a.tone.frequency.value).toBeLessThan(small.a.tone.frequency.value);
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

  it('rings less and muffles less with a cat-back fitted', () => {
    const m = model();
    tone(m, { catBack: false });
    const stock = { ring: m.a.pipeFeedback.gain.value, cut: m.a.muffler.gain.value };
    tone(m, { catBack: true });
    expect(m.a.pipeFeedback.gain.value).toBeLessThan(stock.ring);
    expect(m.a.muffler.gain.value).toBeGreaterThan(stock.cut);
  });

  it('muffles the top end harder with a turbine in the path', () => {
    const na = model(geom(), 'na');
    const turbo = model(geom({ turboFitted: true }), 't');
    tone(na); tone(turbo);
    expect(turbo.a.muffler.gain.value).toBeLessThan(na.a.muffler.gain.value);
  });

  it('sharpens the crack with compression', () => {
    const low = model(geom({ compression: 9 }), 'l');
    const high = model(geom({ compression: 12 }), 'h');
    tone(low); tone(high);
    expect(high.a.tone.frequency.value).toBeGreaterThan(low.a.tone.frequency.value);
  });
});

describe('what the engine is doing', () => {
  it('hits harder from a harder-run cylinder, and opens up with the throttle', () => {
    const light = model();
    const heavy = model();
    run(light, { evoKpa: 150, load: 0.1 });
    run(heavy, { evoKpa: 450, load: 1 });
    expect(energy(heavy)).toBeGreaterThan(2 * energy(light));
    tone(light, { load: 0.1 }); tone(heavy, { load: 1 });
    expect(heavy.a.tone.frequency.value).toBeGreaterThan(light.a.tone.frequency.value);
    expect(heavy.a.pipeOut.gain.value).toBeGreaterThan(light.a.pipeOut.gain.value);
  });

  it('is weaker, not silent, on a fuel cut', () => {
    const cut = model();
    run(cut, { evoKpa: 48, load: 0 });
    expect(energy(cut)).toBeGreaterThan(0);
  });

  it('rasps when the timing is retarded', () => {
    const m = model();
    tone(m, { rasp: 0 });
    const clean = m.a.tone.frequency.value;
    tone(m, { rasp: 1 });
    expect(m.a.tone.frequency.value).toBeGreaterThan(clean);
  });

  it('scatters more at light load than wide open', () => {
    const idle = run(model(), { rpm: 900, load: 0.1 }, 1.5).map((e) => e.evoKpa);
    const wot = run(model(), { rpm: 900, load: 1 }, 1.5).map((e) => e.evoKpa);
    expect(sd(idle) / mean(idle)).toBeGreaterThan(sd(wot) / mean(wot));
  });

  it('lopes with a big cam at idle and not with a stock one', () => {
    const stock = run(model(), { rpm: 800, load: 0.1, lopeSeverity: 0 }, 1.5).map((e) => e.evoKpa);
    const cam = run(model(), { rpm: 800, load: 0.1, lopeSeverity: 0.5 }, 1.5).map((e) => e.evoKpa);
    expect(sd(cam) / mean(cam)).toBeGreaterThan(2 * (sd(stock) / mean(stock)));
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

  it('is silent below cranking speed, when not audible, and when silenced', () => {
    const still = model();
    expect(run(still, { rpm: 0 })).toHaveLength(0);
    expect(still.played).toHaveLength(0);
    expect(run(model(), { audible: false })).toHaveLength(0);
    const m = model();
    run(m);
    silencePulseExhaust(m.a, m.ctx);
    expect(m.a.bus.gain.value).toBe(0);
    expect(m.a.stream.head).toBe(-1);
    wakePulseExhaust(m.a, m.ctx);
    expect(m.a.bus.gain.value).toBeGreaterThan(0);
  });

  it('survives a non-finite number instead of throwing and killing every layer', () => {
    const m = model();
    expect(() => {
      run(m, { rpm: NaN, level: NaN });
      run(m, { evoKpa: NaN, portKpa: NaN, load: NaN, lopeSeverity: NaN });
      tone(m, { rpm: NaN, load: NaN });
    }).not.toThrow();
    for (const p of m.played) for (const v of p.data) expect(Number.isFinite(v)).toBe(true);
  });
});
