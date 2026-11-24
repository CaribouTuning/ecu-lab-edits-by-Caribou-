/**
 * The spec an engine model is drawn from: plain data, and no three.js, so the screens that
 * work it out (EcuLab.jsx, the build bench) do not pull the 3D model in with them.
 */

/**
 * The spec an engine is drawn from, out of the store's build slice and its derived engine.
 * @param {any} build @param {any} [derived]
 * @returns {import('./engine.js').EngineSpec}
 */
export function engineSpecOf(build, derived) {
  const cfg = build?.engineConfig ?? {};
  const layout = ['I4', 'I6', 'V6', 'V8'].includes(cfg.configuration) ? cfg.configuration : 'V6';
  return {
    layout,
    boreMm: derived?.bore ?? cfg.bore ?? 90,
    strokeMm: derived?.stroke ?? cfg.stroke ?? 86,
    valvetrain: derived?.valvetrain ?? cfg.valvetrain ?? 'dohc',
    turbo: !!build?.turboOn,
    supercharger: !build?.turboOn && !!build?.blowerId,
    intercooler: !!build?.mods?.intercooler,
    intake: !!build?.mods?.intake,
    headers: !!build?.mods?.headers,
    nitrous: !!build?.nitrous,
    blockMaterial: cfg.blockMaterial,
    headMaterial: cfg.headMaterial,
    vvt: !!cfg.vvt && cfg.vvt !== 'none',
    direct: cfg.injection === 'direct',
    twinTurbo: !!build?.turboOn && (build?.turbineCount ?? 1) > 1,
    sparkPlugs: cfg.sparkPlugs ?? 1,
  };
}
