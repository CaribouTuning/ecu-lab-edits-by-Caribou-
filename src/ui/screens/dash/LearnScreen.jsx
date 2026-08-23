/**
 * HOME > Learn How It Works.
 *
 * The plain-language guide: sixteen collapsible articles, in reading order, from
 * "an engine is an air pump" to what tuning cannot fix.
 *
 * It is the only screen in the app with NO state of its own and no store read —
 * every word of it is constant — so it is memoised. That matters here more than
 * anywhere: it is the largest block of markup on HOME, it sits next to the live
 * engine panel, and without the memo React would walk all sixteen articles twenty
 * times a second to produce exactly the same output. `active` and `onToggle` are its
 * only props, and `onToggle` is stable (see `toggleDashSection` in EcuLab.jsx), so
 * the default shallow comparison is enough.
 */

import { BookOpen } from 'lucide-react';
import React from 'react';

import { BuildSection } from '../../components/BuildSection.jsx';
import { ExpandableInfo } from '../../components/ExpandableInfo.jsx';

import styles from './LearnScreen.module.css';

/**
 * @param {object} props
 * @param {boolean} props.active whether this is HOME's open section
 * @param {(section: string) => void} props.onToggle opens or closes a HOME section
 * @returns {React.ReactElement}
 */
function LearnScreenInner({ active, onToggle }) {
  return (
    <BuildSection
      active={active} onClick={() => onToggle('learn')}
      icon={BookOpen} label="Learn How It Works"
      sub="Plain-language guide to engine tuning"
    >
      <div className={styles.intro}>Read in order. Each explains a piece of what the live engine is doing right now.</div>

      <div className={`${styles.part} ${styles.partFirst}`}>PART 1 · FUNDAMENTALS</div>

      <ExpandableInfo title="1. The whole thing in one paragraph">
        An engine is an air pump. However much air it swallows decides how much fuel can be burned, and burning fuel is what makes power. The ECU's entire job is to measure the air, add the right amount of fuel, and light it at the right moment. Tuning is adjusting those last two decisions.
        <br /><br />Everything else in this app — cams, turbos, exhaust diameter, compression — exists to change how much air gets in, or how much of that fuel's energy you can safely extract.
      </ExpandableInfo>

      <ExpandableInfo title="2. Volumetric efficiency — the master number">
        VE is how completely a cylinder fills compared to its own swept volume. At 100% VE the cylinder takes in exactly its displacement worth of air at the pressure available. Naturally aspirated engines typically peak around 85–100%; the peak sits at the RPM where the intake and exhaust tuning line up best, which is also where peak torque lands.
        <br /><br />VE falls off at high RPM because there simply is not enough time to fill the cylinder, and it falls at very low RPM because gas velocity is too low to help. That curve is the shape of your torque curve.
        <br /><br /><b className={styles.em}>Every hardware choice on BUILD moves this table</b> — cam duration slides the peak up or down the RPM range, headers and exhaust add flow up top, bore/stroke ratio biases the whole curve. That is why VE is where hardware becomes visible.
      </ExpandableInfo>

      <ExpandableInfo title="3. Lambda — the only mixture number that matters">
        Gasoline burns completely at about 14.7 parts air to 1 part fuel. Divide any AFR by its fuel's stoichiometric ratio and you get <b className={styles.em}>lambda</b>: 1.00 is exactly complete combustion, below 1 is rich, above 1 is lean.
        <br /><br />Lambda matters because it means the same thing on every fuel. E85 is stoichiometric at about 9.8:1, so 12.5:1 means something completely different on E85 than on pump gas — but lambda 0.85 is lambda 0.85 on both.
        <br /><br />Best power is slightly rich: around <b className={styles.em}>lambda 0.87</b> naturally aspirated, and richer still under boost — near 0.83 — because the extra fuel evaporating cools the charge and buys knock margin. Leaner than that under load and you lose power while raising both knock risk and exhaust temperature.
      </ExpandableInfo>

      <ExpandableInfo title="4. Why timing makes torque, and where it stops">
        Fuel does not explode instantly — it burns over a few milliseconds. So the spark fires <i>before</i> top dead center, timed so peak cylinder pressure arrives around 16° after TDC, where the crank has the best leverage.
        <br /><br />Too retarded and you are still burning while the piston runs away: wasted energy, hot exhaust. Too advanced and pressure peaks while the piston is still rising, fighting the crank and building the heat and pressure that cause knock. The best point is <b className={styles.em}>MBT</b> — minimum spark for best torque. Past MBT you gain almost nothing and risk everything.
        <br /><br />MBT moves: higher RPM needs more advance because there is less time for the burn; higher load needs less because the denser charge burns faster.
      </ExpandableInfo>

      <ExpandableInfo title="5. Knock — what actually destroys engines">
        Knock is the end gas — the mixture farthest from the spark plug — igniting on its own from heat and pressure before the flame front reaches it. Two flame fronts collide and the pressure spike hammers the piston and ring lands.
        <br /><br />It is driven by <b className={styles.em}>trapped charge mass</b>, not just boost: more air in the cylinder means higher peak pressure. That is why a big cam that breathes better also needs a little less timing, and why the same tune that is safe at part throttle knocks at wide open.
        <br /><br />What makes it worse: more timing, more boost, more compression, hotter intake air, leaner mixture, lower octane. What buys margin: higher octane, richer mixture, cooler charge (intercooler), aluminium head, less compression.
        <br /><br /><b className={styles.em}>How much is too much?</b> Tuners treat anything sustained above about 2° of retard as damaging, not as an operating point. Zero is the target.
      </ExpandableInfo>

      <div className={styles.part}>PART 2 · WHAT THE ECU CALCULATES</div>

      <ExpandableInfo title="6. The control loop, in order">
        Thousands of times a minute, the ECU runs the same sequence:
        <br /><br />read sensors → calculate cylinder air mass → decide open or closed loop → work out required fuel mass → convert that to an injector pulse width → apply fuel trims → look up ignition timing → check for knock → retard if needed → fire injectors and coils → update learned values.
        <br /><br />Everything you edit in this app is one of the lookups inside that loop. The ECU is not deciding anything creative — it is doing arithmetic against your tables, very fast.
      </ExpandableInfo>

      <ExpandableInfo title="7. Step 1 — how much air is in the cylinder?">
        This is the ideal gas law, and it is the foundation of every speed-density calculation:
        <br /><br /><span className={styles.formula}>ρ = MAP ÷ (R × T)</span><br />
        <span className={styles.formula}>airCharge = VE × V_cylinder × ρ</span>
        <br /><br />MAP is manifold pressure (about 101 kPa at wide open naturally aspirated, higher with boost, down to ~20 kPa at idle). R is the gas constant for air, 287 J/(kg·K). T is charge temperature.
        <br /><br />Two consequences worth internalising. <b className={styles.em}>Boost raises MAP</b>, so it directly multiplies air mass. And <b className={styles.em}>compressing air heats it</b>, which lowers density and gives some of that gain back — which is the entire reason intercoolers exist. You can watch both in the datalog's MAP and IAT columns.
      </ExpandableInfo>

      <ExpandableInfo title="8. Step 2 — how much fuel does that need?">
        Fuel mass follows directly from air mass and your lambda target:
        <br /><br /><span className={styles.formula}>fuelMass = airCharge ÷ (λ × stoichRatio)</span>
        <br /><br />Nothing is fudged here. Because E85's stoichiometric ratio is 9.8 instead of 14.7, the same lambda target automatically demands about 1.5× the fuel mass — it falls straight out of the chemistry, which is why E85 needs a much bigger fuel system for the same power.
      </ExpandableInfo>

      <ExpandableInfo title="9. Step 3 — pulse width, and the hard time limit">
        The ECU never commands "fuel" — it commands a number of milliseconds. That comes from the required fuel mass and the injector's flow rating, plus deadtime (the ~1 ms an injector takes to physically open):
        <br /><br /><span className={styles.formula}>PW = fuelMass ÷ (injectorCC × density ÷ 60000) + deadtime</span><br />
        <span className={styles.formula}>cycleTime = 120000 ÷ RPM&nbsp;&nbsp;(ms per 720° cycle)</span><br />
        <span className={styles.formula}>duty% = PW ÷ cycleTime × 100</span>
        <br /><br />A four-stroke injects once every two crank revolutions, so at 7500 RPM there are only 16 ms in a cycle. An injector needing 15 of them is at 94% duty. Past about 90% there is no time left, and the mixture goes lean <i>no matter what your AFR table says</i>. This is a physical wall, not a calibration choice.
        <br /><br /><b className={styles.em}>Critical:</b> the ECU calculates that pulse width for the injector size it has been <i>told</i> is fitted. Fit bigger injectors without updating the ECU Injector Size on FUEL and every pulse delivers proportionally more fuel than intended — the engine runs rich everywhere regardless of your tables.
      </ExpandableInfo>

      <ExpandableInfo title="10. Step 4 — open loop, closed loop, and fuel trims">
        At part throttle the ECU runs <b className={styles.em}>closed loop</b>: it reads the oxygen sensor and corrects fuelling in real time. <b className={styles.em}>Short term fuel trim (STFT)</b> is that instant correction; <b className={styles.em}>long term fuel trim (LTFT)</b> is what it has learned and stored over time. Watch both on the HOME gauges — fit an intake without rescaling the MAF and you can see STFT swing, then hand off to LTFT as it learns.
        <br /><br />Above roughly 85 kPa the ECU switches to <b className={styles.em}>open loop</b> and stops listening to the O2 sensor entirely, following your tables blind. That is deliberate — at wide open throttle you want a rich power mixture, not stoichiometric.
        <br /><br />It is also why <b className={styles.em}>wide open throttle is where a bad tune bites</b>. Errors that closed loop quietly papers over at cruise pass straight through at full load.
      </ExpandableInfo>

      <ExpandableInfo title="11. Step 5 — from combustion to torque at the wheels">
        Fuel energy becomes indicated work on the piston, then the engine pays its own bills. The work is not estimated — the simulator integrates one cylinder through the closed part of its cycle, two crank degrees at a time:
        <br /><br /><span className={styles.formula}>dQ = Wiebe burn fraction × fuel energy</span><br />
        <span className={styles.formula}>dp = (γ−1)/V × dQ − γ × p/V × dV</span><br />
        <span className={styles.formula}>IMEP = ∮ p dV ÷ V_cyl</span><br />
        <span className={styles.formula}>PMEP = exhaust pressure − intake pressure</span><br />
        <span className={styles.formula}>BMEP = IMEP − friction − PMEP</span><br />
        <span className={styles.formula}>torque = BMEP × Vd ÷ 4π</span>
        <br /><br /><b className={styles.em}>Why integrate instead of multiply?</b> Because spark timing does not scale the work done — it moves <i>when</i> the heat arrives relative to a piston that is somewhere different at every crank angle. Burn too early and rising pressure fights the piston still coming up. Too late and the burn happens into a cylinder already expanding. MBT is where those two losses balance, and it falls out of the integration rather than being looked up.
        <br /><br />Raising compression makes power the honest way here: a smaller clearance volume means a longer expansion, and the integral simply comes out bigger.
        <br /><br /><b className={styles.em}>Pumping loss</b> is the one people forget: at part throttle the engine is working hard to breathe against a closed throttle, and that shows up as wasted work. Under boost it flips — if the turbine is not choking the exhaust harder than the compressor is filling the intake, the gas-exchange loop can actually hand work back.
      </ExpandableInfo>

      <div className={styles.part}>PART 3 · THE TUNING PROCESS</div>

      <ExpandableInfo title="12. The loop: change → pull → read → adjust">
        This is the whole method, and it is not a simplification:
        <br /><br /><b className={styles.em}>1. Change one thing.</b> One table region, one hardware item. Change three and you will not know which one mattered.
        <br /><br /><b className={styles.em}>2. Run a pull.</b> Nothing is known until it is measured. There is no preview in this app on purpose.
        <br /><br /><b className={styles.em}>3. Read the log first.</b> Before looking at the power number, read the Pull Log and check the datalog for gaps between commanded and actual. Power that came with 6° of knock retard is not power you keep.
        <br /><br /><b className={styles.em}>4. Adjust and repeat.</b> The VS. LAST PULL line tells you whether the change helped. Small logged steps beat big guesses, every time.
      </ExpandableInfo>

      <ExpandableInfo title="13. A worked example — first turbo tune">
        Fit a turbo on BUILD and run a pull without touching anything. It will score terribly, and here is why: a factory naturally-aspirated calibration has no real tuning above 101 kPa, so the boost rows are just a flat continuation of the wide-open-throttle row — far too much timing and far too lean for the cylinder pressure you have just created.
        <br /><br /><b className={styles.em}>Read the log.</b> It will report knock across most of the range, with the RPM band and how many degrees the ECU pulled.
        <br /><br /><b className={styles.em}>Fix the spark first.</b> On SPARK, pull the 150 and 200 kPa rows down. Roughly 2° per 20 kPa of extra pressure is a sane starting point. Pull again.
        <br /><br /><b className={styles.em}>Then the mixture.</b> On FUEL, richen those same rows toward lambda 0.83 (about 12.2:1). Pull again — you should see knock margin improve as well, because a richer charge resists knock.
        <br /><br /><b className={styles.em}>Then check the fuel system.</b> If the log reports injectors maxed, that is hardware: fit bigger injectors and set the matching ECU Injector Size, or ask for less boost. Nothing in the tables can create fuel that the injectors have no time to deliver.
      </ExpandableInfo>

      <ExpandableInfo title="14. How to read the datalog columns">
        The datalog is where diagnosis actually happens. Read it in pairs:
        <br /><br /><b className={styles.em}>Timing: asked → got</b> — if they differ, the ECU overrode you. That is knock retard, and the gap is how far past the limit your table was.
        <br /><br /><b className={styles.em}>Mixture: asked → got</b> — if actual is not what you commanded, the cause is upstream of the fuel table: usually MAF scaling or injectors out of duty. Do not "fix" it by editing fuel cells; fix the cause.
        <br /><br /><b className={styles.em}>Airflow</b> — around 200 g/s is typical at redline for an engine near 300 hp, which is a quick sanity check on whether your VE table is plausible.
        <br /><br /><b className={styles.em}>Injectors</b> — duty above 90% is the wall. <b className={styles.em}>Heat</b> — sustained EGT above ~980°C cooks turbines and valves; it rises hard with retarded timing and lean mixtures, and a rich mixture is what pulls it back down.
      </ExpandableInfo>

      <ExpandableInfo title="15. What tuning can fix, and what it can't">
        <b className={styles.em}>Calibration faults — tables fix these completely:</b> knock (pull timing), lean or rich mixture (AFR table), MAF drift after an intake change (MAF scalar), injector mismatch (set the ECU injector size). Fix the cause and the score returns to 100.
        <br /><br /><b className={styles.em}>Physical limits — no table touches these:</b> injectors out of duty cycle, valve float, a compressor past its efficient range, a cam that has moved the powerband somewhere you did not want. The Pull Log always names both routes when you hit one: change the hardware, or ask less of it.
        <br /><br />Knowing which kind of problem you are looking at is most of what separates a tuner from someone guessing at numbers.
      </ExpandableInfo>

      <ExpandableInfo title="16. Habits that keep engines alive">
        Target zero knock, not "acceptable" knock. Stay on the rich side of best power until you have confirmed margin. Never chase a number you have not measured. When something looks wrong, find the cause rather than compensating for it downstream — a MAF error corrected by bending the AFR table will be wrong again the moment load changes.
        <br /><br />And watch engine health on HOME. Damage here accumulates the way it does in reality: a few destructive pulls, not one dramatic failure.
      </ExpandableInfo>
    </BuildSection>
  );
}

export const LearnScreen = React.memo(LearnScreenInner);
