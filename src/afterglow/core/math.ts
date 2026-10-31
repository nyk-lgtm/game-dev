export interface Vec {
  x: number;
  y: number;
}

export const len = (x: number, y: number) => Math.sqrt(x * x + y * y);
export const dist2 = (ax: number, ay: number, bx: number, by: number) => (ax - bx) ** 2 + (ay - by) ** 2;
export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const TAU = Math.PI * 2;
