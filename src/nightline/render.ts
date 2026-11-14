// Pseudo-3D road in ASCII. Segments are projected near-to-far with a
// shrinking clip line (so hills hide what's behind them); sprites are drawn
// far-to-near on top, clipped by the road in front of them.
import { reducedFx } from '../shared/settings';

import { blitArt, clearGrid, put, text, type Art, type Grid } from '../shared/ascii';
import { FORK_SIGN, PLAYER_BOOST, PLAYER_CAR, PROPS, SKYLINES, TRAFFIC } from './art';
import { MAX_SPEED, ROAD_HALF_COLS, SEG_LEN, STAGES, segmentAt, type BiomeId, type Race } from './core';

/** Road half-width in world units (lateral positions in the core are in these half-widths). */
export const ROAD_W = 2000;
/**
 * How far the camera trails the car (world units) at a standstill; it closes
 * in by up to KICK_CLOSE at speed for a sense of rush. v2 sat ~380 behind
 * (a 100-110 degree view): the next 10 segments filled 60% of the screen and
 * segments 10-170 got ~8 rows. From ~2900 back, with the road at the car
 * ROAD_HALF_COLS wide, segment 40 (one second at top speed) lands ~12 rows
 * below the horizon on a Pixel 7 and a car there is ~2 rows tall.
 */
export const CAM_DIST = 3200;
export const KICK_CLOSE = 0.15;
export const DRAW_DIST = 170;
/** Segments before a fork where the road is split by a painted divider with arrows. */
export const FORK_LEAD = 70;
/** Colors for the gentler (left) and harder (right) branch, shared with the HUD. */
export const EASY_COLOR = '#05d9e8';
export const HARD_COLOR = '#ff2a6d';
/** The fork's painted divider: orange, a colour no traffic car, lane line or arrow uses. */
export const DIVIDER_COLOR = '#ff8c1a';
/** Traffic body colours, by `kind`. */
export const TRAFFIC_COLORS = ['#7fd1ff', '#ffd166', '#b8ff6b', '#ff9ef0'];
const TAIL_LIGHT = '#ff3355';
/** Horizon row as a share of the screen's rows (was 0.42: the road now gets more of the screen). */
export const HORIZON = 0.32;

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
  forest: { skyTop: '#06121a', skyBot: '#2f5d50', ground: ['#2f7a3a', '#246030'], groundCh: [',', '"'], road: ['#5a5f58', '#4a4f48'], rumble: ['#ffffff', '#ff4646'], lane: '#f2f2c0', skyline: '#14382e', prop: '#3fae5a', sun: null, stars: true },
  snow: { skyTop: '#0c1430', skyBot: '#7f9fd8', ground: ['#dfe8f5', '#b8c8e0'], groundCh: ['*', '.'], road: ['#5c6478', '#4c5366'], rumble: ['#ff4d6d', '#ffffff'], lane: '#ffe66d', skyline: '#9fb6e0', prop: '#cfe0ff', sun: null, stars: true },
  coast: { skyTop: '#2b1055', skyBot: '#ff9a8b', ground: ['#e0c27a', '#cfae62'], groundCh: [',', '.'], road: ['#6b5f6f', '#5a4f5e'], rumble: ['#ff6f91', '#fff5e1'], lane: '#ffffff', skyline: '#4a3a6a', prop: '#55c27a', sun: ['#ffe29a', '#ff6f91'], stars: false },
  ember: { skyTop: '#0e0204', skyBot: '#6e1a0c', ground: ['#7a4a3a', '#5e382c'], groundCh: ['.', '`'], road: ['#4e4446', '#3e3638'], rumble: ['#ff7a1a', '#ffe0b0'], lane: '#ffb347', skyline: '#3a1210', prop: '#b08a78', sun: null, stars: true },
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
  /** 0..1 smoothed speed "kick" that widens the field of view as you go faster. */
  kick?: number;
}

/** Scroll the skyline for one simulation step (call once per `step`, not per drawn frame). */
export function advanceSky(sky: SkyState, r: Race): void {
  const p = r.player;
  sky.offset += segmentAt(r, p.z).curve * (p.speed / 8000) * 0.12;
  const target = Math.min(1, p.speed / MAX_SPEED) * 0.7 + (p.boosting ? 0.3 : 0);
  sky.kick = (sky.kick ?? 0) + (target - (sky.kick ?? 0)) * 0.04;
}

/** Road half-width at the player's car, in pixels (ROAD_HALF_COLS columns: cars beside you are drawn 1:1). */
export function roadAtCar(v: View): number {
  return ROAD_HALF_COLS * v.cw;
}

/** Screen row the player's car stands on: above the on-screen BRAKE/BOOST buttons. */
export function carBottomRow(v: View): number {
  return v.rows - Math.ceil(96 / v.ch);
}

/** Pixels between the horizon at row share `h` and the car's bottom row. */
function belowPx(v: View, horizonRow: number): number {
  return Math.max(v.ch, (carBottomRow(v) - horizonRow) * v.ch);
}

/**
 * Camera height for this view: flat road at the car's z projects onto the car
 * sprite's bottom row exactly `roadAtCar` pixels wide (each side), whatever the
 * horizon and screen height, so CAR_HIT_W keeps matching the sprites.
 */
export function camHeight(v: View): number {
  return (ROAD_W * belowPx(v, v.horizon)) / roadAtCar(v);
}

/** How far the camera trails the car now (world units): a little closer at speed. */
export function camDist(sky: SkyState): number {
  return CAM_DIST * (1 - KICK_CLOSE * (sky.kick ?? 0));
}

/**
 * Camera depth (inverse field of view) that puts the camera `dist` behind the
 * car while the car's z still projects onto its bottom row: a long lens
 * (~35 degrees across) from high up, where v2 used a 100-degree view from close.
 */
export function camDepth(v: View, dist = CAM_DIST): number {
  const halfW = (v.cols * v.cw) / 2;
  return (dist * roadAtCar(v)) / (ROAD_W * halfW);
}

/**
 * How far behind the car the camera sits so that flat road at the car's z
 * projects exactly onto the car sprite's bottom row. The race core treats
 * `player.z` as the car's position, so crashes line up with what's drawn.
 */
export function playerDepth(v: View, depth = camDepth(v)): number {
  const halfW = (v.cols * v.cw) / 2;
  return (depth * camHeight(v) * halfW) / belowPx(v, v.horizon);
}

/** Below this many rows a traffic car is drawn as a tail-light badge (`farCar`). */
const FAR_ROWS = 2.5;
/** Traffic smaller than this, in your lane, gets a 'V' marker above it. */
const MARK_ROWS = 5;
/** Lateral distance (road half-widths) at which a car counts as in your lane for the marker. */
const LANE_MARK_W = 0.42;

/**
 * A distant car: `.--.` over `@==@` (tail lights at the ends), one row `@=@`
 * when narrow. Returns its top row.
 */
export function farCar(g: Grid, bottom: number, centerCol: number, widthCols: number, color: string, clipRow: number): number {
  const w = Math.max(3, Math.min(8, Math.round(widthCols)));
  const c0 = Math.round(centerCol - w / 2);
  const row = bottom - 1;
  if (row >= clipRow) return row;
  for (let i = 0; i < w; i++) put(g, row, c0 + i, i === 0 || i === w - 1 ? '@' : '=', i === 0 || i === w - 1 ? TAIL_LIGHT : color);
  if (w < 4 || row - 1 < 0) return row;
  for (let i = 0; i < w; i++) put(g, row - 1, c0 + i, i === 0 || i === w - 1 ? '.' : '-', color);
  return row - 1;
}

/** Ground height at world z (a segment's `y` is its far end). */
function groundY(r: Race, z: number): number {
  const seg = segmentAt(r, z);
  const prevY = r.segments[seg.index - 1]?.y ?? seg.y;
  const t = Math.max(0, Math.min(1, (z - seg.z) / SEG_LEN));
  return prevY + (seg.y - prevY) * t;
}

export function drawRace(g: Grid, r: Race, v: View, sky: SkyState, time: number): { skyGradient: [string, string]; horizonRow: number } {
  clearGrid(g);
  const p = r.player;
  // The camera trails the car; clamp at the start line (there's no road behind it).
  const D = camDepth(v, camDist(sky));
  const camZ = Math.max(0, p.z - playerDepth(v, D));
  const base = segmentAt(r, camZ);
  const pal = PALETTES[segmentAt(r, p.z).biome];
  const W = v.cols * v.cw;
  const halfW = W / 2;
  const basePct = (camZ - base.z) / SEG_LEN;
  // Camera height follows the ground under the car, so the car sits on the road over hills.
  const camY = groundY(r, p.z) + camHeight(v);
  const camX = p.x * ROAD_W;
  const horizonPx = v.horizon * v.ch;
  const roadW = roadAtCar(v);

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
    const mx = Math.round(v.cols * 0.75 - (((sky.offset * 0.2) % v.cols) + v.cols) % v.cols);
    for (const [dr, s] of [[0, ' .--. '], [1, '(    )'], [2, " '--' "]] as [number, string][]) text(g, 4 + dr, mx, s, '#e8e0c0');
  }
  const sk = SKYLINES[segmentAt(r, p.z).biome];
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
  /** Per drawn segment: curve offset and its slope at the segment start, and the start height (for placing cars inside a segment). */
  const segX: number[] = [];
  const segDx: number[] = [];
  const segY0: number[] = [];
  {
    let x = 0;
    let dx = -(base.curve * basePct);
    for (let n = 0; n < DRAW_DIST; n++) {
      const seg = r.segments[base.index + n];
      if (!seg) break;
      segX[n] = x;
      segDx[n] = dx;
      x += dx;
      dx += seg.curve;
    }
    // Re-centre the curve offsets on the car (the camera looks along the road where the car is): with
    // the camera this far back, offsets summed from its own segment would leave the car off the road's
    // centre line in a curve while the race core puts it at p.x.
    const pn = Math.min(segX.length - 1, Math.floor(p.z / SEG_LEN) - base.index);
    const pt = (p.z - (base.index + pn) * SEG_LEN) / SEG_LEN;
    const xp = segX[pn] + segDx[pn] * pt;
    const slope = segDx[pn];
    for (let n = 0; n < segX.length; n++) {
      segX[n] -= xp + slope * (n - pn - pt);
      segDx[n] -= slope;
    }
  }
  let maxy = v.rows * v.ch;
  const clips: number[] = [];
  /** Project a road-center point; `curveX` is the accumulated curve offset (world units). */
  const project = (curveX: number, wy: number, wz: number) => {
    const scale = D / Math.max(1, wz - camZ);
    return {
      x: halfW + scale * (curveX - camX) * halfW,
      y: horizonPx - scale * (wy - camY) * halfW,
      w: scale * ROAD_W * halfW,
      scale,
    };
  };
  const stageEnd = r.stages[r.stage]?.end ?? Infinity;
  const hasFork = r.stage + 1 < STAGES;
  for (let n = 0; n < DRAW_DIST; n++) {
    const seg = r.segments[base.index + n];
    if (!seg) break;
    const prevY = r.segments[seg.index - 1]?.y ?? seg.y;
    const p1 = project(segX[n], prevY, seg.z);
    const p2 = project(segX[n] + segDx[n], seg.y, seg.z + SEG_LEN);
    segY0[n] = prevY;
    proj[n] = p1;
    clips[n] = maxy;
    if (seg.z + SEG_LEN - camZ <= D || p2.y >= p1.y || p2.y >= maxy) continue;
    const band = Math.floor(seg.index / 3) % 2;
    const sp = PALETTES[seg.biome];
    // Approaching a fork: a divider down the middle, arrows on each half. At the goal: a checkered line.
    const toEnd = stageEnd - seg.index;
    const forkPaint = hasFork && toEnd > 0 && toEnd <= FORK_LEAD;
    const arrows = forkPaint && Math.floor(seg.index / 4) % 3 === 0;
    const goal = !hasFork && toEnd >= -3 && toEnd < 1;
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
          if (goal) [chx, col] = ['#', (Math.floor((u + 1) * 8) + seg.index) % 2 ? '#ffffff' : '#30304a'];
          else if (forkPaint && au < 0.03) [chx, col] = ['#', DIVIDER_COLOR];
          else if (arrows && au > 0.4 && au < 0.7) [chx, col] = u < 0 ? ['<', EASY_COLOR] : ['>', HARD_COLOR];
          else if (lane) [chx, col] = ['|', sp.lane];
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
      if (cn !== n || car.z <= camZ) continue;
      // Place the car at its exact z inside the segment so near traffic doesn't hop.
      const t = (car.z - seg.z) / SEG_LEN;
      const pc = project(segX[n] + segDx[n] * t, segY0[n] + (seg.y - segY0[n]) * t, car.z);
      // Drawn to scale against the road: 1:1 where the road is as wide as at the player's car.
      const art = TRAFFIC[car.kind % TRAFFIC.length];
      const k = pc.w / roadW;
      const rowsH = art.rows.length * k;
      const colX = (pc.x + pc.w * car.x) / v.cw;
      const color = TRAFFIC_COLORS[car.kind % TRAFFIC_COLORS.length];
      const bottom = Math.round(pc.y / v.ch);
      let top: number;
      if (rowsH < FAR_ROWS) {
        // Far away the shrunken art is mush: draw a compact, bright tail-light
        // badge instead, at least 3 columns wide, out to the draw distance.
        top = farCar(g, bottom, colX, art.rows[0].length * k, color, clipRow);
      } else {
        blitArt(g, art, rowsH, pc.y / v.ch, colX, color, { clipRow, solid: true, maxScale: 1 });
        top = bottom - Math.min(8, Math.round(rowsH));
      }
      // A car in your lane while it's still small gets a marker above it.
      if (rowsH < MARK_ROWS && n > 4 && Math.abs(car.x - p.x) < LANE_MARK_W && top - 1 < clipRow) put(g, top - 1, Math.round(colX - 0.5), 'V', TAIL_LIGHT);
    }
  }

  // ---- the player's car ----
  const art = p.boosting ? PLAYER_BOOST : p.steer < -0.35 ? PLAYER_CAR.left : p.steer > 0.35 ? PLAYER_CAR.right : PLAYER_CAR.straight;
  const offroad = Math.abs(p.x) > 1 && p.speed > 50;
  const bounce = offroad ? Math.round(Math.sin(time * 40)) : 0;
  // Drawn at 1:1 where it fits: resampling ASCII art doubles letters and lines.
  const carRows = Math.min(art.rows.length, v.rows * 0.16);
  const carBottom = carBottomRow(v);
  blitArt(g, art, carRows, carBottom + bounce, v.cols / 2, '#ff2a6d', { solid: true });

  // Speed streaks: a few faint ones near top speed, a storm while boosting.
  const pct = p.speed / MAX_SPEED;
  const streaks = (p.boosting ? 14 : pct > 0.8 ? Math.round((pct - 0.8) * 30) : 0) * (reducedFx() ? 0.25 : 1);
  for (let i = 0; i < streaks; i++) {
    const rr = v.horizon + 3 + Math.floor(hash(i + Math.floor(time * 30) * 13) * (v.rows - v.horizon - 6));
    const left = hash(i * 3 + Math.floor(time * 30)) < 0.5;
    const c0 = left ? 0 : v.cols - 6;
    text(g, rr, c0, left ? '----  ' : '  ----', p.boosting ? '#ffffff' : '#8890b0');
  }
  return { skyGradient: [pal.skyTop, pal.skyBot], horizonRow: v.horizon };
}
