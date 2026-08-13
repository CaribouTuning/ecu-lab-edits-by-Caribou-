/**
 * Scoring — graded once per pull.
 *
 * Three separate numbers, deliberately measuring different things:
 *   - Tuning Score    how clean the calibration is (fewer/less severe events = higher)
 *   - Engineer Score  how coherent the BUILD hardware choices are with each other
 *   - Pull Score      the uncapped competitive number, which rewards actual output
 *
 * Tuning and Engineer are 0–100 cleanliness grades, easy to read at a glance. Pull
 * Score turns those grades into a points total that rewards making real power, not
 * just staying clean at idle. A big, dirty pull can still out-score a small, spotless
 * one — the same tension a real tuner balances between safety margin and output.
 */

import { COEFF } from './coefficients.js';
import { clamp } from './math.js';

/**
 * The known hardware-consequence types (`cam`, `float`, `bearing`) — the only event
 * types that do NOT move the Tuning Score. The cam event's own advice text reads
 * "This is a hardware trade-off, not a tuning fault — you cannot calibrate it away",
 * and deducting for it made a perfectly calibrated engine unable to score 100 for
 * reasons no table edit could address. Hardware coherence is what the Engineer Score
 * is for.
 *
 * Kept as an explicit list (rather than a CALIBRATION_EVENT_TYPES allowlist inverted
 * at read time) so a brand-new event type that nobody has classified yet defaults to
 * deducting from the Tuning Score, not to a free pass.
 */
const HARDWARE_EVENT_TYPES = new Set(['cam', 'float', 'bearing']);

/**
 * Grades how clean a calibration is, from the pull's event log.
 *
 * @param {{events: {type?: string, impact?: number, msg: string}[]}} result a completed sweep
 * @returns {{score: number, label: string, deductions: string[], advisories: string[]}}
 */
export function computeTuningScore(result) {
  let score = 100;
  const deductions = [];
  const advisories = [];
  result.events.forEach((e) => {
    if (HARDWARE_EVENT_TYPES.has(e.type)) {
      advisories.push(e.msg);
      return;
    }
    const d = e.impact ?? 5;
    score -= d;
    deductions.push(`-${d}  ${e.msg}`);
  });
  score = clamp(Math.round(score), 0, 100);
  const label = score >= 90 ? 'Dialed In'
    : score >= 75 ? 'Solid'
    : score >= 55 ? 'Rough Edges'
    : score >= 30 ? 'Risky' : 'Dangerous';
  return { score, label, deductions, advisories };
}

/**
 * Grades how coherent the hardware choices are with each other, independent of how
 * well the engine is tuned.
 *
 * `fuel` and `mods` are required rather than optional. Defaulting them would silently
 * assume 91 octane and no intercooler at any call site that forgot to pass them — the
 * harshest possible headroom, and a wrong answer that looks entirely plausible on
 * screen. `peakBoostPsi` is required for the same reason, but in the opposite
 * direction: defaulting it to 0 would silently skip the static-compression-under-boost
 * rule at any call site that forgot to pass it, rather than over-penalise.
 *
 * The JSDoc below is what makes `tsc --checkJs` catch an omission — but only for the
 * typechecked callers, i.e. the test suite. `src/ui` is excluded from `tsconfig.json`
 * (see its `include`), so the two UI call sites — the ones where an omission would
 * actually reach a player — are invisible to the typechecker. There, the failure mode
 * is a runtime `TypeError` inside a render-path memo instead.
 *
 * @param {object} input
 * @param {import('./engine.js').EngineConfig} input.engineConfig
 * @param {boolean} input.turboOn
 * @param {number} input.peakBoostPsi peak boost across the curve, psi. Gates the
 *   static-compression-under-boost rule so it never fires on a boosted build making no
 *   boost — see COEFF.COMPRESSION_BOOST_BASE for why the headroom itself does not also
 *   scale with this value
 * @param {{size: string}} input.turbine
 * @param {{size: string, boostCeiling: number}} input.compressor
 * @param {number} input.exhaustDiaError inches the fitted pipe differs from ideal
 * @param {number} input.dutyPreview injector duty at current demand, percent
 * @param {number} input.displacementL
 * @param {{label: string, bonus: number}} input.fuel the octane option fitted
 * @param {{intercooler: boolean}} input.mods bolt-ons fitted
 * @returns {{score: number, label: string, deductions: string[]}}
 */
export function computeEngineerScore({
  engineConfig, turboOn, peakBoostPsi, turbine, compressor, exhaustDiaError, dutyPreview,
  displacementL, fuel, mods,
}) {
  let score = 100;
  const deductions = [];
  if (turboOn && peakBoostPsi > 0) {
    // Gated on actually making boost, not just having the hardware fitted: a turbo kit
    // with the boost curve zeroed out (reachable from the UI's "ZERO" button) runs like
    // an N/A engine, and `chargeTempK` returns ambient at zero boost regardless of
    // whether an intercooler is fitted — so crediting intercooler headroom, or charging
    // a compression penalty, on a build making no boost would be judging hardware that
    // is not doing anything.
    //
    // Static compression is not dangerous on its own. What decides whether it survives
    // boost is how much knock margin the rest of the build brings, and octane and charge
    // cooling are the two levers the player actually has — so the ceiling moves with
    // them instead of sitting at one number for every build.
    //
    // The physics already charges for compression separately: `compressionKnockAdj` in
    // engine.js costs knock margin, the tune goes knock-limited, and the Tuning Score
    // deducts for the events that follow. This rule is deliberately gentler than the
    // flat penalty it replaced so the same decision is not billed twice at full price.
    const headroom = COEFF.COMPRESSION_BOOST_BASE
      + fuel.bonus * COEFF.COMPRESSION_PER_OCTANE_DEG
      + (mods.intercooler ? COEFF.COMPRESSION_INTERCOOLER_GAIN : 0);
    const over = engineConfig.compression - headroom;
    if (over > 0) {
      const d = Math.round(Math.min(
        over * COEFF.COMPRESSION_PENALTY_PER_POINT, COEFF.COMPRESSION_PENALTY_CAP,
      ));
      // This is float safety, not a "barely over" case: the compression slider steps in
      // 0.1 and every preset compression is a multiple of 0.1, so a build a few
      // hundredths over headroom does not occur in practice. What does occur is
      // `10.8 + 0.3 + 0.4` evaluating to 11.500000000000002 — a build sitting exactly on
      // the boundary (11.5:1 on 93 octane with an intercooler) must land just UNDER
      // headroom rather than pick up a `-0 ...` deduction from 2e-15 of rounding noise.
      if (d > 0) {
        const cooling = mods.intercooler ? 'an intercooler' : 'no charge cooling';
        score -= d;
        deductions.push(`-${d} ${engineConfig.compression.toFixed(1)}:1 static compression `
          + `outruns the knock margin this build supports under boost on ${fuel.label} `
          + `with ${cooling} — higher octane or charge cooling would buy it back`);
      }
    }
  }
  if (!turboOn && engineConfig.compression < 9.0) {
    score -= 10; deductions.push('-10 Low compression leaves naturally-aspirated efficiency on the table');
  }
  const highHeat = engineConfig.compression > 11.5 || (turboOn && compressor.boostCeiling > 20);
  if (highHeat && engineConfig.headMaterial === 'Cast Iron') {
    score -= 10; deductions.push('-10 High heat load without an aluminum head for cooling');
  }
  if (turboOn) {
    // Matched on `size`, never on `label`: labels are display copy, and rewording one
    // for the UI must not move the score. See TURBINE_OPTS in hardware.js.
    if (displacementL < 3.0 && (turbine.size === 'large' || compressor.size === 'large')) {
      score -= 8; deductions.push('-8 Turbo sized large for this displacement — expect heavy lag');
    }
    if (displacementL > 4.2 && (turbine.size === 'small' || compressor.size === 'small')) {
      score -= 8; deductions.push('-8 Turbo sized small for this displacement — will choke the top end');
    }
  }
  if (Math.abs(exhaustDiaError) > 0.3) {
    score -= 8; deductions.push('-8 Exhaust diameter poorly matched to displacement');
  }
  if (dutyPreview > 95) {
    score -= 12; deductions.push('-12 Injectors undersized for current demand');
  }
  score = clamp(Math.round(score), 0, 100);
  const label = score >= 90 ? 'Sound Engineering'
    : score >= 75 ? 'Reasonable'
    : score >= 55 ? 'Some Mismatches'
    : score >= 30 ? 'Poorly Matched' : 'Fighting Itself';
  return { score, label, deductions };
}

/**
 * The uncapped, competitive score for a pull.
 *
 * @param {{peakHp: number, peakTq: number, tuningScore: number, engineerScore: number}} input
 * @returns {number}
 */
export function computePullScore({ peakHp, peakTq, tuningScore, engineerScore }) {
  const cleanlinessMult = 0.35 + 0.65 * (tuningScore / 100);
  const engineeringMult = 0.7 + 0.3 * (engineerScore / 100);
  const raw = (peakHp + peakTq * 0.6) * cleanlinessMult * engineeringMult;
  return Math.round(raw);
}
