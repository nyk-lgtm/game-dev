// A simple Glyphwright player: fill rows with casters, then stack good
// modifiers, keep gold for interest when the loom is full.
import { RUNES, buy, compileRow, freeBench, newGame, price, reroll, sell, spellDps, startBattle, tick, type GameState, type ModId } from '../../src/glyph/core';

const MOD_PREF: ModId[] = ['heavy', 'echo', 'split', 'haste', 'storm', 'fire', 'pierce', 'frost', 'gild', 'leech'];

function emptyModSlot(s: GameState): { row: number; col: number } | null {
  for (let row = 0; row < 3; row++) {
    if (!s.loom[row][0]) continue;
    for (let col = 1; col < 4; col++) if (!s.loom[row][col]) return { row, col };
  }
  return null;
}

export function shopTurn(s: GameState): void {
  for (let guard = 0; guard < 30; guard++) {
    let bought = false;
    for (let i = 0; i < s.shop.length; i++) {
      const o = s.shop[i];
      if (o.sold || s.gold < price(o.rune)) continue;
      const kind = RUNES[o.rune.id].kind;
      // Merges are always worth it.
      const owned = [...s.loom.flat(), ...s.bench].filter((r) => r && r.id === o.rune.id && r.tier === o.rune.tier).length;
      const emptyRow = s.loom.findIndex((r) => !r[0]);
      if (kind === 'caster' && (emptyRow >= 0 || owned >= 1)) {
        if (buy(s, i, emptyRow >= 0 ? { area: 'loom', row: emptyRow, col: 0 } : undefined)) bought = true;
      } else if (kind === 'mod') {
        const slot = emptyModSlot(s);
        const good = MOD_PREF.indexOf(o.rune.id as ModId) < 6 || owned >= 1;
        if ((slot && good) || owned >= 2) {
          if (buy(s, i, slot ? { area: 'loom', ...slot } : undefined)) bought = true;
        } else if (owned === 1 && freeBench(s) >= 0) {
          if (buy(s, i)) bought = true;
        }
      }
    }
    if (bought) continue;
    // Reroll if the loom has gaps and gold to spare beyond interest.
    if ((s.loom.some((r) => !r[0]) || emptyModSlot(s)) && s.gold >= 4) reroll(s);
    else break;
  }
  // Clear bench clutter that isn't heading for a merge.
  s.bench.forEach((r, i) => {
    if (!r) return;
    const n = [...s.loom.flat(), ...s.bench].filter((x) => x && x.id === r.id && x.tier === r.tier).length;
    if (n < 2) sell(s, { area: 'bench', i });
  });
}

export function play(seed: number) {
  const s = newGame(seed);
  while (s.phase === 'build' || s.phase === 'battle') {
    if (s.phase === 'build') {
      shopTurn(s);
      startBattle(s);
    }
    let n = 0;
    while (s.phase === 'battle' && n++ < 60 * 400) tick(s);
  }
  const dps = s.loom.map((r) => compileRow(r)).filter(Boolean).map((sp) => Math.round(spellDps(sp!)));
  return { s, dps };
}
