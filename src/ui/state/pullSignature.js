/**
 * The identity of the configuration a dyno pull was measured on.
 *
 * A score is a MEASUREMENT. It is taken once, on one specific car, and it stays what
 * it was — so the app banks the scores a pull produced (see BANK_PULL) instead of
 * recomputing them from whatever is selected later. That leaves one question the
 * banked numbers cannot answer by themselves: is the car on screen still the car they
 * were measured on? This module answers exactly that and nothing else.
 *
 * WHAT COUNTS AS "THE SAME CAR"
 * Every input the pull was actually computed from — everything `simulateSweep` reads
 * and everything `computeEngineerScore` reads. That is deliberately WIDER than the
 * hardware list: the calibration tables are inputs too, and in a tuning simulator they
 * are the thing the player changes most often between pulls. A signature over hardware
 * alone would let "edit the VE table, look at the scorecard" claim the numbers were
 * measured on the tables now on screen, which is the same lie the banked scores exist
 * to stop, one level down.
 *
 * WHAT DOES NOT COUNT
 * Labels and cursors: `presetId` (a name for a build, not a part of it),
 * `presetPrompt`, `boostSel`, `selection`, `tablesDirty`. None of them reaches the
 * simulation, so none of them can change a number.
 *
 * WHY A SIGNATURE AND NOT A DEEP COMPARE
 * The only question asked of it is "has any measured input moved?", never "which one".
 * A string compare answers that in one operation and cannot drift out of sync with a
 * hand-written field-by-field comparison as fields are added.
 *
 * THE ERROR IT IS ALLOWED TO MAKE, AND THE ONE IT IS NOT
 * `JSON.stringify` serialises object keys in insertion order, so two `engineConfig`
 * objects holding equal values in different key orders would sign differently and
 * report a change that did not happen. That direction is safe: the worst outcome is a
 * "build has changed" banner over numbers that are in fact still current, and the
 * player's fix is to run a pull. The opposite error is impossible, which is the half
 * that matters — different values ALWAYS produce different JSON, so this can never
 * report a changed build as unchanged and let a stale score pass as a live one.
 *
 * Related but not the same list: `history.js`'s snapshot keys. That projection is
 * "what an undo puts back" — it includes `presetId` and `tablesDirty` (bookkeeping an
 * undo must restore) and excludes `loadKpa` (nothing undoable writes it). This one is
 * "what the engine was run with". Neither list is derivable from the other, so they
 * are kept separately and each documents its own rule for membership.
 */

/**
 * BUILD fields the sweep and the Engineer Score read. `presetId`, `presetPrompt` and
 * `boostSel` are the three the slice holds that they do not — see the file header.
 */
const MEASURED_BUILD_KEYS = [
  'engineConfig', 'mods', 'turboOn', 'boostCurve', 'octaneIdx', 'injIdx', 'mafScalar',
  'turbineIdx', 'turbineCount', 'compressorIdx', 'exhaustDiaIdx', 'ecuInjectorCc',
];

/**
 * The three calibration tables. `tablesDirty` and `selection` are the TUNE slice's
 * other two fields and neither reaches the simulation.
 */
const MEASURED_TUNE_KEYS = ['ve', 'timing', 'afr'];

/**
 * Signs the configuration a pull would be — or was — run on.
 *
 * `loadKpa` is passed as a bare value rather than the SESSION slice it lives on, and
 * that is deliberate rather than an inconsistency with the two slices above it. It is
 * the ONLY session field a pull is a function of — everything else in that slice is
 * the pull's own output (result, scores, wear, career totals) or belongs to the live
 * engine, not the dyno — and `session` is the slice the 20 Hz LIVE_STEP replaces on
 * every tick. Taking the slice would give this a dependency that changes twenty times
 * a second while the engine idles, for a value that has not moved.
 *
 * @param {import('./initialState.js').BuildState} build
 * @param {import('./initialState.js').TuneState} tune
 * @param {number} loadKpa the manifold pressure the sweep is run at
 * @returns {string} equal for two configurations iff every measured input is equal
 */
export function pullSignature(build, tune, loadKpa) {
  return JSON.stringify([
    MEASURED_BUILD_KEYS.map((k) => /** @type {any} */ (build)[k]),
    MEASURED_TUNE_KEYS.map((k) => /** @type {any} */ (tune)[k]),
    loadKpa,
  ]);
}
