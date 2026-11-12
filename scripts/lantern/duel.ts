// King duel probe: a player of each level (axe, cloth, N potions) fights the
// Hollow King toe to toe, drinking a potion below 40% HP.
// Run: npx vite-node scripts/lantern/duel.ts [potions]
import { MONSTERS, XP_TABLE, applyAction, newGame, type GameState } from '../../src/lantern/core';

const potions = Number(process.argv[2] ?? 2);
const RUNS = 400;
// OLD=1: the rules-v1 King (45 HP, atk 9, def 3) and starting attack 3, for comparison.
const OLD = !!process.env.OLD;
if (OLD) Object.assign(MONSTERS.king, { hp: 45, atk: 9, def: 3 });

function fighter(level: number, seed: number): GameState {
  const s = newGame(seed);
  const p = s.player;
  p.map = 'cave2';
  p.pos = { x: 22, y: 5 };
  s.monsters = [{ id: 0, kind: 'king', map: 'cave2', pos: { x: 23, y: 5 }, hp: MONSTERS.king.hp }];
  p.level = level;
  p.xp = XP_TABLE[level - 1];
  p.maxHp = p.hp = 20 + 6 * (level - 1);
  p.baseAtk += level - 1 - (OLD ? 1 : 0);
  p.baseDef = Math.floor(level / 2);
  p.weapon = 'axe';
  p.potions = potions;
  return s;
}

for (let level = 4; level <= 8; level++) {
  let wins = 0;
  let used = 0;
  let hpLeft = 0;
  for (let seed = 1; seed <= RUNS; seed++) {
    let s = fighter(level, seed);
    while (s.monsters[0].hp > 0 && s.deaths === 0) {
      const p = s.player;
      const drink = p.hp < p.maxHp * 0.4 && p.potions > 0;
      s = applyAction(s, drink ? { type: 'potion' } : { type: 'step', dir: 2 }).state;
    }
    if (s.deaths === 0) {
      wins++;
      used += potions - s.player.potions;
      hpLeft += s.player.hp / s.player.maxHp;
    }
  }
  console.log(
    `level ${level}: win ${((100 * wins) / RUNS).toFixed(0)}%  potions used ${(used / Math.max(1, wins)).toFixed(1)}  hp left ${((100 * hpLeft) / Math.max(1, wins)).toFixed(0)}%`,
  );
}
