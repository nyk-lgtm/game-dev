// Cards and the play rule. Ranks 1 (A) to 13 (K) wrap; rank 0 is the wild Joker.

export interface Card {
  /** 1..13, or 0 for the Joker. */
  r: number;
  /** 0 ♠, 1 ♥, 2 ♦, 3 ♣; -1 for the Joker. */
  s: number;
}

export const SUITS = ['♠', '♥', '♦', '♣'];
export const RANKS = ['★', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export const isRed = (c: Card) => c.s === 1 || c.s === 2;
export const cardName = (c: Card) => (c.r === 0 ? 'Joker' : `${RANKS[c.r]}${SUITS[c.s]}`);

/** Distance between two ranks around the A-K circle (0..6). */
export function rankGap(a: number, b: number): number {
  const d = Math.abs(a - b) % 13;
  return Math.min(d, 13 - d);
}

/** A full deck, ordered. */
export function freshDeck(): Card[] {
  const d: Card[] = [];
  for (let s = 0; s < 4; s++) for (let r = 1; r <= 13; r++) d.push({ r, s });
  return d;
}
