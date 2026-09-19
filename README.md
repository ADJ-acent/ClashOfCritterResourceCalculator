# Clash of Critters, Reward Calculator

A single-page tool for the lightbulb reward track that the game runs under three
names: **Mad Invention**, **Tatari Party** and **Rebuild**. You do not spend
lightbulbs, you win them. Pinballs go through the machine, the machine pays
lightbulbs, the lightbulbs walk the track, and the track pays back pinballs that
you play again. Say what you hold and the page says what it turns into, or name
what you want and it says how many pinballs to bring.

**Live site:** https://adj-acent.github.io/ClashOfCritterResourceCalculator/

Sibling site: the [Treasure Hunt Solver](https://adj-acent.github.io/ClashOfCritterTreasureHuntSolver/),
which shares this one's palette and page shell.

## What it does

- **Predict Rewards.** Enter the pinballs you hold and see what they win:
  lightbulbs, rewards claimed, pinballs played, and every resource the track and
  the machine pay on the way.
- **Predict Pinballs needed.** Name a goal instead, say 6,000 fishing rods or
  20,000 pinballs played, and it solves for the pinballs to bring, with the
  figures for a 90% and a 10% chance beside it. Ask for more than the track has
  left and it answers for what is left, and says so. The x2 multiplier is picked
  from a list rather than typed, since it arrives in two fixed lumps and is
  measured in minutes.
- **Show ranges.** Every figure that luck touches carries the band 80% of runs
  land in. Off by default, since it costs a little speed on a goal.
- **Show possible outcomes chart.** The whole distribution, and clicking it
  points the rest of the page at one concrete run rather than an average.
- **Preexisting progress.** Enter where you already are the way the event window
  shows it: Grand Prize Progress, the grand prize, and the lightbulbs on the bar.
- **The whole track.** All 150 rewards in 13 stages, with costs, running totals
  and the pinballs needed to reach each one. Under Predict Rewards, click a row
  to fill that in; under Predict Pinballs needed the pinballs are the answer, so
  there is nothing for a click to fill and the rows are read only.
- **The settings that change the answer:** which side event is running, Gold
  Rush, the launch size, and whether the pinballs the track and the machine pay
  are played again.
- **Kept in your browser** rather than in the address bar, which stays clean.
  Where you stand is deliberately not remembered, because it goes stale while
  you play.

## How to use it

1. Pick **Predict Rewards** or **Predict Pinballs needed**.
2. Set **Active event**, **Gold Rush** and **Launch size** to match your game.
3. If you have already started, fill in **Preexisting progress**. The "?" beside
   it shows which number goes where.
4. Enter the pinballs you hold, or the goal you want.
5. Turn on **Show ranges** for the spread, and the chart to read the page at a
   luckier or unluckier run.

## How the numbers are worked out

- **Exact, not sampled.** A pinball pays one reward and one only, so the loop
  collapses into a single distribution over the number of lightbulb hits, which
  the page convolves rather than simulates. The same inputs give the same answer
  every time, and nothing jitters under the slider.
- **One approximation.** The pinballs the machine's own slots hand back are
  modelled as a three point mixture rather than exactly, which leaves a +0.3%
  bias on the mean at the largest launch size.
- **Ranges are quantiles of that same distribution.** Every quantity rises with
  the lightbulb count, so one quantile answers for all of them.
- **Checked against a 4,000 run Monte Carlo** of the loop, where the medians
  agree within a few units.

Worth knowing: 1 pinball is **1.02 lightbulbs** on average, the track and the
machine hand back enough to make a pile go about **1.2 times** as far, and
clearing all 150 rewards takes roughly **270,100 of your own pinballs** during
Gold Rush, an average that finishes about half the time.

## Development

No build step, and the tests do not add one. Open [`index.html`](index.html)
and it runs: a static page with
[`data.js`](data.js) (the track), [`machine.js`](machine.js) (the solver),
[`app.js`](app.js) (the page) and [`styles.css`](styles.css) loaded as plain
script and link tags, which is what keeps `file://` working.

**[`data.js`](data.js) is the file to edit when the chart needs correcting.** It
holds the 150 rewards stage by stage, the side events and their rates, and the
notes on where the source chart was unclear.

Tests are `node --test` with jsdom, and they are the only dependency:

```sh
npm ci
npm test
```

`tests/solver.test.js` runs `data.js` and `machine.js` on their own and checks
the ladder data and the solver: that the distribution is a distribution, that a
bigger launch keeps the average and widens the spread by its root, that the
rewards behind you are not paid out twice. `tests/app.test.js` boots the real
`index.html` in jsdom and drives it through the DOM, including the sum the whole
pinball account rests on, `yours + track + machine = played + left over`. Both
run on every push and pull request (`.github/workflows/ci.yml`).

Layout is still eyeballed, since nothing asserts on pixels. The screenshots
render headlessly into `.screenshots/`:

```sh
bash scripts/visual-test.sh 1440x900 500x900
QUERY='?i=g&ga=5000&gk=material' bash scripts/visual-test.sh 1280x950
```

[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) has the rest: how the loop is
solved, why the chart is opt-in, where the state lives, how the icons came out
of the game client, and what the source chart left unsettled.

## License

(c) 2026 Andy Jiang. Licensed under the
[PolyForm Noncommercial License 1.0.0](LICENSE): non-commercial use,
modification and sharing are permitted, keeping the copyright and Required
Notice; **commercial use is not.**

This is a fan-made tool, not affiliated with or endorsed by the game it
references or its publisher. Game names and trademarks belong to their
respective owners.
