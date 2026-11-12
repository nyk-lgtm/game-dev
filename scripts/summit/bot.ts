// A greedy Summit bot with a little lookahead: it searches the chains of plays it
// can see (never peeking at face-down cards or the draw pile, except with the
// Spyglass) and plays the first card of the best chain; otherwise it draws.

import { fitKind, isCovered, playableSlots, shown, type Card, type CharmId, type Run } from '../../src/summit/core';

/** Charm preference, best first. */
export const PRIORITY: CharmId[] = ['pockets', 'momentum', 'joker', 'mirror', 'wind', 'blast', 'flags', 'flush', 'stride', 'lantern', 'spyglass', 'stakes', 'rewind'];

interface Best {
  value: number;
  first: number;
}

/** Value of the best chain of plays from here, and its first card. */
export function bestChain(r: Run, budget = 4000): Best {
  const d = r.deal;
  const gone = d.slots.map((s) => s.gone);
  const known = d.slots.map((_, i) => shown(r, i) || !isCovered(d, i));
  const covered = (i: number) => d.slots[i].coveredBy.some((j) => !gone[j]);
  let nodes = 0;
  let best: Best = { value: -1, first: -1 };
  const left = () => gone.reduce((k, g) => k + (g ? 0 : 1), 0);
  const dfs = (t: Card, value: number, first: number, revealed: Set<number>) => {
    nodes++;
    let moved = false;
    if (nodes < budget)
      for (let i = 0; i < gone.length; i++) {
        // Face-down cards this chain would uncover can't be planned on.
        if (gone[i] || covered(i) || !known[i]) continue;
        const k = fitKind(r, d.slots[i].card, t);
        if (!k) continue;
        gone[i] = true;
        // Cards this play uncovers; face-down ones are worth something just for showing.
        const fresh: number[] = [];
        let gain = k === 'stride' ? 0.3 : 1;
        for (let j = 0; j < gone.length; j++)
          if (!gone[j] && !revealed.has(j) && d.slots[j].coveredBy.includes(i) && !covered(j)) {
            fresh.push(j);
            if (!known[j]) gain += 0.6;
            else gain += 0.15;
          }
        for (const j of fresh) revealed.add(j);
        if (!left()) gain += 50;
        moved = true;
        dfs(d.slots[i].card, value + gain, first < 0 ? i : first, revealed);
        for (const j of fresh) revealed.delete(j);
        gone[i] = false;
      }
    if (!moved && first >= 0 && value > best.value) best = { value, first };
  };
  dfs(d.waste[d.waste.length - 1], 0, -1, new Set());
  return best;
}

/** A blast that makes a card playable right away, or failing that the one that uncovers most. */
function blastTarget(r: Run, mustUse: boolean): number {
  const d = r.deal;
  let pick = -1, pickScore = -1;
  d.slots.forEach((s, i) => {
    if (s.gone) return;
    s.gone = true;
    let score = 0;
    d.slots.forEach((q, j) => {
      if (q.gone || !q.coveredBy.includes(i) || isCovered(d, j)) return;
      score += 1;
      if (shown(r, j) && fitKind(r, q.card)) score += 5;
    });
    if (!isCovered(d, i)) score += 0.5;
    s.gone = false;
    if (score > pickScore) {
      pickScore = score;
      pick = i;
    }
  });
  return mustUse || pickScore >= 5 ? pick : -1;
}

export function botAction(r: Run): string {
  if (r.phase === 'charm') {
    const c = PRIORITY.find((p) => r.offer.includes(p)) ?? r.offer[0];
    return `C${c}`;
  }
  const d = r.deal;
  if (playableSlots(r).length) return `P${bestChain(r).first}`;
  if (d.blasts > 0) {
    const t = blastTarget(r, !d.stock.length);
    if (t >= 0) return `B${t}`;
  }
  if (d.stock.length) return 'D';
  return 'X';
}
