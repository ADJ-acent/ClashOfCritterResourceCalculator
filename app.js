/* ============================================================================
   Clash of Critters lightbulb reward calculator.

   You do not spend lightbulbs, you win them: pinballs go through the machine,
   the machine pays lightbulbs, the lightbulbs walk the ladder, and the ladder
   pays pinballs back. machine.js solves that loop exactly (see the note there);
   this file turns the resulting distribution over bulb-hits into the page.

   With no pinballs in hand the distribution collapses to a single point and
   everything below is the plain deterministic walk it always was.
   ========================================================================= */

const LS = { pins: 'coc.rc.pins', rung: 'coc.rc.rung', prog: 'coc.rc.prog',
             side: 'coc.rc.side', gold: 'coc.rc.gold', mult: 'coc.rc.mult',
             replay: 'coc.rc.replay', adv: 'coc.rc.adv' };

/* Nobody knows their running lightbulb total. The game shows the rung you are
   on, not a cumulative count. So position is entered as "the reward I'm working
   on", and the banked total is derived from it. */
const state = {
  pins: 0,        // pinballs in hand
  rung: 1,        // 1-based rung currently being worked on
  progress: 0,    // lightbulbs already put toward that rung
  mult: 1,        // launch size
  replay: true,   // play the pinballs the ladder pays back
  advanced: false, // show the spread: ranges, and the distribution chart
  target: null,   // reward a ladder click asked for, marked so the click shows
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
  const dist = solveMachine(state.pins, banked(), m, state.replay);
  const haul = cumulativeHaul();

  // k counts winning LAUNCHES, each worth m balls' reward.
  const bulbsOf = (k) => banked() + MACHINE.perHit * m * k;
  const reachOf = (k) => ladderReach(bulbsOf(k));
  // Must mirror the solver: with replay off the ladder's pinballs are kept, not
  // fired, so they buy no launches.
  const launchesOf = (k) =>
    Math.floor((state.pins + (state.replay ? reachOf(k).pins : 0)) / m);
  // one reward per launch: of the launches that did not pay bulbs, each pays
  // material with probability .22/(1-.255), because the outcomes are exclusive.
  const matRate = MACHINE.pMat / (1 - MACHINE.pBulb);

  let eBulbs = 0, ePlayed = 0, eRung = 0, eFromLadder = 0, eMatMachine = 0, eLaunches = 0;
  // Machine material needs a variance of its own: unlike everything else it is
  // still random once k is known: the launches that did not pay bulbs each pay
  // material or nothing. Accumulate E[M] and E[M²] to get Var exactly.
  let eMat2 = 0;
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
    eFromLadder += pr * R.pins;
    const matMean = (launches - k) * matRate * m;
    const matVar = m * m * (launches - k) * matRate * (1 - matRate);
    eMatMachine += pr * matMean;
    eMat2 += pr * (matVar + matMean * matMean);
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
    const matMean = (launches - selK) * matRate * m * state.side.per;
    const matSd = m * state.side.per
                  * Math.sqrt(Math.max(0, (launches - selK) * matRate * (1 - matRate)));
    return {
      k: selK,
      bulbs: bulbsOf(selK),
      rung: R.rung,
      fromLadder: R.pins,
      launches,
      played: launches * m,
      // Only what these pinballs win. Rewards claimed before the card you are
      // on are already in your pocket, so counting them would answer a question
      // nobody asked: "what will I get" is not "what has the event ever paid".
      haul: haulSince(haul, state.rung - 1, R.rung),
      // Material is still random once k is known, so this half keeps a band.
      mat: { mean: matMean,
             p10: Math.max(0, matMean - 1.2816 * matSd),
             p90: matMean + 1.2816 * matSd },
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
    rung: { mean: eRung, p10: at(0.1, (k) => reachOf(k).rung), p50: at(0.5, (k) => reachOf(k).rung),
            p90: at(0.9, (k) => reachOf(k).rung) },
    // Mean and variance are exact; the 10–90 band is a normal reading of them,
    // which is fine at these counts.
    matMachine: {
      mean: eMatMachine * state.side.per,
      p10: Math.max(0, (eMatMachine - 1.2816 * Math.sqrt(Math.max(0, eMat2 - eMatMachine ** 2)))
                       * state.side.per),
      p90: (eMatMachine + 1.2816 * Math.sqrt(Math.max(0, eMat2 - eMatMachine ** 2)))
           * state.side.per,
    },
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
  return Math.max(0, Math.ceil(balls - credit));
}

const PINS_TO_CLEAR = Math.ceil(pinsForRung(LADDER.length, 0) / 100) * 100;

/* A flat cap for the slider. It could be derived, as the pinballs that make
   clearing the track near-certain, but that figure moves with the launch size
   and the replay setting, so the scale would shift under the handle. A fixed
   round number keeps the scale stable, and typing a bigger one still works. */
const SLIDER_MAX = 50000;

/* ---------- formatting ----------------------------------------------------- */

const num = (n) => Math.round(n).toLocaleString('en-US');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const pct = (p) => (p >= 0.995 ? '100' : p <= 0.005 ? '<1' : (p * 100).toFixed(p < 0.1 ? 1 : 0));

/* The reward as one line, e.g. "120 Pinballs", "x2 for 5 min", "Candy". */
function rewardText(step) {
  const pay = payout(step);
  const meta = bucketMeta(pay.bucket);
  const name = meta.short || meta.label;
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

  const r = compute();
  renderSummary(r);
  renderDist(r);
  renderTotals(r);
  renderLadder(r);

  $('slider').max = SLIDER_MAX;
  $('slider').value = Math.min(state.pins, SLIDER_MAX);
  $('sliderMax').textContent = num(SLIDER_MAX);

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

  bits.push(`<div class="stat-row">
    <div class="stat"><b>${num(r.sel.rung)}</b><span>of ${LADDER.length} rewards claimed</span>
      <i>${[
        // Says where the haul below starts, now that it counts only new rewards.
        state.rung > 1 ? `${num(Math.max(0, r.sel.rung - (state.rung - 1)))} new below` : '',
        wide ? `${r.rung.p10} to ${r.rung.p90} likely` : '',
      ].filter(Boolean).join(' · ')}</i></div>
    <div class="stat">${wide
      ? `<b class="ranged">${num(r.bulbs.p10)} – ${num(r.bulbs.p90)}</b>`
      : `<b>${num(r.sel.bulbs)}</b>`}
      <span>lightbulbs</span>
      ${wide ? `<i>${num(r.sel.bulbs)} on ${luckName(state.pctl)}</i>` : ''}</div>
    <div class="stat"><b>${num(r.sel.played)}</b><span>pinballs played</span>
      <i>${[r.sel.fromLadder >= 1 && state.replay
              ? `${num(state.pins)} yours + ${num(r.sel.fromLadder)} back` : '',
            state.mult > 1 ? `${num(r.sel.launches)} launches at ×${state.mult}` : '']
           .filter(Boolean).join(' · ')}</i></div>
  </div>`);

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
        short > 0 ? ` · <b class="odds">${num(short)} more pinballs for an even chance</b>` : ''
      }</div>
    </div>`);
  } else {
    /* The shown outcome cleared the track. Keep the same three-line shape, and
       above all keep the odds: "you finished it" is worth much less than the
       chance of finishing it, which is precisely the question at this end. */
    const pAll = r.pReach(LADDER.length);
    bits.push(`<div class="next">
      <div class="next-head">
        <span>All ${LADDER.length} rewards claimed</span>
        <span class="muted">nothing left to claim</span>
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
function renderDist(r) {
  const box = $('distBox');
  const empty = $('distEmpty');
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

function renderTotals(r) {
  $('resList').innerHTML = Object.keys(BUCKETS).map((key) => {
    const meta = bucketMeta(key);
    const t = r.sel.haul[key];
    const count = t.count;

    // The machine pays material directly, and far more of it than the ladder
    // does, so that row leads with the split rather than one summed number,
    // and the machine half carries its range.
    const machine = key === 'material' ? r.sel.mat.mean : 0;
    const value = meta.countOnly ? count : t.qty + machine;
    let amount;
    if (key === 'material' && value >= 0.5) {
      // The headline is the TOTAL, so "including N guaranteed" refers to a part
      // of the number above it. The range is there because the machine's share
      // is luck; the track's share is fixed.
      const wide = state.advanced && !r.certain;
      const total = wide
        ? `${num(t.qty + r.sel.mat.p10)} to ${num(t.qty + r.sel.mat.p90)}`
        : num(t.qty + r.sel.mat.mean);
      // Spell the split out: the track's share is fixed, the machine's is luck,
      // so the range belongs to the machine half and should say so.
      const fromMachine = wide
        ? `${num(r.sel.mat.p10)} to ${num(r.sel.mat.p90)}`
        : num(r.sel.mat.mean);
      amount = `<span class="${wide ? 'ranged' : ''}">${total}</span>`
             + (t.qty >= 1
                 ? `<span class="extra">${num(t.qty)} from ${TRACK} + ${fromMachine} from the machine</span>`
                 : '');
    } else {
      amount = num(value) + (meta.unit === 'min' ? '<small> min</small>' : '');
    }

    // Tied to the number actually printed: a row that rounds to 0 reads "none
    // yet" rather than "from 0 rewards".
    const has = value >= 0.5;
    let sub;
    if (!has) sub = 'none yet';
    else if (key === 'material')
      // The line under the number already names both halves, so this says the
      // thing that line cannot: which half is fixed and which is luck.
      sub = `fixed from ${TRACK}, luck from the machine`;
    else if (key === 'pinball')
      sub = `from ${num(count)} rewards, ${state.replay ? 'played again' : 'kept'}`;
    else if (meta.note) sub = meta.note;
    else {
      sub = `from ${num(count)} ${Math.round(count) === 1 ? 'reward' : 'rewards'}`;
      if (t.varies >= 0.5) sub += ` · ${num(t.varies)} with no set amount`;
    }

    return `<div class="res-row${has ? '' : ' empty'}">
      ${meta.icon ? `<img class="res-icon" src="${meta.icon}" alt="" />`
                  : '<span class="res-icon"></span>'}
      <div class="res-text">
        <div class="res-name">${meta.label}${key === 'material'
          ? ' <button type="button" class="q" data-help="material" aria-label="What is this?">?</button>'
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
    `All ${LADDER.length} rewards: ${num(LADDER_TOTAL)} lightbulbs, about ${num(PINS_TO_CLEAR)} pinballs`;

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
  state.pins = Math.max(0, Math.floor(Number(v) || 0));
  $('pins').value = state.pins;
  localStorage.setItem(LS.pins, state.pins);
  syncUrl();
  update();
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
  localStorage.setItem(LS.rung, state.rung);
  localStorage.setItem(LS.prog, state.progress);
  syncUrl();
  render();
}

/* ?e=<side>&g=<gold rush>&p=<pins>&b=<banked> makes a result linkable.
   replaceState throws on file:// in some browsers; a failure must not take the
   app down. */
function syncUrl() {
  try {
    history.replaceState(null, '',
      `?e=${state.side.id}&g=${state.goldRush ? 1 : 0}&p=${state.pins}`
      + `&r=${state.rung}&w=${state.progress}&m=${state.mult}`
      + `&y=${state.replay ? 1 : 0}&s=${state.advanced ? 1 : 0}`);
  } catch (_) { /* opened from disk, and the app works fine without it */ }
}

function init() {
  const sel = $('sideSelect');
  sel.innerHTML = SIDE_EVENTS
    .map((e) => `<option value="${e.id}">${e.name}: ${e.material}</option>`)
    .join('');

  const savedSide = SIDE_EVENTS.find((e) => e.id === localStorage.getItem(LS.side));
  if (savedSide) state.side = savedSide;
  if (localStorage.getItem(LS.gold) === '0') state.goldRush = false;
  state.pins = Math.max(0, Number(localStorage.getItem(LS.pins)) || 0);
  state.rung = Math.min(LADDER.length,
    Math.max(1, Number(localStorage.getItem(LS.rung)) || 1));
  state.progress = Math.max(0, Number(localStorage.getItem(LS.prog)) || 0);
  if (localStorage.getItem(LS.replay) === '0') state.replay = false;
  if (localStorage.getItem(LS.adv) === '1') state.advanced = true;
  if (MULTIPLIERS.includes(Number(localStorage.getItem(LS.mult)))) {
    state.mult = Number(localStorage.getItem(LS.mult));
  }

  // A shared link wins over whatever this browser remembers.
  const q = new URLSearchParams(location.search);
  const qSide = SIDE_EVENTS.find((e) => e.id === q.get('e'));
  if (qSide) state.side = qSide;
  if (q.get('g') === '0') state.goldRush = false;
  if (q.get('g') === '1') state.goldRush = true;
  if (q.get('p') !== null) state.pins = Math.max(0, Math.floor(Number(q.get('p')) || 0));
  if (q.get('r') !== null) {
    state.rung = Math.min(LADDER.length, Math.max(1, Math.floor(Number(q.get('r')) || 1)));
  }
  if (q.get('w') !== null) state.progress = Math.max(0, Math.floor(Number(q.get('w')) || 0));
  if (q.get('y') === '0') state.replay = false;
  if (q.get('y') === '1') state.replay = true;
  if (q.get('s') === '1') state.advanced = true;
  if (q.get('s') === '0') state.advanced = false;
  if (MULTIPLIERS.includes(Number(q.get('m')))) state.mult = Number(q.get('m'));

  state.progress = Math.min(state.progress, LADDER[state.rung - 1].cost - 1);

  sel.value = state.side.id;
  $('goldRush').checked = state.goldRush;
  $('replay').checked = state.replay;
  $('advanced').checked = state.advanced;
  $('pins').value = state.pins;
  $('rungCost').value = state.rung > 1 || state.progress ? LADDER[state.rung - 1].cost : 0;
  $('rungProgress').value = state.progress;

  sel.addEventListener('change', () => {
    state.side = SIDE_EVENTS.find((e) => e.id === sel.value) || SIDE_EVENTS[0];
    localStorage.setItem(LS.side, state.side.id);
    syncUrl();
    update();
  });

  $('goldRush').addEventListener('change', (e) => {
    state.goldRush = e.target.checked;
    localStorage.setItem(LS.gold, state.goldRush ? '1' : '0');
    syncUrl();
    update();
  });

  $('advanced').addEventListener('change', (e) => {
    state.advanced = e.target.checked;
    localStorage.setItem(LS.adv, state.advanced ? '1' : '0');
    syncUrl();
    update();
  });

  $('replay').addEventListener('change', (e) => {
    state.replay = e.target.checked;
    localStorage.setItem(LS.replay, state.replay ? '1' : '0');
    syncUrl();
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

  $('multRow').innerHTML = MULTIPLIERS
    .map((m) => `<button data-mult="${m}">×${m}</button>`).join('');
  $('multRow').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-mult]');
    if (!btn) return;
    state.mult = Number(btn.dataset.mult);
    localStorage.setItem(LS.mult, state.mult);
    syncUrl();
    update();
  });

  $('pins').addEventListener('input', (e) => setPins(e.target.value));
  $('slider').addEventListener('input', (e) => setPins(e.target.value));
  $('rungCost').addEventListener('input', () => { refreshRungPicker(); update(); });
  $('rungPick').addEventListener('change', (e) => setRung(e.target.value));
  $('rungProgress').addEventListener('input', (e) => {
    const cap = LADDER[state.rung - 1].cost - 1;
    state.progress = Math.min(cap, Math.max(0, Math.floor(Number(e.target.value) || 0)));
    localStorage.setItem(LS.prog, state.progress);
    syncUrl();
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
