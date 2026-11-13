// Prints a puzzle, its answer with the light, and how the deduction model solves it:
// `npx vite-node scripts/gleam/show.ts <seed> [small|medium|large]`.
import { CRYSTAL, LAMP, SOCKET, WALL, deduce, generate, trace, type Puzzle, type Size } from '../../src/gleam/core';

const seed = Number(process.argv[2] ?? 1);
const size = (process.argv[3] ?? 'medium') as Size;
const p = generate(seed, size);

const COL = '.RGYBMCW';
const ARROW = '^>v<';
const PIECE = ['·', '/', '\\', '⟋', '⟍', 'r', 'g', 'b'];

function show(p: Puzzle, board: number[] | null): string {
  const light = board ? trace(p, board) : null;
  const rows: string[] = [];
  for (let r = 0; r < p.n; r++) {
    let s = '';
    for (let q = 0; q < p.n; q++) {
      const c = r * p.n + q;
      const k = p.kind[c];
      const i = p.sockets.indexOf(c);
      let ch = light && light.lit[c] ? COL[light.lit[c]].toLowerCase() : ' ';
      if (k === WALL) ch = '#';
      else if (k === LAMP) {
        const l = p.lamps.find((l) => l.cell === c)!;
        ch = COL[l.mask] + ARROW[l.dir];
      } else if (k === CRYSTAL) ch = p.target[c] === 0 ? '◆' : COL[p.target[c]];
      else if (k === SOCKET) ch = board ? (board[i] ? PIECE[board[i]] : 'o') : p.given[i] >= 0 ? PIECE[p.given[i]] : 'o';
      else if (!light || !light.lit[c]) ch = '.';
      s += ch.padEnd(2, ' ') + ' ';
    }
    rows.push(s);
  }
  return rows.join('\n');
}

const tray = ['mirror', 'splitter', 'red filter', 'green filter', 'blue filter'].map((t, i) => (p.stock[i] ? `${p.stock[i]} ${t}` : '')).filter(Boolean);
console.log(`seed ${seed} ${size}: tray ${tray.join(', ')}; ${p.sockets.length} sockets`);
console.log(show(p, null));
console.log('\nanswer (lower-case = light colour):');
console.log(show(p, p.solution));
const d = deduce(p, 3);
console.log(`\ndeduction: solved ${d.solved}, depth ${d.depth}, ${d.log.length} eliminations`);
for (const e of d.log) console.log(`  socket ${e.socket} (cell ${p.sockets[e.socket]}) not ${PIECE[e.code]} [d${e.depth}] ${JSON.stringify(e.why)}`);
