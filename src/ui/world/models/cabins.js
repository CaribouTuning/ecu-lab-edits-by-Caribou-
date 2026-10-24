/**
 * Every car's own cabin, as data: which palette its plastics, leather and dials are, what
 * kind of wheel and instruments it has, how you change gear, what you sit on, and the
 * details that make it that car and not another (a three-gauge pod on the dash top, a screen
 * standing on the dash, a centre stack turned toward the driver, plaid seats). The interior
 * builder (interior.js) draws whatever a cabin names; the colours are in tokens.js under
 * `world.interiors`, keyed by `palette`.
 *
 * A car is matched by its name (a dealer model, your own car's name, a customer's car), then
 * by its body. Nothing here names a maker's badge or copies a real dashboard: each is a
 * pixel-art cabin in the spirit of its era and kind.
 */

/**
 * @typedef {object} Cabin
 * @property {string} id
 * @property {string} palette a key of `world.interiors`
 * @property {'two'|'three'|'four'|'horn'|'flat'} wheel
 * @property {number} rim radius, metres
 * @property {'twin'|'triple'|'row'|'row3'|'digital'|'pod'|'center'} cluster
 * @property {'knob'|'short'|'pistol'|'paddles'|'tall'|'column'} shifter
 * @property {'cloth'|'bucket'|'bench'|'race'|'captain'|'plaid'|'beads'} seat
 * @property {number} [dashH] dash height, metres (0.17 is a car's; trucks stand taller)
 * @property {string[]} [features] the details: 'freshener', 'centerPod', 'topScreen',
 *   'angled', 'ambient', 'cassette', 'tunnel', 'woodWheel', 'clock'
 */

/** @type {Record<string, Cabin>} */
export const CABINS = {
  // Pops's 1996 hatch: brown plastics, a wooden-bead seat cover, a tape deck and a pine tree.
  pops: { id: 'pops', palette: 'pops', wheel: 'four', rim: 0.17, cluster: 'row3', shifter: 'knob', seat: 'beads', features: ['freshener', 'cassette', 'clock'] },
  // A city car: one speedometer in the middle of the dash, a two-spoke wheel, bright plastics.
  kei: { id: 'kei', palette: 'kei', wheel: 'two', rim: 0.16, cluster: 'center', shifter: 'knob', seat: 'cloth', features: ['cassette'] },
  // A late-90s hot hatch: red stripes on black cloth, three dials, a small three-spoke wheel.
  hothatch: { id: 'hothatch', palette: 'hothatch', wheel: 'three', rim: 0.15, cluster: 'triple', shifter: 'short', seat: 'bucket', features: ['cassette'] },
  // A tired V6 coupe of the turn of the century: grey everything, two dials, a four-spoke wheel.
  coupe99: { id: 'coupe99', palette: 'coupe99', wheel: 'four', rim: 0.16, cluster: 'twin', shifter: 'knob', seat: 'cloth', features: ['clock'] },
  // A straight-six roadster: tan leather, a wood rim, chrome rings, no roof over you.
  roadster: { id: 'roadster', palette: 'roadster', wheel: 'horn', rim: 0.165, cluster: 'row', shifter: 'short', seat: 'bucket', features: ['woodWheel'] },
  // A work truck: a tall square dash, a gauge pod, a column shifter and a bench.
  silverado: { id: 'silverado', palette: 'silverado', wheel: 'four', rim: 0.19, cluster: 'pod', shifter: 'column', seat: 'bench', dashH: 0.24, features: ['clock'] },
  // The big SUV: the truck's dash in wood and tan leather, captain's chairs and a wide console.
  tahoe: { id: 'tahoe', palette: 'tahoe', wheel: 'four', rim: 0.185, cluster: 'pod', shifter: 'column', seat: 'captain', dashH: 0.24, features: ['tunnel'] },
  // A rear-drive V6 coupe of the mid-2000s: three gauges on the dash top angled at you, a big
  // centre rev counter in a binnacle, brushed aluminium.
  z33: { id: 'z33', palette: 'z33', wheel: 'three', rim: 0.15, cluster: 'triple', shifter: 'short', seat: 'bucket', features: ['centerPod', 'tunnel'] },
  // Its later, revised self: the same layout, red stitching and a darker trim.
  z33hr: { id: 'z33hr', palette: 'z33hr', wheel: 'three', rim: 0.15, cluster: 'triple', shifter: 'short', seat: 'bucket', features: ['centerPod', 'tunnel'] },
  // A factory-turbo hot hatch: plaid seats, a flat-bottomed wheel, red trim, a screen.
  gti: { id: 'gti', palette: 'gti', wheel: 'flat', rim: 0.15, cluster: 'twin', shifter: 'short', seat: 'plaid', features: ['topScreen', 'ambient'] },
  // Its all-wheel-drive big brother: a digital cluster, blue accents, carbon-look trim.
  golfr: { id: 'golfr', palette: 'golfr', wheel: 'flat', rim: 0.15, cluster: 'digital', shifter: 'short', seat: 'race', features: ['topScreen', 'ambient'] },
  // A light V8 coupe of the late 90s: a wraparound cockpit, a high tunnel, red leather.
  c5: { id: 'c5', palette: 'c5', wheel: 'four', rim: 0.16, cluster: 'triple', shifter: 'short', seat: 'bucket', features: ['tunnel'] },
  // A fast four-door with sharp edges: silver trim, two big dials, a screen in the stack.
  ctsv: { id: 'ctsv', palette: 'ctsv', wheel: 'three', rim: 0.16, cluster: 'twin', shifter: 'short', seat: 'bucket', features: ['angled', 'clock'] },
  // A twin-turbo six saloon of the late 2000s: orange dial light, the stack turned to the
  // driver, a screen under a hood on the dash top.
  e90: { id: 'e90', palette: 'e90', wheel: 'three', rim: 0.16, cluster: 'twin', shifter: 'short', seat: 'cloth', features: ['angled', 'topScreen'] },
  // Its successor: a free-standing screen, white dial light, wood strips.
  f30: { id: 'f30', palette: 'f30', wheel: 'three', rim: 0.16, cluster: 'twin', shifter: 'short', seat: 'bucket', features: ['angled', 'topScreen', 'ambient'] },
  // The newest: a fully digital cluster, a wide screen, blue and red stitching, ambient light.
  g20: { id: 'g20', palette: 'g20', wheel: 'three', rim: 0.155, cluster: 'digital', shifter: 'short', seat: 'race', features: ['angled', 'topScreen', 'ambient', 'tunnel'] },
  // A modern muscle car with a retro dash: a row of gauges, a pistol grip, black and red.
  challenger: { id: 'challenger', palette: 'challenger', wheel: 'three', rim: 0.165, cluster: 'row', shifter: 'pistol', seat: 'bucket', features: ['topScreen', 'tunnel'] },
  // By body, for anything not named above.
  economy: { id: 'economy', palette: 'economy', wheel: 'four', rim: 0.16, cluster: 'twin', shifter: 'knob', seat: 'cloth' },
  sport: { id: 'sport', palette: 'sport', wheel: 'three', rim: 0.15, cluster: 'triple', shifter: 'short', seat: 'bucket' },
  classic: { id: 'classic', palette: 'classic', wheel: 'horn', rim: 0.18, cluster: 'row', shifter: 'pistol', seat: 'bench' },
  exotic: { id: 'exotic', palette: 'exotic', wheel: 'flat', rim: 0.14, cluster: 'digital', shifter: 'paddles', seat: 'race' },
  truck: { id: 'truck', palette: 'truck', wheel: 'four', rim: 0.18, cluster: 'pod', shifter: 'tall', seat: 'captain', dashH: 0.24 },
};

/** Names to cabins, most specific first. */
const BY_NAME = /** @type {[RegExp, string][]} */ ([
  [/pops|1996 hatch/i, 'pops'],
  [/city car|kei/i, 'kei'],
  [/hot hatch|hatch, 2\.0|2\.0 sixteen/i, 'hothatch'],
  [/350z.*hr|\(hr\)|vq35hr|2007|2008|2009/i, 'z33hr'],
  [/350z|vq35de/i, 'z33'],
  [/project v6|v6 coupe|3\.5 v6/i, 'coupe99'],
  [/roadster|straight-six/i, 'roadster'],
  [/silverado|work truck|sierra|pickup/i, 'silverado'],
  [/tahoe|yukon|escalade/i, 'tahoe'],
  [/golf r/i, 'golfr'],
  [/gti/i, 'gti'],
  [/corvette|c5/i, 'c5'],
  [/cts/i, 'ctsv'],
  [/m340i/i, 'g20'],
  [/340i/i, 'f30'],
  [/335i/i, 'e90'],
  [/challenger|392|hemi/i, 'challenger'],
]);

const BY_BODY = { hatch: 'economy', sedan: 'economy', wagon: 'economy', van: 'economy', kei: 'kei', coupe: 'sport', roadster: 'roadster', muscle: 'classic', supercar: 'exotic', suv: 'truck', pickup: 'truck' };

/**
 * The cabin a car has, from what it is called and, failing that, its body.
 * @param {string|undefined} name @param {string} [body]
 * @returns {Cabin}
 */
export function cabinFor(name, body = 'coupe') {
  const n = String(name ?? '');
  // A 2007-9 name only means the revised coupe if it is that coupe.
  for (const [re, id] of BY_NAME) {
    if (id === 'z33hr' && !/350z/i.test(n)) continue;
    if (re.test(n)) return CABINS[id];
  }
  return CABINS[BY_BODY[/** @type {keyof typeof BY_BODY} */ (body)] ?? 'sport'];
}
