/* ============================================================================
   The machine.

   Lightbulbs are not spent, they are won: a pinball put through the machine
   pays 4 lightbulbs with probability .255, or 1 unit of event material with
   probability .22 (one reward per ball). Lightbulbs walk the ladder, the ladder
   pays pinballs back, and those get played too, so the thing is a loop.

   It is solved exactly, not sampled. Every pin is eventually played, so the
   total number played is fixed by the number of bulb-hits k:

       T(k) = pinsInHand + R(banked + 4k)

   where R(b) is the pinballs the ladder has paid by bulb-total b. R only steps
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
};

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

/* -> [[k, probability], ...] for the final number of winning launches.

   With a launch size of `mult` the unit of play is a launch, not a ball: k
   winning launches are worth 4·mult lightbulbs each, and the number of launches
   a state can afford is floor(pinsAvailable / mult), and the remainder is a stub
   too small to fire. */
function solveMachine(pins, banked, mult = 1, replay = true) {
  const m = Math.max(1, Math.floor(mult));
  const bulbsAt = (k) => banked + MACHINE.perHit * m * k;
  // With replay off there is no loop at all: you fire what you hold, and the
  // pinballs the ladder pays are kept rather than played, so the target never
  // moves and the whole thing is one convolution.
  const target = (k) =>
    Math.floor((pins + (replay ? ladderReach(bulbsAt(k)).pins : 0)) / m);

  let live = new Map([[0, 1]]);
  const done = new Map();
  let played = 0;   // launches fired so far

  for (let guard = 0; live.size && guard < 200; guard++) {
    // Nothing can run out before the nearest target, so jump straight to it.
    let next = Infinity;
    for (const k of live.keys()) next = Math.min(next, target(k));
    const step = next - played;
    if (step <= 0) break;

    const pmf = binomPmf(step, MACHINE.pBulb);
    const grown = new Map();
    for (const [k, pr] of live) {
      for (let i = 0; i < pmf.p.length; i++) {
        const w = pr * pmf.p[i];
        if (w < 1e-15) continue;
        const kk = k + pmf.lo + i;
        grown.set(kk, (grown.get(kk) || 0) + w);
      }
    }
    played = next;

    live = new Map();
    for (const [k, pr] of grown) {
      if (target(k) <= played) done.set(k, (done.get(k) || 0) + pr);
      else live.set(k, pr);
    }
  }
  for (const [k, pr] of live) done.set(k, (done.get(k) || 0) + pr);

  return [...done.entries()].sort((a, b) => a[0] - b[0]);
}
