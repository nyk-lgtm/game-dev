// Game controller: owns the run, wires input -> rules -> animation -> UI.

import {
  ENEMIES,
  RULES_VERSION,
  applyAction,
  bashTargets,
  encodeAction,
  enemyAt,
  eq,
  isAdjacent,
  inBounds,
  legalMoves,
  newRun,
  previewAction,
  randomSeed,
  replay,
  threats,
  type Action,
  type GameState,
  type Hex,
  type Outcome,
} from './core';
import { copyText, toast } from '../shared/debug';
import { bugReport } from './debug';
import { Animator } from './render/anim';
import { draw } from './render/draw';
import { fitBoard, pxToHex, type Layout } from './render/layout';
import { sceneFromState, type Scene } from './render/scene';
import { load, save } from './storage';
import { HELP_HTML, closeOverlay, enemyIntroHtml, renderHud, renderPanel, showCard } from './ui/dom';

interface SavedRun {
  seed: number;
  actions: string;
  v?: number;
}

export class Game {
  private state!: GameState;
  private run!: SavedRun;
  private scene!: { current: Scene };
  private animator = new Animator({ onPlayerHurt: () => navigator.vibrate?.(60) });
  private ctx: CanvasRenderingContext2D;
  private layout: Layout = { size: 30, ox: 0, oy: 0 };
  private w = 0;
  private h = 0;
  private selected: Hex | null = null;
  private bashSel: Hex | null = null;
  private outcome: Outcome | null = null;
  private inspect: number | null = null;
  private last = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    new ResizeObserver(() => this.resize()).observe(canvas.parentElement!);
    this.resize();
    this.bindInput();
    requestAnimationFrame((t) => this.frame(t));
  }

  // ---------- run lifecycle ----------

  start(seed: number, actions = ''): void {
    let s: GameState;
    try {
      s = replay(seed, actions);
    } catch {
      // Saved run incompatible with the current rules: start it over.
      actions = '';
      s = newRun(seed);
    }
    this.animator.cancel();
    this.run = { seed, actions, v: RULES_VERSION };
    this.state = s;
    this.scene = { current: sceneFromState(s) };
    this.clearSelection();
    this.persist();
    this.refreshUi();
    if (s.status === 'dead') this.showGameOver();
    else this.introduceEnemies();
  }

  newRun(): void {
    closeOverlay();
    this.start(randomSeed());
  }

  private persist(): void {
    save('run', this.state.status === 'playing' ? this.run : null);
    const best = load<number>('best', 0);
    if (this.state.depth > best) save('best', this.state.depth);
  }

  // ---------- input ----------

  private bindInput(): void {
    let down: { x: number; y: number; id: number } | null = null;
    this.canvas.addEventListener('pointerdown', (e) => {
      down = { x: e.clientX, y: e.clientY, id: e.pointerId };
    });
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
    if (this.animator.busy || this.state.status !== 'playing') return;
    const h = pxToHex(this.layout, x, y);
    if (!inBounds(this.state, h)) {
      this.clearSelection();
      this.refreshUi();
      return;
    }
    if (legalMoves(this.state).some((m) => eq(m, h))) {
      if (this.selected && eq(this.selected, h)) {
        this.commit({ type: 'move', to: h });
        return;
      }
      this.clearSelection();
      this.selected = h;
      this.outcome = previewAction(this.state, { type: 'move', to: h });
      navigator.vibrate?.(8);
    } else if (bashTargets(this.state).some((m) => eq(m, h))) {
      // Bash commits only from the panel button, so tapping an enemy to read
      // about it can never shove it by accident.
      this.clearSelection();
      this.bashSel = h;
      this.inspect = enemyAt(this.state, h)?.id ?? null;
      this.outcome = previewAction(this.state, { type: 'bash', target: h });
      navigator.vibrate?.(8);
    } else {
      this.clearSelection();
      const e = enemyAt(this.state, h);
      this.inspect = e ? e.id : null;
    }
    this.refreshUi();
  }

  private clearSelection(): void {
    this.selected = null;
    this.bashSel = null;
    this.outcome = null;
    this.inspect = null;
  }

  private commit(a: Action): void {
    const prev = this.state;
    const { state, events } = applyAction(prev, a);
    this.run.actions += encodeAction(prev, a);
    this.state = state;
    this.clearSelection();
    this.persist();
    renderPanel('', null);
    this.animator.play(this.scene, events, state, () => {
      this.refreshUi();
      if (events.some((e) => e.type === 'descend')) this.introduceEnemies();
      if (state.status === 'dead')
        setTimeout(() => this.state === state && this.showGameOver(), 250);
    });
  }

  // ---------- UI ----------

  private refreshUi(): void {
    const s = this.state;
    renderHud(s);
    if (s.status === 'dead') {
      renderPanel('<span class="title">You fell.</span>', { label: 'New run', onClick: () => this.newRun() });
      return;
    }
    if ((this.selected || this.bashSel) && this.outcome) {
      const o = this.outcome;
      const parts: string[] = [];
      const bashing = this.bashSel !== null;
      const target = bashing ? s.enemies.find((x) => x.id === this.inspect) : undefined;
      if (target) parts.push(`Bash ${ENEMIES[target.kind].name}`);
      if (o.descends) parts.push('<span class="good">Take the stairs</span>');
      if (o.kills.length) parts.push(`<span class="good">Kills ${o.kills.length}</span>`);
      if (o.wounded.length) parts.push(`Wounds ${o.wounded.length}`);
      if (o.dies) parts.push('<span class="bad">You will die</span>');
      else if (o.damageTaken) parts.push(`<span class="bad">You take ${o.damageTaken} damage</span>`);
      else if (!o.descends) parts.push('Safe');
      if (o.healed) parts.push('<span class="good">+1 ♥</span>');
      const act: Action | null = this.selected
        ? { type: 'move', to: this.selected }
        : this.bashSel
          ? { type: 'bash', target: this.bashSel }
          : null;
      const body = target
        ? `${ENEMIES[target.kind].name} ${target.hp}/${target.maxHp} HP: ${ENEMIES[target.kind].blurb}`
        : 'Tap again or press Move.';
      renderPanel(
        `<div class="title">${parts.join(' · ')}</div>${body}`,
        {
          label: bashing ? 'Bash' : 'Move',
          danger: o.damageTaken > 0,
          onClick: () => act && this.commit(act),
        },
      );
      return;
    }
    if (this.inspect !== null) {
      const e = s.enemies.find((x) => x.id === this.inspect);
      if (e) {
        const def = ENEMIES[e.kind];
        const adjacent = isAdjacent(e.pos, s.player.pos);
        const bashNote =
          adjacent && s.player.bashCd > 0 ? `<br><b>Bash ready in ${s.player.bashCd}.</b>` : '';
        renderPanel(`<div class="title">${def.name} · ${e.hp}/${e.maxHp} HP</div>${def.blurb}${bashNote}`, null);
        return;
      }
    }
    if (legalMoves(s).length === 0 && bashTargets(s).length === 0) {
      renderPanel('<div class="title">Boxed in.</div>No moves available.', {
        label: 'Wait',
        onClick: () => this.commit({ type: 'wait' }),
      });
      return;
    }
    const hint =
      s.depth === 1 && s.turn < 3
        ? 'Tap a hex next to you to preview a move. Tap an enemy to learn what it does. Tap an adjacent enemy to Bash it.'
        : 'Reach the stairs. Red = danger.';
    renderPanel(`<div class="title">Depth ${s.depth}</div>${hint}`, null);
  }

  /** First time an enemy kind shows up, explain it. */
  private introduceEnemies(): void {
    const seen = new Set(load<string[]>('seenKinds', ['brute']));
    const fresh = [...new Set(this.state.enemies.map((e) => e.kind))].filter((k) => !seen.has(k));
    if (fresh.length === 0) return;
    fresh.forEach((k) => seen.add(k));
    save('seenKinds', [...seen]);
    showCard(enemyIntroHtml(fresh), [{ label: 'Got it', primary: true, onClick: closeOverlay }]);
  }

  showHelp(): void {
    showCard(HELP_HTML, [{ label: 'Got it', primary: true, onClick: closeOverlay }]);
    save('seenHelp', true);
  }

  showMenu(): void {
    const best = load<number>('best', 0);
    showCard(
      `<h2>Telegraph</h2><p>Depth ${this.state.depth} · Best ${best} · Seed ${this.run.seed}</p>`,
      [
        { label: 'Resume', primary: true, onClick: closeOverlay },
        { label: 'How to play', onClick: () => this.showHelp() },
        { label: 'Copy bug report', onClick: () => this.copyReport() },
        { label: 'All games', onClick: () => (location.href = '../') },
        {
          label: 'Abandon run & start new',
          onClick: () => this.newRun(),
        },
      ],
    );
  }

  private showGameOver(): void {
    const best = load<number>('best', 0);
    showCard(
      `<h2>You fell on depth ${this.state.depth}</h2><p>${this.state.kills} kills · ${this.state.turn} turns · Best depth ${best}</p>`,
      [
        { label: 'New run', primary: true, onClick: () => this.newRun() },
        { label: 'Copy bug report', onClick: () => this.copyReport() },
        { label: 'All games', onClick: () => (location.href = '../') },
      ],
      false,
    );
  }

  private async copyReport(): Promise<void> {
    const ok = await copyText(bugReport(this.run.seed, this.run.actions, this.state.depth));
    toast(ok ? 'Bug report copied — paste it in chat' : 'Copy failed');
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
    this.layout = fitBoard(this.w, this.h, 7, 9);
  }

  private frame(t: number): void {
    // Schedule first so one bad frame can never stop the loop.
    requestAnimationFrame((tt) => this.frame(tt));
    const dt = Math.min(50, t - (this.last || t));
    this.last = t;
    if (!this.scene || this.w < 1 || this.h < 1) return;
    try {
      this.renderFrame(t, dt);
    } catch (err) {
      // Surface the error on screen and unstick the turn rather than freezing.
      this.animator.cancel();
      this.scene = { current: sceneFromState(this.state) };
      this.refreshUi();
      setTimeout(() => {
        throw err;
      });
    }
  }

  private renderFrame(t: number, dt: number): void {
    this.animator.update(dt);
    const sc = this.scene.current;
    sc.shake *= Math.pow(0.001, dt / 1000);
    sc.hurt = Math.max(0, sc.hurt - dt / 500);
    for (const u of sc.units.values()) u.flash = Math.max(0, u.flash - dt / 180);
    for (const f of sc.floaters) f.age += dt;
    sc.floaters = sc.floaters.filter((f) => f.age < f.life);
    const idle = !this.animator.busy && this.state.status === 'playing';
    draw(
      this.ctx,
      this.w,
      this.h,
      this.layout,
      sc,
      {
        legal: idle ? legalMoves(this.state) : [],
        selected: idle ? this.selected : null,
        outcome: idle ? this.outcome : null,
        threats: idle ? threats(this.state) : null,
        inspect: idle ? this.inspect : null,
        bashTargets: idle ? bashTargets(this.state) : [],
        bashSelected: idle ? this.bashSel : null,
      },
      t,
    );
  }
}
