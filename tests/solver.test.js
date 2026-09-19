/* Tests for the reward ladder and the machine solver.

   Neither file touches the DOM, so both run in a bare vm context holding the two
   scripts index.html loads first, in that order. That is what a browser does
   with two <script src> tags, and the context is the module the tests read from.
   The page itself is tested in app.test.js.

   Run with: npm test  (node --test) */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

const ctx = vm.createContext({});
for (const f of ['data.js', 'machine.js']) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
}
// Everything below is declared with const or function, so none of it is a
// property of the context object. Read it out by evaluating its name instead.
const {
  LADDER, STAGES, STAGE_SPANS, SIDE_EVENTS, BUCKETS, MACHINE, MULTIPLIERS,
  CUM_COST, binomPmf, ladderReach, returnRate, solveLoop, pinsPaid,
} = vm.runInContext(`({
  LADDER, STAGES, STAGE_SPANS, SIDE_EVENTS, BUCKETS, MACHINE, MULTIPLIERS,
  CUM_COST, binomPmf, ladderReach, returnRate, solveLoop, pinsPaid,
})`, ctx);

/* ---------- the ladder ---------------------------------------------------- */

test('the ladder is 150 rewards in 13 stages', () => {
  assert.strictEqual(LADDER.length, 150);
  assert.strictEqual(STAGES.length, 13);
  assert.strictEqual(STAGE_SPANS.length, 13);
});

// The stage spans are what every position calculation indexes into, so a gap or
// an overlap would misplace a player rather than fail loudly.
test('the stage spans tile the ladder end to end', () => {
  assert.strictEqual(STAGE_SPANS[0].start, 0);
  STAGE_SPANS.forEach((s, g) => {
    if (g) assert.strictEqual(s.start, STAGE_SPANS[g - 1].end + 1, `stage ${g} starts where ${g - 1} ended`);
    assert.strictEqual(s.end - s.start, STAGES[g].length - 1, `stage ${g} holds its rewards`);
  });
  assert.strictEqual(STAGE_SPANS[STAGE_SPANS.length - 1].end, LADDER.length - 1);
});

/* The chart numbers a reward x/y within its stage, the grand prize being y/y.
   The first stage alone counts from 0, which is why it holds 11 rewards under
   /10 and every other stage holds exactly y. */
test('the first stage counts from 0 and the rest from 1', () => {
  assert.strictEqual(STAGE_SPANS[0].from, 0);
  assert.strictEqual(STAGES[0].length, STAGE_SPANS[0].of + 1);
  STAGE_SPANS.slice(1).forEach((s, i) => {
    assert.strictEqual(s.from, 1, `stage ${i + 1} counts from 1`);
    assert.strictEqual(STAGES[i + 1].length, s.of);
  });
});

test('every reward carries the counter its stage gives it', () => {
  LADDER.forEach((step, i) => {
    const s = STAGE_SPANS[step.stage];
    assert.strictEqual(step.x, s.from + (i - s.start), `reward ${i + 1} numbered within its stage`);
    assert.strictEqual(step.of, s.of);
  });
});

test('every reward pays a bucket the page has a tile for', () => {
  for (const step of LADDER) {
    assert.ok(BUCKETS[step.res], `${step.res} is a bucket`);
    assert.ok(step.cost > 0, 'a reward costs lightbulbs');
    if (step.off) assert.ok(BUCKETS[step.off.res], `${step.off.res} is a bucket`);
  }
});

/* A material reward pays the running event's own printed amount, or its candy
   when no side event is running. A missing amount would silently pay undefined
   in one event and be right in the other five. */
test('every material reward is priced for every side event', () => {
  const keys = SIDE_EVENTS.map((e) => e.mat).filter(Boolean);
  for (const step of LADDER.filter((s) => s.res === 'material')) {
    for (const k of keys) {
      assert.ok(step.qty[k] > 0, `material reward costing ${step.cost} pays ${k}`);
    }
    assert.ok(step.candy > 0, `material reward costing ${step.cost} has candy for no side event`);
  }
});

// Drinks pay energy drinks only while Gold Rush is running, so each one has to
// say what it pays the rest of the time.
test('every drink reward says what it pays without Gold Rush', () => {
  const drinks = LADDER.filter((s) => s.res === 'drink');
  assert.ok(drinks.length > 0);
  for (const step of drinks) {
    assert.ok(step.off && step.off.res && step.off.qty > 0, `drink costing ${step.cost} has an off payout`);
  }
});

test('the whole track is 332,940 lightbulbs', () => {
  assert.strictEqual(CUM_COST.length, LADDER.length);
  assert.strictEqual(CUM_COST[CUM_COST.length - 1], 332940);
  CUM_COST.forEach((c, i) => {
    assert.strictEqual(c, (i ? CUM_COST[i - 1] : 0) + LADDER[i].cost, `running total at reward ${i + 1}`);
  });
});

/* The loop has one more pinball source without Gold Rush: a drink reward that
   pays 120 pinballs instead of drinks. The solver and the page both branch on
   it, so they have to agree on how many rewards pay pinballs in each state. */
test('one more reward pays pinballs without Gold Rush', () => {
  const paying = (gold) => LADDER.filter((s) => pinsPaid(s, gold) > 0).length;
  assert.strictEqual(paying(true), 40);
  assert.strictEqual(paying(false), 41);
});

/* ---------- the machine --------------------------------------------------- */

test('the binomial is a distribution with the right mean', () => {
  for (const [n, p] of [[1, 0.255], [40, 0.255], [5000, 0.255], [40000, 0.22]]) {
    const { lo, p: pmf } = binomPmf(n, p);
    const sum = pmf.reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 1) < 1e-9, `n=${n} sums to 1`);
    assert.ok(pmf.every((x) => x >= 0), `n=${n} has no negative mass`);
    const mean = pmf.reduce((a, x, i) => a + x * (lo + i), 0);
    assert.ok(Math.abs(mean - n * p) < 1e-6 * Math.max(1, n * p), `n=${n} mean is np`);
  }
});

test('ladderReach is the running total of what the track has paid', () => {
  let last = { rung: 0, pins: 0 };
  for (let i = 0; i < LADDER.length; i++) {
    const before = ladderReach(CUM_COST[i] - 1, true);
    const at = ladderReach(CUM_COST[i], true);
    assert.strictEqual(before.rung, i, `reward ${i + 1} is not claimed one lightbulb short`);
    assert.strictEqual(at.rung, i + 1, `reward ${i + 1} is claimed on its last lightbulb`);
    assert.ok(at.pins >= last.pins, 'pinballs paid never go down');
    last = at;
  }
  // Past the end nothing more is paid, and the rung stops at the last reward.
  const past = ladderReach(CUM_COST[CUM_COST.length - 1] + 10000, true);
  assert.strictEqual(past.rung, LADDER.length);
  assert.strictEqual(past.pins, last.pins);
});

test('Gold Rush hands back fewer pinballs from the machine', () => {
  assert.ok(returnRate(true) < returnRate(false), 'less comes back during Gold Rush');
  assert.ok(returnRate(true) > 0 && returnRate(false) < 1, 'and the loop still converges');
});

test('1 pinball is 1.02 lightbulbs', () => {
  assert.ok(Math.abs(MACHINE.pBulb * MACHINE.perHit - 1.02) < 1e-12);
});

/* ---------- the solve ----------------------------------------------------- */

const dist = (pins, opts = {}) => {
  const { banked = 0, mult = 1, replay = true, gold = true, slots = true } = opts;
  return solveLoop(pins, banked, mult, replay, gold, slots);
};
const total = (d) => d.reduce((a, [, p]) => a + p, 0);
const meanK = (d) => d.reduce((a, [k, p]) => a + k * p, 0);
const sdK = (d) => {
  const m = meanK(d);
  return Math.sqrt(d.reduce((a, [k, p]) => a + p * (k - m) ** 2, 0));
};

test('the solve is a distribution, in order', () => {
  const d = dist(5000);
  assert.ok(Math.abs(total(d) - 1) < 1e-9, 'sums to 1');
  assert.ok(d.every(([, p]) => p >= 0), 'no negative mass');
  d.forEach(([k], i) => { if (i) assert.ok(k > d[i - 1][0], 'k ascends'); });
});

/* Nothing here is sampled, which is the whole reason the page can be dragged
   under a slider without the numbers jittering. */
test('the same inputs give the same answer every time', () => {
  const a = dist(3000, { mult: 10 }), b = dist(3000, { mult: 10 });
  assert.strictEqual(a.length, b.length);
  a.forEach(([k, p], i) => assert.deepStrictEqual([k, p], [b[i][0], b[i][1]]));
});

// Compared by value rather than with deepStrictEqual: the solve runs in a vm
// context, so its arrays carry that realm's prototype and never compare equal.
test('nothing to play is one outcome', () => {
  const d = dist(0);
  assert.strictEqual(d.length, 1);
  assert.deepStrictEqual([d[0][0], d[0][1]], [0, 1]);
});

/* With the loop off and the machine's own payback off, the whole thing is one
   binomial over the launches you can afford, which is a figure that can be
   written down rather than solved. */
test('with nothing coming back the solve is a single binomial', () => {
  for (const mult of [1, 10, 200]) {
    const d = dist(10000, { replay: false, slots: false, mult });
    const launches = Math.floor(10000 / mult);
    assert.ok(Math.abs(meanK(d) - launches * MACHINE.pBulb) < 0.01, `mean at x${mult}`);
    assert.ok(Math.abs(sdK(d) - Math.sqrt(launches * MACHINE.pBulb * (1 - MACHINE.pBulb))) < 0.01,
      `spread at x${mult}`);
  }
});

/* A launch at xn eats n pinballs and rolls ONCE for n times the reward, so the
   average haul does not move and the spread grows by sqrt(n). That is the whole
   reason the unit of play in the solver is the launch rather than the ball. */
test('a bigger launch keeps the average and widens the spread by its root', () => {
  const bulbs = (d, m) => meanK(d) * MACHINE.perHit * m;
  const spread = (d, m) => sdK(d) * MACHINE.perHit * m;
  const base = dist(10000, { replay: false, slots: false, mult: 1 });
  for (const mult of [10, 100]) {
    const d = dist(10000, { replay: false, slots: false, mult });
    assert.ok(Math.abs(bulbs(d, mult) / bulbs(base, 1) - 1) < 1e-6, `x${mult} pays the same on average`);
    const ratio = spread(d, mult) / spread(base, 1);
    assert.ok(Math.abs(ratio - Math.sqrt(mult)) < 0.02 * Math.sqrt(mult), `x${mult} spreads by its root`);
  }
});

test('more pinballs never win fewer lightbulbs', () => {
  let last = -1;
  for (const pins of [0, 100, 500, 2000, 8000, 20000]) {
    const m = meanK(dist(pins));
    assert.ok(m >= last, `${pins} pinballs is not worse than fewer`);
    last = m;
  }
});

// Two things hand pinballs back, and each of them can only add to what gets
// played. Turning either off can only make the haul smaller.
test('the track and the machine only ever add to the haul', () => {
  const bare = meanK(dist(10000, { replay: false, slots: false }));
  const track = meanK(dist(10000, { replay: true, slots: false }));
  const both = meanK(dist(10000, { replay: true, slots: true }));
  assert.ok(track > bare, 'replaying the track pinballs plays more');
  assert.ok(both > track, "the machine's own pinballs play more still");
});

/* Where you stand is credited once, not twice: the rungs behind you were
   collected and spent long ago. Starting banked partway up the track must not
   hand those pinballs over again. */
test('the rewards behind you are not paid out a second time', () => {
  const banked = CUM_COST[56];         // sitting on reward 58, well past several pinball rungs
  const from = dist(2000, { banked });
  const scratch = dist(2000, { banked: 0 });
  assert.ok(meanK(from) <= meanK(scratch) * 1.05,
    'a player partway up is not handed the whole track again');
  assert.ok(Math.abs(total(from) - 1) < 1e-9);
});

test('every launch size the page offers solves', () => {
  for (const mult of MULTIPLIERS) {
    const d = dist(20000, { mult });
    assert.ok(Math.abs(total(d) - 1) < 1e-9, `x${mult} sums to 1`);
    assert.ok(meanK(d) > 0, `x${mult} wins something`);
  }
});
