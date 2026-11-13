// Charms: picked one of three between deals, kept for the rest of the run.

export type CharmId =
  | 'joker'
  | 'pockets'
  | 'rewind'
  | 'spyglass'
  | 'flush'
  | 'mirror'
  | 'blast'
  | 'stakes'
  | 'lantern'
  | 'wind'
  | 'stride'
  | 'flags'
  | 'momentum';

export interface CharmDef {
  id: CharmId;
  name: string;
  icon: string;
  text: string;
  /** Shown in a warmer color: the catch. */
  catch?: string;
}

export const CHARMS: CharmDef[] = [
  { id: 'joker', name: 'Joker', icon: '🃏', text: 'A wild card is shuffled into every draw pile. Anything plays on it.' },
  { id: 'pockets', name: 'Deep Pockets', icon: '🎒', text: '+3 draws on every deal.' },
  { id: 'rewind', name: 'Rewind', icon: '⏪', text: '2 undos on every deal: take back a play, a draw or a blast. Cards you have turned face up stay face up.' },
  { id: 'spyglass', name: 'Spyglass', icon: '🔭', text: 'See the next 3 cards of the draw pile.' },
  { id: 'flush', name: 'Flush', icon: '♣', text: 'A card played on its own suit scores double, and every 3 cards of one suit played in a row give back a draw.' },
  { id: 'mirror', name: 'Mirror', icon: '🪞', text: 'Twice per deal, a card of the same rank also plays (7 on 7).' },
  { id: 'blast', name: 'Blasting Cap', icon: '💥', text: 'Once per deal, clear any one card, even a covered one. Keeps your streak.' },
  { id: 'stakes', name: 'High Stakes', icon: '🎲', text: 'Streak points ×2.', catch: '1 fewer draw every deal.' },
  { id: 'lantern', name: 'Lantern', icon: '🏮', text: 'Face-down cards are shown, so you can plan chains through them, and +1 draw every deal.' },
  { id: 'wind', name: 'Second Wind', icon: '🌬️', text: 'Once per run, when you are out of moves, take 12 fresh draws.' },
  { id: 'stride', name: 'Long Stride', icon: '🦘', text: 'Twice per deal, a card two ranks away also plays (5 on 7).', catch: 'It scores nothing, ends your streak, and discards the top card of the pile unless that card fits an open card.' },
  { id: 'flags', name: 'Peak Flags', icon: '🚩', text: 'Clearing a peak’s top card (marked 🚩) gives back a draw.' },
  { id: 'momentum', name: 'Momentum', icon: '🔥', text: 'Every 5th card of a streak gives back a draw.' },
];

export const charmDef = (id: CharmId): CharmDef => CHARMS.find((c) => c.id === id)!;
