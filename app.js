/* ============================================================================
   Clash of Critters lightbulb reward calculator.

   You do not spend lightbulbs, you win them: pinballs go through the machine,
   the machine pays lightbulbs, the lightbulbs walk the ladder, and the ladder
   pays pinballs back. machine.js solves that loop exactly (see the note there);
   this file turns the resulting distribution over bulb-hits into the page.

   With no pinballs in hand the distribution collapses to a single point and
   everything below is the plain deterministic walk it always was.
   ========================================================================= */

const LS = { pins: 'coc.rc.pins', side: 'coc.rc.side', gold: 'coc.rc.gold',
             mult: 'coc.rc.mult', replay: 'coc.rc.replay', adv: 'coc.rc.adv',
             slots: 'coc.rc.slots',
             mode: 'coc.rc.mode', goalAmt: 'coc.rc.goalAmt', goalKey: 'coc.rc.goalKey' };

/* Where you stand is the one input that goes stale on its own: you play, the
   card moves, and the page has no way to know. Remembered across a refresh it
   quietly answers for a position you left behind, and being silently wrong is
   worse than being asked again, so it is deliberately NOT stored.

   A pasted link is the exception, because someone opening a link means the
   position in it. Your own refresh does not, and the two arrive identically, so
   the navigation type is what tells them apart. Unknown counts as a link: the
   old behaviour, not a surprise. */
const OLD_POS_KEYS = ['coc.rc.rung', 'coc.rc.prog'];
const isReload = (() => {
  try { return (performance.getEntriesByType('navigation')[0] || {}).type === 'reload'; }
  catch (_) { return false; }
})();

/* Nobody knows their running lightbulb total. The game shows the rung you are
   on, not a cumulative count. So position is entered as "the reward I'm working
   on", and the banked total is derived from it. */
const state = {
  pins: 0,        // pinballs in hand
  rung: 1,        // 1-based rung currently being worked on
  progress: 0,    // lightbulbs already put toward that rung
  mult: 1,        // launch size
  replay: true,   // play the pinballs the ladder pays back
  slots: true,    // count the pinballs the machine's own slots pay back
  advanced: false, // show the spread: ranges, and the distribution chart
  target: null,   // reward a ladder click asked for, marked so the click shows
  /* Which end of the question you are entering. In 'have' the pinball count is
     yours and everything else is the answer; in 'want' it is the answer, solved
     for, and the box that holds it is not on screen, because an input people can
     type in is a bad place to print a number the page worked out. */
  mode: 'have',
  goal: { key: 'pinball', want: 0 },
  pctl: 0.5,      // which point of the outcome distribution is on display
  side: SIDE_EVENTS[0],
  goldRush: true,
};

/* Lightbulbs the ladder has already counted: every rung before this one, plus
   whatever is showing on the current card. */
function banked() {
  const before = state.rung > 1 ? CUM_COST[state.rung - 2] : 0;
  return before + state.progress;
}

/* ---------- the ladder as this event pays it -------------------------------- */

/* What a rung pays under the current conditions. A drink rung pays energy
   drinks only while Gold Rush is running; otherwise that rung pays candy, whose
   amount is never printed. A material rung is stored in base units and
   converted to the running event's own material. */
function payout(step) {
  if (step.res === 'drink' && !state.goldRush) return { bucket: 'candy', qty: null };
  if (step.res === 'material') return { bucket: 'material', qty: step.qty * state.side.per };
  return { bucket: step.res, qty: step.qty };
}

/* A bucket as it is currently named. Only the material bucket moves. */
function bucketMeta(key) {
  const b = BUCKETS[key];
  if (key === 'material') {
    return Object.assign({}, b, { label: state.side.material, icon: state.side.icon });
  }
  return b;
}

/* What the machine pays into a bucket directly, over and above the track: the
   chance a launch that missed the lightbulbs pays it, and what one such payout
   is worth in that bucket's own units.

   Material always. Energy cans only while Gold Rush is running, which is the
   same condition the drink rungs answer to, and it turns that tile from a
   handful of track rewards into something the machine dominates, exactly as it
   already dominates material. Everything else comes from the track alone and
   gets zeros here, so the rest of the page never has to ask which is which. */
/* What the machine's own slots hand back per ball played, as the page is
   currently set. Zero with the switch off, which is the whole of what that
   switch does: every path below reads it from here. */
const backRate = () => (state.slots ? returnRate(state.goldRush) : 0);

function machineShare(key) {
  if (key === 'material') {
    return { p: MACHINE.pMat / (1 - MACHINE.pBulb), per: state.side.per };
  }
  if (key === 'drink' && state.goldRush) {
    return { p: MACHINE.pCan / (1 - MACHINE.pBulb), per: 1 };
  }
  return { p: 0, per: 0 };
}
const MACHINE_FED = ['material', 'drink'];

const CUM_COST = (() => {
  const out = [];
  let c = 0;
  for (const s of LADDER) { c += s.cost; out.push(c); }
  return out;
})();
const LADDER_TOTAL = CUM_COST[CUM_COST.length - 1];

/* Cumulative haul after each rung: totals[r] is what r rungs have paid.
   Recomputed per render because Gold Rush and the side event rename and
   requantify rungs. */
function cumulativeHaul() {
  const empty = () => {
    const o = {};
    for (const k of Object.keys(BUCKETS)) o[k] = { qty: 0, count: 0, varies: 0 };
    return o;
  };
  const rows = [empty()];
  for (let i = 0; i < LADDER.length; i++) {
    const prev = rows[i];
    const cur = {};
    for (const k of Object.keys(prev)) cur[k] = Object.assign({}, prev[k]);
    const pay = payout(LADDER[i]);
    const b = cur[pay.bucket];
    b.count++;
    if (pay.qty == null) b.varies++;
    else b.qty += pay.qty;
    rows.push(cur);
  }
  return rows;
}

/* The haul between two positions on the track: everything rewards `from+1` to
   `to` pay, and nothing that was collected before you got here. */
function haulSince(haul, from, to) {
  const a = haul[Math.max(0, Math.min(from, haul.length - 1))];
  const b = haul[Math.max(0, Math.min(to, haul.length - 1))];
  const out = {};
  for (const k of Object.keys(b)) {
    out[k] = {
      qty: Math.max(0, b[k].qty - a[k].qty),
      count: Math.max(0, b[k].count - a[k].count),
      varies: Math.max(0, b[k].varies - a[k].varies),
    };
  }
  return out;
}

/* ---------- solving the loop ------------------------------------------------ */

/* Everything the page shows, as exact expectations and quantiles over the
   distribution of bulb-hits. */
function compute() {
  const m = state.mult;
  const dist = solveLoop(state.pins, banked(), m, state.replay, state.goldRush, state.slots);
  const haul = cumulativeHaul();

  // k counts winning LAUNCHES, each worth m balls' reward.
  const bulbsOf = (k) => banked() + MACHINE.perHit * m * k;
  const reachOf = (k) => ladderReach(bulbsOf(k));
  // Must mirror the solver, including the two corrections it makes: the rungs
  // behind you were already collected, so only what the track pays FROM HERE is
  // playable, and the machine's own slot returns stretch the pile.
  const already = ladderReach(banked()).pins;
  const backOf = (k) => (state.replay ? reachOf(k).pins - already : 0);
  /* Every ball a given k ends up holding, at the AVERAGE payback. The solver
     above spreads that payback over three stretches, so the reward and lightbulb
     figures carry its randomness; this one does not, which leaves the pinballs
     played, and the material and cans that ride on them, with a mean that is
     right and a spread a little tight. */
  const totalOf = (k) => (state.pins + backOf(k)) / (1 - backRate());
  const launchesOf = (k) => Math.floor(totalOf(k) / m);
  // One reward per launch, so of the launches that did not pay bulbs, each pays
  // a given bucket with probability p/(1-.255): the outcomes are exclusive.
  const share = {};
  for (const key of MACHINE_FED) {
    const sh = machineShare(key);
    if (sh.p > 0) share[key] = sh;
  }
  const fed = Object.keys(share);

  let eBulbs = 0, ePlayed = 0, eRung = 0, eFromLadder = 0, eLaunches = 0, eFromSlots = 0;
  /* What the machine's own slots paid: everything you ended up holding that you
     did not bring and the track did not hand you. And what a launch size leaves
     stranded, since a stub smaller than one launch cannot be fired. Between them
     the pinballs played account for themselves exactly:

         yours + track + machine = played + left over  */
  const fromSlotsOf = (k) => Math.max(0, totalOf(k) - state.pins - backOf(k));
  const stubOf = (k) => Math.max(0, totalOf(k) - launchesOf(k) * m);
  // What the machine pays directly needs a variance of its own: unlike
  // everything else it is still random once k is known, because the launches
  // that missed the bulbs each pay it or nothing. Accumulate E[X] and E[X²] to
  // get Var exactly.
  const eMach = {}, eMach2 = {};
  for (const key of fed) { eMach[key] = 0; eMach2[key] = 0; }
  const totals = {};
  for (const k of Object.keys(BUCKETS)) totals[k] = { qty: 0, count: 0, varies: 0 };

  for (const [k, pr] of dist) {
    const R = reachOf(k);
    const launches = launchesOf(k);
    const played = launches * m;             // balls actually fired
    eBulbs += pr * bulbsOf(k);
    ePlayed += pr * played;
    eLaunches += pr * launches;
    eRung += pr * R.rung;
    eFromLadder += pr * backOf(k);
    eFromSlots += pr * fromSlotsOf(k);
    for (const key of fed) {
      const { p, per } = share[key];
      const mean = (launches - k) * p * m * per;
      const vr = (m * per) ** 2 * (launches - k) * p * (1 - p);
      eMach[key] += pr * mean;
      eMach2[key] += pr * (vr + mean * mean);
    }
    const h = haul[R.rung];
    for (const key of Object.keys(totals)) {
      totals[key].qty += pr * h[key].qty;
      totals[key].count += pr * h[key].count;
      totals[key].varies += pr * h[key].varies;
    }
  }

  // Every quantity here is monotone in k, so a quantile of k is a quantile of it.
  const at = (f, valueOf) => {
    let acc = 0;
    for (const [k, pr] of dist) { acc += pr; if (acc >= f) return valueOf(k); }
    return valueOf(dist[dist.length - 1][0]);
  };

  const pReach = (n) => {
    let acc = 0;
    for (const [k, pr] of dist) if (bulbsOf(k) >= CUM_COST[n - 1]) acc += pr;
    return acc;
  };

  /* The single outcome on display. Everything in "what you get" and the ladder
     reads off this one k, so the numbers describe a run that could actually
     happen rather than an average sitting between two rungs. */
  const selK = at(state.pctl, (k) => k);
  const sel = (() => {
    const R = reachOf(selK);
    const launches = launchesOf(selK);
    const machine = {};
    for (const key of fed) {
      const { p, per } = share[key];
      const mean = (launches - selK) * p * m * per;
      const sd = m * per * Math.sqrt(Math.max(0, (launches - selK) * p * (1 - p)));
      machine[key] = { mean,
                       p10: Math.max(0, mean - 1.2816 * sd),
                       p90: mean + 1.2816 * sd };
    }
    return {
      k: selK,
      bulbs: bulbsOf(selK),
      rung: R.rung,
      fromLadder: backOf(selK),
      /* Rounded so the sum comes out, not merely close: the machine's share
         takes the floor and what it gives up joins the leftover, which makes
         yours + track + machine = played + left over exact in whole balls, at
         every launch size. */
      fromSlots: Math.floor(fromSlotsOf(selK)),
      stub: stubOf(selK) - (fromSlotsOf(selK) - Math.floor(fromSlotsOf(selK))),
      launches,
      played: launches * m,
      // Only what these pinballs win. Rewards claimed before the card you are
      // on are already in your pocket, so counting them would answer a question
      // nobody asked: "what will I get" is not "what has the event ever paid".
      haul: haulSince(haul, state.rung - 1, R.rung),
      // Still random once k is known, so these halves keep a band.
      machine,
    };
  })();

  const spentTo = CUM_COST[sel.rung - 1] || 0;

  return {
    dist,
    sel,
    certain: dist.length === 1,
    bulbs: { mean: eBulbs, p10: at(0.1, bulbsOf), p50: at(0.5, bulbsOf), p90: at(0.9, bulbsOf) },
    played: ePlayed,
    launches: eLaunches,
    fromLadder: eFromLadder,
    fromSlots: eFromSlots,
    rung: { mean: eRung, p10: at(0.1, (k) => reachOf(k).rung), p50: at(0.5, (k) => reachOf(k).rung),
            p90: at(0.9, (k) => reachOf(k).rung) },
    // Mean and variance are exact; the 10–90 band is a normal reading of them,
    // which is fine at these counts.
    machine: (() => {
      const out = {};
      for (const key of fed) {
        const sd = Math.sqrt(Math.max(0, eMach2[key] - eMach[key] ** 2));
        out[key] = { mean: eMach[key],
                     p10: Math.max(0, eMach[key] - 1.2816 * sd),
                     p90: eMach[key] + 1.2816 * sd };
      }
      return out;
    })(),
    totals,
    pReach,
    bulbsOf,
    // progress of the shown outcome against its next rung
    left: sel.bulbs - spentTo,
    next: sel.rung < LADDER.length ? LADDER[sel.rung] : null,
    nextIndex: sel.rung + 1,
  };
}

/* Ladder pinballs paid out through each rung, so the credit below is a lookup. */
const CUM_PINS = (() => {
  const out = [];
  let n = 0;
  for (const s of LADDER) { if (s.res === 'pinball') n += s.qty; out.push(n); }
  return out;
})();

/* Pinballs needed for a typical run to reach reward n, counted from where you
   are now. No bisection: reaching a lightbulb total of C means playing C/1.02
   balls, since a ball pays 1.02 lightbulbs on average, and the track hands back
   the pinballs on the rungs between here and there, which you play too.

       pins = (C - banked) / 1.02 - (pins the track pays on the way)

   Exact against the old bisection (30,617 against 30,618 for the last reward)
   and O(1), which is what lets every row of the ladder carry the figure. */
function pinsForRung(n, base = banked()) {
  const want = CUM_COST[n - 1];
  if (want <= base) return 0;
  /* Credit only the rewards PASSED ON THE WAY, never reward n itself. Its own
     pinballs arrive for reaching it, so counting them is borrowing against a
     payout you have not had: reward 1 costs 78 balls and pays 80, which made it
     look free. Wrong for all 18 pinball-paying rewards, worst at reward 50. */
  const earned = n > 1 ? CUM_PINS[n - 2] : 0;
  const credit = state.replay ? Math.max(0, earned - ladderReach(base).pins) : 0;
  const balls = (want - base) / (MACHINE.pBulb * MACHINE.perHit);
  /* `balls` is what must be PLAYED, and you do not have to own all of it: the
     machine's own slots hand some back, and those get played too, so a pile of
     N funds N / (1 - rate) launches. Turning played back into owned is that in
     reverse, before the track's credit comes off. */
  return Math.max(0, Math.ceil(balls * (1 - backRate()) - credit));
}

/* What clearing the whole track costs a typical run, rounded to something worth
   printing. Worked out per render rather than once at load, because it moves
   with Gold Rush and with the replay setting: both change how much comes back,
   and a figure fixed at load would quietly keep quoting the state the page
   happened to start in. */
const pinsToClear = () => Math.ceil(pinsForRung(LADDER.length, 0) / 100) * 100;

/* A flat cap for the slider. It could be derived, as the pinballs that make
   clearing the track near-certain, but that figure moves with the launch size
   and the replay setting, so the scale would shift under the handle. A fixed
   round number keeps the scale stable, and typing a bigger one still works. */
const SLIDER_MAX = 50000;

/* ---------- goals: "I want X, what does that cost me?" ------------------------

   Answered by searching for the pinballs that produce it, because the machine
   and the track pay in different ways and only a search handles both. Track
   rewards arrive in lumps at fixed rungs and stop for good at reward 70, so
   they have a ceiling you can ask past; material trickles from every launch and
   has none. Pinballs are a third case: the goal is the number you get to PLAY,
   which is what the "use N pinballs" quest counts, not a net gain. */

/* What `pins` of your own would yield, deterministically, from where you are. */
function yieldOf(pins) {
  const base = banked();
  const stretch = 1 / (1 - backRate());
  // `paid` starts at what the track has ALREADY handed over at this position,
  // so the loop only replays rungs crossed from here. Starting it at 0 pays you
  // every pinball rung behind you a second time, which is what made a goal from
  // deep in the track read thousands of pinballs too cheap.
  let played = 0, hand = pins * stretch, bulbs = base, paid = ladderReach(base).pins;
  for (let i = 0; i < 100 && hand >= 1e-9; i++) {
    played += hand;
    bulbs = base + played * MACHINE.pBulb * MACHINE.perHit;
    const R = ladderReach(bulbs);
    hand = state.replay ? (R.pins - paid) * stretch : 0;
    paid = R.pins;
  }
  const R = ladderReach(bulbs);
  return { played, rung: R.rung, bulbs };
}

/* The amount of one bucket that `pins` would win, counting only what is new. */
function amountOf(pins, key) {
  const y = yieldOf(pins);
  if (key === 'pinball') return y.played;          // total played, not net
  const haul = haulSince(cumulativeHaul(), state.rung - 1, y.rung)[key];
  const meta = bucketMeta(key);
  if (meta.countOnly) return haul.count;
  const sh = machineShare(key);
  return haul.qty + y.played * sh.p * sh.per;
}

const GOAL_CAP = 500000;   // past any real pile; only used to detect "impossible"

/* P(you end up with at least `want`), for someone bringing `pins`. It only ever
   rises with `pins`, which is what makes it invertible below.

   It reads straight off the exact distribution, and it has to. A closed form is
   tempting, since a track reward arrives at a known rung, so "do I get it" looks
   like "did k of my T launches pay bulbs", one binomial tail and no solving. It
   is right to five decimals at ×1 and ×10 and WRONG at ×100: it hands you the
   launches the track pays before that rung without asking whether you were
   still alive to collect them, counting runs whose hits all land after the pile
   ran dry. Monte Carlo agrees with the solver (.1295 against .1296 over 400,000
   runs of one ×100 case, where the closed form said .1318), and ×100 is exactly
   where a range is worth printing, so the fast way is no way at all. */
function pGoal(pins, key, want) {
  if (!(want > 0)) return 1;
  const base = banked();
  const m = Math.max(1, state.mult);
  const dist = solveLoop(pins, base, m, state.replay, state.goldRush, state.slots);
  const already = ladderReach(base).pins;
  const haul = cumulativeHaul();
  const countOnly = bucketMeta(key).countOnly;
  const share = machineShare(key);
  const from = haul[Math.max(0, Math.min(state.rung - 1, haul.length - 1))][key];
  let acc = 0;

  /* The ladder is walked ONCE across the whole distribution rather than looked
     up per k. This runs inside a search that runs it dozens of times over, and
     `k` only rises, so the rung only rises with it: a fresh scan of 70 rungs
     for every one of a thousand outcomes was costing more than the solve. */
  let rung = 0, trackPins = 0;
  for (const [k, pr] of dist) {
    const bulbs = base + MACHINE.perHit * m * k;
    while (rung < LADDER.length && CUM_COST[rung] <= bulbs) {
      if (LADDER[rung].res === 'pinball') trackPins += LADDER[rung].qty;
      rung++;
    }
    const launches = Math.floor(((pins + (state.replay ? trackPins - already : 0))
                                 / (1 - backRate())) / m);
    if (key === 'pinball') {
      if (launches * m >= want) acc += pr;
      continue;
    }
    const to = haul[rung][key];
    const got = { qty: Math.max(0, to.qty - from.qty),
                  count: Math.max(0, to.count - from.count) };
    if (share.p === 0) {
      if ((countOnly ? got.count : got.qty) >= want) acc += pr;
      continue;
    }
    /* What the machine pays directly is still random once the lightbulbs are
       settled: the launches that missed the bulbs each pay it or nothing, so
       this k contributes a probability rather than a yes or no. */
    const unitsNeeded = (want - got.qty) / (m * share.per);
    if (unitsNeeded <= 0) { acc += pr; continue; }
    const n = Math.max(0, launches - k);
    const mean = n * share.p, sd = Math.sqrt(n * share.p * (1 - share.p));
    acc += pr * (sd > 0
      ? 0.5 * erfc((unitsNeeded - 0.5 - mean) / (sd * Math.SQRT2))   // n is in the thousands
      : (mean >= unitsNeeded ? 1 : 0));
  }
  return acc;
}

/* Complementary error function, for the normal tail above. Abramowitz & Stegun
   7.1.26 territory: good to ~1e-7, far past what a percentage prints. */
function erfc(x) {
  const z = Math.abs(x);
  const t = 1 / (1 + z / 2);
  const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196
    + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398
    + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
  return x >= 0 ? r : 2 - r;
}

/* The pinballs to bring for a given chance of getting there: the point where a
   curve that only rises crosses `q`. Bisection, from a bracket placed around a
   guess, since every step is a full solve of the loop and a good guess is worth
   five of them. The mean walk lands on the even-chance answer almost exactly,
   and the other two sit a few per cent either side of it, so the bracket starts
   narrow and widens only when it has to.

   `tol` stops it splitting hairs: the answer is a pinball count in the
   thousands that gets read to the nearest hundred, so resolving it to the
   single ball costs solves to move a digit nobody reads. The bisection keeps
   P(hi) >= q throughout, so the figure quoted always delivers the chance it
   claims, never a ball short. */
function pinsForChance(key, want, q, guess, tol) {
  let lo = Math.max(0, Math.floor(guess * 0.97) - 50);
  let hi = Math.max(lo + 1, Math.ceil(guess * 1.03) + 50);
  for (let i = 0; i < 20 && hi < GOAL_CAP && pGoal(hi, key, want) < q; i++) {
    lo = hi;
    hi = Math.min(GOAL_CAP, Math.ceil(hi * 1.15) + 200);
  }
  if (pGoal(hi, key, want) < q) return null;
  for (let i = 0; i < 20 && lo > 0 && pGoal(lo, key, want) >= q; i++) {
    hi = lo;
    lo = Math.max(0, Math.floor(lo * 0.87) - 200);
  }
  while (hi - lo > tol) {
    const mid = Math.floor((lo + hi) / 2);
    if (pGoal(mid, key, want) >= q) hi = mid; else lo = mid;
  }
  return hi;
}

/* The whole distribution of what a goal takes, not just three points of it.

   P(you reach the goal bringing n) only ever rises with n, from 0 to 1, which
   makes it a CDF over the pinballs needed: "the requirement" is as real a random
   variable as the haul is, and this is its shape. The bars the chart draws are
   its differences, and a click on the chart reads a pin count back off it.

   Every point is a solve, so the grid is placed rather than swept: p10 to p90 is
   2.563 standard deviations, so the three figures already worked out say how
   wide to go. */
const CURVE_POINTS = 17;
function goalCurve(key, want, lucky, mid, sure) {
  const sd = (sure - lucky) / 2.5631;
  if (!(sd > 0)) return null;
  const lo = Math.max(0, Math.round(mid - 3.2 * sd));
  const hi = Math.round(mid + 3.2 * sd);
  if (hi <= lo) return null;
  const out = [];
  for (let i = 0; i < CURVE_POINTS; i++) {
    const n = Math.round(lo + ((hi - lo) * i) / (CURVE_POINTS - 1));
    out.push({ n, f: pGoal(n, key, want) });
  }
  return out;
}

/* Inverse of the normal CDF, by bisecting the one erfc already gives. Forty
   halvings of [-6, 6] settles it far past the precision anything here prints. */
function probit(p) {
  if (p <= 1e-9) return -6;
  if (p >= 1 - 1e-9) return 6;
  let lo = -6, hi = 6;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (0.5 * erfc(-mid / Math.SQRT2) < p) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/* The pinballs a run at this luck would need, read off that curve. Luck runs the
   other way round here: the lucky end is the cheap one, so luck q is the
   requirement's (1-q) quantile.

   Interpolated against the probit of the curve rather than the curve itself. A
   CDF is an S, and reading straight lines across an S undershoots wherever it
   bends: it put the lucky end 86 pinballs under the figure printed beside it,
   which is the sort of disagreement that makes a reader distrust both. Against
   probit the same curve is nearly a straight line, because what is being read
   is nearly normal, and the two agree. */
function goalPinsAt(g, pctl) {
  // Not gated on `possible`: a goal past the ceiling is shown at the ceiling,
  // and that run has the same luck to read off it as any other.
  if (!g || g.pins == null) return null;
  if (!g.curve || Math.abs(pctl - 0.5) <= 0.02) return g.pins;
  /* The two figures printed beside the chart are exact crossings, and the picks
     that name them hand back exactly those rather than a reading off the curve.
     At ×100 the outcomes sit 400 lightbulbs apart, so the curve is a staircase
     and no interpolation of it lands on the step edge; being 48 pinballs from
     the number printed an inch away is worse than the interpolation is good. */
  if (g.lucky != null && Math.abs(pctl - 0.9) <= 0.02) return g.lucky;
  if (g.sure != null && Math.abs(pctl - 0.1) <= 0.02) return g.sure;
  const p = Math.min(1, Math.max(0, 1 - pctl));
  const c = g.curve;
  const z = probit(p);
  if (z <= probit(c[0].f)) return c[0].n;
  for (let i = 1; i < c.length; i++) {
    const z1 = probit(c[i].f);
    if (z1 >= z) {
      const z0 = probit(c[i - 1].f);
      const t = z1 - z0 > 1e-9 ? (z - z0) / (z1 - z0) : 0;
      return Math.max(0, Math.round(c[i - 1].n + t * (c[i].n - c[i - 1].n)));
    }
  }
  return c[c.length - 1].n;
}

/* Solved once per goal and set of conditions, not per render: every step of the
   search is a full solve of the loop. */
let goalCache = { sig: null, out: null };

/* Everything about one achievable amount: the even-chance pinballs, the two
   figures either side of it, and the curve between them. */
function solveFor(key, want) {
  // The mean walk is a close guess at the even-chance answer, so it brackets the
  // search rather than being quoted as though it were the answer.
  const hint = goalPinsApprox(key, want);
  const tol = Math.max(1, Math.round(hint / 500));
  const pins = pinsForChance(key, want, 0.5, hint, tol);
  // The other two are guessed from it, which is a far better start than the mean
  // walk. Only worked out when the spread is on: with it off the page has
  // nowhere to print them.
  const spread = state.advanced && pins != null;
  const lucky = spread ? pinsForChance(key, want, 0.1, pins, tol) : null;
  const sure = spread ? pinsForChance(key, want, 0.9, pins, tol) : null;
  return {
    pins,
    lucky,
    sure,
    // Only drawn when there is something to draw. A pinball goal at ×1 has
    // nearly no spread at all, and a chart of one bar says less than no chart.
    curve: lucky != null && sure > lucky ? goalCurve(key, want, lucky, pins, sure) : null,
    rung: yieldOf(pins || 0).rung,
  };
}

/* -> { possible, want, ceiling, pins, lucky, sure, curve, rung } */
function goalSolve(key, want) {
  if (!(want > 0)) return { possible: true, pins: 0, rung: state.rung };
  const sig = [key, want, state.rung, state.progress, state.mult, state.replay,
               state.slots, state.side.id, state.goldRush, state.advanced].join('|');
  if (goalCache.sig === sig) return goalCache.out;

  /* Asking for more than there is gets answered rather than refused. The page
     solves for the most the track can pay instead, shows that run, and says
     both numbers: what you asked for, and the ceiling it is showing you. A bare
     "not possible" leaves the rest of the page describing whatever pinballs
     happened to be in the box, which is an answer to no question at all. */
  const ceiling = Math.floor(amountOf(GOAL_CAP, key));
  const capped = ceiling < want;
  const target = capped ? ceiling : want;
  const out = Object.assign(
    { possible: !capped, want, ceiling },
    target > 0 ? solveFor(key, target) : { pins: null, rung: state.rung },
  );
  goalCache = { sig, out };
  return out;
}

/* The old mean walk, kept as the seed for the bracket above. */
function goalPinsApprox(key, want) {
  let lo = 0, hi = GOAL_CAP;
  for (let i = 0; i < 44; i++) {
    const mid = (lo + hi) / 2;
    if (amountOf(mid, key) >= want) hi = mid; else lo = mid;
  }
  return Math.ceil(hi - 1e-6);
}

/* ---------- formatting ----------------------------------------------------- */

const num = (n) => Math.round(n).toLocaleString('en-US');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const pct = (p) => (p >= 0.995 ? '100' : p <= 0.005 ? '<1' : (p * 100).toFixed(p < 0.1 ? 1 : 0));

/* The reward as one line, e.g. "120 Pinballs", "x2 for 5 min", "Candy". */
function rewardText(step) {
  const pay = payout(step);
  const meta = bucketMeta(pay.bucket);
  const name = pay.qty === 1 && meta.singular ? meta.singular : (meta.short || meta.label);
  if (pay.bucket === 'unknown') return 'not recorded';
  if (pay.qty == null) return name;
  if (meta.unit === 'min') return `x2 for ${pay.qty} min`;
  return `${num(pay.qty)} ${name}`;
}

/* ---------- rendering ------------------------------------------------------ */

const $ = (id) => document.getElementById(id);

/* Set for the one render that follows a ladder click, so that scroll animates
   and the routine re-centring does not. */
let smoothOnce = false;

/* Changing an input puts the view back on a typical run. A point dragged out of
   a previous distribution says nothing about the new one, and silently keeping
   it would mean the page answers a question nobody asked. */
function update() {
  state.pctl = 0.5;
  render();
}

function render() {
  // First, because the picker's labels name rewards, which the side event and
  // Gold Rush rename, and because it can settle which rung we are on.
  refreshRungPicker();
  applyGoal();
  save();

  const r = compute();
  renderSummary(r);
  renderDist(r);
  renderTotals(r);
  renderLadder(r);

  $('slider').max = SLIDER_MAX;
  $('slider').value = Math.min(state.pins, SLIDER_MAX);
  $('sliderMax').textContent = num(SLIDER_MAX);
  $('pins').value = state.pins;

  // Only one of the two is ever on screen, so they cannot disagree.
  $('haveBox').hidden = state.mode !== 'have';
  $('wantBox').hidden = state.mode === 'have';
  for (const b of $('modeRow').children) {
    b.classList.toggle('sel', b.dataset.mode === state.mode);
  }

  // No prose under the controls: what each one does lives behind its "?" now,
  // so the sidebar stays a list of settings rather than a page of explanation.
  for (const b of $('multRow').children) {
    b.classList.toggle('sel', Number(b.dataset.mult) === state.mult);
  }
}

function renderSummary(r) {
  // Ranges are the exception, not the rule: without the spread turned on every
  // figure is simply the typical run, which is what people came for.
  const wide = state.advanced && !r.certain;

  /* Say plainly what these numbers are. Without this the page looks like it is
     promising an outcome, when it is describing the middle of a range. */
  const bits = [`<div class="view-label">
    ${wide && Math.abs(state.pctl - 0.5) > 0.02
      ? `<b>${luckName(state.pctl).replace(/^an? /, '').replace(/^./, (c) => c.toUpperCase())}</b>
         <span>${luckOdds(state.pctl)}</span>`
      : `<b>Average outcome</b><span>what a typical run gives you${
          state.advanced ? '' : '. Turn on “Show the spread” for the range'}</span>`}
  </div>`];

  const tiles = [];

  /* In "want" mode the pinballs are the answer, so they lead, and they carry
     the spread the rest of the page carries: a goal is a chance of getting
     there, not a promise, and one number alone cannot say that. The figure is
     the even-chance one, the same "typical run" every other number here is. */
  const goal = state.mode === 'want' && state.goal.want > 0
    ? goalSolve(state.goal.key, state.goal.want) : null;
  if (goal && goal.pins != null) {
    tiles.push(`<div class="stat"><b>${num(state.pins)}</b>
      <span>pinballs to start${Math.abs(state.pctl - 0.5) <= 0.02 ? ', on average' : ''}</span>
      <i>${[// Says which number is being answered when it is not the one asked.
            goal.possible ? '' : `for all ${num(goal.ceiling)}, which is every one left`,
            wide && goal.sure > goal.pins ? `${num(goal.sure)} to be 90% sure` : '',
            wide && goal.lucky < goal.pins ? `${num(goal.lucky)} if you are lucky` : '']
           // A line each: the tile is too narrow to keep them on one, and a
           // break mid-phrase reads worse than a break between the two.
           .filter(Boolean).join('<br />')}</i></div>`);
  }

  tiles.push(`<div class="stat"><b>${num(r.sel.rung)}</b><span>of ${LADDER.length} rewards claimed</span>
      <i>${[
        // Says where the haul below starts, now that it counts only new rewards.
        state.rung > 1 ? `${num(Math.max(0, r.sel.rung - (state.rung - 1)))} new below` : '',
        wide ? `${r.rung.p10} to ${r.rung.p90} likely` : '',
      ].filter(Boolean).join(' · ')}</i></div>`);

  tiles.push(`<div class="stat">${wide
      ? `<b class="ranged">${num(r.bulbs.p10)} – ${num(r.bulbs.p90)}</b>`
      : `<b>${num(r.sel.bulbs)}</b>`}
      <span>lightbulbs</span>
      ${wide ? `<i>${num(r.sel.bulbs)} on ${luckName(state.pctl)}</i>` : ''}</div>`);

  // Three tiles either way: in "want" mode the pinballs played give up their
  // place to the pinballs to bring, which is the question that was asked.
  if (!(goal && goal.possible && goal.pins != null)) {
    tiles.push(`<div class="stat"><b>${num(r.sel.played)}</b><span>pinballs played</span>
      <i>${[
            // Every part of it, or the sum underneath does not come out.
            [`${num(state.pins)} yours`,
             r.sel.fromLadder >= 1 && state.replay ? `${num(r.sel.fromLadder)} from ${TRACK}` : '',
             r.sel.fromSlots >= 1 ? `${num(r.sel.fromSlots)} from the machine` : '',
            ].filter(Boolean).join(' + '),
            state.mult > 1 ? `${num(r.sel.launches)} launches at ×${state.mult}` : '',
            // Names the shortfall in the sum above, which is otherwise a puzzle.
            r.sel.stub >= 1 ? `${num(r.sel.stub)} left over, too few to fire` : '']
           .filter(Boolean).join(' · ')}</i></div>`);
  }

  bits.push(`<div class="stat-row">${tiles.join('')}</div>`);

  if (r.next) {
    const short = Math.max(0, pinsForRung(r.nextIndex) - state.pins);
    const bar = Math.min(100, Math.round((r.left / r.next.cost) * 100));
    bits.push(`<div class="next">
      <div class="next-head">
        <span>Next up: <b>${rewardText(r.next)}</b>
          <span class="muted">(reward ${r.nextIndex} of ${LADDER.length})</span>
          <button type="button" class="q" data-help="next" aria-label="What is this?">?</button></span>
        <span class="muted">${num(r.next.cost - r.left)} more lightbulbs</span>
      </div>
      <div class="bar"><i style="width:${bar}%"></i></div>
      <div class="muted small">${num(r.left)} / ${num(r.next.cost)}${
        /* No percentage here. "Next" is the reward after the outcome on display,
           so its odds moved with the viewing point and read as noise. The
           shortfall is the actionable number and holds still, because it depends
           on the pinballs you hold rather than on how the page is being read.
           Per-reward odds still live in the ladder's Chance column. */
        short > 0 ? ` · <b class="odds">${num(short)} more pinballs gets half of runs there</b>` : ''
      }</div>
    </div>`);
  } else {
    /* The shown outcome cleared the track. Keep the same three-line shape, and
       above all keep the odds: "you finished it" is worth much less than the
       chance of finishing it, which is precisely the question at this end. */
    const pAll = r.pReach(LADDER.length);
    bits.push(`<div class="next">
      <div class="next-head">
        <span>All ${LADDER.length} recorded rewards claimed
          <button type="button" class="q" data-help="end" aria-label="What is this?">?</button></span>
        <span class="muted">the track goes on, we do not know how far</span>
      </div>
      <div class="bar"><i style="width:100%"></i></div>
      <div class="muted small">${num(LADDER_TOTAL)} / ${num(LADDER_TOTAL)}${
        // The one percentage worth keeping without asking: finishing is the
        // whole goal, and "you finished" is worth much less than "88% finish".
        r.certain || pAll >= 0.995
          ? ''
          : ` · <b class="odds">${pct(pAll)}% of runs clear all ${LADDER.length}</b>`
      }</div>
    </div>`);
  }

  $('summary').innerHTML = bits.join('');
}

/* How lucky a point on the distribution is, in words. "44th percentile" tells a
   player nothing; "a bit below average" and "3 runs in 4 do better" do. */
function luckName(p) {
  if (p <= 0.03) return 'about as bad as it gets';
  if (p <= 0.18) return 'an unlucky run';
  if (p < 0.42) return 'a bit below average';
  if (p <= 0.58) return 'a typical run';
  if (p < 0.82) return 'a bit above average';
  if (p < 0.97) return 'a lucky run';
  return 'about as good as it gets';
}

/* The same point as plain odds. */
function luckOdds(p) {
  if (p <= 0.03) return 'almost every run does better';
  if (p >= 0.97) return 'almost every run does worse';
  const worse = Math.round(p * 100);
  if (worse >= 45 && worse <= 55) return 'about half of runs do better, half worse';
  return worse < 50
    ? `about ${100 - worse}% of runs do better than this`
    : `about ${worse}% of runs do worse than this`;
}

/* The outcome distribution, drawn as bars, with the viewing point marked.
   Clicking or dragging picks a different point to read the page at. */
/* The chart in "want" mode draws what the goal TAKES rather than what a pile
   gives: the bars are the differences of the requirement's CDF, the axis is in
   pinballs, and the cheap end is on the left, which is the lucky end. The picks
   row is flipped to match, so Lucky still sits over the lucky side. */
function renderGoalDist(goal) {
  const box = $('distBox');
  const c = goal.curve;
  const bins = [];
  for (let i = 1; i < c.length; i++) bins.push(Math.max(0, c[i].f - c[i - 1].f));
  const peak = Math.max(...bins, 1e-9);

  const W = 600, H = 76, gap = 1.5;
  const bw = W / bins.length;
  const lo = c[0].n, hi = c[c.length - 1].n;
  const selX = Math.min(W, Math.max(0, ((state.pins - lo) / Math.max(1, hi - lo)) * W));

  const bars = bins.map((p, i) => {
    const h = p > 0 ? Math.max(1.5, (p / peak) * (H - 10)) : 0.75;
    const x = i * bw;
    return `<rect x="${(x + gap / 2).toFixed(1)}" y="${(H - h).toFixed(1)}"
      width="${Math.max(0.5, bw - gap).toFixed(1)}" height="${h.toFixed(1)}"
      class="${x <= selX ? 'on' : 'off'}" />`;
  }).join('');

  box.querySelector('.dist-chart').innerHTML =
    `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" id="distSvg">
       ${bars}
       <line x1="${selX.toFixed(1)}" y1="0" x2="${selX.toFixed(1)}" y2="${H}" class="mark" />
     </svg>`;
  box.querySelector('.dist-scale').innerHTML =
    `<span>${num(lo)}</span><span>${num(hi)}</span>`;
  $('distLabel').innerHTML =
    `showing <b>${luckName(state.pctl)}</b>, needing <b>${num(state.pins)}</b> pinballs`;
}

function renderDist(r) {
  const box = $('distBox');
  const empty = $('distEmpty');
  const goal = state.mode === 'want' && state.goal.want > 0
    ? goalSolve(state.goal.key, state.goal.want) : null;
  const asGoal = !!(goal && goal.curve && state.advanced);

  $('distTitle').textContent = asGoal ? 'What it could take' : 'How it could land';
  box.querySelector('.dist-picks').classList.toggle('flip', asGoal);
  if (asGoal) {
    box.hidden = false;
    empty.hidden = true;
    renderGoalDist(goal);
    return;
  }
  // Nothing is random with no pinballs in hand, so the chart has nothing to
  // say, but a first visit should not be a wall of zeros with no instruction.
  if (r.certain || !state.advanced) {
    box.hidden = true;
    empty.hidden = state.pins > 0;
    return;
  }
  box.hidden = false;
  empty.hidden = true;

  // Clip to where the probability actually is. The support runs far wider than
  // the mass, and drawing the whole of it squeezes the interesting part into a
  // few pixels; outliers fold into the end bars.
  const edge = (f) => {
    let acc = 0;
    for (const [k, p] of r.dist) { acc += p; if (acc >= f) return r.bulbsOf(k); }
    return r.bulbsOf(r.dist[r.dist.length - 1][0]);
  };
  const lo = edge(0.002), hi = edge(0.998);
  const span = Math.max(1, hi - lo);

  /* Bin down to something drawable, but never into more bins than there are
     outcomes to fill them. Lightbulbs land on a lattice: they only arrive in
     multiples of 4 × launch size, so at ×40 the achievable totals sit 160
     apart. Asking for 56 bins across 25 reachable values leaves gaps that look
     like missing data when they are just the spacing of the lattice.

     Binning by x-position would still double up or skip, because the lattice
     spacing rarely divides evenly into a bin width. Binning by lattice RANK
     cannot: consecutive outcomes fall into consecutive bins, and no bin between
     two reachable values is left empty. The axis stays honest because x is
     linear in k, so equal lattice steps are equal pixel steps. */
  const inRange = r.dist.filter(([k]) => {
    const x = r.bulbsOf(k);
    return x >= lo && x <= hi;
  });
  const BINS = Math.max(6, Math.min(56, inRange.length));
  const rankOf = new Map(inRange.map(([k], i) => [k, i]));
  const bins = new Array(BINS).fill(0);
  for (const [k, p] of r.dist) {
    const rank = rankOf.has(k)
      ? rankOf.get(k)
      : (r.bulbsOf(k) < lo ? 0 : inRange.length - 1);   // tails fold into the ends
    const i = Math.min(BINS - 1, Math.floor((rank / Math.max(1, inRange.length)) * BINS));
    bins[i] += p;
  }
  const peak = Math.max(...bins);

  const W = 600, H = 76, gap = 1.5;
  const bw = W / BINS;
  // Marker placed by the same rank scale as the bars, so it lands on its bar.
  const selRank = rankOf.has(r.sel.k)
    ? rankOf.get(r.sel.k)
    : (r.sel.bulbs < lo ? 0 : inRange.length - 1);
  const selX = ((selRank + 0.5) / Math.max(1, inRange.length)) * W;

  const bars = bins.map((p, i) => {
    // A hairline for a bin with no mass, not a full bar, because an empty outcome
    // should not read as a small one.
    const h = p > 0 ? Math.max(1.5, (p / peak) * (H - 10)) : 0.75;
    const x = i * bw;
    const on = x <= selX + bw;   // everything up to the viewing point is filled
    return `<rect x="${(x + gap / 2).toFixed(1)}" y="${(H - h).toFixed(1)}"
      width="${Math.max(0.5, bw - gap).toFixed(1)}" height="${h.toFixed(1)}"
      class="${on ? 'on' : 'off'}" />`;
  }).join('');

  box.querySelector('.dist-chart').innerHTML =
    `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" id="distSvg">
       ${bars}
       <line x1="${selX.toFixed(1)}" y1="0" x2="${selX.toFixed(1)}" y2="${H}" class="mark" />
     </svg>`;
  box.querySelector('.dist-scale').innerHTML =
    `<span>${num(lo)}</span><span>${num(hi)}</span>`;
  $('distLabel').innerHTML =
    `showing <b>${luckName(state.pctl)}</b>, ${luckOdds(state.pctl)}`;
}

/* Why a tile reads 0. "none yet" promises that more pinballs would fix it, and
   for the card packs and the x2 boost that is a lie: every rung paying those
   sits in the first 47, so past that point no pile of pinballs brings one back,
   and a row that keeps saying "none yet" reads as a bug rather than an answer.
   Counted from the card you are on, since everything before it is claimed. */
function emptyReason(key) {
  if (key === 'drink' && !state.goldRush) return 'only while Gold Rush is on';
  let ahead = 0, behind = 0;
  for (let i = 0; i < LADDER.length; i++) {
    if (payout(LADDER[i]).bucket !== key) continue;
    if (i >= state.rung - 1) ahead++; else behind++;
  }
  if (ahead) return 'none yet';
  return behind ? `all ${num(behind)} already claimed` : `${TRACK} never pays it`;
}

function renderTotals(r) {
  $('resList').innerHTML = Object.keys(BUCKETS).map((key) => {
    const meta = bucketMeta(key);
    const t = r.sel.haul[key];
    const count = t.count;

    // Where the machine pays a bucket directly it pays far more of it than the
    // ladder does, so that row leads with the split rather than one summed
    // number, and the machine half carries its range.
    const mach = r.sel.machine[key];
    /* The machine's own slots pay pinballs, and those are as much a part of what
       you get as the track's rungs are. No range on that half, unlike material:
       it is not still open once the run on display has been picked, it is the
       payback that carried this run to the launches it fired, and it is already
       spelled out under the pinballs played. */
    const slots = key === 'pinball' ? r.sel.fromSlots : 0;
    const value = meta.countOnly ? count : t.qty + (mach ? mach.mean : 0) + slots;
    let amount;
    if (slots >= 1 && value >= 0.5) {
      amount = `${num(value)}<span class="extra">${num(t.qty)} from ${TRACK}`
             + ` + ${num(slots)} from the machine</span>`;
    } else if (mach && value >= 0.5) {
      // The headline is the TOTAL, so "including N guaranteed" refers to a part
      // of the number above it. The range is there because the machine's share
      // is luck; the track's share is fixed.
      const wide = state.advanced && !r.certain;
      const total = wide
        ? `${num(t.qty + mach.p10)} to ${num(t.qty + mach.p90)}`
        : num(t.qty + mach.mean);
      // Spell the split out: the track's share is fixed, the machine's is luck,
      // so the range belongs to the machine half and should say so.
      const fromMachine = wide
        ? `${num(mach.p10)} to ${num(mach.p90)}`
        : num(mach.mean);
      amount = `<span class="${wide ? 'ranged' : ''}">${total}</span>`
             + (t.qty >= 1
                 ? `<span class="extra">${num(t.qty)} from ${TRACK} + ${fromMachine} from the machine</span>`
                 : '');
    } else {
      amount = num(value) + (meta.unit === 'min' ? '<small> min</small>' : '');
    }

    // Tied to the number actually printed: a row that rounds to 0 says why it is
    // 0 rather than "from 0 rewards".
    const has = value >= 0.5;
    let sub;
    if (!has) sub = emptyReason(key);
    else if (mach)
      // The line under the number already names both halves, so this says the
      // thing that line cannot: which half is fixed and which is luck.
      sub = `fixed from ${TRACK}, luck from the machine`;
    else if (key === 'pinball') {
      sub = slots >= 1
        ? (state.replay
            ? `from ${num(count)} rewards and the machine, played again`
            : `${num(count)} rewards kept, the machine's own played`)
        : `from ${num(count)} rewards, ${state.replay ? 'played again' : 'kept'}`;
    }
    else if (meta.note) sub = meta.note;
    else {
      sub = `from ${num(count)} ${Math.round(count) === 1 ? 'reward' : 'rewards'}`;
      if (t.varies >= 0.5) sub += ` · ${num(t.varies)} with no set amount`;
    }

    return `<div class="res-row${has ? '' : ' empty'}">
      ${meta.icon ? `<img class="res-icon" src="${meta.icon}" alt="" />`
                  : '<span class="res-icon"></span>'}
      <div class="res-text">
        <div class="res-name">${meta.label}${mach
          ? ' <button type="button" class="q" data-help="machine" aria-label="What is this?">?</button>'
          : ''}${key === 'unknown'
          ? ' <button type="button" class="q" data-help="end" aria-label="What is this?">?</button>'
          : ''}</div>
        <div class="res-sub">${sub}</div>
      </div>
      <div class="res-qty">${amount}</div>
    </div>`;
  }).join('');
}

function renderLadder(r) {
  let cum = 0;
  const rows = [];

  for (let i = 0; i < LADDER.length; i++) {
    const step = LADDER[i];
    cum += step.cost;
    /* The last column is what it takes to get here, not the odds of getting
       here. A percentage was only meaningful for the two or three rows at the
       frontier and read as noise everywhere else; the pinball count means
       something on every row and is the number you would act on. */
    const need = pinsForRung(i + 1);
    /* The star marks the row in focus. Normally that is the next reward, but
       after a click it is the reward that was clicked: asking what reward 45
       costs and being shown a star on 46 reads as the wrong answer, even though
       46 is genuinely what you would work toward next. The "Next up" panel
       above still names 46, so nothing is lost. */
    const isTarget = state.target === i + 1;
    const cls = [
      i < r.sel.rung ? 'done' : '',
      isTarget || (!state.target && i + 1 === r.nextIndex) ? 'cur' : '',
      isTarget ? 'target' : '',
    ].filter(Boolean).join(' ');
    rows.push(`<tr class="${cls}" data-n="${i + 1}" title="Click to fill in the pinballs that get you here">
      <td class="n">${i + 1}</td>
      <td class="rw">${rewardText(step)}${
        step.note ? ` <span class="flag" title="${esc(step.note)}">?</span>` : ''}</td>
      <td class="c">${num(step.cost)}</td>
      <td class="c cum">${num(cum)}</td>
      <td class="c odds">${need > 0 ? num(need) : ''}</td>
    </tr>`);
  }

  $('ladderBody').innerHTML = rows.join('');
  $('ladderTotal').textContent =
    `All ${LADDER.length} recorded rewards: ${num(LADDER_TOTAL)} lightbulbs, `
    + `about ${num(pinsToClear())} pinballs. The track carries on past here, `
    + `unrecorded.`;

  // Keep the frontier in view, scrolling the ladder box only, because scrollIntoView
  // would drag the whole page down on every keystroke.
  const box = document.querySelector('.ladder-wrap');
  // Centre on the reward that was asked for, if one was, else on the frontier.
  const focus = state.target
    ? state.target - 1
    : Math.min(r.sel.rung, LADDER.length - 1);
  const cur = $('ladderBody').children[focus];
  if (box && cur) {
    const top = Math.max(0, cur.offsetTop - box.clientHeight / 2);
    /* Glide only when a click asked to go somewhere. The same centring runs on
       every render, and animating that would leave the ladder forever chasing
       the slider. Reduced-motion users get the jump either way. */
    const glide = smoothOnce
      && typeof box.scrollTo === 'function'
      && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (glide) box.scrollTo({ top, behavior: 'smooth' });
    else box.scrollTop = top;
  }
  smoothOnce = false;
}

/* ---------- help popovers ---------------------------------------------------
   A "?" next to anything that needs a sentence. Fixed-position, so opening one
   never moves the page, and it closes on the next click or Escape. */

function initHelp() {
  const pop = $('helpPop');

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('button.q[data-help]');
    if (!btn) {
      if (!e.target.closest('#helpPop')) pop.hidden = true;
      return;
    }
    const text = HELP[btn.dataset.help];
    if (!text) return;
    // A "?" can sit inside a <label>, where a plain click would also flip the
    // checkbox it labels. Asking what a switch does is not asking to flip it.
    e.preventDefault();
    if (!pop.hidden && pop.dataset.for === btn.dataset.help) {
      pop.hidden = true;                       // clicking the same ? closes it
      return;
    }
    pop.textContent = text;
    pop.dataset.for = btn.dataset.help;
    pop.hidden = false;

    // Anchor under the button, then pull back inside the viewport.
    const b = btn.getBoundingClientRect();
    const w = Math.min(320, window.innerWidth - 20);
    pop.style.width = w + 'px';
    let left = b.left;
    if (left + w > window.innerWidth - 10) left = window.innerWidth - w - 10;
    pop.style.left = Math.max(10, left) + 'px';
    const below = b.bottom + 8;
    pop.style.top = (below + pop.offsetHeight > window.innerHeight - 10
      ? Math.max(10, b.top - pop.offsetHeight - 8)
      : below) + 'px';
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') pop.hidden = true;
  });
}

/* ---------- work in progress notice ------------------------------------------
   Opens once per browser, and any time from the badge in the header. The
   version sits in the key so a later notice fires again for people who already
   dismissed this one. */

const WIP_SEEN = 'coc.rc.seenWip.1';

function initWipNotice() {
  const dlg = $('wipDialog');
  const open = () => {
    if (typeof dlg.showModal === 'function' && !dlg.open) dlg.showModal();
  };

  let seen = null;
  try { seen = localStorage.getItem(WIP_SEEN); } catch (_) { seen = null; }
  if (seen !== '1') open();

  $('wipBadge').addEventListener('click', open);
  $('wipClose').addEventListener('click', () => {
    dlg.close();
    // A private window can refuse to store, and the notice is not worth an error.
    try { localStorage.setItem(WIP_SEEN, '1'); } catch (_) { /* shown again next time */ }
  });
}

/* ---------- wiring --------------------------------------------------------- */

/* `target` is the reward a click on the ladder asked for. Reaching it makes it
   the last claimed row, so the ★ moves on to the next one, and without a mark
   the click appears to have highlighted the wrong reward. Any other way of
   changing the pinballs clears it. */
function setPins(v, target = null) {
  state.target = target;
  // Typing pinballs is answering the question from the other end, so it is a
  // move back to "I have", not a second input sitting beside the goal.
  state.mode = 'have';
  state.pins = Math.max(0, Math.floor(Number(v) || 0));
  $('pins').value = state.pins;
  update();
}

function setMode(mode) {
  state.mode = mode === 'want' ? 'want' : 'have';
  state.target = null;
  update();
}

/* In "want" mode the pinballs are an output: solved for, written into `state`
   before anything reads it, and shown as a figure on the right rather than in a
   box you could type over.

   Re-solved on every render rather than once per keystroke, because the answer
   moves with everything else: the side event renames and requantifies material,
   Gold Rush swaps drinks for candy, replay decides whether the track's pinballs
   come back, the launch size decides how wild the swing is, and where you stand
   decides what is still ahead. `goalSolve` caches on exactly that list, so the
   renders in between are free. */
function applyGoal() {
  if (state.mode !== 'want') return;
  const { key, want } = state.goal;
  const meta = bucketMeta(key);
  if (!(want > 0)) {
    state.pins = 0;
    $('goalNote').textContent = 'Say what you are after, and what to bring appears on the right.';
    return;
  }
  const g = goalSolve(key, want);
  // The short name where there is one: "300 Catch Tatari" reads better than the
  // tile's fuller "Catch Tatari / Capsules", and neither wants lowercasing.
  const name = meta.short || meta.label;
  if (g.pins == null) {
    // Nothing left to aim at: the track pays no more of this from here.
    state.pins = 0;
    $('goalNote').textContent =
      `Not possible: ${TRACK} pays no more ${name} from where you are.`;
    return;
  }
  /* The pinballs shown follow the point being read off the chart, because in
     this mode that is what the chart is about: a lucky run needs fewer, and the
     page should then describe the run that brings fewer and just gets there. */
  state.pins = goalPinsAt(g, state.pctl);
  $('goalNote').textContent = g.possible
    ? `Reaching reward ${g.rung} of ${LADDER.length}`
      + (key === 'pinball' ? `, playing ${num(want)} in all` : '')
    : `${TRACK} has only ${num(g.ceiling)} more ${name} in it, so ${num(want)} is `
      + `out of reach. Showing what it takes to claim all ${num(g.ceiling)}, `
      + `reaching reward ${g.rung} of ${LADDER.length}.`;
}

/* ---------- "where am I" -----------------------------------------------------
   The card in the game shows a cost and a reward. 30 of the 70 rungs share a
   cost with another rung, and cost+reward still leaves 9 ambiguous groups (a
   220 → 5 Catch Tatari card occurs six times). Adding the NEXT reward, which is also on
   screen, cuts that to a single pair, rungs 42 and 45, which are identical for
   two rungs running. So the picker offers "this → next" and says when it cannot
   tell those two apart. */

function rungsCosting(cost) {
  const out = [];
  LADDER.forEach((s, i) => { if (s.cost === cost) out.push(i + 1); });
  return out;
}

function rungLabel(n) {
  const nxt = n < LADDER.length ? `, then ${rewardText(LADDER[n])}` : ', last rung';
  return `${rewardText(LADDER[n - 1])}${nxt}`;
}

/* Repopulate the picker for whatever cost is typed, keeping the chosen rung if
   it still fits. */
function refreshRungPicker() {
  const cost = Math.max(0, Math.floor(Number($('rungCost').value) || 0));
  const matches = rungsCosting(cost);
  const pick = $('rungPick');

  if (!matches.length) {
    pick.innerHTML = `<option value="">${
      cost ? '(no reward costs that)' : '(starting from the beginning)'}</option>`;
    pick.disabled = true;
    $('rungNote').textContent = cost
      ? `No ${TRACK} reward costs that. Check the number on the card.`
      : 'Leave this at 0 if the event has not started for you yet.';
    if (cost === 0) { state.rung = 1; state.progress = 0; }
    return;
  }

  pick.disabled = false;
  pick.innerHTML = matches
    .map((n) => `<option value="${n}">${rungLabel(n)}</option>`).join('');
  if (!matches.includes(state.rung)) state.rung = matches[0];
  pick.value = state.rung;

  const twin = matches.filter((n) => n !== state.rung
    && rungLabel(n) === rungLabel(state.rung));
  $('rungNote').textContent =
    `Reward ${state.rung} of ${LADDER.length} · ${num(banked())} lightbulbs collected so far`
    + (twin.length
        ? ` · reward ${twin.join(' and ')} looks identical, so this is a guess`
        : '');
}

function setRung(n) {
  state.rung = Math.min(LADDER.length, Math.max(1, Math.floor(Number(n) || 1)));
  state.progress = Math.min(state.progress, LADDER[state.rung - 1].cost - 1);
  $('rungProgress').value = state.progress;
  render();
}

/* Both stores hold the whole of `state`, and they are written together: the URL
   so a result can be pasted to someone, localStorage so this browser comes back
   where it left off. Splitting them by field is what would be confusing.

   Writing them from ONE place is what keeps them honest. Scattered through the
   handlers they drifted, because not every change comes from a handler:
   refreshRungPicker() moves the rung on its own when the typed cost matches a
   different set of rewards, and nothing was saving that. render() calls this
   after the picker has settled, so every path persists by construction, the
   first render included, which is also what puts the restored state in the
   address bar rather than leaving it blank until the first click.

   replaceState throws on file:// in some browsers, and localStorage throws in
   private mode; neither may take the app down. */
function save() {
  try {
    history.replaceState(null, '',
      `?e=${state.side.id}&g=${state.goldRush ? 1 : 0}&p=${state.pins}`
      + `&r=${state.rung}&w=${state.progress}&m=${state.mult}`
      + `&y=${state.replay ? 1 : 0}&s=${state.advanced ? 1 : 0}`
      + `&b=${state.slots ? 1 : 0}`
      + `&i=${state.mode === 'want' ? 'g' : 'p'}`
      + (state.goal.want > 0 ? `&ga=${state.goal.want}&gk=${state.goal.key}` : ''));
  } catch (_) { /* opened from disk, and the app works fine without it */ }
  try {
    localStorage.setItem(LS.pins, state.pins);
    localStorage.setItem(LS.side, state.side.id);
    localStorage.setItem(LS.gold, state.goldRush ? '1' : '0');
    localStorage.setItem(LS.replay, state.replay ? '1' : '0');
    localStorage.setItem(LS.slots, state.slots ? '1' : '0');
    localStorage.setItem(LS.adv, state.advanced ? '1' : '0');
    localStorage.setItem(LS.mult, state.mult);
    // A goal is a wish, not a fact about the world, so unlike where you stand it
    // does not go stale while you play and is safe to remember.
    localStorage.setItem(LS.mode, state.mode);
    localStorage.setItem(LS.goalAmt, state.goal.want);
    localStorage.setItem(LS.goalKey, state.goal.key);
  } catch (_) { /* private mode: the link still carries everything */ }
}

function init() {
  const sel = $('sideSelect');
  sel.innerHTML = SIDE_EVENTS
    .map((e) => `<option value="${e.id}">${e.name}: ${e.material}</option>`)
    .join('');

  // Guarded like the writes in save(): localStorage throws rather than returning
  // null in private mode, and a browser that refuses to remember must still run.
  const remembered = (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } };

  const savedSide = SIDE_EVENTS.find((e) => e.id === remembered(LS.side));
  if (savedSide) state.side = savedSide;
  if (remembered(LS.gold) === '0') state.goldRush = false;
  state.pins = Math.max(0, Number(remembered(LS.pins)) || 0);
  // Position is not read back, and versions that did store it are cleaned up.
  try { OLD_POS_KEYS.forEach((k) => localStorage.removeItem(k)); } catch (_) { /* fine */ }
  if (remembered(LS.replay) === '0') state.replay = false;
  if (remembered(LS.slots) === '0') state.slots = false;
  if (remembered(LS.adv) === '1') state.advanced = true;
  if (MULTIPLIERS.includes(Number(remembered(LS.mult)))) {
    state.mult = Number(remembered(LS.mult));
  }
  if (remembered(LS.mode) === 'want') state.mode = 'want';
  state.goal = {
    key: BUCKETS[remembered(LS.goalKey)] ? remembered(LS.goalKey) : 'pinball',
    want: Math.max(0, Number(remembered(LS.goalAmt)) || 0),
  };

  // A shared link wins over whatever this browser remembers.
  const q = new URLSearchParams(location.search);
  const qSide = SIDE_EVENTS.find((e) => e.id === q.get('e'));
  if (qSide) state.side = qSide;
  if (q.get('g') === '0') state.goldRush = false;
  if (q.get('g') === '1') state.goldRush = true;
  if (q.get('p') !== null) state.pins = Math.max(0, Math.floor(Number(q.get('p')) || 0));
  // A link carries the position, a refresh of your own page does not.
  if (!isReload) {
    if (q.get('r') !== null) {
      state.rung = Math.min(LADDER.length, Math.max(1, Math.floor(Number(q.get('r')) || 1)));
    }
    if (q.get('w') !== null) state.progress = Math.max(0, Math.floor(Number(q.get('w')) || 0));
  }
  if (q.get('y') === '0') state.replay = false;
  if (q.get('y') === '1') state.replay = true;
  if (q.get('b') === '0') state.slots = false;
  if (q.get('b') === '1') state.slots = true;
  if (q.get('s') === '1') state.advanced = true;
  if (q.get('s') === '0') state.advanced = false;
  if (MULTIPLIERS.includes(Number(q.get('m')))) state.mult = Number(q.get('m'));
  if (q.get('i') === 'g') state.mode = 'want';
  if (q.get('i') === 'p') state.mode = 'have';
  if (q.get('ga') !== null) state.goal.want = Math.max(0, Math.floor(Number(q.get('ga')) || 0));
  if (BUCKETS[q.get('gk')]) state.goal.key = q.get('gk');

  state.progress = Math.min(state.progress, LADDER[state.rung - 1].cost - 1);

  sel.value = state.side.id;
  $('goldRush').checked = state.goldRush;
  $('replay').checked = state.replay;
  $('slots').checked = state.slots;
  $('advanced').checked = state.advanced;
  $('pins').value = state.pins;
  $('rungCost').value = state.rung > 1 || state.progress ? LADDER[state.rung - 1].cost : 0;
  $('rungProgress').value = state.progress;

  sel.addEventListener('change', () => {
    state.side = SIDE_EVENTS.find((e) => e.id === sel.value) || SIDE_EVENTS[0];
    update();
  });

  $('goldRush').addEventListener('change', (e) => {
    state.goldRush = e.target.checked;
    update();
  });

  $('advanced').addEventListener('change', (e) => {
    state.advanced = e.target.checked;
    update();
  });

  $('replay').addEventListener('change', (e) => {
    state.replay = e.target.checked;
    update();
  });

  $('slots').addEventListener('change', (e) => {
    state.slots = e.target.checked;
    update();
  });

  // Percentile picker: the buttons, then dragging anywhere on the chart.
  $('distBox').querySelector('.dist-picks').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-pctl]');
    if (!btn) return;
    state.pctl = Number(btn.dataset.pctl);
    render();
  });

  const pickFromChart = (e) => {
    const svg = $('distSvg');
    if (!svg) return;
    const box = svg.getBoundingClientRect();
    if (!box.width) return;
    const f = Math.min(1, Math.max(0, (e.clientX - box.left) / box.width));

    /* The goal chart's axis is pinballs needed, so a position maps to a pin
       count, that to a point on the curve, and that to a luck: the cheap end of
       it is the lucky one, which is the 1 - f the line below undoes. */
    const goal = state.mode === 'want' && state.goal.want > 0
      ? goalSolve(state.goal.key, state.goal.want) : null;
    if (goal && goal.curve && state.advanced) {
      const c = goal.curve;
      const n = c[0].n + f * (c[c.length - 1].n - c[0].n);
      let p = c[c.length - 1].f;
      for (let i = 1; i < c.length; i++) {
        if (c[i].n >= n) {
          const span = c[i].n - c[i - 1].n;
          const t = span > 0 ? (n - c[i - 1].n) / span : 0;
          p = c[i - 1].f + t * (c[i].f - c[i - 1].f);
          break;
        }
      }
      state.pctl = Math.min(0.999, Math.max(0.001, 1 - p));
      render();
      return;
    }
    // The chart's x-axis is lightbulbs, so map the position to a bulb total and
    // take the percentile of the state nearest to it.
    const r = compute();
    const edge = (q) => {
      let acc = 0;
      for (const [k, p] of r.dist) { acc += p; if (acc >= q) return r.bulbsOf(k); }
      return r.bulbsOf(r.dist[r.dist.length - 1][0]);
    };
    const lo = edge(0.002), hi = edge(0.998);   // must match the drawn axis
    const want = lo + f * (hi - lo);
    let acc = 0, best = 0.5, bestGap = Infinity;
    for (const [k, p] of r.dist) {
      acc += p;
      const gap = Math.abs(r.bulbsOf(k) - want);
      if (gap < bestGap) { bestGap = gap; best = Math.min(0.999, acc); }
    }
    state.pctl = best;
    render();
  };
  const chart = $('distBox').querySelector('.dist-chart');
  chart.addEventListener('pointerdown', (e) => {
    chart.setPointerCapture(e.pointerId);
    pickFromChart(e);
  });
  chart.addEventListener('pointermove', (e) => {
    if (e.buttons) pickFromChart(e);
  });

  /* Goals drive the pinball box rather than replacing the page: solving for the
     pinballs and feeding them in means the whole results column answers "and
     what else do I collect on the way" for free. Pinballs are offered too, but
     as the total you get to PLAY, which is the number the quest counts. */
  $('goalKey').innerHTML = Object.keys(BUCKETS)
    .filter((k) => k !== 'unknown')
    .map((k) => `<option value="${k}">${bucketMeta(k).label}</option>`)
    .join('');
  $('goalKey').value = state.goal.key;
  $('goalAmount').value = state.goal.want || '';

  $('modeRow').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-mode]');
    if (btn) setMode(btn.dataset.mode);
  });

  /* Debounced, because every keystroke would otherwise set off a search whose
     every step is a full solve of the loop. Typing "10000" is five of those,
     four of them answering a number nobody meant. */
  let goalTimer = null;
  const readGoal = (wait) => {
    clearTimeout(goalTimer);
    goalTimer = setTimeout(() => {
      state.goal = {
        key: $('goalKey').value,
        want: Math.max(0, Math.floor(Number($('goalAmount').value) || 0)),
      };
      state.target = null;
      update();
    }, wait);
  };
  $('goalAmount').addEventListener('input', () => readGoal(250));
  $('goalKey').addEventListener('change', () => readGoal(0));

  $('multRow').innerHTML = MULTIPLIERS
    .map((m) => `<button data-mult="${m}">×${m}</button>`).join('');
  $('multRow').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-mult]');
    if (!btn) return;
    state.mult = Number(btn.dataset.mult);
    update();
  });

  $('pins').addEventListener('input', (e) => setPins(e.target.value));
  $('slider').addEventListener('input', (e) => setPins(e.target.value));
  $('rungCost').addEventListener('input', () => { refreshRungPicker(); update(); });
  $('rungPick').addEventListener('change', (e) => setRung(e.target.value));
  $('rungProgress').addEventListener('input', (e) => {
    const cap = LADDER[state.rung - 1].cost - 1;
    state.progress = Math.min(cap, Math.max(0, Math.floor(Number(e.target.value) || 0)));
    update();
  });

  $('quickAdd').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-add]');
    if (btn) setPins(state.pins + Number(btn.dataset.add));
  });

  $('clearAll').addEventListener('click', () => {
    state.rung = 1;
    state.progress = 0;
    $('rungCost').value = 0;
    $('rungProgress').value = 0;
    setPins(0);
    update();
  });

  // Clicking a rung answers the other question: how many pinballs get me there?
  $('ladderBody').addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-n]');
    if (!tr) return;
    smoothOnce = true;
    setPins(pinsForRung(Number(tr.dataset.n)), Number(tr.dataset.n));
  });

  $('replayLabel').textContent = `Use the pinball rewards from ${TRACK} immediately`;
  $('ladderHeading').textContent = `${TRACK} rewards`;

  initWipNotice();
  initHelp();
  render();
}

document.addEventListener('DOMContentLoaded', init);
