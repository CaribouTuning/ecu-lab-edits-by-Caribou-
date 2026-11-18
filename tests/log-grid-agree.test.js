/**
 * The pull log and TUNE tell one story, pull after pull, as a player sees them: fit a part to a
 * factory engine, pull, type every mark exactly as it is shown, pull again.
 *
 * - every spark and FUEL cell the log names carries the number TUNE marks under it;
 * - the log never says the target is fine where TUNE marks it, and TUNE never moves a target
 *   to make up for the fuelling;
 * - a number the player typed is never reversed on the next pull without a knock to say why
 *   (a mark that keeps adding timing a step at a time is tuning, not a reversal);
 * - the build ends clean, or with the limit named (no spark the table holds is safe: less
 *   boost), within six pulls.
 *
 * Before this, 42 of 73 preset builds broke at least one of these (the agreement audit).
 */

import { describe, expect, it } from 'vitest';

import * as S from '../src/sim/index.js';
import { makeInitialState } from '../src/ui/state/initialState.js';
import { ACTIONS, reducer } from '../src/ui/state/reducer.js';
import { advice, pull } from './guidedPlayer.js';

const preset = (id) => reducer(makeInitialState(), { type: ACTIONS.APPLY_PRESET, preset: S.applyPreset(S.presetById(id)) });
const B = (s, field, value) => reducer(s, { type: ACTIONS.SET_BUILD_FIELD, field, value });
const mods = (st, m) => B(st, 'mods', { ...st.build.mods, ...m });
const turbo8 = (st) => B(B(B(mods(B(st, 'turboOn', true), { intercooler: true }), 'compressorIdx', 1), 'boostCurve', [0, 2, 6, 8, 8, 8, 8, 8]), 'octaneIdx', 1);
/** @type {[string, string, (st: any) => any][]} */
const BUILDS = [
  ['ls1', 'turbo 8 psi', turbo8],
  ['vq35de-revup', 'turbo 8 psi', turbo8],
  ['b58-m1', 'bolt-ons', (st) => mods(st, { intake: true, exhaust: true, headers: true })],
  ['b58-m1', 'boost +4 psi', (st) => B(st, 'boostCurve', st.build.boostCurve.map((b) => (b > 0 ? b + 4 : b)))],
  ['ea888-gti', 'E85', (st) => B(st, 'octaneIdx', 3)],
  ['vq35hr', 'TVS1900', (st) => { const s = B(mods(B(st, 'blowerId', 'tvs1900'), { intercooler: true }), 'octaneIdx', 1); return B(s, 'blowerRatio', S.starterRatio(s.build, S.tankFuel(s.build))); }],
  ['lq4', 'E85', (st) => B(st, 'octaneIdx', 3)],
];

describe('the pull log and TUNE agree, pull after pull', () => {
  for (const [id, name, mod] of BUILDS) {
    it(`${id}, ${name}`, () => {
      let st = mod(preset(id));
      const ax = S.layoutById(st.tune.layout);
      /** @type {Map<string, {value: number, dir: number, round: number}>} */
      const typed = new Map();
      let end = null;
      for (let round = 0; round < 6 && !end; round += 1) {
        const p = pull(st);
        const a = advice(st, p);
        const knocked = p.events.some((e) => ['knock', 'unheardknock'].includes(e.type));
        for (const e of p.events) {
          const text = `${e.cause ?? ''} ${e.fix ?? ''}`;
          expect(text, e.msg).not.toMatch(/target is fine|AFR table is right|not the target|target is not the fault/i);
          for (const m of text.matchAll(/(\d+) kPa at ([\d,]+) RPM from -?[\d.]+° to (-?\d+)°/g)) {
            const c = a.overAdvanced.find((x) => Math.round(ax.timing.load[x.ri]) === Number(m[1]) && ax.timing.rpm[x.ci] === Number(m[2].replace(',', '')));
            expect(c?.suggested, `pull ${round}: spark ${m[1]} kPa at ${m[2]} RPM`).toBe(Number(m[3]));
          }
          for (const m of text.matchAll(/([0-9.]+) kPa at ([0-9,]+) RPM from ([0-9.]+) to ([0-9.]+)(?!°|[0-9.])/g)) {
            const c = a.wrongMix.find((x) => Math.round(ax.afr.load[x.ri]) === Number(m[1]) && ax.afr.rpm[x.ci] === Number(m[2].replace(',', '')));
            expect(c?.suggested, `pull ${round}: FUEL ${m[1]} kPa at ${m[2]} RPM`).toBe(Number(m[4]));
          }
        }
        // Targets are judged on themselves: what TUNE marks is best power for the row.
        // (A direct-injected cell is judged on the port band where no spark is safe there.)
        for (const c of a.wrongMix) {
          const asIs = [true, false].map((direct) => S.afrTargetVerdict({ value: c.current, kpa: c.map, direct }).suggested);
          expect(asIs, `${c.map} kPa at ${c.rpm} RPM`).toContain(c.suggested);
        }
        // A typed number reversed on the next pull, with no knock in it to say why.
        for (const c of [...a.overAdvanced, ...a.underAdvanced, ...a.pastMbt]) {
          const t = typed.get(`${c.ri}|${c.ci}`);
          if (!t || t.round !== round - 1 || t.value !== c.current || c.sparkCannotFix) continue;
          const now = Math.sign(c.suggested - c.current);
          if (t.dir > 0 && now > 0) continue;
          if (now < 0 && knocked && c.knockingOnPull) continue;
          expect.fail(`pull ${round}: ${ax.timing.load[c.ri]} kPa at ${c.rpm} RPM typed ${c.current}, now ${c.suggested}`);
        }
        const mix = a.wrongMix.filter((c) => !c.beyondReach && Math.abs(c.delta) >= 0.1);
        const spark = [...a.overAdvanced, ...a.underAdvanced, ...a.pastMbt];
        if (!mix.length && !spark.length) { end = 'clean'; break; }
        if (!mix.length && !a.underAdvanced.length && !a.pastMbt.length && a.overAdvanced.every((c) => c.sparkCannotFix)) {
          expect(p.events.some((e) => /lower the boost target|larger blower pulley/.test(String(e.fix))), 'the log names less boost').toBe(true);
          end = 'less boost'; break;
        }
        st = { ...st, tune: { ...st.tune, timing: st.tune.timing.map((r) => [...r]), afr: st.tune.afr.map((r) => [...r]) } };
        for (const c of spark) { st.tune.timing[c.ri][c.ci] = c.suggested; typed.set(`${c.ri}|${c.ci}`, { value: c.suggested, dir: Math.sign(c.suggested - c.current), round }); }
        for (const c of mix) st.tune.afr[c.ri][c.ci] = c.suggested;
      }
      expect(end, 'ends clean or with its limit named within six pulls').not.toBe(null);
    }, 300_000);
  }
});
