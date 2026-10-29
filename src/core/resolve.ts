// The heart of the game: apply one player action and run the enemy phase.
// Pure: never mutates its input, returns the next state plus a list of
// events that the renderer turns into animation.

import { enemyAt, legalMoves, tileAt } from './board';
import { ENEMIES, fireShot } from './enemies';
import { DIRS, add, dirIndex, eq, isAdjacent, type Hex } from './hex';
import { enterFloor } from './levelgen';
import { PLAYER_ID, type Action, type Enemy, type GameEvent, type GameState, type StepResult } from './types';

export const STAB_DAMAGE = 1;
export const LUNGE_DAMAGE = 2;

export function isLegal(s: GameState, a: Action): boolean {
  if (s.status !== 'playing') return false;
  const moves = legalMoves(s);
  if (a.type === 'wait') return moves.length === 0;
  return moves.some((h) => eq(h, a.to));
}

export function applyAction(prev: GameState, a: Action): StepResult {
  if (!isLegal(prev, a)) throw new Error(`illegal action ${JSON.stringify(a)}`);
  const s: GameState = structuredClone(prev);
  const events: GameEvent[] = [];
  s.turn++;

  if (a.type === 'move') {
    playerMove(s, a.to, events);
    if (tileAt(s, s.player.pos) === 'stairs') {
      descend(s, events);
      return { state: s, events };
    }
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

function hit(s: GameState, e: Enemy, amount: number, kind: 'stab' | 'lunge', events: GameEvent[]): void {
  events.push({ type: 'attack', kind, by: PLAYER_ID, target: e.id });
  e.hp = Math.max(0, e.hp - amount);
  events.push({ type: 'damage', target: e.id, amount, hp: e.hp });
  if (e.hp === 0) {
    events.push({ type: 'death', target: e.id });
    s.kills++;
  } else {
    e.staggered = true;
    e.aim = null;
    events.push({ type: 'stagger', target: e.id });
  }
}

function playerMove(s: GameState, to: Hex, events: GameEvent[]): void {
  const from = s.player.pos;
  const dir = dirIndex(from, to);
  s.player.pos = to;
  s.player.facing = dir;
  events.push({ type: 'playerMove', from, to });

  // Lunge: an enemy directly ahead in the direction of travel.
  const ahead = add(to, DIRS[dir]);
  const lungeTarget = enemyAt(s, ahead);
  // Stab: enemies adjacent to both the start and end hex.
  const stabTargets = s.enemies.filter(
    (e) => e.hp > 0 && isAdjacent(e.pos, from) && isAdjacent(e.pos, to),
  );
  if (lungeTarget) hit(s, lungeTarget, LUNGE_DAMAGE, 'lunge', events);
  for (const e of stabTargets) hit(s, e, STAB_DAMAGE, 'stab', events);
}

function enemyPhase(s: GameState, events: GameEvent[]): void {
  // 1. Readied shots fire, in id order, at whatever stands in the line now.
  for (const e of s.enemies) {
    if (e.hp > 0 && e.aim !== null) fireShot(s, e, events);
  }
  // 2. Every enemy acts, in id order.
  for (const e of s.enemies) {
    if (e.hp <= 0) continue;
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
