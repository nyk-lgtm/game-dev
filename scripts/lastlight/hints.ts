// Follows the hint pointers and prints each step:
//   npx vite-node scripts/lastlight/hints.ts <night> [ids,comma,separated]
// or, from N random starts (random taps first), counts how the hint-follower ends:
//   npx vite-node scripts/lastlight/hints.ts <night> random [N]
import { NIGHTS } from '../../src/lastlight/core/nights';
import type { StoryState } from '../../src/lastlight/core/types';

const night = Number(process.argv[2] ?? 1);
const st = NIGHTS[night - 1];

function follow(s: StoryState, log: boolean) {
  const ids: string[] = [];
  let last = '';
  for (let k = 0; k < 80 && !s.over; k++) {
    const h = st.hint(s);
    if (log) console.log(`${st.clock(s).padStart(8)} ${s.room.padEnd(9)} [${h?.key}] ${h?.target ?? '-'}  ${h?.pointer}`);
    last = `${h?.key} @${s.room}`;
    if (!h?.target) break;
    ids.push(h.target);
    st.act(s, h.target);
  }
  return { ids, last };
}

if (process.argv[3] === 'random') {
  let seed = 11;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
  const ends = new Map<string, number>();
  const n = Number(process.argv[4] ?? 300);
  for (let g = 0; g < n; g++) {
    const s = st.newGame();
    const pre: string[] = [];
    const m = Math.floor(rnd() * 30);
    for (let k = 0; k < m && !s.over; k++) {
      const c = st.choices(s);
      const id = c[Math.floor(rnd() * c.length)].id;
      pre.push(id);
      st.act(s, id);
    }
    if (s.over) continue;
    const { last } = follow(s, false);
    const over = (s as StoryState).over;
    const key = over ? `${over.stars}★` : `stuck ${last}`;
    ends.set(key, (ends.get(key) ?? 0) + 1);
    if (process.env.SHOW && key.includes(process.env.SHOW)) console.log(key, pre.join(','));
  }
  console.log([...ends].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${v}\t${k}`).join('\n'));
} else {
  const s = st.newGame();
  for (const id of (process.argv[3] ?? '').split(',').filter(Boolean)) if (!st.act(s, id)) throw new Error(`illegal ${id}`);
  const { ids } = follow(s, true);
  console.log(s.over ? `${s.over.title} ${s.over.stars}★` : 'not over', `\na=${ids.join(',')}`);
}
