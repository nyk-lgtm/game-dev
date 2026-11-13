// Ninefold controller: drag-to-putt input, shot playback, hole and round flow,
// scorecard, saving and the daily course.

import { closeOverlay, showCard } from '../shared/cards';
import { dailySeed, leaveDaily, loadDaily, recordDaily, todayKey } from '../shared/daily';
import { copyText, toast } from '../shared/debug';
import { randomSeed } from '../shared/rng';
import { makeStore } from '../shared/storage';
import { HOLES, RULES_VERSION, TICK_WRAP, decodeShot, encodeShot, simulate, fmtPar, newRound, play, replay, scoreName, toPar, type Hole, type PlayResult, type Round } from './core';
import { Sounds } from './audio';
import { draw, fitView, type Aim, type Scene, type View } from './render/draw';

export const store = makeStore('ninefold.');
const $ = (id: string) => document.getElementById(id)!;
/** How much of the roll the aim line shows (frames at 60 per second). */
const PREVIEW_FRAMES = 45;

interface Profile {
  rounds: number;
  /** Best round against par. */
  best: number | null;
  aces: number;
  seen: string[];
}
const loadProfile = () => store.load<Profile>('profile', { rounds: 0, best: null, aces: 0, seen: [] });

interface Playback {
  res: PlayResult;
  hole: Hole;
  /** Frame position (fractional). */
  f: number;
  from: { x: number; y: number };
  hitsDone: number;
  /** Clock tick the putt started at. */
  tick: number;
}

const TIPS: Record<string, string> = {
  first: '<b>Drag anywhere and pull back</b>, like a slingshot. The dotted line shows the start of its roll, up to the first bounce. Let go to putt.',
  sand: '<b>Sand</b> soaks up speed. Go round it, or hit harder to get through.',
  water: '<b>Water</b>: the ball is lost, one stroke penalty, and you play again from where you were.',
  slope: '<b>Slopes</b> tilt the ball the way the arrows drift.',
  bumper: '<b>Red bumpers</b> kick the ball back hard. Bank off them.',
  mill: '<b>Windmills</b> never stop turning. Watch the bar, then time your putt past it, or hug a wall where it can’t reach.',
  post: '<b>Stone posts</b> stop a ball dead. Go round them.',
};

export class Game {
  r: Round = newRound(1);
  daily: string | null = null;
  private canvas = $('board') as HTMLCanvasElement;
  private g = this.canvas.getContext('2d')!;
  private view: View = { scale: 1, ox: 0, oy: 0 };
  private aim: Aim | null = null;
  private drag: { x: number; y: number; id: number } | null = null;
  private anim: Playback | null = null;
  private shownHole = 0;
  private sink = 0;
  private splash: Scene['splash'] = null;
  private glow = new Map<number, number>();
  private trail: number[] = [];
  private time = 0;
  private last = 0;
  private banner: { text: string; t: number } | null = null;
  private sfx = new Sounds();
  /** The hole clock in ticks (240/s): windmills turn on it all the time, and a putt records it. */
  private clock = 0;
  /** Where the ball stopped on the hole still being shown (null once it's in the cup). */
  private lastBall: { x: number; y: number } | null = null;

  constructor() {
    new ResizeObserver(() => this.resize()).observe(this.canvas);
    this.canvas.addEventListener('pointerdown', (e) => this.down(e));
    this.canvas.addEventListener('pointermove', (e) => this.move(e));
    this.canvas.addEventListener('pointerup', (e) => this.up(e));
    this.canvas.addEventListener('pointercancel', () => {
      this.drag = null;
      this.aim = null;
    });
    $('cardBtn').onclick = () => this.showScorecard(false);
    requestAnimationFrame((t) => this.frame(t));
  }

  // ---------------------------------------------------------------- rounds

  start(seed: number, actions: string[] = [], daily: string | null = null): void {
    closeOverlay();
    this.daily = daily;
    this.r = replay(seed, actions);
    this.anim = null;
    this.shownHole = this.r.hole;
    this.sink = 0;
    this.trail = [];
    this.splash = null;
    this.resize();
    this.save();
    this.hud();
    this.tip();
    if (this.r.over) this.showScorecard(true);
    else this.announce();
  }

  newCourse(): void {
    leaveDaily();
    this.start(randomSeed());
  }

  playDaily(): void {
    const day = todayKey();
    const saved = store.load<{ v: number; seed: number; a: string; day: string } | null>('dailyRun', null);
    const seed = dailySeed('ninefold', day);
    if (saved && saved.v === RULES_VERSION && saved.day === day && saved.seed === seed) this.start(seed, saved.a ? saved.a.split(',') : [], day);
    else this.start(seed, [], day);
  }

  private save(): void {
    const data = { v: RULES_VERSION, seed: this.r.seed, a: this.r.actions.join(',') };
    if (this.daily) store.save('dailyRun', { ...data, day: this.daily });
    else store.save('run', data);
  }

  // ---------------------------------------------------------------- input

  private toWorld(e: PointerEvent) {
    const b = this.canvas.getBoundingClientRect();
    return { x: e.clientX - b.left, y: e.clientY - b.top };
  }

  private down(e: PointerEvent): void {
    this.sfx.unlock();
    if (this.anim || this.r.over || this.drag) return;
    this.canvas.setPointerCapture(e.pointerId);
    const p = this.toWorld(e);
    this.drag = { x: p.x, y: p.y, id: e.pointerId };
  }

  private move(e: PointerEvent): void {
    if (!this.drag || e.pointerId !== this.drag.id) return;
    const p = this.toWorld(e);
    const dx = this.drag.x - p.x, dy = this.drag.y - p.y;
    const full = Math.min(this.canvas.clientWidth, this.canvas.clientHeight) * 0.42;
    const power = Math.min(1, Math.hypot(dx, dy) / full);
    this.aim = power < 0.02 ? null : this.preview(Math.atan2(dy, dx), power);
    $('info').innerHTML = this.aim ? `Power <b>${Math.round(power * 100)}%</b> · drag back to the start to cancel` : 'Pull back further to aim, or let go to cancel.';
  }

  /** Where the putt would really go, up to its first knock (as the shot will be saved: quantized). */
  private preview(angle: number, power: number): Aim {
    const hole = this.r.holes[this.r.hole];
    const shot = decodeShot(encodeShot({ angle, power, tick: hole.mills.length ? Math.round(this.clock) : 0 }))!;
    const res = simulate(hole, this.r.ball, shot);
    // Only the start of the roll: up to the first knock (any rail, post or windmill) or ~0.75 s,
    // and never whether it drops; reading the green is still the player's job.
    const knock = res.hits.length ? res.hits[0].f : Infinity;
    const last = res.frames.length / 2 - 1;
    const end = Math.min(last, knock, PREVIEW_FRAMES);
    const path = res.frames.slice(0, (end + 1) * 2);
    const stops = end === last && res.outcome === 'rest';
    return { angle, power, path, stops: end < knock && stops };
  }

  private up(e: PointerEvent): void {
    if (!this.drag || e.pointerId !== this.drag.id) return;
    this.drag = null;
    const aim = this.aim;
    this.aim = null;
    if (!aim) {
      this.tip();
      return;
    }
    this.sfx.putt(aim.power);
    const hole = this.r.holes[this.r.hole];
    this.shoot(encodeShot({ ...aim, tick: hole.mills.length ? Math.round(this.clock) : 0 }));
  }

  private shoot(action: string): void {
    const hole = this.r.holes[this.r.hole];
    const from = { ...this.r.ball };
    const res = play(this.r, action);
    if (!res) return;
    navigator.vibrate?.(10);
    this.anim = { res, hole, f: 0, from, hitsDone: 0, tick: decodeShot(action)?.tick ?? 0 };
    this.trail = [];
    this.save();
    this.hud(true);
    $('info').innerHTML = '&nbsp;';
  }

  // ---------------------------------------------------------------- frame loop

  private resize(): void {
    const dpr = Math.min(3, devicePixelRatio || 1);
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.view = fitView(this.r.holes[this.shownHole], w, h);
  }

  private frame(t: number): void {
    const dt = Math.min(0.05, (t - (this.last || t)) / 1000);
    this.last = t;
    this.time += dt;
    if (!this.anim) this.clock = (this.clock + dt * 240) % TICK_WRAP;
    // Windmills keep turning while you hold a putt: keep its preview in step.
    if (this.aim && this.drag && this.r.holes[this.r.hole].mills.length) this.aim = this.preview(this.aim.angle, this.aim.power);
    for (const [k, v] of this.glow) this.glow.set(k, Math.max(0, v - dt * 3));
    if (this.splash) {
      this.splash.t += dt * 1.5;
      if (this.splash.t >= 1) this.splash = null;
    }
    let ball: { x: number; y: number } | null = this.r.over && !this.anim ? null : this.shownHole !== this.r.hole && !this.anim ? this.lastBall : this.r.ball;
    const hole = this.anim ? this.anim.hole : this.r.holes[this.shownHole];
    const pb = this.anim;
    if (pb) {
      const fr = pb.res.frames;
      const n = fr.length / 2;
      pb.f = Math.min(n - 1, pb.f + dt * 60);
      const i = Math.floor(pb.f), k = pb.f - i;
      const j = Math.min(n - 1, i + 1);
      ball = { x: fr[i * 2] + (fr[j * 2] - fr[i * 2]) * k, y: fr[i * 2 + 1] + (fr[j * 2 + 1] - fr[i * 2 + 1]) * k };
      this.trail.push(ball.x, ball.y);
      if (this.trail.length > 40) this.trail.splice(0, 2);
      while (pb.hitsDone < pb.res.hits.length && pb.res.hits[pb.hitsDone].f <= pb.f) {
        const hit = pb.res.hits[pb.hitsDone++];
        if (hit.bumper) {
          let bi = 0, bd = 1e9;
          hole.posts.forEach((p, q) => {
            const d = Math.hypot(p.x - ball!.x, p.y - ball!.y);
            if (p.bumper && d < bd) {
              bd = d;
              bi = q;
            }
          });
          this.glow.set(bi, 1);
          navigator.vibrate?.(8);
          this.sfx.boing();
        } else this.sfx.knock(hit.v);
      }
      if (pb.f >= n - 1) {
        if (pb.res.outcome === 'sunk') {
          this.sink = Math.min(1, this.sink + dt * 4);
          if (this.sink >= 1) this.finishShot();
        } else this.finishShot();
      }
    } else if (this.trail.length) this.trail.splice(0, 2);
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    const dpr = this.canvas.width / Math.max(1, w);
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw(this.g, w, h, this.view, { hole, ball, trail: this.trail, aim: this.aim, time: this.time, glow: this.glow, sink: this.sink, splash: this.splash, millTick: pb ? pb.tick + pb.f * 4 : this.clock });
    if (this.banner) {
      this.banner.t += dt;
      const a = Math.min(1, this.banner.t * 4, (2.8 - this.banner.t) * 3);
      if (a <= 0) this.banner = null;
      else {
        const g = this.g;
        g.globalAlpha = a;
        g.fillStyle = 'rgba(8, 14, 12, 0.75)';
        g.fillRect(0, h * 0.42, w, 64);
        g.fillStyle = '#f2f0e6';
        g.font = '800 26px system-ui, sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(this.banner.text, w / 2, h * 0.42 + 32);
        g.globalAlpha = 1;
      }
    }
    requestAnimationFrame((tt) => this.frame(tt));
  }

  private finishShot(): void {
    const pb = this.anim!;
    this.anim = null;
    this.clock = (pb.tick + (pb.res.frames.length / 2 - 1) * 4) % TICK_WRAP;
    this.lastBall = pb.res.outcome === 'sunk' ? null : pb.res.outcome === 'water' ? pb.from : { x: pb.res.x, y: pb.res.y };
    const h = pb.hole.n;
    if (pb.res.outcome === 'water') {
      this.splash = { x: pb.res.x, y: pb.res.y, t: 0 };
      toast('Splash! One stroke penalty');
      this.sfx.splash();
      navigator.vibrate?.([20, 40, 20]);
    }
    if (pb.res.finished) {
      const strokes = this.r.strokes[h];
      const name = pb.res.pickedUp ? 'Picked up' : scoreName(strokes, pb.hole.par);
      this.banner = { text: name, t: 0 };
      $('info').innerHTML = `<b>${name}${/[!.]$/.test(name) ? '' : '.'}</b> ${pb.res.pickedUp ? 'after 8 strokes.' : `${strokes} stroke${strokes === 1 ? '' : 's'} on a par ${pb.hole.par}.`} Total ${fmtPar(toPar(this.r))}.`;
      if (strokes === 1) {
        const p = loadProfile();
        p.aces++;
        store.save('profile', p);
      }
      if (!pb.res.pickedUp) {
        navigator.vibrate?.(strokes < pb.hole.par ? [30, 50, 30] : 25);
        this.sfx.cup(strokes < pb.hole.par);
      }
      setTimeout(() => {
        this.sink = 0;
        this.trail = [];
        if (this.r.over) {
          this.endRound();
          return;
        }
        this.shownHole = this.r.hole;
        this.resize();
        this.hud();
        this.tip();
        this.announce();
      }, 1900);
    } else {
      this.hud();
      this.tip();
    }
  }

  private announce(): void {
    const hole = this.r.holes[this.r.hole];
    if (this.r.strokes[this.r.hole] === 0) this.banner = { text: `Hole ${hole.n + 1} · Par ${hole.par}`, t: 0 };
  }

  // ---------------------------------------------------------------- HUD and tips

  private hud(midShot = false): void {
    const r = this.r;
    const h = midShot ? (this.anim?.hole.n ?? r.hole) : this.shownHole;
    const hole = r.holes[h];
    $('holeNo').textContent = `${h + 1}/${HOLES}`;
    $('par').textContent = String(hole.par);
    $('shots').textContent = String(r.strokes[h] ?? 0);
    const tp = toPar(r);
    $('total').textContent = fmtPar(tp);
    $('total').className = `value ${tp < 0 ? 'under' : tp > 0 ? 'over' : ''}`;
    $('dailyTag').hidden = !this.daily;
  }

  private tip(): void {
    if (this.r.over) return;
    const hole = this.r.holes[this.shownHole];
    const p = loadProfile();
    const present = new Set<string>(hole.zones.map((z) => z.kind));
    hole.posts.forEach((q) => present.add(q.bumper ? 'bumper' : 'post'));
    if (hole.mills.length) present.add('mill');
    const fresh = ['first', 'mill', 'water', 'slope', 'bumper', 'sand', 'post'].find((k) => (k === 'first' || present.has(k)) && !p.seen.includes(k));
    if (fresh) {
      p.seen.push(fresh);
      store.save('profile', p);
      $('info').innerHTML = TIPS[fresh];
      return;
    }
    const s = this.r.strokes[this.shownHole];
    $('info').innerHTML = s === 0 ? `Hole ${hole.n + 1}. ${['Read the rails before you putt.', 'Bank shots count the same.', 'Soft putts near the cup: a slow ball drops in.'][hole.n % 3]}` : `Stroke ${s + 1}. Drag back to putt.`;
  }

  // ---------------------------------------------------------------- cards

  private card(): string {
    const r = this.r;
    const cells = (f: (i: number) => string) => [...Array(HOLES).keys()].map((i) => `<td>${f(i)}</td>`).join('');
    const played = (i: number) => i < r.hole || r.over;
    const cls = (i: number) => {
      if (!played(i)) return '';
      const d = r.strokes[i] - r.holes[i].par;
      return d < 0 ? 'under' : d > 0 ? 'over' : '';
    };
    const picked = r.pickedUp.some(Boolean);
    return `<table class="sc"><tr><th>Hole</th>${cells((i) => String(i + 1))}</tr>
      <tr><th>Par</th>${cells((i) => String(r.holes[i].par))}</tr>
      <tr><th>You</th>${[...Array(HOLES).keys()].map((i) => `<td class="${cls(i)}${r.pickedUp[i] ? ' pick' : ''}">${played(i) ? r.strokes[i] : i === r.hole ? '·' : ''}</td>`).join('')}</tr></table>${picked ? '<p class="meta2">Dotted: picked up after 8 strokes.</p>' : ''}`;
  }

  showScorecard(final: boolean): void {
    const r = this.r;
    const p = loadProfile();
    const total = r.strokes.slice(0, HOLES).reduce((a, b) => a + b, 0);
    const tp = toPar(r);
    if (!final) {
      showCard(`<h2>Scorecard</h2>${this.card()}<p>${r.hole} hole${r.hole === 1 ? '' : 's'} played · ${fmtPar(tp)}</p>`, [{ label: 'Back to the course', primary: true, onClick: closeOverlay }]);
      return;
    }
    const daily = this.daily ? loadDaily(store) : null;
    showCard(
      `<h2>${this.daily ? 'Daily course' : 'Round over'}</h2>${this.card()}
       <p class="big">${total} strokes · <b class="${tp < 0 ? 'under' : tp > 0 ? 'over' : ''}">${fmtPar(tp)}</b></p>
       <p class="meta2">${daily ? `Today’s best: ${daily.label}` : `Best round: ${p.best === null ? fmtPar(tp) : fmtPar(p.best)}`} · ${daily ? `${daily.plays} daily round${daily.plays === 1 ? '' : 's'}` : `${p.rounds} round${p.rounds === 1 ? '' : 's'}`} played${p.aces ? ` · ${p.aces} hole${p.aces === 1 ? '' : 's'} in one` : ''}</p>`,
      [
        { label: 'New course', primary: true, onClick: () => this.newCourse() },
        { label: this.daily ? 'Play the daily again' : 'Play this course again', onClick: () => this.start(this.r.seed, [], this.daily) },
        { label: 'All games', onClick: () => (location.href = '../') },
      ],
    );
  }

  private endRound(): void {
    const p = loadProfile();
    const tp = toPar(this.r);
    p.rounds++;
    p.best = p.best === null ? tp : Math.min(p.best, tp);
    store.save('profile', p);
    if (this.daily) recordDaily(store, -tp, fmtPar(tp), this.daily);
    this.hud();
    this.showScorecard(true);
  }

  showHelp(): void {
    store.save('seenHelp', true);
    showCard(
      `<h2>Ninefold</h2>
       <p>Nine holes of mini-golf, grown fresh from a seed every round.</p>
       <ul>
         <li><b>Drag anywhere and pull back</b> to aim, like a slingshot. The farther you pull, the harder the putt; the dotted line shows the start of the roll, up to the first bounce. Let go to play it.</li>
         <li>Sink the ball in as few strokes as you can. <b>Par</b> is a good score; under par is great.</li>
         <li>Sand slows the ball, water costs a stroke, slopes push it sideways, bumpers kick it back. After 8 strokes the ball is picked up.</li>
       </ul>`,
      [{ label: 'Tee off', primary: true, onClick: closeOverlay }],
    );
  }

  showMenu(): void {
    showCard(
      `<h2>Ninefold</h2>${this.card()}`,
      [
        { label: 'Resume', primary: true, onClick: closeOverlay },
        { label: 'How to play', onClick: () => this.showHelp() },
        {
          label: 'New course',
          onClick: () =>
            showCard('<h2>New course?</h2><p>This round will be lost.</p>', [
              { label: 'Keep playing', primary: true, onClick: closeOverlay },
              { label: 'New course', onClick: () => this.newCourse() },
            ]),
        },
        { label: 'Copy bug report', onClick: () => this.copyReport() },
        { label: 'All games', onClick: () => (location.href = '../') },
      ],
    );
  }

  private async copyReport(): Promise<void> {
    toast((await copyText(`NINEFOLD v${RULES_VERSION} seed=${this.r.seed} a=${this.r.actions.join(',')}`)) ? 'Bug report copied' : 'Copy failed');
  }
}
