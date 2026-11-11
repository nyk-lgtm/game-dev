// Checking a player's board and finding the next hint. Pure.

import { ELEMENT_NAMES, bit, initialDomains, makeBoard, prey, propagate, propagateDeep, single, type Puzzle, type Step, type Trial } from './puzzle';

/** Clue cells that can no longer be met, given what's filled in (only counts filled cells). */
export function brokenClues(p: Puzzle, vals: number[]): number[] {
  const b = makeBoard(p.radius);
  const out: number[] = [];
  for (let i = 0; i < vals.length; i++) {
    const n = p.clue[i];
    if (n < 0 || vals[i] < 0) continue;
    const pr = prey(vals[i]);
    let beat = 0;
    let open = 0;
    for (const j of b.adj[i]) {
      if (vals[j] < 0) open++;
      else if (vals[j] === pr) beat++;
    }
    if (beat > n || beat + open < n) out.push(i);
  }
  return out;
}

/** Every cell filled and every clue met (the answer is unique, so this is the answer). */
export function solved(p: Puzzle, vals: number[]): boolean {
  return vals.every((v, i) => p.given[i] >= 0 || v === p.solution[i]);
}

export type Hint =
  | { kind: 'wrong'; cell: number }
  | { kind: 'step'; clue: number; cell: number; value: number; text: string; notes: boolean; clues?: number[] }
  | { kind: 'not'; clue: number; cell: number; not: number; text: string }
  | { kind: 'done' };

/**
 * The next thing to fill in. A wrong entry comes first; otherwise the first
 * cell that single-clue deductions pin down, from the player's correct entries.
 */
/** `notes` (optional) are pencil marks; ones that still allow the true value narrow the search. */
export function nextHint(p: Puzzle, vals: number[], notes?: number[]): Hint {
  const wrong = vals.findIndex((v, i) => v >= 0 && v !== p.solution[i]);
  if (wrong >= 0) return { kind: 'wrong', cell: wrong };
  if (solved(p, vals)) return { kind: 'done' };
  const b = makeBoard(p.radius);
  const dom = initialDomains(p).map((d, i) => (vals[i] >= 0 ? bit(vals[i]) : notes?.[i] && notes[i] & bit(p.solution[i]) ? d & notes[i] : d));
  const steps: Step[] = [];
  propagate(b, p.clue, dom, steps);
  let partial = false;
  for (const s of steps) {
    const v = single(s.left);
    if (v < 0 || vals[s.cell] >= 0 || p.given[s.cell] >= 0) {
      if (v < 0) partial = true;
      continue;
    }
    // Every clue that narrowed this cell, not just the last one.
    const by = [...new Set(steps.slice(0, steps.indexOf(s) + 1).filter((t) => t.cell === s.cell).map((t) => t.clue))];
    const own = by.includes(s.cell);
    const others = by.filter((c) => c !== s.cell).map((c) => `<b>${p.clue[c]}</b>`);
    const name = ELEMENT_NAMES[v];
    const who = [own ? `its own <b>${p.clue[s.cell]}</b>` : '', others.length ? `the ${others.join(' and ')} next to it` : ''].filter(Boolean).join(' and ');
    const text = `${who[0].toUpperCase()}${who.slice(1)} only work${by.length > 1 ? '' : 's'} if this is <b>${name}</b>.`;
    return { kind: 'step', clue: s.clue, cell: s.cell, value: v, text, notes: partial, clues: by };
  }
  // Stuck on single numbers (Hard puzzles): a "what if" rules something out.
  const trials: Trial[] = [];
  propagateDeep(b, p.clue, dom.slice(), trials);
  const t = trials[0];
  if (t) {
    const after = dom.slice();
    after[t.cell] &= ~bit(t.not);
    propagate(b, p.clue, after);
    const v = single(after[t.cell]);
    const whatIf = `If this were <b>${ELEMENT_NAMES[t.not]}</b>, the highlighted <b>${p.clue[t.clue]}</b> could no longer add up`;
    if (v >= 0 && vals[t.cell] < 0 && p.given[t.cell] < 0)
      return { kind: 'step', clue: t.clue, cell: t.cell, value: v, text: `${whatIf}, so it's <b>${ELEMENT_NAMES[v]}</b>.`, notes: true };
    return { kind: 'not', clue: t.clue, cell: t.cell, not: t.not, text: `${whatIf}. So it isn't ${ELEMENT_NAMES[t.not]} (added to its notes).` };
  }
  // Deductions always finish a generated puzzle; this is only a fallback.
  const cell = vals.findIndex((v) => v < 0);
  return { kind: 'step', clue: cell, cell, value: p.solution[cell], text: `This one is <b>${ELEMENT_NAMES[p.solution[cell]]}</b>.`, notes: false };
}
