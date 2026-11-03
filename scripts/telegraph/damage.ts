// Where does the player get hurt? Greedy bot plays 150 runs and tallies
// damage by source and depth. Run: npx vite-node scripts/damage.ts
import { applyAction, newRun, PLAYER_ID } from '../../src/telegraph/core';
import { greedyAction } from './bot';
const src: Record<string, number> = {};
const byDepth: Record<number, number> = {};
let hooked = 0;
let hookedThenHurt = 0;
for (let seed = 1; seed <= 150; seed++) {
  let s = newRun(seed);
  let visits = new Map<string, number>();
  while (s.status === 'playing' && s.turn < 600) {
    const a = greedyAction(s, visits);
    const r = applyAction(s, a);
    let last = '';
    let wasHooked = false;
    for (const ev of r.events) {
      if (ev.type === 'hook' && ev.target === PLAYER_ID) { hooked++; wasHooked = true; }
      if (wasHooked && ev.type === 'damage' && ev.target === PLAYER_ID) { hookedThenHurt++; wasHooked = false; }
      if (ev.type === 'attack') last = ev.by === PLAYER_ID ? 'player' : `${s.enemies.find(e => e.id === ev.by)?.kind}:${ev.kind}`;
      if (ev.type === 'shot') last = 'archer:shot';
      if (ev.type === 'explode') last = 'bomb';
      if (ev.type === 'slam') last = 'slam';
      if (ev.type === 'damage' && ev.target === PLAYER_ID) { src[last] = (src[last] ?? 0) + 1; byDepth[s.depth] = (byDepth[s.depth] ?? 0) + 1; }
    }
    if (r.state.depth !== s.depth) visits = new Map();
    s = r.state;
    visits.set(`${s.player.pos.q},${s.player.pos.r}`, (visits.get(`${s.player.pos.q},${s.player.pos.r}`) ?? 0) + 1);
  }
}
console.log(src, byDepth);
console.log(`player hooked ${hooked} times; hurt later that same enemy turn ${hookedThenHurt} times`);
