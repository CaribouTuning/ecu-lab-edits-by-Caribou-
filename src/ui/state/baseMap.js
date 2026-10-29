/**
 * The base start-up map a player can ask for once their engine differs from its factory
 * build: what a tuner loads before a first pull on a modified engine. Offered, never
 * applied by a build change (CLAUDE.md: the game never fills tables for the player).
 */

import { baseMapFor, defaultEcuCalibration, deriveEngine, ecuHardwareOf, layoutById, presetById } from '../../sim/index.js';

import { ACTIONS } from './reducer.js';

/**
 * The LOAD_BASE_MAP for the engine as built: its tables, their breakpoints, the MAF scaling
 * for the intake fitted, and the engine management's own defaults for these parts with the
 * cam schedule the tables were written for.
 * @param {import('./initialState.js').StoreState['build']} build
 * @returns {import('./reducer.js').LoadBaseMapAction}
 */
export function baseMapAction(build) {
  const derived = deriveEngine(build.engineConfig);
  const m = baseMapFor(/** @type {any} */ (build));
  const gate = ecuHardwareOf(build).gate;
  return {
    type: /** @type {'LOAD_BASE_MAP'} */ (ACTIONS.LOAD_BASE_MAP),
    ve: m.ve, timing: m.timing, afr: m.afr, mafScalar: m.mafScalar, layout: m.layout,
    ecu: { ...defaultEcuCalibration({ derived, gate, axes: layoutById(m.layout).timing }), vvt: m.ecu.vvt },
  };
}

/** The engine's own figures each part decides, by part: what "changed from stock" compares. */
const BLOCK_KEYS = ['configuration', 'bore', 'stroke', 'compression', 'blockMaterial', 'frictionLevel', 'bottomEnd'];
const HEAD_KEYS = ['camDuration', 'springRate', 'valvetrain', 'valvesPerCyl', 'follower', 'intakeValveMm', 'sparkPlugs', 'vvt', 'injection', 'headMaterial'];

/**
 * Which of the engine's parts differ from the factory engine it started as: none on a stock
 * engine, the changed ones on a modified one. Compared against the catalogue entry itself
 * (its engine, induction, parts and bolt-ons), so nothing is calibrated to find out. Boost
 * raised on a factory turbo counts as induction changed.
 * @param {any} build @param {any} preset the factory engine, or null for one of the player's own
 * @returns {Set<string>} part ids: block, head, induction, fuel, exhaust
 */
export function changedParts(build, preset) {
  const out = new Set();
  if (!preset) return out;
  const cfg = build.engineConfig;
  const differs = (keys) => keys.some((k) => (cfg[k] ?? null) !== (preset.engine[k] ?? null));
  const mods = build.mods ?? {};
  const pm = preset.mods ?? {};
  if (differs(BLOCK_KEYS)) out.add('block');
  if (differs(HEAD_KEYS) || (build.coil ?? 'stock') !== 'stock') out.add('head');
  const ind = preset.induction;
  const factoryBoost = build.factoryInduction?.boostCurve ?? null;
  if (!!build.turboOn !== !!ind.turboOn || !!build.blowerId || !!build.nitrous || !!mods.intake !== !!pm.intake || !!mods.intercooler !== !!pm.intercooler
    || (build.turboOn && (build.turbineIdx !== ind.turbineIdx || (build.turbineCount ?? 1) !== (ind.turbineCount ?? 1) || build.compressorIdx !== ind.compressorIdx))
    || (build.turboOn && factoryBoost && build.boostCurve.some((b, i) => Math.abs(b - (factoryBoost[i] ?? 0)) > 0.05))) out.add('induction');
  if (build.injIdx !== preset.parts.injectorIdx || build.octaneIdx !== preset.parts.octaneIdx) out.add('fuel');
  if (build.exhaustDiaIdx !== preset.parts.exhaustDiaIdx || !!mods.exhaust !== !!pm.exhaust || !!mods.headers !== !!pm.headers) out.add('exhaust');
  return out;
}

/**
 * The factory engine this build started as, or null for an engine of the player's own.
 * @param {import('./initialState.js').StoreState['build']} build
 */
export const originPreset = (build) => (build.originPresetId ? presetById(build.originPresetId) ?? null : null);

/**
 * Whether to offer a base start-up map: a factory engine with parts changed. Not an engine
 * of the player's own (its calibration was generated for it when it was built), and not a
 * stock one (its factory calibration fits it).
 * @param {import('./initialState.js').StoreState['build']} build
 * @returns {boolean}
 */
export function offersBaseMap(build) {
  return changedParts(build, originPreset(build)).size > 0;
}

/**
 * What to call the engine on screen and in the run history: the factory engine's name, with
 * "modified" once its parts differ, or null for an engine of the player's own (the caller
 * says what it calls one of those).
 * @param {import('./initialState.js').StoreState['build']} build
 * @returns {string|null}
 */
export function buildName(build) {
  const p = originPreset(build);
  if (!p) return null;
  return changedParts(build, p).size ? `${p.name} (modified)` : p.name;
}
