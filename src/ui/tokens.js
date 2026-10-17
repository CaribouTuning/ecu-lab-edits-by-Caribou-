/**
 * The palette, type scale, radius scale and spacing scale — the single place
 * each is defined.
 *
 * `tokens.css` mirrors this file as CSS custom properties for stylesheets, and
 * `tests/tokens.test.js` proves the two never drift. Add a token here first.
 *
 * The organising rule for colour: THE ACCENT IS NEVER A STATUS, AND A STATUS IS
 * NEVER DECORATION. `acc` means "this is the action" or "this is the live value".
 * `ok`/`warn`/`danger` mean engine state and nothing else. The previous palette
 * spent its alarm colour on chrome — 84 uses of the same hot orange on the
 * wordmark, the nav, the focus ring and genuine warnings alike — which left a real
 * warning nothing to escalate to.
 *
 * The organising rule for the font-size/radius/spacing scales below: they were
 * added after nine primitives and two screens had already accumulated 15 raw
 * font-sizes, 8 raw radii and 17 raw padding declarations between them — each
 * file looked reasonable alone, but a fourteen-screen build is about to land on
 * top of this layer, and that is a lot cheaper to systematise now than to
 * retrofit later. Not every raw value in the stylesheets maps onto a step here:
 * a handful are one-off screen headlines or values pinned to another number
 * by layout geometry, and those stay raw with a comment explaining why, rather
 * than being forced onto the ramp.
 */

/** @param {string} s camelCase token name @returns {string} its kebab-case CSS name */
export const camelToKebab = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

/** @type {Readonly<Record<string,string>>} */
export const tokens = Object.freeze({
  // Surfaces, darkest to lightest. The base is blue-black rather than neutral grey
  // because red reads harder against blue than against grey.
  bg: '#0a0d14',
  panel: '#131824',
  panel2: '#1a2130',
  panel3: '#212a3c',

  // Borders.
  line: '#262f42',
  lineHi: '#33405a',

  // Text, four steps from primary to faintest.
  ink: '#e9eef8',
  inkSoft: '#c8d2e2',
  ink2: '#8792a8',
  ink3: '#5c6880',

  // Accent. `accOn` is text placed ON an accent fill — it must never be a grey.
  acc: '#4c9eff',
  accInk: '#8fc2ff',
  accBg: '#0f2033',
  accOn: '#04162e',

  // Status. Reserved for engine state. Never used as decoration.
  ok: '#35e08a',
  okInk: '#7fe8b4',
  okBg: '#0d2419',
  warn: '#ffb020',
  warnInk: '#ffd07a',
  warnBg: '#2a2110',
  danger: '#ff4d4d',
  dangerInk: '#ff9d9d',
  dangerBg: '#2a1414',

  // Status borders. One step brighter than the matching *Bg so a status box reads as
  // a bounded object rather than a wash — without reaching the full status hue, which
  // belongs to text and indicators. These are for a status BOX's border — something
  // that reports state, like Note or an inline banner. A destructive CONTROL (e.g.
  // Button's danger variant) deliberately uses the saturated hue instead, because it
  // needs to read louder than something that merely reports; that is not an
  // inconsistency to "fix" by pointing it at these tokens too.
  okLine: '#1e5238',
  warnLine: '#5c4415',
  dangerLine: '#5c2626',
  violetLine: '#3b3363',

  // Secondary data hue, for charts that must plot two series at once (power vs
  // torque). Distinct from `acc` on purpose so a chart never looks like a control.
  cyan: '#38d9f0',
  cyanBg: '#0b2630',
  violet: '#a78bfa',
  violetBg: '#1d1a33',

  // Type.
  mono: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
  sans: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",

  // Bare RGB triplets, so translucent washes can be built from the same colours
  // rather than re-typing them at a new alpha. See accAlpha/shadowAlpha below.
  accRgb: '76, 158, 255',
  shadowRgb: '0, 0, 0',

  // Font-size scale, small to large. Named by role/size rather than kept as the
  // 15 raw values they replace, because a scale is a small set of deliberate
  // steps, not every number a designer happened to type. `fsMicro` and `fsXs`
  // carry the small uppercase UI chrome (eyebrows, badges, segmented-control
  // labels); `fsSm`/`fsBase` carry compact and standard body/control text;
  // `fsMd` is screen-body copy; `fsLg` is the large mono figure in a stat tile.
  // One-off screen headlines (21/25/27/34px) are not part of this ramp — see
  // the comments at their declarations for why.
  fsMicro: '9px',
  fsXs: '10.5px',
  fsSm: '12px',
  fsBase: '13.5px',
  fsMd: '14.5px',
  fsLg: '18px',

  // Border-radius scale, small to large. Covers the eight raw radii the
  // stylesheets had accumulated; `50%` circles and one pill radius pinned to
  // half of its own element's height are deliberately left out — see the
  // comment at that declaration.
  rXs: '3px',
  rSm: '6px',
  rMd: '9px',
  rLg: '12px',

  // Spacing scale, for padding. Covers the seventeen raw padding declarations
  // the stylesheets had accumulated. A few values stay raw with a comment
  // because they are pinned to something other than rhythm: a chevron's
  // clearance, a knob's fit inside its track.
  spXs: '3px',
  spSm: '7px',
  spMd: '10px',
  spLg: '13px',
  spXl: '16px',
  spXxl: '24px',

  // Content column cap. Nothing in the app set a max-width before this: the root is
  // 100dvh tall with unconstrained width, so every container was the viewport — which
  // is why buttons could span the whole screen and why Button's `block` prop shipped
  // with no adopters. The widest fixed element, the tuning grid, is 452px (44px row
  // labels + 8 RPM columns x 51px), so the grid isn't the constraint here; prose is —
  // at fsBase (13.5px) 1100px is roughly 110 characters, past the comfortable 45-90
  // but acceptable for a dense tool, and it leaves room for a future right-hand panel
  // beside the grid (452 + ~320 + gaps ~= 820) without a second breakpoint.
  contentMax: '1100px',
});

/**
 * A translucent accent wash — glows, focus halos, the shadow under a primary button.
 *
 * Lives here rather than in a screen because an `rgba()` literal in a component is
 * precisely what this system exists to prevent, and `tests/no-hardcoded-colours.test.js`
 * rejects one.
 *
 * @param {number} alpha 0-1
 * @returns {string} an rgba() colour
 */
export const accAlpha = (alpha) => `rgba(${tokens.accRgb}, ${alpha})`;

/**
 * A plain black scrim, for drop shadows and cell borders that must darken whatever
 * is underneath rather than tint it.
 *
 * @param {number} alpha 0-1
 * @returns {string} an rgba() colour
 */
export const shadowAlpha = (alpha) => `rgba(${tokens.shadowRgb}, ${alpha})`;

/**
 * The drag strip's ART PALETTE — the illustrated scene, not the interface.
 *
 * SEPARATE FROM `tokens` ON PURPOSE, and worth explaining because the split is the
 * whole point. The palette above is a semantic UI system: `acc` means "this is the
 * action", `ok`/`warn`/`danger` mean engine state. A car, a road surface and a
 * christmas tree have none of those meanings — a yellow car is not a warning — so
 * routing them through the status ramp would make the system say something it does not
 * mean, and would repaint the scene the next time anyone tunes the interface.
 *
 * It lives in THIS file regardless, because the rule `no-hardcoded-colours.test.js`
 * enforces is that a colour must never be invisible to the token layer. Here it is
 * visible: a palette change lands in one file and finds every colour in the app,
 * scenery included.
 *
 * Not mirrored into `tokens.css`, unlike the palette above, because nothing styles the
 * strip from a stylesheet — the scene is inline SVG and inline styles, so a CSS custom
 * property would be an unused declaration and `tokens.test.js` checks that CSS declares
 * nothing JS does not use.
 */
export const strip = Object.freeze({
  // Bodywork: a four-stop gradient down the flank, plus its highlight edge.
  paintHi: '#ffdf6b',
  paint: '#f7c02a',
  paintMid: '#d99a10',
  paintLow: '#9c6c05',
  paintEdge: '#ffe89a',
  // Panel lines and the rocker, a darker shade of the same paint.
  paintLine: '#8f6206',
  paintShadow: '#7c5405',
  // Glass, lit at the top and dark at the base.
  glassHi: '#54677a',
  glassLow: '#131b23',
  // Lamps.
  headlight: '#f2f7fa',
  taillight: '#cf3535',
  // Tyre, rim and spokes.
  tyre: '#0c1015',
  tyreWall: '#333c46',
  rim: '#242c35',
  rimEdge: '#414b57',
  spoke: '#525d69',

  // The scene behind it: night sky down to the track surface.
  sky: '#070a0e',
  skyLow: '#0d141c',
  horizon: '#1b232c',
  ground: '#232c36',
  groundLow: '#1a2029',
  wall: '#2c343d',
  wallTop: '#3a444f',
  wallPost: '#1b222a',
  surface: '#12171d',
  groove: '#1e262f',
  texture: '#232b34',
  // The finish stripe, alternating light and dark.
  stripeLight: '#eef2f6',
  stripeDark: '#0f141a',

  // Christmas tree: an unlit bulb and its rim, and the white stage lamps.
  bulbOff: '#1a1f26',
  bulbRim: '#232a33',
  stage: '#e8eef4',
});

/**
 * The career shop's ART PALETTE: the side-on garage on the shop screen. Scenery, like
 * `strip` above and for the same reasons: a red car is not a danger state. Not mirrored
 * into `tokens.css`, because the scene is inline SVG.
 */
export const shop = Object.freeze({
  road: '#232a36',
  roadLine: '#3b4556',
  fascia: '#2b3342',
  steel: '#5b6576',
  steelHi: '#6d788a',
  fixture: '#3a4354',
  device: '#1d2330',
  liftArm: '#f0a830',
  roller: '#9aa4b2',
  hub: '#8a93a3',
  tyre: '#15181e',
  outline: 'rgba(0, 0, 0, 0.45)',
  glass: 'rgba(170, 210, 255, 0.35)',
  headlight: '#ffe8a3',
  taillight: '#ff6b6b',
  boxRed: '#c0392b',
  boxBlue: '#2980b9',
  boxGrey: '#7f8c8d',
  benchTop: '#6d4c2f',
  benchLeg: '#5a3d24',
  laptop: '#11151c',
  egtKit: '#b33939',
  probeWire: '#cccccc',
  flexKit: '#27ae60',
  flexScreen: '#0d2419',
  couch: '#7d5ba6',
  couchBack: '#6c4a95',
  lamp: '#e67e22',
  neon: '#ff4fa3',
  skin: '#e0b48c',
  tunerShirt: '#2e6fd8',
  trousers: '#2c3440',
  // Customers' cars, by the name a job gives its paint.
  paint: Object.freeze({
    silver: '#9aa4b2',
    red: '#c0392b',
    blue: '#2e6fd8',
    white: '#f2f2f2',
    orange: '#e67e22',
    green: '#27ae60',
    black: '#1c1f24',
    purple: '#8e44ad',
    teal: '#16a085',
    copper: '#d35400',
    yellow: '#f1c40f',
    grey: '#7f8c8d',
    pewter: '#95a5a6',
    pearl: '#bdc3c7',
  }),
});

/** Tyre smoke at a given opacity — it fades as it drifts, so alpha is a parameter. */
export const smokeAlpha = (alpha) => `rgba(214, 222, 230, ${alpha})`;

/** The low sun behind the treeline, at a given opacity. */
export const horizonGlowAlpha = (alpha) => `rgba(255, 150, 60, ${alpha})`;

/**
 * The career WORLD's art palette: the 3-D shop, town and cars the player walks and drives
 * through. Scenery, like `shop` and `strip` above, and for the same reason: a red car or
 * a green lawn is not a status colour. Not mirrored into `tokens.css` because the scene
 * is drawn by WebGL, not styled by CSS.
 *
 * Everything the world draws names a key from here, so the no-hard-coded-colours rule
 * holds for the models and levels too. Clothing and hair are keyed by NAME (`cloth.red`)
 * so the wardrobe catalogue stays plain data a screen can print without WebGL.
 */
export const world = Object.freeze({
  // Sky and light, by time of day: the top of the sky, the horizon, the sun, the ambient.
  sky: Object.freeze({
    day: Object.freeze({ top: '#5aa0e6', horizon: '#cfe6f7', sun: '#fff1d6', ambient: '#9fb7d8', ground: '#6b7a58', sunPower: 2.4, ambientPower: 1.15 }),
    dusk: Object.freeze({ top: '#4a3f8f', horizon: '#ff9a62', sun: '#ffb27a', ambient: '#8a78b8', ground: '#4a3d4f', sunPower: 1.25, ambientPower: 0.8 }),
    night: Object.freeze({ top: '#070b1f', horizon: '#1a2447', sun: '#7f9bd6', ambient: '#37456f', ground: '#1c2233', sunPower: 0.3, ambientPower: 0.5 }),
  }),
  // The ground and what is built on it.
  asphalt: '#3a3f4a',
  asphaltDark: '#2c3039',
  roadLine: '#e8dfb0',
  roadEdge: '#d8d8d8',
  concrete: '#8c9199',
  concreteDark: '#6a6f78',
  concreteLight: '#aab0b8',
  curb: '#b4b8bf',
  grass: '#5a8f45',
  grassDark: '#477a38',
  grassLight: '#78a85a',
  dirt: '#8a6a47',
  dirtDark: '#6e5238',
  sand: '#d9c58d',
  water: '#3f86c9',
  waterDeep: '#2d65a3',
  rock: '#7d7770',
  rockDark: '#5b5650',
  brick: '#a8553a',
  brickDark: '#8a4430',
  plaster: '#ddd2bd',
  plasterDark: '#bfb49d',
  roof: '#5a4a52',
  roofRed: '#9c3b32',
  roofGreen: '#3f6b57',
  glass: '#7fb7de',
  glassDark: '#2f4a63',
  glassNight: '#ffe29a',
  door: '#7a5232',
  doorGlass: '#a5d3ec',
  woodLight: '#c9a26b',
  wood: '#8c6a44',
  woodDark: '#5e4429',
  metal: '#8b94a1',
  metalDark: '#586070',
  metalLight: '#c4ccd6',
  steel: '#5b6576',
  corrugated: '#7d8896',
  black: '#14161b',
  white: '#f2f4f7',
  // Shop interior.
  floorEpoxy: '#6e7681',
  floorEpoxyAlt: '#626a75',
  floorStripe: '#e8b230',
  wallShop: '#c9c2b4',
  wallShopDark: '#a79f90',
  wallBase: '#4a5463',
  wallRed: '#b4503e',
  wallBlue: '#456a9c',
  wallGreen: '#4f7d5e',
  wallPurple: '#6d5391',
  wallCream: '#ece1c8',
  wallBlack: '#2a2d36',
  tyre: '#16181d',
  tyreWall: '#262a31',
  rim: '#c8ced8',
  rimDark: '#6b7482',
  brake: '#b5b9c2',
  toolRed: '#c0392b',
  toolBlue: '#2d6cb5',
  toolYellow: '#f0b400',
  crate: '#a4784a',
  barrel: '#3c78b4',
  barrelRed: '#b4382c',
  cone: '#ee7a1c',
  hazard: '#f2c200',
  rubber: '#23262c',
  screen: '#3be0b0',
  screenOff: '#10151c',
  screenAmber: '#f0b020',
  neonPink: '#ff4fa3',
  neonCyan: '#33e0ff',
  neonGreen: '#5dff8a',
  neonAmber: '#ffb020',
  lampWarm: '#ffe0a0',
  headlight: '#fff3c4',
  taillight: '#e0313b',
  indicator: '#ffa500',
  plate: '#f4efe0',
  fire: '#ff7a1a',
  leaf: '#4a8a3c',
  leafDark: '#376e2e',
  leafAutumn: '#c9772e',
  trunk: '#6a4a2e',
  flowerA: '#f06a8a',
  flowerB: '#f5d349',
  // Customers' cars, by the name a job gives its paint, plus the extra finishes the
  // dealer and the paint shop add.
  paint: Object.freeze({
    silver: '#9aa4b2', red: '#c0392b', blue: '#2e6fd8', white: '#f2f2f2', orange: '#e67e22',
    green: '#27ae60', black: '#1c1f24', purple: '#8e44ad', teal: '#16a085', copper: '#d35400',
    yellow: '#f1c40f', grey: '#7f8c8d', pewter: '#95a5a6', pearl: '#bdc3c7',
    candy: '#9c1c3a', midnight: '#1b2a52', lime: '#9acd32', pink: '#e85d9b', sunset: '#ff6a3d',
    gold: '#c9a227', bronze: '#8a5a2b', mint: '#5fd1a4', sky: '#5aaee8', graphite: '#3c4350',
  }),
  // People.
  skin: Object.freeze(['#f2cfae', '#e0b48c', '#c68b5f', '#a06a42', '#7a4a2c', '#53321f']),
  hair: Object.freeze({
    black: '#1b1a1c', brown: '#4a3222', chestnut: '#6e4528', blonde: '#d8b45a', ginger: '#b4521f',
    grey: '#9aa0a8', white: '#e6e8ec', red: '#a9262e', blue: '#2f6fd0', pink: '#e86aa8', green: '#3fb06a', purple: '#8a4ad0',
  }),
  cloth: Object.freeze({
    white: '#f1f3f6', black: '#1d2026', grey: '#6d7684', charcoal: '#383e48', navy: '#23386b', blue: '#2e6fd8',
    sky: '#6fb2e8', teal: '#1f9d8c', green: '#2f9d58', olive: '#6b7a3a', lime: '#9ccf3c', yellow: '#f0c419',
    orange: '#ee7d22', red: '#c8372f', maroon: '#7c2430', pink: '#ec78a8', purple: '#7d4fb3', brown: '#6a4a33',
    tan: '#c9a77a', cream: '#efe4c8', denim: '#3f5f94', denimDark: '#2b405f', gold: '#d6a92b', silver: '#b8c0cc',
    neon: '#33e0a0', hivis: '#d7f23a',
  }),
  eye: '#1a1c22',
  mouth: '#7a3a3a',
  cheek: '#e89a8a',
  outline: '#0b0d12',
  shadow: '#05070c',
});
