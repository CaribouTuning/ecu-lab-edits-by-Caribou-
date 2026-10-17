/**
 * Reading a customer's car the way a tuner does: lifting the bonnet and writing down what
 * is actually fitted. Facts, not diagnoses: the sheet says the injectors are 650 cc and
 * that the ECU was told 440 cc, and leaves it to the tuner to know what that does.
 */

import { BLOWER_OPTS, EXHAUST_DIA_OPTS, INJECTOR_OPTS, OCTANE_OPTS, deriveEngine } from '../../sim/index.js';

/**
 * @typedef {object} Fact
 * @property {string} label
 * @property {string} value
 * @property {'ok'|'note'|'odd'} [tone] odd = something a tuner would look at twice
 */

/**
 * What is under the bonnet.
 * @param {any} build the store's build slice
 * @returns {Fact[]}
 */
export function inspectCar(build) {
  const cfg = build.engineConfig;
  const d = deriveEngine(cfg);
  /** @type {Fact[]} */
  const out = [];
  out.push({ label: 'Engine', value: `${d.displacementL.toFixed(2)} L ${cfg.configuration}, ${cfg.compression}:1, ${cfg.injection === 'direct' ? 'direct' : 'port'} injection, redline ${Math.round(d.redline ?? cfg.redline)} rpm` });
  if (build.turboOn) {
    const peak = Math.max(...(build.boostCurve ?? [0]));
    out.push({ label: 'Induction', value: `Turbocharged, peak boost target ${peak.toFixed(1)} psi`, tone: 'note' });
  } else if (build.blowerId) {
    const b = BLOWER_OPTS.find((x) => x.id === build.blowerId);
    out.push({ label: 'Induction', value: `Supercharged${b ? `, ${b.label}` : ''}`, tone: 'note' });
  } else out.push({ label: 'Induction', value: 'Naturally aspirated' });
  const m = build.mods ?? {};
  out.push({ label: 'Intake', value: m.intake ? 'Aftermarket intake fitted' : 'Stock airbox', tone: m.intake ? 'note' : undefined });
  out.push({ label: 'Exhaust', value: `${EXHAUST_DIA_OPTS[build.exhaustDiaIdx]?.label ?? '?'} pipe${m.headers ? ', headers' : ''}${m.exhaust ? ', free-flowing back box' : ''}`, tone: m.exhaust || m.headers ? 'note' : undefined });
  if (build.turboOn || build.blowerId) out.push({ label: 'Intercooler', value: m.intercooler ? 'Fitted' : 'None', tone: m.intercooler ? 'ok' : 'odd' });
  const inj = INJECTOR_OPTS[build.injIdx];
  const told = build.ecuInjectorCc;
  out.push({
    label: 'Injectors', value: `${inj.cc} cc fitted; the ECU's fuel table is set up for ${told} cc`,
    tone: Math.abs(inj.cc - told) > 5 ? 'odd' : undefined,
  });
  const oct = OCTANE_OPTS[build.octaneIdx];
  out.push({ label: 'Fuel in the tank', value: `${oct?.label ?? '?'} octane${build.ethanolPct ? `, ${Math.round(build.ethanolPct)}% ethanol` : ''}` });
  if (build.nitrous) out.push({ label: 'Nitrous', value: 'A bottle and a solenoid are fitted', tone: 'note' });
  if (Math.abs((build.mafScalar ?? 1) - 1) > 0.005) out.push({ label: 'Air meter scalar', value: `${Number(build.mafScalar).toFixed(2)}`, tone: 'note' });
  return out;
}
