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
  bg: '#0e0e0d',
  panel: '#161615',
  panel2: '#1d1d1b',
  panel3: '#272724',

  // Borders.
  line: '#302f2b',
  lineHi: '#46443e',

  // Text, four steps from primary to faintest.
  ink: '#ecebe5',
  inkSoft: '#d2d0c8',
  ink2: '#a6a399',
  ink3: '#8a877f',

  // Accent. `accOn` is text placed ON an accent fill — it must never be a grey.
  acc: '#e8e5da',
  accInk: '#f6f4ee',
  accBg: '#2a2925',
  accOn: '#121210',
  // Keyboard focus: a white ring, the brightest thing on the screen, never a status colour.
  focus: '#ffffff',

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

  // The graph paper everything is drawn on: a faint minor grid and a firmer major one,
  // like the pad the interface was sketched on.
  paperGrid: '#1a2130',
  paperGridMajor: '#262f42',


  // The Physics app's engine cutaway: the metal, the oil, the coolant, and the charge
  // through the four strokes (fresh mixture, burning, spent).
  cutMetal: '#9aa6b5',
  cutMetalDark: '#5d6878',
  cutOil: '#d9b13b',
  cutCoolant: '#2fa3d6',
  cutFresh: '#5aa9ff',
  cutBurn: '#ff7a2e',
  cutExhaust: '#8c8f96',

  // The app icons on the desktop and the home screen: a cream card with the doodle inked
  // on it in near-black over a pale blue wash, and the name on a cream label.
  tile: '#f7f2e6',
  tileInk: '#1f1c18',
  tileWash: '#bcd2ee',
  // The job board: a whiteboard, its aluminium frame, the marker written on it, and the
  // printed work orders held on it.
  board: '#eceeec',
  boardLine: '#b9bec3',
  marker: '#1f4c9a',
  order: '#fbfaf6',

  // The laptop's software, drawn as a native Mac app in dark mode with the Graphite
  // accent (Desk.module.css .window remaps the neutral tokens to these).
  macWindow: '#1e1e1e',
  macTitlebar: '#2b2b2b',
  macSidebar: '#262626',
  macBox: '#252525',
  macControl: '#3d3d3d',
  macControlHi: '#4b4b4b',
  macSelected: '#6a6a6a',
  macRowSel: '#474747',
  macSeparator: '#383838',
  macLabel: '#e6e6e6',
  macLabel2: '#a6a6a6',
  macLabel3: '#8c8c8c',
  macSelInk: '#ffffff',
  macRed: '#ff5f57',
  macYellow: '#febc2e',
  macGreen: '#28c840',
  macLightInk: '#4d0000',

  // The start screen keeps the look it was liked in: navy and the blue key (StartScreen).
  startBg: '#0a0d14',
  startPanel: '#131824',
  startLineHi: '#33405a',
  startInk: '#e9eef8',
  startInk2: '#8792a8',
  startInk3: '#5c6880',
  startAcc: '#4c9eff',
  startAccInk: '#8fc2ff',
  startAccBg: '#0f2033',
  startAccOn: '#04162e',
  startAccRgb: '76, 158, 255',

  // The laptop's and the phone's wallpaper: the Caribou badge in neutral chrome on a
  // graphite ground (no blue, no reflection).
  wallSky: '#1a1a18',
  wallSky2: '#0b0b0a',
  chromeHi: '#ffffff',
  chromeMid: '#d4d2cb',
  chromeLo: '#7a786f',
  badgeInk: '#121210',
  wallDeep: '#0b3a9a',
  wallMid: '#2c6fe0',
  wallLight: '#8fbdff',

  // The apps' icons, iOS style: a tile in a top-to-bottom gradient with a white glyph, and
  // Messages' sent and received bubbles.
  appTuneHi: '#5ac8fa',
  appTuneLo: '#0a5fd8',
  appBuildHi: '#b8bec8',
  appBuildLo: '#5d6470',
  appLearnHi: '#ffb340',
  appLearnLo: '#f46a00',
  appPhysicsHi: '#bf8cff',
  appPhysicsLo: '#6a35e8',
  appMsgHi: '#6cf57f',
  appMsgLo: '#0bb82a',
  appSearchHi: '#8e8e98',
  appSearchLo: '#48484f',
  appShopHi: '#ffd84a',
  appShopLo: '#f29a00',
  appGlyph: '#ffffff',
  msgSent: '#1d8cff',
  msgGot: '#2a2d34',

  // Type.
  mono: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
  sans: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",

  // Bare RGB triplets, so translucent washes can be built from the same colours
  // rather than re-typing them at a new alpha. See accAlpha/shadowAlpha below.
  accRgb: '232, 229, 218',
  shadowRgb: '0, 0, 0',
  glassRgb: '255, 255, 255',

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
  rXs: '2px',
  rSm: '3px',
  rMd: '4px',
  rLg: '6px',

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

  // The inked frame's pen line as a mask (sketch.css), so its colour still comes from
  // the palette; the black in the SVG only marks which pixels show.
  inkMask: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='96' height='96' viewBox='0 0 96 96'%3E%3Cpath d='M12.0 2.2 L14.0 2.3 L16.0 2.5 L18.0 2.9 L20.0 3.3 L22.0 3.6 L24.0 3.8 L26.0 3.7 L28.0 3.6 L30.0 3.4 L32.0 3.3 L34.0 3.2 L36.0 3.2 L38.0 3.2 L40.0 3.2 L42.0 3.0 L44.0 2.9 L46.0 2.8 L48.0 2.8 L50.0 2.8 L52.0 2.8 L54.0 2.7 L56.0 2.5 L58.0 2.3 L60.0 2.2 L62.0 2.3 L64.0 2.5 L66.0 2.9 L68.0 3.3 L70.0 3.6 L72.0 3.8 L74.0 3.7 L76.0 3.6 L78.0 3.4 L80.0 3.3 L82.0 3.2 L84.0 3.2 L86.3 3.3 L88.5 4.2 L90.4 5.6 L91.8 7.5 L92.7 9.7 L93.2 12.0 L93.6 14.0 L93.8 16.0 L93.8 18.0 L93.6 20.0 L93.4 22.0 L93.3 24.0 L93.2 26.0 L93.2 28.0 L93.2 30.0 L93.2 32.0 L93.1 34.0 L92.9 36.0 L92.8 38.0 L92.8 40.0 L92.8 42.0 L92.8 44.0 L92.7 46.0 L92.6 48.0 L92.4 50.0 L92.2 52.0 L92.2 54.0 L92.4 56.0 L92.8 58.0 L93.2 60.0 L93.6 62.0 L93.8 64.0 L93.8 66.0 L93.6 68.0 L93.4 70.0 L93.3 72.0 L93.2 74.0 L93.2 76.0 L93.2 78.0 L93.2 80.0 L93.1 82.0 L92.9 84.0 L92.7 86.3 L91.8 88.5 L90.4 90.4 L88.5 91.8 L86.3 92.7 L84.0 92.8 L82.0 92.8 L80.0 92.8 L78.0 92.8 L76.0 93.0 L74.0 93.1 L72.0 93.2 L70.0 93.2 L68.0 93.2 L66.0 93.2 L64.0 93.3 L62.0 93.5 L60.0 93.7 L58.0 93.8 L56.0 93.7 L54.0 93.5 L52.0 93.1 L50.0 92.7 L48.0 92.4 L46.0 92.2 L44.0 92.3 L42.0 92.4 L40.0 92.6 L38.0 92.7 L36.0 92.8 L34.0 92.8 L32.0 92.8 L30.0 92.8 L28.0 93.0 L26.0 93.1 L24.0 93.2 L22.0 93.2 L20.0 93.2 L18.0 93.2 L16.0 93.3 L14.0 93.5 L12.0 93.7 L9.7 92.7 L7.5 91.8 L5.6 90.4 L4.2 88.5 L3.3 86.3 L2.3 84.0 L2.4 82.0 L2.6 80.0 L2.7 78.0 L2.8 76.0 L2.8 74.0 L2.8 72.0 L2.9 70.0 L3.0 68.0 L3.1 66.0 L3.2 64.0 L3.2 62.0 L3.2 60.0 L3.3 58.0 L3.3 56.0 L3.5 54.0 L3.7 52.0 L3.8 50.0 L3.7 48.0 L3.4 46.0 L3.1 44.0 L2.6 42.0 L2.3 40.0 L2.2 38.0 L2.3 36.0 L2.4 34.0 L2.6 32.0 L2.7 30.0 L2.8 28.0 L2.8 26.0 L2.8 24.0 L2.9 22.0 L3.0 20.0 L3.1 18.0 L3.2 16.0 L3.2 14.0 L3.2 12.0 L3.3 9.7 L4.2 7.5 L5.6 5.6 L7.5 4.2 L9.7 3.3Z' fill='none' stroke='%23000' stroke-width='2' stroke-linejoin='round'/%3E%3C/svg%3E")`,
  inkMaskLg: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='192' height='192' viewBox='0 0 192 192'%3E%3Cpath d='M18.0 3.7 L20.0 4.3 L22.0 4.8 L24.0 5.2 L26.0 5.5 L28.0 5.8 L30.0 5.9 L32.0 5.9 L34.0 5.8 L36.0 5.6 L38.0 5.4 L40.0 5.2 L42.0 5.0 L44.0 4.8 L46.0 4.7 L48.0 4.6 L50.0 4.6 L52.0 4.6 L54.0 4.6 L56.0 4.6 L58.0 4.6 L60.0 4.5 L62.0 4.4 L64.0 4.2 L66.0 4.1 L68.0 3.9 L70.0 3.7 L72.0 3.6 L74.0 3.5 L76.0 3.4 L78.0 3.4 L80.0 3.4 L82.0 3.4 L84.0 3.4 L86.0 3.4 L88.0 3.3 L90.0 3.2 L92.0 3.0 L94.0 2.8 L96.0 2.6 L98.0 2.4 L100.0 2.2 L102.0 2.1 L104.0 2.1 L106.0 2.2 L108.0 2.5 L110.0 2.8 L112.0 3.3 L114.0 3.7 L116.0 4.3 L118.0 4.8 L120.0 5.2 L122.0 5.5 L124.0 5.8 L126.0 5.9 L128.0 5.9 L130.0 5.8 L132.0 5.6 L134.0 5.4 L136.0 5.2 L138.0 5.0 L140.0 4.8 L142.0 4.7 L144.0 4.6 L146.0 4.6 L148.0 4.6 L150.0 4.6 L152.0 4.6 L154.0 4.6 L156.0 4.5 L158.0 4.4 L160.0 4.2 L162.0 4.1 L164.0 3.9 L166.0 3.7 L168.0 3.6 L170.0 3.5 L172.0 3.4 L174.0 3.4 L177.6 4.5 L181.0 5.9 L183.9 8.1 L186.1 11.0 L187.5 14.4 L189.8 18.0 L189.7 20.0 L189.5 22.0 L189.3 24.0 L189.0 26.0 L188.9 28.0 L188.7 30.0 L188.6 32.0 L188.6 34.0 L188.6 36.0 L188.6 38.0 L188.6 40.0 L188.6 42.0 L188.5 44.0 L188.4 46.0 L188.3 48.0 L188.1 50.0 L188.0 52.0 L187.8 54.0 L187.7 56.0 L187.5 58.0 L187.5 60.0 L187.4 62.0 L187.4 64.0 L187.4 66.0 L187.4 68.0 L187.4 70.0 L187.4 72.0 L187.2 74.0 L187.1 76.0 L186.9 78.0 L186.7 80.0 L186.4 82.0 L186.3 84.0 L186.1 86.0 L186.1 88.0 L186.2 90.0 L186.4 92.0 L186.7 94.0 L187.1 96.0 L187.6 98.0 L188.1 100.0 L188.6 102.0 L189.0 104.0 L189.4 106.0 L189.7 108.0 L189.9 110.0 L189.9 112.0 L189.8 114.0 L189.7 116.0 L189.5 118.0 L189.3 120.0 L189.0 122.0 L188.9 124.0 L188.7 126.0 L188.6 128.0 L188.6 130.0 L188.6 132.0 L188.6 134.0 L188.6 136.0 L188.6 138.0 L188.5 140.0 L188.4 142.0 L188.3 144.0 L188.1 146.0 L188.0 148.0 L187.8 150.0 L187.7 152.0 L187.5 154.0 L187.5 156.0 L187.4 158.0 L187.4 160.0 L187.4 162.0 L187.4 164.0 L187.4 166.0 L187.4 168.0 L187.2 170.0 L187.1 172.0 L186.9 174.0 L187.5 177.6 L186.1 181.0 L183.9 183.9 L181.0 186.1 L177.6 187.5 L174.0 186.6 L172.0 186.3 L170.0 186.1 L168.0 186.1 L166.0 186.2 L164.0 186.3 L162.0 186.5 L160.0 186.8 L158.0 187.0 L156.0 187.2 L154.0 187.3 L152.0 187.4 L150.0 187.4 L148.0 187.4 L146.0 187.4 L144.0 187.4 L142.0 187.4 L140.0 187.5 L138.0 187.6 L136.0 187.7 L134.0 187.9 L132.0 188.0 L130.0 188.2 L128.0 188.4 L126.0 188.5 L124.0 188.5 L122.0 188.6 L120.0 188.6 L118.0 188.6 L116.0 188.6 L114.0 188.6 L112.0 188.6 L110.0 188.8 L108.0 188.9 L106.0 189.1 L104.0 189.3 L102.0 189.6 L100.0 189.7 L98.0 189.9 L96.0 189.9 L94.0 189.8 L92.0 189.6 L90.0 189.3 L88.0 188.9 L86.0 188.4 L84.0 187.9 L82.0 187.4 L80.0 186.9 L78.0 186.6 L76.0 186.3 L74.0 186.1 L72.0 186.1 L70.0 186.2 L68.0 186.3 L66.0 186.5 L64.0 186.8 L62.0 187.0 L60.0 187.2 L58.0 187.3 L56.0 187.4 L54.0 187.4 L52.0 187.4 L50.0 187.4 L48.0 187.4 L46.0 187.4 L44.0 187.5 L42.0 187.6 L40.0 187.7 L38.0 187.9 L36.0 188.0 L34.0 188.2 L32.0 188.4 L30.0 188.5 L28.0 188.5 L26.0 188.6 L24.0 188.6 L22.0 188.6 L20.0 188.6 L18.0 188.6 L14.4 187.5 L11.0 186.1 L8.1 183.9 L5.9 181.0 L4.5 177.6 L5.8 174.0 L5.5 172.0 L5.2 170.0 L4.7 168.0 L4.2 166.0 L3.7 164.0 L3.2 162.0 L2.8 160.0 L2.4 158.0 L2.2 156.0 L2.1 154.0 L2.1 152.0 L2.2 150.0 L2.4 148.0 L2.6 146.0 L2.8 144.0 L3.0 142.0 L3.2 140.0 L3.3 138.0 L3.4 136.0 L3.4 134.0 L3.4 132.0 L3.4 130.0 L3.4 128.0 L3.4 126.0 L3.5 124.0 L3.6 122.0 L3.8 120.0 L3.9 118.0 L4.1 116.0 L4.3 114.0 L4.4 112.0 L4.5 110.0 L4.6 108.0 L4.6 106.0 L4.6 104.0 L4.6 102.0 L4.6 100.0 L4.6 98.0 L4.7 96.0 L4.8 94.0 L5.0 92.0 L5.2 90.0 L5.4 88.0 L5.6 86.0 L5.8 84.0 L5.9 82.0 L5.9 80.0 L5.8 78.0 L5.5 76.0 L5.2 74.0 L4.7 72.0 L4.2 70.0 L3.7 68.0 L3.2 66.0 L2.8 64.0 L2.4 62.0 L2.2 60.0 L2.1 58.0 L2.1 56.0 L2.2 54.0 L2.4 52.0 L2.6 50.0 L2.8 48.0 L3.0 46.0 L3.2 44.0 L3.3 42.0 L3.4 40.0 L3.4 38.0 L3.4 36.0 L3.4 34.0 L3.4 32.0 L3.4 30.0 L3.5 28.0 L3.6 26.0 L3.8 24.0 L3.9 22.0 L4.1 20.0 L4.3 18.0 L4.5 14.4 L5.9 11.0 L8.1 8.1 L11.0 5.9 L14.4 4.5Z' fill='none' stroke='%23000' stroke-width='3' stroke-linejoin='round'/%3E%3C/svg%3E")`,
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
  // The sandbox shop drawn as a sketch (stage.js, `sketch`): the ink its lines and
  // hatching are drawn in, and the paper its hand-lettered sign is on.
  sketch: Object.freeze({ paper: '#f3eee2', ink: '#2e2a25' }),
  // Sky and light, by time of day: the top of the sky, the horizon, the sun, the ambient.
  sky: Object.freeze({
    day: Object.freeze({ top: '#5aa0e6', horizon: '#cfe6f7', sun: '#fff1d6', ambient: '#9fb7d8', ground: '#6b7a58', sunPower: 2.4, ambientPower: 1.15 }),
    dusk: Object.freeze({ top: '#4a3f8f', horizon: '#ff9a62', sun: '#ffb27a', ambient: '#8a78b8', ground: '#4a3d4f', sunPower: 1.25, ambientPower: 0.8 }),
    night: Object.freeze({ top: '#070b1f', horizon: '#22305c', sun: '#8fa8e0', ambient: '#556aa6', ground: '#262e46', sunPower: 0.45, ambientPower: 0.95 }),
  }),
  // The far horizon seen from behind the wheel (world/sky.js): hills, clouds, stars.
  hillNear: '#5f7d5a', hillFar: '#8aa39a', cloud: '#f6f9fd', cloudShade: '#d3e0ee', star: '#aab8e0', starBright: '#f4f6ff',
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
  // Wired, frosted glass high in a shop wall: the day comes through it as a pale grey, not a sky.
  glassFrost: '#c3ccd0',
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
  // The shop's floor: sealed grey concrete, its saw-cut joints a shade darker.
  floorShop: '#6d716f',
  floorShopJoint: '#4c4f4e',
  floorEpoxy: '#8b9a95',
  floorEpoxyAlt: '#829089',
  floorGrout: '#6b7873',
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
  // Customers' cars, by the name a job gives its paint.
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
  // The text box: paper, ink and a two-tone frame, as a handheld RPG draws one.
  talk: Object.freeze({ paper: '#f7f3e8', ink: '#262a33', frame: '#34405e', frameHi: '#9cc1ee', name: '#2f5fb8', choice: '#e2ecfa' }),
  // An engine out of its car (world/models/engine.js): the Build app's model and the stand in the shop.
  engine: Object.freeze({
    block: '#7d838c', blockDark: '#5c6169', head: '#a9b0b9', blockIron: '#555a61', blockIronDark: '#41454b', headIron: '#696f77', cover: '#2a2c30', coverDark: '#4a4e55', coverOhv: '#2a2d33',
    plenum: '#b9c0c8', pipe: '#5f5853', pipeHot: '#c46a3a', turbo: '#9aa1aa', turboCold: '#c9ced5', belt: '#18191c',
    pulley: '#3a3e46', plug: '#1b1c1f', hose: '#22252b', filter: '#3b3f45', cooler: '#5d6470', bottle: '#3a7ad8',
    stand: '#4f555c', standDark: '#2f3237', flywheel: '#4a4f57', backdrop: '#1e1e1e', floor: '#2c2c2c',
  }),
  // What every cabin shares: the roof, the pillars, the mirror, the driver's skin and sleeves, the lamps.
  cockpit: Object.freeze({
    outline: '#07080b', roof: '#8a8f99', roofShade: '#6c717c', pillar: '#16181f', carpet: '#191b21', pillarHi: '#262a36', glassEdge: '#3b4252',
    dash: '#1d2029', dashHi: '#323847', dashLow: '#101217',
    mirror: '#6f93b8', mirrorDark: '#46617f', mirrorHi: '#b9d4ee',
    wheel: '#262a33', wheelHi: '#4c5364', wheelDark: '#14161c', marker: '#e0b54a',
    skin: '#d9a47c', skinHi: '#efc7a2', skinShade: '#a8764f', sleeve: '#34415e', sleeveDark: '#232d44',
    dial: '#0b0d12', dialRing: '#454c5c', ink: '#f0c75e', needle: '#ff5a3c', lampOff: '#2a2f3a', lampOn: '#ffb02e', lampBad: '#ff4a4a',
    chrome: '#d5dbe4', chromeDark: '#8d96a3', glowOff: '#1c2028', pine: '#2f8a3a', pineDark: '#1f5a26', bead: '#c8a070', beadDark: '#8a6a44', tape: '#1a1a1c',
  }),
  eye: '#1a1c22',
  mouth: '#7a3a3a',
  cheek: '#e89a8a',
  outline: '#0b0d12',
  shadow: '#05070c',
});
