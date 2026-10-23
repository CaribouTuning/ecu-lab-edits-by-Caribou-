/**
 * The factory fuel strategy: what each engine's own calibration asks the mixture to be,
 * at every speed and load. `factoryCalibration` (presets.js) writes the fuel table from it.
 *
 * WHAT REAL CALIBRATIONS DO
 * Every production ECU in the catalogue runs closed loop at stoichiometric (lambda 1)
 * wherever the catalyst has to work: idle, cruise and light acceleration. Enrichment comes
 * in progressively as load rises, not as a step: Nissan's fuel target table is laid out on
 * the base fuel schedule (load) against rpm, and any cell other than 14.7 is open loop
 * (UpRev Nissan Tuning Guide, Rev 8, Feb 2022, p. 9); GM's power enrichment is enabled by
 * throttle and MAP and then commands an equivalence ratio that varies with rpm (HP Tuners
 * VCM Editor help, GM > Engine > Fuel Control > Power Enrich). Near the top of the rev
 * range the target goes richer again, to hold exhaust and catalyst temperature down
 * (component protection), which is why stock engines are usually richer at redline than
 * at peak torque.
 *
 * How rich depends on the engine. Port-injected naturally aspirated engines run about
 * lambda 0.85 at full throttle. Modern direct-injection turbo engines built for emissions
 * (B58, EA888 gen 3) hold lambda 1 through most of a full-throttle pull and only richen
 * near redline. The older twin-turbo N54 runs well rich under boost.
 *
 * HOW SURE THESE ARE
 * Factory calibrations are not published. The figures below come from what can be cited:
 * tuners' documentation of the tables, and logs of stock cars posted by tuners and owners.
 * Each engine's `sources` says which, and `confidence` says how firm they are:
 *   'validated' read out of stock calibrations themselves, through definitions each image's
 *              own identifier confirmed (the GM engines: ECU Lab Pro's calibration benchmark)
 *   'logged'   stock-car logs from more than one source agree on the shape and the numbers
 *   'reported' the shape is documented, the numbers are owners' and tuners' reports
 *   'family'   no engine-specific figure was found; it follows its maker's documented
 *              strategy and its siblings' numbers
 * A stock calibration file read from the car (UpRev, HP Tuners, MHD, EcuTek) is the only
 * better source. If one becomes available, it replaces the figures here.
 */

/**
 * @typedef {object} FuelStrategy
 * @property {boolean} [turbo] the plan is for a turbo engine (boost-relative pressures)
 * @property {[number, number][]} wot full-load lambda target against rpm, [rpm, lambda]
 * @property {number} enrichFromKpa closed-loop lambda 1 at or below this manifold pressure
 *   (naturally aspirated) or, for a turbo engine, this much boost in kPa above barometric
 * @property {number} enrichFullKpa the full-load target is reached here (same convention)
 * @property {'validated'|'logged'|'reported'|'family'} confidence
 * @property {string[]} sources
 * @property {string} note
 */

const UPREV = 'UpRev LLC, Nissan Tuning Guide, Rev 8, Feb 2022, p. 9 (Fuel Targets: load (BFS) by rpm; any cell other than 14.7 runs open loop)';
const HPT_PE = 'HP Tuners, VCM Editor help: GM > Engine > Fuel Control > Power Enrich (PE enabled by TPS/MAP/rpm; commanded AFR = stoich / PE equivalence ratio, by rpm)';
/** @param {string} v @param {number} n */
const GM_STOCK = (v, n) => `Stock GM P01/P59 calibrations (${n} ${v} ${n === 1 ? 'image' : 'images'}) from BoredTruckOwner/LS_Based_Engine_Repository (rev aab180f), read through TunerPro definitions matched by each image's own OS number: median Power Enrichment lambda by rpm (ECU Lab Pro, data/calibrations/gm-benchmark.json; docs/CALIBRATION-DATA.md)`;
const MY350Z_AFR = 'my350z.com, "What is normal Air Fuel ratio?", "Perfect N/A Air/Fuel", "My adventures in tuning the vq35de": stock VQ35 WOT about 12.0-12.5, rich up top; tuners lean it toward 12.8-13.2';
const JB4_N54 = 'BMW Tuning, "BMW N54 Ultimate Data Logging Guide" (JB4): healthy N54 lambda about 11.5-12 AFR under heavy load and high rpm';
const COBB_N54 = 'COBB Tuning, BMW N54 Tuning Guide: lambda targets are closed-loop targets on two wideband sensors';
const B58_LOGS = 'Bimmerpost, "B58 Log Review Thread" and "Ultimate b58/b48 jb4 guide": stock B58 targets lambda 1 in most situations, low to mid 14s at WOT, into the 13s at high rpm or with heat';
const HPA_B58 = 'HP Academy forum, "MAF Scaling on B58 Engine (BootMod3)": stock B58 stays in closed loop on its wideband at all loads';
const STRATIFIED = 'Stratified Auto, "Does a leaner Air-Fuel Ratio result in more power on the MK7 GTI?": stock EA888 gen 3 commands 14.7 for most of a WOT pull, tapering to the mid 13s by redline';
const ZACK_HEMI = 'ZackTuned, "The Ultimate Guide to Remote Tuning Modern HEMI": naturally aspirated HEMIs have no wideband; WOT fuel is modelled (open loop)';
const SRT_FORUM = 'CherokeeSRT8 forum, "6.4 Hemi best Hp / TRQ AFR": 6.4 HEMI WOT reported about 11.8-12.5';

/**
 * Port-injected, naturally aspirated: closed loop up to the ECU's open-loop threshold
 * (85 kPa, `OPEN_LOOP_KPA` / the calibration's `openLoopKpa`, where the simulated ECU stops
 * trimming to the oxygen sensors and runs this table), full enrichment by 97.
 */
const NA_PORT = { enrichFromKpa: 85, enrichFullKpa: 97 };

/** @type {Record<string, FuelStrategy>} */
export const FACTORY_FUEL = {
  'vq35de-revup': {
    ...NA_PORT,
    wot: [[1000, 0.88], [3000, 0.87], [5000, 0.85], [6000, 0.84], [7000, 0.82]],
    confidence: 'reported',
    sources: [UPREV, MY350Z_AFR],
    note: 'Closed loop at 14.7 through cruise; full throttle about 12.8 at low speed going to about 12.1 at the 7000 limit, the rich top end owners log on stock cars.',
  },
  vq35hr: {
    ...NA_PORT,
    wot: [[1000, 0.88], [3000, 0.87], [5000, 0.86], [7500, 0.85]],
    confidence: 'reported',
    sources: [UPREV, MY350Z_AFR],
    note: 'The DE Rev-Up strategy taken to the HR\'s 7500 limit, held at 0.85 (12.5:1) at the top rather than the DE\'s 0.82, the lean end of what owners log, so the factory injectors keep their margin with the bolt-ons owners fit.',
  },
  n54: {
    turbo: true,
    enrichFromKpa: 0, enrichFullKpa: 30,
    wot: [[1500, 0.86], [3000, 0.81], [5000, 0.79], [7000, 0.78]],
    confidence: 'reported',
    sources: [COBB_N54, JB4_N54],
    note: 'Lambda 1 off boost; rich by about 4 psi of boost (its stock boost tapers to 5-6 psi by redline), about 11.5-11.9 AFR at high rpm.',
  },
  'b58-m0': {
    turbo: true,
    enrichFromKpa: 0, enrichFullKpa: 80,
    wot: [[1000, 1.0], [4500, 1.0], [5500, 0.96], [7000, 0.9]],
    confidence: 'logged',
    sources: [B58_LOGS, HPA_B58],
    note: 'Lambda 1 through most of a full-throttle pull, richening toward 13.2 AFR near redline.',
  },
  'b58-m1': {
    turbo: true,
    enrichFromKpa: 0, enrichFullKpa: 80,
    wot: [[1000, 1.0], [4500, 1.0], [5500, 0.96], [7000, 0.9]],
    confidence: 'logged',
    sources: [B58_LOGS, HPA_B58],
    note: 'As the B58B30M0.',
  },
  'ea888-gti': {
    turbo: true,
    enrichFromKpa: 0, enrichFullKpa: 80,
    wot: [[1000, 1.0], [4000, 1.0], [5500, 0.95], [6500, 0.92]],
    confidence: 'logged',
    sources: [STRATIFIED],
    note: '14.7 for most of a full-throttle pull, tapering to the mid 13s by redline.',
  },
  'ea888-r': {
    turbo: true,
    enrichFromKpa: 0, enrichFullKpa: 80,
    wot: [[1000, 1.0], [4000, 1.0], [5500, 0.95], [6500, 0.92]],
    confidence: 'family',
    sources: [STRATIFIED],
    note: 'The GTI\'s EA888 gen 3 strategy; no Golf R-specific stock log was found.',
  },
  ls1: {
    // PE enable point: GM enables PE on throttle and MAP (HP Tuners); the stock thresholds
    // were not read, so enrichment ramps in over the same 85-97 kPa as the other port engines.
    ...NA_PORT,
    wot: [[800, 0.831], [1200, 0.835], [1600, 0.839], [2000, 0.857], [2400, 0.857], [2800, 0.86], [3200, 0.86], [3600, 0.841], [4000, 0.824], [4400, 0.809], [4800, 0.807], [5200, 0.808], [5600, 0.823], [6000, 0.825]],
    confidence: 'validated',
    sources: [GM_STOCK('LS1', 1), HPT_PE],
    note: 'Power enrichment as GM shipped it: about 0.83-0.86 to 3200 rpm, richening to about 0.81 at 4400-5200.',
  },
  ls6: {
    // PE enable point: GM enables PE on throttle and MAP (HP Tuners); the stock thresholds
    // were not read, so enrichment ramps in over the same 85-97 kPa as the other port engines.
    ...NA_PORT,
    wot: [[800, 0.831], [1200, 0.835], [1600, 0.839], [2000, 0.857], [2400, 0.857], [2800, 0.86], [3200, 0.86], [3600, 0.841], [4000, 0.824], [4400, 0.809], [4800, 0.807], [5200, 0.808], [5600, 0.823], [6000, 0.825], [6400, 0.825]],
    confidence: 'validated',
    sources: [GM_STOCK('LS6', 1), HPT_PE],
    note: 'Read from the stock 2004 CTS-V calibration; the same PE schedule as the LS1 file.',
  },
  lq4: {
    // PE enable point: GM enables PE on throttle and MAP (HP Tuners); the stock thresholds
    // were not read, so enrichment ramps in over the same 85-97 kPa as the other port engines.
    ...NA_PORT,
    wot: [[800, 0.918], [1200, 0.909], [1600, 0.893], [2000, 0.877], [2400, 0.877], [2800, 0.877], [3200, 0.866], [3600, 0.855], [4000, 0.826], [4400, 0.826], [4800, 0.806], [5200, 0.8], [5600, 0.8]],
    confidence: 'validated',
    sources: [GM_STOCK('LQ4', 4), HPT_PE],
    note: 'The truck calibrations run leaner at low speed (0.92 at 800) and richen to 0.80 at the top.',
  },
  lm7: {
    // PE enable point: GM enables PE on throttle and MAP (HP Tuners); the stock thresholds
    // were not read, so enrichment ramps in over the same 85-97 kPa as the other port engines.
    ...NA_PORT,
    wot: [[800, 0.871], [1200, 0.871], [1600, 0.837], [2000, 0.837], [2400, 0.837], [2800, 0.837], [3200, 0.837], [3600, 0.803], [4000, 0.803], [4400, 0.776], [4800, 0.749], [5200, 0.769], [5600, 0.769]],
    confidence: 'validated',
    sources: [GM_STOCK('LM7', 17), HPT_PE],
    note: 'The richest of the five: 0.84 through the midrange, down to 0.75 at 4800 rpm.',
  },
  lr4: {
    // PE enable point: GM enables PE on throttle and MAP (HP Tuners); the stock thresholds
    // were not read, so enrichment ramps in over the same 85-97 kPa as the other port engines.
    ...NA_PORT,
    wot: [[800, 0.871], [1200, 0.864], [1600, 0.857], [2000, 0.85], [2400, 0.85], [2800, 0.843], [3200, 0.843], [3600, 0.83], [4000, 0.817], [4400, 0.809], [4800, 0.809], [5200, 0.809], [5600, 0.809], [6000, 0.809]],
    confidence: 'validated',
    sources: [GM_STOCK('LR4', 3), HPT_PE],
    note: '0.87 at low speed easing to 0.81 above 4400 rpm.',
  },
  'hemi-392': {
    ...NA_PORT,
    wot: [[1000, 0.88], [3000, 0.86], [5000, 0.84], [6500, 0.82]],
    confidence: 'reported',
    sources: [ZACK_HEMI, SRT_FORUM],
    note: 'Open loop at full throttle on a modelled target, about 12.6 falling to 12.1 at the top.',
  },
};

/** What a calibration with no engine-specific strategy runs: a player's own engine. @type {FuelStrategy} */
const GENERIC_NA = {
  ...NA_PORT, wot: [[1000, 0.88], [3000, 0.87], [5000, 0.85], [7000, 0.83], [11000, 0.82]],
  confidence: 'family', sources: [UPREV, HPT_PE], note: 'A port-injected, naturally aspirated engine\'s usual strategy.',
};
/** @type {FuelStrategy} */
const GENERIC_TURBO = {
  turbo: true, enrichFromKpa: 0, enrichFullKpa: 30, wot: [[1500, 0.86], [3000, 0.82], [5000, 0.8], [7000, 0.79], [11000, 0.78]],
  confidence: 'family', sources: [JB4_N54], note: 'A turbo engine\'s usual strategy: lambda 1 off boost, rich under it.',
};

/**
 * The strategy for an engine: its own when it has one and still breathes the way it left
 * the factory, otherwise the usual one for how it breathes now (a turbo fitted to a
 * naturally aspirated engine is fuelled as a turbo engine, not on the factory's NA plan).
 * @param {string|null|undefined} id the factory engine's id, when it is one
 * @param {boolean} turbo
 * @returns {FuelStrategy}
 */
export function fuelStrategyFor(id, turbo) {
  const own = FACTORY_FUEL[id ?? ''];
  if (own && !!own.turbo === turbo) return own;
  return turbo ? GENERIC_TURBO : GENERIC_NA;
}

/** @param {[number, number][]} pts @param {number} x */
function lerpTable(pts, x) {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (x <= pts[i][0]) {
      const [x0, y0] = pts[i - 1]; const [x1, y1] = pts[i];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return pts[pts.length - 1][1];
}

/**
 * The lambda the factory calibration asks for at a speed and manifold pressure.
 *
 * Naturally aspirated: lambda 1 up to `enrichFromKpa`, blending to the full-load target by
 * `enrichFullKpa`. Turbo: lambda 1 off boost, blending to the full-load target as boost
 * rises over `enrichFullKpa` kPa above barometric, so a part-boost cell is not fuelled as if
 * it were the top of a pull.
 *
 * @param {FuelStrategy} s
 * @param {number} rpm
 * @param {number} kpa manifold pressure, absolute
 * @param {boolean} turbo
 * @param {number} baroKpa
 * @returns {number}
 */
export function factoryLambda(s, rpm, kpa, turbo, baroKpa) {
  const p = turbo ? kpa - baroKpa : kpa;
  const span = s.enrichFullKpa - s.enrichFromKpa;
  const t = p <= s.enrichFromKpa ? 0 : p >= s.enrichFullKpa ? 1 : (p - s.enrichFromKpa) / span;
  // Smoothstep, not a straight ramp: the change of slope at each end is what an ECU's
  // interpolated table cells give, not a kink.
  const k = t * t * (3 - 2 * t);
  return 1 + (lerpTable(s.wot, rpm) - 1) * k;
}
