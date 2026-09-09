# Clash of Critters — Lightbulb Reward Calculator

A single-page tool for the lightbulb reward track that the game ships under three
names: **Mad Invention**, **Tatari Party** and **Rebuild**. They are one
mechanism. Enter how many lightbulbs you have collected over the event and the
page reports every resource the ladder has paid out, how far down the ladder you
are, and what the next reward costs.

Sibling site: [Treasure Hunt Solver](https://adj-acent.github.io/ClashOfCritterTreasureHuntSolver/)
(shares its palette and page shell).

## How the mechanism is modelled

The ladder is walked strictly top to bottom. Each rung costs a fixed number of
lightbulbs; once that many have been banked the rung pays out and the next rung
starts. Nothing is skipped and nothing is chosen.

But lightbulbs are not spent, they are **won**. A pinball played through the
machine pays one reward — 4 lightbulbs with p = .255, or 1 unit of event
material with p = .22, never both. The ladder pays pinballs back, and those get
played too, so the whole thing is a feedback loop.

### Launch size

The machine fires ×1 up to ×200. A launch at ×n eats n pinballs and **rolls
once**, paying n times the single-ball reward. So the average haul does not move
at all, and the standard deviation grows by **√n** — 1,000 balls at ×100 is ten
rolls, not a thousand. At 10,000 pinballs the p10–p90 band on lightbulbs goes
±2.0% at ×1, ±6.2% at ×10, ±20% at ×100. The unit of play in the solver is
therefore the launch, not the ball.

### The loop is solved exactly, not sampled

Every pin is eventually played, so the total played is fixed by the number of
bulb-hits `k`:

    T(k) = pinsInHand + R(banked + 4k)

where `R(b)` is the pinballs the ladder has paid by bulb-total `b`. Order does
not matter, which is what collapses the loop to a single distribution over `k`.

`R` only steps at the **18 pinball rungs**, so `T(k)` takes ~19 distinct values.
Between two of them nothing can run out, so the distribution jumps from one
boundary to the next in a single binomial convolution — about 19 convolutions
for the whole event (`solveMachine()` in `machine.js`), a few milliseconds, and
the same answer every time. A sampled answer would jitter under the slider.

Turning the loop off (the **Winnings** checkbox) is the degenerate case: the
ladder's pinballs are kept rather than fired, `target(k)` stops moving, and the
whole thing is a single convolution.

Everything on the page falls out of that distribution: `P(reach rung n)` is a
tail sum, and because every quantity is monotone in `k`, a quantile of `k` is a
quantile of any of them.

### The spread is opt-in, and that is deliberate

By default every figure is the **average outcome**, labelled as such at the top
of the results so a middle-of-the-range number is never read as a promise. No
ranges, no chart, no percentages.

The reason is that the spread is usually not worth the ceremony. At ×1 launches,
the p10–p90 band on lightbulbs is **±2%** — "12,200, give or take 2%" is just
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
beside them so the spread stays visible, and the ladder's `Chance` column is
always distribution-wide.

The chart clips its axis to the 0.2–99.8 percentile range; the support runs far
wider than the mass, and drawing all of it squeezes the interesting part into a
few pixels. It also bins by **lattice rank**, not by x-position: lightbulbs only
arrive in multiples of `4 × launch size`, so at ×40 the achievable totals sit 160
apart, and binning by position leaves empty bins between them that read as
missing data. Binning by rank cannot do that.

What lumpiness survives is real. At ×40 the outcome at 9,600 lightbulbs carries
2.3% against 5.4% and 4.8% either side of it — a genuine dip, because that total
sits where the loop's launch count changes and fewer paths reach it. At ×200
there are only ~33 meaningful outcomes at all, so the whole distribution is
coarse. Nothing here is sampled, so none of it is noise. Material from the
machine uses the exclusivity: given `T` balls of which `k` paid bulbs, the rest
pay material with probability `.22 / (1 − .255)`.

Validated against a 4,000-run Monte Carlo — medians agree to the unit
(12,200 lightbulbs, 2,821 material at 10,000 pinballs).

### Numbers worth knowing

* 1 pinball = **1.02 lightbulbs** on average.
* The ladder returns 0.153 pinballs per pinball played → a **×1.181 multiplier**.
* Clearing all 70 rungs takes about **30,600 of your own pinballs** — but that
  is the *average*, which finishes only about half the time. Being sure of it
  (99.9%) takes ~31,600 at ×1 and ~48,000 at ×200, since a bigger launch is a
  wider swing. The slider is capped at a flat 50,000 rather than at a derived
  figure: the derived one moves with the launch size and replay setting, which
  would shift the scale under the handle. Typing a larger number still works.
* Event material is dominated by the machine, not the ladder: ~7,950 units vs
  340 over a full clear.

Two conditions decide what a rung actually hands you, and they are the two
controls in the sidebar:

* **Which side event is running.** The material rungs pay that event's material.
  They are the same reward at a fixed rate — `1 board = 1 rod = 1 pickaxe =
  2 fertiliser = 200 zobo coins` — so the ladder stores **base units** and
  `SIDE_EVENTS` multiplies. This is what made the three recordings of the chart
  look different: rung 18 was read as 40 boards, 8,000 shop coins and 80
  fertiliser, which is 40 units under all three rates.
* **Whether Gold Rush is running.** The drink rungs pay energy drinks while it
  is, and candy while it is not.

Clicking any ladder row fills in the pinballs that get you there. Note it often
carries you *past* that rung: reaching rung 50 hands you 1,000 pinballs, which
is worth two more rungs on its own.

### Saying where you are

Nobody knows their cumulative lightbulb count — the game shows the card you are
on, not a running total. So position is entered as the card: its **cost**, then
**which reward it is**, and the banked total is derived (every earlier rung, plus
whatever is already showing on the card).

Cost alone is not enough — 30 of the 70 rungs share a cost with another rung, and
even cost + reward leaves 9 ambiguous groups (a *220 → 5 Catch Tatari* card
occurs six times). Adding the **next** reward, which is also on screen, cuts that
to a single pair: rungs 42 and 45 are identical for two rungs running. So the
picker labels each option `this reward, then that one` and says so when it cannot
tell those two apart.

State lives in the URL (`?e=marathon&g=1&p=5000&r=23&w=100&m=10&y=1` — event,
gold rush, pinballs, rung, progress into it, launch size, replay), so a result
is linkable, and in `localStorage` so the page remembers where you were.

## Files

| File | What it holds |
| --- | --- |
| `data.js` | The ladder, the buckets, the side events and their rates, the data caveats. **This is the file to edit when you correct or extend the chart.** |
| `machine.js` | The exact solver for the pinball → lightbulb → pinball loop, and the machine's odds. |
| `app.js` | The walk, the formatting, the rendering. No framework. |
| `styles.css` | Palette and shell shared with the Treasure Hunt solver. |
| `index.html` | Markup. |
| `icons/` | Reward icons, extracted from the game client's own asset bundles. |
| `scripts/visual-test.sh` | Headless Edge/Chrome screenshots into `.screenshots/`. |

## Categories

Totals are an inventory list — one row per bucket, and **every** bucket is
always drawn. A category with nothing in it reads 0 and dims rather than
disappearing, so switching the active event or Gold Rush never changes the
page's height under the pointer.

The buckets:

* **Pinballs** — on its own.
* **Catch Tatari / Capsules** — one item under two names on the chart.
* **Energy Drinks** — only while Gold Rush is on; those rungs pay candy otherwise.
* **Candy** — always its own tile, always counted rather than summed: the amount
  is rolled per event, never printed.
* **Material** — named and converted by the running side event (Boards, Rods,
  Pickaxes, Zobo Coins, Fertiliser).
* **Blue Card Packs**, **x2 Multiplier** — their own tiles.

## Icons

`icons/*.png` are the game's own sprites, pulled from the client's in-package
addressables (`inpackage_aa_1.lpak`) with UnityPy — the same bundles the
CoCCrawler work opened, read off files already on disk. The recipe: the .lpak is
a run of concatenated `UnityFS` bundles whose headers carry a stripped version
string, so UnityPy needs `FALLBACK_UNITY_VERSION = '2022.3.62f3'` set before
loading.

Only the **lightbulb** has no icon yet. Everything else was found in the client,
though several were not where their names suggested — zobo coins are
`txui_item_trap_fraction`, the card pack is `txui_item_ferrule`, boards are
`txui_item_teamrun` and pickaxes `txui_item_treasurehunt`. Searching by name
alone would have missed all four; they were picked out by eye from a contact
sheet of every reward-shaped sprite.

To repeat the extraction: the guest filesystem is a file on the Windows side —
`Engine\Pie64\Data.vhdx` — readable with `libvhdi-python` + `pytsk3`, and the
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

* Rung 41 (290) has no reward recorded — the cost is right, the payout is blank.
* Candy amounts are never printed, by design of the event.
* The ladder is 70 rungs as recorded from the deepest pass; whether it ends
  there is unknown.
* Rung 13 is inferred to be a drink rung (recorded as candy twice, as 55 cans
  once — the signature of Gold Rush being on for one of the passes).

## Development

No build step — open `index.html`. For layout checks:

```sh
bash scripts/visual-test.sh 1440x900 500x900
```
