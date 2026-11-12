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
  { day: '2026-11-12', path: './nightline/', game: 'Nightline', text: 'Warnings before sharp curves, the middle of the road at a fork takes the gentle road, and 5 more seconds on the first stage.' },
  { day: '2026-11-12', path: './nightline/', game: 'Nightline', text: 'Calmer steering, a readable HUD, no more doubled letters on nearby cars, “endings” instead of confusing goals, and the end screen says how far you got.' },
  { day: '2026-11-12', path: './delve/', game: 'Delve', text: 'A smaller first floor, a cyan “you” marker that can’t be mistaken for stairs, clearer map colours and legend.' },
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
