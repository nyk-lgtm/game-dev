// Exact outcome previews by simulating the real rules.

import { key, type Hex } from '../../shared/hex';
import { CELLS, applyAction, cellAt, crystalChoice, groupAt, isLegal } from './rules';
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
  /**
   * When nothing merges: how many identical pieces would touch in the group
   * the new piece joins (2 means one more of it merges). 0 for wisps/bolts.
   */
  group: number;
}

export function previewAction(s: GameState, a: Action): Outcome {
  const { state, events } = applyAction(s, a);
  const out: Outcome = {
    points: state.score - s.score,
    consumed: [],
    creates: null,
    trapped: 0,
    crystal: null,
    over: false,
    group: 0,
  };
  for (const ev of events) {
    if (ev.type === 'merge') {
      out.consumed.push(...ev.from);
      if (!out.creates || ev.tier > out.creates.tier || ev.kind === 'plant') out.creates = { kind: ev.kind, tier: ev.tier };
    } else if (ev.type === 'wispTrapped') out.trapped++;
    else if (ev.type === 'crystal') out.crystal = ev.became;
    else if (ev.type === 'gameOver') out.over = true;
  }
  if (!out.creates && a.type === 'place') {
    const p = s.current;
    const piece = p.kind === 'plant' ? p : p.kind === 'crystal' ? crystalChoice(s, a.at) : null;
    if (piece) {
      const t: GameState = { ...s, board: { ...s.board, [key(a.at)]: piece } };
      out.group = groupAt(t, a.at, piece.kind, piece.tier).length;
    }
  }
  return out;
}

/** Empty cells where the piece in hand would merge right away (plants and crystals only). */
export function mergeSpots(s: GameState): Hex[] {
  if (s.status !== 'playing' || (s.current.kind !== 'plant' && s.current.kind !== 'crystal')) return [];
  return CELLS.filter((h) => {
    if (cellAt(s, h) !== null || !isLegal(s, { type: 'place', at: h })) return false;
    const piece = s.current.kind === 'plant' ? s.current : crystalChoice(s, h);
    const t: GameState = { ...s, board: { ...s.board, [key(h)]: piece } };
    return groupAt(t, h, piece.kind, piece.tier).length >= 3 && !(piece.kind === 'plant' && piece.tier >= 5);
  });
}
