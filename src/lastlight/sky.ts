// The sky strip above the story: storm, the lighthouse, the ship's lantern
// creeping toward the Teeth as the night runs out, and the beam once lit.

import { END_T, type State } from './core/story';

export function drawSky(g: CanvasRenderingContext2D, w: number, h: number, s: State, time: number): void {
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#0a0f1c');
  grad.addColorStop(1, '#16223a');
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  const sea = h * 0.72;
  // Sea with swell.
  g.fillStyle = '#0c1626';
  g.beginPath();
  g.moveTo(0, h);
  for (let x = 0; x <= w; x += 8) g.lineTo(x, sea + Math.sin(x * 0.05 + time * 1.6) * 2.5);
  g.lineTo(w, h);
  g.fill();
  // The Teeth.
  g.fillStyle = '#05080f';
  for (const [x, hh] of [[0.18, 9], [0.22, 14], [0.26, 7]] as const) {
    g.beginPath();
    g.moveTo(w * x - 7, sea + 2);
    g.lineTo(w * x, sea - hh);
    g.lineTo(w * x + 7, sea + 2);
    g.fill();
  }
  // Cliff and lighthouse on the right.
  const lx = w * 0.82;
  g.fillStyle = '#05080f';
  g.beginPath();
  g.moveTo(w * 0.66, h);
  g.lineTo(w * 0.7, sea - 6);
  g.lineTo(w, sea - 16);
  g.lineTo(w, h);
  g.fill();
  g.fillStyle = '#1d2638';
  g.beginPath();
  g.moveTo(lx - 7, sea - 12);
  g.lineTo(lx - 4, sea - 48);
  g.lineTo(lx + 4, sea - 48);
  g.lineTo(lx + 7, sea - 12);
  g.fill();
  const lit = s.f.lit;
  g.fillStyle = lit ? '#ffd77a' : '#2a3448';
  g.fillRect(lx - 5, sea - 56, 10, 8);
  g.fillStyle = '#1d2638';
  g.beginPath();
  g.moveTo(lx - 6, sea - 56);
  g.lineTo(lx, sea - 62);
  g.lineTo(lx + 6, sea - 56);
  g.fill();
  if (lit) {
    // The beam: sweeping if wound, a still glow if not.
    const a = s.f.wound ? Math.PI + Math.sin(time * 0.9) * 0.9 : Math.PI;
    const len = w * 0.9;
    const bx = lx, by = sea - 52;
    const beam = g.createLinearGradient(bx, by, bx + Math.cos(a) * len, by + Math.sin(a) * len * 0.15);
    beam.addColorStop(0, 'rgba(255, 220, 140, 0.55)');
    beam.addColorStop(1, 'rgba(255, 220, 140, 0)');
    g.fillStyle = beam;
    g.beginPath();
    g.moveTo(bx, by);
    g.lineTo(bx + Math.cos(a - 0.07) * len, by + Math.sin(a - 0.07) * len * 0.3);
    g.lineTo(bx + Math.cos(a + 0.07) * len, by + Math.sin(a + 0.07) * len * 0.3);
    g.fill();
    g.fillStyle = 'rgba(255, 215, 122, 0.25)';
    g.beginPath();
    g.arc(lx, sea - 52, 14, 0, Math.PI * 2);
    g.fill();
  }
  // The ship's lantern: from far left toward the Teeth as time runs out (or away once the light turns).
  const k = Math.min(1, s.t / END_T);
  const saved = lit && s.f.wound;
  // Once the light turns, the ship bears away to open water (left).
  const sx = saved ? w * 0.06 : w * (0.02 + 0.16 * k);
  const sy = sea - 3 + Math.sin(time * 1.4) * 2;
  g.fillStyle = '#ffcf7a';
  g.beginPath();
  g.arc(sx, sy, 2.2, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(255, 207, 122, 0.25)';
  g.beginPath();
  g.arc(sx, sy, 6, 0, Math.PI * 2);
  g.fill();
  // Rain.
  g.strokeStyle = 'rgba(160, 180, 210, 0.28)';
  g.lineWidth = 1;
  g.beginPath();
  for (let i = 0; i < 70; i++) {
    const x = ((i * 53.7 + time * 220) % (w + 40)) - 20;
    const y = ((i * 31.3 + time * 520) % (h + 20)) - 10;
    g.moveTo(x, y);
    g.lineTo(x - 5, y + 11);
  }
  g.stroke();
}
