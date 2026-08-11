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

import { clamp } from './math.js';

/**
 * Event types that represent a CALIBRATION fault — something the player can fix by
 * editing a table. These, and only these, move the Tuning Score.
 *
 * The complement (`cam`, `float`, `bearing`) are hardware consequences. The cam
 * event's own advice text reads "This is a hardware trade-off, not a tuning fault —
 * you cannot calibrate it away", and deducting for it made a perfectly calibrated
 * engine unable to score 100 for reasons no table edit could address. Hardware
 * coherence is what the Engineer Score is for.
 *
 * Unlisted types count as calibration faults, so a newly added fault is never
 * silently worth zero.
 */
export const CALIBRATION_EVENT_TYPES = new Set([
  'knock', 'fuel', 'lean', 'valve', 'rich', 'maf', 'injscale', 'compressor',
]);

/**
 * The known hardware-consequence types — the actual complement of
 * `CALIBRATION_EVENT_TYPES` among today's events. Kept as an explicit list (rather
 * than "anything not in CALIBRATION_EVENT_TYPES") so a brand-new event type that
 * nobody has classified yet defaults to deducting, not to a free pass.
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
 * @param {object} input
 * @returns {{score: number, label: string, deductions: string[]}}
 */
export function computeEngineerScore({
  engineConfig, turboOn, turbine, compressor, exhaustDiaError, dutyPreview, displacementL,
}) {
  let score = 100;
  const deductions = [];
  if (turboOn && engineConfig.compression > 10.5) {
    score -= 15; deductions.push('-15 High static compression fights boost pressure');
  }
  if (!turboOn && engineConfig.compression < 9.0) {
    score -= 10; deductions.push('-10 Low compression leaves naturally-aspirated efficiency on the table');
  }
  const highHeat = engineConfig.compression > 11.5 || (turboOn && compressor.boostCeiling > 20);
  if (highHeat && engineConfig.headMaterial === 'Cast Iron') {
    score -= 10; deductions.push('-10 High heat load without an aluminum head for cooling');
  }
  if (turboOn) {
    if (displacementL < 3.0 && (turbine.label.includes('Large') || compressor.label === 'Large')) {
      score -= 8; deductions.push('-8 Turbo sized large for this displacement — expect heavy lag');
    }
    if (displacementL > 4.2 && (turbine.label.includes('Small') || compressor.label === 'Small')) {
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
