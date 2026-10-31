// Nightline balance probe. Run: npx vite-node scripts/nightline/balance.ts [runs]
import { drive } from './bot';

const runs = Number(process.argv[2] ?? 10);
for (const side of [0, 1]) {
  const rows: string[] = [];
  let fin = 0;
  for (let i = 1; i <= runs; i++) {
    const r = drive(i, side);
    if (r.status === 'finished') fin++;
    rows.push(`${r.status} stage ${r.stage + 1} t=${r.time.toFixed(0)}s clock=${r.clock.toFixed(1)} crashes=${r.crashes} passed=${r.passed} score=${Math.round(r.score)}`);
  }
  console.log(`--- always ${side ? 'right' : 'left'} ---\n${rows.join('\n')}\nfinished ${fin}/${runs}`);
}
