/* ============================================================================
   The machine.

   Lightbulbs are not spent, they are won: a pinball put through the machine
   pays 4 lightbulbs with probability .255, or 1 unit of event material with
   probability .22, or, while Gold Rush is running, 1 energy can at the same
   rate as the material (one reward per ball). Lightbulbs walk the ladder, the ladder
   pays pinballs back, and those get played too, so the thing is a loop.

   It is solved exactly, not sampled. Every pin is eventually played, so the
   total number played is fixed by the number of bulb-hits k:

       T(k) = pinsInHand + R(banked + 4k) - R(banked)

   where R(b) is the pinballs the ladder has paid by bulb-total b, so the
   subtraction is the rungs behind you, collected long ago and not yours to play
   again. R only steps
   at the 18 pinball rungs, so T(k) takes about 19 distinct values. Between two
   of them nothing can run out, so the distribution over k jumps from one
   boundary to the next in a single binomial convolution, about 19 convolutions for
   the whole event, a few milliseconds, and the same answer every time (a
   sampled one would jitter under the slider).
   ========================================================================= */

const MACHINE = {
  pBulb: 0.255,   // chance a launch pays lightbulbs
  perHit: 4,      // lightbulbs when it does, per pinball in the launch
  pMat: 0.22,     // chance a launch pays event material
  pCan: 0.22,     // chance a launch pays energy cans, while Gold Rush is running

  /* ---- pinballs that come back from the machine itself ----------------------
     Some slots pay pinballs, which get played in turn: a second feedback loop
     alongside the one the reward track makes. One reward per launch, so these
     are exclusive with the two outcomes above.

     `rate` is what comes back per ball played, `var` how much that varies, both
     per ball, so a ×n launch is n times the lot, the same way bulbs and material
     scale. The payout is lumpy rather than fixed, which is why the variance is
     carried separately and is far larger than the mean: most launches pay
     nothing and a few pay a great deal.

     Gold Rush is the second row. While it runs, one of the paying slots spends
     part of its share on energy cans, so less comes back. */
  pinBack: {
    normal: { rate: 0.090597, var: 1.158330 },
    gold:   { rate: 0.054091, var: 0.633099 },
  },
};

/* Pinballs returned per pinball played, from the machine's own slots. Gold Rush
   changes it, so it is asked for rather than looked up. */
function returnRate(gold) {
  return Math.min(0.95, MACHINE.pinBack[gold ? 'gold' : 'normal'].rate);
}

/* Launch sizes the machine offers. A launch at ×n eats n pinballs and rolls
   ONCE, paying n times the single-ball reward, so the mean is untouched and
   the standard deviation grows by √n. Playing 1,000 balls at ×100 is ten rolls,
   not a thousand. */
const MULTIPLIERS = [1, 2, 3, 5, 10, 20, 40, 60, 100, 150, 200];

/* Lanczos log-gamma, so the binomial can be taken in logs at n ~ 40,000. */
function lgamma(z) {
  const g = [676.5203681218851, -1259.1392167224028, 771.32342877765313,
             -176.61502916214059, 12.507343278686905, -0.13857109526572012,
             9.9843695780195716e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lgamma(1 - z);
  z -= 1;
  let x = 0.99999999999980993;
  for (let i = 0; i < g.length; i++) x += g[i] / (z + i + 1);
  const t = z + g.length - 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

/* Binomial pmf trimmed to ±10σ and renormalised: { lo, p[] }. */
function binomPmf(n, p) {
  if (n <= 0) return { lo: 0, p: [1] };
  const mean = n * p, sd = Math.sqrt(n * p * (1 - p));
  const lo = Math.max(0, Math.floor(mean - 10 * sd - 5));
  const hi = Math.min(n, Math.ceil(mean + 10 * sd + 5));
  const lg = (x) => lgamma(x + 1);
  const out = [];
  let max = -Infinity;
  for (let k = lo; k <= hi; k++) {
    const l = lg(n) - lg(k) - lg(n - k) + k * Math.log(p) + (n - k) * Math.log(1 - p);
    out.push(l);
    if (l > max) max = l;
  }
  let sum = 0;
  for (let i = 0; i < out.length; i++) { out[i] = Math.exp(out[i] - max); sum += out[i]; }
  for (let i = 0; i < out.length; i++) out[i] /= sum;
  return { lo, p: out };
}

/* Cumulative pinballs the ladder has paid once `bulbs` have been banked, plus
   how far down the ladder that is. */
function ladderReach(bulbs) {
  let spent = 0, pins = 0, rung = 0;
  for (let i = 0; i < LADDER.length; i++) {
    if (spent + LADDER[i].cost > bulbs) break;
    spent += LADDER[i].cost;
    rung++;
    if (LADDER[i].res === 'pinball') pins += LADDER[i].qty;
  }
  return { rung, pins };
}

/* -> [[k, probability], ...] for the final number of winning launches, for one
   given stretch of the pile.

   With a launch size of `mult` the unit of play is a launch, not a ball: k
   winning launches are worth 4·mult lightbulbs each, and the number of launches
   a state can afford is floor(pinsAvailable / mult), and the remainder is a stub
   too small to fire.

   `stretch` is how far the machine's own payback carries what you hold, 1 when
   nothing comes back. It is a parameter rather than a lookup because it is not
   one number: solveLoop() below runs this at several and mixes them. */
function solveMachine(pins, banked, mult = 1, replay = true, stretch = 1) {
  const m = Math.max(1, Math.floor(mult));
  const bulbsAt = (k) => banked + MACHINE.perHit * m * k;
  /* The ladder's pinballs are credited from where you STAND, not from rung 1.
     `ladderReach(bulbs).pins` is everything the track has ever paid by that
     bulb total, and the rungs behind you were collected and spent long ago, so
     handing them over again is inventing pinballs: about 4,000 of them at
     reward 57. Only what the track pays from here on is playable. */
  const already = ladderReach(banked).pins;
  // With replay off there is no loop at all: you fire what you hold, and the
  // pinballs the ladder pays are kept rather than played, so the target never
  // moves and the whole thing is one convolution.
  const target = (k) =>
    Math.floor(((pins + (replay ? ladderReach(bulbsAt(k)).pins - already : 0)) * stretch) / m);

  /* `live` is dense: live[i] is P(k = lo + i). A Map cost more in hashing than
     the convolution cost in arithmetic, and the run of k values is contiguous
     anyway. Everything below leans on `target` only ever rising with k, which
     makes the nearest target the one at `lo` and makes the states that have
     stopped a prefix rather than a scatter. */
  let lo = 0;
  let live = Float64Array.of(1);
  const done = new Map();
  let played = 0;   // launches fired so far

  for (let guard = 0; live.length && guard < 200; guard++) {
    // Nothing can run out before the nearest target, so jump straight to it.
    const next = target(lo);
    const step = next - played;
    if (step <= 0) break;

    const pmf = binomPmf(step, MACHINE.pBulb);
    const grown = new Float64Array(live.length + pmf.p.length - 1);
    for (let i = 0; i < live.length; i++) {
      const pr = live[i];
      if (pr < 1e-18) continue;
      for (let j = 0; j < pmf.p.length; j++) grown[i + j] += pr * pmf.p[j];
    }
    played = next;

    // Trim the negligible ends, or a tail worth 1e-300 drags the next step down
    // to nothing and the whole walk runs out of iterations.
    let a = 0, b = grown.length;
    while (a < b && grown[a] < 1e-15) a++;
    while (b > a && grown[b - 1] < 1e-15) b--;
    lo += pmf.lo + a;
    live = grown.subarray(a, b);

    // Whatever can no longer afford a launch has finished. That is a prefix.
    let cut = 0;
    while (cut < live.length && target(lo + cut) <= played) {
      done.set(lo + cut, (done.get(lo + cut) || 0) + live[cut]);
      cut++;
    }
    lo += cut;
    live = live.subarray(cut);
  }
  for (let i = 0; i < live.length; i++) {
    done.set(lo + i, (done.get(lo + i) || 0) + live[i]);
  }

  return [...done.entries()].sort((a, b) => a[0] - b[0]);
}

/* Three point Gauss-Hermite, rescaled to a standard normal: the points and
   weights that reproduce a normal's shape with three samples of it, exact for
   anything polynomial up to the fifth power. Five points were tried and agreed
   with a simulation no better, for nearly twice the work. */
const NORMAL_POINTS = [
  { z: -1.7320508, w: 0.1666667 },
  { z: 0,          w: 0.6666667 },
  { z: 1.7320508,  w: 0.1666667 },
];

/* -> [[k, probability], ...], the whole loop, with the machine's own pinball
   payback treated as the random thing it is.

   What comes back is NOT a fixed fraction of the pile. Most launches pay
   nothing and a few pay a lot, so the number of launches you get to fire is
   itself a distribution, and at ×200 that is the difference between a run that
   fires 63 launches and one that fires 70. Stretching the pile by the average
   hands every run a payback that two runs in three will not see.

   The pile is a branching process: every ball played spawns `rate` more on
   average, so what you end up playing from a seed of N has mean N/(1-rate) and
   variance N·var/(1-rate)³, the standard total progeny result, and is normal
   enough at these counts. So the solve is run at five stretches drawn from that
   and mixed. The seed is what has to be paid for, your own pinballs plus what
   the track hands back, taken from a first pass at the average.

   Costs a handful of solves rather than one. The convolution above is dense and
   cheap enough to pay for it. */
function solveLoop(pins, banked, mult = 1, replay = true, gold = false, slots = true) {
  const back = slots ? MACHINE.pinBack[gold ? 'gold' : 'normal'] : { rate: 0, var: 0 };
  const mu = Math.min(0.95, back.rate);
  const mean = 1 / (1 - mu);
  if (!(back.var > 0) || pins <= 0) return solveMachine(pins, banked, mult, replay, mean);

  /* The seed is what the payback works on: your own pinballs, plus what the
     track hands back on the way, since those get played and pay slots too. Read
     off the plain average walk rather than a solve of its own, because it only
     sets how wide the spread is, and a solve to place the width of a spread is
     a solve too many. */
  const m = Math.max(1, Math.floor(mult));
  const already = ladderReach(banked).pins;
  let played = 0, hand = pins * mean, paid = already;
  for (let i = 0; i < 80 && hand >= 1e-9; i++) {
    played += hand;
    const R = ladderReach(banked + MACHINE.pBulb * MACHINE.perHit * played);
    hand = replay ? (R.pins - paid) * mean : 0;
    paid = R.pins;
  }
  const seed = Math.max(1, pins + paid - already);
  /* The `m` is the launch size, and it belongs here. A launch of m balls pays m
     times the single ball payout, which is exactly one launch's worth again, so
     in launch units every size of launch spawns the same number of children and
     a seed of N balls is only N/m of them. Fewer, bigger children is a wider
     spread: the variance of what you end up playing grows with the launch size
     even though its average does not, the same way the lightbulbs do. */
  const sd = Math.sqrt((m * back.var) / (Math.pow(1 - mu, 3) * seed));

  /* The points are taken on what comes BACK rather than on the stretch itself,
     because what comes back cannot be negative and a normal's lower tail can.
     Cutting it there would quietly hand the average run more than it should
     get: at ×200 the mean payback is a twentieth of the pile and its spread is
     twice that, so two of the five points fall below zero, and clipping them
     put 2.6% on every figure. So they are clipped and then rescaled to carry
     the average they are supposed to carry, which keeps the mean exact and
     leaves the shape leaning the way the real thing leans, most runs below
     average and a few well above. */
  const devs = NORMAL_POINTS.map(({ z }) => Math.max(0, (mean - 1) + z * sd));
  let carried = 0;
  NORMAL_POINTS.forEach(({ w }, i) => { carried += w * devs[i]; });
  const fix = carried > 0 ? (mean - 1) / carried : 0;

  const mix = new Map();
  NORMAL_POINTS.forEach(({ w }, i) => {
    for (const [k, pr] of solveMachine(pins, banked, mult, replay, 1 + devs[i] * fix)) {
      mix.set(k, (mix.get(k) || 0) + w * pr);
    }
  });
  return [...mix.entries()].sort((a, b) => a[0] - b[0]);
}
