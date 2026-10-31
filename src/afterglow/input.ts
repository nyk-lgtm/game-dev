// Floating thumbstick: touch anywhere to place it; it follows the thumb past
// its max radius. A small radial dead zone, remapped so motion starts smoothly.
// Arrow keys / WASD work too (for desktop testing).

export const STICK_RADIUS = 56;
const DEAD = 0.12;

export class Stick {
  x = 0;
  y = 0;
  /** Screen-space base and knob, for drawing (null when idle). */
  view: { ox: number; oy: number; x: number; y: number } | null = null;
  private id: number | null = null;
  private keys = new Set<string>();

  constructor(el: HTMLElement) {
    el.addEventListener('pointerdown', (e) => {
      if (this.id !== null) return;
      this.id = e.pointerId;
      this.view = { ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY };
      el.setPointerCapture?.(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.id || !this.view) return;
      const v = this.view;
      let dx = e.clientX - v.ox;
      let dy = e.clientY - v.oy;
      const d = Math.hypot(dx, dy);
      if (d > STICK_RADIUS) {
        // Drag the base along so reversing direction is instant.
        v.ox = e.clientX - (dx / d) * STICK_RADIUS;
        v.oy = e.clientY - (dy / d) * STICK_RADIUS;
        dx = e.clientX - v.ox;
        dy = e.clientY - v.oy;
      }
      v.x = e.clientX;
      v.y = e.clientY;
      const m = Math.min(1, Math.hypot(dx, dy) / STICK_RADIUS);
      if (m < DEAD) {
        this.x = this.y = 0;
        return;
      }
      const k = (m - DEAD) / (1 - DEAD) / (Math.hypot(dx, dy) || 1);
      this.x = dx * k;
      this.y = dy * k;
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== this.id) return;
      this.release();
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    addEventListener('keydown', (e) => this.keys.add(e.key.toLowerCase()));
    addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
  }

  release(): void {
    this.id = null;
    this.view = null;
    this.x = this.y = 0;
  }

  /** Current input vector (keyboard wins if any key is held). */
  read(): { x: number; y: number } {
    const k = this.keys;
    const kx = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0);
    const ky = (k.has('s') || k.has('arrowdown') ? 1 : 0) - (k.has('w') || k.has('arrowup') ? 1 : 0);
    if (kx || ky) {
      const m = Math.hypot(kx, ky);
      return { x: kx / m, y: ky / m };
    }
    return { x: this.x, y: this.y };
  }
}
