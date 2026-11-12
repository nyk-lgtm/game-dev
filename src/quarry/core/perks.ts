// Perks: one of three is offered after every cleared depth; each can be taken once.
// "Word multiplier" bonuses add up with gold tiles (gold + Chisel = ×3), they never multiply each other.

export type PerkId = 'long' | 'gold' | 'shift' | 'rare' | 'blast' | 'pick' | 'shake' | 'wild' | 'short' | 'streak' | 'rocks' | 'first' | 'echo';

export interface PerkDef {
  id: PerkId;
  icon: string;
  name: string;
  text: string;
}

export const PERKS: readonly PerkDef[] = [
  { id: 'long', icon: '📏', name: 'Long Haul', text: '+1 length bonus for every letter past four: 5 letters ×4 instead of ×3, 6 letters ×6, 7 letters ×8.' },
  { id: 'shift', icon: '⏳', name: 'Overtime', text: 'One more word on every depth.' },
  { id: 'gold', icon: '🪙', name: 'Gold Rush', text: 'Three more gold tiles on each new face, and gold turns up three times as often.' },
  { id: 'rare', icon: '💎', name: 'Prospector', text: 'Each letter worth 4 or more (marked ◆ on the tiles) adds +1 word multiplier.' },
  { id: 'streak', icon: '🔥', name: 'Hot Seam', text: 'Words of 5+ letters in a row: +1 length bonus for the first, +2 for the next, then +3. A shorter word resets it.' },
  { id: 'echo', icon: '🔁', name: 'Echo', text: 'Words that use a letter twice (the Ls in “hello”, the Es in “there”) get +1 word multiplier.' },
  { id: 'first', icon: '🌅', name: 'Opening Strike', text: 'The first word on each depth gets +2 word multiplier (×3 on its own).' },
  { id: 'short', icon: '✂️', name: 'Chisel', text: '3- and 4-letter words get +2 word multiplier (×3 on their own).' },
  { id: 'blast', icon: '🧨', name: 'Demolition', text: 'An extra fuse on each new face from depth 3; fuses last 2 words longer and blasts pay triple.' },
  { id: 'rocks', icon: '🪨', name: 'Stonebreaker', text: 'Granite cracks like plain rock, and broken rocks pay 10 instead of 5.' },
  { id: 'pick', icon: '⛏️', name: 'Pickaxe', text: 'Twice per depth, tap ⛏ then any tile to knock it out.' },
  { id: 'shake', icon: '🌀', name: 'Tremor', text: 'Two more shakes per depth (a shake jumbles the whole face).' },
  { id: 'wild', icon: '🃏', name: 'Wild Stone', text: 'Each new face starts with two blank tiles that stand for any letter (worth 0).' },
];

export const perkDef = (id: PerkId): PerkDef => PERKS.find((p) => p.id === id)!;
