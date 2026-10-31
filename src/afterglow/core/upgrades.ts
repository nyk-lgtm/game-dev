// Level-up choices, applying them, chests and evolutions.

import { MAX_PASSIVES, MAX_WEAPONS, PASSIVES } from './content';
import { BASE_WEAPONS, WEAPONS } from './weapons';
import type { Choice, PassiveId, WeaponId, World } from './types';

export function recomputeStats(w: World): void {
  const before = w.stats?.maxHp ?? w.base.maxHp;
  const s = { ...w.base };
  for (const [id, lvl] of Object.entries(w.passives) as [PassiveId, number][]) PASSIVES[id].apply(s, lvl);
  w.stats = s;
  // Max health gains heal you by the same amount.
  if (s.maxHp > before) w.player.hp += s.maxHp - before;
  w.player.hp = Math.min(w.player.hp, s.maxHp);
}

const key = (c: Choice) => `${c.kind}:${c.id}`;

/** Every upgrade you could be offered right now, with weights. */
export function upgradePool(w: World): { c: Choice; weight: number }[] {
  const pool: { c: Choice; weight: number }[] = [];
  const owned = new Set(w.weapons.map((ws) => ws.id));
  for (const ws of w.weapons) {
    const def = WEAPONS[ws.id];
    if (ws.level < def.maxLevel) pool.push({ c: { kind: 'weapon', id: ws.id, level: ws.level + 1 }, weight: 3 });
  }
  if (w.weapons.length < MAX_WEAPONS) {
    for (const id of BASE_WEAPONS) {
      const evolvedOwned = w.weapons.some((ws) => WEAPONS[ws.id].from === id);
      if (!owned.has(id) && !evolvedOwned) pool.push({ c: { kind: 'weapon', id, level: 1 }, weight: 2 });
    }
  }
  const nPassives = Object.keys(w.passives).length;
  for (const id of Object.keys(PASSIVES) as PassiveId[]) {
    const lvl = w.passives[id] ?? 0;
    if (lvl > 0 && lvl < PASSIVES[id].maxLevel) pool.push({ c: { kind: 'passive', id, level: lvl + 1 }, weight: 2.5 });
    else if (lvl === 0 && nPassives < MAX_PASSIVES) pool.push({ c: { kind: 'passive', id, level: 1 }, weight: 1.8 });
  }
  return pool.filter((p) => !w.banished.includes(key(p.c)));
}

function weightedPick<T extends { weight: number }>(w: World, items: T[]): T {
  const total = items.reduce((s, i) => s + i.weight, 0);
  let r = w.rng.next() * total;
  for (const it of items) {
    r -= it.weight;
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}

export function rollChoices(w: World, n = 3): Choice[] {
  let pool = upgradePool(w);
  const out: Choice[] = [];
  // Early on, make sure a new weapon is on offer so builds take shape.
  if (w.weapons.length < 3 && w.player.level <= 6) {
    const fresh = pool.filter((p) => p.c.kind === 'weapon' && p.c.level === 1);
    if (fresh.length) {
      const f = weightedPick(w, fresh);
      out.push(f.c);
      pool = pool.filter((p) => p !== f);
    }
  }
  while (out.length < n && pool.length) {
    const p = weightedPick(w, pool);
    out.push(p.c);
    pool = pool.filter((q) => q !== p);
  }
  if (out.length === 0) out.push({ kind: 'gold', id: 'gold', level: 1 });
  // Shuffle so the guaranteed weapon isn't always first.
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(w.rng.next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function applyChoice(w: World, c: Choice): void {
  if (c.kind === 'gold') {
    w.player.hp = Math.min(w.stats.maxHp, w.player.hp + 30);
    w.shards += 5;
    return;
  }
  if (c.kind === 'weapon') {
    const id = c.id as WeaponId;
    const ws = w.weapons.find((x) => x.id === id);
    if (ws) ws.level = Math.min(WEAPONS[id].maxLevel, ws.level + 1);
    else w.weapons.push({ id, level: 1, cd: 0, t: 0, dealt: 0 });
    return;
  }
  const id = c.id as PassiveId;
  w.passives[id] = Math.min(PASSIVES[id].maxLevel, (w.passives[id] ?? 0) + 1);
  recomputeStats(w);
}

/** Weapons ready to evolve: max level and holding their passive. */
export function evolvable(w: World): WeaponId[] {
  return w.weapons
    .filter((ws) => {
      const d = WEAPONS[ws.id];
      return d.evolvesInto && ws.level >= d.maxLevel && (w.passives[d.evolvesWith!] ?? 0) > 0;
    })
    .map((ws) => ws.id);
}

/** Open a chest: 1, 3 or (rarely) 5 rewards. Evolutions come first. */
export function openChest(w: World): Choice[] {
  const r = w.rng.next();
  const n = r < 0.06 ? 5 : r < 0.3 ? 3 : 1;
  const got: Choice[] = [];
  for (let i = 0; i < n; i++) {
    const ev = evolvable(w)[0];
    if (ev) {
      const into = WEAPONS[ev].evolvesInto!;
      const ws = w.weapons.find((x) => x.id === ev)!;
      ws.id = into;
      ws.level = 1;
      ws.cd = 0;
      ws.t = 0;
      got.push({ kind: 'weapon', id: into, level: 1, evolves: ev });
      continue;
    }
    // Chests only upgrade what you already have.
    const pool = upgradePool(w).filter((p) => p.c.level > 1);
    const c = pool.length ? weightedPick(w, pool).c : ({ kind: 'gold', id: 'gold', level: 1 } as Choice);
    applyChoice(w, c);
    got.push(c);
  }
  return got;
}

export const choiceKey = key;
