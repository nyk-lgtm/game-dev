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
  emptyCells,
  encodeAction,
  eq,
  isLegal,
  mergeSpots,
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
  crystal: 'Becomes whatever makes the best merge where you put it, any tier (next to two Trees, a Tree) — or a stone.',
  bolt: 'Clears any piece, even a Grove. Zap a wisp to turn it into a stone; on an empty hex it fizzles.',
};

/** Pieces a bolt would wreck: Grove and Spirit Tree, Monolith. */
export const isPrecious = (c: Cell): boolean =>
  c !== null && ((c.kind === 'plant' && c.tier >= 4) || (c.kind === 'stone' && c.tier >= 2));

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
  /** Empty hexes where the piece in hand merges at once (refreshed per turn). */
  private hints: Hex[] = [];
  private last = 0;
  /** True while a bolt is aimed at a Grove, Spirit Tree or Monolith (red preview). */
  private destroying = false;

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
    if (!bolt && emptyCells(s).length === 0) {
      // Nowhere to place: keep the "board full" advice up and point at the stash.
      this.clearSelection();
      this.nudgeStash();
      this.refreshUi();
      return;
    }
    if (isLegal(s, a) && (bolt || cellAt(s, h) === null)) {
      if (this.selected && eq(this.selected, h)) {
        this.commit(a);
        return;
      }
      this.clearSelection();
      this.selected = h;
      this.outcome = previewAction(s, a);
      this.destroying = bolt && isPrecious(cellAt(s, h));
      navigator.vibrate?.(this.destroying ? [20, 50, 20] : 8);
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
    this.destroying = false;
  }

  /** Replay the stash's pulse so a tap on a full board visibly points at it. */
  private nudgeStash(): void {
    const b = $('stashBtn');
    b.classList.remove('nudge');
    void b.offsetWidth;
    b.classList.add('nudge');
    navigator.vibrate?.([12, 40, 12]);
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
    $('stashBtn').classList.toggle('empty', !s.stash);
    ($('stashBtn').querySelector('.label') as HTMLElement).textContent = s.stash ? 'Stash' : 'Stash · empty';
    this.drawSlot('nextCanvas', upcoming(s), 52);
    $('curLabel').textContent = pieceName(s.current);
    this.hints = busy ? [] : mergeSpots(s);

    const info = $('info');
    const btn = $<HTMLButtonElement>('actBtn');
    const stashBtn = $('stashBtn');
    btn.hidden = true;
    btn.classList.remove('danger');
    stashBtn.classList.remove('urge');
    if (busy) {
      info.innerHTML = '';
      return;
    }
    if (s.status === 'over') {
      info.innerHTML = `<div class="title">Board full.</div>Final score ${s.score.toLocaleString()}.`;
      btn.hidden = false;
      btn.textContent = 'New game';
      btn.onclick = () => this.newGame();
      return;
    }
    if (this.selected && this.outcome) {
      const o = this.outcome;
      const parts: string[] = [];
      let hint = 'Tap again or press Place.';
      let label = 'Place';
      if (s.current.kind === 'bolt') {
        const c = cellAt(s, this.selected);
        if (!c) {
          parts.push('<span class="bad">Fizzles: wasted</span>');
          hint = 'Nothing to zap: the Bolt is wasted and wisps still move.';
        } else if (this.destroying) {
          parts.push(`<span class="bad">Destroys ${pieceName(c)}</span>`);
          hint = `The ${pieceName(c)} is gone for good. Tap it again (or press Destroy) to zap it.`;
          label = 'Destroy';
        } else if (c.kind === 'wisp') parts.push('Wisp turns to Stone');
        else parts.push(`Clears ${pieceName(c)}`);
      }
      if (o.crystal) parts.push(`Becomes ${nameOf(o.crystal.kind, o.crystal.tier)}`);
      if (o.creates) parts.push(`<span class="good">Makes ${nameOf(o.creates.kind, o.creates.tier)}</span>`);
      if (o.trapped) parts.push(`<span class="good">Traps ${o.trapped} wisp${o.trapped > 1 ? 's' : ''}</span>`);
      parts.push(o.points > 0 ? `+${o.points}` : 'No points');
      if (o.over) parts.push('<span class="bad">Fills the board</span>');
      const placed = o.crystal ?? (s.current.kind === 'plant' ? s.current : null);
      if (o.group === 2 && placed) hint = `Makes a pair: one more ${nameOf(placed.kind, placed.tier)} next to it merges.`;
      info.innerHTML = `<div class="title">${parts.join(' · ')}</div>${hint}`;
      btn.hidden = false;
      btn.textContent = label;
      btn.classList.toggle('danger', this.destroying);
      btn.onclick = () => this.selected && this.commit({ type: 'place', at: this.selected });
      return;
    }
    const p = s.current;
    if (emptyCells(s).length === 0) {
      // The rules only end the game when no Bolt is left; say what keeps it going.
      if (p.kind === 'bolt')
        info.innerHTML = `<div class="title">Board full: zap a piece with your Bolt</div>Tap any piece to clear its hex and make room.`;
      else if (s.stash?.kind === 'bolt') {
        info.innerHTML = `<div class="title">Board full: swap in your Bolt from the stash</div>Tap the Stash, then zap a piece to make room.`;
        stashBtn.classList.add('urge');
      } else info.innerHTML = `<div class="title">Board full</div>No Bolt left to make room.`;
      return;
    }
    if (this.inspect) {
      const c: Cell = cellAt(s, this.inspect);
      if (c) {
        info.innerHTML = `<div class="title">${pieceName(c)}</div>${PIECE_HELP[c.kind]}`;
        return;
      }
    }
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
        <li><b>Tap an empty hex</b> to preview, <b>tap again</b> (or press Place) to place the piece in the tray. Placing scores: Seed +5, Sprout +20, Bush +100.</li>
        <li><b>3+ touching identical pieces merge</b> into the next tier where the last one landed, scoring that tier (4 pieces ×1.5, 5 ×2). Merges chain.</li>
        <li><span class="c-plant">Seed → Sprout → Bush → Tree → Grove → Spirit Tree</span><br><span class="c-stone">Stone → Cairn (+250) → Monolith (+1500)</span></li>
        <li><span class="c-wisp">Wisps</span> step one hex a turn (arrow; a new one waits a turn). <b>All wisps move first</b>, then any with no empty neighbor turns to stone: +50, or +100 each for two or more. So a wisp boxed in by a wisp that steps away goes free. One you drop into a closed hole turns to stone with no trap points.</li>
        <li><span class="c-crystal">Crystal</span>: becomes the best merge where it lands, any tier: next to two Trees it makes a Grove. No merge: a stone.</li>
        <li><span class="c-bolt">Bolt</span>: clears any piece (red warning before a Grove, Spirit Tree or Monolith); a zapped wisp turns to stone; an empty hex fizzles.</li>
        <li><b>Stash</b>: tap to set the piece aside or swap it back. The game ends when the board is full and no Bolt is in hand or stash.</li>
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
        { label: 'See the grove', onClick: closeOverlay },
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
          danger: idle && this.destroying,
          outcome: idle ? this.outcome : null,
          ghost: idle ? s.current : null,
          targets: idle && s.current.kind === 'bolt' ? CELLS.filter((h) => cellAt(s, h) !== null) : [],
          hints: idle && !this.selected ? this.hints : [],
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
