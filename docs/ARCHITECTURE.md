# Architecture

How this calculator is put together, and why it is put together that way. The
[README](../README.md) covers what it does and how to use it; the rest is here.

## How the mechanism is modelled

The ladder is walked strictly top to bottom. Each rung costs a fixed number of
lightbulbs; once that many have been banked the rung pays out and the next rung
starts. Nothing is skipped and nothing is chosen.

But lightbulbs are not spent, they are **won**. A pinball played through the
machine pays one reward and only one: 4 lightbulbs with p = .255, or 1 unit of
event material with p = .22, or, while Gold Rush is running, 1 energy can at the
same rate as the material. Some slots pay **pinballs**, which get played in turn.
The ladder pays pinballs back as well, and those get played too, so the whole
thing is a feedback loop with two sources.

### Launch size

The machine fires ×1 up to ×200. A launch at ×n eats n pinballs and **rolls
once**, paying n times the single-ball reward. So the average haul does not move
at all, and the standard deviation grows by **√n**, 1,000 balls at ×100 is ten
rolls, not a thousand. At 10,000 pinballs the p10–p90 band on lightbulbs goes
±2.2% at ×1, ±6.9% at ×10, ±22% at ×100. The unit of play in the solver is
therefore the launch, not the ball.

### The loop is solved exactly, not sampled

Every pin is eventually played, so the total played is fixed by the number of
bulb-hits `k`:

    T(k) = pinsInHand + R(banked + 4k) - R(banked)

where `R(b)` is the pinballs the ladder has paid by bulb-total `b`. The
subtraction is what you have already been paid and already spent: credit it
again and a player sitting on reward 57 is handed about 3,900 pinballs that do
not exist. Order does not matter, which is what collapses the loop to a single
distribution over `k`.

`R` only steps at the **40 pinball rewards**, 41 with Gold Rush off, when one
drink reward pays 120 pinballs instead, which is why `ladderReach()` takes Gold
Rush. So `T(k)` takes ~41 distinct values. Between two of them nothing can run
out, so the distribution jumps from one boundary to the next in a single
binomial convolution, about 41 convolutions for the whole event
(`solveMachine()` in `machine.js`), under 100 ms even for a pile that clears all
150 rewards, and the same answer every time. A sampled answer would jitter under
the slider. `ladderReach()` is a binary search over running totals rather than a
walk, since the solver asks it for every outcome it retires.

Turning the loop off (**Replay pinballs from Tatari Party**, under **Pinballs won**) is the degenerate case: the
ladder's pinballs are kept rather than fired, `target(k)` stops moving, and the
whole thing is a single convolution.

The convolution is dense rather than a map of `k` to probability: the live run of
`k` is contiguous, `target` only ever rises with it, so the states that have
stopped are a prefix rather than a scatter, and hashing cost more than the
arithmetic. That is worth about 3.6× and pays for the mixture below.

**One thing is not exact, and it is the machine's own pinball payback.** That is
a second random quantity, and carrying it properly would make the state two
dimensional, so instead the solve is run at three stretches of the pile and
mixed (`solveLoop()`). Three points of a normal reproduce its shape to fifth
order, and against a simulation of the machine the p10 to p90 band now agrees at
×1, ×10 and ×100, where before it read ~15% too narrow. Five points were tried
and did no better for nearly twice the work. What survives is a +0.3% bias on
the mean at ×200, where 63 launches make the payback too lumpy for any normal to
describe, against a band of ±31%.

Everything on the page falls out of that distribution: `P(reach rung n)` is a
tail sum, and because every quantity is monotone in `k`, a quantile of `k` is a
quantile of any of them.

### Ranges and the chart are two switches

Every figure is the **average run**, labelled as such at the top of the results
so a middle-of-the-range number is never read as a promise. **Show ranges**, off
by default, puts the band 80% of runs land in beside every figure luck touches,
since a figure standing on its own reads as a promise. A band whose ends meet is
printed as the one figure it is: what the track pays steps at fixed rewards, so
at ×1 every run claims the same ones, and "55 to 55" says less than 55 does.

**Show possible outcomes chart** is a separate question and starts off. At ×1
launches the p10–p90 band on lightbulbs is **±2%**, and a chart plus a percentile
picker to draw that costs more attention than it returns. It becomes a real
story at large launch sizes (±22% at ×100, ±31% at ×200) or when you are one
reward short of a boundary, which is when it is worth turning on.

The two are independent, with one seam behind the glass: a goal's 90% and 10%
figures are full solves of the loop, and the goal chart's curve is spanned by
those same two, so `solveFor()` works them out when either switch is on and
skips them when neither is. That is why both start off, and why the help says to
turn them off if the page feels slow: with neither on, a goal is one solve
rather than three.

### Reading it at a chosen point

With it turned on, the **Possible outcomes** chart draws the distribution,
and clicking or dragging it picks which point of it the rest of the page
describes. That is why "what you
get" reports one concrete `k` rather than a blend: an averaged haul sits between
two rungs and claims fractions of rewards nobody can receive, while a selected
`k` is a run that could actually happen. The stat tiles keep the p10–p90 band
beside them so the spread stays visible, and the ladder's `Pinballs` column is
independent of the viewing point.

The chart clips its axis to the 0.2–99.8 percentile range; the support runs far
wider than the mass, and drawing all of it squeezes the interesting part into a
few pixels. It also bins by **lattice rank**, not by x-position: lightbulbs only
arrive in multiples of `4 × launch size`, so at ×40 the achievable totals sit 160
apart, and binning by position leaves empty bins between them that read as
missing data. Binning by rank cannot do that.

What lumpiness survives is real. A total that sits where the loop's launch count
changes is reached by fewer paths, and its bar can dip below its neighbours for
that reason alone. At ×200 and 10,000 pinballs there are only ~24 meaningful
outcomes at all, so the whole distribution is coarse. Nothing here is sampled, so none of it is noise. Material from the
machine uses the exclusivity: given `T` balls of which `k` paid bulbs, the rest
pay material with probability `.22 / (1 − .255)`.

Validated against a 4,000 run Monte Carlo of the loop at 10,000 pinballs and ×1,
with the machine's own payback off: medians agree within a few units (12,072
lightbulbs against 12,076, 2,793 material against 2,795).

### Numbers worth knowing

* 1 pinball = **1.02 lightbulbs** on average.
* Two things hand pinballs back. The ladder returns 0.119 per pinball played, and
  the machine's own slots return about 0.05 more while Gold Rush is running, or
  about 0.09 while it is not, since one of those slots spends part of its share
  on energy cans during Gold Rush. Together that is a **×1.21 multiplier** on
  your pile with Gold Rush on, **×1.27** with it off.
* The whole track is 332,940 lightbulbs. Clearing all 150 rewards takes about
  **270,100 of your own pinballs** during Gold Rush, or **258,100** without it,
  but that is the *average*, which finishes only about half the time. Being sure
  of it (99.9%) takes ~273,300 at ×1 and ~317,800 at ×200, since a bigger launch
  is a wider swing. Without the machine's own payback counted it is 287,700.
* The slider is capped at a flat 50,000 rather than at a derived figure: the
  derived one moves with the launch size and replay setting, which would shift
  the scale under the handle. That is now a small part of a full clear, so a
  bigger pile is typed.
* The steps beside it go both ways, -100 to -5,000 above +100 to +5,000, because
  overshooting by 5,000 otherwise means retyping the whole figure. They are laid
  out as a four column grid rather than a wrapping row, so each step sits above
  its own opposite instead of wherever eight buttons happen to break, and the
  four that take away go disabled at 0, where they would do nothing.
* Event material is dominated by the machine, not the ladder: ~71,800 units vs
  2,120 over a full clear. During Gold Rush **energy cans work the same way** and
  at the same rate, which turns them from 4,105 off the track into about 76,000.

Two conditions decide what a rung actually hands you, and they are the two
controls in the sidebar:

* **Which side event is running**: Raft Race (which was Marathon), Fishing,
  Treasure Hunt, Zobo Shooter, Cozy Farm, Marathon Star, or none. Material
  rewards pay that event's material, and the chart prints the amount for each.
  They sit near a fixed rate, 1 raft = 1 fishing rod = 1 iron pickaxe = 2 magic
  fertilizer = 100 bullet coins, but not on one (4,920 bullet coins where 5,000
  would fit, and Flying Shoes follow no rate at all), so the ladder stores every
  amount as printed and `SIDE_EVENTS[].mat` picks one. With no side event
  running those rewards pay the candy printed beside them. The machine's own
  material payout is `per` units of the event's material, and 0 for Marathon
  Star, since the machine pays Flying Shoes too rarely to count.
* **Whether Gold Rush is running.** The drink rewards pay energy drinks while it
  is, and something else while it is not: candy, except the 240 lightbulb reward
  after the ×600 multiplier, which pays 120 pinballs. It reaches into the machine
  as well: while it runs the machine pays energy cans directly, at the same rate
  as the material, and one of the slots that pays pinballs spends part of its
  share on cans instead, so less comes back.

Clicking any ladder row fills in the pinballs that get you there. Note it often
carries you *past* that reward: reaching reward 48 hands you 1,000 pinballs,
which is worth three more rewards on its own.

**Only while the pinballs are the question.** In "Predict: Pinballs needed" they
are the answer, so there is nothing for a click to fill: what it used to do was
switch the mode back and overwrite the goal, which is a larger thing than a row
click looks like it does. There the rows lose the pointer, the hover and the
tooltip, and the line under the table says which mode to be in. The one
exception is the hover rule's own weight, written with `:where()` so it still
loses to the highlight on the current row.

### Working backwards from a goal

The sidebar has two modes under a **Predict** heading, and only one of them is
ever an input. **Rewards** is the page as it was: you say what you hold,
everything else is the answer. **Pinballs needed** turns it around: you say what you want, and the
pinballs to bring become the answer, shown as a figure on the right rather than
typed into a box. That last part is the whole reason for the switch. A number the
page worked out has no business sitting in a field you can type over, and the two
boxes side by side could disagree, which is exactly how a stale goal note ends up
contradicting the panel beside it.

The answer is a **distribution, not a price**. `P(you end up with at least what
you asked for)` only ever rises with the pinballs you bring, so the figures
quoted are the points where it crosses:

| shown | means |
| --- | --- |
| the headline | an even chance, the same typical run the rest of the page describes |
| *for a 90% chance* | where 9 runs in 10 get there |
| *for a 10% chance* | where 1 run in 10 does |

**The chart turns around with the question.** In "Predict: Pinballs needed" it draws the
distribution of what the goal *takes* rather than of what a pile gives: `P(you
reach it bringing n)` only ever rises from 0 to 1, which makes it a CDF over the
pinballs needed, so the requirement is as real a random variable as the haul is
and the bars are its differences. The axis is in pinballs with the cheap end on
the left, since needing fewer is the lucky outcome, and the picks row is
reordered so Lucky still sits over the lucky side. Clicking picks which run you
are planning for, and the pinballs to bring follow it.

Seventeen points of that curve are solved exactly and the rest interpolated, on
the **probit** scale rather than straight across: a CDF is an S, and reading
straight lines across an S undershoots wherever it bends, which put the lucky end
86 pinballs under the figure printed beside it. Against probit a near-normal
curve is nearly a straight line. The two named picks still hand back the exact
crossings rather than a reading, because at ×100 the outcomes sit 400 lightbulbs
apart and the curve is a staircase no interpolation lands on.

The last two appear under **Show ranges**, like every other range here.
At ×1 they often collapse onto the headline and are dropped: a pinball goal at
×1 is very nearly a hard number, since what you get to play is what you hold plus
what the track hands back, and the track pays at fixed rungs. At ×200 the same
goal runs 7,624 to 8,363 around 7,740, which is the size of thing worth printing.

Each step of that search is a **full solve of the loop**, so it is bisected from
a bracket the mean walk supplies, stopped at a tolerance rather than the single
ball, cached on the conditions that move it, and debounced on typing.

**A closed form was tried and thrown away.** A track reward arrives at a known
rung, so "do I get it" looks like "did `k` of my `T` launches pay bulbs", one
binomial tail and no solving at all. It agrees with the solver to five decimals
at ×1 and ×10, and it is **wrong at ×100**: it hands you the pinballs the track
pays before that rung without asking whether you were still playing to collect
them, counting runs whose hits all land after the pile ran dry. A 400,000 run
Monte Carlo sided with the solver (.1295 against .1296, closed form .1318). The
fast path is no path, because ×100 is exactly where a range earns its space.

The three kinds of resource still behave differently:

* **Track rewards** (Catch Tatari, drinks, card packs, x2, candy) arrive in lumps
  at fixed rewards and stop at the last of the 150, so they have a **ceiling**.
  Asking past it is answered rather than refused: ask for 2,000 Catch Tatari and
  the page says Tatari Party has only 1,130, then solves for those 1,130 and
  shows that run, saying in the tile that the figure is "for all 1,130 left". A
  bare "not possible" would leave the rest of the page describing
  whatever pinballs happened to be in the box, which answers no question at all.
  When the ceiling is 0, because every reward paying it is behind you or a
  setting has switched it off (drinks without Gold Rush, material with no side
  event), it says so, and which setting, and there is nothing to show.
  The **x2 boost** is a ceiling small enough to enumerate, so it is picked from
  a list instead (`goalSteps()`). It arrives in exactly two lumps, 5 minutes and
  10, and the track is walked in order, so the only totals reachable are the
  running sums of the ones still ahead: 5 and 15, never 7 and never 10 on its
  own unless the first is already claimed. It is also the one bucket measured in
  minutes, which a box holding a bare number never said. The list is read from
  where you stand and rebuilt only when it changes, a remembered amount that is
  no longer on it snaps to the cheapest one, and with every boost behind you the
  picker says so and the note names the reason. Nothing can be asked past the
  ceiling, so the "only N left" answer above never arises here.

* **Event material**, and **energy cans during Gold Rush**, trickle from every
  launch as well, so they have **no** ceiling. They are also the goals still
  random once the lightbulbs are settled,
  so it is the one that walks the whole distribution rather than reading a tail
  off it, with the machine's own share as a normal on the launches that paid no
  bulbs.
* **Pinballs** mean the number you get to **play**, not a net gain, because that
  is what a "use N pinballs" quest counts. Playing 20,000 costs 16,479 of your
  own, since the track and the machine hand the rest back. Where the track pays
  in a lump the answer overshoots and has to: from reward 38 there is no pile
  that plays exactly 10,000, because the reward that gets you close pays 1,000 at
  once.

### Pinballs from the machine itself

Some of the machine's slots pay pinballs, which get played in turn: a second
feedback loop alongside the track's. `MACHINE.pinBack` in `machine.js` holds what
that comes to per ball played and how much it varies, per Gold Rush state, and a
×n launch pays n times it, the same way bulbs and material scale.

Gold Rush is the second row of that table. While it runs, one of the paying slots
spends part of its share on energy cans, so about 0.05 of a pinball comes back
per ball played rather than about 0.09. That is why every solver entry point
takes Gold Rush now, and why `pinsToClear()` is a function rather than the
constant it used to be: it moves when you toggle Gold Rush or replay, and a
figure fixed at load would quietly keep quoting whichever state the page started
in.

**It is lumpy, and that is the whole difficulty.** Most launches pay nothing and
a few pay a great deal, so the variance is more than ten times the mean. Treating
it as a fixed stretch of the pile, which is what the code did first, hands every
run the average: at ×200 that is a payback two runs in three will never see.

    10,000 pinballs, Gold Rush on, what the slots hand back

    ×1      12,517 launches   ~680 balls    runs that get none:   0.0%
    ×10      1,251 launches   ~680 balls                          0.0%
    ×100       125 launches   ~680 balls                         42.8%
    ×200        62 launches   ~680 balls                         65.6%

So the pile is treated as the branching process it is: every ball played spawns
`rate` more on average, and what you end up playing from a seed of N has mean
N/(1-rate) and variance N·var/(1-rate)³, scaled by the launch size, because a
launch of m balls pays one launch's worth again and a seed of N balls is only
N/m of them. Three stretches are drawn from that and the solves mixed.

The points are taken on what comes **back**, not on the stretch, because what
comes back cannot be negative and a normal's lower tail can. They are clipped at
zero and then rescaled to carry the average they are meant to carry, which keeps
the mean exact and leaves the shape leaning the way the real thing leans. Clipping
without the rescale put 2.6% on every figure at ×200.

**Include Card Slot and Duel pinballs** turns the whole path off, which is
the one switch that changes the pile rather than what the page does with it.

Those pinballs are counted in the totals like anything else you win, and the
pinballs played account for themselves exactly:

    yours + track + machine = played + left over

with the last term the stub too small to fire, which at ×200 can be 199 balls
and is worth naming rather than leaving as a hole in the sum. The machine's share
takes the floor and gives its fraction to the stub, so those are whole balls that
add up rather than three roundings that nearly do.

What is still modelled on the average is the launches a given `k` could afford,
so the pinballs played, and the material and cans that ride on them, have a mean
that is right and a spread that is a little tight. The lightbulb and reward
figures, which is what the ranges are read off, carry the full thing.

### Saying where you are

Nobody knows their cumulative lightbulb count, the game shows the card you are
on, not a running total. What the event window does show is a **Grand Prize
Progress** counter, x/y, the grand prize the stage ends on in the big card, and
the reward being worked on beside the progress bar, which is also what the small
event card on the main screen shows. The rewards come in 13 stages, and position
is entered as exactly that: x and y as they read, the grand prize picked from the
stages of that size, and the lightbulbs off the bar. The banked total is derived
(every earlier reward, plus whatever is already on the bar).

The counter follows the chart's Stage column with one twist. **On a grand prize
the window has already moved on**: working on the 1,120 lightbulb 25 Catch Tatari
that ends the stage of 6, it reads 0/7, with the next grand prize in the big
card, which only happens to be 25 Catch Tatari as well. So 0/y means the grand
prize of the stage before, and the chart's own y/y is never on screen, except the
last grand prize, which has no stage after it. The first stage goes the other
way: a player who has not started sees 0/10 with 20 Catch Tatari, that 0 is the
very first reward, and the stage holds 11. `rungAt()` and `counterFor()` in
`app.js` are the two directions of that mapping. A typed y/y is still accepted,
since it is what the chart says, and the note says what the screen shows
instead. The `?` beside the heading says what the section is for and shows one
annotated picture (`help/`) tracing each number from the event window to the box
it goes in, which is shorter than the walkthrough it replaced.

`STAGES` in `data.js` stores the rewards stage by stage and the chart's counter is
worked out from the position, so a correction never has to renumber anything.

The size alone places most stages, since only stages of 8 and of 7 come more than
once, and the grand prize tells those apart with one exception: two stages of 8
both end on 500 Pinballs, back to back, and at 4/8 and 6/8 even the reward being
worked on is the same. The picker names them *the first* and *the second*, and
the rule for players is to pick the second if they have already claimed a 500
Pinballs grand prize or are working on one. The note under the picker names the
reward the position lands on (*Current reward: 120 Pinballs for 300 lightbulbs*), to
check against the small card, and a counter past the end of its stage is read as
the end and says so. A blank or unknown size leaves the position where it was,
since that is usually a number being retyped.

This replaced entering the card's cost, which needed the next reward as well to
narrow it down and still left identical pairs.

**None of that puts a row number on screen.** The game never shows one, so the
page names a reward by what it costs and pays, and the ladder's `#` column is the
only place a row number appears. Counts are fine, "38 rewards claimed" is
something a player watches tick up, but "reward 38 of 150" is an index into a
list they cannot see. The stage counter is different because it is on their
screen, so the ladder carries a `Stage` column beside `#`, with a heavier rule
where each stage starts. It follows the chart, and a grand prize's cell has a
tooltip with the 0/y the game shows instead.

### Help lives in one place

The controls carry no "?" buttons any more, with two exceptions: **Preexisting
progress**, which needs its pictures, and **Replay pinballs from Tatari Party**,
which sits on the checkbox it describes rather than on the heading above it.
Everything else is behind the large **?** in the header (`HELP.howto` in
`data.js`). The results still explain themselves where they stand: the chart,
Next up, the end panel, the ladder's Pinballs column, and the two tiles with a
caveat, energy cans and Flying Shoes.

A "?" is answered two ways, and both are titled with the thing they explain. A
sentence or two opens a **popover** beside the button, where the question was
asked. A picture, or the whole how-to, opens a **window**, a modal `<dialog>`
closed by its X, the backdrop, or Escape, because neither fits beside a control.

The popover used to be pinned under its button once and then left behind by the
first scroll, pointing at nothing. It now re-anchors on every scroll, which it
has to do in both directions: the sidebar is sticky, so its buttons move when
the page does not, and the ladder scrolls inside itself. When its button leaves
the screen it closes, having nothing left to point at. A browser without
`<dialog>` falls back to the window shown in place, without the backdrop.

### Where the state lives

`localStorage` holds the whole of `state`, written by `save()`, so this browser
comes back where it left off. **The address bar is left clean.** The page used to
carry the whole state in the query as well, which made a result linkable, at the
price of every setting being an address of its own.

**Where you stand is the exception, and is deliberately not remembered.** It is
the one input that goes stale on its own: you play, the card moves, and the page
has no way to know. Brought back by a refresh it quietly answers for a position
you left behind, and being silently wrong is worse than being asked again. So it
is asked again on every load.

A goal is not like that. It is a wish rather than a fact about the world, so the
mode and the goal are both remembered.

A query is still **read** once on arrival, if there is one, so `visual-test.sh`
can start the page in a given state (`QUERY=`, under Development). It is cleared
from the address bar straight after, and nothing ever writes one.

The point being read off the distribution is stored nowhere, deliberately: it is
reset by `update()`, since a point dragged out of one distribution says nothing
about the next.

`save()` is called from `render()` rather than from the input handlers, because
not every change comes from a handler. Typing a stage counter can move the rung
from inside `refreshStagePicker()`, which no handler sees, and that used to leave both
stores a step behind until the next click. Calling it from the one place every
change already passes through also means the restored state is in the address
bar on arrival, instead of the bar reading blank until you touch something.

**Visits are counted by GoatCounter**, which needs no cookies and no consent
banner. The dashboard at https://adjacent.goatcounter.com/ is shared with the
Treasure Hunt solver and tells the two apart by path. GoatCounter files a visit
under the path plus the query. Nothing writes a query any more, so visits land
on one path by themselves; the `<link rel="canonical">` in `index.html` keeps
that true for an old link that still carries one, and tells search engines the
same.

It skips `file:` and `localhost`, so opening the file and `visual-test.sh` are
never counted. To leave your own browser out, visit with `#toggle-goatcounter`.
That works here now: nothing rewrites the address, and clearing a query keeps
the hash. It used to be unreliable, since `save()` dropped the hash, usually
before the counter had loaded. The flag lives in `localStorage` on
`adj-acent.github.io`, which both tools share, so setting it once covers both.

## Files

| File | What it holds |
| --- | --- |
| `data.js` | The ladder as 13 stages (`STAGES`, laid end to end into `LADDER`), the buckets, the side events and their machine rates, the data caveats. **This is the file to edit when you correct or extend the chart.** |
| `machine.js` | The solver for the pinball → lightbulb → pinball loop, exact but for the mixture over the machine's own payback, and the machine's odds. |
| `app.js` | The walk, the formatting, the rendering. No framework. |
| `styles.css` | Palette and shell shared with the Treasure Hunt solver. |
| `index.html` | Markup. |
| `icons/` | Reward icons, extracted from the game client's own asset bundles. |
| `icon.png` | The site's own icon, 512 square: the favicon, and the picture on a shared link. Same wiring as the Treasure Hunt solver. |
| `help/` | The picture in the "Preexisting progress" help: the event window and small event card, arrows to the box each number goes in. |
| `scripts/visual-test.sh` | Headless Edge/Chrome screenshots into `.screenshots/`. |

## Categories

Totals are an inventory list, one row per bucket, and **every** bucket is
always drawn. A category with nothing in it reads 0 and dims rather than
disappearing, so switching the active event or Gold Rush never changes the
page's height under the pointer.

The buckets:

* **Pinballs**, counting both sources: the track's rewards and the machine's own
  slots. Both move with the same `k`, so the band is read off the distribution
  (`pinsWon` in `compute()`) while the split beneath it describes the one run on
  display. What the track pays steps at fixed rewards, so at ×1 every run passes
  the same ones and the band closes to a single figure.
* **Catch Tatari / Capsules**, one item under two names on the chart.
* **Energy Drinks**, only while Gold Rush is on; those rewards pay candy
  otherwise, or in one case 120 pinballs.
  During Gold Rush the machine pays cans directly too, so the tile splits into a
  fixed half from the track and a half that is down to luck, exactly like
  material.
* **Candy**, summed, now that the chart prints every amount. It also takes what
  the drink rewards pay without Gold Rush and what the material rewards pay with
  no side event running.
* **Material**, named by the running side event (Raft, Fishing Rods, Iron
  Pickaxes, Bullet Coins, Magic Fertilizer, Flying Shoes), and empty with none
  running.
* **Blue Card Packs**, five on the track, one pack each. The chart prints candy
  beside every pack too, but the pack is what pays.
* **x2 Multiplier**, in minutes.

Totals count only what the pinballs you entered actually **win**. If you say
you are on reward 45, rewards 1 to 44 are already in your pocket and are not
counted again.

Which is why a 0 says *why* it is 0 (`emptyReason()` in `app.js`). "None yet"
promises that more pinballs would fix it, and that is not always true: both x2
rewards sit in the first 31, so from reward 32 on no pile of pinballs brings one
back and the tile reads **all 2 claimed** instead. Drinks with Gold Rush off read
**only while Gold Rush is on**, and material with no side event running says it
is paying candy instead.

## Icons

`icons/*.png` are the game's own sprites, pulled from the client's in-package
addressables (`inpackage_aa_1.lpak`) with UnityPy, the same bundles the
CoCCrawler work opened, read off files already on disk. The recipe: the .lpak is
a run of concatenated `UnityFS` bundles whose headers carry a stripped version
string, so UnityPy needs `FALLBACK_UNITY_VERSION = '2022.3.62f3'` set before
loading.

The **lightbulb** has no icon yet.
Everything else was found in the client,
though several were not where their names suggested, zobo coins are
`txui_item_trap_fraction`, the card pack is `txui_item_ferrule`, boards are
`txui_item_teamrun` and pickaxes `txui_item_treasurehunt`. Searching by name
alone would have missed all four; they were picked out by eye from a contact
sheet of every reward-shaped sprite. Flying Shoes are `txui_item_run`. Each is
cropped to its visible edges and scaled down to at most 128 px on its long side.

The raft is not in `inpackage_aa_1.lpak`. It arrived in the 2026-09-09 patch,
`files/data/patch/152145/*.GeneralRes.base.InPackageRes.1.lpak`, as
`txui_item_teamrun_rafting`, beside the boards' `txui_item_teamrun`: Raft Race is
Marathon's event (`teamrun`) with a new skin. For a later event, list the patch
folders by date and scan the newest first.

To repeat the extraction: the guest filesystem is a file on the Windows side 
`Engine\Pie64\Data.vhdx`, readable with `libvhdi-python` + `pytsk3`, and the
instance can stay running. That partition is Android's `/data`, so packages sit
at `/data/<pkg>` (not `/data/data/<pkg>`). Root is **not** the way in:
BlueStacks 5.22's toggle does not work, `su` exiting 1 in silence even with both
config flags set.

One trap: on `inpackage_aa_1.lpak` the UnityFS **header-chain** walk stops early
(719 slices against 1,399), while splitting on the magic gets everything and bad
slices simply fail to load. On the downloaded archives it is the other way
round, because the magic also occurs inside LZ4 block data. Try both and take
whichever yields more.

## Known gaps

* **The ladder is the full chart**: 150 rewards in 13 stages, with the stage
  counter, every candy amount and every event's material printed. Against the
  earlier recordings it settled three things, all now taken from the chart. The
  two rewards at 240 lightbulbs after the ×600 multiplier are one (100 energy
  drinks during Gold Rush, 120 pinballs without), so every reward after it is one
  lower than in older recordings, on top of the same shift when the phantom
  reward 36 came out. The 10 Catch Tatari after 480 pinballs costs 640, not 540. And the
  350 lightbulb reward after it pays material, not candy: the candy is what it
  pays with no side event running.
* The chart leaves the fishing rods off one material reward (350 lightbulbs, in
  the stage of 8 ending on 30 Catch Tatari). It is stored as 50, as on every
  other reward of that size.
* Card rewards print candy beside the pack. They are taken to always pay the
  pack, so the candy is stored and never paid.
* Super Multiplier ×300 and ×600 are read as x2 for 300 and 600 seconds, the 5
  and 10 minutes the earlier recordings gave them.
* The machine's Flying Shoes are left out: it pays them too rarely to count, so
  Marathon Star is the track's shoes alone.
* **TODO: the Discord invite.** `COMMUNITY` in `data.js` is empty, and until it
  is filled in the end of track help says a link is coming rather than pointing
  nowhere.
* The machine's own pinball payback is modelled as a three point mixture rather
  than exactly, which leaves a **+0.3% bias on the mean at ×200** and, because
  the launches a given `k` can afford still use the average payback, a slightly
  tight spread on the pinballs played and on the material and cans that ride on
  them. The mixture's three weights are written as thirds and sixths rather than
  as decimals: rounded to seven places they summed to 1.0000001, which put a
  tenth of a millionth on every probability the solve returned.
* The lightbulb has no icon. It is downloaded content, absent from the client's
  shipped bundles.

## Development

No build step, open `index.html`. For layout checks:

```sh
bash scripts/visual-test.sh 1440x900 500x900
QUERY='?i=g&ga=5000&gk=material&s=1' bash scripts/visual-test.sh 1280x950   # start in a given state
```

### The tests

`npm test` is `node --test`, and jsdom is the only dependency. They split the
way the page does.

**`tests/solver.test.js` never touches the DOM.** `data.js` and `machine.js`
declare consts and functions in the global scope with nothing to `require`, so
they run in one `vm` context, which is what a browser does with two `<script
src>` tags, and the context is the module the tests read from. It covers the
ladder data, where a missing figure would otherwise pay `undefined` in one side
event and be right in the other five, and the solver's own properties: that the
result is a distribution in order, that the same inputs give the same answer
every time, that with nothing coming back it collapses to the single binomial
that can be written down by hand, that a ×n launch keeps the average and widens
the spread by √n, and that the rewards behind you are not handed over twice.

**`tests/app.test.js` boots the real `index.html`.** The three scripts are
inlined into the markup in place, same files and same order, because jsdom does
not fetch external scripts under `runScripts: "dangerously"` and turning on
`resources: "usable"` would make every boot asynchronous for nothing. The page
still boots itself off `DOMContentLoaded`, which jsdom fires after the
constructor returns, so `boot()` **waits for that event rather than dispatching
it**: a hand-fired one would boot a page the browser had not finished and would
pass whether or not the wiring works.

Two things there are worth knowing before writing another test.
`state` and nearly everything else is a `const`, so it is not a property of
`window` and has to be reached by evaluating in the page (`ev`, `run`). And
**where you stand cannot be assigned**: `render()` re-derives the rung from the
two Grand Prize Progress boxes every time, which is what keeps the counter and
the position from drifting apart, so a test moves the boxes (`standOn`) the way
a player does. Values read out of the page are from another realm, so they
compare by value rather than with `deepStrictEqual`.

The suite pins the two claims that would otherwise go stale in silence: the sum
`yours + track + machine = played + left over`, at every launch size and with
either payback switched off, and the ~270,100 pinball clear this file and the
README both quote. It also pins one property that reads like a bug and is not:
**the ladder's Pinballs column does not rise**, because a reward that pays
pinballs funds part of the way to the next one, so reward 2 costs fewer of your
own than reward 1 does.

`.github/workflows/ci.yml` runs all of it on every push to `main` and every pull
request, and then checks that `index.html` still loads its four files as plain
tags, since a module script or a bundler import would break `file://` quietly.
