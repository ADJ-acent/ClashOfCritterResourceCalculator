# Clash of Critters, Lightbulb Reward Calculator

A single-page tool for the lightbulb reward track that the game ships under three
names: **Mad Invention**, **Tatari Party** and **Rebuild**. They are one
mechanism, and the page calls it Tatari Party throughout (`TRACK` in `data.js`,
one line to change when the event rotates its name).

You do not spend lightbulbs, you win them: pinballs go through the machine, the
machine pays lightbulbs, and the track pays pinballs back that you play again.
So the inputs are **the pinballs you hold** and **which reward you are on**, and
the page reports what those pinballs turn into. Or ask it the other way round:
name what you want, and it works out the pinballs to bring, with the odds of
getting there.

Sibling site: [Treasure Hunt Solver](https://adj-acent.github.io/ClashOfCritterTreasureHuntSolver/)
(shares its palette and page shell).

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
±2.0% at ×1, ±6.2% at ×10, ±20% at ×100. The unit of play in the solver is
therefore the launch, not the ball.

### The loop is solved exactly, not sampled

Every pin is eventually played, so the total played is fixed by the number of
bulb-hits `k`:

    T(k) = pinsInHand + R(banked + 4k) - R(banked)

where `R(b)` is the pinballs the ladder has paid by bulb-total `b`. The
subtraction is what you have already been paid and already spent: credit it
again and a player sitting on reward 57 is handed about 4,000 pinballs that do
not exist. Order does not matter, which is what collapses the loop to a single
distribution over `k`.

`R` only steps at the **18 pinball rungs**, so `T(k)` takes ~19 distinct values.
Between two of them nothing can run out, so the distribution jumps from one
boundary to the next in a single binomial convolution, about 19 convolutions
for the whole event (`solveMachine()` in `machine.js`), a few milliseconds, and
the same answer every time. A sampled answer would jitter under the slider.

Turning the loop off (the **Winnings** checkbox) is the degenerate case: the
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

### The spread is opt-in, and that is deliberate

By default every figure is the **average outcome**, labelled as such at the top
of the results so a middle-of-the-range number is never read as a promise. No
ranges, no chart, no percentages.

The reason is that the spread is usually not worth the ceremony. At ×1 launches,
the p10–p90 band on lightbulbs is **±2%**, "12,200, give or take 2%" is just
"12,200", and a chart plus a percentile picker to say so costs more attention
than it returns. It only becomes a real story at large launch sizes (±20% at
×100, ±33% at ×200) or when you are one reward short of a boundary.

So **Show the spread** turns it on: ranges beside each figure, and the chart.

### Reading it at a chosen point

With the spread shown, the **How it could land** chart draws the distribution,
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

What lumpiness survives is real. At ×40 the outcome at 9,600 lightbulbs carries
2.3% against 5.4% and 4.8% either side of it, a genuine dip, because that total
sits where the loop's launch count changes and fewer paths reach it. At ×200
there are only ~33 meaningful outcomes at all, so the whole distribution is
coarse. Nothing here is sampled, so none of it is noise. Material from the
machine uses the exclusivity: given `T` balls of which `k` paid bulbs, the rest
pay material with probability `.22 / (1 − .255)`.

Validated against a 4,000-run Monte Carlo, medians agree to the unit
(12,200 lightbulbs, 2,821 material at 10,000 pinballs).

### Numbers worth knowing

* 1 pinball = **1.02 lightbulbs** on average.
* Two things hand pinballs back. The ladder returns 0.153 per pinball played, and
  the machine's own slots return about 0.05 more while Gold Rush is running, or
  about 0.09 while it is not, since one of those slots spends part of its share
  on energy cans during Gold Rush. Together that is a **×1.26 multiplier** on
  your pile with Gold Rush on, **×1.32** with it off.
* Clearing all 70 rungs takes about **28,700 of your own pinballs** during Gold
  Rush, or **27,300** without it, but that is the *average*, which finishes only
  about half the time. Being sure of it (99.9%) takes ~29,700 at ×1 and ~45,600
  at ×200, since a bigger launch is a wider swing. Without the machine's own
  payback counted it is 30,600. The slider is capped at a flat 50,000 rather than at a derived
  figure: the derived one moves with the launch size and replay setting, which
  would shift the scale under the handle. Typing a larger number still works.
* Event material is dominated by the machine, not the ladder: ~7,950 units vs
  340 over a full clear. During Gold Rush **energy cans work the same way** and
  at the same rate, which turns them from a few hundred off the track into
  thousands.

Two conditions decide what a rung actually hands you, and they are the two
controls in the sidebar:

* **Which side event is running.** The material rungs pay that event's material.
  They are the same reward at a fixed rate, `1 board = 1 rod = 1 pickaxe =
  2 fertiliser = 200 zobo coins`, so the ladder stores **base units** and
  `SIDE_EVENTS` multiplies. This is what made the three recordings of the chart
  look different: rung 18 was read as 40 boards, 8,000 shop coins and 80
  fertiliser, which is 40 units under all three rates.
* **Whether Gold Rush is running.** The drink rungs pay energy drinks while it
  is, and candy while it is not. It reaches into the machine as well: while it
  runs the machine pays energy cans directly, at the same rate as the material,
  and one of the slots that pays pinballs spends part of its share on cans
  instead, so less comes back.

Clicking any ladder row fills in the pinballs that get you there. Note it often
carries you *past* that rung: reaching rung 50 hands you 1,000 pinballs, which
is worth two more rungs on its own.

### Working backwards from a goal

The sidebar has two modes, and only one of them is ever an input. **I have
pinballs** is the page as it was: you say what you hold, everything else is the
answer. **I want something** turns it around: you say what you are after, and the
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
| *to be 90% sure* | where 9 runs in 10 get there |
| *if you are lucky* | where 1 run in 10 does |

**The chart turns around with the question.** In "I want something" it draws the
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

The last two appear only under **Show the spread**, like every other range here.
At ×1 they often collapse onto the headline and are dropped: a pinball goal at
×1 is very nearly a hard number, since what you get to play is what you hold plus
what the track hands back, and the track pays at fixed rungs. At ×200 the same
goal runs 8,040 to 8,901 around 8,161, which is the size of thing worth printing.

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
  at fixed rungs and stop for good at reward 70, so they have a **ceiling**.
  Asking past it is answered rather than refused: ask for 300 Catch Tatari and
  the page says the track has only 240 left, then solves for those 240 and shows
  that run, saying in the tile that the figure is "for all 240, which is every
  one left". A bare "not possible" would leave the rest of the page describing
  whatever pinballs happened to be in the box, which answers no question at all.
  When the ceiling is 0, because every rung paying it is behind you, it says that
  instead and there is nothing to show.
* **Event material**, and **energy cans during Gold Rush**, trickle from every
  launch as well, so they have **no** ceiling. They are also the goals still
  random once the lightbulbs are settled,
  so it is the one that walks the whole distribution rather than reading a tail
  off it, with the machine's own share as a normal on the launches that paid no
  bulbs.
* **Pinballs** mean the number you get to **play**, not a net gain, because that
  is what a "use N pinballs" quest counts. Playing 20,000 costs 17,440 of your
  own, since the track hands the rest back. Where the track pays in a lump the
  answer overshoots and has to: from reward 38 there is no pile that plays
  exactly 10,000, because the rung that gets you close pays 300 at once.

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

    ×1      12,643 launches   ~680 balls    runs that get none:   0.0%
    ×10      1,264 launches   ~680 balls                          0.0%
    ×100       126 launches   ~680 balls                         42.5%
    ×200        63 launches   ~680 balls                         65.3%

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

**Account for Card Slot and Duel pinballs** turns the whole path off, which is
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
on, not a running total. So position is entered as the card: its **cost**, then
**which reward it is**, and the banked total is derived (every earlier rung, plus
whatever is already showing on the card).

Cost alone is not enough, 30 of the 70 rungs share a cost with another rung, and
even cost + reward leaves 9 ambiguous groups (a *220 → 5 Catch Tatari* card
occurs six times). Adding the **next** reward, which is also on screen, cuts that
to a single pair: rungs 42 and 45 are identical for two rungs running. So the
picker labels each option `this reward, then that one` and says so when it cannot
tell those two apart.

### Where the state lives

Written together by `save()`: the URL
(`?e=marathon&g=1&p=5000&r=23&w=100&m=10&y=1&s=0&i=p&ga=0&gk=pinball`, event,
gold rush, pinballs, rung, progress into it, launch size, replay, spread, input
mode, goal) so a result is linkable, and `localStorage` so the page comes back
where you left it. A link wins over what the browser remembers, and only when it
carries that field.

**Where you stand is the exception, and is deliberately not remembered.** It is
the one input that goes stale on its own: you play, the card moves, and the page
has no way to know. Brought back by a refresh it quietly answers for a position
you left behind, and being silently wrong is worse than being asked again. A
pasted **link** still carries it, because someone opening a link means the
position in it, and the two arrive looking identical, so the navigation type is
what tells them apart (`isReload`); unknown counts as a link.

A goal is not like that. It is a wish rather than a fact about the world, so the
mode and the goal are both remembered and both travel in a link.

Also stored in one place only: the work in progress notice, a per browser fact
rather than part of a result (`coc.rc.seenWip.1`; bump the suffix to show it
again). The point being read off the distribution is in neither, deliberately: it
is reset by `update()`, since a point dragged out of one distribution says
nothing about the next.

`save()` is called from `render()` rather than from the input handlers, because
not every change comes from a handler. Typing a cost can move the rung from
inside `refreshRungPicker()`, which no handler sees, and that used to leave both
stores a step behind until the next click. Calling it from the one place every
change already passes through also means the restored state is in the address
bar on arrival, instead of the bar reading blank until you touch something.

## Files

| File | What it holds |
| --- | --- |
| `data.js` | The ladder, the buckets, the side events and their rates, the data caveats. **This is the file to edit when you correct or extend the chart.** |
| `machine.js` | The solver for the pinball → lightbulb → pinball loop, exact but for the mixture over the machine's own payback, and the machine's odds. |
| `app.js` | The walk, the formatting, the rendering. No framework. |
| `styles.css` | Palette and shell shared with the Treasure Hunt solver. |
| `index.html` | Markup. |
| `icons/` | Reward icons, extracted from the game client's own asset bundles. |
| `scripts/visual-test.sh` | Headless Edge/Chrome screenshots into `.screenshots/`. |

## Categories

Totals are an inventory list, one row per bucket, and **every** bucket is
always drawn. A category with nothing in it reads 0 and dims rather than
disappearing, so switching the active event or Gold Rush never changes the
page's height under the pointer.

The buckets:

* **Pinballs**, counting both sources: the track's rungs and the machine's own
  slots. That half carries no range, unlike material, because it is not still
  open once the run on display is chosen: it is the payback that carried that
  run to the launches it fired.
* **Catch Tatari / Capsules**, one item under two names on the chart.
* **Energy Drinks**, only while Gold Rush is on; those rungs pay candy otherwise.
  During Gold Rush the machine pays cans directly too, so the tile splits into a
  fixed half from the track and a half that is down to luck, exactly like
  material.
* **Candy**, always its own tile, always counted rather than summed: the amount
  is rolled per event, never printed.
* **Material**, named and converted by the running side event (Boards, Rods,
  Pickaxes, Zobo Coins, Fertiliser).
* **Blue Card Packs**, counted in packs. The chart prints those three rungs as
  2 blue cards, which is one 2-card pack, so the ladder stores 1.
* **x2 Multiplier**, in minutes.

Totals count only what the pinballs you entered actually **win**. If you say
you are on reward 45, rewards 1 to 44 are already in your pocket and are not
counted again.

Which is why a 0 says *why* it is 0 (`emptyReason()` in `app.js`). "None yet"
promises that more pinballs would fix it, and for two buckets that is false:
every card-pack and x2 rung sits in the first 47, so from reward 48 on no pile
of pinballs brings one back and the tile reads **all 3 already claimed**
instead. Drinks with Gold Rush off read **only while Gold Rush is on**, since
those rungs are paying candy.

## Icons

`icons/*.png` are the game's own sprites, pulled from the client's in-package
addressables (`inpackage_aa_1.lpak`) with UnityPy, the same bundles the
CoCCrawler work opened, read off files already on disk. The recipe: the .lpak is
a run of concatenated `UnityFS` bundles whose headers carry a stripped version
string, so UnityPy needs `FALLBACK_UNITY_VERSION = '2022.3.62f3'` set before
loading.

Only the **lightbulb** has no icon yet. Everything else was found in the client,
though several were not where their names suggested, zobo coins are
`txui_item_trap_fraction`, the card pack is `txui_item_ferrule`, boards are
`txui_item_teamrun` and pickaxes `txui_item_treasurehunt`. Searching by name
alone would have missed all four; they were picked out by eye from a contact
sheet of every reward-shaped sprite.

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

* Rung 41 (290) has no reward recorded, the cost is right, the payout is blank.
* Candy amounts are never printed, by design of the event.
* **The track does not end at reward 70.** It carries on and nobody has recorded
  how far, so 70 is the deepest pass anyone wrote down rather than the end of the
  event. The page says so where it matters: the end-of-track panel reads "all 70
  recorded rewards claimed, the track goes on, we do not know how far", and the
  `?` beside it and beside the Unconfirmed tile asks for a deeper pass.
  **TODO: the Discord invite.** `COMMUNITY` in `data.js` is empty, and until it
  is filled in that help text says a link is coming rather than pointing nowhere.
* Rung 13 is inferred to be a drink rung (recorded as candy twice, as 55 cans
  once, the signature of Gold Rush being on for one of the passes).
* The machine's own pinball payback is modelled as a three point mixture rather
  than exactly, which leaves a **+0.3% bias on the mean at ×200** and, because
  the launches a given `k` can afford still use the average payback, a slightly
  tight spread on the pinballs played and on the material and cans that ride on
  them.
* The lightbulb has no icon. It is downloaded content, absent from the client's
  shipped bundles, unlike the other ten.

## Development

No build step, open `index.html`. For layout checks:

```sh
bash scripts/visual-test.sh 1440x900 500x900
```
