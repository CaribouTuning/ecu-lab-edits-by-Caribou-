# Career world

CAREER is a small pixel-art 3D town you walk and drive around. It sits on top of the
existing career loop (customers, jobs, grading, money, reputation); it does not replace it.
The simulator is untouched: nothing here adds horsepower, and no part, outfit or place
changes a physics number. The fingerprint is unchanged.

## The loop

1. **Morning.** Customers pull into the shop. Walk to a car, open the hood, inspect it,
   roll it onto a lift and open the laptop: the real ECU Lab screens, graded as before.
2. **Hand it back.** Each hand-back moves the clock on (morning, midday, evening, night)
   and the light with it. Night opens the car meet.
3. **Spend.** Cash and reputation open the town (see below): instruments at Gearhead
   Supply, courses at the Academy, clothes at Threads, a project car of your own at the
   dealer, parts from the scrapyard, decor for the shop.
4. **Prove it.** Take your own car to the drag strip: rivals are real preset cars run
   through the same quarter-mile model as the DRAG screen. Or show it at the meet, judged on
   build, tune and style.
5. **Next day.** Goals, stock and customers reset from the save and the day number.

## The town

| Place | Opens at rep | What it is for |
|---|---|---|
| Your shop | 0 | Customers, laptop, dyno |
| Gearhead Supply | 0 | Lifts, dyno, wideband, ethanol analyser |
| Tuning Academy | 0 | Courses that unlock ECU pages |
| Pops' Diner | 0 | A real fact with every cup |
| Fuel stop | 0 | 91, 93, 100 or E85 for your own cars |
| Threads | 5 | Clothes (looks only) |
| Sparky's Scrapyard | 10 | Dig for parts and cash |
| Drag strip | 15 | Race rivals with your own car |
| Caribou Motors | 25 | Buy a car of your own |
| Car meet | 40, night | Build + tune + style judging |

## What teaches what

Every place carries a `learn` line (`src/ui/world/locations.js`); the idea behind each:

- **Driving** uses a real bicycle model with a tyre friction circle. Engine torque comes
  from `simulateSweep` on the car's actual build, gearing and tyres from the drag-car data.
  Tests hold it to the drag strip's 0-60 (14%), top speed (4%), braking and cornering limits.
- **Own cars** have real specs: wheel hp from the sweep, 0-60 and quarter mile from the
  drag model. Swap tyres, gearing, weight, fuel and watch the numbers move.
- **Race slips** explain the run: reaction, 60 ft, traction, gearing.
- **Scrapyard** teaches salvage: what can be reused and what has been cooked.
- **Meet** judging is build (power per tonne), tune (`computeTuningScore` and engine
  health) and style (looks and outfit). A sloppy tune cannot be saved by clothes.
- **Wardrobe and decor** are cosmetic. They affect only the meet's style score.

## Code map

- `src/ui/world/`: the 3D world. `runtime.js` owns stage, input, player, level and
  driven car; `levels/` build the garage, town, interiors and strip; `models/` hold
  procedural people, cars, props and buildings; `driving.js` and `vehicle.js` are the car
  physics glue; `sfx.js` and `driveSound.js` are sound.
- `src/ui/career/`: pure functions of the save (owned cars, races, meet, daily goals,
  junk, decor, medals). No WebGL, fully unit tested.
- Colours live only in `src/ui/tokens.js` (`world` palette); a test enforces it.
- three.js is lazy-loaded: the tuning app's first download does not include it.
  Static scenery is merged to one mesh per material (`mergeStatic`) to keep draw calls low
  on phones.

## Fallbacks and settings

- No WebGL, a lost context, or `view: 'flat'` in settings: the old flat shop is used.
  Settings has a "use the flat shop" switch.
- Pixel size (chunky, normal, fine), units, engine sound, touch controls, hints, camera
  shake (off by default under reduced motion).
- Phone landscape: on-screen stick and buttons; panels dock to the side.

## Test hooks

With `window.__ECU_E2E__` set: `__ecuWorld`, `__ecuUpdate`, `__ecuCareer`.
