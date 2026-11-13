// Why first layouts fail: `npx vite-node scripts/trestle/why.ts 60 [reach|cross]`
import { layout, survey, px, py, COLS } from '../../src/trestle/core';
import { mixSeed } from '../../src/shared/rng';

const n = Number(process.argv[2] ?? 40);
const want = process.argv[3];
const reasons: Record<string, number> = {};
let seen = 0;
for (let i = 0; seen < n && i < n * 20; i++) {
  const d = (i % 25) / 24;
  const { level: l } = layout(mixSeed(1, i), d, 0);
  if (want && l.goal.kind !== want) continue;
  seen++;
  let why = 'ok';
  if (l.goal.kind === 'reach') {
    const r = l.goal.ring;
    if (l.anchors.some((a) => px(a) === px(r) && py(a) < py(r))) why = 'freebie';
  }
  if (why === 'ok') {
    const s = survey(l);
    if (!s) why = 'unsolved';
    else if (s.parts < 3) why = 'tiny';
  }
  reasons[why] = (reasons[why] ?? 0) + 1;
  if (process.env.V && why === 'unsolved') {
    const g = l.goal;
    console.log(`d=${d.toFixed(2)} ${g.kind} anchors ${l.anchors.map((a) => `${a % COLS},${Math.floor(a / COLS)}`).join(' ')} ${g.kind === 'reach' ? `ring ${g.ring % COLS},${Math.floor(g.ring / COLS)} w ${g.weight}` : `span ${px(g.to) - px(g.from)} cart ${g.cart}`} rocks ${l.terrain.map((t) => `${t.kind}[${t.x0},${t.y0}..${t.x1}]`).join(' ')}`);
  }
}
console.log(reasons);
