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
| 5 | **Workshop instrument software** (chosen): graphite chrome, colour only for data, table first, ink only on physical things | Reads like a real tool. Keeps the shop's character where it belongs. Colour regains meaning. | Plainer at first glance. Needs discipline to stay that way. |

### The chosen direction

**Workshop instrument software.** The world is drawn; the software is not.

- **The physical world is inked.** The 3D shop, the laptop and phone bodies, the shop's
  markers and paper on the job board keep the pen: the sketch post-process
  (`desk/stage.js`), wobbly outlines (`--ink-a/b/c/round`) and `.ink-frame-lg`.
- **Software on a screen is not inked.** The apps and the dyno and engine-stand
  computers have straight edges, small corners and one-pixel rules. That covers every
  table, chart and control on them.
- **Colour is data.** The chrome is greyscale. A selection is a solid light key with dark
  text (`--acc` on `--acc-on`). Hue appears only when it means something: table heat,
  the power and torque curves, ok / warning / danger.
- **The table first.** On TUNE pages the map is the first thing under the tabs. Toolbars
  sit on one line beside it, and explanations go in `title` attributes and the advisor,
  not in paragraphs above it.
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
- Spacing comes from `--sp-*` (3 to 24 px). Corners are `--r-xs` to `--r-lg`
  (2 to 6 px). Nothing on software is rounder than 6 px except a round button.
- Left-aligned. Nothing is centred for effect. The start screen's columns are centred as
  a block, but their contents read from the left edge.

## Components

- **Keys** (`Seg`, `Consoles.module.css .key`): a pressed key is `--acc` with dark
  text, and its state is `aria-pressed`, so the style and the meaning are one attribute.
- **Tabs**: words, not icons. A locked tab adds a padlock, and its name says so to a
  screen reader ("…, locked until the shop trains for it").
- **Tables**: heat colours on cells, and the selection drawn as an outline over them, so
  a selected cell keeps its value's colour.
- **Charts**: one-pixel grid, mono ticks, power in `--ink`, torque in `--cyan`, and a
  previous run dashed at half opacity.
- **The advisor**: one panel. Its left stripe is the verdict's tone, the one stripe
  kept, because it is a real state.
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
