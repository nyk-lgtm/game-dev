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
}

export const TIER_MULT = [0, 1, 1.8, 3.2];

/** Modifier numbers by tier t (1..3); compileRow and the rules text share them. */
export const MOD = {
  fireDmg: 1.1,
  /** Burn per second as a fraction of the hit (as built so far), for 3s. */
  fireBurn: (t: number) => 0.1 + 0.1 * t,
  frostSlow: (t: number) => 0.1 + 0.1 * t,
  stormArcs: (t: number) => 1 + t,
  /** Arc damage as a fraction of the hit. */
  stormDmg: 0.8,
  /** Split's total damage gain, shared among the old and new projectiles. */
  splitGain: (t: number) => 1.15 + 0.2 * t,
  heavyDmg: (t: number) => 1.5 + 0.3 * (t - 1),
  heavyCd: 1.3,
  pierceThrough: (t: number) => 1 + t,
  pierceShred: (t: number) => 5 * t,
  pierceDmg: 1.15,
  hasteCd: (t: number) => 0.75 - 0.07 * (t - 1),
  leech: (t: number) => 0.15 * t,
  gild: (t: number) => 0.1 * t,
  echoCd: (t: number) => 1.35 - 0.1 * (t - 1),
};

const pct = (x: number) => Math.round(x * 100);

const BASE: Record<CasterId, Omit<Spell, 'caster' | 'echoes'>> = {
  bolt: { element: 'arcane', dmg: 15, count: 1, pierce: 1, shred: 0, chain: 0, slow: 0, burn: 0, area: 0.04, cooldown: 1.0, leech: 0, gild: 0 },
  beam: { element: 'arcane', dmg: 11, count: 1, pierce: 99, shred: 0, chain: 0, slow: 0, burn: 0, area: 0.045, cooldown: 2.3, leech: 0, gild: 0 },
  nova: { element: 'arcane', dmg: 27, count: 1, pierce: 99, shred: 0, chain: 0, slow: 0, burn: 0, area: 0.34, cooldown: 1.8, leech: 0, gild: 0 },
  rain: { element: 'arcane', dmg: 9, count: 3, pierce: 1, shred: 0, chain: 0, slow: 0, burn: 0, area: 0.07, cooldown: 2.4, leech: 0, gild: 0 },
  orb: { element: 'arcane', dmg: 12, count: 1, pierce: 5, shred: 0, chain: 0, slow: 0, burn: 0, area: 0.05, cooldown: 2.2, leech: 0, gild: 0 },
};

/** Base stats of a caster rune (tier 1). */
export const casterBase = (id: CasterId): Readonly<Omit<Spell, 'caster' | 'echoes'>> => BASE[id];

const caster = (id: CasterId, name: string, hue: number, text: (dmg: number, cd: number) => string): RuneDef => ({
  id,
  name,
  kind: 'caster',
  cost: 3,
  hue,
  text: (t) => text(Math.round(BASE[id].dmg * TIER_MULT[t]), BASE[id].cooldown),
});
const mod = (id: ModId, name: string, hue: number, text: (t: number) => string): RuneDef => ({ id, name, kind: 'mod', cost: 2, hue, text });

export const RUNES: Record<RuneId, RuneDef> = {
  bolt: caster('bolt', 'Bolt', 200, (d, cd) => `Fires a bolt at the nearest foe (${d} dmg, every ${cd}s).`),
  beam: caster('beam', 'Beam', 50, (d, cd) => `A beam pierces a whole column (${d} dmg, every ${cd}s).`),
  nova: caster('nova', 'Nova', 280, (d, cd) => `Blasts every walker near the tower (${d} dmg, every ${cd}s); waits for foes in reach.`),
  rain: caster('rain', 'Rain', 160, (d, cd) => `${BASE.rain.count} strikes on random foes (${d} dmg, small splash, every ${cd}s).`),
  orb: caster('orb', 'Orb', 320, (d, cd) => `A slow homing orb passing through ${BASE.orb.pierce} foes (${d} dmg, every ${cd}s).`),
  fire: mod('fire', 'Fire', 15, (t) => `+${pct(MOD.fireDmg - 1)}% damage, then burns for ${pct(MOD.fireBurn(t))}% of the hit per second for 3s. Element: fire.`),
  frost: mod('frost', 'Frost', 195, (t) => `Slows by ${pct(MOD.frostSlow(t))}% for 1.5s. Element: frost.`),
  storm: mod('storm', 'Storm', 55, (t) => `Each cast arcs to ${MOD.stormArcs(t)} more foes at ${pct(MOD.stormDmg)}%. Element: storm.`),
  split: mod('split', 'Split', 300, (t) => `+${t} projectile/strike/beam; +${pct(MOD.splitGain(t) - 1)}% total damage, shared out.`),
  heavy: mod('heavy', 'Heavy', 30, (t) => `+${pct(MOD.heavyDmg(t) - 1)}% damage, bigger, but ${pct(MOD.heavyCd - 1)}% slower.`),
  pierce: mod('pierce', 'Pierce', 90, (t) => `+${pct(MOD.pierceDmg - 1)}% damage, hits ignore ${MOD.pierceShred(t)} armor; bolts and orbs pass through ${MOD.pierceThrough(t)} more foes.`),
  haste: mod('haste', 'Haste', 110, (t) => `Casts ${pct(1 / MOD.hasteCd(t) - 1)}% faster.`),
  leech: mod('leech', 'Leech', 340, (t) => `${pct(MOD.leech(t))}% chance a kill heals the tower 1.`),
  gild: mod('gild', 'Gild', 45, (t) => `${pct(MOD.gild(t))}% chance a kill drops +1 gold.`),
  echo: mod('echo', 'Echo', 260, (t) => `Repeats the spell as built so far (runes to its left), but casts ${pct(MOD.echoCd(t) - 1)}% slower.`),
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
        // Burn scales with the hit as built so far: fire after heavy burns hotter.
        // Burns don't stack: a second fire only keeps the hotter one.
        s.element = 'fire';
        s.dmg *= MOD.fireDmg;
        s.burn = Math.max(s.burn, s.dmg * MOD.fireBurn(t));
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
        s.dmg *= (MOD.splitGain(t) * s.count) / (s.count + t);
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
        s.dmg *= MOD.pierceDmg;
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
  return s;
}

/** Rough damage per second for the row preview. */
export function spellDps(s: Spell): number {
  const hits = s.caster === 'rain' ? s.count : s.caster === 'bolt' || s.caster === 'orb' ? s.count * Math.min(s.pierce, 3) : 3;
  const per = s.dmg * hits + s.dmg * s.count * s.chain * MOD.stormDmg + s.burn * 3 * hits;
  return (per * (1 + s.echoes.length * 0.8)) / s.cooldown;
}

export const ELEMENT_HUE: Record<Element, number> = { arcane: 270, fire: 18, frost: 195, storm: 55 };

export function runeKey(r: Rune): string {
  return `${r.id}:${r.tier}`;
}
