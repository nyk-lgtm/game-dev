// Afterglow balance probe with full metrics, run across 4 worker processes.
// npx vite-node scripts/afterglow/probe.ts -- [runs=24] [--char spark] [--policy smart|random|greedy]
//   [--weapon pulse] [--seed0 1] [--jobs 4] [--rows]
import { spawn } from 'node:child_process';
import { playBot, type BotRun, type Policy } from './bot';
import { ENEMIES, WAVES, type WeaponId } from '../../src/afterglow/core';

const argv = process.argv.slice(2).filter((a) => a !== '--');
const flag = (name: string, def: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : def;
};
const runs = Number(argv.find((a, i) => /^\d+$/.test(a) && !argv[i - 1]?.startsWith('--')) ?? 24);
const character = flag('char', 'spark');
const policy = flag('policy', 'smart') as Policy;
const weapon = flag('weapon', '') as WeaponId | '';
const seed0 = Number(flag('seed0', '1'));
const jobs = Number(flag('jobs', '4'));
const worker = flag('worker', '');
const think = Number(flag('think', '0')) || undefined;

interface Row {
  seed: number;
  status: string;
  time: number;
  level: number;
  kills: number;
  peak: number;
  peakBullets: number;
  levelAt: Record<number, number>;
  firstLevel: number;
  evolutions: Record<string, number>;
  prismKilled: number;
  eclipseFight: number;
  eclipseMinHp: number;
  hurt: Record<string, number>;
  killer: string;
  dealt: Record<string, number>;
  timeline: number[][];
  build: string;
}

function toRow(seed: number, r: BotRun): Row {
  const w = r.w;
  return {
    seed,
    status: w.status,
    time: w.time,
    level: w.player.level,
    kills: w.kills,
    peak: r.peak,
    peakBullets: r.peakBullets,
    levelAt: r.levelAt,
    firstLevel: r.firstLevel,
    evolutions: r.evolutions,
    prismKilled: r.prismKilled,
    eclipseFight: r.eclipseFight,
    eclipseMinHp: r.eclipseMinHp,
    hurt: r.hurt,
    killer: r.killer,
    dealt: w.dealt as Record<string, number>,
    timeline: r.timeline,
    build: w.weapons.map((x) => `${x.id}${x.level}`).join(',') + ' | ' + Object.entries(w.passives).map(([k, v]) => `${k}${v}`).join(','),
  };
}

// Experiment knobs (scale tables in-process; not saved).
const kRate = Number(flag('rate', '1'));
const kCap = Number(flag('cap', '1'));
const kHp = Number(flag('ehp', '1'));
const kXp = Number(flag('exp', '1'));
for (const wv of WAVES) {
  wv.rate *= kRate;
  wv.max = Math.round(wv.max * kCap);
}
for (const [k, d] of Object.entries(ENEMIES)) {
  if (k === 'prism' || k === 'eclipse') continue;
  d.hp *= kHp;
  d.xp *= kXp;
}

if (worker) {
  const [k, n] = worker.split('/').map(Number);
  for (let s = seed0 + k; s < seed0 + runs; s += n) {
    const r = playBot(s, character, Number(flag("max", "900")), { policy, weapon: weapon || undefined, think });
    process.stdout.write('RUN ' + JSON.stringify(toRow(s, r)) + '\n');
  }
} else {
  const t0 = Date.now();
  const rows: Row[] = [];
  const passArgs = argv.filter((a) => a !== '--rows');
  await Promise.all(
    Array.from({ length: jobs }, (_, k) =>
      new Promise<void>((res, rej) => {
        const ch = spawn('npx', ['vite-node', 'scripts/afterglow/probe.ts', '--', ...passArgs, '--worker', `${k}/${jobs}`], { stdio: ['ignore', 'pipe', 'inherit'] });
        let buf = '';
        ch.stdout.on('data', (d) => (buf += d));
        ch.on('close', (code) => {
          for (const line of buf.split('\n')) if (line.startsWith('RUN ')) rows.push(JSON.parse(line.slice(4)));
          code === 0 ? res() : rej(new Error(`worker ${k} exited ${code}`));
        });
      }),
    ),
  );
  rows.sort((a, b) => a.seed - b.seed);
  report(rows, Date.now() - t0);
}

function pct(xs: number[], q: number): number {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : 0;
}
function mm(t: number): string {
  return `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
}

function report(rows: Row[], ms: number): void {
  const n = rows.length;
  if (argv.includes('--rows'))
    for (const r of rows)
      console.log(`seed ${r.seed}: ${r.status} ${mm(r.time)} lvl ${r.level} (3m ${r.levelAt[180]}, 6m ${r.levelAt[360]}, 10m ${r.levelAt[600]}) peak ${r.peak} ${r.killer ? 'killed by ' + r.killer : ''} evo ${Object.entries(r.evolutions).map(([k, t]) => `${k}@${mm(t)}`).join(' ')} [${r.build}]`);
  const times = rows.map((r) => r.time);
  const reached = rows.filter((r) => r.time >= 600 || r.status === 'won').length;
  const wins = rows.filter((r) => r.status === 'won');
  const dead = rows.filter((r) => r.status === 'dead');
  const buckets: Record<string, number> = {};
  for (const r of rows) {
    const b = r.status === 'won' ? 'won' : r.time >= 600 ? '10+ (eclipse)' : `${Math.floor(r.time / 120) * 2}-${Math.floor(r.time / 120) * 2 + 2}m`;
    buckets[b] = (buckets[b] ?? 0) + 1;
  }
  const lv = (t: number) => rows.filter((r) => r.levelAt[t]).map((r) => r.levelAt[t]);
  console.log(`\n== ${n} runs, char ${character}${weapon ? ' weapon ' + weapon : ''}, policy ${policy}${think ? ' think ' + think : ''}  (${(ms / 1000).toFixed(0)}s)`);
  console.log(`survival: median ${mm(pct(times, 0.5))}, p25 ${mm(pct(times, 0.25))}, p75 ${mm(pct(times, 0.75))}; reached eclipse ${reached}/${n} (${Math.round((100 * reached) / n)}%), won ${wins.length}/${n} (${Math.round((100 * wins.length) / n)}%)`);
  console.log('buckets: ' + Object.entries(buckets).sort().map(([k, v]) => `${k}:${v}`).join('  '));
  console.log(`first level-up: median ${pct(rows.map((r) => r.firstLevel), 0.5).toFixed(1)}s`);
  for (const t of [180, 360, 600]) {
    const l = lv(t);
    console.log(`level @${t / 60}m: median ${pct(l, 0.5)} (p25 ${pct(l, 0.25)}, p75 ${pct(l, 0.75)}, n=${l.length})`);
  }
  const tl: string[] = [];
  for (let m = 0; m < 11; m++) {
    const xs = rows.filter((r) => r.timeline[m]).map((r) => r.timeline[m]);
    if (!xs.length) break;
    const col = (i: number) => pct(xs.map((x) => x[i]), 0.5);
    tl.push(`${m + 1}m: alive ${col(0)} dps ${(col(1) / 60).toFixed(0)} kills/s ${(col(4) / 60).toFixed(1)} hp ${col(2).toFixed(2)} lvl ${col(3)} xp ${col(5).toFixed(0)} (n ${xs.length})`);
  }
  console.log('timeline (medians):\n  ' + tl.join('\n  '));
  const fights = wins.map((r) => r.eclipseFight);
  if (fights.length) console.log(`eclipse fight (wins): median ${pct(fights, 0.5).toFixed(0)}s, min ${pct(fights, 0).toFixed(0)}s, max ${pct(fights, 0.999).toFixed(0)}s; lowest hp in fight: median ${pct(wins.map((r) => r.eclipseMinHp), 0.5).toFixed(2)}, p25 ${pct(wins.map((r) => r.eclipseMinHp), 0.25).toFixed(2)}`);
  const prism = rows.filter((r) => r.prismKilled).map((r) => r.prismKilled - 300);
  console.log(`prism killed in ${prism.length}/${rows.filter((r) => r.time > 300).length} runs, median fight ${pct(prism, 0.5).toFixed(0)}s`);
  const evoT: Record<string, number[]> = {};
  for (const r of rows) for (const [k, t] of Object.entries(r.evolutions)) (evoT[k] ??= []).push(t);
  const allEvo = Object.values(evoT).flat();
  console.log(`evolutions: ${allEvo.length} total, first per run median ${mm(pct(rows.map((r) => Math.min(9999, ...Object.values(r.evolutions))).filter((t) => t < 9999), 0.5))}; ` + Object.entries(evoT).map(([k, ts]) => `${k} x${ts.length} @${mm(pct(ts, 0.5))}`).join(', '));
  console.log(`peak enemies: median ${pct(rows.map((r) => r.peak), 0.5)}, max ${Math.max(...rows.map((r) => r.peak))}; peak bullets max ${Math.max(...rows.map((r) => r.peakBullets))}`);
  const killers: Record<string, number> = {};
  for (const r of dead) killers[r.killer] = (killers[r.killer] ?? 0) + 1;
  console.log('killed by: ' + Object.entries(killers).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', '));
  const hurt: Record<string, number> = {};
  for (const r of rows) for (const [k, v] of Object.entries(r.hurt)) hurt[k] = (hurt[k] ?? 0) + v;
  const ht = Object.values(hurt).reduce((a, b) => a + b, 0) || 1;
  console.log('damage taken: ' + Object.entries(hurt).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${Math.round((100 * v) / ht)}%`).join(', '));
  // Damage share: per run, normalized, then averaged.
  const share: Record<string, number> = {};
  for (const r of rows) {
    const tot = Object.values(r.dealt).reduce((a, b) => a + b, 0) || 1;
    for (const [k, v] of Object.entries(r.dealt)) share[k] = (share[k] ?? 0) + v / tot / n;
  }
  const taken: Record<string, number> = {};
  for (const r of rows) for (const k of Object.keys(r.dealt)) taken[k] = (taken[k] ?? 0) + 1;
  const cond = Object.entries(share).map(([k, v]) => [k, (v * n) / taken[k]] as const).sort((a, b) => b[1] - a[1]);
  console.log('share when held: ' + cond.map(([k, v]) => `${k} ${(100 * v).toFixed(0)}%`).join(', '));
  console.log('damage share (avg per run; runs using): ' + Object.entries(share).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${(100 * v).toFixed(0)}% (${taken[k]})`).join(', '));
}
