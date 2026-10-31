// Build-phase actions: shop rolls, buying, moving, selling, merging, and the
// flow between waves.

import { Rng, mixSeed } from '../../shared/rng';
import { WAVES, newBattle, stepBattle } from './battle';
import { CASTERS, MODS, RUNES } from './runes';
import type { GameState, Rune, Slot } from './types';

export const SHOP_SIZE = 5;
export const BENCH_SIZE = 6;
export const REROLL_COST = 1;
export const START_GOLD = 9;

export function newGame(seed: number): GameState {
  const s: GameState = {
    seed,
    wave: 1,
    gold: START_GOLD,
    hp: 20,
    maxHp: 20,
    loom: [
      [{ id: 'bolt', tier: 1 }, null, null, null],
      [null, null, null, null],
      [null, null, null, null],
    ],
    bench: new Array(BENCH_SIZE).fill(null),
    shop: [],
    rerolls: 0,
    rolls: 0,
    phase: 'build',
    battle: null,
    totalKills: 0,
    frozen: false,
  };
  rollShop(s);
  return s;
}

export function rollShop(s: GameState): void {
  const rng = new Rng(mixSeed(s.seed, 50_000 + s.rolls++));
  const tier2 = Math.max(0, (s.wave - 4) * 0.035);
  s.shop = [];
  for (let i = 0; i < SHOP_SIZE; i++) {
    // At least one caster on offer while you have empty rows to fill.
    const wantCaster = i === 0 && s.loom.some((row) => !row[0]);
    const caster = wantCaster || rng.next() < 0.28;
    const id = caster ? CASTERS[rng.int(0, CASTERS.length - 1)] : MODS[rng.int(0, MODS.length - 1)];
    s.shop.push({ rune: { id, tier: rng.next() < tier2 ? 2 : 1 }, sold: false });
  }
}

export function price(r: Rune): number {
  return RUNES[r.id].cost * (r.tier === 1 ? 1 : r.tier === 2 ? 3 : 8);
}

export function sellValue(r: Rune): number {
  return r.tier === 1 ? 1 : r.tier === 2 ? 4 : 10;
}

export function get(s: GameState, at: Slot): Rune | null {
  if (at.area === 'loom') return s.loom[at.row][at.col];
  if (at.area === 'bench') return s.bench[at.i];
  return s.shop[at.i]?.sold ? null : s.shop[at.i]?.rune ?? null;
}

function set(s: GameState, at: Slot, r: Rune | null): void {
  if (at.area === 'loom') s.loom[at.row][at.col] = r;
  else if (at.area === 'bench') s.bench[at.i] = r;
}

/** Can rune `r` sit in slot `at`? Loom slot 0 takes casters, the rest modifiers. */
export function fits(r: Rune, at: Slot): boolean {
  if (at.area === 'bench') return true;
  if (at.area !== 'loom') return false;
  return (at.col === 0) === (RUNES[r.id].kind === 'caster');
}

/** Three identical runes (same id and tier) merge into one of the next tier. */
export function mergeAll(s: GameState): Rune[] {
  const made: Rune[] = [];
  for (let guard = 0; guard < 10; guard++) {
    const spots: Slot[] = [];
    for (let row = 0; row < 3; row++) for (let col = 0; col < 4; col++) spots.push({ area: 'loom', row, col });
    for (let i = 0; i < s.bench.length; i++) spots.push({ area: 'bench', i });
    const groups = new Map<string, Slot[]>();
    for (const at of spots) {
      const r = get(s, at);
      if (!r || r.tier >= 3) continue;
      const k = `${r.id}:${r.tier}`;
      groups.set(k, [...(groups.get(k) ?? []), at]);
    }
    const trio = [...groups.values()].find((g) => g.length >= 3);
    if (!trio) break;
    const first = trio[0];
    const r = get(s, first)!;
    for (const at of trio.slice(0, 3)) set(s, at, null);
    const up: Rune = { id: r.id, tier: (r.tier + 1) as 2 | 3 };
    set(s, first, up);
    made.push(up);
  }
  return made;
}

export function freeBench(s: GameState): number {
  return s.bench.findIndex((r) => r === null);
}

/** Buy a shop rune into `to` (or the first free bench slot). */
export function buy(s: GameState, shopIndex: number, to?: Slot): Rune[] | null {
  const o = s.shop[shopIndex];
  if (!o || o.sold || s.phase !== 'build' || s.gold < price(o.rune)) return null;
  let dest: Slot | undefined = to;
  if (dest && (get(s, dest) || !fits(o.rune, dest))) dest = undefined;
  if (!dest) {
    // Auto-place: an empty loom slot it fits, else the bench.
    const caster = RUNES[o.rune.id].kind === 'caster';
    const row = s.loom.findIndex((r) => (caster ? !r[0] : r[0] && r.slice(1).some((x) => !x)));
    if (row >= 0) dest = { area: 'loom', row, col: caster ? 0 : s.loom[row].findIndex((x, c) => c > 0 && !x) };
    else {
      const i = freeBench(s);
      if (i < 0) {
        // No room on the bench: still allowed if it completes a three-of-a-kind,
        // since the merge frees the space at once.
        const k = `${o.rune.id}:${o.rune.tier}`;
        const owned = [...s.loom.flat(), ...s.bench].filter((r) => r && `${r.id}:${r.tier}` === k).length;
        if (owned < 2 || o.rune.tier >= 3) return null;
        s.gold -= price(o.rune);
        o.sold = true;
        s.bench.push({ ...o.rune });
        const made = mergeAll(s);
        s.bench = s.bench.slice(0, BENCH_SIZE);
        return made;
      }
      dest = { area: 'bench', i };
    }
  }
  s.gold -= price(o.rune);
  o.sold = true;
  set(s, dest, { ...o.rune });
  return mergeAll(s);
}

/** Move (or swap) runes between loom and bench. Returns false if not allowed. */
export function move(s: GameState, from: Slot, to: Slot): boolean {
  if (s.phase !== 'build' || from.area === 'shop' || to.area === 'shop') return false;
  const a = get(s, from);
  const b = get(s, to);
  if (!a) return false;
  if (!fits(a, to) || (b && !fits(b, from))) return false;
  set(s, to, a);
  set(s, from, b);
  mergeAll(s);
  return true;
}

export function sell(s: GameState, at: Slot): boolean {
  const r = get(s, at);
  if (!r || at.area === 'shop' || s.phase !== 'build') return false;
  set(s, at, null);
  s.gold += sellValue(r);
  return true;
}

export function reroll(s: GameState): boolean {
  if (s.phase !== 'build' || s.gold < REROLL_COST) return false;
  s.gold -= REROLL_COST;
  s.rerolls++;
  rollShop(s);
  return true;
}

/** Keep this shop for the next wave instead of a fresh roll. */
export function toggleFreeze(s: GameState): boolean {
  if (s.phase !== 'build') return false;
  s.frozen = !s.frozen;
  return true;
}

export function startBattle(s: GameState): boolean {
  if (s.phase !== 'build' || !s.loom.some((r) => r[0])) return false;
  s.phase = 'battle';
  s.battle = newBattle(s);
  return true;
}

/** Interest: +1 gold per 5 banked, up to +3. */
export function income(s: GameState, earned: number): number {
  return 5 + Math.floor(s.wave / 3) + Math.min(3, Math.floor(s.gold / 5)) + earned;
}

/** Advance the battle one step; on its end, pay out and move to the next wave. */
export function tick(s: GameState): void {
  const b = s.battle;
  if (s.phase !== 'battle' || !b) return;
  stepBattle(s, b);
  if (!b.over) return;
  s.totalKills += b.kills;
  if (s.hp <= 0) {
    s.hp = 0;
    s.phase = 'over';
    return;
  }
  if (s.wave >= WAVES) {
    s.phase = 'won';
    return;
  }
  s.gold += income(s, b.goldEarned);
  s.wave++;
  s.phase = 'build';
  if (!s.frozen) rollShop(s);
  s.frozen = false;
}
