/* Tests for the page: the real index.html booted in jsdom, driven through the
   DOM the way a player drives it, plus the figures the page works out. The
   ladder data and the solver on their own are tested in solver.test.js.

   Run with: npm test  (node --test) */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');

/* The page is index.html plus three sibling files loaded as classic
   <script src>/<link>, which is what keeps file:// working. jsdom's
   runScripts:"dangerously" does not fetch external scripts, and turning on
   resources:"usable" would make every boot asynchronous, so the scripts are
   inlined in place instead: same files, same order, and a classic script has no
   other load semantics to preserve. The stylesheet is dropped, since jsdom does
   not lay anything out anyway. The analytics tag is dropped with it, having
   nothing to do with the page's behaviour. */
const inlineAssets = (html) =>
  html
    .replace(/<script data-goatcounter[\s\S]*?<\/script>/g, '')
    .replace(/<script src="([^"]+)"><\/script>/g,
      (_, src) => '<script>' + fs.readFileSync(path.join(ROOT, src), 'utf8') + '</script>')
    .replace(/<link rel="stylesheet"[^>]*>/g, '');

const HTML = inlineAssets(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'));

/* Boot a fresh page and collect any uncaught error, so a test can assert none.

   The page boots itself off DOMContentLoaded, and jsdom fires that after the
   constructor returns, so this waits for it rather than dispatching it by hand:
   a hand-fired event would boot a page the browser had not finished, and would
   pass whether or not the real wiring works.

   Each JSDOM gets its own localStorage, so boots start clean unless a shim is
   passed in, which is how a refresh is simulated. */
async function boot({ storage, query = '' } = {}) {
  const errors = [];
  const { window } = new JSDOM(HTML, {
    url: 'https://example.invalid/' + query,
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(win) {
      if (storage) Object.defineProperty(win, 'localStorage', { value: storage, configurable: true });
      win.addEventListener('error', (e) => errors.push(e.error ? e.error.stack : e.message));
    },
  });
  if (window.document.readyState === 'loading') {
    await new Promise((done) => window.document.addEventListener('DOMContentLoaded', done, { once: true }));
  }
  return { window, doc: window.document, errors };
}

// Minimal in-memory Storage, kept across boot() calls to act as a refresh.
function makeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    clear: () => map.clear(),
  };
}

/* data.js, machine.js and app.js declare everything with const or function, so
   almost none of it is a property of window. Reach it by evaluating in the page
   instead, which is also the only way to read `state`. */
const ev = (win, expr) => win.eval('(' + expr + ')');
const run = (win, code) => win.eval('(() => { ' + code + ' })()');

const $ = (doc, id) => doc.getElementById(id);
const click = (win, el) => el.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
const fire = (win, el, type) => el.dispatchEvent(new win.Event(type, { bubbles: true }));
const row = (doc, n) => $(doc, 'ladderBody').querySelector(`tr[data-n="${n}"]`);

// Put the page in a given state and re-render, the way a control would.
const setState = (win, patch) => run(win, `Object.assign(state, ${JSON.stringify(patch)}); update();`);

/* Where you stand cannot be assigned: render() re-derives the rung from the two
   Grand Prize Progress boxes every time, which is what keeps the counter and
   the position from drifting apart. So move the boxes, the way a player does. */
const standOn = (win, n) => run(win, `
  state.rung = ${n}; state.progress = 0;
  const c = counterFor(${n});
  $('stageY').value = c.of; $('stageX').value = c.x;
  update();`);

/* ---------- booting ------------------------------------------------------- */

test('boots clean, with the whole ladder on the page', async () => {
  const { doc, errors } = await boot();
  assert.strictEqual(errors.length, 0, errors.join('\n'));
  assert.strictEqual($(doc, 'ladderBody').children.length, 150);
  assert.match($(doc, 'ladderTotal').textContent, /150 rewards in 13 stages/);
  assert.match($(doc, 'summary').textContent, /lightbulbs/);
});

test('a fresh page holds nothing and is in "what do I get" mode', async () => {
  const { window, doc } = await boot();
  assert.strictEqual(ev(window, 'state.pins'), 0);
  assert.strictEqual(ev(window, 'state.mode'), 'have');
  assert.strictEqual($(doc, 'haveBox').hidden, false);
  assert.strictEqual($(doc, 'wantBox').hidden, true);
});

/* ---------- what the page works out --------------------------------------- */

/* The sum the whole pinball account rests on. Two things hand pinballs back and
   a launch too small to fire strands the rest, so if these do not add up the
   page is inventing or losing balls. Whole numbers, at every launch size. */
test('yours + track + machine = played + left over', async () => {
  const { window } = await boot();
  for (const mult of [1, 10, 100, 200]) {
    for (const [replay, slots] of [[true, true], [false, true], [true, false]]) {
      setState(window, { pins: 12000, mult, replay, slots });
      const s = ev(window, 'compute().sel');
      const sum = 12000 + s.fromLadder + s.fromSlots;
      assert.ok(Math.abs(sum - (s.played + s.stub)) < 1e-6,
        `x${mult} replay=${replay} slots=${slots}: ${sum} in, ${s.played} played + ${s.stub} stranded`);
      assert.ok(s.stub >= 0 && s.stub < mult + 1, `the stub is smaller than one launch at x${mult}`);
    }
  }
});

// Every quantity the page shows rises with the lightbulb count, which is what
// lets one quantile of k answer for all of them.
test('the bands run low to high', async () => {
  const { window } = await boot();
  setState(window, { pins: 8000, mult: 100, ranges: true });
  const r = ev(window, `(() => { const r = compute();
    return { b: r.bulbs, g: r.rung, w: r.pinsWon }; })()`);
  assert.ok(r.b.p10 <= r.b.p50 && r.b.p50 <= r.b.p90, 'lightbulbs');
  assert.ok(r.g.p10 <= r.g.p50 && r.g.p50 <= r.g.p90, 'rewards claimed');
  assert.ok(r.w.p10 <= r.w.p90, 'pinballs won');
});

test('more pinballs never claim fewer rewards', async () => {
  const { window } = await boot();
  let last = -1;
  for (const pins of [0, 200, 1000, 5000, 20000]) {
    setState(window, { pins });
    const rung = ev(window, 'compute().sel.rung');
    assert.ok(rung >= last, `${pins} pinballs reaches at least as far as fewer`);
    last = rung;
  }
});

/* Quoted in the README and in ARCHITECTURE. It moves if the ladder data is
   corrected or the machine's payback is re-measured, and when it moves those
   two are stale, which is the point of pinning it here. */
test('clearing the track costs about 270,100 pinballs during Gold Rush', async () => {
  const { window } = await boot();
  setState(window, { goldRush: true, replay: true, slots: true });
  const gold = ev(window, 'pinsToClear()');
  setState(window, { goldRush: false });
  const plain = ev(window, 'pinsToClear()');
  assert.ok(Math.abs(gold - 270100) < 2000, `Gold Rush clear is ${gold}, README says about 270,100`);
  assert.ok(Math.abs(plain - 258100) < 2000, `plain clear is ${plain}, README says about 258,100`);
});

test('the pinballs to reach a reward are 0 behind you and real ahead', async () => {
  const { window } = await boot();
  for (let n = 1; n <= 150; n++) {
    assert.ok(ev(window, `pinsForRung(${n})`) > 0, `reward ${n} costs something from the start`);
  }
  standOn(window, 40);
  assert.strictEqual(ev(window, 'pinsForRung(39)'), 0, 'a reward already claimed is free');
  // The one being worked on is not claimed yet, so it still costs something.
  assert.ok(ev(window, 'pinsForRung(40)') > 0, 'the card you are on still has to be paid for');
  assert.ok(ev(window, 'pinsForRung(41)') > ev(window, 'pinsForRung(40)'), 'and the one after costs more');
});

/* The column is NOT a rising one, and that surprises people. A reward that pays
   pinballs funds part of the way to the next, so the next costs fewer of your
   own: reward 1 costs 80 lightbulbs and hands back 80 pinballs, which is most
   of the way to reward 2. Pinned here so nobody "fixes" it into a sorted
   column. */
test('a reward that pays pinballs makes the next one cheaper', async () => {
  const { window } = await boot();
  const need = (n) => ev(window, `pinsForRung(${n})`);
  assert.ok(need(2) < need(1), `reward 1 pays its own way: ${need(1)} then ${need(2)}`);
  // Lightbulbs are the thing that only rises, which is what the solver leans on.
  const cum = ev(window, 'CUM_COST');
  cum.forEach((c, i) => { if (i) assert.ok(c > cum[i - 1], `lightbulbs rise at reward ${i + 1}`); });
});

/* ---------- saying where you are ------------------------------------------ */

/* The event window reads a grand prize as 0 of the NEXT stage, so the two
   directions of that mapping have to agree on every reward or a player lands
   somewhere they did not say. */
test('the event window counter round-trips on all 150 rewards', async () => {
  const { window } = await boot();
  const spans = ev(window, 'STAGE_SPANS');
  for (let n = 1; n <= 150; n++) {
    const c = ev(window, `counterFor(${n})`);
    // Which stage the picker would be showing for that counter: the one the
    // reward belongs to, except a grand prize, which reads as the next stage.
    const g = ev(window, `(() => { const s = LADDER[${n - 1}];
      return STAGE_SPANS[s.stage].end === ${n - 1} && STAGE_SPANS[s.stage + 1]
        ? s.stage + 1 : s.stage; })()`);
    assert.strictEqual(c.of, spans[g].of, `reward ${n} reads under its stage size`);
    assert.strictEqual(ev(window, `rungAt(${g}, ${c.x})`), n, `reward ${n} round-trips`);
  }
});

// A player who has not started sees 0/10, and that 0 is the very first reward
// rather than the grand prize of a stage before it, which there is not one of.
test('0/10 is the first reward, not a grand prize', async () => {
  const { window } = await boot();
  assert.strictEqual(ev(window, 'rungAt(0, 0)'), 1);
  const c = ev(window, 'counterFor(1)');
  assert.deepStrictEqual([c.x, c.of], [0, 10]);
});

/* Two stages of 8 both end on 500 Pinballs, back to back, and at 4/8 and 6/8
   even the reward being worked on matches. The picker has to tell them apart or
   the position is a coin flip. */
test('the two stages that end alike are named the first and the second', async () => {
  const { window } = await boot();
  const labels = ev(window, 'STAGE_SPANS.map((s, g) => stageLabel(g))');
  const alike = labels.filter((l) => /500 Pinballs at 8\/8/.test(l));
  assert.strictEqual(alike.length, 2, 'there are two of them');
  assert.ok(alike[0].endsWith('the first') && alike[1].endsWith('the second'), alike.join(' | '));
  assert.strictEqual(new Set(labels).size, labels.length, 'every stage is named uniquely');
});

/* ---------- working back from a goal -------------------------------------- */

/* The answer is the pinballs to bring, so bringing them has to actually get
   there. Checked against the same average walk the rest of the page reads. */
test('the pinballs a goal asks for reach the goal', async () => {
  const { window } = await boot();
  setState(window, { mode: 'want' });
  for (const [key, want] of [['tatari', 300], ['material', 4000], ['card', 3], ['pinball', 20000]]) {
    const g = ev(window, `goalSolve('${key}', ${want})`);
    assert.ok(g.pins > 0, `${key} has an answer`);
    assert.ok(ev(window, `amountOf(${g.pins}, '${key}')`) >= want * 0.999,
      `${g.pins} pinballs really do win ${want} ${key}`);
  }
});

test('a surer answer costs more than a luckier one', async () => {
  const { window } = await boot();
  setState(window, { mode: 'want', ranges: true, mult: 100 });
  const g = ev(window, "goalSolve('tatari', 300)");
  assert.ok(g.lucky <= g.pins && g.pins <= g.sure,
    `10% ${g.lucky}, 50% ${g.pins}, 90% ${g.sure} should ascend`);
});

/* Asking for more than the track holds is answered rather than refused: the
   page solves for what is left and says so, because a bare "not possible"
   leaves every other figure describing nothing. */
test('asking past the ceiling is answered at the ceiling', async () => {
  const { window, doc } = await boot();
  setState(window, { mode: 'want', goal: { key: 'tatari', want: 99999 } });
  const g = ev(window, 'goalSolve(state.goal.key, state.goal.want)');
  assert.strictEqual(g.possible, false);
  assert.ok(g.ceiling > 0 && g.ceiling < 99999);
  assert.ok(g.pins > 0, 'it still solves, for what is left');
  assert.match($(doc, 'summary').textContent, new RegExp(`Only .* left on`), 'and says so above the figures');
});

// A ceiling of 0 has a reason, and the reason is a setting the player can
// change, so the note names it rather than reading as the track being empty.
test('a goal a setting has switched off says which setting', async () => {
  const { window, doc } = await boot();
  setState(window, { mode: 'want', goldRush: false, goal: { key: 'drink', want: 100 } });
  assert.match($(doc, 'goalNote').textContent, /Gold Rush/);
  setState(window, { mode: 'want', goldRush: true });
  run(window, "$('sideSelect').value = 'none'; $('sideSelect').dispatchEvent(new Event('change', { bubbles: true }));");
  setState(window, { goal: { key: 'material', want: 100 } });
  assert.match($(doc, 'goalNote').textContent, /side event/);
});

/* ---------- the controls -------------------------------------------------- */

test('the two modes are never both on screen', async () => {
  const { window, doc } = await boot();
  click(window, $(doc, 'modeRow').children[1]);
  assert.strictEqual(ev(window, 'state.mode'), 'want');
  assert.strictEqual($(doc, 'haveBox').hidden, true);
  assert.strictEqual($(doc, 'wantBox').hidden, false);
  click(window, $(doc, 'modeRow').children[0]);
  assert.strictEqual($(doc, 'haveBox').hidden, false);
  assert.strictEqual($(doc, 'wantBox').hidden, true);
});

test('the steps add and take away, and stop at nothing', async () => {
  const { window, doc } = await boot();
  const step = (i) => click(window, $(doc, 'quickAdd').children[i]);
  const minus = () => [...$(doc, 'quickAdd').children].filter((b) => Number(b.dataset.add) < 0);

  assert.ok(minus().every((b) => b.disabled), 'nothing to take away from at 0');
  step(5);                                     // +500
  assert.strictEqual(ev(window, 'state.pins'), 500);
  assert.ok(minus().every((b) => !b.disabled), 'and they wake up');
  step(1);                                     // -500
  assert.strictEqual(ev(window, 'state.pins'), 0);
  step(7); step(0);                            // +5,000 then -100
  assert.strictEqual(ev(window, 'state.pins'), 4900);
  step(3);                                     // -5,000, more than is there
  assert.strictEqual(ev(window, 'state.pins'), 0, 'clamped rather than negative');
});

test('clicking a reward fills in the pinballs it takes and stars it', async () => {
  const { window, doc } = await boot();
  click(window, row(doc, 45));
  assert.strictEqual(ev(window, 'state.pins'), ev(window, 'pinsForRung(45)'));
  assert.strictEqual(ev(window, 'state.target'), 45);
  assert.match(row(doc, 45).className, /target/);
});

/* In "want" mode the pinballs are the answer, so a click has nothing to fill.
   It used to switch the mode back and overwrite the goal, which is a bigger
   thing than a row click looks like it does. */
test('the ladder takes no clicks while the pinballs are the answer', async () => {
  const { window, doc } = await boot();
  setState(window, { mode: 'want', goal: { key: 'tatari', want: 100 } });
  const before = ev(window, 'state.pins');
  click(window, row(doc, 90));
  assert.strictEqual(ev(window, 'state.mode'), 'want', 'the mode is left alone');
  assert.strictEqual(ev(window, 'state.pins'), before, 'and so is the answer');
  assert.ok($(doc, 'ladder').classList.contains('no-pick'), 'the rows stop inviting a click');
  assert.strictEqual(row(doc, 90).title, '', 'and drop the tooltip that asked for one');
  assert.match($(doc, 'ladderHint').textContent, /not clickable/);
});

/* The x2 boost arrives in two fixed lumps and the track is walked in order, so
   the only totals reachable are the running sums of the ones still ahead. */
test('the x2 goal offers what is actually reachable, from where you stand', async () => {
  const { window, doc } = await boot();
  const offered = () => [...$(doc, 'goalStep').options].map((o) => o.textContent);
  setState(window, { mode: 'want', goal: { key: 'boost', want: 5 } });

  assert.strictEqual($(doc, 'goalAmountBox').hidden, true, 'the number box gives up its place');
  assert.strictEqual($(doc, 'goalStepBox').hidden, false);
  assert.deepStrictEqual(offered(), ['5 min', '15 min'], 'never 7, and never 10 on its own');

  // Past the first of the two, only the second is left, and a remembered total
  // that is no longer reachable snaps to what is.
  setState(window, { goal: { key: 'boost', want: 15 } });
  standOn(window, 8);
  assert.deepStrictEqual(offered(), ['10 min']);
  assert.strictEqual(ev(window, 'state.goal.want'), 10);

  // Past both, there is nothing to pick and the note says why.
  standOn(window, 40);
  assert.strictEqual($(doc, 'goalStep').disabled, true);
  assert.strictEqual(ev(window, 'state.goal.want'), 0);
  assert.match($(doc, 'goalNote').textContent, /No x2 Multiplier left/);

  // A typed bucket gets its number box back.
  setState(window, { goal: { key: 'tatari', want: 50 } });
  assert.strictEqual($(doc, 'goalAmountBox').hidden, false);
  assert.strictEqual($(doc, 'goalStepBox').hidden, true);
});

// The material bucket is named by the side event, so the goal picker's label
// goes stale the moment the event changes.
test('the goal picker follows the side event', async () => {
  const { window, doc } = await boot();
  setState(window, { mode: 'want', goal: { key: 'material', want: 100 } });
  const label = () => [...$(doc, 'goalKey').options].find((o) => o.value === 'material').textContent;
  run(window, "$('sideSelect').value = 'fishing'; $('sideSelect').dispatchEvent(new Event('change', { bubbles: true }));");
  assert.strictEqual(label(), 'Fishing Rods');
  run(window, "$('sideSelect').value = 'raft'; $('sideSelect').dispatchEvent(new Event('change', { bubbles: true }));");
  assert.strictEqual(label(), 'Raft');
});

test('every launch size the page offers renders', async () => {
  const { window, doc, errors } = await boot();
  setState(window, { pins: 10000 });
  for (const b of [...$(doc, 'multRow').children]) {
    click(window, b);
    assert.strictEqual(ev(window, 'state.mult'), Number(b.dataset.mult));
    assert.ok($(doc, 'summary').textContent.length > 0, `x${b.dataset.mult} renders`);
  }
  assert.strictEqual(errors.length, 0, errors.join('\n'));
});

/* ---------- what is remembered -------------------------------------------- */

/* A goal is a wish rather than a fact about the world, so it survives a
   refresh. Where you stand is the opposite: you play, the card moves, and the
   page has no way to know, so being asked again beats being silently wrong. */
test('a refresh remembers the goal and forgets where you stand', async () => {
  const storage = makeStorage();
  const first = await boot({ storage });
  setState(first.window, { mode: 'want', goal: { key: 'card', want: 4 }, rung: 60, progress: 40 });

  const again = await boot({ storage });
  assert.strictEqual(ev(again.window, 'state.mode'), 'want');
  assert.strictEqual(ev(again.window, 'state.goal.key'), 'card');
  assert.strictEqual(ev(again.window, 'state.goal.want'), 4);
  assert.strictEqual(ev(again.window, 'state.rung'), 1, 'where you stand is asked again');
  assert.strictEqual(ev(again.window, 'state.progress'), 0);
});

test('the settings survive a refresh', async () => {
  const storage = makeStorage();
  const first = await boot({ storage });
  setState(first.window, { pins: 3000, mult: 100, goldRush: false, replay: false, slots: false, ranges: true });

  const again = await boot({ storage });
  assert.strictEqual(ev(again.window, 'state.pins'), 3000);
  assert.strictEqual(ev(again.window, 'state.mult'), 100);
  assert.strictEqual(ev(again.window, 'state.goldRush'), false);
  assert.strictEqual(ev(again.window, 'state.replay'), false);
  assert.strictEqual(ev(again.window, 'state.slots'), false);
  assert.strictEqual(ev(again.window, 'state.ranges'), true);
});

/* A query is read once so visual-test.sh can start the page in a given state,
   and then cleared, so a refresh behaves like any other arrival. Nothing ever
   writes one. */
test('a query starts the page somewhere and is cleared from the address bar', async () => {
  const { window } = await boot({ query: '?i=g&gk=boost&ga=15&m=100&g=0&p=2500' });
  assert.strictEqual(ev(window, 'state.mode'), 'want');
  assert.strictEqual(ev(window, 'state.goal.key'), 'boost');
  assert.strictEqual(ev(window, 'state.goal.want'), 15);
  assert.strictEqual(ev(window, 'state.mult'), 100);
  assert.strictEqual(ev(window, 'state.goldRush'), false);
  assert.strictEqual(window.location.search, '', 'the bar is left clean');
});

/* ---------- help ---------------------------------------------------------- */

// Every "?" on the page has to have something behind it, in one of the two
// places help is kept.
test('every help button has text behind it', async () => {
  const { doc, window } = await boot();
  const keys = [...doc.querySelectorAll('[data-help]')].map((b) => b.dataset.help);
  assert.ok(keys.length > 0);
  for (const k of new Set(keys)) {
    const has = ev(window, `!!(HELP['${k}'] || HELP_HTML['${k}'])`);
    assert.ok(has, `"${k}" has help text`);
  }
});
