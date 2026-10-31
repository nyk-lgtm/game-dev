// Uniform-grid spatial hash for enemies, rebuilt every tick. Cells keep their
// arrays between ticks to avoid garbage.

import type { Enemy } from './types';

export class SpatialHash {
  private cells = new Map<number, Enemy[]>();

  constructor(readonly size = 64) {}

  private key(cx: number, cy: number): number {
    return (cx + 50000) * 100000 + (cy + 50000);
  }

  rebuild(enemies: Enemy[]): void {
    if (this.cells.size > 6000) this.cells.clear();
    else for (const a of this.cells.values()) a.length = 0;
    for (const e of enemies) {
      if (!e.alive) continue;
      const k = this.key(Math.floor(e.x / this.size), Math.floor(e.y / this.size));
      let a = this.cells.get(k);
      if (!a) this.cells.set(k, (a = []));
      a.push(e);
    }
  }

  /** Calls fn for every live enemy whose cell overlaps the circle's bounding box. */
  query(x: number, y: number, r: number, fn: (e: Enemy) => void): void {
    const s = this.size;
    const x0 = Math.floor((x - r) / s);
    const x1 = Math.floor((x + r) / s);
    const y0 = Math.floor((y - r) / s);
    const y1 = Math.floor((y + r) / s);
    for (let cx = x0; cx <= x1; cx++)
      for (let cy = y0; cy <= y1; cy++) {
        const a = this.cells.get(this.key(cx, cy));
        if (a) for (let i = 0; i < a.length; i++) if (a[i].alive) fn(a[i]);
      }
  }
}
