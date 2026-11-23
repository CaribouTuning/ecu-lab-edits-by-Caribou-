/**
 * Customer cars: a real engine from the preset catalogue, on its factory calibration,
 * with whatever the customer has done to it since.
 *
 * Built through the store's own reducer (APPLY_PRESET), so a customer's car is exactly
 * the car SANDBOX would give you from the same preset. The customer's changes go on
 * top of the hardware only: the ECU still carries the factory tables for the factory
 * parts, which is precisely why a modified car arrives running wrong.
 */

import { EXHAUST_DIA_OPTS, applyPreset, idealExhaustDiameter, liveStep, makeEcuLiveState, makeLiveState, presetById } from '../../sim/index.js';
import { makeInitialState } from '../state/initialState.js';
import { pullInputs } from '../state/pullInputs.js';
import { ACTIONS, reducer } from '../state/reducer.js';

/** @typedef {import('../state/initialState.js').StoreState} StoreState */

/**
 * @typedef {object} CarSpec
 * @property {string|null} [preset] an ENGINE_PRESETS id; null is the game's own default V6
 * @property {object} [custom] a `customEnginePatch` for an engine described by its figures, in place of a preset
 * @property {(build: any) => object} [build] the customer's hardware changes, as a build patch
 * @property {(tune: any) => object} [tune] anything already done to the calibration
 * @property {{ambientC?: number, altitudeM?: number}} [env] where the customer drives
 */

/**
 * The store state with the customer's car on the lift.
 *
 * @param {CarSpec} spec
 * @returns {StoreState}
 */
export function customerCar(spec) {
  let s = makeInitialState();
  if (spec.custom) s = reducer(s, { type: ACTIONS.APPLY_PRESET, preset: /** @type {any} */ (spec.custom) });
  else if (spec.preset) s = reducer(s, { type: ACTIONS.APPLY_PRESET, preset: applyPreset(presetById(spec.preset)) });
  const build = { ...s.build, ...(spec.build ? spec.build(s.build) : {}), presetId: null };
  const tune = { ...s.tune, ...(spec.tune ? spec.tune(s.tune) : {}), tablesDirty: false, selection: null };
  return {
    ...s,
    build,
    tune,
    session: { ...s.session, env: { ...s.session.env, ...(spec.env ?? {}) }, mode: 'career' },
  };
}

/**
 * Idles the car on the LIVE engine, warm, and reports how it held: the same `liveStep`
 * LIVE runs, with the configuration EcuLab.jsx hands it. With `acAt`, the A/C comes on
 * that many seconds in, the way a driver switches it on at a light, and the second half
 * is judged with it running.
 *
 * @param {StoreState} state
 * @param {{seconds?: number, acAt?: number}} [opts]
 * @returns {{running: boolean, meanRpm: number, swingRpm: number, targetRpm: number}}
 */
export function idleTest(state, { seconds = 16, acAt } = {}) {
  const { args, derived, mafErrorBase } = pullInputs(state);
  const b = state.build;
  const exhaustDiaError = EXHAUST_DIA_OPTS[b.exhaustDiaIdx].dia
    - idealExhaustDiameter(derived.displacementL, b.turboOn ? Math.max(...b.boostCurve) : 0);
  const aux = state.session.liveAux ?? {};
  const cfgWith = (ac) => ({ ...args, mafErrorBase, exhaustDiaError, ecu: { ...args.ecu, aux: { ...aux, ac } } });
  const off = cfgWith(false);
  const on = cfgWith(true);
  // Warm, and the ECU's own coolant reading warm with it: a key-on reads the sensor
  // straight away, where a fresh ECU state would start it at 20 °C and filter up.
  let s = { ...makeLiveState(), cranking: true, coolantC: 88, oilC: 88, ecu: { ...makeEcuLiveState(), sEct: 88 } };
  const rpms = [];
  const steps = Math.round(seconds / 0.05);
  for (let i = 0; i < steps; i += 1) {
    s = liveStep(s, 0.05, { throttle: 0, load: 0 }, acAt != null && i * 0.05 >= acAt ? on : off);
    if (i > steps / 2) rpms.push(s.rpm);
  }
  const mean = rpms.reduce((a, r) => a + r, 0) / Math.max(1, rpms.length);
  return {
    running: !!s.running,
    meanRpm: mean,
    swingRpm: rpms.length ? Math.max(...rpms) - Math.min(...rpms) : 0,
    targetRpm: s.ecu?.idleTarget ?? state.tune.ecu?.idle?.targetRpm ?? 0,
  };
}

/** Where on the overrun the pops are judged: above idle, under the burble's usual top. */
const OVERRUN_WINDOW_RPM = [2200, 5000];

/**
 * Revs the car on the LIVE engine and lifts off, the way a customer listens for pops and bangs:
 * warm, 60% throttle for a second and a half, then nothing for three and a half. Reports the
 * share of each charge that lit in the exhaust over the overrun (point.js `afterfire`: the
 * pops) and the hottest the exhaust ran while it did (what the turbo and the cat feel).
 *
 * @param {StoreState} state
 * @returns {{pops: number, peakEgtC: number, burbled: boolean}}
 */
export function overrunTest(state) {
  const { args, derived, mafErrorBase } = pullInputs(state);
  const b = state.build;
  const exhaustDiaError = EXHAUST_DIA_OPTS[b.exhaustDiaIdx].dia
    - idealExhaustDiameter(derived.displacementL, b.turboOn ? Math.max(...b.boostCurve) : 0);
  const cfg = { ...args, mafErrorBase, exhaustDiaError, ecu: { ...args.ecu, aux: { ...(state.session.liveAux ?? {}), ac: false } } };
  let s = { ...makeLiveState(), cranking: true, coolantC: 88, oilC: 88, ecu: { ...makeEcuLiveState(), sEct: 88 } };
  for (let i = 0; i < 60; i += 1) s = liveStep(s, 0.05, { throttle: 0, load: 0 }, cfg);
  const rows = [];
  for (let i = 0; i < 100; i += 1) {
    const t = i * 0.05;
    s = liveStep(s, 0.05, { throttle: t < 1.5 ? 60 : 0, load: 0 }, cfg);
    const log = s.ecu.log[s.ecu.log.length - 1];
    if (t > 1.7 && s.rpm > OVERRUN_WINDOW_RPM[0] && s.rpm < OVERRUN_WINDOW_RPM[1]) rows.push(log);
  }
  const pops = rows.length ? rows.reduce((a, r) => a + (r.afterfire ?? 0), 0) / rows.length : 0;
  return { pops, peakEgtC: rows.length ? Math.max(...rows.map((r) => r.egt ?? 0)) : 0, burbled: rows.some((r) => r.burble === 1) };
}
