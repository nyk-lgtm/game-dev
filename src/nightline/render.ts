// Pseudo-3D road in ASCII. Segments are projected near-to-far with a
// shrinking clip line (so hills hide what's behind them); sprites are drawn
// far-to-near on top, clipped by the road in front of them.

import { blitArt, clearGrid, put, text, type Art, type Grid } from '../shared/ascii';
import { FORK_SIGN, PLAYER_BOOST, PLAYER_CAR, PROPS, SKYLINES, TRAFFIC } from './art';
import { SEG_LEN, segmentAt, type BiomeId, type Race } from './core';

export const ROAD_W = 2000;
export const CAM_HEIGHT = 1000;
export const CAM_DEPTH = 1 / Math.tan((100 / 2) * (Math.PI / 180));
export const DRAW_DIST = 170;

interface Palette {
  skyTop: string;
  skyBot: string;
  ground: [string, string];
  groundCh: [string, string];
  road: [string, string];
  rumble: [string, string];
  lane: string;
  skyline: string;
  prop: string;
  sun: [string, string] | null;
  stars: boolean;
}

export const PALETTES: Record<BiomeId, Palette> = {
  city: { skyTop: '#05010f', skyBot: '#2a0845', ground: ['#3a2a5a', '#2c2046'], groundCh: ['.', ':'], road: ['#4a4a62', '#38384c'], rumble: ['#ff2a6d', '#e8e8ff'], lane: '#05d9e8', skyline: '#7a3cff', prop: '#b48cff', sun: null, stars: true },
  desert: { skyTop: '#1a0630', skyBot: '#ff6a3d', ground: ['#c98a4b', '#a8703a'], groundCh: ['.', '~'], road: ['#6a5a52', '#57493f'], rumble: ['#ff3b3b', '#ffe9d0'], lane: '#ffd166', skyline: '#5a1e4c', prop: '#7fbf5a', sun: ['#ffd166', '#ff3d8b'], stars: false },
  forest: { skyTop: '#06121a', skyBot: '#2f5d50', ground: ['#2f7a3a', '#246030'], groundCh: [',', '"'], road: ['#5a5f58', '#4a4f48'], rumble: ['#e8e8e8', '#c43b3b'], lane: '#f2f2c0', skyline: '#14382e', prop: '#3fae5a', sun: null, stars: true },
  snow: { skyTop: '#0c1430', skyBot: '#7f9fd8', ground: ['#dfe8f5', '#b8c8e0'], groundCh: ['*', '.'], road: ['#5c6478', '#4c5366'], rumble: ['#ff4d6d', '#ffffff'], lane: '#ffe66d', skyline: '#9fb6e0', prop: '#cfe0ff', sun: null, stars: true },
  coast: { skyTop: '#2b1055', skyBot: '#ff9a8b', ground: ['#e0c27a', '#cfae62'], groundCh: [',', '.'], road: ['#6b5f6f', '#5a4f5e'], rumble: ['#ff6f91', '#fff5e1'], lane: '#ffffff', skyline: '#4a3a6a', prop: '#55c27a', sun: ['#ffe29a', '#ff6f91'], stars: false },
};

const hash = (n: number) => {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  return (Math.imul(h, 0xc2b2ae35) >>> 0) / 4294967296;
};

export interface View {
  cols: number;
  rows: number;
  cw: number;
  ch: number;
  /** Row of the horizon at flat ground. */
  horizon: number;
}

/** Background state that scrolls with the curves. */
export interface SkyState {
  offset: number;
}

export function drawRace(g: Grid, r: Race, v: View, sky: SkyState, time: number): { skyGradient: [string, string]; horizonRow: number } {
  clearGrid(g);
  const p = r.player;
  const base = segmentAt(r, p.z);
  const pal = PALETTES[base.biome];
  const W = v.cols * v.cw;
  const halfW = W / 2;
  const basePct = (p.z % SEG_LEN) / SEG_LEN;
  const nextY = r.segments[base.index + 1]?.y ?? base.y;
  const playerY = base.y + (nextY - base.y) * basePct;
  const camY = playerY + CAM_HEIGHT;
  const camX = p.x * ROAD_W;
  const horizonPx = v.horizon * v.ch;

  // ---- sky: stars, sun, skyline ----
  if (pal.stars)
    for (let i = 0; i < 70; i++) {
      const c = Math.floor(hash(i * 3 + 1) * v.cols);
      const rr = Math.floor(hash(i * 7 + 5) * (v.horizon - 6));
      const tw = Math.sin(time * 2 + i) > 0.6;
      put(g, rr, c, tw ? '*' : '.', tw ? '#ffffff' : '#8890b0');
    }
  if (pal.sun) {
    // Synthwave sun: striped disc sitting on the horizon.
    const R = Math.round(v.cols * 0.2);
    const cx = Math.round(v.cols / 2 + (((-sky.offset * 0.3) % v.cols) + v.cols) % v.cols - v.cols / 2) ;
    const cy = v.horizon - 2;
    for (let dy = -R; dy <= 0; dy++) {
      const row = cy + Math.round(dy * 0.55);
      const halfC = Math.round(Math.sqrt(Math.max(0, R * R - dy * dy)));
      const stripe = dy > -R * 0.45 && (dy & 1) === 0;
      if (stripe) continue;
      const t = (dy + R) / R;
      for (let c = cx - halfC; c <= cx + halfC; c++) put(g, row, c, '=', t > 0.6 ? pal.sun[1] : pal.sun[0]);
    }
  } else if (pal.stars) {
    const mx = Math.round(v.cols * 0.75 - (sky.offset * 0.2) % v.cols);
    for (const [dr, s] of [[0, ' .--. '], [1, '(    )'], [2, " '--' "]] as [number, string][]) text(g, 4 + dr, mx, s, '#e8e0c0');
  }
  const sk = SKYLINES[base.biome];
  const off = Math.floor(sky.offset);
  for (let rr = 0; rr < sk.rows.length; rr++) {
    const row = v.horizon - sk.rows.length + rr;
    const src = sk.rows[rr];
    for (let c = 0; c < v.cols; c++) {
      const chx = src[(((c + off) % src.length) + src.length) % src.length];
      if (chx !== ' ') put(g, row, c, chx, sk.accents?.[chx] ?? pal.skyline);
    }
  }

  // ---- road, near to far ----
  const proj: { x: number; y: number; w: number; scale: number }[] = [];
  let x = 0;
  let dx = -(base.curve * basePct);
  let maxy = v.rows * v.ch;
  const clips: number[] = [];
  /** Project a road-center point; `curveX` is the accumulated curve offset (world units). */
  const project = (curveX: number, wy: number, wz: number) => {
    const scale = CAM_DEPTH / Math.max(1, wz - p.z);
    return {
      x: halfW + scale * (curveX - camX) * halfW,
      y: horizonPx - scale * (wy - camY) * halfW,
      w: scale * ROAD_W * halfW,
      scale,
    };
  };
  for (let n = 0; n < DRAW_DIST; n++) {
    const seg = r.segments[base.index + n];
    if (!seg) break;
    const prevY = r.segments[seg.index - 1]?.y ?? seg.y;
    const p1 = project(x, prevY, seg.z);
    const p2 = project(x + dx, seg.y, seg.z + SEG_LEN);
    x += dx;
    dx += seg.curve;
    proj[n] = p1;
    clips[n] = maxy;
    if (seg.z + SEG_LEN - p.z <= CAM_DEPTH || p2.y >= p1.y || p2.y >= maxy) continue;
    const band = Math.floor(seg.index / 3) % 2;
    const sp = PALETTES[seg.biome];
    const rTop = Math.max(0, Math.ceil(p2.y / v.ch));
    const rBot = Math.min(v.rows - 1, Math.floor(Math.min(p1.y, maxy) / v.ch));
    for (let rr = rTop; rr <= rBot; rr++) {
      const yy = rr * v.ch + v.ch / 2;
      const t = (yy - p2.y) / (p1.y - p2.y);
      const cx = p2.x + (p1.x - p2.x) * t;
      const hw = p2.w + (p1.w - p2.w) * t;
      for (let c = 0; c < v.cols; c++) {
        const u = (c * v.cw + v.cw / 2 - cx) / hw;
        const au = Math.abs(u);
        let chx: string;
        let col: string;
        if (au <= 1) {
          const lane = band === 0 && (Math.abs(au - 1 / 3) < 0.035 || au < 0.02);
          if (lane) [chx, col] = ['|', sp.lane];
          else [chx, col] = [band ? '=' : '-', sp.road[band]];
        } else if (au <= 1.13) [chx, col] = ['#', sp.rumble[band]];
        else {
          // Sparse ground texture so the solid road reads clearly.
          const hsh = hash(c * 17 + seg.index * 29 + rr * 3);
          if (hsh > 0.42) continue;
          [chx, col] = [sp.groundCh[hsh < 0.21 ? 0 : 1], sp.ground[band]];
        }
        put(g, rr, c, chx, col);
      }
    }
    maxy = p2.y;
  }

  // ---- sprites, far to near ----
  for (let n = DRAW_DIST - 1; n >= 0; n--) {
    const seg = r.segments[base.index + n];
    const pr = proj[n];
    if (!seg || !pr) continue;
    const clipRow = Math.floor(clips[n] / v.ch) + 1;
    const sp = PALETTES[seg.biome];
    for (const prop of seg.props) {
      const art: Art = prop.kind === 'fork' ? FORK_SIGN : PROPS[prop.kind];
      const heightHw = prop.kind === 'tower' ? 3.2 : prop.kind === 'palm' || prop.kind === 'pine' || prop.kind === 'snowpine' ? 2.2 : prop.kind === 'lamp' ? 1.8 : prop.kind === 'fork' ? 1.3 : prop.kind === 'billboard' ? 1.6 : 1;
      const rowsH = (pr.w * heightHw * 0.5) / v.ch;
      if (rowsH < 1.2) continue;
      const colX = (pr.x + pr.w * prop.offset) / v.cw;
      const color = prop.kind === 'fork' ? '#ffffff' : sp.prop;
      blitArt(g, art, rowsH, pr.y / v.ch, colX, color, { clipRow, solid: true, maxScale: 3 });
      if (prop.text && rowsH > 4) {
        const scale = Math.min(rowsH / art.rows.length, 3);
        const mid = Math.round(pr.y / v.ch - (art.rows.length * scale) / 2);
        const label = prop.text.slice(0, Math.max(1, Math.floor(art.rows[0].length * scale) - 2));
        if (mid < clipRow) text(g, mid, Math.round(colX - label.length / 2), label, prop.kind === 'fork' ? '#ffd166' : '#ff2a6d');
      }
    }
    for (const car of r.cars) {
      const cn = Math.floor(car.z / SEG_LEN) - base.index;
      if (cn !== n) continue;
      const rowsH = (pr.w * 0.62) / v.ch;
      if (rowsH < 1) continue;
      const colX = (pr.x + pr.w * car.x) / v.cw;
      blitArt(g, TRAFFIC[car.kind % TRAFFIC.length], rowsH, pr.y / v.ch, colX, ['#7fd1ff', '#ffd166', '#b8ff6b', '#ff9ef0'][car.kind % 4], { clipRow, solid: true, maxScale: 2 });
    }
  }

  // ---- the player's car ----
  const art = p.boosting ? PLAYER_BOOST : p.steer < -0.35 ? PLAYER_CAR.left : p.steer > 0.35 ? PLAYER_CAR.right : PLAYER_CAR.straight;
  const offroad = Math.abs(p.x) > 1 && p.speed > 50;
  const bounce = offroad ? Math.round(Math.sin(time * 40)) : 0;
  const carRows = Math.min(art.rows.length * 1.2, v.rows * 0.16);
  // Sit above the on-screen BRAKE/BOOST buttons.
  const carBottom = v.rows - Math.ceil(96 / v.ch);
  blitArt(g, art, carRows, carBottom + bounce, v.cols / 2, '#ff2a6d', { solid: true });

  // Boost streaks.
  if (p.boosting)
    for (let i = 0; i < 14; i++) {
      const rr = v.horizon + 3 + Math.floor(hash(i + Math.floor(time * 30) * 13) * (v.rows - v.horizon - 6));
      const left = hash(i * 3 + Math.floor(time * 30)) < 0.5;
      const c0 = left ? 0 : v.cols - 6;
      text(g, rr, c0, left ? '----  ' : '  ----', '#ffffff');
    }
  sky.offset += base.curve * (p.speed / 8000) * 0.12;
  return { skyGradient: [pal.skyTop, pal.skyBot], horizonRow: v.horizon };
}
