// Grove controller: owns the game, wires input -> rules -> animation -> UI.

import { closeOverlay, showCard } from '../shared/cards';
import { copyText, toast } from '../shared/debug';
import { pxToHex, fitHexes, type HexLayout } from '../shared/hexlayout';
import { Timeline } from '../shared/timeline';
import {
  CELLS,
  RULES_VERSION,
  applyAction,
  cellAt,
  encodeAction,
  eq,
  isLegal,
  nameOf,
  newGame,
  onBoard,
  previewAction,
  randomSeed,
  replay,
  upcoming,
  wispPos,
  type Action,
  type Cell,
  type GameState,
  type HandPiece,
  type Hex,
  type Outcome,
} from './core';
import { stepsFor } from './render/anim';
import { drawBoard, drawPiece, type Drawable } from './render/draw';
import { sceneFromState, type Scene } from './render/scene';
import { load, save } from './storage';

interface SavedGame {
  seed: number;
  actions: string;
  v: number;
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export function pieceName(p: Drawable): string {
  switch (p.kind) {
    case 'plant':
    case 'stone':
      return nameOf(p.kind, p.tier);
    case 'wisp':
      return 'Wisp';
    case 'crystal':
      return 'Crystal';
    case 'bolt':
      return 'Bolt';
  }
}

const PIECE_HELP: Record<string, string> = {
  plant: '3 touching identical pieces merge into the next tier where the last one lands.',
  stone: 'Trapped wisps become stones. 3 stones make a Cairn, 3 cairns a Monolith.',
  wisp: 'Wanders one hex per turn (the arrow shows where). With no empty neighbor it turns to stone.',
  crystal: 'Becomes whatever makes the best merge where you put it — or a stone.',
  bolt: 'Clears any piece. Zap a wisp to turn it into a stone.',
};

export class Game {
  private state!: GameState;
  private run!: SavedGame;
  private scene!: { current: Scene };
  private timeline = new Timeline();
  private ctx: CanvasRenderingContext2D;
  private layout: HexLayout = { size: 30, ox: 0, oy: 0 };
  private w = 0;
  private h = 0;
  private selected: Hex | null = null;
  private outcome: Outcome | null = null;
  private inspect: Hex | null = null;
  private last = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    new ResizeObserver(() => this.resize()).observe(canvas.parentElement!);
    this.resize();
    this.bindInput();
    $('stashBtn').onclick = () => {
      if (!this.timeline.busy && this.state.status === 'playing') this.commit({ type: 'swap' });
    };
    requestAnimationFrame((t) => this.frame(t));
  }

  // ---------- lifecycle ----------

  start(seed: number, actions = ''): void {
    let s: GameState;
    try {
      s = replay(seed, actions);
    } catch {
      actions = '';
      s = newGame(seed);
    }
    this.timeline.cancel();
    this.run = { seed, actions, v: RULES_VERSION };
    this.state = s;
    this.scene = { current: sceneFromState(s) };
    this.clearSelection();
    this.persist();
    this.refreshUi();
    if (s.status === 'over') this.showGameOver();
  }

  newGame(): void {
    closeOverlay();
    this.start(randomSeed());
  }

  private persist(): void {
    save('game', this.state.status === 'playing' ? this.run : null);
    if (this.state.score > load<number>('best', 0)) save('best', this.state.score);
  }

  // ---------- input ----------

  private bindInput(): void {
    let down: { x: number; y: number; id: number } | null = null;
    this.canvas.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY, id: e.pointerId }));
    this.canvas.addEventListener('pointerup', (e) => {
      if (!down || down.id !== e.pointerId) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      down = null;
      if (moved > 16) return;
      const r = this.canvas.getBoundingClientRect();
      this.tap(e.clientX - r.left, e.clientY - r.top);
    });
    this.canvas.addEventListener('pointercancel', () => (down = null));
  }

  private tap(x: number, y: number): void {
    if (this.timeline.busy || this.state.status !== 'playing') return;
    const h = pxToHex(this.layout, x, y);
    const s = this.state;
    if (!onBoard(s, h)) {
      this.clearSelection();
      this.refreshUi();
      return;
    }
    const a: Action = { type: 'place', at: h };
    const bolt = s.current.kind === 'bolt';
    if (isLegal(s, a) && (bolt || cellAt(s, h) === null)) {
      if (this.selected && eq(this.selected, h)) {
        this.commit(a);
        return;
      }
      this.clearSelection();
      this.selected = h;
      this.outcome = previewAction(s, a);
      navigator.vibrate?.(8);
    } else {
      this.clearSelection();
      this.inspect = h;
    }
    this.refreshUi();
  }

  private clearSelection(): void {
    this.selected = null;
    this.outcome = null;
    this.inspect = null;
  }

  private commit(a: Action): void {
    const prev = this.state;
    const { state, events } = applyAction(prev, a);
    this.run.actions += encodeAction(a);
    this.state = state;
    this.clearSelection();
    this.persist();
    this.refreshUi(true);
    this.timeline.play(stepsFor(events, () => this.scene.current), () => {
      this.scene.current = sceneFromState(state, this.scene.current);
      this.refreshUi();
      if (state.status === 'over') setTimeout(() => this.state === state && this.showGameOver(), 400);
    });
  }

  // ---------- UI ----------

  private refreshUi(busy = false): void {
    const s = this.state;
    $('score').textContent = s.score.toLocaleString();
    $('best').textContent = Math.max(load<number>('best', 0), s.score).toLocaleString();
    this.drawSlot('curCanvas', s.current, 64);
    this.drawSlot('stashCanvas', s.stash, 52);
    this.drawSlot('nextCanvas', upcoming(s), 52);
    $('curLabel').textContent = pieceName(s.current);

    const info = $('info');
    const btn = $<HTMLButtonElement>('actBtn');
    btn.hidden = true;
    if (busy) {
      info.innerHTML = '';
      return;
    }
    if (s.status === 'over') {
      info.innerHTML = `<div class="title">Board full.</div>Final score ${s.score.toLocaleString()}.`;
      return;
    }
    if (this.selected && this.outcome) {
      const o = this.outcome;
      const parts: string[] = [];
      if (o.crystal) parts.push(`Becomes ${nameOf(o.crystal.kind, o.crystal.tier)}`);
      if (o.creates) parts.push(`<span class="good">Makes ${nameOf(o.creates.kind, o.creates.tier)}</span>`);
      if (o.trapped) parts.push(`<span class="good">Traps ${o.trapped} wisp${o.trapped > 1 ? 's' : ''}</span>`);
      if (s.current.kind === 'bolt') {
        const c = cellAt(s, this.selected);
        parts.push(c ? `Zap ${pieceName(c)}` : 'Fizzles on an empty hex');
      }
      parts.push(o.points > 0 ? `+${o.points}` : 'No points');
      if (o.over) parts.push('<span class="bad">Fills the board</span>');
      info.innerHTML = `<div class="title">${parts.join(' · ')}</div>Tap again or press Place.`;
      btn.hidden = false;
      btn.textContent = 'Place';
      btn.onclick = () => this.selected && this.commit({ type: 'place', at: this.selected });
      return;
    }
    if (this.inspect) {
      const c: Cell = cellAt(s, this.inspect);
      if (c) {
        info.innerHTML = `<div class="title">${pieceName(c)}</div>${PIECE_HELP[c.kind]}`;
        return;
      }
    }
    const p = s.current;
    info.innerHTML = `<div class="title">Place a ${pieceName(p)}</div>${PIECE_HELP[p.kind]}`;
  }

  private drawSlot(id: string, p: HandPiece | null, css: number): void {
    const c = $<HTMLCanvasElement>(id);
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    c.width = Math.round(css * dpr);
    c.height = Math.round(css * dpr);
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, css, css);
    if (p) drawPiece(ctx, css / 2, css / 2 - 2, css * 0.55, p, 0);
  }

  showHelp(): void {
    showCard(
      `<h2>How to play Grove</h2>
      <ul>
        <li><b>Tap an empty hex</b> to preview, <b>tap again</b> (or press Place) to place the piece shown in the tray.</li>
        <li><b>3 or more touching identical pieces merge</b> into the next tier, right where the last one landed. Merges can chain. Bigger groups score more.</li>
        <li><span class="c-plant">Seed → Sprout → Bush → Tree → Grove → Spirit Tree</span></li>
        <li><span class="c-wisp">Wisps</span> wander one hex per turn — the little arrow shows their next step. A wisp with no empty neighbor turns to <span class="c-stone">stone</span>. Stone → Cairn → Monolith, worth a lot.</li>
        <li><span class="c-crystal">Crystal</span>: becomes whatever makes the best merge where you put it.</li>
        <li><span class="c-bolt">Bolt</span>: clears any piece; zap a wisp to turn it to stone.</li>
        <li><b>Stash</b>: tap it to set the current piece aside, or swap it back later.</li>
        <li>The game ends when the board is full.</li>
      </ul>`,
      [{ label: 'Got it', primary: true, onClick: closeOverlay }],
    );
    save('seenHelp', true);
  }

  showMenu(): void {
    showCard(
      `<h2>Grove</h2><p>Score ${this.state.score.toLocaleString()} · Best ${load<number>('best', 0).toLocaleString()} · Seed ${this.run.seed}</p>`,
      [
        { label: 'Resume', primary: true, onClick: closeOverlay },
        { label: 'How to play', onClick: () => this.showHelp() },
        { label: 'Copy bug report', onClick: () => this.copyReport() },
        { label: 'All games', onClick: () => (location.href = '../') },
        { label: 'Abandon game & start new', onClick: () => this.newGame() },
      ],
    );
  }

  private showGameOver(): void {
    const best = load<number>('best', 0);
    showCard(
      `<h2>The grove is full</h2><p>Score ${this.state.score.toLocaleString()} · Best ${best.toLocaleString()} · Biggest plant: ${nameOf('plant', this.state.bestTier)} · ${this.state.turn} turns</p>`,
      [
        { label: 'New game', primary: true, onClick: () => this.newGame() },
        { label: 'Copy bug report', onClick: () => this.copyReport() },
        { label: 'All games', onClick: () => (location.href = '../') },
      ],
      false,
    );
  }

  private async copyReport(): Promise<void> {
    const ua = navigator.userAgent.replace(/\s+/g, ' ');
    const text = `GROVE build=${__BUILD_ID__} rules=${RULES_VERSION} seed=${this.run.seed} a=${this.run.actions || '-'} screen=${innerWidth}x${innerHeight}@${devicePixelRatio} ua="${ua}"`;
    toast((await copyText(text)) ? 'Bug report copied — paste it in chat' : 'Copy failed');
  }

  // ---------- rendering ----------

  private resize(): void {
    const parent = this.canvas.parentElement!;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.w = parent.clientWidth;
    this.h = parent.clientHeight;
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.layout = fitHexes(CELLS, this.w, this.h);
  }

  private frame(t: number): void {
    requestAnimationFrame((tt) => this.frame(tt));
    const dt = Math.min(50, t - (this.last || t));
    this.last = t;
    if (!this.scene || this.w < 1 || this.h < 1) return;
    try {
      this.timeline.update(dt);
      const sc = this.scene.current;
      for (const f of sc.floaters) f.age += dt;
      sc.floaters = sc.floaters.filter((f) => f.age < f.life);
      const idle = !this.timeline.busy && this.state.status === 'playing';
      const s = this.state;
      drawBoard(
        this.ctx,
        this.w,
        this.h,
        this.layout,
        CELLS,
        sc,
        {
          plans: idle
            ? s.wisps.flatMap((w) => {
                const from = wispPos(s, w.id);
                return from && w.plan ? [{ from, to: w.plan }] : [];
              })
            : [],
          selected: idle ? this.selected : null,
          outcome: idle ? this.outcome : null,
          ghost: idle ? s.current : null,
          targets: idle && s.current.kind === 'bolt' ? CELLS.filter((h) => cellAt(s, h) !== null) : [],
        },
        t,
      );
    } catch (err) {
      this.timeline.cancel();
      this.scene = { current: sceneFromState(this.state) };
      this.refreshUi();
      setTimeout(() => {
        throw err;
      });
    }
  }
}
