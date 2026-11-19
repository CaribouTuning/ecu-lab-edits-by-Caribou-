# DESIGN.md

How ECU Lab looks and why. The tokens live in `src/ui/tokens.css` (mirrored in
`src/ui/tokens.js`, and a test keeps the two equal). This file explains them. If a
value here disagrees with the tokens, the tokens win, and this file needs fixing.

## Who it is for

Two kinds of player share the same screens:

- People who tune real cars, or want to. They know HP Tuners, a Haltech or a dyno
  sheet. They distrust anything that looks like marketing. They judge the program in
  seconds by whether its screens look like the tools they already use.
- People learning what an ECU does. They need every number explained where it
  appears, and need to see cause and effect: change a cell, run a pull, see the curve
  move.

Both groups spend their time reading numbers. The design is mostly about getting out
of the numbers' way.

## What real tools do (research notes)

Taken from each vendor's own documentation and help pages, not from screenshots, so
these notes cover structure, not exact pixels.

- **HP Tuners VCM Editor.** The table is the screen. A toolbar above it modifies the
  selection (add, multiply, smooth, interpolate), and a histogram of logged data sits
  beside it. Navigation is a tree of tables on the left.
- **MoTeC M1 Tune.** Worksheets are tabs, switched with Ctrl and a number. A component
  shows its table and its graph together. The focused cell is highlighted, edited cells
  are marked, and F6 makes a component fullscreen. The colour is restrained: the table's
  heat map carries most of it.
- **Haltech NSP.** The map with a 3D view beside it, and a live-data strip along an edge.
- **Dynojet WinPEP 8.** Live gauges during a run, then a sheet of power and torque
  against rpm. Up to about a dozen runs can be overlaid to compare them.

What they share: a dark or neutral ground, dense tables, small fixed type, and colour
that mostly encodes values. They use no hero sections, no gradients, no cards for the
sake of cards, and no forced capitals.

## Five directions considered

| | Direction | For | Against |
|---|---|---|---|
| 1 | **Hand-drawn throughout** (the previous look): wobbly ink on every box and control | Distinctive; matches the 3D shop's sketch shader | Software looked like a toy. Wobble on a table cell reads as an error. This was the main thing called "AI slop". |
| 2 | **Vendor clone**: copy one real tuning suite closely | Instantly familiar to tuners | Dated (many of them are Windows-era UIs). Raises trademark questions. Means nothing to learners. |
| 3 | **Glass dashboard**: frosted panels, neon accent, glows | Looks "modern" in a thumbnail | Exactly what generated UIs default to. Low contrast. Glow competes with data colour. |
| 4 | **Paper and pencil**: a light, engineering-notebook theme | Calm; good for teaching | Fights the dark 3D shop it sits in. Heat maps lose contrast on white. Glare in a garage. |
| 5 | **Workshop instrument software**: graphite chrome, colour only for data, table first, ink only on physical things | Reads like a real tool. Keeps the shop's character where it belongs. Colour regains meaning. | Still a custom look: players read it as a web template, not as software they know. |
| 6 | **A native Mac app** (chosen, October 2026): the laptop runs macOS-style software in dark mode with the Graphite accent | Every player knows what a Mac app looks like, so nothing reads as made up. Its rules (title bar, sidebar, segmented controls, inspector) are fixed, not invented. | A look borrowed from one platform. Needs care not to imitate Apple's own marks: no Apple logo, no SF Symbols files, no Apple app names. |

Direction 5 shipped first, and players still called the screens AI-made. The owner chose
direction 6: the laptop's software should look like a native Mac app.

### The chosen direction

**The world is drawn; the software is a Mac app.**

- **The 3D shop keeps its look; the devices are plain.** The shop has its sketch
  post-process (`desk/stage.js`). The laptop's and the phone's bodies are a plain bezel
  (`.ink-frame-lg`): the wobbly outlines went with direction 7 below.
- **The laptop's software is a Mac app in dark mode.** A menu bar along the top of the
  screen names the app (ECU Lab). Each app opens in a window with traffic lights and a
  centred title, and a status bar along its bottom carries the engine line and readouts.
  The `--mac-*` tokens hold the colours. Inside the laptop's screen and a phone's open
  app, the neutral tokens (`--bg`, `--panel*`, `--line*`, `--ink*`, `--pen`) are remapped
  to them (Desk.module.css `.screen`, `.phoneApp`). Every app therefore picks them up
  without knowing, and a component that wants them must use the CSS variables, not the
  JS `T` constants.
- **Mac controls.** Push buttons are grey rounded keys with no outline. Segmented
  controls are one well, with the chosen segment a lighter raised chip. Pop-up buttons
  have a chevron. Group boxes are a faint well with a hairline edge. Corners are 6 to
  8 px.
- **Graphite selection.** A selection is a lighter grey chip with white text
  (`--mac-selected` on `--mac-sel-ink`); a sidebar row's is quieter (`--mac-row-sel`).
  Hue appears only when it means something: table heat, the power and torque curves,
  ok / warning / danger, and the traffic lights.
- **Tune is a document window.** A source-list sidebar holds the ECU's tables, with the
  map slots under them. The open table has one toolbar line, and the advisor is an
  inspector beside it. The inspector sits beside the table only when Tune's own width
  holds all 16 columns (a container query); otherwise it goes under the table.
- **Interaction is with the thing.** The dyno and the engine stand are operated on the
  objects in the shop, not through a panel beside the 3D view (`desk/Station.jsx`,
  `desk/ShopBackdrop.jsx`). CAREER's jobs are an app (Jobs) on the laptop and the phone,
  not a board on the wall: a whiteboard of paper work orders was the one light screen in
  a dark game, and on a phone it could not be read.
- **A phone is the phone.** Played on a phone, the in-game phone fills the screen and draws
  no status bar or home indicator of its own: a second set inside the real one read as the
  screen cut off. Notifications and settings sit in each app's top bar.

### Direction 7: one instrument palette

The owner then asked for one palette across every screen, the Jobs app included: a deep
slate ground, three surface steps, slate text greys, and colour only for meaning (blue the
thing to do, green good, amber a warning, red critical). It replaced the warm greys of
direction 5 and the separate Mac greys, so the shop's pages and the laptop's apps are now
the same colours. A selection stays a lighter slate key (`--mac-selected`), so blue is
left to actions and data.

### Direction 8: Apple's glass for the chrome, a car designer's panels for the data

Players still read the screens as generated (November 2026). The owner sent references: Apple's
current interface (glass panes, capsule controls, coloured icon tiles) and the technical
screens of a car-company game (titled panels, dense stat tables, cells coloured by state). The
rule is to give each kind of thing the look it has in the world it comes from:

- **Chrome is Apple's.** The menu bar, the next step, a window and the stations' bars are panes
  of glass (`--glass`, a blur, a top highlight `--glass-hi` and a hairline `--glass-edge`)
  floating on a deep navy wallpaper (`--screen-*`). Buttons, segmented controls and pop-ups
  are capsules. A list of places (TUNE's tables, the build's parts) is an inset group, each row
  with its own coloured tile (`--tile-*`), as Settings lists them. The action is the accent,
  a step deep (`--pill-*`); everything else is glass.
- **Data is technical.** A panel that holds working (a table, a chart, a group of settings, the
  advisor, a score) is named in a title strip across its top (`--strip-*`; `Panel`'s `title`,
  `Eyebrow`, `SpecGroup`). A table's cells are tiles in a dark tray with a gap round each; a
  set of figures is a stat table, each figure on its own band. Heat and status colours are
  unchanged.
- The blue stays the same blue, kept dark: the owner turned down a brighter wallpaper.

## Typography

- **One sans, the system's** (`--sans`: -apple-system, Segoe UI, Roboto). It is what
  the player's other tools use, and it costs nothing to load.
- **Mono only for numbers** (`--mono`): readouts, axis ticks, table cells, the version.
  Prose is never mono.
- **Scale** (`--fs-*`): 9, 10.5, 12, 13.5, 14.5 and 18 px. The start screen's 40 px
  title (30 px on a phone) is the one exception, and it is written down where it is used.
- **Sentence case.** No letter-spacing and no forced capitals anywhere: `sketch.css`
  turns both off globally (`[data-keep-tracking]` opts out, for real engraved labels
  only). Acronyms that are real stay capitals (VE, AFR, MAP, ECU). Page names in the
  career's copy (TUNE, DYNO) are names of places, so they are written as such.
- Text never moves. No animated type, no jitter on chart lines.

## Colour

One palette, inside the laptop and out (the `--mac-*` tokens hold the same values, so the
remapping in Desk.module.css changes nothing visible).

| Token | Value | Use |
|---|---|---|
| `--bg` | #090d16 | The ground |
| `--panel`, `--panel2`, `--panel3` | #0d1421, #111827, #1a2333 | Surfaces: secondary, elevated, a control's well |
| `--line`, `--line-hi` | #1e293b, #334155 | Rules, and a stronger rule for a control's edge |
| `--ink`, `--ink-soft`, `--ink2`, `--ink3` | #f8fafc, #cbd5e1, #94a3b8, #64748b | Text, from primary to quiet |
| `--acc` / `--acc-on` | #3b82f6 / #ffffff | The thing to do: a primary button, the next step |
| `--mac-selected` | #2b3850 | A selected segment or chip: the glass thumb |
| `--glass`, `--glass-soft`, `--glass-chip` | translucent navy and whites | A pane, a group on it, a control on it |
| `--strip-hi`, `--strip-lo` | translucent whites | A technical panel's title strip |
| `--tile-*-hi`, `--tile-*-lo` | one pair per ECU page | A list row's icon tile |
| `--focus` | #ffffff | The keyboard focus ring, 2 px |
| `--ok`, `--warn`, `--danger` | #10b981, #f59e0b, #ef4444 | Status only, never decoration |
| `--cyan` | #38d9f0 | The torque curve, and the second series in a chart |
| `--violet` | #a78bfa | A third series, where there is one |

Contract tests (`tests/tokens.test.js`, `tests/no-hardcoded-colours.test.js`) keep
colours out of components, keep the accent from being a status colour, and keep
`index.html`'s first-paint colours equal to the tokens.

## Layout

- **Desktop**: the laptop or the shop fills the window, and apps open in it as windows.
- **Phone, portrait**: one column. On the start screen the badge sits beside the name and
  the ways in follow as one list.
- **Phone, landscape** (height under 520 px): two columns again, with the blurbs dropped.
- Spacing comes from `--sp-*` (3 to 24 px). Corners: a pane 14 to 18 px, a tile 6 px, a
  table cell 3 px; a control is a capsule.
- Left-aligned. Nothing is centred for effect, the start screen included: the stations' page
  bar, then what ECU Lab is on the left and the ways in on the right, as one list.

## Components

- **Keys** (`Seg`): capsule segmented controls, the chosen one a glass thumb. The state is
  `aria-pressed`, so the style and the meaning are one attribute. The dyno's console keys (`Consoles.module.css .key`) are
  physical and keep their own look.
- **Sidebar rows**: an inset group, each row a coloured tile with a white glyph and the
  name, as Settings lists its panes. A locked table shows a padlock instead, and its name says so to a screen reader ("…,
  locked until the shop trains for it"). A count beside a row is how many log entries
  point there, as Mail counts unread mail.
- **Tables**: heat colours on cells, green for low values through yellow to red for high,
  as tuning software shades a table (RomRaider's editor blends its hue from a blue minimum
  to a red maximum, through green and yellow; `heat` in theme.js has the sources). The
  selection is drawn as an outline over them, so a selected cell keeps its value's colour.
  Each cell is its own tile in a dark tray, the axes in strips. Once any cell holds a
  fraction every cell shows its tenth, so a column reads 94.0 over 97.5.
- **Charts**: one-pixel grid, mono ticks, power in `--ink`, torque in `--cyan`, and a
  previous run dashed at half opacity.
- **The advisor**: a technical panel named in its strip. The verdict carries a tile in its
  tone (a tick, or ! for a warning), not a stripe; a cell's figures are a stat table. Arithmetic sits behind a disclosure ("How the correction is worked out").
- **Machine consoles** (dyno, engine stand): physical controls drawn as such. They have
  a big round button whose colour is its state (green go, red stop), latching keys and a
  hold-to-open lever.

## Motion

- The 3D camera moves only when the player asks: walking, choosing a station, leaning
  in. Otherwise it holds still.
- No idle animation on software: no pulsing badges or markers, and no shimmer. The
  dyno's standby light flashes three times when the player presses something that needs
  the machine on, then stops.
- `prefers-reduced-motion` turns the shop camera's eased moves between stations into cuts
  (`desk/shopScene.js`), stops the physics cutaways' animation, and turns off the CSS
  transitions that check for it.

## Things not to do

These are the defaults a generated UI reaches for. Each one has been removed from this
codebase at least once.

- An eyebrow line above a title, in tracked capitals.
- A gradient or glow behind a logo or hero.
- A centred hero with three icon cards under it.
- Middle dots as separators (`A · B · C`). Write a sentence or use a list.
- Coloured left stripes on cards, unless the stripe is a state.
- An icon on every tab or button. (A list of places has its tiles, as Settings does; a
  button does not.)
- A paragraph explaining a control, placed above the control.
- Accent colour on things that are not selected.
- Glass under data. The blur is for the chrome; a table or chart sits on a still pane.
- Hand-drawn wobble on software controls.
