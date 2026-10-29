# Handoff: ECU Lab shop UI, career and physics (session ending 2026-10-29)

Read `CLAUDE.md` and `CONTRIBUTING.md` first. This file only covers where the work stands.
It lives on the fork branch `claude/career-mode-game-loop-fqdcoi`; **do not merge `handoff/`
into `claude/shop-ui` or upstream**.

Last session: https://claude.ai/code/session_011yB5vgB3XCafpiKPgWSGHR

## Where the code is

All of it is committed and pushed to `CaribouTuning/ecu-lab-edits-by-Caribou-`:

| Branch | Head | What it is |
|---|---|---|
| `claude/career-mode-game-loop-fqdcoi` | `dad9758` (+ this handoff commit) | The working branch. Every commit below. |
| `claude/shop-ui` | `48a2a65` | The UI PR's branch. The same code as the working branch, without `handoff/`. |
| `claude/physics-fixes` | `7e9aab3` | The physics PR's branch. Simulator changes only, no UI work. Not touched since 2026-10-24. |

Both PR branches merge into `DNiev/ecu-lab` `main` with no conflicts, as of 2026-10-25. **Neither PR is opened.** The session could not open PRs on DNiev's repo, so the user opens them:
- https://github.com/DNiev/ecu-lab/compare/main...CaribouTuning:ecu-lab-edits-by-Caribou-:claude/physics-fixes
- https://github.com/DNiev/ecu-lab/compare/main...CaribouTuning:ecu-lab-edits-by-Caribou-:claude/shop-ui

The PR descriptions are `handoff/pr-physics.md` and `handoff/pr-ui.md`.
- **Merge order:** the physics PR first. `shop-ui` contains it.
- `pr-ui.md` still needs a line for two later commits:
  - the first-run walkthrough (`ff6cba4`);
  - the shop's look (`dad9758`).

  Both are summarised in the commit list below.

## Commits this session (newest first, on `claude/career-mode-game-loop-fqdcoi`)

- `dad9758`: **Shop's own look.**
  - The renderer draws thin technical edge lines over the lit shop.
  - The engine has real finishes: black wrinkle-finish cam covers, black coils, aluminium.
  - The stands are grey; the pegboard is galvanised; drums and chest have no toy colours.
  - This answers the user's complaint that the shop looked like a generic AI render (an Instagram reel). Files: `src/ui/world/stage.js`, `tokens.js`, `shopDetail.js`, `models/engine.js`.
- `ff6cba4`: **First-run walkthrough.** `src/ui/desk/FirstRun.jsx`:
  - six cards over the shop per mode (SANDBOX and CAREER);
  - shown once per mode, remembered in localStorage;
  - hidden under vitest (`import.meta.env.MODE === 'test'`).
- `855ae2c`: **Career only in the shop.**
  - **Deleted:**
    - the outside 3D world: town, driving, road test, drag strip and raceway;
    - the dealer and owned cars;
    - the wardrobe, meets, scrapyard, collectibles, daily goals, decor and achievements;
    - their tests and `docs/career-world.md`.
  - **The dyno is owned from day one**, and old saves gain it.
  - **The story is rewritten** without races (`story.js`, 12 chapters).
  - **The shop objects are the buttons** (`pickAt` in `shopScene.js`). The labels are hidden, but kept for keyboard and screen readers.
  - **The job board** is a whiteboard with work orders, framed like a station.
  - **The shop sign** is painted steel.
  - **Station screens** are fitted with their bezels; the page cannot scroll behind them.
  - **UI text:** no middle dots, no all-caps labels.
- `ad5f21c`: Each station's cart idles on its own program (canvas texture). Carts, stands and the dyno are clickable, with hover.
- `a2d3384`:
  - real engine castings (V banks, sump, timing cover, runners, logs);
  - a concrete floor texture;
  - a real-size dyno cart;
  - carts angled toward their engines;
  - the drum fan at the car's nose;
  - fixtures hidden in the top-down phone view.
- `4d0469f`: **The shop rendered as a real room** (`src/ui/desk/realize.js`):
  - PBR materials keyed to palette colours;
  - LED strip fixtures with shadowed spotlights;
  - ACES tone mapping;
  - an extraction hose on the run stand.
- `9d316c4`, `770a3b0`: **Build bench.**
  - The entry offers a factory or a custom engine (`EngineStart.jsx`).
  - Change engine brings the choice back.
  - The parts are in assembly order, with Next and Back.
  - The whole stand is in frame, on a real engine stand.
- `acc862c`, `06e0bf6`, `aabeb4a`, `091efd0`, `7c3969c`, `e091e3e`, `5a2377b`, `55fd0fc`: the shop UI.
  - It starts in the shop, with the build bench and the run stand.
  - `flow.js` gives the next step.
  - Stations are framed to be used.
  - Upstream `main` is merged in (#81, #79).
  - The road-test and town-flag commits are superseded by `855ae2c`.
- `b325584`, `a6d3b86`, `d55e970`, `1a67563`: physics and docs, which also form the physics PR. Factory fuel tables, molar expansion and the advisor's mixture band, with the fingerprint regenerated.
- `1756195`, `7ff0340`, `a6b3707`: the design pass.
  - The laptop is a native-looking Mac app.
  - The start screen is restored.
  - The colour tokens were reworked.

## Checks at the last full run (`855ae2c`, Node 22)

- **lint, typecheck, build:** clean.
- **`npm test`:** 11 failures, all from changed UI wording and a removed heading.
  - I fixed those tests; the 6 affected files then passed.
  - The suite was not re-run end to end afterwards.
- **`ff6cba4` and `dad9758`:** lint and typecheck only, plus screenshots for `dad9758`. The user was nearly out of usage.
- **First job of the next session:** run the full gates (`npm test`, `npm run lint`, `npm run typecheck`, `npm run build`) on Node 22.

## The beta artifact

https://claude.ai/artifact/F9AkiQxSf31XGpm9Ex4QFP (version 43, built from `dad9758`). It is now shared "Anyone with the link".

To rebuild and republish:

```bash
npx vite build --config handoff/tools/vite.single.config.mjs
python3 handoff/tools/inline.py dist-single ecu-lab-beta.html   # prints bytes and 'unresolved []'
# then publish ecu-lab-beta.html with the Artifact tool to the URL above
```

`handoff/tools/screenshot.mjs` is the headless check:
- **Usage:** `node screenshot.mjs W H steps.mjs file:///abs/path/ecu-lab-beta.html`. `steps.mjs` exports `async (page, shot) => {}`.
- **It renders in software at about 1.5 fps.** Camera moves take several seconds, so wait 10 to 15 s before a station shot, or you catch it mid-move.
- **The shop's invisible place buttons have `pointer-events: none`.** Click them with `locator('[data-spot="dyno"]').evaluate((e) => e.click())`.
- **The first-run cards** need `Skip` clicked first.

## Open items and ideas

- **Brand accent:** the user was asked whether the shop should have one Caribou accent colour on functional points (the active station, the dyno rail). There was no answer yet.
- **Bench layout:**
  - The build bench monitor is still smallish at its camera.
  - The bench's Engine part still shows the old factory-engine dropdown. It was kept on purpose: 7 tests in `build-store` and `characterisation` depend on its overwrite prompt and "Custom build".
- **Models:** they are still simple geometry (rounded boxes, cylinders). The look now comes from the edge lines and the finishes. A next step could be real cam-cover shapes or a run stand built as a test cell.
- **Not verified on a real iPhone:** the page lock (`Desk.module.css`, `:global(html):has(.desk)`) against iOS scroll chaining.
- **`src/ui/world/models/props.js`** still holds unused town props (`makeRollupDoor`, `makeBuilding` callers removed, trees). They are harmless, and can be pruned.
- **Calibrations task:** sourced factory calibrations (AFR done; spark and VE checks) are still in progress on the physics side. See `docs/accuracy.md`.

## Rules the user set

- Nothing adds horsepower.
- Colours only in `tokens.js` and `tokens.css`.
- No model IDs in commits.
- **Commit trailers:**
  - `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
  - `Claude-Session: <session link>`
- **PR bodies** end with the Claude Code footer and the session link.
- Keep the physics and UI PRs separate, and don't touch `claude/physics-fixes` from UI work.
- Don't redesign the dyno.
- **Usage:** the user is often near their weekly limit. Keep runs small unless asked.
