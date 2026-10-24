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

- **The physical world is inked.** The 3D shop, the laptop and phone bodies, the shop's
  markers and paper on the job board keep the pen: the sketch post-process
  (`desk/stage.js`), wobbly outlines (`--ink-a/b/c/round`) and `.ink-frame-lg`.
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
- **Interaction is with the thing.** The dyno, the engine stand and the job board are
  operated on the objects in the shop, not through a panel beside the 3D view
  (`desk/Station.jsx`, `desk/ShopBackdrop.jsx`).

## Typography

- **One sans, the system's** (`--sans`: -apple-system, Segoe UI, Roboto). It is what
  the player's other tools use, and it costs nothing to load.
- **Mono only for numbers** (`--mono`): readouts, axis ticks, table cells, the version.
  Prose is never mono.
- **Scale** (`--fs-*`): 9, 10.5, 12, 13.5, 14.5 and 18 px. The start screen's 30 px
  title is the one exception, and it is written down where it is used.
- **Sentence case.** No letter-spacing and no forced capitals anywhere: `sketch.css`
  turns both off globally (`[data-keep-tracking]` opts out, for real engraved labels
  only). Acronyms that are real stay capitals (VE, AFR, MAP, ECU). Page names in the
  career's copy (TUNE, DYNO) are names of places, so they are written as such.
- Text never moves. No animated type, no jitter on chart lines.

## Colour

The table below is the ground outside the laptop: the start screen, the shop's pages and
the dyno. The laptop's own software uses the `--mac-*` tokens described above (window
#1e1e1e, sidebar #262626, controls #3d3d3d, selection #6a6a6a, text #e6e6e6 / #a6a6a6 /
#8c8c8c).

| Token | Value | Use |
|---|---|---|
| `--bg` | #0e0e0d | The ground |
| `--panel`, `--panel2`, `--panel3` | #161615, #1d1d1b, #272724 | Surfaces, one step each |
| `--line`, `--line-hi` | #302f2b, #46443e | Rules, and a stronger rule for a control's edge |
| `--ink`, `--ink-soft`, `--ink2`, `--ink3` | #ecebe5, #d2d0c8, #a6a399, #8a877f | Text, from primary to quiet. `--ink3` is 5.38:1 on `--bg`. |
| `--acc` / `--acc-on` | #e8e5da / #121210 | A selected key: light with dark text, 14.87:1 |
| `--focus` | #ffffff | The keyboard focus ring, 2 px |
| `--ok`, `--warn`, `--danger` | green, amber, red | Status only, never decoration |
| `--cyan` | #38d9f0 | The torque curve, and the second series in a chart |
| `--violet` | #a78bfa | A third series, where there is one |

The greys are warm, not blue, so they sit with the inked shop. The previous palette was
a navy ground with a SaaS blue accent. It read as a template, and its blue collided
with the data colours.

Contract tests (`tests/tokens.test.js`, `tests/no-hardcoded-colours.test.js`) keep
colours out of components, keep the accent from being a status colour, and keep
`index.html`'s first-paint colours equal to the tokens.

## Layout

- **Desktop**: the laptop or the shop fills the window, and apps open in it as windows.
- **Phone, portrait**: one column. The start screen puts its dyno sheet under the ways in.
- **Phone, landscape** (height under 520 px): two columns again, with the blurbs dropped.
- Spacing comes from `--sp-*` (3 to 24 px). Software corners are 6 to 8 px, as a Mac's.
- Left-aligned. Nothing is centred for effect. The start screen's columns are centred as
  a block, but their contents read from the left edge.

## Components

- **Keys** (`Seg`): Mac segmented controls. The state is `aria-pressed`, so the style and
  the meaning are one attribute. The dyno's console keys (`Consoles.module.css .key`) are
  physical and keep their own look.
- **Sidebar rows**: a small monochrome glyph and the name, as a Mac source list has. A
  locked table shows a padlock instead, and its name says so to a screen reader ("…,
  locked until the shop trains for it"). A count beside a row is how many log entries
  point there, as Mail counts unread mail.
- **Tables**: heat colours on cells, and the selection drawn as an outline over them, so
  a selected cell keeps its value's colour.
- **Charts**: one-pixel grid, mono ticks, power in `--ink`, torque in `--cyan`, and a
  previous run dashed at half opacity.
- **The advisor**: an inspector. The verdict's tone is a small dot by its headline,
  not a stripe. Arithmetic sits behind a disclosure ("How the correction is worked out").
- **Machine consoles** (dyno, engine stand): physical controls drawn as such. They have
  a big round button whose colour is its state (green go, red stop), latching keys and a
  hold-to-open lever.

## Motion

- The 3D camera moves only when the player asks: walking, choosing a station, leaning
  in. Otherwise it holds still.
- No idle animation on software: no pulsing badges or markers, and no shimmer. The
  dyno's standby light flashes three times when the player presses something that needs
  the machine on, then stops.
- `prefers-reduced-motion` turns off the town's camera shake (`world/settings.js`) and the
  CSS transitions that check for it. The shop camera's eased moves between stations do
  not yet become cuts; that is a known gap.

## Things not to do

These are the defaults a generated UI reaches for. Each one has been removed from this
codebase at least once.

- An eyebrow line above a title, in tracked capitals.
- A gradient or glow behind a logo or hero.
- A centred hero with three icon cards under it.
- Middle dots as separators (`A · B · C`). Write a sentence or use a list.
- Coloured left stripes on cards, unless the stripe is a state.
- An icon on every tab or button.
- A paragraph explaining a control, placed above the control.
- Accent colour on things that are not selected.
- Hand-drawn wobble on software controls.
