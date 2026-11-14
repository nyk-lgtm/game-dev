// Build-phase actions: shop rolls, buying, moving, selling, merging, and the
// flow between waves.

import { Rng, mixSeed } from '../../shared/rng';
import { WAVES, newBattle, stepBattle } from './battle';
import { CASTERS, MODS, RUNES } from './runes';
import type { GameState, Rune, Slot } from './types';

export const SHOP_SIZE = 5;
export const BENCH_SIZE = 6;
export const REROLL_COST = 1;
/** Rerolls get dearer within a build phase: 1, 1, 2, 2, 3, ... (back to 1 each wave). */
export const rerollCost = (s: GameState): number => REROLL_COST + Math.floor(s.waveRerolls / 2);
export const START_GOLD = 9;

export function newGame(seed: number, asc = 0): GameState {
  const s: GameState = {
    seed,
    asc,
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
    waveRerolls: 0,
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

/**
 * Three identical runes (same id and tier) merge into one of the next tier,
 * which lands where the first of them sits (loom rows first, then the bench).
 * `fresh`: only sets that include one of these slots merge (the runes an action
 * just placed), so a set the player chose to keep unmerged stays put.
 */
export function mergeAll(s: GameState, fresh?: Slot[]): Rune[] {
  const made: Rune[] = [];
  const hot = fresh && [...fresh];
  const key = (at: Slot) => (at.area === 'loom' ? `L${at.row}${at.col}` : `b${(at as { i: number }).i}`);
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
    let trio: Slot[] | undefined;
    for (const g of groups.values()) {
      if (g.length < 3) continue;
      if (!hot) {
        trio = g.slice(0, 3);
        break;
      }
      const h = g.find((at) => hot.some((f) => key(f) === key(at)));
      if (!h) continue;
      // The fresh rune plus the first two others, in board order.
      trio = [h, ...g.filter((at) => at !== h).slice(0, 2)].sort((a, b) => g.indexOf(a) - g.indexOf(b));
      break;
    }
    if (!trio) break;
    const first = trio[0];
    const r = get(s, first)!;
    for (const at of trio) set(s, at, null);
    const up: Rune = { id: r.id, tier: (r.tier + 1) as 2 | 3 };
    set(s, first, up);
    made.push(up);
    // The new rune may complete a set of its own tier.
    hot?.push(first);
  }
  return made;
}

export function freeBench(s: GameState): number {
  return s.bench.findIndex((r) => r === null);
}

/** Buy a shop rune into `to` (or the first free bench slot). `keep`: don't merge it. */
export function buy(s: GameState, shopIndex: number, to?: Slot, keep = false): Rune[] | null {
  const o = s.shop[shopIndex];
  if (!o || o.sold || s.phase !== 'build' || s.gold < price(o.rune)) return null;
  let dest: Slot | undefined = to;
  if (dest && (get(s, dest) || !fits(o.rune, dest))) dest = undefined;
  if (!dest) {
    // Auto-place (rules v4): the bench first, so a buy never changes a spell
    // behind your back; with the bench full, an empty loom slot it fits.
    const caster = RUNES[o.rune.id].kind === 'caster';
    const row = s.loom.findIndex((r) => (caster ? !r[0] : r[0] && r.slice(1).some((x) => !x)));
    const i = freeBench(s);
    if (i >= 0) dest = { area: 'bench', i };
    else if (row >= 0) dest = { area: 'loom', row, col: caster ? 0 : s.loom[row].findIndex((x, c) => c > 0 && !x) };
    else {
      // No room anywhere: still allowed if it completes a three-of-a-kind,
      // since the merge frees the space at once.
      const k = `${o.rune.id}:${o.rune.tier}`;
      const owned = [...s.loom.flat(), ...s.bench].filter((r) => r && `${r.id}:${r.tier}` === k).length;
      if (keep || owned < 2 || o.rune.tier >= 3) return null;
      s.gold -= price(o.rune);
      o.sold = true;
      s.bench.push({ ...o.rune });
      const made = mergeAll(s, [{ area: 'bench', i: BENCH_SIZE }]);
      s.bench = s.bench.slice(0, BENCH_SIZE);
      return made;
    }
  }
  s.gold -= price(o.rune);
  o.sold = true;
  set(s, dest, { ...o.rune });
  return keep ? [] : mergeAll(s, [dest]);
}

/** Move (or swap) runes between loom and bench. Returns false if not allowed. `keep`: don't merge. */
export function move(s: GameState, from: Slot, to: Slot, keep = false): boolean {
  if (s.phase !== 'build' || from.area === 'shop' || to.area === 'shop') return false;
  const a = get(s, from);
  const b = get(s, to);
  if (!a) return false;
  if (!fits(a, to) || (b && !fits(b, from))) return false;
  set(s, to, a);
  set(s, from, b);
  if (!keep) mergeAll(s, [from, to]);
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
  const cost = rerollCost(s);
  if (s.phase !== 'build' || s.gold < cost) return false;
  s.gold -= cost;
  s.rerolls++;
  s.waveRerolls++;
  rollShop(s);
  return true;
}

/** Gold to raise a rune one tier in place (dearer than finding the copies). */
export function empowerCost(r: Rune): number {
  return RUNES[r.id].cost * (r.tier === 1 ? 4 : 10);
}

/** Empower: pay to raise a loom or bench rune one tier. `keep`: don't merge it. */
export function empower(s: GameState, at: Slot, keep = false): boolean {
  const r = get(s, at);
  if (!r || at.area === 'shop' || s.phase !== 'build' || r.tier >= 3 || s.gold < empowerCost(r)) return false;
  s.gold -= empowerCost(r);
  set(s, at, { id: r.id, tier: (r.tier + 1) as 2 | 3 });
  if (!keep) mergeAll(s, [at]);
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

/** Most bounty (gold dropped by slain foes, Gild aside) a wave pays out. */
export const bountyCap = (wave: number): number => 6 + Math.floor(wave / 2);

/** Interest: +1 gold per 5 banked, up to +3. Bounty is capped; Gild's gold isn't. */
export function income(s: GameState, earned: number, gilded = 0): number {
  return 5 + Math.floor(s.wave / 3) + Math.min(3, Math.floor(s.gold / 5)) + Math.min(bountyCap(s.wave), earned) + gilded;
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
  s.gold += income(s, b.goldEarned, b.gilded);
  s.wave++;
  s.waveRerolls = 0;
  s.phase = 'build';
  if (!s.frozen) rollShop(s);
  s.frozen = false;
}
