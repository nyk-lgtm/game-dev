// The heart of the game: apply one player action and run the enemy phase.
// Pure: never mutates its input, returns the next state plus a list of
// events that the renderer turns into animation.

import { enemyAt, legalMoves, tileAt } from './board';
import { damageUnit, shieldBlocks, shove } from './combat';
import { ENEMIES, explode } from './enemies';
import { DIRS, add, dirIndex, eq, isAdjacent, neighbors, type Hex } from './hex';
import { enterFloor } from './levelgen';
import { PLAYER_ID, type Action, type Enemy, type GameEvent, type GameState, type StepResult } from './types';

export const STAB_DAMAGE = 1;
export const LUNGE_DAMAGE = 2;
/** Turns Bash needs to recharge after use. */
export const BASH_COOLDOWN = 3;

/** Adjacent enemies the player can bash right now. */
export function bashTargets(s: GameState): Hex[] {
  if (s.status !== 'playing' || s.player.bashCd > 0) return [];
  return neighbors(s.player.pos).filter((h) => enemyAt(s, h) !== undefined);
}

export function legalActions(s: GameState): Action[] {
  if (s.status !== 'playing') return [];
  const acts: Action[] = [
    ...legalMoves(s).map((to): Action => ({ type: 'move', to })),
    ...bashTargets(s).map((target): Action => ({ type: 'bash', target })),
  ];
  return acts.length ? acts : [{ type: 'wait' }];
}

export function isLegal(s: GameState, a: Action): boolean {
  if (s.status !== 'playing') return false;
  switch (a.type) {
    case 'move':
      return legalMoves(s).some((h) => eq(h, a.to));
    case 'bash':
      return bashTargets(s).some((h) => eq(h, a.target));
    case 'wait':
      return legalMoves(s).length === 0 && bashTargets(s).length === 0;
  }
}

export function applyAction(prev: GameState, a: Action): StepResult {
  if (!isLegal(prev, a)) throw new Error(`illegal action ${JSON.stringify(a)}`);
  const s: GameState = structuredClone(prev);
  const events: GameEvent[] = [];
  s.turn++;
  if (a.type !== 'bash' && s.player.bashCd > 0) s.player.bashCd--;

  if (a.type === 'move') {
    playerMove(s, a.to, events);
    if (tileAt(s, s.player.pos) === 'stairs') {
      descend(s, events);
      return { state: s, events };
    }
  } else if (a.type === 'bash') {
    playerBash(s, a.target, events);
  } else {
    events.push({ type: 'playerWait' });
  }

  enemyPhase(s, events);
  s.enemies = s.enemies.filter((e) => e.hp > 0);
  if (s.player.hp <= 0) {
    s.status = 'dead';
    events.push({ type: 'playerDeath' });
  }
  return { state: s, events };
}

function strike(s: GameState, e: Enemy, from: Hex, amount: number, kind: 'stab' | 'lunge', events: GameEvent[]): void {
  events.push({ type: 'attack', kind, by: PLAYER_ID, target: e.id });
  if (shieldBlocks(e, from)) {
    events.push({ type: 'blocked', target: e.id });
    return;
  }
  damageUnit(s, e.id, amount, events);
}

function playerMove(s: GameState, to: Hex, events: GameEvent[]): void {
  const from = s.player.pos;
  const dir = dirIndex(from, to);
  s.player.pos = to;
  s.player.facing = dir;
  events.push({ type: 'playerMove', from, to });

  // Lunge: an enemy directly ahead in the direction of travel.
  const lungeTarget = enemyAt(s, add(to, DIRS[dir]));
  // Stab: enemies adjacent to both the start and end hex.
  const stabTargets = s.enemies.filter(
    (e) => e.hp > 0 && isAdjacent(e.pos, from) && isAdjacent(e.pos, to),
  );
  if (lungeTarget) strike(s, lungeTarget, to, LUNGE_DAMAGE, 'lunge', events);
  for (const e of stabTargets) strike(s, e, to, STAB_DAMAGE, 'stab', events);
}

function playerBash(s: GameState, target: Hex, events: GameEvent[]): void {
  const e = enemyAt(s, target)!;
  const dir = dirIndex(s.player.pos, target);
  s.player.facing = dir;
  s.player.bashCd = BASH_COOLDOWN;
  events.push({ type: 'attack', kind: 'bash', by: PLAYER_ID, target: e.id });
  shove(s, e, dir, events);
}

function enemyPhase(s: GameState, events: GameEvent[]): void {
  // 1. Telegraphs resolve: fuses tick and bombs explode, then readied shots
  //    and charges fire in id order.
  const lit = s.bombs.map((b) => ({ ...b, fuse: b.fuse - 1 }));
  s.bombs = lit.filter((b) => b.fuse > 0);
  for (const b of lit) {
    if (s.player.hp <= 0) return;
    if (b.fuse === 0) explode(s, b.pos, events);
  }
  const released = new Set<number>();
  for (const e of s.enemies) {
    if (s.player.hp <= 0) return;
    if (e.hp > 0 && e.aim !== null) {
      ENEMIES[e.kind].release?.(s, e, events);
      released.add(e.id);
    }
  }
  // 2. Every enemy that didn't just fire or charge acts, in id order.
  for (const e of s.enemies) {
    if (e.hp <= 0 || released.has(e.id)) continue;
    if (s.player.hp <= 0) break;
    if (e.staggered) {
      e.staggered = false;
      continue;
    }
    ENEMIES[e.kind].act(s, e, events);
  }
}

function descend(s: GameState, events: GameEvent[]): void {
  const cleared = s.enemies.every((e) => e.hp <= 0);
  const healed = cleared && s.player.hp < s.player.maxHp;
  if (healed) s.player.hp++;
  enterFloor(s, s.depth + 1);
  events.push({ type: 'descend', depth: s.depth, healed });
}
