// Try numbers without editing the rules (probe.ts, looms.ts, balance.ts):
//   TWEAK='beam.dmg=20,orb.cooldown=2'   caster base stats
//   TWEAK='MOD.pierceThrough=t'          modifier numbers (a number, or an expression in t)
//   TWEAK='drake.hp=100,BUDGET.square=0.45,WAVE_TIME.base=26,GROWTH.hp=0.26,lich.leak=10'   foes and waves
import { ASC, BUDGET, CASTERS, ENEMIES, GROWTH, MOD, WAVE_TIME, casterBase, type CasterId, type EnemyKind } from '../../src/glyph/core';

export function applyTweaks(spec = process.env.TWEAK ?? ''): void {
  for (const kv of spec.split(',').filter(Boolean)) {
    const [path, v] = kv.split('=');
    const [c, k] = path.split('.');
    let obj: Record<string, unknown>;
    if (c === 'MOD') obj = MOD as unknown as Record<string, unknown>;
    else if (c === 'BUDGET') obj = BUDGET as unknown as Record<string, unknown>;
    else if (c === 'WAVE_TIME') obj = WAVE_TIME as unknown as Record<string, unknown>;
    else if (c === 'GROWTH') obj = GROWTH as unknown as Record<string, unknown>;
    else if (c === 'ASC') obj = ASC as unknown as Record<string, unknown>;
    else if ((CASTERS as string[]).includes(c)) obj = casterBase(c as CasterId) as unknown as Record<string, unknown>;
    else if (c in ENEMIES) obj = ENEMIES[c as EnemyKind] as unknown as Record<string, unknown>;
    else throw new Error(`TWEAK: unknown ${c}`);
    if (!(k in obj)) throw new Error(`TWEAK: ${c} has no ${k}`);
    obj[k] = typeof obj[k] === 'function' ? new Function('t', `return ${v}`) : Number(v);
  }
}
