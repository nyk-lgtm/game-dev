// Checking a player's board and finding the next hint. Pure.

import { distance } from '../../shared/hex';
import { ELEMENT_NAMES, bit, clueCells, initialDomains, isLink, linkCells, linksAt, makeBoard, prey, propagate, single, type Board, type Puzzle, type Step } from './puzzle';

/**
 * Clues that can no longer be met, given what's filled in (only counts filled
 * cells): number cells, and link ids whose two hexes are filled and differ.
 */
export function brokenClues(p: Puzzle, vals: number[]): number[] {
  const b = makeBoard(p.radius);
  const out: number[] = [];
  for (let id = vals.length; id < p.clue.length; id++) {
    if (p.clue[id] < 0) continue;
    const [x, y] = linkCells(b, id);
    if (vals[x] >= 0 && vals[y] >= 0 && vals[x] !== vals[y]) out.push(id);
  }
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

/**
 * A "what if", laid out so the player can check it: suppose `value` in `cell`;
 * single clues then force `chain` (each hex and the options it has left, in
 * order, only the ones the break needs), until the clue `breaks` can't be met.
 */
export interface TrialView {
  cell: number;
  value: number;
  chain: { cell: number; left: number }[];
  breaks: number;
}

export type Hint =
  | { kind: 'wrong'; cell: number }
  | { kind: 'step'; clue: number; cell: number; value: number; text: string; notes: boolean; clues?: number[]; trial?: TrialView }
  | { kind: 'not'; clue: number; cell: number; not: number; text: string; clues?: number[]; trial?: TrialView }
  | { kind: 'done' };

/** The clue list with only `keep` left in it. */
const only = (clue: number[], keep: Set<number>) => clue.map((n, i) => (keep.has(i) ? n : -1));

/** The clues that steps[0..upto] used to narrow `cells`, walking back through what each one read. */
function traceBack(b: Board, steps: Step[], upto: number, cells: number[], used = new Set<number>()): { used: Set<number>; at: Set<number> } {
  const need = new Set(cells);
  const at = new Set<number>();
  for (let k = upto; k >= 0; k--) {
    const s = steps[k];
    if (!need.has(s.cell)) continue;
    used.add(s.clue);
    at.add(k);
    for (const c of clueCells(b, s.clue)) need.add(c);
  }
  return { used, at };
}

/** Hex distance from cell `i` to a clue (a number's hex, or the nearer hex of a link). */
const away = (b: Board, i: number, c: number) => Math.min(...(isLink(b, c) ? linkCells(b, c) : [c]).map((k) => distance(b.cells[i], b.cells[k])));

/** Drops clues (farthest from `i` first) while `ok` still holds: a set where every clue is needed. Nearest first. */
function minimise(b: Board, used: Set<number>, i: number, ok: (keep: Set<number>) => boolean): number[] {
  const keep = new Set(used);
  const order = [...keep].sort((x, y) => away(b, i, y) - away(b, i, x) || y - x);
  for (const c of order) {
    if (keep.size === 1) break;
    keep.delete(c);
    if (!ok(keep)) keep.add(c);
  }
  return [...keep].sort((x, y) => away(b, i, x) - away(b, i, y) || x - y);
}

/** How many supports to minimise before picking the smallest (bounded work per hint). */
const TRY = 6;

/** "<b>3</b>", "<b>3</b> and <b>4</b>", "<b>3</b>, <b>4</b> and <b>2</b>". */
const listOf = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

/**
 * The next thing to fill in. A wrong entry comes first; otherwise the cell that
 * single-clue deductions pin down with the fewest clues, from the player's
 * correct entries; then a "what if" with the shortest chain.
 * `notes` (optional) are pencil marks; ones that still allow the true value narrow the search.
 */
export function nextHint(p: Puzzle, vals: number[], notes?: number[]): Hint {
  const wrong = vals.findIndex((v, i) => v >= 0 && v !== p.solution[i]);
  if (wrong >= 0) return { kind: 'wrong', cell: wrong };
  if (solved(p, vals)) return { kind: 'done' };
  const b = makeBoard(p.radius);
  const base = initialDomains(p).map((d, i) => (vals[i] >= 0 ? bit(vals[i]) : notes?.[i] && notes[i] & bit(p.solution[i]) ? d & notes[i] : d));
  const dom = base.slice();
  const steps: Step[] = [];
  propagate(b, p.clue, dom, steps);
  // A hex a link merely copies from a filled one is no news to the player: offer
  // a real deduction first, and the copy only if nothing else is left.
  let copy: Hint | null = null;
  const known = (k: number) => vals[k] >= 0 || p.given[k] >= 0;
  const real: { cell: number; k: number; v: number; used: Set<number> }[] = [];
  steps.forEach((s, k) => {
    const v = single(s.left);
    if (v < 0 || known(s.cell)) return;
    // Linked (directly or along a chain of links) to a filled hex?
    const group = [s.cell];
    const via = new Map<number, number>([[s.cell, -1]]);
    for (let g = 0; g < group.length; g++)
      for (const id of linksAt(b, p.clue, group[g]))
        for (const j of linkCells(b, id))
          if (!via.has(j)) {
            via.set(j, id);
            group.push(j);
          }
    const src = group.find((j) => j !== s.cell && known(j));
    if (src === undefined) {
      real.push({ cell: s.cell, k, v, used: traceBack(b, steps, k, [s.cell]).used });
      return;
    }
    if (copy) return;
    const name = ELEMENT_NAMES[v];
    const chain: number[] = [];
    for (let j = src; j !== s.cell; j = linkCells(b, via.get(j)!).find((x) => x !== j)!) chain.push(via.get(j)!);
    const text = chain.length === 1 ? `The link says it matches the <b>${name}</b> next to it.` : `Links chain it to a <b>${name}</b>, so it's <b>${name}</b> too.`;
    copy = { kind: 'step', clue: chain[chain.length - 1], cell: s.cell, value: v, text, notes: false, clues: chain };
  });
  if (real.length) {
    // Every clue the deduction leans on (a number can need another number's help),
    // pared down to the ones it can't do without; the simplest step wins.
    real.sort((x, y) => x.used.size - y.used.size || x.k - y.k);
    let best: { cell: number; k: number; v: number; by: number[] } | null = null;
    for (const r of real.slice(0, TRY)) {
      const pins = (keep: Set<number>) => {
        const d = base.slice();
        propagate(b, only(p.clue, keep), d);
        return single(d[r.cell]) >= 0;
      };
      const by = pins(r.used) ? minimise(b, r.used, r.cell, pins) : [...r.used];
      if (!best || by.length < best.by.length) best = { ...r, by };
    }
    const { cell, v, by } = best!;
    return { kind: 'step', clue: by[0], cell, value: v, text: stepText(p, b, cell, v, by), notes: by.length > 1, clues: by };
  }
  if (copy) return copy;
  // Stuck on single clues (Hard puzzles): a "what if" rules something out.
  const t = bestTrial(p, b, base, dom);
  if (t) {
    const after = dom.slice();
    after[t.cell] &= ~bit(t.value);
    propagate(b, p.clue, after);
    const v = single(after[t.cell]);
    const breaks = isLink(b, t.breaks) ? 'the red link can’t hold' : `the red <b>${p.clue[t.breaks]}</b> can’t add up`;
    const whatIf = `If this were <b>${ELEMENT_NAMES[t.value]}</b>, ${t.chain.length ? `the numbered ghosts follow and ${breaks}` : breaks}`;
    const { clues, ...trial } = t;
    if (v >= 0 && !known(t.cell)) return { kind: 'step', clue: t.breaks, cell: t.cell, value: v, text: `${whatIf}. So it’s <b>${ELEMENT_NAMES[v]}</b>.`, notes: true, clues, trial };
    return { kind: 'not', clue: t.breaks, cell: t.cell, not: t.value, text: `${whatIf}. So it isn’t ${ELEMENT_NAMES[t.value]} (noted).`, clues, trial };
  }
  // Deductions always finish a generated puzzle; this is only a fallback.
  const cell = vals.findIndex((v) => v < 0);
  return { kind: 'step', clue: cell, cell, value: p.solution[cell], text: `This one is <b>${ELEMENT_NAMES[p.solution[cell]]}</b>.`, notes: false };
}

/** Names every clue in `by` (a number's own, its neighbors', further ones, links). */
function stepText(p: Puzzle, b: Board, cell: number, v: number, by: number[]): string {
  const name = ELEMENT_NAMES[v];
  const links = by.filter((c) => isLink(b, c));
  if (links.length === by.length)
    return links.length > 1 ? `Its links say these all match, and together they leave only <b>${name}</b>.` : `The link says these two match, and the hex across it can only be <b>${name}</b>.`;
  const own = by.includes(cell);
  const nums = by.filter((c) => c !== cell && !isLink(b, c));
  const near = nums.every((c) => b.adj[cell].includes(c));
  const list = listOf(nums.map((c) => `<b>${p.clue[c]}</b>`));
  const link = links.length > 1 ? `the ${links.length} links` : 'the link';
  const parts = [own ? `its own <b>${p.clue[cell]}</b>` : '', nums.length ? (near ? `the ${list} next to it` : `the highlighted ${list}`) : '', links.length ? link : ''].filter(Boolean);
  const who = parts.length > 2 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts.join(' and ');
  return `${who[0].toUpperCase()}${who.slice(1)} only work${by.length > 1 ? '' : 's'} if this is <b>${name}</b>.`;
}

/**
 * Of every supposition that single clues refute, the one with the fewest clues
 * in its refutation, with that chain laid out (`clues` = every clue it reads).
 */
function bestTrial(p: Puzzle, b: Board, base: number[], settled: number[]): (TrialView & { clues: number[] }) | null {
  const found: { cell: number; value: number; used: Set<number> }[] = [];
  for (let i = 0; i < settled.length; i++)
    for (let v = 0; v < 3; v++) {
      if (single(settled[i]) >= 0 || !(settled[i] & bit(v))) continue;
      const quick = settled.slice();
      quick[i] = bit(v);
      if (propagate(b, p.clue, quick)) continue;
      // From the player's own board (what they can see), with the steps written down.
      const t = base.slice();
      t[i] = bit(v);
      const steps: Step[] = [];
      const fail = { clue: -1 };
      if (propagate(b, p.clue, t, steps, fail)) continue;
      found.push({ cell: i, value: v, used: traceBack(b, steps, steps.length - 1, clueCells(b, fail.clue), new Set([fail.clue])).used });
    }
  if (!found.length) return null;
  found.sort((x, y) => x.used.size - y.used.size);
  let best: { cell: number; value: number; by: number[] } | null = null;
  for (const f of found.slice(0, TRY)) {
    const fails = (keep: Set<number>) => {
      const t = base.slice();
      t[f.cell] = bit(f.value);
      return !propagate(b, only(p.clue, keep), t);
    };
    const by = fails(f.used) ? minimise(b, f.used, f.cell, fails) : [...f.used];
    if (!best || by.length < best.by.length) best = { ...f, by };
  }
  const { cell, value, by } = best!;
  // Replay it with just those clues, keeping the steps the break needs.
  const t = base.slice();
  t[cell] = bit(value);
  const steps: Step[] = [];
  const fail = { clue: -1 };
  propagate(b, only(p.clue, new Set(by)), t, steps, fail);
  const breaks = fail.clue >= 0 ? fail.clue : by[by.length - 1];
  const { at } = traceBack(b, steps, steps.length - 1, clueCells(b, breaks));
  const chain: { cell: number; left: number }[] = [];
  steps.forEach((s, k) => {
    if (!at.has(k) || s.cell === cell) return;
    const had = chain.find((c) => c.cell === s.cell);
    if (had) had.left = s.left;
    else chain.push({ cell: s.cell, left: s.left });
  });
  return { cell, value, chain, breaks, clues: by };
}
