/**
 * What the Physics app draws comes from the model, not from a second one in the UI
 * (CONTRIBUTING: physics lives in src/sim). These hold the helpers it reads to the model's
 * own numbers: direction and identity, not magnitudes (those are the fingerprint's).
 */

import { describe, expect, it } from 'vitest';

import {
  OCTANE_OPTS, airDensityKgM3, brakeThermalEfficiency, catalystLossShare, exhaustSystemDropKpa, fourStrokeTrace,
  gasExchangeTrace, measuredVePct, simulateSweep,
} from '../src/sim/index.js';
import { catalystSubstrate, exhaustPipeFlow } from '../src/sim/breathing.js';
import { buildRig } from '../src/sim/rig.js';

describe('the exhaust pipe the Physics page shows', () => {
  it('is the flow the back-pressure is priced on: each loss is its coefficient times ½ρu²', () => {
    const flow = { flowKgS: 0.15, exhaustK: 900, pipeDiaIn: 2.5 };
    const total = exhaustSystemDropKpa({ ...flow, mods: {} });
    const { dynamicKpa } = exhaustPipeFlow(flow);
    expect(total / dynamicKpa).toBeGreaterThan(1);
    // A bigger pipe: slower gas, and the loss falls with the dynamic pressure, as 1/d⁴.
    const big = exhaustPipeFlow({ ...flow, pipeDiaIn: 3.5 });
    expect(big.speedMs).toBeLessThan(exhaustPipeFlow(flow).speedMs);
    expect(exhaustSystemDropKpa({ ...flow, pipeDiaIn: 3.5, mods: {} }) / big.dynamicKpa).toBeCloseTo(total / dynamicKpa, 9);
  });

  it('draws the catalyst the loss is priced from: a thinner-walled, coarser substrate is more open and cheaper to push through', () => {
    const ceramic = catalystSubstrate('ceramic'); const metallic = catalystSubstrate('metallic');
    expect(metallic.openArea).toBeGreaterThan(ceramic.openArea);
    expect(metallic.channelIn).toBeGreaterThan(ceramic.channelIn);
    expect(catalystLossShare('metallic')).toBeCloseTo(
      (ceramic.openArea * ceramic.channelIn ** 2) / (metallic.openArea * metallic.channelIn ** 2), 9);
  });

  it('comes with the gas exchange, carrying all of the flow through the one pipe', () => {
    const rig = buildRig({ preset: 'vq35de-revup' });
    const gx = gasExchangeTrace(rig.build.engineConfig, rig.build.mods, { ...rig.hw, exhaustDia: 3 }, 4500, 99);
    expect(gx.exhaustPipe.flowKgS * 1000).toBeCloseTo(gx.exhaustFlowGs, 6);
    expect(gx.exhaustPipe.pipeDiaIn).toBe(3);
    expect(gx.catalyst).not.toBeNull();
  });
});

describe('the four strokes', () => {
  it('join the closed cycle and the gas exchange into one record, in crank order, over the whole 720', () => {
    const rig = buildRig({ preset: 'vq35de-revup' });
    const rpm = 4500;
    const pt = simulateSweep({ ...rig.pullArgs(100), onlyRpm: rpm, traceRpm: rpm }).points[0];
    expect(pt.rpm).toBe(rpm);
    const gx = gasExchangeTrace(rig.build.engineConfig, rig.build.mods, { ...rig.hw, exhaustDia: 3 }, rpm, pt.map);
    const four = fourStrokeTrace(pt.cycleTrace, gx.trace);
    for (let i = 1; i < four.phi.length; i++) expect(four.phi[i]).toBeGreaterThanOrEqual(four.phi[i - 1]);
    expect(four.phi[0]).toBeLessThan(10);
    expect(four.phi[four.phi.length - 1]).toBeGreaterThan(700);
    // The highest pressure is the burn's, just after firing TDC (360), and it is the cycle's own.
    const peak = Math.max(...four.bar);
    const at = four.phi[four.bar.indexOf(peak)];
    expect(at).toBeGreaterThan(360);
    expect(at).toBeLessThan(420);
    expect(peak).toBe(Math.max(...pt.cycleTrace.bar));
    // The charge is burned by the time the exhaust valve is open, and unburned on the intake stroke.
    expect(four.burned[four.burned.length - 1]).toBe(1);
    expect(four.burned[0]).toBe(0);
  });
});

describe('the sums the screens show', () => {
  it('measured VE inverts the ideal-gas fill', () => {
    const rho = airDensityKgM3(100, 300);
    const airMg = 0.9 * rho * 0.5e-3 * 1e6;
    expect(measuredVePct({ airMgPerCyl: airMg, mapKpa: 100, chargeK: 300, cylL: 0.5 })).toBeCloseTo(90, 9);
  });

  it('thermal efficiency reads the fuel\'s own heating value: the same BSFC on E85 is a better engine', () => {
    const gas = OCTANE_OPTS.find((x) => x.label === '91'); const e85 = OCTANE_OPTS.find((x) => x.label === 'E85');
    expect(brakeThermalEfficiency(0.65, e85.lhv)).toBeGreaterThan(brakeThermalEfficiency(0.65, gas.lhv));
    expect(brakeThermalEfficiency(0.4, gas.lhv)).toBeGreaterThan(brakeThermalEfficiency(0.5, gas.lhv));
  });
});
