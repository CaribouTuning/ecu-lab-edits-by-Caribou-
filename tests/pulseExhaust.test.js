/**
 * The exhaust note.
 *
 * "It should sound like a real engine" is not testable, but the physics that makes an
 * engine sound the way it does is. These assert the mechanisms against theory rather than
 * against recorded values: that the blowdown time constant is a volume divided by a flow,
 * that the tubes are tuned to length over the speed of sound in hot gas, that the pulses
 * land on the firing events, and — most of all — that changing something which would change
 * a real engine's note changes this one, in the direction and by roughly the ratio the
 * physics says.
 *
 * A model that passes these cannot have a hard-coded note, because every number the note is
 * made from is pinned to something measurable about the engine.
 */

import { describe, it, expect } from 'vitest';
import { exhaustGeometry } from '../src/sim/acoustics.js';
import {
  createPulseExhaust, setPulseExhaustGeometry, schedulePulseExhaust, tonePulseExhaust,
  silencePulseExhaust, blowdown,
} from '../src/ui/audio/pulseExhaust.js';
import { stubContext } from './ui/audioStub.js';

/** A real geometry, so the tests run against the same numbers the app does. */
function geom(over = {}) {
  return exhaustGeometry({
    configuration: 'V8', cyl: 8, displacementL: 5.0, bore: 95, compression: 10.5,
    pipeDiaIn: 3.0, gasTempK: 900, headers: false, turboFitted: false, ...over,
  });
}

/** Build a model on a stub context, pointed at a geometry. */
function model(g = geom(), key = 'open|x') {
  const ctx = stubContext();
  const a = createPulseExhaust(ctx);
  setPulseExhaustGeometry(a, ctx, g, key);
  return { ctx, a };
}

/** One scheduling pass, returning the times pulses were started at. */
function pulses(a, ctx, frame) {
  const before = ctx.started.length;
  schedulePulseExhaust(a, ctx, {
    rpm: 2000, level: 1, evoKpa: 400, gasTempK: 900, overlapDeg: 0, lopeSeverity: 0, ...frame,
  });
  return ctx.started.slice(before).filter((v) => v > 0).sort((x, y) => x - y);
}

const gaps = (t) => t.slice(1).map((v, i) => v - t[i]);
const mean = (xs) => xs.reduce((x, y) => x + y, 0) / xs.length;

describe('blowdown, the excitation', () => {
  it('empties a cylinder in a volume divided by a flow', () => {
    // tau = V / (c * A * Cd). A real engine blows down in of the order of a millisecond,
    // so a model that lands three orders of magnitude off is not modelling this at all.
    const { tau } = blowdown(geom(), 400, 900);
    expect(tau).toBeGreaterThan(0.0002);
    expect(tau).toBeLessThan(0.006);
  });

  it('gives a bigger cylinder a longer, lazier pulse', () => {
    // The same valve emptying twice the volume takes twice as long. This is the reason a
    // big-bore loafer thumps where a small engine cracks, and it must fall out of the
    // geometry rather than being asserted by a voicing table.
    const small = blowdown(geom({ displacementL: 2.0, cyl: 4, bore: 86 }), 400, 900).tau;
    const big = blowdown(geom({ displacementL: 6.2, cyl: 8, bore: 103 }), 400, 900).tau;
    expect(big).toBeGreaterThan(small);
  });

  it('empties faster when the gas is hotter, because sound travels faster in it', () => {
    // c goes as sqrt(T), so quadrupling absolute temperature halves tau. Retarded timing
    // raises gas temperature, so this is the path by which retard reaches the note.
    const cool = blowdown(geom(), 400, 600).tau;
    const hot = blowdown(geom(), 400, 2400).tau;
    expect(hot / cool).toBeCloseTo(0.5, 1);
  });

  it('stops adding turbulence once the valve chokes', () => {
    // Past a pressure ratio of about 1.83 the gas leaves at the speed of sound however much
    // more pressure is behind it, so the jet noise saturates and the pulse sharpens instead
    // of simply getting louder.
    const below = blowdown(geom(), 120, 900).jet;
    const at = blowdown(geom(), 190, 900).jet;
    const far = blowdown(geom(), 600, 900).jet;
    expect(below).toBeLessThan(at);
    expect(far).toBeCloseTo(at, 5);
  });
});

describe('the pipes, which make the pitch', () => {
  it('tunes the tail to its own length over the speed of sound in it', () => {
    // A delay line carries a round trip, and the tail is a half-wave resonator, so the
    // delay is one length. Doubling the pipe halves the note.
    const short = model(geom({ pipeDiaIn: 3.0 }));
    const d1 = short.a.tail.delay.delayTime.value;
    const long = model(geom({ displacementL: 8.0, cyl: 8, bore: 105 }), 'open|y');
    expect(long.a.tail.delay.delayTime.value).toBeGreaterThan(d1);
  });

  it('retunes the whole system when the gas gets hotter', () => {
    // THE RETARD MECHANISM. Nothing here knows what ignition timing is. A hotter port means
    // a faster speed of sound means shorter delays means a higher, harder note — which is
    // exactly what a retarded engine does, for exactly this reason.
    const { ctx, a } = model();
    tonePulseExhaust(a, ctx, { load: 1, gasTempK: 800, rasp: 0 });
    const cool = a.tail.delay.delayTime.value;
    tonePulseExhaust(a, ctx, { load: 1, gasTempK: 1200, rasp: 0 });
    const hot = a.tail.delay.delayTime.value;
    expect(hot).toBeLessThan(cool);
    // sqrt(800/1200) = 0.816, and the delay scales with 1/c.
    expect(hot / cool).toBeCloseTo(Math.sqrt(800 / 1200), 2);
  });

  it('moves the header ring when headers are fitted', () => {
    // Headers change the primary length, and the primary is what gives an engine its hard
    // edge. Fitting them must move that ring and not merely turn something up.
    const cast = model(geom({ headers: false }), 'open|a');
    const header = model(geom({ headers: true }), 'open|b');
    expect(header.a.primary.delay.delayTime.value)
      .not.toBeCloseTo(cast.a.primary.delay.delayTime.value, 4);
  });

  it('rings less through a muffler than through straight pipe', () => {
    // A muffler absorbs the reflection instead of returning it. That is the whole audible
    // difference a cat-back makes, so it belongs in the feedback term.
    const open = model(geom(), 'open|x');
    const muffled = model(geom(), 'muffled|x');
    expect(muffled.a.tail.feedback.gain.value).toBeLessThan(open.a.tail.feedback.gain.value);
  });

  it('damps when a turbine sits in the exhaust', () => {
    // A turbine takes energy out of the gas, which is why turbo cars are quieter. The
    // geometry reports that as absorption; the model must respond to it.
    const na = model(geom({ turboFitted: false }), 'open|n');
    const turbo = model(geom({ turboFitted: true }), 'open|t');
    expect(turbo.a.tail.feedback.gain.value).toBeLessThan(na.a.tail.feedback.gain.value);
  });
});

describe('the rhythm, which makes the layout', () => {
  it('spaces a cross-plane V8 unevenly and an even-firing six evenly', () => {
    // This is the rumble. A V8's banks are offset, so its pulses alternate long and short;
    // a 60/120 V6 fires evenly. Even-fire the V8 and it stops sounding like one.
    const v8 = model(geom(), 'open|v8');
    const v6 = model(geom({ configuration: 'V6', cyl: 6, displacementL: 3.5 }), 'open|v6');
    const spread = (g) => (Math.max(...g) - Math.min(...g)) / mean(g);
    expect(spread(gaps(pulses(v6.a, v6.ctx, { rpm: 1800 })))).toBeLessThan(0.05);
    expect(spread(gaps(pulses(v8.a, v8.ctx, { rpm: 1800 })))).toBeGreaterThan(0.2);
  });

  it('gives a four far wider gaps than an eight at the same engine speed', () => {
    const i4 = model(geom({ configuration: 'I4', cyl: 4, displacementL: 2.0 }), 'open|i4');
    const v8 = model(geom(), 'open|v8');
    const a = mean(gaps(pulses(i4.a, i4.ctx, { rpm: 2000 })));
    const b = mean(gaps(pulses(v8.a, v8.ctx, { rpm: 2000 })));
    expect(a / b).toBeGreaterThan(1.7);
  });

  it('fires a pulse for every event at any engine speed', () => {
    // There is no looped layer any more. An earlier version crossfaded to a pre-rendered
    // cycle above about 200 events a second, and ran TWO copies of it detuned by 0.15% to
    // stop it reading as a held note — which is a flanger. Two near-identical periodic
    // signals summed comb-filter against each other, and that sweeping cancellation is
    // heard as a whoosh on the way up and again on the way down. Every event is scheduled.
    // A model each, because the scheduler keeps a cursor and the stub's clock does not
    // advance on its own — one model would schedule ahead on the first call and find
    // nothing left to do on the second.
    const lowModel = model();
    const highModel = model();
    const low = pulses(lowModel.a, lowModel.ctx, { rpm: 1200 });
    const high = pulses(highModel.a, highModel.ctx, { rpm: 7000 });
    expect(low.length).toBeGreaterThan(2);
    expect(high.length).toBeGreaterThan(low.length);
  });
});

describe('what the engine is doing', () => {
  it('hits harder when there is more pressure behind the valve', () => {
    // Load and boost reach the note as cylinder pressure at valve opening, not as a volume
    // map. A cylinder at five atmospheres pushes far harder than one at one and a half.
    const quiet = blowdown(geom(), 150, 900, 2000).amplitude;
    const loud = blowdown(geom(), 600, 1050, 2000).amplitude;
    expect(loud).toBeGreaterThan(quiet * 2);
  });

  it('still makes a note when there is no blowdown left at all', () => {
    // THE OVERRUN BUG. A closed throttle with the fuel cut reaches valve opening BELOW
    // atmospheric — the app reports about 48 kPa — so there is no overpressure to blow
    // down. An engine modelled on blowdown alone goes silent exactly there, which is wrong:
    // the piston still sweeps the gas out, and that is what an overrun sounds like.
    const idle = blowdown(geom(), 48, 775, 800);
    expect(idle.pressureRatio).toBeLessThan(1);
    expect(idle.amplitude).toBeGreaterThan(0.05);
  });

  it('gets louder with engine speed even with the throttle shut', () => {
    // The displacement term is a gas velocity: the same swept volume pushed through the
    // same valve in a quarter of the time is four times the speed. It is why an engine on
    // the overrun is not the same volume at 2000 as at 6000.
    const low = blowdown(geom(), 48, 775, 1000).amplitude;
    const high = blowdown(geom(), 48, 775, 6000).amplitude;
    expect(high).toBeGreaterThan(low * 3);
  });

  it('keeps firing while the blowdown moves under it', () => {
    // Gas temperature moves with load, so the rendered time constant changes mid-pull. A
    // version of this rebuilt the always-running layer every time it crossed a step and
    // left it ramping up from zero — two and a half seconds of exact silence mid-pull.
    const { ctx, a } = model();
    for (const [evoKpa, gasTempK] of [[200, 800], [450, 1000], [520, 1100], [180, 820]]) {
      expect(pulses(a, ctx, { rpm: 6000, evoKpa, gasTempK }).length).toBeGreaterThan(2);
      // The stub's clock is ours to move, and the scheduler works ahead of it.
      ctx.currentTime += 0.12;
    }
  });

  it('is silent below cranking speed and with nothing driving it', () => {
    const { ctx, a } = model();
    expect(pulses(a, ctx, { rpm: 0 })).toHaveLength(0);
    expect(pulses(a, ctx, { level: 0 })).toHaveLength(0);
  });

  it('stops firing when it is silenced', () => {
    // Pulses already handed to the clock cannot be unscheduled, so silencing has to push the
    // cursor past them as well as close the gain.
    const { ctx, a } = model();
    silencePulseExhaust(a, ctx);
    expect(pulses(a, ctx, {})).toHaveLength(0);
    expect(a.bus.gain.value).toBe(0);
  });

  it('does not retune a system it is already playing', () => {
    // Gas temperature moves the delays every frame. Retuning from scratch on every call
    // would snap them back to the cold geometry, which is heard as the note jumping.
    const { ctx, a } = model();
    a.tail.delay.delayTime.value = 0.0123;
    setPulseExhaustGeometry(a, ctx, geom(), 'open|x');
    expect(a.tail.delay.delayTime.value).toBe(0.0123);
  });
});

describe('the flow, which is most of what you hear', () => {
  /** Every curve written to the flow voices' turbulence gains. */
  const curves = (a) => a.voices.flatMap((v) => v.noiseGain.gain.curves);

  it('drives a turbulence curve for every event, not a click', () => {
    // The boop. A smooth pulse per event rung through resonant pipes is a tone generator:
    // 82-96% of the energy in twenty bins, against 35-63% for real engines. Gas leaves over
    // the whole exhaust stroke and most of what is heard is the turbulence of that flow.
    const { ctx, a } = model();
    const fired = pulses(a, ctx, { rpm: 2000 });
    expect(curves(a).length).toBeGreaterThanOrEqual(fired.length);
    for (const c of curves(a)) {
      expect(Math.max(...c)).toBeGreaterThan(0);
      expect(c[c.length - 1]).toBe(0);
    }
  });

  it('still breathes on the overrun, where there is nothing to blow down', () => {
    // Below atmospheric at valve opening there is no crack, but the piston still pushes a
    // cylinder of gas out through the valve, and that flow is what an idle sounds like.
    const { ctx, a } = model();
    pulses(a, ctx, { rpm: 1500, evoKpa: 48, gasTempK: 775 });
    expect(curves(a).length).toBeGreaterThan(2);
  });

  it('brightens as the gas moves faster', () => {
    // Faster gas sheds smaller eddies, which are higher-pitched: a Strouhal scaling. The
    // same engine revving harder must move the turbulence up, not only turn it up.
    const last = (a) => Math.max(...a.voices.map((v) => v.turbulence.frequency.value));
    const slow = model();
    pulses(slow.a, slow.ctx, { rpm: 1000, evoKpa: 150 });
    const fast = model();
    pulses(fast.a, fast.ctx, { rpm: 5000, evoKpa: 150 });
    expect(last(fast.a)).toBeGreaterThan(last(slow.a));
  });

  it('never repeats an event exactly', () => {
    // A perfectly periodic train has a perfectly harmonic line spectrum, and the ear reads
    // that as synthesis at once. Real combustion varies cycle to cycle.
    const { ctx, a } = model();
    pulses(a, ctx, { rpm: 2000 });
    const peaks = curves(a).map((c) => Math.max(...c));
    expect(new Set(peaks.map((p) => p.toFixed(6))).size).toBeGreaterThan(peaks.length / 2);
  });
});
