// "What's new" on the hub: recent changes, newest first. Add a line when a change
// is worth the owner's attention (a new game, a new mode, a fix they asked for).

export interface News {
  /** YYYY-MM-DD (UTC) the change went live. */
  day: string;
  path: string;
  game: string;
  text: string;
}

export const NEWS: News[] = [
  { day: '2026-11-12', path: './', game: 'Game Lab', text: 'A Continue button at the top takes you straight back to the game you played last.' },
  { day: '2026-11-12', path: './summit/', game: 'Summit', text: 'Fewer draws early, more on high floors; no more back-to-back same ranks, and the 3rd dry draw in a row always fits. Mirror and Long Stride have a few uses per deal and their own colours; Lantern, Second Wind, High Stakes and Flush reworked; peak tops marked for Peak Flags.' },
  { day: '2026-11-12', path: './quarry/', game: 'Quarry', text: 'New game: a word dig. Drag through touching letter hexes to spell words; long ones pay. Reach each depth’s target before your words run out, use fuses before they blow, break rocks, and pick a perk on the way down eight depths. There is a daily dig too.' },
  { day: '2026-11-12', path: './triad/', game: 'Triad', text: 'Fixed: after a hint, tapping the hex and then an element now fills it. Links are clearer pills on the edge, Normal links puzzles lean less on copying along links, and hints skip steps a link just copies.' },
  { day: '2026-11-12', path: './ninefold/', game: 'Ninefold', text: 'The aim line now follows the real roll, slopes and sand included, up to the first bounce.' },
  { day: '2026-11-12', path: './ninefold/', game: 'Ninefold', text: 'Windmills are fair now: single bars that never stop turning, so you can watch and time your putt, with room to slip past at the walls.' },
  { day: '2026-11-12', path: './summit/', game: 'Summit', text: 'New game: a solitaire climb. Eight deals of card peaks: play cards one up or down, chain streaks, and pick one of three charms after every floor (wild Jokers, blasts, undos, a spyglass…). Unused draws carry up the mountain. There is a daily climb too.' },
  { day: '2026-11-12', path: './triad/', game: 'Triad', text: 'New clue type: links. Pick “Numbers + links” with ＋ and some edges carry an “=”: the two hexes it joins hold the same element. Fewer numbers, fewer givens, a different kind of chain.' },
  { day: '2026-11-12', path: './hexhold/', game: 'Hexhold', text: 'A build that walks the path past your towers now circles them in red and needs a second tap. Gentler first waves and wave 10, tougher late waves; stronger Mortar and Tesla. The build sheet shows each tower’s damage, rate and range, and Sell stays in view at level 3.' },
  { day: '2026-11-12', path: './ninefold/', game: 'Ninefold', text: 'Aiming shows a ring where the ball will stop; pull length now matches distance. Softer sand, gentler slopes, kinder corners, bigger holes on screen, and fairer par.' },
  { day: '2026-11-12', path: './lastlight/', game: 'Last Light', text: 'Night 2: fog. The doctor’s girl is missing, the foghorn is “condemned”, and the Merrow is feeling her way in blind. Pick it from the menu.' },
  { day: '2026-11-12', path: './unspoken/', game: 'Unspoken', text: 'Tap 🔊 on a word to hear it spoken (uses your phone’s voice; off when sound is off).' },
  { day: '2026-11-12', path: './ninefold/', game: 'Ninefold', text: 'Sounds, and windmills from hole 4: they turn while the ball rolls, from the same pose every shot, so time your putt through the gaps.' },
  { day: '2026-11-12', path: './ninefold/', game: 'Ninefold', text: 'New game: mini-golf. Nine holes grown from a seed, with rails to bank off, sand, ponds, slopes and bumpers. Pull back and let go. There is a daily course too.' },
  { day: '2026-11-12', path: './delve/', game: 'Delve', text: 'Corners and side openings now have lit edges in the 3D view, so turns are easier to spot.' },
  { day: '2026-11-12', path: './grove/', game: 'Grove', text: 'Trapping wisps now pays (+50, double for two at once); fewer crystals and bolts, so runs are tighter and the Spirit Tree is a real achievement.' },
  { day: '2026-11-12', path: './lantern/', game: 'Lantern', text: 'Tapping far or unexplored ground walks you as close as it can; monsters you’ve met stop interrupting your walk; Wait and the shops say what happened.' },
  { day: '2026-11-12', path: './nightline/', game: 'Nightline', text: 'Warnings before sharp curves, the middle of the road at a fork takes the gentle road, and 5 more seconds on the first stage.' },
  { day: '2026-11-12', path: './nightline/', game: 'Nightline', text: 'Calmer steering, a readable HUD, no more doubled letters on nearby cars, “endings” instead of confusing goals, and the end screen says how far you got.' },
  { day: '2026-11-12', path: './delve/', game: 'Delve', text: 'A smaller first floor, a cyan “you” marker that can’t be mistaken for stairs, clearer map colours and legend.' },
  { day: '2026-11-12', path: './#settings', game: 'Game Lab', text: 'Effects switch: “reduced” turns off screen shake and flashes, softens damage tints and stops blinking text. It starts reduced if your phone asks for less motion.' },
  { day: '2026-11-12', path: './#settings', game: 'Game Lab', text: 'Sound and vibration switches for every game, at the bottom of this page.' },
  { day: '2026-11-12', path: './rewild/', game: 'Rewild', text: 'Fairer goals (ponds, oaks, forest, frogs were rarely reachable; soil and species were too easy), and winter wildflowers look different from grass.' },
  { day: '2026-11-12', path: './', game: 'Game Lab', text: 'This list: what changed since your last visit.' },
  { day: '2026-11-11', path: './hexhold/', game: 'Hexhold', text: 'Frost now gets credit for its slow and the +30% its neighbours deal to chilled enemies.' },
  { day: '2026-11-11', path: './glyph/', game: 'Glyphwright', text: 'Honest dps figures (crowd vs single foe), spell names no longer cut off.' },
  { day: '2026-11-11', path: './triad/', game: 'Triad', text: 'A 60-second guided tutorial, plus Easy / Normal / Hard puzzles (Hard needs a “what if” or two).' },
  { day: '2026-11-11', path: './rewild/', game: 'Rewild', text: 'Settled species: alive 4 seasons in a row, they pay +3 every season. Keep the balance, don’t replant.' },
  { day: '2026-11-11', path: './telegraph/', game: 'Telegraph', text: 'Depths 2-3 have a little more to fight; abandoning asks first; moves that hurt need the red button.' },
  { day: '2026-11-11', path: './lastlight/', game: 'Last Light', text: 'New: a short interactive story. A dark lighthouse, a ship, midnight. Three stars to earn.' },
  { day: '2026-11-11', path: './glyph/', game: 'Glyphwright', text: 'Empower: pay gold to raise a rune a tier. Rerolls get dearer within a wave.' },
  { day: '2026-11-11', path: './triad/', game: 'Triad', text: 'New: a hex logic puzzle. Fire burns leaf, leaf drinks water, water douses fire.' },
  { day: '2026-11-11', path: './hexhold/', game: 'Hexhold', text: 'Burrowers that dig under your maze, and two-portal maps.' },
  { day: '2026-11-11', path: './unspoken/', game: 'Unspoken', text: 'Held things no longer cover people; the river floods instead of turning into a sea wave.' },
  { day: '2026-11-10', path: './hexhold/', game: 'Hexhold', text: 'New: maze tower defense. Your towers are the walls.' },
];
