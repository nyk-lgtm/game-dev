// Tidings: every event card. Authored text; the run recombines them by stop,
// place kind, flags set earlier (callbacks), companions and promises.
// Effects are short strings: 'f+2 c-1' = +2 food, −1 coin (f food, o oil,
// c coin, h health, t trust).

import type { CompId, Fx, Kind, Res } from './data';

export type Sky = 'day' | 'dusk' | 'night' | 'storm' | 'snow' | 'fog' | 'dawn';

export interface Outcome {
  fx: Fx;
  out: string;
}
export interface Choice {
  t: string;
  fx: Fx;
  out: string;
  /** Only with this companion in the band. */
  need?: CompId;
  /** A gamble: chance of fx/out, else `lose`. */
  odds?: number;
  /** A riddle answer: shows both outcomes; `right` says which one it gets. */
  riddle?: boolean;
  right?: boolean;
  lose?: Outcome;
  /** This companion in the band adds to the odds. */
  boost?: [CompId, number];
  /** Flag for a later callback. */
  set?: string;
  clear?: string;
  join?: CompId;
  /** Start carrying a promise to Hollin / break one. */
  promise?: string;
  breaks?: string;
}
export interface Cond {
  flag?: string;
  noFlag?: string;
  comp?: CompId;
  promise?: string;
  /** Stops after the flag was set (or the companion joined) before this shows. Default 2. */
  gap?: number;
}
export interface Card {
  id: string;
  title: string;
  /** One to three emoji: the vignette's figures. */
  art: string;
  sky?: Sky;
  text: string;
  /** Other tellings; a run picks one by its seed. */
  alts?: { title?: string; text: string; art?: string }[];
  /** Stops it can show at (inclusive). */
  at: [number, number];
  /** Place kinds it belongs to; none = anywhere. */
  where?: Kind[];
  when?: Cond;
  /** A callback: dealt first when it is ready. */
  cb?: boolean;
  /** Can't be passed by: it is one of the cards you face. */
  must?: boolean;
  /** May come up again in the same run (at another stop). */
  repeat?: boolean;
  choices: Choice[];
}

/** 'f+2 c-1' → {f: 2, c: -1}. */
export function F(s: string): Fx {
  const fx: Fx = {};
  for (const tok of s.split(/\s+/).filter(Boolean)) {
    const m = /^([focht])([+-]\d+)$/.exec(tok);
    if (!m) throw new Error(`bad effect ${tok}`);
    fx[m[1] as Res] = Number(m[2]);
  }
  return fx;
}
type Extra = Omit<Choice, 't' | 'fx' | 'out'>;
const ch = (t: string, fx: string, out: string, x: Extra = {}): Choice => ({ t, fx: F(fx), out, ...x });
const gam = (t: string, odds: number, win: string, winOut: string, lose: string, loseOut: string, x: Extra = {}): Choice => ({
  t,
  fx: F(win),
  out: winOut,
  odds,
  lose: { fx: F(lose), out: loseOut },
  ...x,
});

/** A riddle answer: both outcomes shown, only the wit decides. */
const riddle = (t: string, right: boolean, win: string, winOut: string, lose: string, loseOut: string): Choice => ({
  t,
  fx: F(win),
  out: winOut,
  riddle: true,
  right,
  lose: { fx: F(lose), out: loseOut },
});

const L: [number, number] = [0, 3];
const U: [number, number] = [4, 7];
const P: [number, number] = [8, 10];

export const CARDS: Card[] = [
  // ------------------------------------------------------------ companions to recruit
  {
    id: 'goatgirl', title: 'The Goat Girl', art: '👧🐐', sky: 'day', at: [0, 6],
    text: `A girl in a patched coat sits on a milestone, whistling a goat down off a wall. She has walked every ridge to the pass, she says, and is bored of all of them.`,
    choices: [
      ch('Take her on', '', 'She shoulders a pack before you’ve finished asking.', { join: 'wren' }),
      ch('Buy her goat’s cheese', 'c-1 f+2', 'The cheese is sharp enough to wake the dead. Good.'),
      ch('Ask her about the pass', 't+1', '“Go in a dry week,” she says. “There aren’t any.” The band laughs for a mile.'),
    ],
  },
  {
    id: 'herbwife', title: 'The Herb Wife', art: '👵🌿', sky: 'day', at: [0, 6],
    text: `Old Tamsin sells bitter roots off a blanket. Her knees, she says, want one more mountain before they retire.`,
    choices: [
      ch('Welcome her along', '', 'She rolls up the blanket, roots and all.', { join: 'tamsin' }),
      ch('Buy a poultice', 'c-2 h+2', 'It stings, and then it doesn’t.'),
      ch('Trade bread for willow bark', 'f-1 h+1', '“Chew, don’t swallow,” she says. Too late.'),
    ],
  },
  {
    id: 'trader', title: 'A Trader Without a Cart', art: '🧔🎲', sky: 'dusk', at: [0, 6],
    text: `Pell lost his cart at dice and somehow kept his smile. “Feed me to Hollin,” he says, “and I’ll make you rich on the way.”`,
    choices: [
      ch('Shake on it', '', 'He shakes your hand, then the mule’s hoof, for luck.', { join: 'pell' }),
      ch('Buy his last trinket for the band', 'c-1 t+2', 'A tin bird that flaps when you blow on it. Silly. Everyone loves it.'),
      ch('Sell him your spare rope', 'c+2 t-1', 'He sells it back to the next traveller for twice the price, in front of you.'),
    ],
  },
  {
    id: 'lampmender', title: 'The Lamp Mender', art: '👨‍🔧🏮', sky: 'dusk', at: [0, 6],
    text: `A tinker’s barrow rattles with lamp chimneys. Bram says he’d sooner mend lamps on the road than wait for them to come to him.`,
    choices: [
      ch('Bring him along', '', 'He ties the barrow behind the mule. The mule has views.', { join: 'bram' }),
      ch('Have your lamps trimmed', 'c-2 o+3', 'They burn clean and steady, and twice as long.'),
      ch('Trade bread for wicks', 'f-2 o+2', 'Fair trade. He eats the bread right there.'),
    ],
  },
  {
    id: 'arrow', title: 'An Arrow in the Hedge', art: '🏹🐇', sky: 'day', at: [0, 6],
    text: `An arrow thunks into the fence post beside your head. Ysolde apologises, then shows you the rabbit behind it. “Hollin? I could use a walk.”`,
    choices: [
      ch('Ask her to come', '', 'She nods once. That seems to be a whole conversation.', { join: 'ysolde' }),
      ch('Buy the rabbit', 'c-1 f+2', 'She skins it while you watch, which you regret.'),
      gam('Hunt with her tonight', 0.7, 'f+3', 'Back before the fire’s lit, with supper for everyone.', 't-1', 'Nothing but wet boots. Nobody says it was your fault.'),
    ],
  },
  {
    id: 'fiddle', title: 'A Fiddle for Supper', art: '🎻🍲', sky: 'night', at: [0, 6],
    text: `Fen plays for his supper, and tonight nobody is feeding him. Your band is tapping its feet anyway.`,
    choices: [
      ch('Invite him along', '', 'He packs the fiddle in two shirts and a sock.', { join: 'fen' }),
      ch('Pay him to play on', 'c-1 t+2', 'He plays until the landlord blows out the lamps.'),
      ch('Dance till you drop', 'h-1 t+2', 'Worth every ache.'),
    ],
  },
  {
    id: 'mapbill', title: 'The Map on the Bill', art: '🗺️🍺', sky: 'dusk', at: [0, 6],
    text: `Corrie has drawn the pass on the back of a tavern bill: every switchback, and every lie the guidebooks tell.`,
    choices: [
      ch('Ask her to guide you', '', '“Finally,” she says, “someone who asks.”', { join: 'corrie' }),
      ch('Buy the map', 'c-2', 'She signs it, as if it might be worth something one day. It might.', { set: 'map' }),
      ch('Trade bread for her gossip', 'f-1 t+1', 'Half of it is true, and the other half is better.'),
    ],
  },
  {
    id: 'giant', title: 'The Quiet Giant', art: '🧍‍♂️🛒', sky: 'day', at: [0, 6],
    text: `A big man lifts a cart out of a ditch while its owner shouts at him. When the shouting stops, so does Hob.`,
    choices: [
      ch('Ask him to come', '', 'He picks up the heaviest sack without a word.', { join: 'hob' }),
      ch('Hire him for an hour', 'c-1 h+2', 'He carries everything heavy. Your backs sing.'),
      ch('Thank him for the both of you', 't+1', 'He goes pink to the ears.'),
    ],
  },

  // ------------------------------------------------------------ the lowlands
  {
    id: 'market', title: 'Market Day', art: '🧅🛢️', sky: 'day', at: [0, 7], where: ['town'], repeat: true,
    text: `Stalls fill the square: onions, lamp oil, wool, and a man selling nothing but spoons.`,
    alts: [
      { text: `It’s market day, and the square smells of onions, oil and wet sheep.` },
      { title: 'The Fair Field', text: `A fair has come to the field behind the church, with more cheese than sense.` },
    ],
    choices: [
      ch('Fill the food sacks', 'c-3 f+4', 'Onions, oats and a wheel of something yellow.'),
      ch('Buy lamp oil', 'c-3 o+3', 'Three good flasks, corked with wax.'),
      ch('Sell your spare blankets', 'c+3 h-1', 'Good money. Colder nights.'),
    ],
  },
  {
    id: 'orchard', title: 'The Orchard Wall', art: '🍎🧱', sky: 'day', at: L, where: ['road'],
    text: `Apples hang over a farm wall, red and heavy. The farmhouse window is dark.`,
    choices: [
      ch('Fill your pockets', 'f+2 t-1', 'Delicious, and a little guilty.'),
      ch('Knock and pay', 'c-1 f+2', 'The farmer throws in a pear and a long story.'),
      ch('Help with the picking', 'h-1 f+2 c+1', 'A sore back, a full sack, a coin besides.'),
    ],
  },
  {
    id: 'mud', title: 'Stuck in the Mud', art: '🛒🟫', sky: 'storm', at: [0, 4], where: ['road', 'river'],
    text: `A peddler’s cart is sunk to the axles, and so is the peddler.`,
    choices: [
      ch('Put your shoulders to it', 'h-1 t+1', 'It comes free with a sound like a boot leaving a bog. He swears he won’t forget.', { set: 'peddler' }),
      ch('Hob lifts it out', 't+1', 'Hob lifts the cart, then the peddler, and sets them both down gently.', { need: 'hob', set: 'peddler' }),
      ch('Buy his oil while he’s stuck', 'c-2 o+3', 'He gives you a fair price. He’s in no place to haggle.'),
    ],
  },
  {
    id: 'lostboy', title: 'The Lost Boy', art: '👦🥛', sky: 'day', at: L, where: ['town', 'road'],
    text: `A small boy sits beside an empty milk churn, lost, and very sure it is the churn’s fault.`,
    choices: [
      ch('Walk him home', 'f-1 o-1 t+1', 'Two miles out of your way. His mother’s face is worth it.', { set: 'boy' }),
      ch('Give him a coin and point the way', 'c-1', 'He trudges off in roughly the right direction.'),
      ch('Put him on the mule and ask around', 'h-1 t+1', 'Half the village knows him. The other half knows his dog.', { set: 'boy' }),
    ],
  },
  {
    id: 'well', title: 'The Wishing Well', art: '⛲🪙', sky: 'day', at: [0, 6], where: ['town', 'road', 'shrine'],
    text: `A mossy well with a sign: ONE COIN, ONE WISH. Somebody has added: NO REFUNDS.`,
    choices: [
      gam('Toss a coin and wish', 0.5, 'c-1 h+2 t+1', 'You feel lighter. Maybe it worked.', 'c-1', 'Plop. Nothing happens. Probably.'),
      ch('Fish the coins out', 'c+3 t-2', 'Your band watches you dry your sleeves and says nothing at all.'),
      ch('Just drink', 'h+1', 'Cold, sweet water. That was the wish.'),
    ],
  },
  {
    id: 'harvest', title: 'Harvest Hands Wanted', art: '🌾🧑‍🌾', sky: 'day', at: [0, 5], where: ['road', 'town'],
    text: `A farmer is short of hands and rain is coming. He pays in coin or in bread, your pick.`,
    choices: [
      ch('Work for coin', 'h-1 c+3', 'Blisters, and three coins warm from his fist.'),
      ch('Work for bread', 'h-1 f+3', 'His wife bakes while you work. You smell it all afternoon.'),
      ch('Rest under the hedge instead', 'h+1', 'You watch other people work, which is restful.'),
    ],
  },
  {
    id: 'toll', title: 'The Toll Bridge', art: '🌉🐕', sky: 'dusk', at: [0, 6], where: ['river'], must: true,
    text: `A toll-keeper with one tooth and a very large dog guards the only bridge for miles.`,
    choices: [
      ch('Pay the toll', 'c-2', 'He lifts the bar with enormous ceremony.'),
      ch('Wade the ford downstream', 'h-2', 'Cold to the ribs, but free.'),
      ch('Fen plays the dog to sleep', 't+1', 'The dog snores. The keeper is too charmed to charge.', { need: 'fen' }),
      ch('Hob just walks past', '', 'The dog looks at Hob, thinks about it, and lies down.', { need: 'hob' }),
    ],
  },
  {
    id: 'rain', title: 'Rain on the Downs', art: '🌧️🧥', sky: 'storm', at: L, where: ['road', 'river', 'town'], must: true,
    text: `Rain comes sideways off the downs and finds every gap in every coat.`,
    choices: [
      ch('Push on through', 'h-2', 'Wet to the bone, but on time.'),
      ch('Light a fire in a barn', 'o-1 f-1', 'You lose the afternoon, and dry out by the evening.'),
      ch('Corrie saw it coming', '', 'She had you under a barn roof before the first drop.', { need: 'corrie' }),
    ],
  },
  {
    id: 'bees', title: 'The Beekeeper’s Gate', art: '🐝🍯', sky: 'day', at: [0, 5], where: ['road', 'town'],
    text: `A beekeeper in a veiled hat offers honey for coin, or for help moving a hive at dusk.`,
    choices: [
      ch('Buy a pot of honey', 'c-2 f+2 h+1', 'Thick as butter and twice as good.'),
      gam('Help move the hive', 0.7, 'f+2 h+1', 'Not one sting. The keeper is astonished, and generous.', 'h-2', 'Several stings, all on the same hand.'),
      ch('Lie in the clover a while', 't+1', 'The band listens to the bees and nobody says a word.'),
    ],
  },
  {
    id: 'weddingletter', title: 'The Wedding Letter', art: '💌💍', sky: 'dusk', at: [0, 4], where: ['inn', 'town'],
    text: `A girl presses a letter and a ring into your hands. “For Tomas, in Hollin. Tell him yes.”`,
    choices: [
      ch('Carry it, free of charge', 't+1', 'She cries, and so, a little, does the mule.', { promise: 'ring' }),
      ch('Carry it for the usual postage', 'c+2', 'Fair is fair. She pays in coppers still warm from her pocket.', { promise: 'ring' }),
      ch('The pass is no place for rings', '', 'She nods, and keeps her yes for spring.'),
    ],
  },
  {
    id: 'trials', title: 'Sheepdog Trials', art: '🐑🏆', sky: 'day', at: [0, 5], where: ['town', 'road'],
    text: `The village is holding sheepdog trials, and the prize is a whole smoked ham.`,
    choices: [
      gam('Enter the mule', 0.25, 'c-1 f+5 t+2', 'The mule wins. Nobody, the mule included, knows how.', 'c-1 t+1', 'The mule sits down in the middle of the field. Everyone cheers anyway.'),
      gam('Bet on the favourite', 0.6, 'c+2', 'The favourite wins by a whisker.', 'c-2', 'The favourite chases a rabbit into the next parish.'),
      ch('Buy ham sandwiches', 'c-1 f+2', 'Thick-cut, with mustard that bites back.'),
      ch('Cheer from the wall', '', 'A dog called Biscuit wins. Everyone agrees it was robbed.'),
    ],
  },
  {
    id: 'hayloft', title: 'A Night in the Hayloft', art: '🌾🌙', sky: 'night', at: [0, 5], where: ['road', 'town'],
    text: `A farmer’s hayloft, warm and sweet-smelling. He asks only that nobody brings a lamp up the ladder.`,
    choices: [
      ch('Sleep like stones', 'h+1', 'You wake with straw in places straw should not go.'),
      ch('Trade a story for breakfast', 'f+1 t+1', 'He laughs at the right bits and feeds you anyway.'),
      ch('Pay for the loft and a hot supper', 'c-2 h+2 f+1', 'Stew, bread, and a whole night’s sleep.'),
    ],
  },
  {
    id: 'stray', title: 'The Stray', art: '🐕🫏', sky: 'day', at: [0, 4], where: ['road', 'town'],
    text: `A thin dog has followed the mule for a mile, pretending it hasn’t.`,
    choices: [
      ch('Feed it', 'f-1 t+1', 'It eats, then sits on your foot. It’s yours now, apparently.', { set: 'dog' }),
      ch('Shoo it home', '', 'It goes, slowly, looking back every few steps.'),
    ],
  },
  {
    id: 'dance', title: 'The Harvest Dance', art: '💃🏮', sky: 'night', at: [0, 5], where: ['town', 'inn'],
    text: `There’s a dance in the square tonight, and your band has been walking for a week.`,
    choices: [
      ch('Let them dance', 'c-1 t+2', 'Someone dances with the mule. The mule leads.'),
      ch('An early night instead', 'h+1', 'You fall asleep to the music through the wall.'),
      ch('Run a cider stall at the dance', 'c+3 t-1', 'Profitable. Nobody thanks you for it.'),
    ],
  },
  {
    id: 'lender', title: 'The Moneylender', art: '🧐💰', sky: 'dusk', at: [0, 3], where: ['town', 'inn'],
    text: `A moneylender with very soft hands offers six coins now, against eight later. “I always find people,” he smiles.`,
    choices: [
      ch('Borrow the six', 'c+6', 'He writes your name very neatly in a very small book.', { set: 'debt' }),
      ch('Decline politely', '', 'He shrugs, and smiles at the next traveller instead.'),
    ],
  },
  {
    id: 'ferry', title: 'The Ferry', art: '⛴️🌊', sky: 'day', at: [0, 7], where: ['river'],
    text: `The ferryman will take you across for two coins, and lets passengers put their feet up.`,
    alts: [{ text: `A flat ferry on a rope, and a ferryman who has opinions about everybody’s boots.` }],
    choices: [
      ch('Pay and rest your feet', 'c-2 h+2', 'The river slides by. Somebody snores.'),
      ch('Fen plays for the fare', 'h+2 t+1', 'The ferryman cries a bit at the slow one.', { need: 'fen' }),
      ch('Help him pole across', 'h-1 c+1', 'He pays you a coin for the work, to your surprise.'),
    ],
  },
  {
    id: 'eels', title: 'Eel Traps', art: '🐍🧺', sky: 'dawn', at: [0, 6], where: ['river'],
    text: `A row of wicker traps bobs at the river’s edge. An old woman is pulling them in, one by one, much too slowly.`,
    choices: [
      ch('Help her haul', 'h-1 f+3', 'She shares the catch, and her recipe, at length.'),
      ch('Buy a smoked eel', 'c-1 f+2', 'Better than it sounds. Much better than it looks.'),
      ch('Ask about the fords upstream', 't+1', 'She draws them in the mud with a stick. Everyone feels surer.'),
    ],
  },
  {
    id: 'swans', title: 'The Angry Swan', art: '🦢❗', sky: 'day', at: [0, 7], where: ['river', 'road'], must: true,
    text: `A swan stands in the middle of the path, wings out, daring you.`,
    choices: [
      ch('Go round through the reeds', 'h-1', 'Wet boots, and the swan’s low opinion of you.'),
      ch('Throw it your bread', 'f-1', 'It accepts the tribute and lets you pass.'),
      gam('Walk straight past it', 0.5, 't+1', 'It hisses, then lets you by. The band is very impressed.', 'h-2 t-1', 'Swans are much stronger than they look.'),
    ],
  },
  {
    id: 'pigs', title: 'Pigs in the Road', art: '🐖🐖', sky: 'day', at: L, where: ['road', 'town'],
    text: `A herd of pigs has escaped its pen and is having the best day of its life.`,
    choices: [
      ch('Round them up', 'h-1 c+2', 'Their owner pays two coins and gives you a look of deep respect.'),
      ch('Wait until they wander off', 'f-1', 'It takes all of lunchtime, and you eat it.'),
      ch('Let the band chase them', 't+2 h-1', 'Nobody catches a single pig. Nobody has laughed this hard in years.'),
    ],
  },
  {
    id: 'doctorparcel', title: 'The Doctor’s Parcel', art: '📦💊', sky: 'day', at: [0, 5], where: ['town'],
    text: `Hollin’s doctor sent for fever medicine weeks ago. The apothecary hands you the parcel: “Guard it like your own life.”`,
    choices: [
      ch('Take it, postage paid', 'c+2', 'It’s light. It feels heavy anyway.', { promise: 'medicine' }),
      ch('It’s too much to promise', '', 'He finds a carrier with a sturdier face.'),
    ],
  },
  {
    id: 'chapelbell', title: 'The Chapel Bell', art: '🔔⚒️', sky: 'day', at: [1, 6], where: ['town'],
    text: `Hollin’s chapel cracked its bell last winter. The foundry has cast a small new one, if you’ll carry it up.`,
    choices: [
      ch('Strap it to the mule', 'c+3 h-1', 'It clanks with every step, and it is not light.', { promise: 'bell' }),
      ch('Hob carries it', 'c+3', 'Hob tucks it under one arm like a loaf.', { need: 'hob', promise: 'bell' }),
      ch('Not this trip', '', 'The foundryman sighs and polishes it again.'),
    ],
  },
  {
    id: 'thatch', title: 'A Roof to Mend', art: '🏠🔨', sky: 'day', at: [0, 7], where: ['town', 'road'],
    text: `An old couple’s roof has blown half off. They have no money, but they have a smokehouse.`,
    choices: [
      ch('Mend it before dark', 'h-1 f+3 t+1', 'Smoked ham, and a roof that will see out the winter.'),
      ch('Bram fixes it properly', 'f+3 t+1', 'Bram finds the real leak in ten minutes.', { need: 'bram' }),
      ch('Wish them well', 't-1', 'Your band looks back at the roof for a long while.'),
    ],
  },

  // ------------------------------------------------------------ the hills
  {
    id: 'charcoal', title: 'Charcoal Burners', art: '🔥🪵', sky: 'dusk', at: U, where: ['wild'],
    text: `Smoke rises from turf mounds in a clearing. The burners trade oil for bread and news of the lowlands.`,
    choices: [
      ch('Swap bread and news for oil', 'f-1 o+2', 'They want every rumour told twice.'),
      ch('Buy a full flask', 'c-2 o+3', 'Black with soot and full to the stopper.'),
      ch('Sleep by the warm mounds', 'h+1', 'You wake smelling like a chimney, and warm right through.'),
    ],
  },
  {
    id: 'mushrooms', title: 'The Mushroom Ring', art: '🍄🌳', sky: 'fog', at: [3, 8], where: ['wild'],
    text: `Fat brown mushrooms ring an old oak. Some of these are supper. Some are a very bad night.`,
    choices: [
      gam('Pick and hope', 0.6, 'f+3', 'Fried in butter, they’re the best thing all week.', 'f+1 h-2', 'A very bad night indeed.'),
      ch('Tamsin sorts them', 'f+3', '“That one, that one, never that one.”', { need: 'tamsin' }),
      ch('Leave them to the oak', '', 'Probably wise.'),
    ],
  },
  {
    id: 'tower', title: 'The Old Watchtower', art: '🏰✨', sky: 'dusk', at: [3, 8], where: ['wild', 'shrine'],
    text: `A ruined watchtower, its stair still standing. Something glints at the very top.`,
    choices: [
      gam('Climb up with a lamp', 0.5, 'o-1 c+5', 'A soldier’s purse, forgotten for a hundred years.', 'o-1 h-1', 'A jackdaw’s hoard of buttons, and a turned ankle.'),
      ch('Wren goes up', 'c+4', 'She’s down again before you’ve looked away, grinning.', { need: 'wren' }),
      ch('Camp in its lee', 'h+1', 'The wind goes round you all night.'),
    ],
  },
  {
    id: 'gorge', title: 'The Gorge Bridge', art: '🌉🪢', sky: 'fog', at: [4, 8], where: ['river', 'wild'], must: true,
    text: `A rope bridge sways over the gorge, missing every third plank.`,
    choices: [
      ch('Cross one at a time, slowly', 'o-1 h-1', 'Hours of it, lamps lit in the spray.'),
      ch('Go round by the valley', 'f-2', 'A whole day’s walk around, and a whole day’s food.'),
      gam('Run it', 0.7, '', 'Everyone over, hearts in mouths.', 'h-3', 'A plank goes. Somebody’s leg goes with it, nearly.', { boost: ['wren', 0.2] }),
      ch('Hob carries the mule over', 't+1', 'Nobody will ever forget the mule’s face.', { need: 'hob' }),
    ],
  },
  {
    id: 'spring', title: 'The Hot Spring', art: '♨️🪨', sky: 'fog', at: [4, 9], where: ['wild', 'shrine'],
    text: `Steam curls from a pool in the rocks, hot as a bath and smelling of eggs.`,
    choices: [
      ch('Soak until you’re pink', 'f-1 h+3', 'Half a day gone, and nobody minds.'),
      ch('A quick dip and press on', 'h+1', 'Warm all the way to the next stop.'),
      ch('Boil eggs in it for the road', 'f+2', 'Everyone agrees not to discuss the smell.'),
    ],
  },
  {
    id: 'wolves', title: 'Wolves at Dusk', art: '🐺🌲', sky: 'dusk', at: [4, 10], where: ['wild', 'heights'], must: true,
    text: `Grey shapes keep pace with you in the trees, never closer, never further.`,
    choices: [
      ch('Burn torches all night', 'o-2', 'Eyes in the dark until dawn. Nothing more.'),
      ch('Throw them the dried meat', 'f-2', 'They take it and melt away.'),
      ch('Ysolde drives them off', 't+1', 'One arrow into the snow at the leader’s feet. That’s all it takes.', { need: 'ysolde' }),
      gam('Keep walking and hope', 0.5, '', 'They lose interest by moonrise.', 'h-3', 'They test the mule, and you, before they go.'),
    ],
  },
  {
    id: 'bandits', title: 'Bandits on the Bridge', art: '🦹🌉', sky: 'dusk', at: [4, 8], where: ['river', 'wild'], must: true,
    text: `Three masked men and a very nervous fourth block the bridge. “Toll,” says the nervous one.`,
    choices: [
      ch('Pay them', 'c-3', 'The nervous one says thank you, and means it.', { set: 'paid' }),
      ch('Hob stands up', 't+1', 'Hob stands up. The bandits sit down.', { need: 'hob' }),
      ch('Corrie knows a ford', 'f-1', 'Half a mile upstream, ankle deep, and the bandits never see you go.', { need: 'corrie' }),
      gam('Fight your way across', 0.5, 'c+2 t+1', 'They run, and drop a purse as they go.', 'h-3 t-1', 'You win, in a way that hurts.'),
    ],
  },
  {
    id: 'weather', title: 'The Weatherwise Shepherd', art: '👴🌨️', sky: 'dusk', at: [5, 7], where: ['wild', 'town', 'shrine', 'river', 'inn'],
    text: `An old shepherd squints up at the Teeth. “Blizzard up there inside the week. Keep bread and oil by, or the legs to push through it.”`,
    choices: [
      ch('Buy his spare oil', 'c-2 o+2', 'A stoppered jug that smells of sheep.'),
      ch('Ask where to shelter', 't+1', 'He marks the huts on your map with a burnt stick.'),
      ch('Share a crust with him', 'f-1 h+1', 'He tells you about the winter of ’09. Twice.'),
    ],
  },
  {
    id: 'hermit', title: 'The Hermit’s Riddle', art: '🧙❓', sky: 'dusk', at: U, where: ['shrine', 'wild'],
    text: `A hermit offers a blessing for his riddle: “The more of me you take, the more you leave behind.” He looks hard at your muddy boots.`,
    choices: [
      riddle('“Footsteps.”', true, 'h+2 t+1', 'He beams, and blesses every boot in turn.', 't-1', ''),
      riddle('“Bread.”', false, 'h+2 t+1', '', 't-1', 'He laughs until he coughs. The band giggles all afternoon.'),
      ch('Give him bread for the blessing', 'f-1 h+2', 'He blesses the bread, too, before he eats it.'),
      ch('Fen asks him for a song instead', 't+2', 'The hermit has a lovely voice. Who knew.', { need: 'fen' }),
    ],
  },
  {
    id: 'goatherds', title: 'The High Meadow', art: '🐐🧀', sky: 'day', at: [4, 9], where: ['wild', 'heights', 'shrine'],
    text: `Goatherds on the high meadow, with more cheese than anyone could eat.`,
    choices: [
      ch('Buy cheese', 'c-1 f+2', 'Hard as a boot. Lasts forever.'),
      ch('Help them mend a wall', 'h-1 f+3', 'Stone after stone, and supper after.'),
      ch('Wren talks goat', 'f+2 t+1', 'Wren knows their cousins. Cheese for everyone.', { need: 'wren' }),
    ],
  },
  {
    id: 'fog', title: 'Fog in the Valley', art: '🌫️🫏', sky: 'fog', at: [4, 9], where: ['wild', 'river', 'town', 'shrine'], must: true,
    text: `Fog pours down the valley, thick as wool. You can’t see the mule’s ears.`,
    choices: [
      ch('Light every lamp', 'o-2', 'A string of little suns, walking slowly.'),
      ch('Wait it out', 'f-2', 'A long, damp, hungry day.'),
      gam('Rope together and feel the way', 0.7, '', 'Out the other side by noon.', 'h-2', 'Into a ditch, together.'),
      ch('Corrie reads the stones', 't+1', 'She walks as if it were midday.', { need: 'corrie' }),
    ],
  },
  {
    id: 'pies', title: 'The Mill Wheel Feast', art: '🥧⚙️', sky: 'day', at: U, where: ['town'],
    text: `The mill town is celebrating its new wheel with pies the size of cartwheels.`,
    choices: [
      ch('Buy pies for everyone', 'c-2 f+3 t+1', 'Gravy to the elbows.'),
      ch('Help serve', 'h-1 f+2 c+1', 'You carry pies all evening and eat the broken ones.'),
      ch('Pell sells them your salt', 'c+4', 'Pell sells them salt they already had. They thank him.', { need: 'pell' }),
    ],
  },
  {
    id: 'bellmonks', title: 'The Bell Monks', art: '🔔🧎', sky: 'night', at: [4, 9], where: ['shrine'],
    text: `Monks who ring the hours by hand offer a bed, if you’ll take a turn on the rope.`,
    choices: [
      ch('Ring through the night', 'h-1 t+2', 'Your arms ache. The band sleeps like babies.'),
      ch('Leave a gift for a bed', 'c-2 h+2', 'Clean sheets, and silence between the bells.'),
      ch('Share their bread and soup', 'f+2', 'Plain and good, eaten without a word.'),
    ],
  },
  {
    id: 'lamplighter', title: 'The Old Lamplighter', art: '👴🏮', sky: 'dusk', at: [3, 7], where: ['wild', 'river', 'town'],
    text: `An old lamplighter stands at the last post before the woods, with an empty can and nothing to fill it.`,
    choices: [
      ch('Share your oil', 'o-2 t+1', 'He bows like a courtier and sets off up the valley.', { set: 'lamps' }),
      ch('Bram mends his leaking can', 't+1', 'Bram finds the hole and solders it shut. The old man is delighted.', { need: 'bram', set: 'lamps' }),
      ch('Wish him luck', '', 'He waves you on into the dusk.'),
    ],
  },
  {
    id: 'pilgrim', title: 'The Coughing Pilgrim', art: '🧎‍♂️🤧', sky: 'dusk', at: [2, 7], where: ['road', 'shrine', 'wild'],
    text: `A pilgrim coughs by the wayside, too proud to ask for anything.`,
    choices: [
      ch('Give him your warmest blanket', 'h-1 t+1', 'He wraps himself up and finally stops shaking.', { set: 'pilgrim' }),
      ch('Tamsin doses him', 't+1', 'Something brown from a tiny bottle. He pulls a face, then sleeps.', { need: 'tamsin', set: 'pilgrim' }),
      ch('Leave bread by him', 'f-1', 'He nods. It’s all he has the breath for.', { set: 'pilgrim' }),
    ],
  },
  {
    id: 'landslip', title: 'The Landslip', art: '🪨⛰️', sky: 'storm', at: [4, 8], where: ['wild', 'river'], must: true,
    text: `The road ahead slid into the valley overnight.`,
    choices: [
      gam('Scramble across', 0.7, '', 'Loose stones, steady feet, no harm done.', 'h-2', 'Everyone slides, a little, at once.'),
      ch('Go the long way round', 'f-2 o-1', 'Two days in one, by lamplight at the end.'),
      ch('Wren finds a path above', '', 'A sheep track nobody else would have seen.', { need: 'wren' }),
    ],
  },
  {
    id: 'bothy', title: 'An Empty Bothy', art: '🛖🪵', sky: 'night', at: [4, 10], where: ['wild', 'heights', 'hut'],
    text: `An empty hut, a full woodpile and a note: TAKE WHAT YOU NEED. LEAVE WHAT YOU CAN.`,
    choices: [
      ch('Rest, and leave a coin', 'c-1 h+2 t+1', 'You leave the woodpile higher than you found it, too.'),
      ch('Rest, and leave nothing', 'h+2 t-1', 'Nobody looks at the note on the way out.'),
      ch('Take firewood for the lamps', 'o+1', 'Pine knots burn nearly as bright as oil.'),
    ],
  },
  {
    id: 'cart', title: 'The Abandoned Cart', art: '🛒📦', sky: 'dusk', at: [3, 8], where: ['road', 'wild'],
    text: `A cart lies on its side, its owners long gone. The crates are still nailed shut.`,
    choices: [
      gam('Prise them open', 0.6, 'f+2 o+2', 'Tinned peas and lamp oil. Christmas came early.', 'h-1', 'Roof slates, and a nail through the thumb.'),
      ch('Bram salvages the axle', 'c+3', 'A good iron axle fetches a good price.', { need: 'bram' }),
      ch('Leave it for its owners', 't+1', 'The band nods. That felt right.'),
    ],
  },
  {
    id: 'lodge', title: 'The Hunting Lodge', art: '🦌🏠', sky: 'night', at: U, where: ['inn'],
    text: `The lodge is warm, loud and expensive. A stag’s head watches the stew pot.`,
    choices: [
      ch('Rooms for everyone', 'c-4 h+3 t+1', 'Feather beds. Real ones.'),
      ch('The floor by the fire', 'c-1 h+1', 'Toasty on one side.'),
      ch('Wash the pots for supper', 'h-1 f+3', 'You never want to see a pot again. You’re very full.'),
    ],
  },
  {
    id: 'quarrel', title: 'A Quarrel by the Fire', art: '😠🔥', sky: 'night', at: [3, 10], must: true,
    text: `Tired feet, short tempers. Two of your carriers are shouting about whose turn it is to carry the sack.`,
    choices: [
      ch('Carry it yourself', 'h-2', 'Nobody argues with that.'),
      ch('Buy a round to cool things', 'c-2 t+1', 'Hard to stay angry with a full mug.'),
      ch('Take a side', 't-2', 'One of them stops talking to you for a week.'),
      ch('Fen plays them both silly', 't+1', 'They end up singing the same song, badly.', { need: 'fen' }),
    ],
  },
  {
    id: 'shepherdgirl', title: 'The Shepherd’s Sling', art: '🐑🪨', sky: 'day', at: U, where: ['wild', 'shrine'],
    text: `A shepherd girl has lost three ewes on the screes above. She offers a coin apiece for their return.`,
    choices: [
      gam('Go and look', 0.6, 'h-1 c+3 t+1', 'All three, cross but well.', 'h-2', 'Two hours of scree and not a single sheep.', { boost: ['wren', 0.3] }),
      ch('Ysolde tracks them', 'c+3', 'She finds them in twenty minutes, eating somebody’s washing.', { need: 'ysolde' }),
      ch('Share a meal with her instead', 'f-1 t+1', 'She tells you which springs are good to drink.'),
    ],
  },
  {
    id: 'deer', title: 'The White Stag', art: '🦌✨', sky: 'dawn', at: [4, 9], where: ['wild'],
    text: `A white stag steps out of the mist, looks at each of you in turn, and waits.`,
    choices: [
      ch('Bow to it', 't+1', 'It bows back. Nobody can quite explain it afterwards.'),
      gam('Follow it', 0.5, 'f+2 o+2', 'It leads you to a forester’s store, unlocked.', 'f-2', 'It leads you, beautifully, nowhere.'),
      ch('Let Ysolde hunt it', 'f+4 t-2', 'Meat for a week. Nobody meets her eye.', { need: 'ysolde' }),
    ],
  },
  {
    id: 'dice', title: 'Dice at the Inn', art: '🎲🍺', sky: 'night', at: [0, 7], where: ['inn'],
    text: `A table of drovers is playing at dice, and they want a fourth.`,
    choices: [
      gam('Play a hand', 0.45, 'c+4', 'Sixes, sixes, and a table of very quiet drovers.', 'c-3', 'They are much better at dice than you.'),
      ch('Pell plays for you', 'c+3', 'Pell loses the first two on purpose. Then he doesn’t.', { need: 'pell' }),
      ch('Just watch', '', 'You learn three new songs and one new word.'),
    ],
  },

  // ------------------------------------------------------------ the pass
  {
    id: 'blizzard', title: 'Blizzard', art: '🌨️💨', sky: 'snow', at: P, where: ['heights', 'hut', 'shrine'], must: true,
    text: `The sky goes white from top to bottom, and the wind begins to sing.`,
    choices: [
      ch('Dig in and wait', 'f-1 o-1', 'A day in a snow hole, playing guessing games.'),
      ch('Push through', 'h-2', 'You get there. You can’t feel your face.'),
      ch('Bram’s little stove', 'o-1', 'It roars all night on a cupful of oil.', { need: 'bram' }),
      ch('Corrie finds the cairns', 'h-1', 'Cairn to cairn through the white, never once lost.', { need: 'corrie' }),
    ],
  },
  {
    id: 'avalanche', title: 'Avalanche', art: '🏔️💥', sky: 'snow', at: P, where: ['heights'], must: true,
    text: `A crack like a gunshot, high above. The whole slope sighs.`,
    choices: [
      gam('Run for the rocks', 0.65, '', 'Snow thunders past behind you. Everyone made it.', 'h-3', 'It catches the back of the line. You dig them out.', { boost: ['corrie', 0.25] }),
      ch('Drop the heavy packs and run', 'f-2 o-1', 'Lighter, and hungrier.'),
      ch('Wren knows the safe ledge', 'h-1', 'A goat’s ledge. Cold, narrow and safe.', { need: 'wren' }),
    ],
  },
  {
    id: 'icebridge', title: 'The Ice Bridge', art: '🧊🌉', sky: 'snow', at: P, where: ['heights'],
    text: `A frozen waterfall makes a bridge over the gorge. It creaks, conversationally.`,
    choices: [
      gam('Cross it', 0.75, 'f+2 o+1', 'A day saved, and the food and oil it would have cost.', 'h-3', 'It holds, mostly. Mostly is not enough.', { boost: ['wren', 0.2] }),
      ch('Take the long way down and round', 'f-1', 'Safe and dull.'),
      ch('Rest at the edge and admire it', 'h+1', 'Blue and white and very quiet.'),
    ],
  },
  {
    id: 'cairn', title: 'The Cairn of Names', art: '🪨📜', sky: 'dusk', at: P, where: ['shrine', 'heights'],
    text: `Every traveller who crossed the pass added a stone with their name scratched on it. There are thousands.`,
    choices: [
      ch('Add a stone for each of you', 't+1', 'The band takes a long time choosing stones.'),
      ch('Leave a lamp burning there', 'o-1 h+2', 'You sleep warm, somehow, under its light.'),
      ch('Rest against the cairn', 'h+1', 'All those names, keeping the wind off.'),
    ],
  },
  {
    id: 'frozen', title: 'The Man in the Snow', art: '🥶❄️', sky: 'snow', at: P, where: ['heights', 'hut'],
    text: `A man is curled in the snow beside the path, still breathing, just.`,
    choices: [
      ch('Warm him with lamp and oil', 'o-2 t+1', 'He wakes by the lamp, asking for his brothers.', { set: 'rescued' }),
      ch('Carry him to shelter', 'h-2 t+1', 'Heavy as a sack of wet sand, and twice as cold.', { set: 'rescued' }),
      ch('Tamsin works on him', 't+1', 'Rubbing, tea, a slap. He sits up swearing.', { need: 'tamsin', set: 'rescued' }),
      ch('You can’t save everyone', 't-2', 'Nobody speaks for the rest of the day.'),
    ],
  },
  {
    id: 'hut', title: 'The Mountain Hut', art: '🛖🔥', sky: 'night', at: P, where: ['hut'], repeat: true,
    text: `Stone walls, a stove, and a logbook signed by a hundred tired hands.`,
    alts: [{ text: `A hut half buried in the snow, its stove still warm from the last travellers.` }, { title: 'The Refuge', text: `A refuge hut with bunks for six and a stove for one, if everyone squeezes.` }],
    choices: [
      ch('Burn oil for warmth', 'o-1 h+2', 'The stove glows red. Everyone sleeps.'),
      ch('Cook a proper meal', 'f-2 h+1 t+1', 'Stew, and a story for each spoonful.'),
      ch('Sign the book and sleep', 'h+1', 'You add your name under a hundred others.'),
      ch('Hob splits a week of wood', 'h+2', 'The stove roars all night without a drop of oil.', { need: 'hob' }),
    ],
  },
  {
    id: 'fort', title: 'The Empty Fort', art: '🏰❄️', sky: 'dusk', at: P, where: ['heights', 'hut'],
    text: `A border fort with nobody guarding it, and a storeroom nobody has guarded either.`,
    choices: [
      gam('Search the storeroom', 0.6, 'f+3 o+2', 'Hard biscuit and a barrel of lamp oil. Soldiers’ rations.', 'h-1', 'A rat the size of a cat, with views.'),
      ch('Shelter in the gatehouse', 'o-1 h+2', 'A fire in the old hearth, and thick walls all round.'),
      ch('Light a beacon on the wall', 'o-2 t+2', 'Far below, a light answers. Someone knows you’re coming.'),
    ],
  },
  {
    id: 'hares', title: 'Snow Hares', art: '🐇❄️', sky: 'snow', at: P, where: ['heights', 'hut'],
    text: `White hares everywhere, bold as sparrows.`,
    choices: [
      ch('Set snares overnight', 'o-1 f+3', 'You keep the lamps lit to watch them, and are rewarded.'),
      ch('Ysolde hunts', 'f+4', 'Four hares, four arrows.', { need: 'ysolde' }),
      ch('Watch them play', 't+1', 'They box, and tumble, and the whole band laughs.'),
    ],
  },
  {
    id: 'eagle', title: 'The Eagle', art: '🦅✉️', sky: 'day', at: P, where: ['heights'], must: true,
    text: `An eagle has taken a fancy to the post sack, and will not take no for an answer.`,
    choices: [
      ch('Wave a torch at it', 'o-1', 'It wheels off, offended.'),
      ch('Throw it your cheese', 'f-1', 'It takes the cheese, the eagle way.'),
      gam('Grab the sack back', 0.6, 't+1', 'You win the tug-of-war, feathers everywhere.', 'h-2', 'You win, eventually, with scratches.'),
    ],
  },
  {
    id: 'stars', title: 'A Sky Full of Stars', art: '🌌⭐', sky: 'night', at: P, where: ['heights', 'hut', 'shrine'],
    text: `The sky is so full of stars that the band forgets how cold it is.`,
    choices: [
      ch('Stay up and name them', 'h-1 t+2', 'Somebody names one after the mule.'),
      ch('Sleep', 'h+1', 'A deep, cold, starry sleep.'),
      ch('Fen plays', 't+3', 'Nobody has ever heard anything so lovely, or so quiet.', { need: 'fen' }),
    ],
  },
  {
    id: 'icecave', title: 'The Blue Cave', art: '🧊🏮', sky: 'snow', at: P, where: ['heights'],
    text: `A cave glows blue in the glacier. Old lamps hang inside, still half full.`,
    choices: [
      gam('Go in with a lamp', 0.7, 'o+4', 'Lamp after lamp, all still good.', 'o-1 h-2', 'The ice shifts. You run.'),
      ch('Bram drains the old lamps', 'o+3', 'Bram works by touch, fast and careful.', { need: 'bram' }),
      ch('Shelter at the mouth', 'h+1', 'Out of the wind, blue light all night.'),
    ],
  },
  {
    id: 'yaks', title: 'The Yak Train', art: '🐂🫖', sky: 'day', at: P, where: ['heights', 'hut'],
    text: `A yak train is coming down from Hollin. Its drivers haven’t seen a stranger in weeks.`,
    choices: [
      ch('Buy butter tea and barley', 'c-2 h+2 f+1', 'Salty, buttery, warming, strange.'),
      ch('Pell trades with them', 'f+1 o+2', 'Somehow you come out ahead and they’re thrilled.', { need: 'pell' }),
      ch('Ask about the road ahead', 't+1', '“Open, for now.” It’s enough.'),
    ],
  },
  {
    id: 'switchback', title: 'The Last Switchback', art: '🏘️🌄', sky: 'dawn', at: [10, 10],
    text: `Below you, under its smoke, lie the roofs of Hollin. Just one long slope left.`,
    choices: [
      gam('Race down', 0.7, 't+2', 'Whooping all the way, the mule in front.', 'h-2', 'Several falls. Snowy, undignified falls.'),
      ch('Walk down singing', 't+1', 'They hear you before they see you.'),
      ch('Eat the last of the good food', 'f-1 h+1', 'A picnic in the snow, looking at where you’re going.'),
    ],
  },
  {
    id: 'crevasse', title: 'The Crevasse', art: '🕳️🪢', sky: 'snow', at: P, where: ['heights'], must: true,
    text: `The snow gives way under the mule’s front feet. Below is blue, and then black.`,
    choices: [
      ch('Haul the mule back', 'h-2', 'Everyone on the rope. The mule is unimpressed.'),
      ch('Cut the packs free to save it', 'f-2 o-1', 'The mule lives. Your supper doesn’t.'),
      ch('Hob holds the rope alone', 't+1', 'Hob just holds on. That’s all. The mule is fine.', { need: 'hob' }),
    ],
  },
  {
    id: 'snowcamp', title: 'A Cold Camp', art: '⛺❄️', sky: 'night', at: P, where: ['heights', 'shrine'], repeat: true,
    text: `No hut tonight, only a hollow out of the wind.`,
    alts: [{ text: `The light goes early. You camp where you stand, under a lip of snow.` }],
    choices: [
      ch('A big fire', 'o-2 h+1 t+1', 'Faces glowing, feet nearly warm.'),
      ch('Huddle together', 'h-1 t+1', 'Elbows everywhere, and somebody snores.'),
      ch('Eat well to keep warm', 'f-2 h+1', 'Fat and porridge, the mountain way.'),
    ],
  },
  {
    id: 'monastery', title: 'The Snow Monastery', art: '⛪🕯️', sky: 'dusk', at: P, where: ['shrine', 'hut'],
    text: `Monks live up here all winter. They offer soup, and ask only for news of the world.`,
    choices: [
      ch('Trade news for soup', 'f+2 t+1', 'They like the bits about the dance best.'),
      ch('Buy candles', 'c-2 o+3', 'Beeswax, a whole bundle.'),
      ch('Sleep in their warm hall', 'h+1', 'Chanting through the wall, all night.'),
    ],
  },

  // ------------------------------------------------------------ any stop
  {
    id: 'inn', title: 'A Warm Inn', art: '🍲🛏️', sky: 'night', at: [0, 10], where: ['inn'], repeat: true,
    text: `A fire, a stew pot, and a landlord who wants to know where you’re all going.`,
    alts: [{ text: `Low beams, warm ale and a cat on every chair.` }, { title: 'A Busy Inn', text: `Every table taken, but the landlady finds you a corner and a pot.` }],
    choices: [
      ch('Rooms and stew', 'c-3 h+2 f+1', 'Real beds. Somebody cries a little.'),
      ch('Stew to go', 'c-1 f+2', 'In a pot you promise to bring back. You won’t.'),
      ch('Sleep in the stable', 'h+1', 'Warm straw and a curious horse.'),
      ch('Fen plays for your supper', 'f+2', 'The landlord pays in stew, and seconds.', { need: 'fen' }),
    ],
  },
  {
    id: 'quietroad', title: 'A Quiet Day', art: '🛤️☀️', sky: 'day', at: [0, 10], where: ['road', 'wild', 'river'], repeat: true,
    text: `Nothing happens for a whole day. It’s wonderful.`,
    alts: [{ text: `Blue sky, dry road, and nobody asking you for anything.` }, { title: 'An Easy Mile', text: `The path runs flat and kind for once.` }],
    choices: [
      ch('Forage as you walk', 'f+2 h-1', 'Blackberries, nettles, and scratched hands.'),
      ch('Rest your feet', 'h+1', 'A long lunch in the sun.'),
      ch('Tell stories as you walk', 't+1', 'Everybody has a worse one than the last.'),
      ch('Wren climbs for eggs', 'f+2', 'She comes down with a hatful and only one broken.', { need: 'wren' }),
    ],
  },
  {
    id: 'shrine', title: 'A Wayside Shrine', art: '🕯️🌼', sky: 'dusk', at: [0, 10], where: ['shrine', 'road'], repeat: true,
    text: `A little shrine with a stub of candle and a bowl of offerings.`,
    alts: [{ text: `A stone saint with a moss beard, and a bowl for whatever you can spare.` }],
    choices: [
      ch('Leave a coin', 'c-1 t+1', 'A small thing. The band notices.', { set: 'offering' }),
      ch('Leave bread', 'f-1 h+1', 'You feel steadier for it, somehow.', { set: 'offering' }),
      ch('Take the candle stub', 'o+1 t-1', 'It’s just a candle. Isn’t it?'),
    ],
  },
  {
    id: 'mulelame', title: 'The Mule Goes Lame', art: '🫏🩹', sky: 'day', at: [2, 10], must: true,
    text: `The mule stops, lifts a hoof, and gives you a look that says it is all your fault.`,
    choices: [
      ch('Carry its load between you', 'h-2', 'Everyone’s shoulders, for a day.'),
      ch('Rest it a day', 'f-2', 'A day of grazing for the mule, and of eating for you.'),
      ch('Tamsin poultices the hoof', '', 'The mule bites her. Then it walks fine.', { need: 'tamsin' }),
      ch('Bram cuts it a new shoe', 'o-1', 'Hammered out over a lamp flame.', { need: 'bram' }),
    ],
  },
  {
    id: 'letters', title: 'Letters Home', art: '✉️🕯️', sky: 'night', at: [2, 10],
    text: `By lamplight, the band asks if they might add letters of their own to the post.`,
    choices: [
      ch('Of course', 'o-1 t+2', 'Lamps lit late, and pens scratching.'),
      ch('For a small fee', 'c+2 t-1', 'They pay. They grumble.'),
      ch('Early night, lamps out', 'h+1', 'Sleep wins.'),
    ],
  },
  {
    id: 'thief', title: 'A Hand in the Pack', art: '🫳🎒', sky: 'night', at: [1, 9], where: ['inn', 'town', 'hut'], must: true,
    text: `In the night, someone is going through the packs by feel.`,
    choices: [
      gam('Grab them', 0.5, 'c+2', 'A boy, with your coin and somebody else’s. You keep the lot.', 'h-1 c-2', 'An elbow in the dark, and a lighter purse.', { boost: ['ysolde', 0.3] }),
      ch('Shout and let them run', 'f-1', 'They run with a loaf. Fair enough.'),
      ch('Pretend to sleep', 'c-2', 'You hear them go. You were too tired to care.'),
    ],
  },
  {
    id: 'birthday', title: 'A Birthday on the Road', art: '🎂🎈', sky: 'dusk', at: [1, 10],
    text: `One of the carriers mentions, very quietly, that it is her birthday.`,
    choices: [
      ch('A feast', 'f-2 t+2', 'Two days’ rations in one night. Worth it.'),
      ch('A song and an extra blanket', 'h-1 t+1', 'She sleeps warm. You don’t.'),
      ch('Quietly forget', 't-1', 'She notices.'),
    ],
  },

  {
    id: 'camp', title: 'Camp by the Road', art: '🏕️🫏', sky: 'night', at: [0, 7], where: ['road', 'wild', 'river', 'shrine'], repeat: true,
    text: `You make camp where the day ends: a fire, a pot, and the mule grumbling at the stars.`,
    alts: [{ text: `A sheltered bank and a ring of old fire-stones. It will do.` }],
    choices: [
      ch('Cook something hot', 'f-1 h+1 t+1', 'Onion soup, and everyone a little kinder.'),
      ch('Mend the packs by lamplight', 'o-1 c+1', 'You sell the spare straps at the next stop.'),
      ch('Turn in early', 'h+1', 'Sleep comes before the fire’s out.'),
      ch('Ysolde sets snares', 'f+2', 'Two rabbits by morning. She looks almost pleased.', { need: 'ysolde' }),
    ],
  },
  {
    id: 'posthorn', title: 'The Post Horn', art: '📯✉️', sky: 'day', at: [1, 10],
    text: `A rider coming the other way blows a post horn and waves a bundle: letters for your band, from home.`,
    choices: [
      ch('Stop and read them all', 'f-1 t+2', 'An hour of laughing and sniffing by the road.'),
      ch('Swap him oil for his bread', 'o-1 f+2', 'He’s riding by day. You’re walking by night.'),
      ch('Read them on the walk', 't+1', 'Somebody walks into a tree.'),
    ],
  },
  {
    id: 'blisters', title: 'Blisters', art: '🦶🩹', sky: 'day', at: [1, 10], must: true,
    text: `A week of road, and everyone’s feet are in ribbons.`,
    choices: [
      ch('Rest a day', 'f-2 h+1', 'Feet up, pots on.'),
      ch('Bind them and walk on', 'h-1', 'Every step a small opinion.'),
      ch('Tamsin’s salve', '', 'It smells of goose fat. The walking stops hurting.', { need: 'tamsin' }),
    ],
  },
  {
    id: 'hedgehogs', title: 'Night Visitors', art: '🦔🎒', sky: 'night', at: [0, 9],
    text: `A family of hedgehogs has moved into the food sack, and they are not leaving quietly.`,
    choices: [
      ch('Pick them out one by one', 'h-1', 'Prickles in every finger.'),
      ch('Let them finish, then go', 'f-2 t+1', 'The band names every one of them.'),
      ch('Tempt them out with a lamp', 'o-1', 'They follow the light like little pilgrims.'),
    ],
  },

  // ------------------------------------------------------------ callbacks
  {
    id: 'peddler2', title: 'The Peddler Again', art: '🛒😄', sky: 'day', at: [2, 10], when: { flag: 'peddler' }, cb: true,
    text: `The peddler you pulled out of the mud has a stall at the crossroads, and a long memory.`,
    choices: [
      ch('Take his gift of oil', 'o+3', '“Never forget a shove,” he says.'),
      ch('Take his gift of food', 'f+3', 'Raisins, and a ham, and a little pot of jam.'),
    ],
  },
  {
    id: 'mother', title: 'Davy’s Mother', art: '👩‍🍳👦', sky: 'day', at: [2, 9], when: { flag: 'boy' }, cb: true,
    text: `A woman runs out of a kitchen with flour to her elbows. “You brought my Davy home!” She is visiting her sister, of all places, right here.`,
    choices: [
      ch('Accept a basket of food', 'f+3 h+1', 'She won’t take no for an answer.'),
      ch('Accept her brother’s spare lamp oil', 'o+3', 'Three full flasks and a hug each.'),
    ],
  },
  {
    id: 'lenderman', title: 'The Lender’s Man', art: '🧐📕', sky: 'dusk', at: [2, 10], when: { flag: 'debt', gap: 3 }, cb: true, must: true,
    text: `A man in a good coat steps out of the crowd. “The loan, and the interest. Eight coins.”`,
    choices: [
      ch('Pay him', 'c-8', 'He counts it twice, then leaves.', { clear: 'debt' }),
      ch('Pell talks him down', 'c-4', 'Somehow Pell leaves owing nothing, and having sold him a hat.', { need: 'pell', clear: 'debt' }),
      ch('You can’t pay', 'h-1 t-2', 'He takes your best blanket and your band’s good mood.', { clear: 'debt' }),
    ],
  },
  {
    id: 'bandit2', title: 'The Bandit’s Turn', art: '🦹🔥', sky: 'night', at: [5, 10], where: ['hut', 'heights', 'inn', 'shrine'], when: { flag: 'paid' }, cb: true,
    text: `The nervous bandit from the bridge is warming his hands at the fire. “You paid fair,” he says. “I’ll pay fair.”`,
    choices: [
      ch('Take his coin', 'c+4', 'Your own coins, and one over.'),
      ch('Take his oil', 'o+3', 'He’s given up banditry. He sells lamps now.'),
    ],
  },
  {
    id: 'pilgrim2', title: 'The Pilgrim’s Blessing', art: '🙏🧺', sky: 'dawn', at: [4, 10], when: { flag: 'pilgrim' }, cb: true,
    text: `The pilgrim is waiting by the path, his cough long gone, with a blessing and a basket.`,
    choices: [
      ch('Accept the basket', 'f+3', 'Bread, cheese, and a jar of something fiery.'),
      ch('Accept the blessing', 'h+2 t+1', 'You all stand a little straighter.'),
    ],
  },
  {
    id: 'lamps2', title: 'Lamps on the Pass', art: '🏮🏮', sky: 'night', at: P, when: { flag: 'lamps' }, cb: true,
    text: `Every post up the switchbacks is lit. At the top, a familiar old man raises his can.`,
    choices: [
      ch('Walk by his light', 'o+3', 'Not a drop of your own oil burned.'),
      ch('Share supper with him', 'f-1 o+2 t+2', 'He tells stories of fifty winters on the pass.'),
    ],
  },
  {
    id: 'shortcut', title: 'The Map’s Shortcut', art: '🗺️⛰️', sky: 'day', at: [5, 10], where: ['heights', 'wild', 'hut', 'shrine'], when: { flag: 'map' }, cb: true,
    text: `The map from the tavern bill shows a herders’ path that cuts a whole day off.`,
    choices: [
      ch('Take it', 'f+2 o+2', 'A day saved, and everything a day costs.'),
      gam('Take it at a run', 0.6, 'f+2 o+2 t+2', 'Two days saved. The band cheers.', 'h-2', 'Running on scree. Never again.'),
    ],
  },
  {
    id: 'dog2', title: 'The Dog Knows', art: '🐕❄️', sky: 'snow', at: [4, 10], when: { flag: 'dog' }, cb: true,
    text: `The dog stops, sniffs and starts digging. Under the snow: somebody’s forgotten cache.`,
    choices: [
      ch('Share it out', 'f+2 o+2', 'Oatcakes and a flask of oil, frozen hard.'),
      ch('Give the dog the best bit', 'f+1 t+2', 'The band agrees it’s only fair.'),
    ],
  },
  {
    id: 'clearmorning', title: 'A Clear Morning', art: '🌅🕊️', sky: 'dawn', at: [5, 10], when: { flag: 'offering', gap: 3 }, cb: true,
    text: `Whoever you left that offering for has been listening. The morning dawns clear and windless.`,
    choices: [
      ch('Make the most of it', 'f+2 o+1', 'Two days’ road in one, and the supplies to show for it.'),
      ch('Rest in the sun', 'h+2', 'The first warm hour in a week.'),
    ],
  },
  {
    id: 'ringthief', title: 'The Ring Thief', art: '🫳💍', sky: 'dusk', at: [3, 9], where: ['town', 'inn', 'hut'], when: { promise: 'ring' }, cb: true, must: true,
    text: `In the crowd, a hand slips into the post sack, and out again holding a ring.`,
    choices: [
      gam('After him!', 0.6, 't+1', 'Over a wall and through a hen house. You get it back.', 'h-1 t-1', 'Gone. And with him, Tomas’s yes.', { boost: ['ysolde', 0.25], breaks: 'ring' }),
      ch('Offer to buy it back', 'c-3', 'He sells it back, quite unembarrassed.'),
      ch('Let it go', 't-2', 'You’ll have to tell Tomas something.', { breaks: 'ring' }),
    ],
  },
  {
    id: 'fever', title: 'Fever in the Band', art: '🤒💊', sky: 'night', at: [5, 10], when: { promise: 'medicine', gap: 3 }, cb: true, must: true,
    text: `Two of the band wake shivering, and you are carrying a parcel of fever medicine.`,
    choices: [
      ch('Open the parcel', 'h+2', 'They’re well by morning. The parcel is lighter.', { breaks: 'medicine' }),
      ch('Keep it sealed and nurse them', 'h-2 t+1', 'A long night, but the parcel stays shut.'),
      ch('Tamsin brews her own', 'h+1', 'Willow and ginger. Slower, but it works.', { need: 'tamsin' }),
    ],
  },
  {
    id: 'bellrings', title: 'The Bell in the Night', art: '🔔🌨️', sky: 'snow', at: [6, 10], when: { promise: 'bell' }, cb: true,
    text: `On a still night the bell rolls in its straps and rings out over the snow. Somewhere above, a hut’s lamp answers.`,
    choices: [
      ch('Follow the light', 'o+2 h+1', 'Herders, a stove and a pot of tea.'),
      ch('Ring it again, properly', 't+2', 'The band takes turns until their arms ache.'),
    ],
  },
  {
    id: 'rescued2', title: 'The Brothers', art: '👨‍👨‍👦🛷', sky: 'day', at: [9, 10], when: { flag: 'rescued', gap: 1 }, cb: true,
    text: `The man you saved in the snow comes back up the path with his three brothers and a sledge.`,
    choices: [
      ch('Ride the sledge', 'h+2 o+1', 'Down a whole valley, screaming happily.'),
      ch('Share their supper', 'f+3 t+1', 'They insist. Then they insist again.'),
    ],
  },

  // ------------------------------------------------------------ companions' own stories
  {
    id: 'wren2', title: 'Wren’s Goat Path', art: '🧗🐐', sky: 'day', at: [4, 10], where: ['heights', 'wild', 'shrine', 'hut'], when: { comp: 'wren' }, cb: true,
    text: `Wren points at a crack in the cliff. “Goats go up there. So can we, if nobody looks down.”`,
    choices: [
      ch('Follow Wren', 'h-1 f+2 o+2', 'Nobody looks down. A day saved.'),
      ch('Ask her to scout ahead instead', 't+1', 'She comes back with three warnings and a bird’s egg.'),
    ],
  },
  {
    id: 'tamsin2', title: 'Tamsin’s Tonic', art: '👵🧪', sky: 'night', at: [2, 10], when: { comp: 'tamsin' }, cb: true,
    text: `Tamsin has brewed something that smells like a wet dog. She swears it’s good for the cold.`,
    choices: [
      ch('Everyone takes a drop', 'h+2 t+1', 'Foul. It works.'),
      ch('Ask her to teach you the recipe', 'h+1 t+2', 'She’s thrilled. It has nineteen steps.'),
    ],
  },
  {
    id: 'pell2', title: 'Pell’s Deal', art: '🧔💰', sky: 'day', at: [2, 10], where: ['town', 'inn', 'hut', 'shrine'], when: { comp: 'pell' }, cb: true,
    text: `Pell has found a buyer for absolutely anything, including things you didn’t know you had.`,
    choices: [
      ch('Sell spare oil', 'o-2 c+5', 'He sells it in pints, with a speech.'),
      ch('Sell spare food', 'f-2 c+5', 'Your oatcakes go for silver.'),
      ch('Have him buy cheap', 'c-3 f+2 o+2', 'Bought for a song, and he sang it.'),
    ],
  },
  {
    id: 'bram2', title: 'Bram’s Clever Lamp', art: '👨‍🔧🫖', sky: 'night', at: [2, 10], when: { comp: 'bram' }, cb: true,
    text: `Bram has turned an old kettle into a lamp that burns half the oil.`,
    choices: [
      ch('Use it', 'o+3', 'It smells of tea and burns all night.'),
      ch('Sell it at the next stall', 'c+4', 'He’ll make another, he says. He’s already started.'),
    ],
  },
  {
    id: 'ysolde2', title: 'A Good Hunt', art: '🏹🦌', sky: 'dawn', at: [2, 10], when: { comp: 'ysolde' }, cb: true,
    text: `Ysolde comes back at dawn with a deer across her shoulders and no explanation.`,
    choices: [
      ch('Feast tonight', 'f+3 t+1', 'Everyone sleeps full for once.'),
      ch('Smoke it for the road', 'o-1 f+4', 'All night over a smoky fire.'),
    ],
  },
  {
    id: 'fen2', title: 'Fen’s Song', art: '🎻📜', sky: 'dusk', at: [2, 10], when: { comp: 'fen' }, cb: true,
    text: `Fen has written a song about the journey. You’re in it. You come off quite well.`,
    choices: [
      ch('Sing it together', 't+2', 'By the third verse even the mule joins in.'),
      ch('Sell it at the next inn', 'c+3', 'Three coins and a standing ovation.'),
    ],
  },
  {
    id: 'corrie2', title: 'Corrie Reads the Sky', art: '🧭⛈️', sky: 'storm', at: [2, 10], when: { comp: 'corrie' }, cb: true,
    text: `Corrie sniffs the wind. “Storm by dark. There’s a cave a mile off the path.”`,
    choices: [
      ch('Take the cave', 'h+2 t+1', 'Dry as a bone while the storm roars past.'),
      ch('Race the storm instead', 'f+1 o+1', 'Over the next rise before it breaks, and a day ahead.'),
    ],
  },
  {
    id: 'hob2', title: 'Hob’s Shoulders', art: '💪🫏', sky: 'day', at: [2, 10], when: { comp: 'hob' }, cb: true,
    text: `Hob picks up the mule’s whole load, then very nearly the mule, and sets off.`,
    choices: [
      ch('Let him', 'h+2', 'Everyone else walks light.'),
      ch('Ask him to talk instead', 't+2', 'He talks for a mile about his mother’s geese. Nobody has seen him so happy.'),
    ],
  },
];

export const CARD: Record<string, Card> = Object.fromEntries(CARDS.map((c) => [c.id, c]));
export const CARD_INDEX: Record<string, number> = Object.fromEntries(CARDS.map((c, i) => [c.id, i]));
/** The companion a card can recruit, if any. */
export const recruitOf = (c: Card): CompId | undefined => c.choices.find((x) => x.join)?.join;
