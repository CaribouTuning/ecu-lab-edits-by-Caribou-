# The shop: a 3D tuning shop with a dyno, a build bench and an engine stand, and the laptop

**Branch:** `CaribouTuning:claude/shop-ui` → `DNiev:main`.

**Merge after the physics PR** (`claude/physics-fixes`). This branch contains that one, so until it merges this diff includes it. Once it merges, only the interface remains.

## What this changes

### You are stood in your shop
- CAREER and SANDBOX open in a 3D tuning shop, and everything happens inside it. There is no outside world: the roller door is down.
- **The things in the shop are the buttons.** Click or tap the dyno (or the car on it), an engine on its stand or its computer cart, the job board, or the desk with the laptop. No labels stand over the shop.
  - With a mouse, the thing under the pointer lights its screen and names itself, with a hand cursor.
  - Each place also has a real button that stays invisible until the keyboard reaches it, for keyboard and screen-reader users.
  - Without WebGL, the places are a row of plain buttons.
- **The laptop** (the phone, on a phone) is on the desk. Its software is a native-looking Mac app: Tune, Learn, Physics, and in CAREER, Pops's messages.

### The stations
Walked up to, each station's computer fills what the page header leaves clear, bezel included. Its screen scrolls inside itself, and the page never scrolls.

- **Dyno.** The car on the rollers, a drum cooling fan at its nose, and a computer cart.
  - The monitor shows curves, live channels, VE, a 3D table, the pull log, the datalog, the score and history, plus a run sheet before the first pull.
  - The control box has the load keys, the nitrous switch and Run.
- **Build bench.** The engine on a build stand (red powder coat, casters, a mounting head), with the bench computer beside it.
  - The engine starts one of two ways: a factory engine from the catalogue, with its spec sheet, or your own engine from your figures. Change engine brings the same choice back.
  - The parts are numbered in assembly order: Engine, Short block, Heads and cam, Induction, Fuel system, Exhaust. Each sheet ends with the next part, and the last one ends with Start it on the engine stand.
  - A factory engine as built is **stock**. Change a part and it is **modified**, with the changed parts marked and a Return to stock. Or it is **your own**.
  - The 3D engine is redrawn as each part is chosen. It has a V engine's banks on its crankcase, a sump, a bellhousing flange, a timing cover, bolted cam covers, intake runners, cast exhaust logs or header tubes, and an oil filter.
- **Engine stand.** The same engine on a run stand, with a radiator, and its exhaust going into a ceiling extraction hose.
  - Its computer shows Run, Sensors, ECU and Physics.
  - Its control box has Start, a throttle lever and sound.
- **Job board.** A whiteboard on the wall. The shop's figures and the tabs are written along the top, and each job is a printed work order on the board.

### CAREER
- **Procedural jobs, all done in the shop.** Customers come off the job board; you pull the car on the dyno, fix what the pull log points at on the laptop, pull again, and hand it back.
- **Ray's dyno is in the bay from the first day.** There is nothing to buy before a pull measures power.
  - A save from when the dyno had to be bought gets it on load.
  - The dyno's running cost and its milestone are gone.
- **The story** (Pops's twelve chapters) is rewritten around the shop. The drag strip and race-track chapters are replaced with shop goals:
  - five, then ten, clean jobs;
  - an engine built to order;
  - reaching Respected shop.
  The lessons, and their sources, are kept.
- **Removed with the town:**
  - the road test;
  - the town itself, and driving;
  - the drag strip and the raceway;
  - the dealer and the player's own cars;
  - the wardrobe, the car meet, the scrapyard and collectibles;
  - daily goals, decor and achievements.

  A save's old fields for these are dropped on load.

### Where to go next (`src/ui/flow.js`)
- One next step, worked out from what is true now. It shows over the shop floor, under each station's header, and on the laptop and phone. The next station's screen is a little brighter than the rest.
- **SANDBOX:** choose and build an engine → start it and hear it → pull it → fix what the pull log points at on the laptop → pull again.
- **CAREER:** Pops's first messages → the job board → a pull → the fix → pull again → the ticket, to hand the car back.

### Look
- **The shop is lit and finished as a real workshop** (`src/ui/desk/realize.js`, `stage.js` `real`):
  - physically based materials keyed to the palette: machined aluminium, cast iron, powder coat, rubber, glass;
  - a sealed concrete floor with saw-cut joints;
  - soft shadows from overhead LED strip fixtures;
  - filmic tone mapping, and reflections of a neutral room.
- **Signs:** the shop's sign is painted steel on stand-off bolts, "Caribou Tuning" with "Engine building and dyno tuning" under it.
- **Each station's computer idles on its own program** when nobody is at it: the dyno's power and torque curves, the stand's tachometer, the bench's parts list. You can tell them apart from across the shop.
- **The UI text:**
  - Labels are plain words, not tracked capitals or middle dots.
  - Colour lives only in `tokens.js` and `tokens.css`.
  - No decorative gradients or glow.

## For reviewers
- **Where things are:**
  - `src/ui/desk/`:
    - Desk (laptop and phone chrome);
    - ShopBackdrop and shopScene (the room, the camera, the flat faces, `pickAt`);
    - realize.js (materials);
    - Station (surfaces), Consoles, BuildBench, the apps.
  - `src/ui/world/` is now only the 3D toolkit the shop is drawn with: the stage, the materials, and the car, engine and prop models. The town, driving, races and their panels are deleted, with their tests and `docs/career-world.md`.
  - `src/ui/flow.js`: the next step, pure and unit-tested.
  - `src/ui/EcuLab.jsx`: still the shell that wires the store to the screens.
- **Station framing** (`stationPose` in shopScene.js) fits every corner of the station, bezel included, into the clear area the page reports, with a margin. The job board is framed the same way.
- **Tests:**
  - Navigation tests reach BUILD by the Build bench button and LIVE by the Engine stand button (`tests/ui/nav.js`).
  - The career tests cover the dyno being owned from the start, and old saves gaining it.
  - The story test runs the rewritten chapters to the end.
  - Tests for deleted features are deleted with them.

## Checks
- `npm run lint` and `npm run typecheck` are clean on Node 22, and `npm run build` succeeds.
- `npm test` on Node 22: see the latest run on the PR.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_011yB5vgB3XCafpiKPgWSGHR
