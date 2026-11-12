// Perks: one of three is offered after every cleared depth; each can be taken once.

export type PerkId = 'long' | 'gold' | 'shift' | 'rare' | 'blast' | 'pick' | 'shake' | 'wild' | 'short' | 'streak' | 'rocks' | 'first' | 'echo';

export interface PerkDef {
  id: PerkId;
  icon: string;
  name: string;
  text: string;
}

export const PERKS: readonly PerkDef[] = [
  { id: 'long', icon: '📏', name: 'Long Haul', text: 'Words of 6+ letters get +2 to their length bonus.' },
  { id: 'shift', icon: '⏳', name: 'Overtime', text: 'One more word on every depth.' },
  { id: 'gold', icon: '🪙', name: 'Gold Rush', text: 'Two more gold tiles on each new face, and gold turns up twice as often.' },
  { id: 'rare', icon: '💎', name: 'Prospector', text: 'Letters worth 4 or more count double.' },
  { id: 'streak', icon: '🔥', name: 'Hot Seam', text: 'Each word of 5+ letters in a row adds +1 to the next one’s length bonus.' },
  { id: 'echo', icon: '🔁', name: 'Echo', text: 'Words with a doubled letter (like the LL in “hello”) score ×1.5.' },
  { id: 'first', icon: '🌅', name: 'Opening Strike', text: 'The first word on each depth scores ×2.' },
  { id: 'short', icon: '✂️', name: 'Chisel', text: '3- and 4-letter words score ×2.' },
  { id: 'blast', icon: '🧨', name: 'Demolition', text: 'Fuses last 2 words longer and their blasts pay double.' },
  { id: 'rocks', icon: '🪨', name: 'Stonebreaker', text: 'Granite cracks like plain rock, and every rock you break pays 20.' },
  { id: 'pick', icon: '⛏️', name: 'Pickaxe', text: 'Once per depth, tap ⛏ then any tile to knock it out.' },
  { id: 'shake', icon: '🌀', name: 'Tremor', text: 'Two more shakes per depth (a shake jumbles the whole face).' },
  { id: 'wild', icon: '🃏', name: 'Wild Stone', text: 'Each new face starts with a blank tile that stands for any letter (worth 0).' },
];

export const perkDef = (id: PerkId): PerkDef => PERKS.find((p) => p.id === id)!;
