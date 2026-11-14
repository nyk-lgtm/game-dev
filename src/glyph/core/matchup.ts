// How a compiled spell fares against the foes of a wave: armor, elemental
// resistances and flyers. Read-only helpers for the row preview and the spell
// card; the battle itself uses the same `mitigate`.

import { ENEMIES, WAVES, enemyHp, isBoss, mitigate, newBattle, stepBattle, waveQueue } from './battle';
import type { Enemy, EnemyKind, GameState, Spell } from './types';

export interface FoeMatch {
  kind: EnemyKind;
  count: number;
  /** Share of the wave's total HP (bosses included). */
  share: number;
  /** One hit's damage after resistance and armor (0 if it can't be hit). */
  perHit: number;
  /** perHit / the raw hit. */
  ratio: number;
  canHit: boolean;
  /** Resistance multiplier for the spell's element (1 = none). */
  resist: number;
  /** Armor left after the spell's shred. */
  armor: number;
  /** The spell burns and this foe can burn. */
  burns: boolean;
}

export interface WaveFoe {
  kind: EnemyKind;
  count: number;
  hp: number;
}

/** The foes of a wave, grouped by kind, biggest total HP first. */
export function waveFoes(seed: number, wave: number, asc = 0): WaveFoe[] {
  const m = new Map<EnemyKind, number>();
  for (const [, k] of waveQueue(seed, wave)) m.set(k, (m.get(k) ?? 0) + 1);
  return [...m.entries()].map(([kind, count]) => ({ kind, count, hp: enemyHp(kind, wave, asc) })).sort((a, b) => b.hp * b.count - a.hp * a.count);
}

/** Novas only reach foes on the ground. */
export const canHit = (sp: Pick<Spell, 'caster'>, kind: EnemyKind) => !(sp.caster === 'nova' && ENEMIES[kind].flying);

export function matchups(sp: Spell, foes: WaveFoe[]): FoeMatch[] {
  const total = foes.reduce((n, f) => n + f.hp * f.count, 0) || 1;
  return foes.map(({ kind, count, hp }) => {
    const d = ENEMIES[kind];
    const ok = canHit(sp, kind);
    const perHit = ok ? mitigate(kind, sp, sp.dmg) : 0;
    return {
      kind,
      count,
      share: (hp * count) / total,
      perHit,
      ratio: sp.dmg > 0 ? perHit / sp.dmg : 0,
      canHit: ok,
      resist: d.resist[sp.element] ?? 1,
      armor: Math.max(0, d.armor - sp.shred),
      burns: ok && sp.burn > 0 && (d.resist.fire ?? 1) > 0,
    };
  });
}

export interface Warning {
  /** 2: does (almost) nothing to these foes; 1: weakened. */
  level: 1 | 2;
  text: string;
  kind: EnemyKind;
}

const plural = (kind: EnemyKind, n: number) => (n > 1 ? `${ENEMIES[kind].name}s` : ENEMIES[kind].name);

/** What hurts this spell against these foes, worst first. Minor foes (under 4% of the wave's HP) are ignored unless bosses. */
export function warnings(sp: Spell, foes: WaveFoe[]): Warning[] {
  const out: Warning[] = [];
  for (const m of matchups(sp, foes)) {
    if (m.share < 0.04 && !isBoss(m.kind)) continue;
    const name = plural(m.kind, m.count);
    if (!m.canHit) out.push({ level: 2, text: `${name} ${m.count > 1 ? 'fly' : 'flies'} over it`, kind: m.kind });
    else if (m.resist === 0) out.push({ level: 2, text: `${name} immune to ${sp.element}`, kind: m.kind });
    else if (m.resist <= 0.5) out.push({ level: m.resist <= 0.25 ? 2 : 1, text: `${name} ${m.count > 1 ? 'resist' : 'resists'} ${sp.element}`, kind: m.kind });
    else if (m.ratio < 0.5) out.push({ level: m.ratio < 0.25 ? 2 : 1, text: `${name}: armor eats ${Math.round((1 - m.ratio) * 100)}%`, kind: m.kind });
    // Hits of another element still land, but the burn doesn't.
    else if (sp.burn > 0 && !m.burns) out.push({ level: 1, text: `${name} can't burn`, kind: m.kind });
  }
  return out.sort((a, b) => b.level - a.level);
}

export interface LichTrial {
  /** The Lich fell before reaching the tower. */
  killed: boolean;
  /** How far down the lane it got (0..1; 1 = it reached the tower). */
  progress: number;
  /** Share of its HP and shield left when it reached the tower (0 if killed). */
  left: number;
}

/**
 * A trial run of the loom against the final boss alone (it still raises its
 * imps, which soak shots aimed at the front foe), on a copy of the state. An
 * estimate for the wave preview: the real wave 15 brings other foes too.
 */
export function lichTrial(s: GameState): LichTrial {
  const t: GameState = { ...s, wave: WAVES, hp: 1e6, maxHp: 1e6, loom: s.loom.map((r) => r.map((x) => x && { ...x })), bench: [], shop: [], battle: null };
  const b = newBattle(t);
  b.queue = [[0.5, 'lich', 0.5]];
  const full = enemyHp('lich', WAVES, s.asc) + ENEMIES.lich.shield;
  let lich: Enemy | undefined;
  for (let n = 0; n < 60 * 120 && !b.over; n++) {
    stepBattle(t, b);
    lich ??= b.enemies.find((e) => e.kind === 'lich');
    if (lich && !lich.alive) break;
  }
  if (!lich || b.leakedBy.lich) return { killed: false, progress: 1, left: lich ? Math.max(0, lich.hp + lich.shield) / full : 1 };
  return { killed: true, progress: Math.min(1, lich.y), left: 0 };
}
