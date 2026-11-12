// Hand-drawn peak layouts. Each row is a string indexed in half-card steps: an X at
// column x is a card spanning x..x+2. A card is covered by the cards of the next row
// down that overlap it (column x-1 or x+1). Rows alternate parity, so overlaps are
// always half a card. At most 8 cards across, so each card is ~46 px wide at 390 px.

export interface Layout {
  name: string;
  rows: string[];
}

export interface SlotPos {
  row: number;
  x: number;
  /** Slots (indices) that cover this one. */
  coveredBy: number[];
}

const L = (name: string, ...rows: string[]): Layout => ({ name, rows });

/** Floors 1-2: three rows. */
export const SMALL: Layout[] = [
  L('Three Peaks', ' X     X     X', 'X X   X X   X X', ' X X X X X X X'),
  L('Crown', '   X   X   X', '  X X X X X X', ' X X X X X X X'),
  L('Twin Hills', '  X X     X X', ' X X X   X X X', 'X X X X X X X X'),
];

/** Floors 3-5: four rows. */
export const MEDIUM: Layout[] = [
  L('Twin Peaks', '   X       X', '  X X     X X', ' X X X   X X X', 'X X X X X X X X'),
  L('Valley', ' X           X', 'X X         X X', ' X X X   X X X', 'X X X X X X X X'),
  L('Three Peaks', ' X     X     X', 'X X   X X   X X', ' X X X X X X X', 'X X X X X X X X'),
];

/** Floors 6-8: four or five rows, more cards. */
export const LARGE: Layout[] = [
  L('Sawtooth', ' X   X   X   X', 'X X X X X X X X', ' X X X X X X X', 'X X X X X X X X'),
  L('Mesa', '     X X X', '    X X X X', '   X X X X X', '  X X X X X X', ' X X X X X X X'),
  L('High Ridge', '   X   X   X', '  X X X X X X', ' X X X X X X X', 'X X X X X X X X'),
];

export function layoutFor(floor: number): Layout[] {
  return floor < 2 ? SMALL : floor < 5 ? MEDIUM : LARGE;
}

/** Slot positions in reading order (top row first), with who covers whom. */
export function slotsOf(l: Layout): SlotPos[] {
  const out: SlotPos[] = [];
  l.rows.forEach((row, r) => {
    for (let x = 0; x < row.length; x++) if (row[x] === 'X') out.push({ row: r, x, coveredBy: [] });
  });
  for (const a of out) for (let j = 0; j < out.length; j++) if (out[j].row === a.row + 1 && Math.abs(out[j].x - a.x) === 1) a.coveredBy.push(j);
  return out;
}
