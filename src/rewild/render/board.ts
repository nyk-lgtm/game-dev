// The island canvas: a cached layer of terrain and plants, redrawn when the
// board changes, under animated sea, animals, highlights and season effects.

import { fitHexes, hexPath, hexToPx, pxToHex, type HexLayout } from '../../shared/hexlayout';
import { HEXES, indexOf, seasonOf, type GameState, type SimEvent, type SpeciesId } from '../core';
import { COLORS, drawAnimal, drawPlant, drawSea, drawTerrain } from './art';

export type Mark = 'good' | 'weak' | 'bad';

interface Fx {
  kind: 'spread' | 'die' | 'grow' | 'ring' | 'burn' | 'text';
  a: number;
  b: number;
  color: string;
  t0: number;
  dur: number;
  text?: string;
}

export class Board {
  private ctx: CanvasRenderingContext2D;
  private layer = document.createElement('canvas');
  private oldLayer = document.createElement('canvas');
  private fadeT0 = -1;
  private L: HexLayout = { size: 20, ox: 0, oy: 0 };
  private w = 0;
  private h = 0;
  private dpr = 1;
  private s: GameState | null = null;
  private wet: number[] = [];
  private fx: Fx[] = [];
  marks = new Map<number, Mark>();
  selected = -1;
  /** Cell marked for this season's lightning. */
  fireAt = -1;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize();
  }

  private resize() {
    const r = this.canvas.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    this.dpr = Math.min(2.5, window.devicePixelRatio || 1);
    this.w = r.width;
    this.h = r.height;
    this.canvas.width = Math.round(r.width * this.dpr);
    this.canvas.height = Math.round(r.height * this.dpr);
    this.L = fitHexes(HEXES, this.w, this.h, 12);
    for (const c of [this.layer, this.oldLayer]) {
      c.width = this.canvas.width;
      c.height = this.canvas.height;
    }
    if (this.s) this.paintLayer();
  }

  get size() {
    return this.L.size;
  }

  center(i: number) {
    const h = HEXES[i];
    return hexToPx(this.L, h.q, h.r);
  }

  cellAt(clientX: number, clientY: number): number {
    const r = this.canvas.getBoundingClientRect();
    return indexOf(pxToHex(this.L, clientX - r.left, clientY - r.top));
  }

  /** New board state. With `fade`, the old layer cross-fades into the new one. */
  set(s: GameState, wet: number[], fade = false, now = 0) {
    if (fade && this.s) {
      const o = this.oldLayer.getContext('2d')!;
      o.setTransform(1, 0, 0, 1, 0, 0);
      o.clearRect(0, 0, this.oldLayer.width, this.oldLayer.height);
      o.drawImage(this.layer, 0, 0);
      this.fadeT0 = now;
    }
    this.s = s;
    this.wet = wet;
    this.paintLayer();
  }

  private paintLayer() {
    const s = this.s!;
    const g = this.layer.getContext('2d')!;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.layer.width, this.layer.height);
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const sea = seasonOf(Math.min(s.season, 19));
    const size = this.L.size;
    // Terrain first (slightly oversized so seams vanish), then plants back to front.
    s.cells.forEach((c, i) => {
      const p = this.center(i);
      drawTerrain(g, p.x, p.y, size + 0.6, c, this.wet[i] ?? 0, sea, i);
    });
    const order = s.cells.map((_, i) => i).sort((a, b) => this.center(a).y - this.center(b).y || a - b);
    for (const i of order) {
      const c = s.cells[i];
      if (!c.plant) continue;
      const p = this.center(i);
      drawPlant(g, p.x, p.y, size, c.plant, sea, i);
    }
  }

  play(events: SimEvent[], now: number) {
    let k = 0;
    const add = (f: Omit<Fx, 't0'>) => {
      if (this.fx.length > 140) return;
      this.fx.push({ ...f, t0: now + Math.min(0.5, k++ * 0.008) });
    };
    for (const e of events) {
      switch (e.type) {
        case 'spread':
          add({ kind: 'spread', a: e.from, b: e.to, color: COLORS[e.id], dur: 0.9 });
          break;
        case 'move':
          add({ kind: 'spread', a: e.from, b: e.to, color: COLORS[e.id], dur: 0.7 });
          break;
        case 'die':
          add({ kind: 'die', a: e.cell, b: 0, color: COLORS[e.id], dur: 1.1 });
          break;
        case 'grow':
          add({ kind: 'grow', a: e.cell, b: 0, color: COLORS[e.id], dur: 0.8 });
          break;
        case 'terraform':
          add({ kind: 'ring', a: e.cell, b: 0, color: e.to === 'pond' ? '#7fc8ff' : e.to === 'marsh' ? '#b6d77a' : '#e8c890', dur: 1.2 });
          break;
        case 'burn':
          add({ kind: 'burn', a: e.cell, b: 0, color: '#ff7a2f', dur: 1.4 });
          break;
        default:
          break;
      }
    }
  }

  floatText(cell: number, text: string, color: string, now: number) {
    this.fx.push({ kind: 'text', a: cell, b: 0, color, t0: now, dur: 1.6, text });
  }

  get busy() {
    return this.fx.length > 0;
  }

  draw(time: number) {
    const g = this.ctx;
    const s = this.s;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    drawSea(g, this.w, this.h, time);
    if (!s) return;
    g.setTransform(1, 0, 0, 1, 0, 0);
    const fade = this.fadeT0 >= 0 ? Math.min(1, (time - this.fadeT0) / 0.8) : 1;
    if (fade < 1) {
      g.globalAlpha = 1;
      g.drawImage(this.oldLayer, 0, 0);
      g.globalAlpha = fade;
    }
    g.drawImage(this.layer, 0, 0);
    g.globalAlpha = 1;
    if (fade >= 1) this.fadeT0 = -1;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    const size = this.L.size;
    const sea = seasonOf(Math.min(s.season, 19));

    // Placement hints.
    if (this.marks.size) {
      const pulse = 0.5 + 0.5 * Math.sin(time * 4);
      g.save();
      for (const [i, m] of this.marks) {
        const p = this.center(i);
        hexPath(g, p.x, p.y, size * 0.9);
        if (m === 'bad') {
          g.fillStyle = 'rgba(20, 10, 10, 0.25)';
          g.fill();
          continue;
        }
        g.fillStyle = m === 'good' ? `rgba(140, 255, 170, ${0.16 + pulse * 0.12})` : `rgba(255, 190, 90, ${0.12 + pulse * 0.1})`;
        g.fill();
        g.lineWidth = 2;
        g.strokeStyle = m === 'good' ? 'rgba(170, 255, 190, 0.85)' : 'rgba(255, 200, 110, 0.7)';
        g.stroke();
      }
      g.restore();
    }

    // Lightning marker.
    if (this.fireAt >= 0 && !s.over) {
      const p = this.center(this.fireAt);
      g.save();
      g.globalAlpha = 0.65 + 0.35 * Math.sin(time * 6);
      g.strokeStyle = '#ffd25e';
      g.lineWidth = 2;
      g.setLineDash([4, 4]);
      g.beginPath();
      g.arc(p.x, p.y, size * 1.9, 0, Math.PI * 2);
      g.stroke();
      g.setLineDash([]);
      g.fillStyle = '#ffd25e';
      g.beginPath();
      const z = size * 0.42;
      g.moveTo(p.x + z * 0.2, p.y - z);
      g.lineTo(p.x - z * 0.45, p.y + z * 0.1);
      g.lineTo(p.x, p.y + z * 0.1);
      g.lineTo(p.x - z * 0.2, p.y + z);
      g.lineTo(p.x + z * 0.45, p.y - z * 0.1);
      g.lineTo(p.x, p.y - z * 0.1);
      g.closePath();
      g.fill();
      g.restore();
    }

    // Animals, back to front.
    const order: number[] = [];
    s.cells.forEach((c, i) => c.animal && order.push(i));
    order.sort((a, b) => HEXES[a].r + HEXES[a].q / 2 - (HEXES[b].r + HEXES[b].q / 2) || a - b);
    for (const i of order) {
      const p = this.center(i);
      drawAnimal(g, p.x, p.y, size, s.cells[i].animal!, sea, time, i);
    }

    if (this.selected >= 0) {
      const p = this.center(this.selected);
      hexPath(g, p.x, p.y, size * 0.95);
      g.lineWidth = 2.5;
      g.strokeStyle = '#ffffff';
      g.stroke();
    }

    this.drawFx(g, time);
  }

  private drawFx(g: CanvasRenderingContext2D, time: number) {
    const size = this.L.size;
    this.fx = this.fx.filter((f) => time - f.t0 < f.dur);
    for (const f of this.fx) {
      const t = (time - f.t0) / f.dur;
      if (t < 0) continue;
      const p = this.center(f.a);
      g.save();
      switch (f.kind) {
        case 'spread': {
          const q = this.center(f.b);
          const e = 1 - (1 - t) * (1 - t);
          const x = p.x + (q.x - p.x) * e;
          const y = p.y + (q.y - p.y) * e - Math.sin(e * Math.PI) * size * 0.8;
          g.globalAlpha = 1 - t * 0.6;
          g.fillStyle = f.color;
          g.shadowColor = f.color;
          g.shadowBlur = 8;
          g.beginPath();
          g.arc(x, y, size * 0.13, 0, Math.PI * 2);
          g.fill();
          break;
        }
        case 'grow': {
          g.globalAlpha = 1 - t;
          g.strokeStyle = f.color;
          g.lineWidth = 2;
          const y = p.y - t * size * 0.7;
          const r = size * 0.14;
          g.beginPath();
          g.moveTo(p.x - r, y);
          g.lineTo(p.x + r, y);
          g.moveTo(p.x, y - r);
          g.lineTo(p.x, y + r);
          g.stroke();
          break;
        }
        case 'die': {
          g.globalAlpha = (1 - t) * 0.8;
          g.fillStyle = 'rgba(40, 30, 30, 0.6)';
          g.beginPath();
          g.arc(p.x, p.y - t * size * 0.4, size * (0.25 + t * 0.35), 0, Math.PI * 2);
          g.fill();
          g.strokeStyle = f.color;
          g.lineWidth = 1.5;
          g.stroke();
          break;
        }
        case 'ring': {
          g.globalAlpha = 1 - t;
          g.strokeStyle = f.color;
          g.lineWidth = 3;
          hexPath(g, p.x, p.y, size * (0.4 + t * 0.8));
          g.stroke();
          break;
        }
        case 'burn': {
          const flick = 0.6 + 0.4 * Math.sin(time * 30 + f.a);
          g.globalAlpha = (1 - t) * flick;
          const grad = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, size);
          grad.addColorStop(0, 'rgba(255, 210, 90, 0.95)');
          grad.addColorStop(0.5, 'rgba(255, 110, 30, 0.6)');
          grad.addColorStop(1, 'rgba(255, 60, 20, 0)');
          g.fillStyle = grad;
          g.beginPath();
          g.arc(p.x, p.y - t * size * 0.5, size, 0, Math.PI * 2);
          g.fill();
          break;
        }
        case 'text': {
          g.globalAlpha = t < 0.8 ? 1 : (1 - t) / 0.2;
          g.font = `800 ${Math.round(size * 0.75)}px system-ui, sans-serif`;
          g.textAlign = 'center';
          g.lineWidth = 4;
          g.strokeStyle = 'rgba(8, 20, 16, 0.85)';
          const y = p.y - size * 0.6 - t * size * 1.2;
          g.strokeText(f.text!, p.x, y);
          g.fillStyle = f.color;
          g.fillText(f.text!, p.x, y);
          break;
        }
      }
      g.restore();
    }
  }
}

export function iconCanvas(id: SpeciesId, css: number, draw: (g: CanvasRenderingContext2D, r: number) => void): HTMLCanvasElement {
  const c = document.createElement('canvas');
  const dpr = Math.min(2.5, window.devicePixelRatio || 1);
  c.width = c.height = Math.round(css * dpr);
  c.style.width = c.style.height = `${css}px`;
  c.dataset.id = id;
  const g = c.getContext('2d')!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  draw(g, css / 2);
  return c;
}
