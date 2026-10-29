/**
 * The career's story: Pops's messages, from your first customer to Master tuner.
 *
 * Your dad, Ray, was a master tuner. This was his shop. He died when you were a kid, and
 * his brother, your uncle Pops, kept the keys and ran the diner across town. Now he has
 * reopened the shop for you, and he is teaching you the trade the way Ray taught him: by
 * text and by email, one lesson at a time, while you work.
 *
 * The story is a line of chapters. Each opens with an email from Pops that teaches one
 * real thing about tuning, and names a goal the shop already has (jobs done well, a
 * training course, an engine built to order, a reputation reached). Meet it and Pops texts you, pays
 * a little towards the next step, and the next chapter opens. The last one ends it: you
 * are a master tuner, and the shop is Ray's again.
 *
 * Every lesson is something the simulator already teaches, in its own words, and says
 * where it comes from: the Tuning Course, Pops's tips (tips.js, checked against
 * docs/accuracy.md), and the published sources in the Learn guide (articles 21, 22, 33).
 * The procedural customers carry on alongside, and once the story is finished, without end.
 *
 * Pure functions from one save to the next, like the rest of the career. The story's own
 * state is `c.saga`: which chapter is open, and which messages have been read.
 */

import { tipFor } from './tips.js';

/** @typedef {import('./shop.js').Career} Career */

/**
 * @typedef {object} Lesson
 * @property {string} title
 * @property {string[]} points
 * @property {string[]} sources where it comes from
 * @property {string} [course] the Tuning Course lesson that goes further
 */

/**
 * @typedef {object} Chapter
 * @property {string} id
 * @property {string} title
 * @property {string} subject the email's subject
 * @property {string[]} body the email
 * @property {Lesson} lesson
 * @property {string} goal what to do, in a line
 * @property {(c: Career) => boolean} met
 * @property {string} done Pops's text when it is
 * @property {number} reward
 */

const passed = (/** @type {Career} */ c) => (c.history ?? []).filter((h) => h.verdict === 'pass').length;
const built = (/** @type {Career} */ c) => (c.history ?? []).some((h) => h.verdict === 'pass' && h.built);

/** @type {Chapter[]} */
export const CHAPTERS = [
  {
    id: 'keys', title: 'The keys', subject: 'Ray’s shop is yours',
    body: [
      'Kid, it’s your uncle. I know you’ve wondered why the shop stayed shut all these years. After your dad passed I couldn’t bring myself to turn the key. Ray was the best tuner this town ever had, and I just fried eggs.',
      'You keep asking how he did it. So here it is: the shop is yours. The laptop on the desk is his, the job board is on the wall, and his dyno is still in the bay. I’ll text you what he taught me, one thing at a time. Do the work, and you’ll know what he knew.',
      'Start small. Take a customer off the board, find out what’s wrong, fix it, and hand it back right.',
    ],
    lesson: {
      title: 'An engine is an air pump',
      points: [
        'Power comes from burning fuel, and fuel can only burn with air. Everything a tune does is about getting air in, matching the fuel to it, and lighting it at the right time.',
        'How full a cylinder gets, against how full it could be, is volumetric efficiency (VE). Around 85 to 95 percent is a good naturally aspirated engine at peak torque.',
      ],
      sources: ['The Tuning Course: “An engine is an air pump”', 'Heywood, Internal Combustion Engine Fundamentals (Learn, article 21)'],
      course: 'air-pump',
    },
    goal: 'Hand back one customer’s car with the job done.',
    met: (c) => passed(c) >= 1,
    done: 'That’s one. Your dad’s first job was a carburettor he set too rich. You did better. Here’s a little for the till.',
    reward: 200,
  },
  {
    id: 'fuel', title: 'Fuel first', subject: 'What Ray said about fuel',
    body: [
      'Your dad used to say a tuner earns his money in the fuel table. Get the mixture wrong and nothing else you do matters.',
      'Do a few more jobs. Watch the air-fuel ratio in every log you pull.',
    ],
    lesson: {
      title: 'The mixture',
      points: [
        'Petrol burns completely at about 14.7 parts air to 1 of fuel: stoichiometric, lambda 1. At light load the ECU holds it there with the oxygen sensor.',
        'Under full load an engine runs richer, around lambda 0.83 to 0.87 (about 12.5 to 13:1), because the extra fuel cools the chamber and protects the pistons.',
        'Too rich washes oil off the bores and fouls plugs; too lean burns hot enough to hurt a piston. Neither shows on a power graph until it is too late.',
      ],
      sources: ['The Tuning Course: “FUEL: the mixture you ask for”', 'Pops’s tips: AFR, Mixture', 'Learn, article 34: full-throttle mixture checked against real engines'],
      course: 'fuel',
    },
    goal: 'Do three customer jobs well.',
    met: (c) => passed(c) >= 3,
    done: 'Three clean jobs. People are talking about the new kid at Ray’s place. Keep it up.',
    reward: 300,
  },
  {
    id: 'spark', title: 'Learn the spark', subject: 'Timing, and why it is not more',
    body: [
      'You can’t touch the ignition tables until the Academy trains you on them. Ray did the same course, years ago. Go and do it.',
    ],
    lesson: {
      title: 'MBT: the best spark is not the most spark',
      points: [
        'The spark fires before the piston reaches the top, so the flame has burned half the charge just after it, about 8 to 10 degrees after top dead centre. That is MBT, minimum advance for best torque.',
        'Earlier than that fights the piston on its way up; later wastes the push. Past MBT you gain nothing but cylinder pressure and knock risk.',
      ],
      sources: ['The Tuning Course: “SPARK: when to light it”', 'Heywood, the 8–10° ATDC MFB50 optimum (Learn, articles 4 and 21)'],
      course: 'spark',
    },
    goal: 'Take the Ignition timing course at the Tuning Academy.',
    met: (c) => (c.trained ?? []).includes('spark'),
    done: 'Ignition timing. Now you can hurt an engine properly. Be careful with it.',
    reward: 300,
  },
  {
    id: 'measure', title: 'Measure it', subject: 'Ray’s dyno',
    body: [
      'Your dad never guessed. Every change went on that dyno before the car went home, and he wrote the number on the ticket.',
      'Do it his way: change one thing, pull, read the log, then the next thing.',
    ],
    lesson: {
      title: 'Change one thing, measure it',
      points: [
        'The habit that matters most: change one thing at a time and measure it, and put reliability ahead of the peak number (Driven Racing Oil, “A Complete Guide to High-Performance Engine Tuning”).',
        'A chassis dyno reads wheel power, lower than the crank figure by the drivetrain’s losses, roughly 12 to 18 percent. A car’s advertised power is measured at the crank.',
      ],
      sources: ['The Tuning Course: “Your first pull”, “Pull again and prove it”', 'Driven Racing Oil guide (Learn, article 33)', 'Pops’s tips: Dyno'],
      course: 'first-pull',
    },
    goal: 'Do five customer jobs well.',
    met: (c) => passed(c) >= 5,
    done: 'Five. I found his old ticket book in the drawer. Your numbers look like his.',
    reward: 300,
  },
  {
    id: 'knock', title: 'Knock', subject: 'The noise that ends engines',
    body: [
      'More timing makes more power, right up until it doesn’t. The Academy runs a knock control course. Take it before you get greedy.',
    ],
    lesson: {
      title: 'What knock is',
      points: [
        'Knock is the unburned end of the mixture lighting itself before the flame reaches it. It sounds like marbles in a can, and it can melt a piston in seconds.',
        'The simulator models it the way the literature does: the end gas’s ignition delay, from Douaud and Eyzat (SAE 780080), added up through the cycle with the Livengood–Wu integral. When the sum reaches one, it knocks.',
        'Octane is knock resistance, not energy. A good tune leaves a margin to the knock limit.',
      ],
      sources: ['Learn, articles 5 and 21: Douaud & Eyzat SAE 780080; Livengood & Wu (1955)', 'Pops’s tips: Knock, Octane', 'The Tuning Course: “Change one thing, pull again”'],
      course: 'one-thing',
    },
    goal: 'Take the Knock control course.',
    met: (c) => (c.trained ?? []).includes('knock'),
    done: 'Good. Now you know when to stop. That’s the part most people never learn.',
    reward: 400,
  },
  {
    id: 'local', title: 'A local shop', subject: 'Read the logs, not your gut',
    body: [
      'You’re getting cars with bolt-ons now. Ray hated a tune that hid a problem. When the intake changes, the sensor reading changes. Fix the reading, not the symptom.',
      'Build the shop up until people call it a local shop.',
    ],
    lesson: {
      title: 'Correct it from the log',
      points: [
        'A mass airflow sensor measures air by how much heat it loses. A new intake changes the pipe around it, so the reading shifts: rescale the sensor instead of bending the fuel table to hide it.',
        'Long-term fuel trim is the ECU’s memory of how wrong its fuel table is. A big number is a clue that air or fuel metering is off.',
        'Production ECUs are calibrated the same way: base fuel from airflow, a compensation table, injector latency against voltage (UpRev, “Nissan Tuning Guide”).',
      ],
      sources: ['The Tuning Course: “Correct VE from the log”, “Rescale the MAF”', 'UpRev, Nissan Tuning Guide (Learn, article 33)', 'Pops’s tips: MAF, Fuel trims'],
      course: 'maf',
    },
    goal: 'Reach 20 reputation: a Local shop.',
    met: (c) => (c.rep ?? 0) >= 20,
    done: 'Local shop. The sign out front finally means something again.',
    reward: 400,
  },
  {
    id: 'power', title: 'Torque and power', subject: 'What the customer feels',
    body: [
      'A customer told me today his car felt quicker but your sheet said it made less peak power. Ray had that conversation a hundred times.',
      'Ten clean jobs, and you’ll be able to explain it in your sleep.',
    ],
    lesson: {
      title: 'Torque and power',
      points: [
        'Horsepower is torque times rpm divided by 5252. Torque is what you feel; power is how fast you can deliver it.',
        'That is why a high-revving engine can be quicker than a torquey one with the same peak, and why the shape of the curve matters more than its top.',
      ],
      sources: ['Pops’s tips: Power', 'HP Tuners, A Beginner’s Guide to Engine Tuning (Learn, article 33)', 'Learn, article 32: horsepower and torque'],
    },
    goal: 'Do ten customer jobs well.',
    met: (c) => passed(c) >= 10,
    done: 'Ten. The curve, not the number. You get it now.',
    reward: 500,
  },
  {
    id: 'boost', title: 'Boost', subject: 'Free air is not free',
    body: [
      'The quick cars all have turbos now. Learn boost control at the Academy, and learn why the good ones run an intercooler.',
    ],
    lesson: {
      title: 'Compressed air is hot air',
      points: [
        'Compressing air heats it, and hot air is thin and knock-prone. An intercooler takes that heat back out, which is why boosted cars run more timing with one.',
        'A turbo makes boost only once exhaust flow spins the turbine fast enough. Lag is the time its shaft takes to accelerate.',
      ],
      sources: ['Pops’s tips: Boost, Turbo', 'Learn, article 34: boost with and without an intercooler'],
    },
    goal: 'Take the Boost control course.',
    met: (c) => (c.trained ?? []).includes('boost'),
    done: 'Boost control. Ray built his last car around a turbo. You’ll see why.',
    reward: 600,
  },
  {
    id: 'known', title: 'A known tuner', subject: 'The open-loop trap',
    body: [
      'People drive in from other towns now. That’s a known tuner. Get there: the cars that come in with parts bolted on and never tuned are where you show the difference.',
    ],
    lesson: {
      title: 'Where a wrong table hurts',
      points: [
        'At light load the ECU watches the oxygen sensor and trims the mixture to stoichiometric. At full throttle it stops listening and trusts the table, which is exactly where a wrong table hurts.',
        'Fit bigger injectors and the ECU still pulses them for the old size unless you tell it the new flow rate.',
      ],
      sources: ['Pops’s tips: Closed loop, Injectors', 'The Tuning Course: “The datalog: asked against got”'],
      course: 'datalog',
    },
    goal: 'Reach 60 reputation: a Known tuner.',
    met: (c) => (c.rep ?? 0) >= 60,
    done: 'Someone at the diner asked me who tunes at Ray’s place now. I said Ray’s kid. That felt good to say.',
    reward: 800,
  },
  {
    id: 'engine', title: 'Ray’s engines', subject: 'He built them too',
    body: [
      'There’s something I never told you. Ray didn’t only tune engines, he built them, on the stand where yours sits now. The last one he built is still in a customer’s car.',
      'Learn engine building at the Academy, and build one to order. Do it right.',
    ],
    lesson: {
      title: 'What you cannot tune away',
      points: [
        'A tune finds what the hardware can do; it cannot add what is not there. Past the limits of air, fuel and knock, the gains have to come from parts.',
        'Reliability first, then the number: an engine is only finished if it survives the pull.',
      ],
      sources: ['The Tuning Course: “What you cannot tune away”', 'Driven Racing Oil guide (Learn, article 33)'],
      course: 'limits',
    },
    goal: 'Build an engine to order and hand it back with the job done.',
    met: built,
    done: 'You built one. I stood by the stand and listened to it idle for a while. He would have been so proud of you.',
    reward: 1500,
  },
  {
    id: 'respected', title: 'A respected shop', subject: 'The shop people talk about',
    body: [
      'Ray’s shop was the one other tuners sent their hard cases to. Get it back there.',
    ],
    lesson: {
      title: 'Boost, nitrous and the margin',
      points: [
        'Every power adder lowers the knock limit: boost by heating and compressing the charge, nitrous by the extra oxygen it burns. About 2° of timing out per 50 hp of shot is the rule of thumb.',
        'A good tune leaves a margin to knock and to the injectors’ limit, and the log proves it.',
      ],
      sources: ['Pops’s tips: Boost, Knock', 'Learn, article 36: nitrous'],
    },
    goal: 'Reach 130 reputation: a Respected shop.',
    met: (c) => (c.rep ?? 0) >= 130,
    done: 'Respected shop. The sign out front is Ray’s again.',
    reward: 1500,
  },
  {
    id: 'master', title: 'Master tuner', subject: 'The last thing he taught me',
    body: [
      'There’s one more step. Ray didn’t become a master because of a number on a sheet. People drove across the state to have him tune their cars, because he told them the truth about their engines.',
      'Make the shop a destination. When you get there, you’ll be what he was.',
    ],
    lesson: {
      title: 'The whole job',
      points: [
        'Mixture, timing and the air the engine can breathe are the three things a tune works on, and every suite splits the job between an editor that changes the calibration and a scanner that logs what the engine did with it (HP Tuners).',
        'The loop never changes: change, pull, read, adjust.',
      ],
      sources: ['HP Tuners, A Beginner’s Guide to Engine Tuning (Learn, article 33)', 'Learn, article 12: the loop', 'The Tuning Course: “Where to go next”'],
      course: 'next',
    },
    goal: 'Reach 250 reputation: a Destination shop.',
    met: (c) => (c.rep ?? 0) >= 250,
    done: 'Master tuner. Ray’s shop, Ray’s kid. Come by the diner, the coffee is on me for the rest of your life.',
    reward: 0,
  },
];

/** The story's state, with defaults for a save from before it existed. @param {Career} c */
export const sagaOf = (c) => {
  const s = /** @type {any} */ (c.saga ?? {});
  return {
    ch: Number.isInteger(s.ch) && s.ch >= 0 ? Math.min(s.ch, CHAPTERS.length) : 0,
    read: Array.isArray(s.read) ? /** @type {string[]} */ (s.read) : [],
    done: !!s.done,
  };
};

/** The open chapter, or null once the story is over. @param {Career} c */
export const openChapter = (c) => { const s = sagaOf(c); return s.done ? null : CHAPTERS[s.ch] ?? null; };

/** Whether the shop has earned the title the story ends on. @param {Career} c */
export const isMaster = (c) => sagaOf(c).done;

/**
 * Move the story on: every chapter whose goal is met closes, pays, and opens the next.
 * Returns the same save when nothing changes, so it is safe to run on every change.
 * @param {Career} c
 * @returns {Career}
 */
export function advanceSaga(c) {
  let s = sagaOf(c);
  let money = c.money;
  let moved = false;
  while (!s.done && CHAPTERS[s.ch]?.met(c)) {
    money += CHAPTERS[s.ch].reward;
    moved = true;
    s = s.ch + 1 >= CHAPTERS.length ? { ...s, ch: s.ch + 1, done: true } : { ...s, ch: s.ch + 1 };
  }
  return moved ? { ...c, money, saga: s } : c;
}

/**
 * @typedef {object} Message
 * @property {string} id
 * @property {'email'|'text'} kind
 * @property {string} subject
 * @property {string[]} body
 * @property {Lesson} [lesson]
 * @property {string} [goal]
 * @property {number} order newest is highest
 */

/**
 * Everything Pops has sent so far: an email opening each chapter reached, a text closing
 * each one finished, and a tip of the day, newest first.
 * @param {Career} c
 * @returns {Message[]}
 */
export function messagesFor(c) {
  const s = sagaOf(c);
  /** @type {Message[]} */
  const out = [];
  CHAPTERS.forEach((ch, i) => {
    if (i > s.ch || (i === s.ch && s.done)) return;
    out.push({ id: `mail:${ch.id}`, kind: 'email', subject: ch.subject, body: ch.body, lesson: ch.lesson, goal: i === s.ch ? ch.goal : undefined, order: i * 10 });
    if (i < s.ch) out.push({ id: `text:${ch.id}`, kind: 'text', subject: ch.title, body: [ch.done, ...(ch.reward ? [`+$${ch.reward}`] : [])], order: i * 10 + 5 });
  });
  const tip = tipFor((c.day ?? 1) * 7);
  out.push({ id: `tip:${c.day ?? 1}`, kind: 'text', subject: `Tip of the day: ${tip.topic}`, body: [tip.text], order: 1000 + (c.day ?? 1) });
  return out.sort((a, b) => b.order - a.order);
}

/** How many of Pops's messages are unread. @param {Career} c */
export const unreadCount = (c) => { const r = sagaOf(c).read; return messagesFor(c).filter((m) => !r.includes(m.id)).length; };

/**
 * Read a message.
 * @param {Career} c @param {string} id
 * @returns {Career}
 */
export function readMessage(c, id) {
  const s = sagaOf(c);
  if (s.read.includes(id)) return c;
  // Only the last few hundred are kept: tips arrive every day without end.
  return { ...c, saga: { ...s, read: [...s.read, id].slice(-400) } };
}

