/**
 * What the pull log, the VE correction and the start-up map say, held to what a player can act
 * on.
 */

import { describe, expect, it } from 'vitest';

import * as S from '../src/sim/index.js';
import { ecuSweepEvents } from '../src/sim/ecu/ecuEvents.js';

const cal = S.defaultEcuCalibration({ derived: S.deriveEngine(S.DEFAULT_ENGINE_CONFIG) });
const run = (pts, extra = {}) => ecuSweepEvents(pts, { cal, hw: /** @type {any} */ ({ turboOn: true }), hardCut: 7000, endRpm: 7000, ...extra });
const pt = (rpm, more) => ({ rpm, afr: 12.5, afrCommanded: 12.5, sensedLambda: 0.85, lambda: 0.85, egt: 900, ...more });

describe('protection entries name a fix the player can make', () => {
  it('does not ask for an intercooler on a car that has one', () => {
    const pts = [3000, 3100, 3200].map((rpm) => pt(rpm, { protect: ['iat'], sensedIat: 80 }));
    const without = run(pts).find((e) => e.type === 'iatprot');
    const withIc = run(pts, { intercooled: true }).find((e) => e.type === 'iatprot');
    expect(without.fix).toMatch(/fit an intercooler/);
    expect(withIc.fix).not.toMatch(/fit an intercooler/);
    expect(withIc.fix).toMatch(/Lower the boost target across 3000–3200 RPM/);
  });

  it('names the cells a boost cut hid from Correct VE from logs, at the boost it asked for', () => {
    const steps = [{ label: 'Base target (BUILD curve)', value: 12 }, { label: 'Throttle request (98%)', value: 11.8 }];
    const pts = [2000, 2100, 2200].map((rpm) => pt(rpm, {
      protect: ['lean'], leanTripLambda: 1.03, sensedLambda: 1.0, lambda: 1.0, afrCommanded: 14.7, boostPsi: 0, boostTarget: 0, boostSteps: steps,
    }));
    const e = run(pts).find((x) => x.type === 'leanprot');
    expect(e.fix).toMatch(/Correct VE from logs cannot see the cells that ran lean/);
    expect(e.fix).toMatch(/rows around 183 kPa across 2000–2200 RPM by about 3%/);
  });

  it('names the rows from where a spooling turbo tripped up to the boost it asked for', () => {
    const steps = [{ label: 'Base target (BUILD curve)', value: 12 }, { label: 'Throttle request (98%)', value: 11.8 }];
    // It tripped at 150-160 kPa on its way to the 183 kPa it asked for: the rows it ran lean in.
    const pts = [2000, 2100, 2200].map((rpm, i) => pt(rpm, {
      protect: ['lean'], leanTripLambda: 1.03, leanTripKpa: 150 + i * 5, sensedLambda: 1.0, lambda: 1.0, afrCommanded: 14.7, boostPsi: 0, boostTarget: 0, boostSteps: steps,
    }));
    const e = run(pts).find((x) => x.type === 'leanprot');
    expect(e.fix).toMatch(/tripped at λ 1\.03 at 150 kPa, asking for about 183 kPa/);
    expect(e.fix).toMatch(/rows from 150 to 183 kPa across 2000–2200 RPM by about 3%/);
  });

  it('quotes the exhaust temperature that tripped the enrichment, not the cooler one after it', () => {
    const pts = [4000, 4100].map((rpm) => pt(rpm, { protect: ['egt'], egt: 720, egtTripC: 985 }));
    expect(run(pts).find((e) => e.type === 'egtprot').msg).toMatch(/EGT 985 °C against a 950 °C limit/);
  });
});

describe('VE learning keeps every point whose fuelling was the table\'s', () => {
  const base = { openLoop: true, sensedLambda: 1.03, afrCommanded: 14.7, rpm: 2000, map: 101, sensedMap: 101 };
  it('takes a point a boost cut or knock retard acted on: the fuel was as calculated', () => {
    for (const protect of [['lean'], ['knock'], ['duty'], ['overboost']]) expect(S.veSamplesFromPull([{ ...base, protect }])).toHaveLength(1);
  });
  it('leaves out a point the EGT enrichment or a starved rail fuelled', () => {
    for (const protect of [['egt'], ['fuelpressure']]) expect(S.veSamplesFromPull([{ ...base, protect }])).toHaveLength(0);
  });
});

describe('a start-up map is a start, not a tune', () => {
  it('sits START_UP_RETARD_DEG short at full load, and keeps light load and the idle column', () => {
    const axes = S.GAME_LAYOUT.timing;
    const t = axes.load.map(() => axes.rpm.map(() => 20));
    const out = S.startUpTiming(t, axes);
    axes.load.forEach((load, ri) => axes.rpm.forEach((rpm, ci) => {
      const full = load >= S.OPEN_LOOP_KPA && rpm > S.IDLE_COLUMN_MAX_RPM;
      expect(out[ri][ci], `${rpm} RPM ${load} kPa`).toBe(full ? 20 - S.START_UP_RETARD_DEG : 20);
    }));
  });

  it('leaves the factory engines on their factory calibration', () => {
    const p = S.applyPreset(S.presetById('vq35de-revup'));
    const f = S.factoryCalibration({ ...S.presetById('vq35de-revup') });
    expect(p.timing).toEqual(f.timing);
  });
});


describe('a setting the log names is on the page, not folded away', () => {
  it('names no setting that sits under Advanced settings', async () => {
    // The pull log once said "On TUNE → BOOST, raise Maximum duty", and Maximum duty was
    // folded under Advanced settings, where a player following the log could not find it.
    const { readFileSync } = await import('node:fs');
    const text = ['src/sim/sweep.js', 'src/sim/ecu/ecuEvents.js', 'src/sim/advisors.js']
      .map((f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')).join('\n');
    const named = S.ECU_META.filter((m) => m.pro && text.includes(m.label)).map((m) => `${m.section}: ${m.label}`);
    expect(named).toEqual([]);
  });
});
