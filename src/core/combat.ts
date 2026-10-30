// Shared combat primitives: damage, daze, shields and shoves. Used by both
// player actions (resolve.ts) and enemy behaviors (enemies.ts).

import { tileAt, unitAt } from './board';
import { DIRS, add, eq, type Hex } from './hex';
import { PLAYER_ID, type Enemy, type GameEvent, type GameState } from './types';

/** Deal damage to a unit by id. Deaths are recorded and counted. */
export function damageUnit(s: GameState, target: number, amount: number, events: GameEvent[]): void {
  if (target === PLAYER_ID) {
    s.player.hp = Math.max(0, s.player.hp - amount);
    events.push({ type: 'damage', target, amount, hp: s.player.hp });
    return;
  }
  const e = s.enemies.find((x) => x.id === target && x.hp > 0);
  if (!e) return;
  e.hp = Math.max(0, e.hp - amount);
  events.push({ type: 'damage', target, amount, hp: e.hp });
  if (e.hp === 0) {
    events.push({ type: 'death', target });
    s.kills++;
  }
}

export function stagger(e: Enemy, events: GameEvent[]): void {
  if (e.hp <= 0) return;
  e.staggered = true;
  e.aim = null;
  events.push({ type: 'stagger', target: e.id });
}

/** The three hexes a unit faces (its facing direction and the two either side). */
export function frontArc(e: Enemy): Hex[] {
  return [5, 0, 1].map((k) => add(e.pos, DIRS[(e.facing + k) % 6]));
}

/** True if an attack arriving from adjacent hex `from` is stopped by a shield. */
export function shieldBlocks(e: Enemy, from: Hex): boolean {
  return e.kind === 'guard' && frontArc(e).some((h) => eq(h, from));
}

/**
 * Shove an enemy one hex in `dir`. Into lava: it falls and dies. Into a
 * wall, the stairs, the board edge or another unit: both take 1 damage.
 * A survivor is dazed either way.
 */
export function shove(s: GameState, e: Enemy, dir: number, events: GameEvent[]): void {
  const to = add(e.pos, DIRS[dir]);
  const t = tileAt(s, to);
  const other = unitAt(s, to);
  if (other === null && (t === 'floor' || t === 'lava')) {
    events.push({ type: 'push', id: e.id, from: e.pos, to });
    e.pos = to;
    if (t === 'lava') {
      events.push({ type: 'fall', id: e.id });
      damageUnit(s, e.id, e.hp, events);
      return;
    }
  } else {
    events.push({ type: 'slam', id: e.id, into: other, at: to });
    damageUnit(s, e.id, 1, events);
    if (other !== null) damageUnit(s, other, 1, events);
  }
  stagger(e, events);
}
