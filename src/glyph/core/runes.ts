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

const caster = (id: CasterId, name: string, hue: number, text: (t: number) => string): RuneDef => ({ id, name, kind: 'caster', cost: 3, hue, text });
const mod = (id: ModId, name: string, hue: number, text: (t: number) => string): RuneDef => ({ id, name, kind: 'mod', cost: 2, hue, text });

export const RUNES: Record<RuneId, RuneDef> = {
  bolt: caster('bolt', 'Bolt', 200, (t) => `Fires a bolt at the nearest foe (${Math.round(10 * TIER_MULT[t])} dmg).`),
  beam: caster('beam', 'Beam', 50, (t) => `A beam pierces a whole column (${Math.round(14 * TIER_MULT[t])} dmg).`),
  nova: caster('nova', 'Nova', 280, (t) => `Blasts everything near the tower (${Math.round(10 * TIER_MULT[t])} dmg).`),
  rain: caster('rain', 'Rain', 160, (t) => `3 strikes on random foes (${Math.round(11 * TIER_MULT[t])} dmg, small splash).`),
  orb: caster('orb', 'Orb', 320, (t) => `A slow homing orb passing through 5 foes (${Math.round(8 * TIER_MULT[t])} dmg).`),
  fire: mod('fire', 'Fire', 15, (t) => `Burns for ${4 * t}/s over 3s. Element: fire.`),
  frost: mod('frost', 'Frost', 195, (t) => `Slows by ${Math.round((0.25 + 0.1 * t) * 100)}% for 2s. Element: frost.`),
  storm: mod('storm', 'Storm', 55, (t) => `Arcs to ${1 + t} more foes at 70%. Element: storm.`),
  split: mod('split', 'Split', 300, (t) => `+${t} projectile/strike, each 75% damage.`),
  heavy: mod('heavy', 'Heavy', 30, (t) => `+${50 + 30 * (t - 1)}% damage, bigger, but slower.`),
  pierce: mod('pierce', 'Pierce', 90, (t) => `Bolts and orbs pass through ${1 + t} more foes.`),
  haste: mod('haste', 'Haste', 110, (t) => `Casts ${Math.round((1 / (0.75 - 0.07 * (t - 1)) - 1) * 100)}% faster.`),
  leech: mod('leech', 'Leech', 340, (t) => `${10 * t}% chance a kill heals the tower 1.`),
  gild: mod('gild', 'Gild', 45, (t) => `${25 * t}% chance a kill drops +1 gold.`),
  echo: mod('echo', 'Echo', 260, () => 'Repeats the spell as built so far (runes to its left). Slower.'),
};

export const CASTERS: CasterId[] = ['bolt', 'beam', 'nova', 'rain', 'orb'];
export const MODS: ModId[] = ['fire', 'frost', 'storm', 'split', 'heavy', 'pierce', 'haste', 'leech', 'gild', 'echo'];

const BASE: Record<CasterId, Omit<Spell, 'caster' | 'echoes'>> = {
  bolt: { element: 'arcane', dmg: 10, count: 1, pierce: 1, chain: 0, slow: 0, burn: 0, area: 0.04, cooldown: 1.0, leech: 0, gild: 0 },
  beam: { element: 'arcane', dmg: 14, count: 1, pierce: 99, chain: 0, slow: 0, burn: 0, area: 0.07, cooldown: 1.8, leech: 0, gild: 0 },
  nova: { element: 'arcane', dmg: 10, count: 1, pierce: 99, chain: 0, slow: 0, burn: 0, area: 0.24, cooldown: 2.0, leech: 0, gild: 0 },
  rain: { element: 'arcane', dmg: 11, count: 3, pierce: 1, chain: 0, slow: 0, burn: 0, area: 0.07, cooldown: 2.2, leech: 0, gild: 0 },
  orb: { element: 'arcane', dmg: 8, count: 1, pierce: 5, chain: 0, slow: 0, burn: 0, area: 0.05, cooldown: 2.6, leech: 0, gild: 0 },
};

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
        s.element = 'fire';
        s.burn += 4 * t;
        s.dmg *= 1.1;
        break;
      case 'frost':
        s.element = 'frost';
        s.slow = Math.max(s.slow, 0.25 + 0.1 * t);
        break;
      case 'storm':
        s.element = 'storm';
        s.chain += 1 + t;
        break;
      case 'split':
        s.count += t;
        s.dmg *= 0.75;
        s.cooldown *= 1.1;
        break;
      case 'heavy':
        s.dmg *= 1.5 + 0.3 * (t - 1);
        s.area *= 1.25;
        s.cooldown *= 1.35;
        break;
      case 'pierce':
        s.pierce += 1 + t;
        break;
      case 'haste':
        s.cooldown *= 0.75 - 0.07 * (t - 1);
        break;
      case 'leech':
        s.leech += 0.1 * t;
        break;
      case 'gild':
        s.gild += 0.25 * t;
        break;
      case 'echo':
        // A copy of everything built so far fires again shortly after.
        s.echoes.push(clone(s));
        s.cooldown *= 1.25;
        break;
    }
  }
  return s;
}

/** Rough damage per second for the row preview. */
export function spellDps(s: Spell): number {
  const hits = s.caster === 'rain' ? s.count : s.caster === 'bolt' || s.caster === 'orb' ? s.count * Math.min(s.pierce, 3) : 3;
  const per = s.dmg * hits * (1 + s.chain * 0.7) + s.burn * 3;
  return (per * (1 + s.echoes.length * 0.8)) / s.cooldown;
}

export const ELEMENT_HUE: Record<Element, number> = { arcane: 270, fire: 18, frost: 195, storm: 55 };

export function runeKey(r: Rune): string {
  return `${r.id}:${r.tier}`;
}
