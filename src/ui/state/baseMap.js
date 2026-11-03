/**
 * The base start-up map a player can ask for once their engine differs from its factory
 * build: what a tuner loads before a first pull on a modified engine. Offered, never
 * applied by a build change (CLAUDE.md: the game never fills tables for the player).
 */

import { baseMapFor, defaultEcuCalibration, deriveEngine, ecuHardwareOf, layoutById, presetById } from '../../sim/index.js';

import { layoutFor } from './layoutSwitch.js';
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
 * @returns {Set<string>} part ids: block, head, induction, fuel, boltons
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
  if (!!build.turboOn !== !!ind.turboOn || !!build.blowerId || !!build.nitrous || !!mods.intercooler !== !!pm.intercooler
    || (build.turboOn && (build.turbineIdx !== ind.turbineIdx || (build.turbineCount ?? 1) !== (ind.turbineCount ?? 1) || build.compressorIdx !== ind.compressorIdx))
    || (build.turboOn && factoryBoost && build.boostCurve.some((b, i) => Math.abs(b - (factoryBoost[i] ?? 0)) > 0.05))) out.add('induction');
  if (build.injIdx !== preset.parts.injectorIdx || build.octaneIdx !== preset.parts.octaneIdx) out.add('fuel');
  if (build.exhaustDiaIdx !== preset.parts.exhaustDiaIdx || !!mods.exhaust !== !!pm.exhaust || !!mods.headers !== !!pm.headers || !!mods.intake !== !!pm.intake) out.add('boltons');
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

/**
 * Whether the engine on the bench is one of the player's own: built from their figures,
 * no factory engine behind it.
 * @param {import('./initialState.js').StoreState['build']} build
 * @returns {boolean}
 */
export function isOwnEngine(build) {
  return build.engineReady !== false && !build.originPresetId && !build.presetId;
}

/**
 * The safe base map for an engine of the player's own as its block and head now stand, on
 * the induction it was created with (naturally aspirated: `build.factoryInduction`), with
 * the bolt-ons fitted. What a tuner loads so a new engine starts and survives a first pull:
 * generated from the physics with a factory's knock margin, conservative, not tuned. A
 * turbo, a supercharger, nitrous, a fuel or an injector change is not in it: no tuner
 * would calculate boost cells for a customer, so those cells are the player's to tune.
 * @param {import('./initialState.js').StoreState['build']} build
 * @param {string|null} [layoutChoice] the tables' layout id now: a player on the finer grid,
 *   or an engine computer's own, stays on it (left out, or the game grid: the grid a new
 *   engine of this size starts on)
 * @returns {Omit<import('./reducer.js').LoadBaseMapAction, 'type'>}
 */
export function ownEngineBaseMap(build, layoutChoice = null) {
  const f = build.factoryInduction ?? null;
  const asCreated = f
    ? { turboOn: !!f.turboOn, turbineIdx: f.turbineIdx, turbineCount: f.turbineCount ?? 1, compressorIdx: f.compressorIdx, boostCurve: f.boostCurve }
    : { turboOn: false, boostCurve: build.boostCurve.map(() => 0) };
  const m = baseMapFor(/** @type {any} */ ({ ...build, ...asCreated }), layoutChoice && layoutChoice !== 'game' ? layoutFor(build, layoutChoice) : null);
  const derived = deriveEngine(build.engineConfig);
  const gate = ecuHardwareOf(build).gate;
  return {
    ve: m.ve, timing: m.timing, afr: m.afr, mafScalar: m.mafScalar, layout: m.layout,
    ecu: { ...defaultEcuCalibration({ derived, gate, axes: layoutById(m.layout).timing }), vvt: m.ecu.vvt },
  };
}
