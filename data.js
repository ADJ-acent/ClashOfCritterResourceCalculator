/* ============================================================================
   DATA: the reward ladder.

   Mad Invention, Tatari Party and Rebuild are the same mechanism under three
   names: one ordered list of rewards, read top to bottom. Each costs a number of
   lightbulbs; once that many have been handed in, it pays out and the next one
   starts. Nothing is skippable and nothing is chosen, so the whole event is a
   running total.

   The rewards come in stages. The chart numbers each reward x/y within its
   stage, the last being the grand prize at y/y. The first stage alone counts
   from 0, so it holds 11 rewards under /10; every other stage counts from 1.
   The event window's counter follows that numbering except on a grand prize,
   which it already shows as 0 of the next stage: app.js turns one into the
   other (rungAt, counterFor).

   Two things outside the ladder decide what a reward actually hands you:

   * Which side event is running. Material rewards pay that event's material, at
     the amounts the chart prints for each. Those sit close to a fixed rate but
     not on one (Flying Shoes least of all), so each is stored as printed. With
     no side event running they pay the candy printed beside them.

   * Whether Gold Rush is running. Drink rewards pay energy drinks while it is,
     and `off` while it is not: candy on all but one, which pays pinballs.

   Card rewards print candy beside the pack as well, but always pay the pack. The
   `candy` on those is kept only because the chart has it.
   ========================================================================= */

/* What to call the lightbulb track on screen. The game rotates the name between
   Mad Invention, Tatari Party and Rebuild, but they are one mechanism, so the
   page picks one and uses it everywhere rather than saying "the reward track".
   Change this line when the name changes. */
const TRACK = 'Tatari Party';

/* Where to send a correction. TODO: fill in the Discord invite. Empty until
   then, and the help text says a link is coming rather than pointing nowhere. */
const COMMUNITY = 'https://discord.com/channels/1343763804349267989/1517044316177039502';

/* A material reward's amounts, in the chart's own order: Flying Shoes / Iron
   Pickaxe / Raft / Fishing Rod / Bullet Coins / Magic Fertilizer. */
const mat = (shoes, pickaxe, raft, rod, coins, fertiliser) =>
  ({ shoes, pickaxe, raft, rod, coins, fertiliser });

/* One array per stage, its rewards in order, the last being the one the stage
   ends on. The stage counter is worked out from the position, so a correction is
   an edit here and the numbering follows. */
const STAGES = [
  [ // 0/10 to 10/10, ends on 20 Catch Tatari
    { cost: 80,    res: 'pinball',  qty: 80 },
    { cost: 70,    res: 'candy',    qty: 12000 },
    { cost: 150,   res: 'tatari',   qty: 5 },
    { cost: 100,   res: 'drink',    qty: 50,   off: { res: 'candy', qty: 15000 } },
    { cost: 200,   res: 'pinball',  qty: 120 },
    { cost: 220,   res: 'tatari',   qty: 5 },
    { cost: 300,   res: 'boost',    qty: 5 },      // Super Multiplier ×300: x2 for 300 seconds
    { cost: 120,   res: 'card',     qty: 1,    candy: 15000 },
    { cost: 400,   res: 'pinball',  qty: 200 },
    { cost: 250,   res: 'material', qty: mat(10, 50, 50, 50, 5000, 100), candy: 30000 },
    { cost: 890,   res: 'tatari',   qty: 20 },
  ],
  [ // x/8, ends on 500 Pinballs, the first of two
    { cost: 160,   res: 'pinball',  qty: 80 },
    { cost: 130,   res: 'drink',    qty: 55,   off: { res: 'candy', qty: 16000 } },
    { cost: 300,   res: 'pinball',  qty: 120 },
    { cost: 220,   res: 'tatari',   qty: 5 },
    { cost: 200,   res: 'candy',    qty: 24000 },
    { cost: 220,   res: 'tatari',   qty: 5 },
    { cost: 200,   res: 'material', qty: mat(5, 40, 40, 40, 4000, 80), candy: 24000 },
    { cost: 1000,  res: 'pinball',  qty: 500 },
  ],
  [ // x/8, ends on 500 Pinballs, the second of two
    { cost: 340,   res: 'drink',    qty: 165,  off: { res: 'candy', qty: 50000 } },
    { cost: 190,   res: 'tatari',   qty: 5 },
    { cost: 250,   res: 'candy',    qty: 30000 },
    { cost: 220,   res: 'tatari',   qty: 5 },
    { cost: 250,   res: 'card',     qty: 1,    candy: 30000 },
    { cost: 220,   res: 'tatari',   qty: 5 },
    { cost: 250,   res: 'material', qty: mat(10, 50, 50, 50, 5000, 100), candy: 30000 },
    { cost: 1000,  res: 'pinball',  qty: 500 },
  ],
  [ // x/6, ends on 25 Catch Tatari
    { cost: 220,   res: 'tatari',   qty: 5 },
    { cost: 240,   res: 'pinball',  qty: 120 },
    { cost: 330,   res: 'candy',    qty: 40000 },
    { cost: 600,   res: 'boost',    qty: 10 },     // Super Multiplier ×600
    { cost: 240,   res: 'drink',    qty: 100,  off: { res: 'pinball', qty: 120 } },
    { cost: 1120,  res: 'tatari',   qty: 25 },
  ],
  [ // x/7, ends on 25 Catch Tatari
    { cost: 240,   res: 'pinball',  qty: 120 },
    { cost: 290,   res: 'material', qty: mat(10, 50, 50, 50, 4920, 100), candy: 30000 },
    { cost: 260,   res: 'tatari',   qty: 5 },
    { cost: 290,   res: 'candy',    qty: 30000 },
    { cost: 530,   res: 'tatari',   qty: 10 },
    { cost: 290,   res: 'candy',    qty: 30000 },
    { cost: 1310,  res: 'tatari',   qty: 25 },
  ],
  [ // x/8, ends on 1,000 Pinballs
    { cost: 710,   res: 'pinball',  qty: 300 },
    { cost: 580,   res: 'drink',    qty: 200,  off: { res: 'candy', qty: 60000 } },
    { cost: 1310,  res: 'tatari',   qty: 25 },
    { cost: 710,   res: 'pinball',  qty: 300 },
    { cost: 290,   res: 'card',     qty: 1,    candy: 30000 },
    { cost: 260,   res: 'tatari',   qty: 5 },
    { cost: 580,   res: 'candy',    qty: 60000 },
    { cost: 2860,  res: 'pinball',  qty: 1000 },
  ],
  [ // x/8, ends on 30 Catch Tatari
    { cost: 320,   res: 'tatari',   qty: 5 },
    // The chart leaves the fishing rods off this one; 50, as on every other reward of its size.
    { cost: 350,   res: 'material', qty: mat(10, 50, 50, 50, 4900, 100), candy: 30000 },
    { cost: 400,   res: 'pinball',  qty: 140 },
    { cost: 700,   res: 'candy',    qty: 60000 },
    { cost: 320,   res: 'tatari',   qty: 5 },
    { cost: 860,   res: 'pinball',  qty: 300 },
    { cost: 700,   res: 'drink',    qty: 200,  off: { res: 'candy', qty: 60000 } },
    { cost: 1910,  res: 'tatari',   qty: 30 },
  ],
  [ // x/7, ends on 600 Pinballs
    { cost: 1370,  res: 'pinball',  qty: 480 },
    { cost: 640,   res: 'tatari',   qty: 10 },
    { cost: 350,   res: 'material', qty: mat(10, 50, 50, 50, 4900, 100), candy: 30000 },
    { cost: 320,   res: 'tatari',   qty: 5 },
    { cost: 760,   res: 'candy',    qty: 65000 },
    { cost: 640,   res: 'tatari',   qty: 10 },
    { cost: 1710,  res: 'pinball',  qty: 600 },
  ],
  [ // x/16, ends on 1,100 Pinballs
    { cost: 630,   res: 'drink',    qty: 180,  off: { res: 'candy', qty: 54000 } },
    { cost: 320,   res: 'tatari',   qty: 5 },
    { cost: 1290,  res: 'pinball',  qty: 450 },
    { cost: 700,   res: 'material', qty: mat(15, 100, 100, 100, 9800, 200), candy: 60000 },
    { cost: 960,   res: 'tatari',   qty: 15 },
    { cost: 940,   res: 'candy',    qty: 80000 },
    { cost: 800,   res: 'pinball',  qty: 280 },
    { cost: 640,   res: 'tatari',   qty: 10 },
    { cost: 700,   res: 'card',     qty: 1,    candy: 60000 },
    { cost: 1570,  res: 'pinball',  qty: 550 },
    { cost: 700,   res: 'drink',    qty: 200,  off: { res: 'candy', qty: 60000 } },
    { cost: 320,   res: 'tatari',   qty: 5 },
    { cost: 1600,  res: 'pinball',  qty: 560 },
    { cost: 1280,  res: 'tatari',   qty: 20 },
    { cost: 1170,  res: 'material', qty: mat(25, 165, 165, 165, 16380, 330), candy: 100000 },
    { cost: 3140,  res: 'pinball',  qty: 1100 },
  ],
  [ // x/20, ends on 40 Catch Tatari
    { cost: 960,   res: 'tatari',   qty: 15 },
    { cost: 490,   res: 'candy',    qty: 42000 },
    { cost: 960,   res: 'tatari',   qty: 15 },
    { cost: 850,   res: 'drink',    qty: 240,  off: { res: 'candy', qty: 73000 } },
    { cost: 960,   res: 'tatari',   qty: 15 },
    { cost: 2570,  res: 'pinball',  qty: 900 },
    { cost: 1030,  res: 'material', qty: mat(20, 145, 145, 145, 14420, 290), candy: 88000 },
    { cost: 1280,  res: 'tatari',   qty: 20 },
    { cost: 2170,  res: 'pinball',  qty: 760 },
    { cost: 1290,  res: 'candy',    qty: 110000 },
    { cost: 1280,  res: 'tatari',   qty: 20 },
    { cost: 1400,  res: 'drink',    qty: 395,  off: { res: 'candy', qty: 120000 } },
    { cost: 1600,  res: 'pinball',  qty: 560 },
    { cost: 640,   res: 'tatari',   qty: 10 },
    { cost: 940,   res: 'candy',    qty: 80000 },
    { cost: 3670,  res: 'pinball',  qty: 1100 },
    { cost: 2050,  res: 'material', qty: mat(35, 250, 250, 250, 24600, 495), candy: 150000 },
    { cost: 1120,  res: 'tatari',   qty: 15 },
    { cost: 3000,  res: 'pinball',  qty: 900 },
    { cost: 2980,  res: 'tatari',   qty: 40 },
  ],
  [ // x/15, ends on 2,200 Pinballs
    { cost: 1360,  res: 'card',     qty: 1,    candy: 100000 },
    { cost: 4670,  res: 'pinball',  qty: 1400 },
    { cost: 1490,  res: 'tatari',   qty: 20 },
    { cost: 1360,  res: 'drink',    qty: 330,  off: { res: 'candy', qty: 100000 } },
    { cost: 2980,  res: 'tatari',   qty: 40 },
    { cost: 2180,  res: 'candy',    qty: 160000 },
    { cost: 2980,  res: 'tatari',   qty: 40 },
    { cost: 5000,  res: 'pinball',  qty: 1500 },
    { cost: 1970,  res: 'material', qty: mat(30, 200, 200, 200, 19700, 395), candy: 120000 },
    { cost: 4470,  res: 'tatari',   qty: 50 },
    { cost: 2960,  res: 'pinball',  qty: 740 },
    { cost: 3930,  res: 'candy',    qty: 240000 },
    { cost: 4470,  res: 'tatari',   qty: 50 },
    { cost: 2620,  res: 'drink',    qty: 525,  off: { res: 'candy', qty: 160000 } },
    { cost: 8800,  res: 'pinball',  qty: 2200 },
  ],
  [ // x/17, ends on 2,000 Pinballs
    { cost: 3570,  res: 'tatari',   qty: 40 },
    { cost: 3280,  res: 'candy',    qty: 200000 },
    { cost: 5600,  res: 'pinball',  qty: 1400 },
    { cost: 1970,  res: 'material', qty: mat(30, 200, 200, 200, 19700, 395), candy: 120000 },
    { cost: 1340,  res: 'tatari',   qty: 15 },
    { cost: 4520,  res: 'pinball',  qty: 1130 },
    { cost: 2230,  res: 'tatari',   qty: 25 },
    { cost: 3600,  res: 'candy',    qty: 220000 },
    { cost: 5600,  res: 'pinball',  qty: 1400 },
    { cost: 3570,  res: 'tatari',   qty: 40 },
    { cost: 3200,  res: 'pinball',  qty: 800 },
    { cost: 2230,  res: 'tatari',   qty: 25 },
    { cost: 900,   res: 'drink',    qty: 180,  off: { res: 'candy', qty: 55000 } },
    { cost: 2230,  res: 'tatari',   qty: 25 },
    { cost: 4500,  res: 'candy',    qty: 220000 },
    { cost: 2790,  res: 'tatari',   qty: 25 },
    { cost: 10000, res: 'pinball',  qty: 2000 },
  ],
  [ // x/19, ends on 80 Catch Tatari
    { cost: 2420,  res: 'material', qty: mat(30, 195, 195, 195, 19360, 390), candy: 118000 },
    { cost: 3350,  res: 'tatari',   qty: 30 },
    { cost: 5000,  res: 'pinball',  qty: 1000 },
    { cost: 3070,  res: 'candy',    qty: 150000 },
    { cost: 3350,  res: 'tatari',   qty: 30 },
    { cost: 6140,  res: 'drink',    qty: 985,  off: { res: 'candy', qty: 300000 } },
    { cost: 14000, res: 'pinball',  qty: 2800 },
    { cost: 3350,  res: 'tatari',   qty: 30 },
    { cost: 8600,  res: 'candy',    qty: 420000 },
    { cost: 7000,  res: 'pinball',  qty: 1400 },
    { cost: 7170,  res: 'material', qty: mat(80, 575, 575, 575, 57360, 1150), candy: 350000 },
    { cost: 5580,  res: 'tatari',   qty: 50 },
    { cost: 30000, res: 'pinball',  qty: 6000 },
    { cost: 4470,  res: 'tatari',   qty: 40 },
    { cost: 6140,  res: 'candy',    qty: 300000 },
    { cost: 14000, res: 'pinball',  qty: 2800 },
    { cost: 5580,  res: 'tatari',   qty: 50 },
    { cost: 1880,  res: 'drink',    qty: 300,  off: { res: 'candy', qty: 92000 } },
    { cost: 8930,  res: 'tatari',   qty: 80 },
  ],
];

/* The stages laid end to end, which is the ladder everything else walks. Each
   reward carries its place on the stage counter: `stage` is which stage, `x` and
   `of` the x/y the game shows while it is the one being worked on.
   STAGE_SPANS[g] is where stage g sits in LADDER, by index. */
const LADDER = [];
const STAGE_SPANS = [];
STAGES.forEach((rewards, g) => {
  const from = g === 0 ? 0 : 1;
  const of = from + rewards.length - 1;
  STAGE_SPANS.push({ start: LADDER.length, end: LADDER.length + rewards.length - 1, from, of });
  rewards.forEach((r, i) => LADDER.push(Object.assign({ stage: g, x: from + i, of }, r)));
});

/* The side events, and what a material reward pays in each.

   `mat` is which of a material reward's amounts the event pays, and `per` is
   what one of the machine's material payouts is worth in it: 1 raft, rod or
   pickaxe, 2 fertilizer, 100 bullet coins. Flying Shoes get 0, because the
   machine pays them too rarely to count, so Marathon Star is the track's shoes
   alone. With no side event running, material rewards pay their candy and the
   machine pays no material at all.

   `icon` is the game's own sprite, pulled from the client's asset bundles. */
const SIDE_EVENTS = [
  { id: 'raft',     name: 'Raft Race',     material: 'Raft',             mat: 'raft',       per: 1,   icon: 'icons/raft.png' },
  { id: 'fishing',  name: 'Fishing',       material: 'Fishing Rods',     mat: 'rod',        per: 1,   icon: 'icons/rods.png' },
  { id: 'treasure', name: 'Treasure Hunt', material: 'Iron Pickaxes',    mat: 'pickaxe',    per: 1,   icon: 'icons/pickaxe.png' },
  { id: 'zobo',     name: 'Zobo Shooter',  material: 'Bullet Coins',     mat: 'coins',      per: 100, icon: 'icons/zobo.png' },
  { id: 'farm',     name: 'Cozy Farm',     material: 'Magic Fertilizer', mat: 'fertiliser', per: 2,   icon: 'icons/fertiliser.png' },
  { id: 'star',     name: 'Marathon Star', material: 'Flying Shoes',     mat: 'shoes',      per: 0,   icon: 'icons/shoes.png' },
  { id: 'none',     name: 'No side event', material: 'Material',         mat: null,         per: 0,   icon: null },
];

/* One tile per bucket, in this order. `short` is what a ladder row calls the
   reward, where the tile's fuller name would read badly ("5 Catch Tatari", not
   "5 Catch Tatari / Capsules"), and `singular` is that name at a quantity of
   one ("1 Blue Card Pack"). */
const BUCKETS = {
  pinball:  { label: 'Pinballs',              icon: 'icons/pinball.png' },
  tatari:   { label: 'Catch Tatari / Capsules', short: 'Catch Tatari', icon: 'icons/catch.png' },
  drink:    { label: 'Energy Drinks',         icon: 'icons/drink.png' },
  candy:    { label: 'Candy',                 icon: 'icons/candy.png' },
  material: { label: 'Material',              icon: null },   // named by the side event
  card:     { label: 'Blue Card Packs',       singular: 'Blue Card Pack', icon: 'icons/card.png' },
  boost:    { label: 'x2 Multiplier',         icon: 'icons/boost.png', unit: 'min' },
};

/* Text behind each "?" button. Anything that needs a sentence to be honest
   lives here rather than as a permanent paragraph on the page. */
const HELP = {
  /* The how-to is markup rather than text, in HELP_HTML below, because its
     pictures belong between the steps instead of after them. The entries here
     with no "?" left (event, gold, pins, slots, launch, spread, goal) are kept
     for reference and shown nowhere. */
  event: 'Material rewards on ' + TRACK + ' pay the material of the side event, in the amounts '
       + 'the game shows for that event. With no side event, they pay candy.\n\n'
       + 'The machine also pays material: 1 raft, fishing rod or iron pickaxe, 2 magic '
       + 'fertilizer or 100 bullet coins per payout. Marathon Star counts only the shoes from '
       + 'the track.',

  gold: 'During Gold Rush, drink rewards pay energy drinks. Without it they pay candy, except '
      + 'one that pays 120 pinballs.\n\n'
      + 'During Gold Rush the machine also pays energy cans, and pays back fewer pinballs.',

  pins: 'The pinballs you have. Results assume you play all of them. Lightbulbs are won from '
      + 'the machine, not spent.\n\n'
      + 'Each launch pays one of:\n'
      + '• 4 lightbulbs (25.5%)\n'
      + '• 1 unit of side event material (22%)\n'
      + '• energy cans, during Gold Rush (22%)\n'
      + '• something else, sometimes pinballs, which are played too',

  replay: 'On: pinballs from ' + TRACK + ' rewards are played too, which wins more lightbulbs. '
        + 'Off: they are kept.\n\n'
        + 'Over the whole track, every 100 pinballs played bring back about 12.',

  slots: 'Card Slot and Duel pay pinballs too, and those are played as well.\n\n'
       + 'The amount varies a lot: most launches pay none, a few pay many. Turn off to leave '
       + 'them out.',

  launch: 'A ×100 launch uses 100 pinballs and pays 100 times a single roll. The average '
        + 'result is the same at every launch size. Bigger launches vary more.',

  where: 'Where you already are on ' + TRACK + ', so the results count only what your '
       + 'pinballs win from here. Copy the three numbers off the event window, as below.\n\n'
       + 'Two stages of 8 end on 500 Pinballs. Pick the second if you have claimed a 500 '
       + 'Pinballs grand prize or are working on one.',

  spread: 'Ranges: the band 80% of runs land in, beside each figure.\n'
        + 'Chart: every outcome, which can be clicked to read the page at one point of it.\n\n'
        + 'At ×1 launches the range is about ±2%. Bigger launches widen it.\n\n'
        + 'Both cost extra work on a goal. Turn them off if the page feels slow.',

  dist: 'How likely each outcome is. Taller bars are more likely. Click or drag to show the '
      + 'page for that outcome.\n\n'
      + 'For a goal, the chart shows pinballs needed instead. The left end needs fewer, which '
      + 'is the lucky end.',

  next: 'Progress toward the next reward on the run shown.\n\n'
      + '"More pinballs" is how many you need on top of what you have for a 50% chance of '
      + 'reaching it. Bring more to be safer.',

  goal: 'Enter an amount and pick a resource. The page shows the pinballs needed, and what '
      + 'else you win on the way.\n\n'
      + 'The main figure gives a 50% chance. Beside it are the pinballs for a 90% chance '
      + 'and for a 10% chance.\n\n'
      + 'Pinballs means pinballs played, which is what "use N pinballs" quests count. Some are '
      + 'paid back, so you need fewer of your own.\n\n'
      + 'Track rewards run out at the last reward. Ask for more than is left and the page shows '
      + 'the pinballs to claim all that is left. Event material has no limit, and neither do '
      + 'energy cans during Gold Rush.',

  /* TODO: the Discord invite. The link is not settled yet, so the text says to
     come and tell us without saying where, which is half an ask. Put the URL in
     `COMMUNITY` above and the sentence finishes itself. */
  end: 'That is all ' + LADDER.length + ' rewards in ' + STAGES.length + ' stages. The machine '
     + 'still pays material, and energy cans during Gold Rush, after the last one.\n\n'
     + 'If something does not match your game, '
     + (COMMUNITY ? 'tell us: ' + COMMUNITY : 'a link to report it is coming.'),

  need: 'Pinballs needed from where you are to reach this reward on an average run, counting '
      + 'pinballs paid back on the way.\n\n'
      + 'A tick means the reward is claimed on the run shown. Click a row to enter its number.',

  cans: 'Only during Gold Rush. ' + TRACK + ' pays a fixed amount and the machine pays the '
      + 'rest, so the range is the machine part.\n\n'
      + 'Not counted: cans from Radish Run star slots.',

  shoes: 'From ' + TRACK + ' rewards only.\n\n'
       + 'Not counted: shoes from star slots.',
};

/* Help whose pictures sit between its paragraphs, so it is markup rather than
   text. Only the how-to, which the "?" in the header opens. Width and height are
   each file's own, so the window is laid out before the pictures arrive. */
const HELP_HTML = {
  howto: '<p>This calculator shows what your pinballs will get you from the pinball machine '
       + 'and ' + TRACK + ' (also called Mad Invention or Rebuild). It can also work backwards '
       + 'and tell you how many pinballs a goal takes, like 6,000 fishing rods or 20,000 '
       + 'pinballs used.</p>'

       + '<p>Pick which one you want under <b>Predict</b>.</p>'
       + '<figure class="help-step"><img src="help/howto-predict.png" width="459" height="117" '
       + 'alt="The Predict switch, set to Rewards rather than Pinballs needed" /></figure>'

       + '<p>The rest of the settings are mostly self explanatory. Set them to match your '
       + 'game, then enter the pinballs you have, or the goal you want.</p>'

       + '<p><b>Show ranges</b> adds the range each number can land in, instead of just the '
       + 'average. It takes longer to work out, so turn it off if the page feels slow.</p>'
       + '<figure class="help-step"><img src="help/howto-ranges.png" width="367" height="111" '
       + 'alt="The Luck section, with Show ranges ticked and the outcomes chart unticked" /></figure>'

       + '<p>Already partway through ' + TRACK + '? Enter where you are under <b>Preexisting '
       + 'progress</b>. The "?" next to it shows which number goes where.</p>'
       + '<figure class="help-step"><img src="help/howto-progress.png" width="436" height="294" '
       + 'alt="The Preexisting progress section: Grand Prize Progress, the grand prize picker, '
       + 'and the lightbulbs on the progress bar" /></figure>',
};

/* The help window's title: what the "?" sits on, so the window names the thing
   it is explaining instead of saying "Help" every time. */
const HELP_TITLES = {
  howto: 'How to use this page',
  event: 'Active event',
  gold: 'Gold Rush',
  pins: 'Pinballs in hand',
  replay: 'Pinballs won',
  slots: 'Card Slot and Duel pinballs',
  launch: 'Launch size',
  where: 'Preexisting progress',
  spread: 'Luck',
  goal: 'Goal',
  dist: 'Possible outcomes',
  next: 'Next up',
  end: 'The end of the track',
  need: 'Pinballs needed',
  cans: 'Energy Drinks',
  shoes: 'Flying Shoes',
};

/* The picture shown after a help text, as markup. Only "where you are now" has
   one: the event window and the small event card, with an arrow from each number
   to the box it goes in, because the grand prize counter is easier to show than
   to describe. Width and height are the file's own, so the popover is laid out
   at full size before the image arrives. */
const HELP_FIGURES = {
  where: '<div class="help-figs">'
    + '<figure><img src="help/preexisting_progress_guide.png" width="1000" height="907" '
    + 'alt="The event window reading Grand Prize Progress 0/7, with 25 Catch Tatari in '
    + 'the big card and 244/1120 on the progress bar, and an arrow from each of those '
    + 'numbers to the box it goes in on this page" /></figure>'
    + '</div>',
};

/* What the source chart could not settle, or where it disagreed with earlier
   recordings. Kept for us, not shown on the page: these are notes on the data's
   provenance, not something a player needs. The same list is in the README under
   "Known gaps". */
const DATA_NOTES = [
  'The ladder is the full chart: 150 rewards in 13 stages, with the stage counter, every candy amount and every event material printed.',
  'Material amounts are stored as printed per event. They sit near 1 raft = 1 rod = 1 pickaxe = 2 fertilizer = 100 bullet coins, but not on it (4,920 and 4,900 bullet coins where 5,000 would fit, 495 fertilizer for 250 rafts), and Flying Shoes follow no rate at all.',
  'The chart leaves the fishing rods off the 350 lightbulb material reward in the x/8 stage ending on 30 Catch Tatari. It is stored as 50, as on every other reward of that size.',
  'Earlier recordings had two rewards at 240 lightbulbs after the ×600 multiplier, 120 pinballs and then 100 energy drinks. They are one reward: 100 energy drinks during Gold Rush, 120 pinballs without it. Every reward after it is one lower than in older links.',
  'Earlier recordings had the 10 Catch Tatari after 480 pinballs at 540 lightbulbs, and the 350 lightbulb reward after it as candy. The chart has 640, and a material reward that pays candy only with no side event running.',
  'Card rewards print candy beside the pack. Card packs have always been recorded as paid, so the candy is stored but never paid out.',
  'The Super Multiplier ×300 and ×600 are read as x2 for 300 and 600 seconds, which is the 5 and 10 minutes earlier recordings gave them.',
];
