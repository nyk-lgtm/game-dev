// Quarry bots. Both search the whole face for common words (SCOWL ≤ 35).
//  - 'best' plays the top-scoring word every time: far sharper than a person.
//  - 'human' only "spots" a share of the words on the face (a fixed hash per
//    word and turn, so runs replay) and none longer than 6 letters, then plays
//    the best it spotted. Its numbers are what the targets are tuned on.
// Both use a fuse before it blows when that costs little, shake a weak face,
// and knock out rocks with the pickaxe.

import { NEIGHBORS, evaluate, findWords, isScore, type Dict, type PerkId, type Run } from '../../src/quarry/core';
import { mixSeed } from '../../src/shared/rng';

function mixSeedStr(s: string, n: number): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return mixSeed(h >>> 0, n);
}

export type BotMode = 'best' | 'human';

export interface BotOpts {
  mode?: BotMode;
  /** Human: share of the words on the face it notices. */
  seen?: number;
  /** Human: longest word it finds. */
  maxLen?: number;
  /** Perk preference, best first (default PRIORITY). */
  perks?: readonly PerkId[];
}

/** Perk preference, best first. */
export const PRIORITY: PerkId[] = ['streak', 'long', 'first', 'wild', 'gold', 'pick', 'shake', 'blast', 'shift', 'rare', 'rocks', 'short', 'echo'];
/** The weakest perks first (from `PERKTABLE=1` on balance.ts): a run with unlucky picks. */
export const WORST: PerkId[] = ['echo', 'short', 'rocks', 'rare', 'shift', 'blast', 'shake', 'pick', 'gold', 'wild', 'first', 'long', 'streak'];

interface Cand {
  path: number[];
  word: string;
  value: number;
  points: number;
  fuse: boolean;
}

export function candidates(r: Run, dict: Dict, o: BotOpts = {}): Cand[] {
  const human = o.mode === 'human';
  const found = findWords(r.board, dict, { commonOnly: true, maxLen: human ? (o.maxLen ?? 6) : 8 });
  const seen = o.seen ?? 0.08;
  const out: Cand[] = [];
  const spotted = new Map<string, boolean>();
  for (const f of found) {
    if (human) {
      let s = spotted.get(f.word);
      if (s === undefined) {
        // People look hard around a lit fuse.
        const odds = f.path.some((i) => r.board[i].fuse) ? Math.min(1, seen * 4) : seen;
        s = (mixSeedStr(f.word, r.seed + r.depth * 101 + r.played * 7) % 1000) / 1000 < odds;
        spotted.set(f.word, s);
      }
      if (!s) continue;
    }
    const e = evaluate(r, f.path, dict);
    if (!isScore(e)) continue;
    // Rocks next to the word are worth breaking.
    const near = new Set<number>();
    for (const i of f.path) for (const n of NEIGHBORS[i]) if (!f.path.includes(n) && r.board[n].rock) near.add(n);
    const fuse = f.path.some((i) => r.board[i].fuse);
    out.push({ path: f.path, word: e.word, points: e.points, value: e.points + near.size * 4 + (fuse ? 8 : 0), fuse });
  }
  return out.sort((a, b) => b.value - a.value || a.path.length - b.path.length);
}

export function botAction(r: Run, dict: Dict, o: BotOpts = {}): string {
  if (r.phase === 'perk') return `P${(o.perks ?? PRIORITY).find((p) => r.offer.includes(p)) ?? r.offer[0]}`;
  if (r.phase !== 'play') return 'Q';
  const cands = candidates(r, dict, o);
  if (r.picks > 0) {
    const rock = r.board.findIndex((t) => t.rock);
    if (rock >= 0) return `X${rock}`;
  }
  if (!cands.length) return r.shakes > 0 ? 'S' : 'Q';
  const need = r.target - r.got;
  // A word that finishes the depth: take the one that does it.
  const finisher = cands.find((c) => c.points >= need);
  if (finisher) return `W${finisher.path.join('.')}`;
  let pick = cands[0];
  // A fuse about to blow: use it if that doesn't cost much.
  const urgent = r.board.some((t) => t.fuse === 1);
  if (urgent && !pick.fuse) {
    const f = cands.find((c) => c.fuse);
    const perWord = need / Math.max(1, r.wordsLeft);
    if (f && f.value + perWord * 0.8 >= pick.value) pick = f;
  }
  // A poor face: shake it while shakes last.
  const perWord = need / Math.max(1, r.wordsLeft);
  if (r.shakes > 0 && pick.value < perWord * 0.45 && r.wordsLeft > 1) return 'S';
  return `W${pick.path.join('.')}`;
}
