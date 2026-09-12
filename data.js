/* ============================================================================
   DATA: the reward ladder.

   Mad Invention, Tatari Party and Rebuild are the same mechanism under three
   names: one ordered list of rungs, read top to bottom. Each rung costs a
   number of lightbulbs; once that many have been handed in, the rung pays out
   and the next one starts. Nothing is skippable and nothing is chosen, so the
   whole event is a running total.

   Two things outside the ladder decide what a rung actually hands you:

   * Which side event is running. The material rungs pay that event's material
     (boards, rods, pickaxes, zobo coins or fertiliser), and they are the same
     reward at a fixed exchange rate, so the ladder stores base units and
     SIDE_EVENTS multiplies. This is why the three recordings looked different:
     step 18 was read as 40 boards, 8,000 shop coins and 80 fertiliser, which is
     40 units under all three rates.

   * Whether Gold Rush is running. The drink rungs pay energy drinks while it
     is, and candy while it is not.

   `qty: null` means the payout size was never recorded. Candy has no qty at all,
   because the amount is rolled per event rather than printed, so candy is
   counted, never summed.
   ========================================================================= */

/* What to call the lightbulb track on screen. The game rotates the name between
   Mad Invention, Tatari Party and Rebuild, but they are one mechanism, so the
   page picks one and uses it everywhere rather than saying "the reward track".
   Change this line when the name changes. */
const TRACK = 'Tatari Party';

/* Where to send a correction or a deeper pass. TODO: fill in the Discord invite.
   Empty until then, and the help text says a link is coming rather than pointing
   nowhere. */
const COMMUNITY = '';

const LADDER = [
  /*  1 */ { cost: 80,   res: 'pinball',  qty: 80 },
  /*  2 */ { cost: 70,   res: 'candy' },
  /*  3 */ { cost: 150,  res: 'tatari',   qty: 5 },
  /*  4 */ { cost: 100,  res: 'drink',    qty: 50 },
  /*  5 */ { cost: 200,  res: 'pinball',  qty: 120 },
  /*  6 */ { cost: 220,  res: 'tatari',   qty: 5 },
  /*  7 */ { cost: 300,  res: 'boost',    qty: 5 },      // x2 for 5 minutes
  /*  8 */ { cost: 120,  res: 'card',     qty: 1 },      // the chart prints 2 cards, which is one pack
  /*  9 */ { cost: 400,  res: 'pinball',  qty: 200 },
  /* 10 */ { cost: 250,  res: 'material', qty: 50 },
  /* 11 */ { cost: 890,  res: 'tatari',   qty: 20 },
  /* 12 */ { cost: 160,  res: 'pinball',  qty: 80 },
  /* 13 */ { cost: 130,  res: 'drink',    qty: 55 },
  /* 14 */ { cost: 300,  res: 'pinball',  qty: 120 },
  /* 15 */ { cost: 220,  res: 'tatari',   qty: 5 },
  /* 16 */ { cost: 200,  res: 'candy' },
  /* 17 */ { cost: 220,  res: 'tatari',   qty: 5 },
  /* 18 */ { cost: 200,  res: 'material', qty: 40 },
  /* 19 */ { cost: 1000, res: 'pinball',  qty: 500 },
  /* 20 */ { cost: 340,  res: 'drink',    qty: 165 },
  /* 21 */ { cost: 190,  res: 'tatari',   qty: 5 },
  /* 22 */ { cost: 250,  res: 'candy' },
  /* 23 */ { cost: 220,  res: 'tatari',   qty: 5 },
  /* 24 */ { cost: 250,  res: 'card',     qty: 1 },
  /* 25 */ { cost: 220,  res: 'tatari',   qty: 5 },
  /* 26 */ { cost: 250,  res: 'material', qty: 50 },
  /* 27 */ { cost: 1000, res: 'pinball',  qty: 500 },
  /* 28 */ { cost: 220,  res: 'tatari',   qty: 5 },
  /* 29 */ { cost: 240,  res: 'pinball',  qty: 120 },
  /* 30 */ { cost: 330,  res: 'candy' },
  /* 31 */ { cost: 600,  res: 'boost',    qty: 10 },     // x2 for 10 minutes
  /* 32 */ { cost: 240,  res: 'pinball',  qty: 120 },
  /* 33 */ { cost: 240,  res: 'drink',    qty: 100 },
  /* 34 */ { cost: 1120, res: 'tatari',   qty: 25 },
  /* 35 */ { cost: 240,  res: 'pinball',  qty: 120 },
  /* 36 */ { cost: 290,  res: 'candy' },
  /* 37 */ { cost: 290,  res: 'material', qty: 50 },
  /* 38 */ { cost: 260,  res: 'tatari',   qty: 5 },
  /* 39 */ { cost: 290,  res: 'candy' },
  /* 40 */ { cost: 530,  res: 'tatari',   qty: 10 },
  /* 41 */ { cost: 290,  res: 'unknown',  qty: null, note: 'This rung costs 290 but its reward was never written down.' },
  /* 42 */ { cost: 1310, res: 'tatari',   qty: 25 },
  /* 43 */ { cost: 710,  res: 'pinball',  qty: 300 },
  /* 44 */ { cost: 580,  res: 'drink',    qty: 200 },
  /* 45 */ { cost: 1310, res: 'tatari',   qty: 25 },
  /* 46 */ { cost: 710,  res: 'pinball',  qty: 300 },
  /* 47 */ { cost: 290,  res: 'card',     qty: 1 },
  /* 48 */ { cost: 260,  res: 'tatari',   qty: 5 },
  /* 49 */ { cost: 580,  res: 'candy' },
  /* 50 */ { cost: 2860, res: 'pinball',  qty: 1000 },
  /* 51 */ { cost: 320,  res: 'tatari',   qty: 5 },
  /* 52 */ { cost: 350,  res: 'material', qty: 50 },
  /* 53 */ { cost: 400,  res: 'pinball',  qty: 140 },
  /* 54 */ { cost: 700,  res: 'candy' },
  /* 55 */ { cost: 320,  res: 'tatari',   qty: 5 },
  /* 56 */ { cost: 860,  res: 'pinball',  qty: 300 },
  /* 57 */ { cost: 700,  res: 'drink',    qty: 200 },
  /* 58 */ { cost: 1910, res: 'tatari',   qty: 30 },   // recorded as "30 Capsules", same item
  /* 59 */ { cost: 1370, res: 'pinball',  qty: 480 },
  /* 60 */ { cost: 540,  res: 'tatari',   qty: 10 },
  /* 61 */ { cost: 350,  res: 'candy' },
  /* 62 */ { cost: 320,  res: 'tatari',   qty: 5 },
  /* 63 */ { cost: 760,  res: 'candy' },
  /* 64 */ { cost: 640,  res: 'tatari',   qty: 10 },
  /* 65 */ { cost: 1710, res: 'pinball',  qty: 600 },
  /* 66 */ { cost: 630,  res: 'drink',    qty: 180 },
  /* 67 */ { cost: 320,  res: 'tatari',   qty: 5 },
  /* 68 */ { cost: 1290, res: 'pinball',  qty: 450 },
  /* 69 */ { cost: 700,  res: 'material', qty: 100 },
  /* 70 */ { cost: 960,  res: 'tatari',   qty: 15 },
];

/* The side events, and what a material rung pays in each.

   `per` is that event's material per base unit:
       1 rod = 1 board = 1 pickaxe = 2 fertiliser = 200 zobo coins.

   `icon` is the game's own sprite, pulled from the client's asset bundles.
   All five were found in the client's own bundles. */
const SIDE_EVENTS = [
  { id: 'marathon', name: 'Marathon',      material: 'Boards',     one: 'board',       per: 1,   icon: 'icons/boards.png' },
  { id: 'fishing',  name: 'Fishing',       material: 'Rods',       one: 'rod',         per: 1,   icon: 'icons/rods.png' },
  { id: 'treasure', name: 'Treasure Hunt', material: 'Pickaxes',   one: 'pickaxe',     per: 1,   icon: 'icons/pickaxe.png' },
  { id: 'zobo',     name: 'Zobo Shooter',  material: 'Zobo Coins', one: 'zobo coins',  per: 200, icon: 'icons/zobo.png' },
  { id: 'farm',     name: 'Cozy Farm',     material: 'Fertiliser', one: 'fertiliser',  per: 2,   icon: 'icons/fertiliser.png' },
];

/* One tile per bucket, in this order. `countOnly` means the payout size is
   never printed, so the tile counts rewards instead of summing units.
   `short` is what a ladder row calls the reward, where the tile's fuller name
   would read badly ("5 Catch Tatari", not "5 Catch Tatari / Capsules"), and
   `singular` is that name at a quantity of one ("1 Blue Card Pack"). */
const BUCKETS = {
  pinball:  { label: 'Pinballs',              icon: 'icons/pinball.png' },
  tatari:   { label: 'Catch Tatari / Capsules', short: 'Catch Tatari', icon: 'icons/catch.png' },
  drink:    { label: 'Energy Drinks',         icon: 'icons/drink.png' },
  candy:    { label: 'Candy',                 icon: 'icons/candy.png', countOnly: true, note: 'amount varies' },
  material: { label: 'Material',              icon: null },   // named by the side event
  card:     { label: 'Blue Card Packs',       singular: 'Blue Card Pack', icon: 'icons/card.png' },
  boost:    { label: 'x2 Multiplier',         icon: 'icons/boost.png', unit: 'min' },
  // Counted, not summed. Rung 41's payout was never recorded, so there is no
  // quantity to add up, only a number of times it was handed out.
  unknown:  { label: 'Unconfirmed',           icon: null, countOnly: true,
              note: 'reward never recorded' },
};

/* Text behind each "?" button. Anything that needs a sentence to be honest
   lives here rather than as a permanent paragraph on the page. */
const HELP = {
  event: TRACK + ' pays the material of whichever side event is running. '
       + 'They are the same reward at a fixed rate: 1 board = 1 rod = 1 pickaxe = '
       + '2 fertiliser = 200 zobo coins, so picking the right event only changes the '
       + 'name and the number, not what you are actually getting.',

  gold: 'Some ' + TRACK + ' rewards pay energy drinks during Gold Rush and candy when it '
      + 'is not running. Candy amounts are rolled rather than printed, which is why candy '
      + 'is only ever counted here, never totalled.',

  pins: 'The pinballs you hold right now. Everything below is what happens if you play '
      + 'them all. You do not spend lightbulbs. The machine pays them out and they move '
      + 'you along ' + TRACK + '.\n\n'
      + 'Each launch pays one reward and only one: 25.5% of the time it is 4 lightbulbs, '
      + '22% of the time it is 1 unit of the running side event’s material, and while Gold '
      + 'Rush is on it pays energy cans at that same rate. The rest is everything else the '
      + 'machine drops, some of which is more pinballs, and those get played too.',

  replay: TRACK + ' pays pinballs. Left on, those get played too, which wins more '
        + 'lightbulbs, which reaches more rewards. It is a loop. Roughly every 100 pinballs you '
        + 'play come back as 15 more, so your pile stretches about 18% further than it looks. '
        + 'Turn it off to see what you get if you bank them instead.',

  slots: 'The machine pays pinballs out of its own slots as well, and those get played like any others, so your pile goes further than the number you typed.\n\n'
       + 'It is lumpy: most launches pay none and a few pay a lot, which is why the figures here move when you turn it off. Turn it off to see what the page says without it, or if you would rather not count on it.',

  launch: 'The machine can fire several balls at once. A ×100 launch eats 100 balls and rolls '
        + 'ONCE, paying 100 times the single-ball reward. Your average haul is exactly the '
        + 'same either way, but the bigger the launch, the wilder the swing. Ten rolls of '
        + '×100 can land far from what you expected; a thousand ×1 rolls almost cannot.',

  where: 'The game never shows a running lightbulb total, so tell it where you are instead: '
       + 'type the lightbulb cost printed on the reward you are working on, then pick that '
       + 'reward from the list. Costs repeat along the track, so each option also names what '
       + 'comes after it, so match that against your screen.',

  spread: 'By default every number here is a typical run, the outcome you should expect. Luck '
        + 'moves it less than you would think: at ×1 launches, nine runs in ten land within about '
        + '2% of that figure, which is why the plain number is usually the whole answer.\n\n'
        + 'Turn this on when the swing matters: big launch sizes, or when you are one reward '
        + 'short and want to know the odds. It adds the range beside each figure and a chart of '
        + 'every way your pinballs could land, which you can click to read the page as a lucky '
        + 'or unlucky run instead.',

  dist: 'Luck decides how far your pinballs get you, and this is the shape of it. Tall bars '
      + 'are the outcomes most likely to happen. Click or drag anywhere on it to read the '
      + 'whole page as that outcome instead: a bad run, a typical one, a lucky one.\n\n'
      + 'When you are aiming for something the chart turns around, because so does the '
      + 'question. It then shows what the goal could TAKE rather than what a pile could give, '
      + 'measured in pinballs, with the cheap end on the left, since needing fewer of them is '
      + 'the lucky outcome. Clicking picks which run you are planning for, and the pinballs to '
      + 'bring follow it.',

  next: 'The bar is how far along this reward you would be. The line under it answers "will I '
      + 'actually get it?", two ways depending on how close it is.\n\n'
      + '"36% chance you reach it" means that out of every run with the pinballs you hold, 36% '
      + 'END with that reward claimed, after playing everything, including the pinballs the '
      + TRACK + ' pays back. It is about where you finish, not where you stand now.\n\n'
      + 'Once the odds fall below 5% a percentage stops being worth reading, so it shows the '
      + 'shortfall instead: how many more pinballs than you hold it takes. It is the halfway '
      + 'number, not a promise: bring exactly that many and about half of runs claim the '
      + 'reward while half fall short, so bring more if you want it for certain.',

  goal: 'The same question from the other end. Say what you are after and the pinballs to '
      + 'bring are worked out and shown on the right, with the rest of the page describing '
      + 'that run, so you also see everything else you collect on the way there.\n\n'
      + 'It is a chance, not a price. The figure is what gets you there on an average run, '
      + 'which is another way of saying half of runs fall short of it. Turn on “Show the '
      + 'spread” and it also gives you the number that gets there 90% of the time, and the '
      + 'one a lucky run can manage.\n\n'
      + 'Pinballs are offered too, and mean the number you get to PLAY rather than a net '
      + 'gain, since that is what a "use N pinballs" quest counts. ' + TRACK + ' hands some '
      + 'back, so playing 20,000 costs you fewer than 20,000 of your own.\n\n'
      + 'Rewards from the track run out at reward ' + LADDER.length + ', so asking for more '
      + 'than it pays cannot be done. Rather than inventing a number it tells you the most '
      + 'there is and shows you what claiming all of that takes. Event material has no '
      + 'ceiling: the machine keeps paying it for as long as you keep playing, and energy '
      + 'cans have none either while Gold Rush is running.',

  /* TODO: the Discord invite. The link is not settled yet, so the text says to
     come and tell us without saying where, which is half an ask. Put the URL in
     `COMMUNITY` below and the sentence finishes itself. */
  end: 'The track does not stop at reward ' + LADDER.length + '. It carries on, and nobody has '
       + 'recorded how far: these ' + LADDER.length + ' are simply as deep as anyone has been on a '
       + 'pass that was written down. So treat the end of this list as the end of what is '
       + 'KNOWN, not the end of the event.\n\n'
     + 'One reward inside the list is missing too: reward 41 costs its 290 lightbulbs and '
       + 'nobody wrote down what it pays, so it is counted rather than added up. Every total '
       + 'after it is still right, because the cost is what moves you along.\n\n'
     + 'If you have been further than reward ' + LADDER.length + ', or you know what 41 pays, '
       + 'that is the missing piece and it would be very welcome. '
     + (COMMUNITY ? 'Come and tell us: ' + COMMUNITY : 'A link to where to send it is coming.'),

  need: 'The pinballs a typical run needs to reach this reward, counted from where you are '
      + 'now. It already credits the pinballs ' + TRACK + ' hands back along the way, which '
      + 'is why the numbers climb more slowly than the lightbulb costs beside them.\n\n'
      + 'A tick means you have enough already. Click any row to fill that number in.',

  machine: 'Most of this comes from the machine, not ' + TRACK + '. The track pays a few '
         + 'big chunks of it, while the machine pays it out of launches that missed the '
         + 'lightbulbs, which is the bulk of them. That is why the row is split: the track '
         + 'half is fixed once you know how far you get, and the machine half is a range, '
         + 'because it stays down to luck even after the lightbulbs are settled.\n\n'
         + 'Energy cans work this way only while Gold Rush is running. Without it the machine '
         + 'pays none, and the ' + TRACK + ' rungs that would have paid cans pay candy.',
};

/* What the source chart could not settle. Kept for us, not shown on the page:
   these are notes on the data's provenance, not something a player needs. The
   same list is in the README under "Known gaps". */
const DATA_NOTES = [
  'Material rungs are stored in base units and converted for the running side event: 1 board = 1 rod = 1 pickaxe = 2 fertiliser = 200 zobo coins. The three recordings of the chart agree exactly under those rates.',
  'Rung 13 (130 bulbs) was recorded as candy on two passes and as 55 cans on a third, the mark of a drink rung read with and without Gold Rush running. It is treated as a drink rung.',
  'Rung 41 (290 bulbs) has no reward recorded at all. It still costs its 290, so every total after it stays correct.',
  'The card rungs are printed on the chart as 2 blue cards, which is one 2-card pack. The ladder stores packs, so each of those rungs is 1.',
  'Candy amounts are rolled rather than printed, so candy is counted as a number of rewards, never a number of units.',
  'The ladder is 70 rungs as recorded from the deepest pass. It does NOT end there: the track carries on, and how far is unknown.',
];
