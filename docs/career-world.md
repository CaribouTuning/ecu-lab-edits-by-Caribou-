# Career world

CAREER is a small pixel-art 3D town you walk and drive around. It sits on top of the
existing career loop (customers, jobs, grading, money, reputation); it does not replace it.
The simulator is untouched: nothing here adds horsepower, and no part, outfit or place
changes a physics number. The fingerprint is unchanged.

## The loop

1. **Morning.** Customers pull into the shop. Walk to a car, look under its bonnet, and open
   the laptop at the desk: the real ECU Lab screens, graded as before.
2. **Hand it back.** Each hand-back moves the clock on (morning, midday, evening, night)
   and the light with it. Night opens the car meet.
3. **Your own car.** Every new shop is handed Pops's old hatchback: a 1.6 two-valve four that
   makes whatever the simulator says such an engine makes (not much). Fit parts at the shop's
   bench or Gearhead Supply, swap engines, dress it up, buy more cars at Caribou Motors (from
   $900).
4. **Prove it.** Drive to the drag strip (north, off the highway) or Caribou Raceway (south).
   Each has a ladder of rivals with a short story: beat them in order. Rematches pay a quarter.
5. **Next day.** Goals, stock and customers reset from the save and the day number.

## The town

A real town to drive round, not a square: downtown's main street with the shops, a grid of
avenues and streets, two winding residential drives lined with houses, an industrial estate,
and a ring highway with traffic. Its plan is data (`levels/townPlan.js`): the roads, the strip
and the circuit are centre lines with widths, which the level draws as ribbons (one mesh of
tarmac for the whole town), the race logic drives on, and the minimap draws again small.

| Place | Opens at rep | What it is for |
|---|---|---|
| Your shop | 0 | Customers, laptop, dyno, the parts bench |
| Gearhead Supply | 0 | Lifts, dyno, wideband, ethanol analyser; parts |
| Tuning Academy | 0 | Courses that unlock ECU pages |
| Pops' Diner | 0 | A real fact with every cup |
| Caribou Motors | 0 | Project cars from $900 |
| Threads | 0 | Clothes (looks only) |
| Fuel stop | 0 | 91, 93, 100 or E85 for your own cars |
| Main Street Drags | 0 | The quarter mile: ten rivals, the Main Street Kings |
| Caribou Raceway | 0 | A kilometre of corners: seven rivals, the club ladder |
| Sparky's Scrapyard | 3 | Dig for parts and cash |
| Car meet | 10, night | Build + tune + style judging |

## Racing

Races are driven, live, on the same vehicle model as the rest of the world. Nothing is
replayed and nobody is handed a time.

- **Rivals** (`career/races.js`) are real cars: an engine from the swap catalogue or a factory
  preset, in a body, perhaps with tyres or gearing changed. Their torque is measured on the
  simulator like yours. The ladders are ordered by what the cars really do: the starter car
  beats the first drag rival and not the second (`tests/race.test.js`).
- **AI** (`world/race.js`) steers by pure pursuit along the racing line and sets its speed
  from the corners: v = sqrt(mu g R), with braking zones worked back from each corner. A
  rival's skill is the share of the grip they dare use.
- **The drag strip** is a pro tree: the ambers, then green 0.4 s later. Hold the throttle past
  half before the green and the car leaves: red light, race lost. Reaction is timed from the
  green; ET from when the car leaves the line to when its nose crosses the quarter. The time
  slip explains the run (`sliptalk`).
- **The circuit** is two laps from a standing start: five reds, then lights out. A lap only
  counts if the car went all the way round. Drive onto the circuit on your own and the
  practice clock times every lap.
- **Engine swaps** (`career/engines.js`) come with their donor's ECU, on its factory
  calibration; the old engine's bolt-ons go with the old engine, and a heavier engine makes
  a heavier car. Engines described by their figures are calibrated from the physics
  (`customEnginePatch`), exactly as the BUILD screen does for a player's own engine.

## Driving

The car model is the same bicycle model with a tyre friction circle, plus what keeps a road
car on the road:

- the rear tyres peak at a smaller slip angle and the front loses a little lateral grip to load
  transfer, so at the limit the nose runs wide (understeer) instead of the tail coming round;
- brake-force distribution: the rear brakes never ask more of the rear tyres than their load,
  lightened by the braking, lets them give;
- stability control, switched off with traction control: it compares the yaw rate with the
  one the steering asks for and takes away any excess, and cuts the engine while the rear is
  sliding;
- a steering lock that tracks the tightest turn the grip allows, as a driver's hands would.

Full lock at any speed pushes wide; braking hard into a turn slides wide at worst; let go of
the wheel and the car straightens. With the aids off and the handbrake up the tail can still
be thrown out (`tests/driving.test.js`).

## Chassis tuning

Between the engine's torque and the road there is a chassis, and it is tuned like the engine:
`career/chassis.js` lists every control, the part that opens it, and what it changes in the
vehicle model. A stock car lets you set tyre pressure and brake bias; everything else opens with
a part from Gearhead Supply or the shop bench.

| Control | Part | What it moves |
|---|---|---|
| Spring rates, anti-roll bars | Coilovers, anti-roll bars | How lateral weight transfer is shared front to rear: the balance |
| Ride height | Sport springs, coilovers | Centre-of-gravity height: weight transfer |
| Tyre pressure | none | Peak grip (best near 32 psi), response, rolling drag |
| Camber | Camber arms | Cornering grip against braking and traction grip |
| Differential lock | Limited-slip diff | Traction on the driven axle through a corner |
| Final drive, close ratios | Gear sets | Torque multiplication and gear spacing |
| Sequential gearbox | Dog-box | Shift time |
| Brake bias | none | How braking is shared between the axles |

The CHASSIS tab measures the setup on the vehicle model (skidpad grip, which end lets go first,
100-0 km/h) so a change shows in a number. None of it touches the simulator or the torque curve.

## First person

V in a car, or the CAM button, puts the camera at the driver's eyes. The car you drive is built
with an interior (`models/interior.js`): a dash with a hooded binnacle and working dials, a
three-spoke wheel that turns with the steering, arms and hands on it, A-pillars, a roof
lining and a mirror. The roof, glass and body pillars are hidden from inside; the cabin's
panels are drawn double-sided. Other cars are built without an interior, to keep draw calls down.

## How it looks and plays

The reference is the handheld RPGs of the DS era: a 3-D world of simple textured shapes
seen from a fixed three-quarter camera, with the people drawn as 2-D pixel-art sprites.
That is what keeps it reading as pixel art rather than a world of blocks.

- **People and the dog are sprites** (`models/sprite.js`, `models/person.js`). Each look
  (hair, hat, top, trousers, shoes, glasses, extras, skin, mood) is painted texel by texel
  into a sheet: front, back and side views; standing, two walking steps, cheer, wave, sit,
  think and point. The card always faces the camera, and the view (front, back, side or
  mirrored side) follows where the camera is relative to the way the person faces, so a
  character turns as they walk. A blob of shadow sits under the feet; the time of day tints
  them, so night is blue for them too.
- **Every object does one thing.** In the shop: the board by the door (customers), the desk
  (the laptop, which asks which car when more than one is in), a car's bonnet at its nose and
  its driver's door on its left (inspect, road test), the bench (parts), the calendar, the
  locker, the bell. Each spot is a few steps from the next, so one press of E only ever means
  one thing. Customers' cars come and go through the door, round the desk.
- **Walking** is a fixed three-quarter top-down view. **Driving** is a chase camera behind
  the car that swings with the heading, looks down the road and widens with speed.
- **Talking** happens in a text box along the bottom: the speaker's name on a tab, the line
  typed out with a blip, an arrow when it is done, and choices on the last line. Pops
  greets you in the garage on day one and walks out to his diner; a customer explains
  what the car does when it is on the lift, and says how it went when they collect it (the
  box tallies the checks and the money); every clerk says hello before their counter
  opens. Conversations queue; E, Space, Enter or a tap moves them on; Escape ends one.
- **The phone** (customers, upgrades, wardrobe, cars...) stays a modern phone screen on
  purpose: it is the tuner's phone, and the tuning screens behind it are the real tool.
- **Look.** Brick, cinder block, siding, stucco and shingle textures at true scale; leafy
  round trees, flower boxes, oil stains and pegboards. Rooms are lit softly with faint
  shadows; outdoors has a sun. One full-screen pass outlines every edge with a single
  pixel of ink, fading out in the distance. Cars get door cuts, shoulder lines, a lit
  roof panel and windscreen glints.

## What teaches what

Every place carries a `learn` line (`src/ui/world/locations.js`); the idea behind each:

- **Driving** uses a real bicycle model with a tyre friction circle. Engine torque comes
  from `simulateSweep` on the car's actual build, gearing and tyres from the drag-car data.
  Tests hold it to the drag strip's 0-60 (14%), top speed (4%), braking and cornering limits.
- **Own cars** have real specs: wheel hp from the sweep, 0-60 and quarter mile from the
  drag model. Swap tyres, gearing, weight, fuel and watch the numbers move.
- **Race slips** explain the run: reaction, 60 ft, traction, gearing.
- **Lap charts** explain a circuit race: grip sets the corner speed, consistency beats one
  heroic corner, and grass has about half the grip of tarmac.
- **Engine swaps** teach the oldest lesson in the trade, more air through a bigger engine,
  and its cost: weight, and a calibration that came from somebody else's car.
- **Scrapyard** teaches salvage: what can be reused and what has been cooked.
- **Meet** judging is build (power per tonne), tune (`computeTuningScore` and engine
  health) and style (looks and outfit). A sloppy tune cannot be saved by clothes.
- **Wardrobe and decor** are cosmetic. They affect only the meet's style score.

## Code map

- `src/ui/world/`: the 3D world. `runtime.js` owns stage, input, player, level and
  driven car; `levels/` build the garage, town and interiors (`townPlan.js` and `roadNet.js`
  are the town as data, `venue.js` the strip's tree, the circuit's lights and live races);
  `race.js` is the AI and the race clocks; `models/` hold
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
