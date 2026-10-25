/**
 * Pops's tips: one real fact about tuning per cup of coffee. Each is checked against what
 * the simulator teaches (docs/accuracy.md); none is a rule of thumb the physics disagrees
 * with. `learn` points at the Learn article that goes further, when there is one.
 */

/** @type {{text: string, topic: string}[]} */
export const TIPS = [
  { topic: 'AFR', text: 'Stoichiometric petrol mixture is 14.7:1, just enough air to burn every drop of fuel. Under load an engine runs richer, around 12.5 to 13, because the extra fuel cools the chamber and protects the pistons.' },
  { topic: 'Spark', text: 'There is a spark advance called MBT, minimum advance for best torque. Past it you gain nothing but cylinder pressure and knock risk. The art is finding it, then backing off if the engine pings.' },
  { topic: 'Knock', text: 'Knock is the unburnt end of the mixture igniting by itself before the flame arrives. It sounds like marbles rattling and it can melt a piston in seconds, so a good tune always leaves a margin.' },
  { topic: 'Boost', text: 'Compressing air heats it, and hot air is thin and knock-prone. An intercooler takes that heat back out, which is why boosted cars run more timing with one.' },
  { topic: 'Injectors', text: 'Fit bigger injectors and the ECU still pulses them for the old size unless you tell it the new flow rate. The engine drowns in fuel until the table is corrected.' },
  { topic: 'MAF', text: 'A mass airflow sensor measures air by how much heat it loses. A new intake changes the pipe around it, so the reading shifts. Rescale the sensor instead of bending the fuel table to hide it.' },
  { topic: 'VE', text: 'Volumetric efficiency is how much air the cylinders really take compared with their size. Around 85 to 95 percent is a good naturally aspirated engine at peak torque; boost and tuned intakes push it past 100.' },
  { topic: 'Power', text: 'Horsepower is torque times rpm divided by 5252. Torque is what you feel; power is how fast you can deliver it. That is why a high-revving engine can be quicker than a torquey one with the same peak.' },
  { topic: 'Mixture', text: 'Too rich and the fuel washes oil off the cylinder walls and fouls plugs. Too lean and it burns hot enough to hurt pistons. Neither shows up on the power graph until it is too late.' },
  { topic: 'E85', text: 'Ethanol has a stoichiometric ratio of about 9.8:1 against petrol’s 14.7, so it needs around 50 percent more fuel by mass, and it resists knock far better. That is why it suits boost, and why it needs bigger injectors.' },
  { topic: 'Octane', text: 'Octane is knock resistance, not energy. Higher octane lets you run more timing or boost before the engine pings; it does not add power on its own.' },
  { topic: 'Gearing', text: 'A short first gear multiplies torque at the wheels, but a tyre can only pass so much force. Past the grip limit the extra torque just spins the wheels.' },
  { topic: 'Launch', text: 'A 60-foot time says more about traction and the launch than about power. Fast cars lose races on the first ten metres.' },
  { topic: 'Turbo', text: 'A turbo only makes boost once exhaust flow spins the turbine fast enough. Lag is the time its shaft takes to accelerate, which is why a small turbo feels quick and a big one feels like a switch.' },
  { topic: 'Dyno', text: 'A chassis dyno reads wheel power, lower than the crank figure by the drivetrain’s losses, roughly 12 to 18 percent. A car’s advertised power is measured at the crank.' },
  { topic: 'Weight transfer', text: 'Accelerating moves weight to the rear axle, which is why rear-drive cars launch better than their weight split suggests. Under braking it goes forward, which is why front brakes do most of the work.' },
  { topic: 'Tyres', text: 'A road tyre holds about 0.8 to 0.9 g. A sticky race slick can hold well over 1.5. Everything a tune does is limited by those four contact patches.' },
  { topic: 'Closed loop', text: 'At light load the ECU watches the oxygen sensor and trims the mixture to stoichiometric. At full throttle it stops listening and trusts the table, which is exactly where a wrong table hurts.' },
  { topic: 'Fuel trims', text: 'Long-term fuel trim is the ECU’s memory of how wrong its fuel table is. A large number is a clue that something about air or fuel metering is off.' },
  { topic: 'Idle', text: 'A big cam keeps both valves open together for longer, so some exhaust leaks back into the intake at idle. That is the lumpy idle you hear, and why wild cams idle high.' },
  { topic: 'Cams', text: 'More cam duration moves the power peak up the rev range and costs low-speed torque and idle quality. There is no free lunch: the engine just breathes best at a different speed.' },
  { topic: 'Rev limit', text: 'The rev limiter is not only for the crankshaft. Past a certain speed valve springs cannot close the valves in time, the valves float, and a piston meets one.' },
  { topic: 'EGT', text: 'Exhaust gas temperature tells you what combustion is doing. Sustained temperatures past roughly 900 to 950 degrees start to damage valves and the turbine.' },
  { topic: 'Wideband', text: 'A wideband oxygen sensor reads lambda: 1.0 is stoichiometric, below 1 is rich, above is lean. Lambda 0.85 is a good rich full-throttle mixture on petrol.' },
  { topic: 'Compression', text: 'Higher compression squeezes more efficiency out of each charge but leaves less margin before knock. It is a trade, not a gift.' },
  { topic: 'Direct injection', text: 'Spraying fuel straight into the cylinder cools the charge as it evaporates, which lets a direct-injection engine run higher compression before it knocks.' },
  { topic: 'Method', text: 'Change one thing at a time and log it. A tune made of five changes at once is a mystery you cannot undo.' },
  { topic: 'Air pump', text: 'An engine is an air pump. Fuel and spark only decide what you do with the air that gets through, which is why airflow comes first in every tuning job.' },
  { topic: 'Safety', text: 'Never tune a car you cannot stop. Check the brakes, the fluids and the tyres before you ask the engine for more.' },
  { topic: 'Backpressure', text: 'Exhaust that is too small chokes the engine at high revs; one that is far too big loses the gas speed that helps scavenge the cylinders at low revs. Bigger is not always better.' },
  { topic: 'Cold starts', text: 'A cold engine runs rich on purpose: fuel does not vaporise well in cold metal, so the ECU adds extra until things warm up.' },
];

/** The tip for a given day and cup. @param {number} n */
export const tipFor = (n) => TIPS[((n % TIPS.length) + TIPS.length) % TIPS.length];
