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
