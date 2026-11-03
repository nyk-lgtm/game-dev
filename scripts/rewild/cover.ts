// npx vite-node scripts/rewild/cover.ts [games] — how green the island gets: plant/animal cells per season (greedy bot).
import { apply, newGame } from '../../src/rewild/core';
import { greedyMove } from './bot';

const n = +(process.argv[2] ?? 8);
const plants = new Array(20).fill(0);
const animals = new Array(20).fill(0);
const soil = new Array(20).fill(0);
const fert2 = new Array(20).fill(0);
for (let k = 0; k < n; k++) {
  const s = newGame(1000 + k * 7);
  while (!s.over) {
    const a = greedyMove(s, 1);
    const before = s.season;
    apply(s, a);
    if (a.type === 'end') {
      plants[before] += s.cells.filter((c) => c.plant).length / n;
      animals[before] += s.cells.filter((c) => c.animal).length / n;
      soil[before] += s.cells.filter((c) => c.t === 'soil').length / n;
      fert2[before] += s.cells.filter((c) => c.t === 'soil' && c.fert >= 2).length / n;
    }
  }
}
const f = (xs: number[]) => xs.map((x) => x.toFixed(0).padStart(3)).join('');
console.log('season ' + f(plants.map((_, i) => i)));
console.log('plants ' + f(plants));
console.log('animal ' + f(animals));
console.log('soil   ' + f(soil));
console.log('fert2+ ' + f(fert2));
