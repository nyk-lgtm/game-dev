// Exact outcome previews by simulating the real rules.

import type { Hex } from '../../shared/hex';
import { applyAction } from './rules';
import type { Action, Family, GameState } from './types';

export interface Outcome {
  points: number;
  /** Cells whose pieces get pulled into a merge. */
  consumed: Hex[];
  /** The best piece this move creates by merging, if any. */
  creates: { kind: Family; tier: number } | null;
  /** Wisps that turn to stone. */
  trapped: number;
  /** What a crystal turns into. */
  crystal: { kind: Family; tier: number } | null;
  over: boolean;
}

export function previewAction(s: GameState, a: Action): Outcome {
  const { state, events } = applyAction(s, a);
  const out: Outcome = { points: state.score - s.score, consumed: [], creates: null, trapped: 0, crystal: null, over: false };
  for (const ev of events) {
    if (ev.type === 'merge') {
      out.consumed.push(...ev.from);
      if (!out.creates || ev.tier > out.creates.tier || ev.kind === 'plant') out.creates = { kind: ev.kind, tier: ev.tier };
    } else if (ev.type === 'wispTrapped') out.trapped++;
    else if (ev.type === 'crystal') out.crystal = ev.became;
    else if (ev.type === 'gameOver') out.over = true;
  }
  return out;
}
