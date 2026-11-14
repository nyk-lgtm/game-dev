// Rune definitions and the spell compiler: a loom row, read left to right,
// becomes one Spell.

import type { CasterId, Element, ModId, Rune, RuneId, Spell } from './types';

export interface RuneDef {
  id: RuneId;
  name: string;
  kind: 'caster' | 'mod';
  cost: number;
  hue: number;
  /** One-line rules text (per tier where it matters). */
  text: (tier: number) => string;
  /** The numbers that change with the tier, short ("burn 30%/s"). */
  stat: (tier: number) => string;
}

export const TIER_MULT = [0, 1, 1.8, 3.2];

/** Modifier numbers by tier t (1..3); compileRow and the rules text share them. */
export const MOD = {
  fireDmg: 1.1,
  /** Burn per second as a fraction of each finished hit, for 3s (where Fire sits doesn't matter). */
  fireBurn: (t: number) => 0.1 + 0.1 * t,
  frostSlow: (t: number) => 0.1 + 0.1 * t,
  /** Arcs per cast; a tier-II rune is always worth at least two tier-I runes stacked (merges never lose power). */
  stormArcs: (t: number) => 2 * t,
  /** Arc damage as a fraction of the hit. */
  stormDmg: 0.8,
  /** Split's total damage gain, shared among the old and new projectiles. */
  splitGain: (t: number) => 1.35 ** t,
  /** How much wider a Split makes a Nova's blast, per extra count (Novas don't share their damage out). */
  novaWiden: 0.35,
  /** Share of a Nova's damage that reaches flyers inside its ring (rules v5; 0 = they fly over it). */
  novaAir: 0.5,
  heavyDmg: (t: number) => 1.5 + 0.3 * (t - 1),
  heavyCd: 1.3,
  pierceThrough: (t: number) => t,
  pierceShred: (t: number) => 5 * t,
  pierceDmg: (t: number) => 1.1 ** t,
  hasteCd: (t: number) => 0.75 ** t,
  leech: (t: number) => 0.15 * t,
  gild: (t: number) => 0.1 * t,
  echoCd: (t: number) => 1.35 - 0.1 * (t - 1),
};

const pct = (x: number) => Math.round(x * 100);

const BASE: Record<CasterId, Omit<Spell, 'caster' | 'echoes'>> = {
  bolt: { element: 'arcane', dmg: 15, count: 1, pierce: 1, shred: 0, chain: 0, slow: 0, burn: 0, area: 0.04, cooldown: 1.0, leech: 0, gild: 0 },
  beam: { element: 'arcane', dmg: 17, count: 1, pierce: 99, shred: 0, chain: 0, slow: 0, burn: 0, area: 0.045, cooldown: 2.2, leech: 0, gild: 0 },
  nova: { element: 'arcane', dmg: 30, count: 1, pierce: 99, shred: 0, chain: 0, slow: 0, burn: 0, area: 0.4, cooldown: 1.8, leech: 0, gild: 0 },
  rain: { element: 'arcane', dmg: 11, count: 3, pierce: 1, shred: 0, chain: 0, slow: 0, burn: 0, area: 0.07, cooldown: 2.2, leech: 0, gild: 0 },
  orb: { element: 'arcane', dmg: 14, count: 1, pierce: 5, shred: 0, chain: 0, slow: 0, burn: 0, area: 0.05, cooldown: 2.2, leech: 0, gild: 0 },
};

/** Base stats of a caster rune (tier 1). */
export const casterBase = (id: CasterId): Readonly<Omit<Spell, 'caster' | 'echoes'>> => BASE[id];

const caster = (id: CasterId, name: string, hue: number, text: (dmg: number, cd: number) => string): RuneDef => ({
  id,
  name,
  kind: 'caster',
  cost: 3,
  hue,
  text: (t) => `${text(Math.round(BASE[id].dmg * TIER_MULT[t]), BASE[id].cooldown)} Arcane unless a Fire, Frost or Storm rune follows.`,
  stat: (t) => `${Math.round(BASE[id].dmg * TIER_MULT[t])} dmg`,
});
const mod = (id: ModId, name: string, hue: number, text: (t: number) => string, stat: (t: number) => string): RuneDef => ({ id, name, kind: 'mod', cost: 2, hue, text, stat });

export const RUNES: Record<RuneId, RuneDef> = {
  bolt: caster('bolt', 'Bolt', 200, (d, cd) => `Fires a bolt at the nearest foe (${d} dmg, every ${cd}s).`),
  beam: caster('beam', 'Beam', 50, (d, cd) => `A beam pierces a whole column (${d} dmg, every ${cd}s).`),
  nova: caster('nova', 'Nova', 280, (d, cd) => `Blasts every foe near the tower (${d} dmg, every ${cd}s; flyers take ${Math.round(MOD.novaAir * 100)}%); waits for foes in reach.`),
  rain: caster('rain', 'Rain', 160, (d, cd) => `${BASE.rain.count} strikes on random foes (${d} dmg, small splash, every ${cd}s).`),
  orb: caster('orb', 'Orb', 320, (d, cd) => `A slow homing orb passing through ${BASE.orb.pierce} foes (${d} dmg, every ${cd}s).`),
  fire: mod('fire', 'Fire', 15, (t) => `+${pct(MOD.fireDmg - 1)}% damage, then burns for ${pct(MOD.fireBurn(t))}% of the hit per second for 3s. Element: fire.`, (t) => `burn ${pct(MOD.fireBurn(t))}%/s`),
  frost: mod('frost', 'Frost', 195, (t) => `Slows by ${pct(MOD.frostSlow(t))}% for 1.5s. Element: frost.`, (t) => `slow ${pct(MOD.frostSlow(t))}%`),
  storm: mod('storm', 'Storm', 55, (t) => `Each cast arcs to ${MOD.stormArcs(t)} more foes at ${pct(MOD.stormDmg)}%. Element: storm.`, (t) => `${MOD.stormArcs(t)} arcs`),
  split: mod(
    'split',
    'Split',
    300,
    (t) => `+${t} bolt, orb, strike or beam, with +${pct(MOD.splitGain(t) - 1)}% total damage shared among them (a lone foe takes every beam). On a Nova: a ${pct(MOD.novaWiden * t)}% wider blast instead.`,
    (t) => `+${t}, +${pct(MOD.splitGain(t) - 1)}% dmg`,
  ),
  heavy: mod('heavy', 'Heavy', 30, (t) => `+${pct(MOD.heavyDmg(t) - 1)}% damage, bigger, but ${pct(MOD.heavyCd - 1)}% slower.`, (t) => `+${pct(MOD.heavyDmg(t) - 1)}% dmg`),
  pierce: mod('pierce', 'Pierce', 90, (t) => `+${pct(MOD.pierceDmg(t) - 1)}% damage, hits ignore ${MOD.pierceShred(t)} armor; bolts and orbs pass through ${MOD.pierceThrough(t)} more foes.`, (t) => `−${MOD.pierceShred(t)} armor, +${MOD.pierceThrough(t)} foes`),
  haste: mod('haste', 'Haste', 110, (t) => `Casts ${pct(1 / MOD.hasteCd(t) - 1)}% faster.`, (t) => `${pct(1 / MOD.hasteCd(t) - 1)}% faster`),
  leech: mod('leech', 'Leech', 340, (t) => `${pct(MOD.leech(t))}% chance a kill heals the tower 1.`, (t) => `${pct(MOD.leech(t))}% heal`),
  gild: mod('gild', 'Gild', 45, (t) => `${pct(MOD.gild(t))}% chance a kill drops +1 gold.`, (t) => `${pct(MOD.gild(t))}% +1●`),
  echo: mod('echo', 'Echo', 260, (t) => `Repeats the spell as built so far (runes to its left), but casts ${pct(MOD.echoCd(t) - 1)}% slower.`, (t) => `${pct(MOD.echoCd(t) - 1)}% slower`),
};

export const CASTERS: CasterId[] = ['bolt', 'beam', 'nova', 'rain', 'orb'];
export const MODS: ModId[] = ['fire', 'frost', 'storm', 'split', 'heavy', 'pierce', 'haste', 'leech', 'gild', 'echo'];

const clone = (s: Spell): Spell => ({ ...s, echoes: [] });

/** Compile a loom row. Returns null if the row has no caster in slot 0. */
export function compileRow(row: (Rune | null)[]): Spell | null {
  const c = row[0];
  if (!c || RUNES[c.id].kind !== 'caster') return null;
  const s: Spell = { caster: c.id as CasterId, ...BASE[c.id as CasterId], echoes: [] };
  s.dmg *= TIER_MULT[c.tier];
  for (let i = 1; i < row.length; i++) {
    const r = row[i];
    if (!r || RUNES[r.id].kind !== 'mod') continue;
    const t = r.tier;
    switch (r.id as ModId) {
      case 'fire':
        // While compiling, burn holds the fraction; it becomes damage per second
        // once the hit is finished (below), so Fire's place in the row doesn't
        // matter and split projectiles share the burn like they share the hit.
        // Burns don't stack: a second fire only keeps the hotter one.
        s.element = 'fire';
        s.dmg *= MOD.fireDmg;
        s.burn = Math.max(s.burn, MOD.fireBurn(t));
        break;
      case 'frost':
        s.element = 'frost';
        s.slow = Math.max(s.slow, MOD.frostSlow(t));
        break;
      case 'storm':
        s.element = 'storm';
        s.chain += MOD.stormArcs(t);
        break;
      case 'split':
        // A Nova's blast just grows (count sets its radius); the rest share the gain out.
        if (s.caster !== 'nova') s.dmg *= (MOD.splitGain(t) * s.count) / (s.count + t);
        s.count += t;
        break;
      case 'heavy':
        s.dmg *= MOD.heavyDmg(t);
        s.area *= 1.25;
        s.cooldown *= MOD.heavyCd;
        break;
      case 'pierce':
        s.pierce += MOD.pierceThrough(t);
        s.shred += MOD.pierceShred(t);
        s.dmg *= MOD.pierceDmg(t);
        break;
      case 'haste':
        s.cooldown *= MOD.hasteCd(t);
        break;
      case 'leech':
        s.leech += MOD.leech(t);
        break;
      case 'gild':
        s.gild += MOD.gild(t);
        break;
      case 'echo':
        // A copy of everything built so far fires again shortly after.
        s.echoes.push(clone(s));
        s.cooldown *= MOD.echoCd(t);
        break;
    }
  }
  for (const x of [s, ...s.echoes]) x.burn *= x.dmg;
  return s;
}

/**
 * A rough damage-per-second for comparing builds. `crowd`: in a typical wave
 * (extra targets count half: pierce, arcs, beams and blasts rarely hit a full
 * line of foes); otherwise against a single foe. `burn: false` leaves the burn
 * out (for foes fire can't hurt).
 */
export function spellDps(s: Spell, crowd = true, burn = true): number {
  return hitDps(s, crowd) + (burn ? burnDps(s, crowd) : 0);
}

/** Foes one cast hits directly (extra targets count half in a crowd). */
function castHits(s: Spell, crowd: boolean): number {
  const extra = (n: number) => (crowd ? 1 + 0.5 * Math.max(0, n - 1) : 1);
  if (s.caster === 'rain') return s.count;
  if (s.caster === 'bolt' || s.caster === 'orb') return s.count * extra(Math.min(s.pierce, 3));
  // Every beam lands (extra ones take the next foes' columns, or the same one).
  return s.caster === 'beam' ? s.count * extra(3) : extra(3);
}

/** The direct hits' (and arcs') share of spellDps. */
export function hitDps(s: Spell, crowd = true): number {
  const arcs = crowd ? s.count * s.chain * MOD.stormDmg * 0.5 : 0;
  return (s.dmg * (castHits(s, crowd) + arcs) * (1 + s.echoes.length * 0.8)) / s.cooldown;
}

/**
 * The burn's share. A burn lasts 3s and a new hit only renews it (burns don't
 * stack), so a foe hit every cooldown burns at most `burn` per second, and
 * echoes, hitting the same foes, add none. Arcs light more foes in a crowd.
 */
export function burnDps(s: Spell, crowd = true): number {
  const burn = [s, ...s.echoes].reduce((a, x) => Math.max(a, x.burn), 0);
  if (!burn) return 0;
  const lit = crowd ? castHits(s, true) + s.count * Math.min(s.chain, 2) * 0.5 : 1;
  return (burn * lit * Math.min(3, s.cooldown)) / s.cooldown;
}

export const ELEMENT_HUE: Record<Element, number> = { arcane: 270, fire: 18, frost: 195, storm: 55 };

export function runeKey(r: Rune): string {
  return `${r.id}:${r.tier}`;
}
