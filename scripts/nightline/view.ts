// Nightline projection probe: where the road and traffic land on screen.
// Run: npx vite-node scripts/nightline/view.ts [width] [height] [dump seed seconds]
// Prints, for flat road at cruising speed, the row each segment ahead lands on, how tall a car there is
// drawn and how far apart the lanes are, for v3's camera and v2's (100-degree view from ~380 behind).
// With `dump`, it drives the bot for that many seconds on that seed and prints the frame as text.
import { makeGrid } from '../../src/shared/ascii';
import { MAX_SPEED, ROAD_HALF_COLS, SEG_LEN } from '../../src/nightline/core';
import { CAM_DIST, KICK_CLOSE, ROAD_W, advanceSky, camDepth, camHeight, carBottomRow, drawRace, roadAtCar, type SkyState, type View } from '../../src/nightline/render';
import { autopilot } from './bot';
import { newRace, step } from '../../src/nightline/core';

const W = Number(process.argv[2] ?? 412);
const H = Number(process.argv[3] ?? 839);
// As in game.ts resize(): ~64 columns, monospace cells ~0.6 as wide as tall.
const ch = Math.max(9, Math.round(W / 64 / 0.6));
const cw = ch * 0.6;
const cols = Math.floor(W / cw);
const rows = Math.floor(H / ch);
const v: View = { cols, rows, cw, ch, horizon: Math.round(rows * 0.32) };
const halfW = (cols * cw) / 2;
const below = (carBottomRow(v) - v.horizon) * ch;
const kick = 0.7; // cruising at top speed

function table(name: string, D: number, camH: number, roadPx: number): void {
  const d0 = (D * camH * halfW) / below;
  console.log(`\n${name}: camera ${Math.round(d0)} behind, ${Math.round(camH)} up, ${((2 * Math.atan(1 / D) * 180) / Math.PI).toFixed(0)} deg across; road at the car ${((2 * roadPx) / W).toFixed(2)} screens wide`);
  console.log('  seg   s ahead  row (from horizon)  car rows  lane gap cols');
  for (const n of [0, 5, 10, 20, 30, 40, 60, 80, 120, 170]) {
    const dz = d0 + n * SEG_LEN;
    const scale = D / dz;
    const y = scale * camH * halfW;
    const w = scale * ROAD_W * halfW;
    console.log(`  ${String(n).padStart(3)}  ${((n * SEG_LEN) / MAX_SPEED).toFixed(2).padStart(6)}   ${(y / ch).toFixed(1).padStart(6)}            ${((8 * w) / roadPx).toFixed(1).padStart(5)}    ${((0.62 * w) / cw).toFixed(1).padStart(5)}`);
  }
}

console.log(`${W}x${H}: ${cols} cols x ${rows} rows (cell ${cw.toFixed(1)}x${ch}), horizon row ${v.horizon}, car bottom row ${carBottomRow(v)}`);
table('v3', camDepth(v, CAM_DIST * (1 - KICK_CLOSE * kick)), camHeight(v), roadAtCar(v));
{
  // v2: 100-degree view, camera height 1000 scaled for the old 0.42 horizon; road at the car 2 x below(0.42) wide.
  const D = (1 / Math.tan((50 * Math.PI) / 180)) * (1 - 0.22 * kick);
  const belowRef = (carBottomRow(v) - Math.round(rows * 0.42)) * ch;
  table('v2', D, (1000 * below) / belowRef, (ROAD_W * belowRef) / 1000);
}
console.log(`\nroad half-width at the car: ${ROAD_HALF_COLS} cols (${(roadAtCar(v)).toFixed(0)} px)`);

if (process.argv[4] === 'dump') {
  const r = newRace(Number(process.argv[5] ?? 1));
  const secs = Number(process.argv[6] ?? 20);
  const s2: SkyState = { offset: 0 };
  while (r.time < secs && r.status === 'racing') {
    step(r, autopilot(r));
    advanceSky(s2, r);
    r.fx.length = 0;
  }
  const g = makeGrid(cols, rows);
  drawRace(g, r, v, s2, r.time);
  for (let rr = 0; rr < rows; rr++) {
    let line = '';
    for (let c = 0; c < cols; c++) line += g.ch[rr * cols + c];
    console.log(line);
  }
}
