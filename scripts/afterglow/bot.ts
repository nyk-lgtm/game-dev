// A simple Afterglow pilot for balance probes: kites away from nearby
// enemies and bullets, drifts toward gems, and picks upgrades by priority.
import {
  DT,
  WEAPONS,
  choose,
  createWorld,
  step,
  takeChest,
  waiting,
  type Choice,
  type World,
} from '../../src/afterglow/core';

function score(w: World, c: Choice): number {
  if (c.kind === 'gold') return 0;
  if (c.kind === 'weapon') {
    const owned = w.weapons.some((ws) => ws.id === c.id);
    return owned ? 50 + c.level : w.weapons.length < 4 ? 45 : 10;
  }
  // Passives that unlock an evolution for a held weapon rank high.
  const evo = w.weapons.some((ws) => WEAPONS[ws.id].evolvesWith === c.id);
  return evo ? 48 : c.id === 'vitality' || c.id === 'might' || c.id === 'haste' ? 30 : 20;
}

export function botInput(w: World): { x: number; y: number } {
  const p = w.player;
  let fx = 0;
  let fy = 0;
  w.grid.query(p.x, p.y, 160, (e) => {
    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const d2 = dx * dx + dy * dy + 1;
    if (d2 > 140 * 140) return;
    // Unit-ish push that grows sharply when close.
    const k = ((e.r + 30) / d2) * (e.r + 30) / Math.sqrt(d2);
    fx += dx * k * (e.kind === 'eclipse' || e.kind === 'prism' ? 4 : 1);
    fy += dy * k * (e.kind === 'eclipse' || e.kind === 'prism' ? 4 : 1);
  });
  for (const b of w.bullets) {
    const dx = p.x - b.x;
    const dy = p.y - b.y;
    const d2 = dx * dx + dy * dy + 1;
    if (d2 < 140 * 140) {
      fx += (dx * 600) / d2;
      fy += (dy * 600) / d2;
    }
  }
  const danger = Math.sqrt(fx * fx + fy * fy);
  let gem: { x: number; y: number; d: number } | null = null;
  for (const g of w.pickups) {
    const d = (g.x - p.x) ** 2 + (g.y - p.y) ** 2;
    if (d < 700 * 700 && (!gem || d < gem.d)) gem = { x: g.x, y: g.y, d };
  }
  if (gem) {
    // Go for gems, harder when it's calm.
    const d = Math.sqrt(gem.d) || 1;
    const pull = danger < 0.8 ? 1.2 : 0.35;
    fx += ((gem.x - p.x) / d) * pull;
    fy += ((gem.y - p.y) / d) * pull;
  } else {
    fx += Math.cos(w.time * 0.3) * 0.25;
    fy += Math.sin(w.time * 0.3) * 0.25;
  }
  const m = Math.sqrt(fx * fx + fy * fy) || 1;
  return { x: fx / m, y: fy / m };
}

export function playBot(seed: number, character = 'spark', maxSeconds = 700) {
  const w = createWorld(seed, character);
  let peak = 0;
  while (w.status === 'playing' && w.time < maxSeconds) {
    while (waiting(w)) {
      if (w.chestQueue > 0) takeChest(w);
      else {
        let best = 0;
        w.choices.forEach((c, i) => {
          if (score(w, c) > score(w, w.choices[best])) best = i;
        });
        choose(w, best);
      }
    }
    const inp = botInput(w);
    step(w, inp.x, inp.y);
    w.fx.length = 0;
    peak = Math.max(peak, w.enemies.length);
  }
  return { w, peak, dt: DT };
}
