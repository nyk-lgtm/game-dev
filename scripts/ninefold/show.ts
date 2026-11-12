// Prints a course as ASCII: `npx vite-node scripts/ninefold/show.ts <seed>` (T tee, O cup, # route, + pocket).
import { COLS, ROWS, makeCourse } from '../../src/ninefold/core';
const c = makeCourse(Number(process.argv[2] ?? 1));
for (const h of c) {
  console.log(`hole ${h.n + 1} par ${h.par} len ${h.path.length} posts ${h.posts.length} zones ${h.zones.map(z=>z.kind).join(',')}`);
  const rows: string[] = [];
  for (let r = 0; r < ROWS; r++) { let s = ''; for (let q = 0; q < COLS; q++) { const i = r*COLS+q; s += i===h.path[0]?'T':i===h.path[h.path.length-1]?'O':h.path.includes(i)?'#':h.cells[i]?'+':'.'; } rows.push(s); }
  console.log(rows.join('\n'));
}
