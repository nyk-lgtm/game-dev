// A Kitbag bot: for each placement it searches every way to spend the dice it has
// this turn (rerolls count as an average roll: it never peeks at the result),
// scores the end of the turn against the enemy's telegraphed intent (damage,
// hits it would take, kills, poison, stuns) and plays the first step of the
// best plan, then plans again. Rewards and map nodes use simple value tables.

import {
  MAX_GEAR,
  attackOf,
  diceFor,
  intentOf,
  nextIntentOf,
  meets,
  needsReplace,
  slotsOf,
  type Gear,
  type GearId,
  type Gift,
  type Option,
  type Run,
  type SlotDef,
} from '../../src/kitbag/core';

/** How much the bot likes each card (and its upgrade). */
export const GEAR_VALUE: Record<GearId, number> = {
  sword: 6, buckler: 5, dagger: 5, axe: 6, ward: 5, sling: 4, coin: 4, whet: 4, spiked: 6,
  maul: 7, tower: 6, spear: 7, fang: 6, hourglass: 5, chisel: 5, salve: 5,
  twin: 7, net: 6, keg: 8,
};

interface PDie {
  v: number;
  /** Pool index, or -1 for a die that only exists after a transform in the plan. */
  pi: number;
  /** Mean of the source die (for rerolls). */
  mean: number;
}
interface PSlot {
  card: number;
  slot: number;
  def: SlotDef;
  left: number;
  /** Value of a die already waiting in this two-dice slot (0 = none). */
  held: number;
  fuse: number;
}
interface Acc {
  dmg: number;
  pierce: number;
  block: number;
  heal: number;
  poison: number;
  stun: boolean;
}
interface Step {
  pi: number;
  card: number;
  slot: number;
}

export function planTurn(r: Run, budget = 12000): { steps: Step[]; value: number } {
  const f = r.fight!;
  const e = f.enemy;
  const it = intentOf(e);
  // While it winds up, block braces for the blow (it carries over), so plan against that.
  const incoming = it.charge && !e.stunned ? attackOf(e, nextIntentOf(e)) : attackOf(e, it);
  const dice: PDie[] = [];
  f.pool.forEach((p, pi) => {
    if (p.used || p.locked) return;
    const d = r.dice[p.src];
    const mean = d ? d.faces.reduce((a, b) => a + b, 0) / d.faces.length : 3.5;
    dice.push({ v: p.v, pi, mean });
  });
  const slots: PSlot[] = [];
  r.gear.forEach((g: Gear, card) =>
    slotsOf(g).forEach((def, slot) => {
      const st = f.slots[card][slot];
      let left = def.uses ? def.uses - st.used : 99;
      if (def.perFight) left = Math.min(left, def.perFight - st.fight);
      if (left <= 0) return;
      slots.push({ card, slot, def, left, held: st.held >= 0 ? f.pool[st.held].v : 0, fuse: st.fuse });
    }),
  );
  const missing = r.maxHp - r.hp;
  const score = (a: Acc, kegBoom: number, kegPart: number): number => {
    const hpLoss = Math.min(e.hp, Math.max(0, a.dmg - e.block) + a.pierce + kegBoom);
    const left = e.hp - hpLoss;
    const poisonNow = e.poison + a.poison;
    if (left <= 0 || poisonNow >= left) return 10000 + r.hp + Math.min(a.heal, missing) * 0.5 - a.dmg * 0.001;
    const hit = a.stun ? 0 : incoming;
    const taken = Math.max(0, hit - a.block - Math.max(0, a.heal - missing));
    // Your poison (and any the enemy adds) ticks before your next turn too.
    const tick = r.poison + (a.stun ? 0 : (it.poison ?? 0));
    let v = hpLoss * 1.0;
    // Poison keeps ticking (n + n-1 + …) until the enemy dies.
    v += Math.min(left, (poisonNow * (poisonNow + 1)) / 2 - (e.poison * (e.poison + 1)) / 2) * 0.55;
    v += kegPart * 0.6;
    v += Math.min(a.heal, missing) * 0.9;
    v -= taken * (r.hp - taken - tick <= 10 ? 1.8 : 1.3);
    if (taken + tick >= r.hp) v -= 5000;
    if (a.stun && !incoming) v -= 2;
    return v;
  };
  let best = { steps: [] as Step[], value: -Infinity };
  let nodes = 0;
  const steps: Step[] = [];
  const acc: Acc = { dmg: 0, pierce: 0, block: 0, heal: 0, poison: 0, stun: false };

  const fire = (s: PSlot, x: number, back: number[], mean: number) => {
    const d = s.def;
    const amt = Math.floor(d.mult * x) + d.add;
    switch (d.fx) {
      case 'dmg': acc.dmg += amt; break;
      case 'pierce': acc.pierce += amt; break;
      case 'block': acc.block += amt; break;
      case 'spike': acc.block += d.mult * x; acc.dmg += d.add; break;
      case 'heal': acc.heal += amt; break;
      case 'poison': acc.poison += Math.ceil(d.mult * x) + d.add; break;
      case 'stun': acc.stun = true; break;
      case 'reroll': back.push(Math.round(mean + 0.3)); break;
      case 'split': back.push(Math.floor(x / 2), Math.ceil(x / 2)); break;
      case 'flip': back.push(Math.min(6, Math.max(1, 7 - x))); break;
      case 'bump': back.push(Math.min(9, x + d.add)); break;
      case 'keg': break;
    }
  };

  const dfs = (pool: PDie[], kegBoom: number, kegPart: number) => {
    nodes++;
    // Waiting two-dice slots must be finished or their die is lost.
    const v = score(acc, kegBoom, kegPart);
    if (v > best.value) best = { steps: steps.slice(), value: v };
    if (nodes > budget || !pool.length) return;
    const [d, ...rest] = pool;
    // Skip this die.
    dfs(rest, kegBoom, kegPart);
    for (const s of slots) {
      if (s.left <= 0 || !meets(s.def.need, d.v)) continue;
      if (s.def.fx === 'split' && d.v < 2) continue;
      if (s.def.fx === 'reroll' && d.v >= d.mean + 1) continue;
      if (s.def.fx === 'flip' && d.v >= 4) continue;
      const two = diceFor(s.def.need) === 2;
      const save = { ...acc };
      if (two && !s.held) {
        // Pick a partner from the rest.
        for (let j = 0; j < rest.length; j++) {
          const q = rest[j];
          if (s.def.need === 'pair' && q.v !== d.v) continue;
          s.left--;
          fire(s, d.v + q.v, [], 3.5);
          steps.push({ pi: d.pi, card: s.card, slot: s.slot }, { pi: q.pi, card: s.card, slot: s.slot });
          dfs(rest.filter((_, k) => k !== j), kegBoom, kegPart);
          steps.length -= 2;
          Object.assign(acc, save);
          s.left++;
          if (nodes > budget) return;
        }
        continue;
      }
      if (two && s.held && s.def.need === 'pair' && s.held !== d.v) continue;
      const x = d.v + (two ? s.held : 0);
      const heldWas = s.held;
      s.held = 0;
      s.left--;
      const back: number[] = [];
      let kb = kegBoom, kp = kegPart;
      const fuseWas = s.fuse;
      if (s.def.fx === 'keg') {
        s.fuse += x;
        if (s.fuse >= s.def.fuse!) {
          s.fuse = 0;
          kb += s.def.add;
          kp -= (fuseWas / s.def.fuse!) * s.def.add;
        } else kp += (x / s.def.fuse!) * s.def.add;
      }
      fire(s, x, back, d.mean);
      steps.push({ pi: d.pi, card: s.card, slot: s.slot });
      dfs([...rest, ...back.map((b) => ({ v: b, pi: -1, mean: 3.5 }))], kb, kp);
      steps.pop();
      Object.assign(acc, save);
      s.left++;
      s.held = heldWas;
      s.fuse = fuseWas;
      if (nodes > budget) return;
    }
  };
  // Biggest dice first: they matter most, so they get the full search.
  dice.sort((a, b) => b.v - a.v);
  dfs(dice, 0, 0);
  return best;
}

function giftValue(r: Run, g: Gift): number {
  switch (g.t) {
    case 'gear': {
      const v = GEAR_VALUE[g.id];
      if (r.gear.length < MAX_GEAR) return v + 2;
      const worst = Math.min(...r.gear.map((x) => GEAR_VALUE[x.id] + (x.up ? 2 : 0)));
      return v - worst;
    }
    case 'up':
      return 3.5 + GEAR_VALUE[r.gear[g.card].id] * 0.2;
    case 'die': {
      const low = r.gear.some((x) => x.id === 'dagger' || x.id === 'sling');
      const base = { d6: 6, d8: 7, loaded: 8, even: 6, pebble: low ? 6 : 3, chance: 5 }[g.kind];
      return base + (r.dice.length < 4 ? 3 : 0);
    }
    case 'hone':
      return 3;
    case 'heal':
      return Math.min(g.n, r.maxHp - r.hp) * 0.45;
    case 'maxhp':
      return 4;
  }
}

export function optionValue(r: Run, o: Option): number {
  const hpLow = r.hp < r.maxHp * 0.5;
  return o.gifts.reduce((a, g) => a + giftValue(r, g), 0) - o.cost * (hpLow ? 1 : 0.5);
}

/** The gear card to throw out for a new one. */
const worstCard = (r: Run): number =>
  r.gear.reduce((b, g, i) => (GEAR_VALUE[g.id] + (g.up ? 2 : 0) < GEAR_VALUE[r.gear[b].id] + (r.gear[b].up ? 2 : 0) ? i : b), 0);

export function botAction(r: Run): string {
  if (r.phase === 'map') {
    const row = r.map[r.floor];
    const frac = r.hp / r.maxHp;
    const val = row.map((n) => {
      switch (n.kind) {
        case 'rest':
          return frac < 0.6 ? 10 : 2;
        case 'elite':
          return frac > 0.75 ? 6 : frac > 0.55 ? 3 : -4;
        case 'shrine':
          return 3;
        default:
          return 4;
      }
    });
    return `M${val[1] !== undefined && val[1] > val[0] ? 1 : 0}`;
  }
  if (r.phase === 'choice') {
    const c = r.choice!;
    let bi = -1;
    let bv = c.kind === 'reward' ? 0.5 : -Infinity;
    c.options.forEach((o, i) => {
      if (o.cost >= r.hp) return;
      const v = optionValue(r, o);
      if (v > bv) {
        bv = v;
        bi = i;
      }
    });
    if (bi < 0) return c.kind === 'reward' ? 'S' : 'C0';
    return `C${bi}${needsReplace(r, c.options[bi]) ? `.${worstCard(r)}` : ''}`;
  }
  // Fight.
  const plan = planTurn(r);
  const s = plan.steps[0];
  if (!s) return 'E';
  return `P${s.pi}.${s.card}.${s.slot}`;
}
