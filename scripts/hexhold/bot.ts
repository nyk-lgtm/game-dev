// Hexhold bot: before each wave it spends its gold on the build that lengthens
// the path and covers it best (with neighbor bonuses), or upgrades its busiest
// tower; then it sends the wave and watches. A rough stand-in for a decent player.
import {
  ADJ, CELL, CORE, N, PORTAL, POS, TOWERS, WAVES, act, buildError, encode, flowField, blockedSet, nextCell, newGame, step,
  specCost, upgradeCost, type Action, type State, type TowerId,
} from '../../src/hexhold/core';

export interface Run { s: State; actions: string; reached: number }

function path(dist: number[]): number[] {
  const out = [PORTAL];
  let c = PORTAL;
  for (let k = 0; k < 200 && c !== CORE; k++) {
    c = nextCell(dist, c);
    if (c < 0) break;
    out.push(c);
  }
  return out;
}

const SPEC_PICK: Record<TowerId, number> = { bolt: 0, mortar: 0, frost: 0, tesla: 0, flame: 1, beacon: 0 };

const PLAN: TowerId[] = ['bolt', 'bolt', 'mortar', 'frost', 'bolt', 'tesla', 'flame', 'beacon', 'mortar', 'tesla'];

function coverage(cell: number, range: number, p: number[]): number {
  const r = range * CELL;
  let n = 0;
  for (const c of p) if ((POS[c].x - POS[cell].x) ** 2 + (POS[c].y - POS[cell].y) ** 2 <= r * r) n++;
  return n;
}

export function bestBuild(s: State, id: TowerId): { cell: number; score: number } | null {
  const base = path(s.field.dist).length;
  let best: { cell: number; score: number } | null = null;
  for (let cell = 0; cell < N; cell++) {
    if (buildError(s, cell, id)) continue;
    const f = flowField(s.ground, blockedSet(s, cell));
    const p = path(f.dist);
    const gain = p.length - base;
    const cov = TOWERS[id].range > 0 ? coverage(cell, TOWERS[id].range, p) : 0;
    const friends = ADJ[cell].filter((j) => s.towers[j]).length;
    const score = gain * 2.5 + cov + friends * (id === 'beacon' || id === 'frost' ? 3 : 1) + (s.ground[cell] === 'ley' ? 2 : 0);
    if (!best || score > best.score) best = { cell, score };
  }
  return best;
}

export function runGame(seed: number, skill = 1): Run {
  const s = newGame(seed);
  const toks: string[] = [];
  const doAct = (a: Action) => {
    if (act(s, a)) toks.push(encode(s.tick, a));
  };
  let built = 0;
  while (s.status === 'playing' && s.wave < WAVES) {
    for (let guard = 0; guard < 20; guard++) {
      const id = PLAN[built % PLAN.length];
      const pick = s.gold >= TOWERS[id].cost ? bestBuild(s, id) : null;
      // Upgrade the busiest tower when building isn't worth it any more.
      const towers = s.towers.filter((t): t is NonNullable<typeof t> => !!t && t.level < 3 && t.id !== 'beacon');
      const p = path(s.field.dist);
      towers.sort((a, b) => coverage(b.cell, TOWERS[b.id].range, p) - coverage(a.cell, TOWERS[a.id].range, p));
      const up = towers.find((t) => s.gold >= upgradeCost(t.id, t.level));
      // Specialize maxed towers when there's nothing better to do.
      const maxed = s.towers.find((t) => t && t.level === 3 && t.spec < 0 && s.gold >= specCost(t.id));
      if (!pick && !up && maxed && built >= 8) {
        doAct({ t: 'spec', cell: maxed.cell, pick: SPEC_PICK[maxed.id] });
        continue;
      }
      if (pick && (pick.score > 4 * skill || !up)) {
        doAct({ t: 'build', cell: pick.cell, tower: id });
        built++;
      } else if (up && built >= 6) doAct({ t: 'up', cell: up.cell });
      else break;
    }
    doAct({ t: 'wave' });
    while (s.status === 'playing' && s.active) step(s);
  }
  return { s, actions: toks.join(','), reached: s.wave };
}
