// Game controller: owns the run, wires input -> rules -> animation -> UI.

import {
  ENEMIES,
  RULES_VERSION,
  applyAction,
  bashTargets,
  distanceField,
  key,
  playerWalkable,
  tileAt,
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
  threatsAt,
  type Action,
  type Enemy,
  type GameState,
  type Hex,
  type Outcome,
  type ThreatSource,
} from './core';
import { copyText, toast } from '../shared/debug';
import { dailySeed, enterDaily, leaveDaily, loadDaily, prettyDay, recordDaily, todayKey } from '../shared/daily';
import { pruneDailies, shortDay, streakOf, type DailyResult } from '../shared/streak';
import { bugReport } from './debug';
import { Animator } from './render/anim';
import { draw, setSkin } from './render/draw';
import { fitBoard, pxToHex, type Layout } from './render/layout';
import { SKINS } from './render/palette';
import { sceneFromState, type Scene } from './render/scene';
import { load, save, store } from './storage';
import { HELP_HTML, closeOverlay, enemyIntroHtml, renderHud, renderPanel, showCard } from './ui/dom';

/** In-play hint: a toast over the bottom panel, under menus, clear of the board's top row. */
const hint = (msg: string) => toast(msg).classList.add('hint');

/** A short note on what an enemy is about to do, for the inspect panel. */
function statusOf(e: Enemy): string {
  if (e.staggered) return ' · dazed';
  if (e.aim !== null) return ` · <span class="bad">${e.kind === 'pylon' ? 'zaps after your move' : 'aiming'}</span>`;
  if (e.reload > 0) return ' · resting';
  return e.kind === 'pylon' ? ' · charges after your move' : '';
}

/** "a Brute's smash", "an Archer's arrow"…: who threatens a hex, and how. */
function threatPhrase(s: GameState, t: ThreatSource): string {
  if (t.kind === 'bomb') return t.fuse === 1 ? 'a bomb blast' : `a bomb (in ${t.fuse ?? 2} turns)`;
  const e = s.enemies.find((x) => x.id === t.by);
  const name = e ? ENEMIES[e.kind].name : 'enemy';
  const a = /^[AEIOU]/i.test(name) ? 'an' : 'a';
  const what = { smash: 'smash', shot: 'arrow', charge: 'charge', hook: 'hook', zap: 'zap' }[t.kind];
  return `${a} <span class="c-${e?.kind ?? 'threat'}">${name}</span>'s ${what}`;
}

function threatList(s: GameState, ts: ThreatSource[]): string {
  const parts = ts.map((t) => threatPhrase(s, t));
  return parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
}

interface SavedRun {
  seed: number;
  actions: string;
  v?: number;
  /** The day (YYYY-MM-DD) when this is a daily run. */
  day?: string;
}

/** Daily results by day ('dailies'): the streak and the share line. */
type DailyRecord = DailyResult & { depth: number; kills: number };
const loadDailies = () => load<Record<string, DailyRecord>>('dailies', {});

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** How deep a saved run has got (for "Continue today's daily (depth N)"). */
function replayDepth(r: SavedRun): number {
  try {
    return replay(r.seed, r.actions).depth;
  } catch {
    return 1;
  }
}

/** Spear colours unlocked by a best depth. */
const unlockedSkins = (best: number) => SKINS.filter((k) => best >= k.depth);

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
  /** A hex tapped just to look at it: which enemies threaten it. */
  private probe: Hex | null = null;
  /** A fatal action's button was pressed once; the second press does it. */
  private armed = false;
  private last = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    new ResizeObserver(() => this.resize()).observe(canvas.parentElement!);
    this.resize();
    this.bindInput();
    requestAnimationFrame((t) => this.frame(t));
  }

  // ---------- run lifecycle ----------

  start(seed: number, actions = '', day?: string): void {
    let s: GameState;
    try {
      s = replay(seed, actions);
    } catch {
      // Saved run incompatible with the current rules: start it over.
      actions = '';
      s = newRun(seed);
    }
    this.animator.cancel();
    this.run = { seed, actions, v: RULES_VERSION, ...(day ? { day } : {}) };
    if (day) enterDaily();
    else leaveDaily();
    if (day && !actions) toast(`Daily run · ${prettyDay(day)}`);
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

  /** Today's daily run: resume it if started, else begin it (again, after a fall). */
  playDaily(): void {
    closeOverlay();
    const day = todayKey();
    const saved = load<SavedRun | null>('dailyRun', null);
    if (saved && saved.day === day && saved.v === RULES_VERSION) this.start(saved.seed, saved.actions, day);
    else this.start(dailySeed('telegraph', day), '', day);
  }

  /** Back to your own run from the daily (the saved one, or a new one). */
  private playOwn(): void {
    closeOverlay();
    const saved = load<SavedRun | null>('run', null);
    if (saved && saved.v === RULES_VERSION) this.start(saved.seed, saved.actions);
    else this.start(randomSeed());
  }

  private persist(): void {
    const playing = this.state.status === 'playing';
    // The daily keeps its own slot ('a' mirrors the actions for the hub's "Resume").
    if (this.run.day) save('dailyRun', playing ? { ...this.run, a: this.run.actions } : null);
    else save('run', playing ? this.run : null);
    const best = load<number>('best', 0);
    if (this.state.depth > best) {
      save('best', this.state.depth);
      const fresh = SKINS.find((k) => k.depth > best && k.depth <= this.state.depth);
      if (fresh) hint(`New spear colour: ${fresh.name} (pick it in the menu)`);
    }
  }

  /** A run just ended: a daily records today's best, the streak and the share line. */
  private finish(): void {
    const day = this.run.day;
    if (!day) return;
    const s = this.state;
    recordDaily(store, s.depth * 1000 + Math.min(999, s.kills), `depth ${s.depth}`, day);
    const dailies = loadDailies();
    const prev = dailies[day];
    if (!prev || s.depth > prev.depth || (s.depth === prev.depth && s.kills > prev.kills))
      dailies[day] = { ms: 0, hints: 0, onDay: prev?.onDay || day === todayKey(), depth: s.depth, kills: s.kills };
    pruneDailies(dailies);
    save('dailies', dailies);
  }

  /** A spoiler-free line for today's daily: best depth, kills, streak. */
  shareText(): string {
    const day = this.run.day ?? todayKey();
    const dailies = loadDailies();
    const r = dailies[day];
    const streak = day === todayKey() ? streakOf(dailies) : 0;
    const res = r ? `reached depth ${r.depth} · ${plural(r.kills, 'kill')}` : 'not finished';
    return `Telegraph daily ${shortDay(day)}: ${res}${streak ? ` · 🔥 ${plural(streak, 'day')}` : ''}\n${location.origin}${location.pathname}?daily`;
  }

  private async share(): Promise<void> {
    toast((await copyText(this.shareText())) ? 'Result copied: paste it anywhere' : 'Copy failed');
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
        // A move that hurts only goes through the red button.
        if (this.outcome && (this.outcome.damageTaken > 0 || this.outcome.dies || this.outcome.trapped)) {
          hint(
            this.outcome.dies
              ? 'That move kills you: use the red button if you mean it'
              : this.outcome.trapped
                ? 'That move walks into a bomb trap: press the red button if you mean it'
                : 'That move hurts: press the red button if you mean it',
          );
          return;
        }
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
      if (!e && playerWalkable(tileAt(this.state, h)) && this.state.enemies.length === 0) {
        // Floor cleared: walk there (around any bomb still ticking).
        this.walkTo = h;
        this.walkStep();
        return;
      }
      // Anything else: look at the hex and who threatens it.
      if (!e && !eq(h, this.state.player.pos)) this.probe = h;
    }
    this.refreshUi();
  }

  /**
   * Auto-walk on a cleared floor: one step toward `walkTo`, then the next
   * after it animates. A bomb that is still lit is walked around: each step
   * is the closest one that takes no damage, and if every step would, the
   * walk stops and says so.
   */
  private walkTo: Hex | null = null;
  private walkStep(): void {
    const s = this.state;
    const goal = this.walkTo;
    if (!goal || s.status !== 'playing' || s.enemies.length > 0 || eq(s.player.pos, goal)) {
      this.walkTo = null;
      this.refreshUi();
      return;
    }
    const field = distanceField(s, goal, playerWalkable);
    const here = field.get(key(s.player.pos));
    const steps = legalMoves(s)
      .filter((m) => field.has(key(m)))
      .map((m) => ({ m, d: field.get(key(m))!, hurt: s.bombs.length ? previewAction(s, { type: 'move', to: m }).damageTaken : 0 }))
      .filter((x) => x.hurt === 0 && (s.bombs.length > 0 || x.d < here!))
      .sort((a, b) => a.d - b.d);
    if (here === undefined || steps.length === 0) {
      this.walkTo = null;
      hint(here === undefined ? "Can't reach that" : 'A bomb is about to go off: step clear of its blast first');
      this.refreshUi();
      return;
    }
    this.commit({ type: 'move', to: steps[0].m });
  }

  private clearSelection(): void {
    this.selected = null;
    this.bashSel = null;
    this.outcome = null;
    this.inspect = null;
    this.probe = null;
    this.armed = false;
  }

  private commit(a: Action): void {
    const prev = this.state;
    const { state, events } = applyAction(prev, a);
    this.run.actions += encodeAction(prev, a);
    this.state = state;
    this.clearSelection();
    this.persist();
    if (state.status === 'dead') this.finish();
    renderPanel('', null);
    const depth = prev.depth;
    this.animator.play(this.scene, events, state, () => {
      if (this.walkTo && state.depth === depth) {
        this.walkStep();
        return;
      }
      this.walkTo = null;
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
      // Only your own blows count as yours (and only they are green).
      const yours = [
        ...(o.kills.length ? [`<span class="good">kill ${o.kills.length}</span>`] : []),
        ...(o.wounded.length ? [`wound ${o.wounded.length}`] : []),
      ];
      if (yours.length) parts.push(`You: ${yours.join(', ')}`);
      const friendly = o.friendlyKills.length + o.friendlyWounds.length;
      if (friendly) parts.push(`<span class="muted">Enemies hit each other: ${friendly}</span>`);
      if (o.hookedTo) parts.push('<span class="bad">Hooked!</span>');
      if (o.dies) parts.push('<span class="bad">You will die</span>');
      else if (o.damageTaken) parts.push(`<span class="bad">You take ${o.damageTaken} damage</span>`);
      else if (o.trapped) parts.push('<span class="bad">Bomb trap</span>');
      else if (!o.descends && o.next.length) parts.push('Safe this turn');
      else if (!o.descends) parts.push('Safe');
      if (o.healed) parts.push('<span class="good">+1 ♥</span>');
      const act: Action | null = this.selected
        ? { type: 'move', to: this.selected }
        : this.bashSel
          ? { type: 'bash', target: this.bashSel }
          : null;
      // Who hurts you (outlined in red on the board), or what aims at you next.
      const hurtBy = o.hurtBy.length ? `Hit by ${threatList(s, o.hurtBy)}. ` : '';
      const then = o.trapped
        ? `<span class="bad">Then a bomb covers you there and every way out gets you hit before it goes off.</span> `
        : o.next.length
          ? `<span class="warn">Then in line for ${threatList(s, o.next)}.</span> `
          : '';
      const body = target
        ? `${hurtBy}${then}${ENEMIES[target.kind].name} ${target.hp}/${target.maxHp} HP: ${ENEMIES[target.kind].blurb}`
        : o.dies
          ? `${hurtBy}This move kills you.`
          : o.damageTaken > 0
            ? `${hurtBy}Press the red button if you mean it.`
            : o.trapped
              ? `${then}Press the red button if you mean it.`
              : `${then}Tap again or press Move.`;
      const verb = bashing ? 'Bash' : 'Move';
      const hurts = o.damageTaken > 0 || o.dies || o.trapped;
      renderPanel(`<div class="title">${parts.join(' · ')}</div>${body}`, {
        label: o.dies
          ? this.armed
            ? 'Sure? You die'
            : `${verb} — you die`
          : o.damageTaken > 0
            ? `${verb} (−${o.damageTaken} ♥)`
            : o.trapped
              ? `${verb} (trap)`
              : verb,
        danger: hurts,
        onClick: () => {
          if (!act) return;
          // A fatal action takes two presses.
          if (o.dies && !this.armed) {
            this.armed = true;
            navigator.vibrate?.(30);
            this.refreshUi();
            return;
          }
          this.commit(act);
        },
      });
      return;
    }
    if (this.probe) {
      const h = this.probe;
      const tile = tileAt(s, h);
      if (tile === 'wall') {
        renderPanel('<div class="title">A wall</div>Nobody walks through it. It stops arrows, charges, hooks and zaps.', null);
        return;
      }
      const ts = threatsAt(threats(s), h);
      if (tile === 'lava') {
        const tt = ts.length ? `<span class="bad">Lava</span>, in line for ${threatList(s, ts)}` : 'Lava';
        renderPanel(`<div class="title">${tt}</div>Nobody walks on it; an enemy shoved or charging into it dies. Arrows and zaps fly over it.`, null);
        return;
      }
      const stairs = eq(h, s.stairs);
      const title = ts.length
        ? `<span class="bad">Threatened</span> by ${threatList(s, ts)}`
        : stairs
          ? 'The stairs'
          : 'No threat here this turn';
      const left = s.enemies.length;
      const body = stairs
        ? `${left} enem${left === 1 ? 'y' : 'ies'} left: clear the floor first to <span class="good">heal 1 ♥</span>. You move one hex per turn.`
        : 'You move one hex per turn: tap a hex next to you.';
      renderPanel(`<div class="title">${title}</div>${body}`, null);
      return;
    }
    if (this.inspect !== null) {
      const e = s.enemies.find((x) => x.id === this.inspect);
      if (e) {
        const def = ENEMIES[e.kind];
        const adjacent = isAdjacent(e.pos, s.player.pos);
        const bashNote =
          adjacent && s.player.bashCd > 0 ? `<br><b>Bash ready in ${s.player.bashCd}.</b>` : '';
        renderPanel(
          `<div class="title">${def.name} · ${e.hp}/${e.maxHp} HP${statusOf(e)}</div>${def.blurb}${bashNote}`,
          null,
        );
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
    renderPanel(`<div class="title">Depth ${s.depth}${this.run.day ? ' · daily run' : ''}</div>${hint}`, null);
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

  /** Spear colour buttons (locked ones say the depth that unlocks them). */
  private skinsHtml(): string {
    const best = load<number>('best', 0);
    const cur = load<string>('skin', SKINS[0].id);
    return `<div class="skins">${SKINS.map(
      (k) =>
        `<button data-skin="${k.id}" class="${k.id === cur ? 'on' : ''}" ${best >= k.depth ? '' : 'disabled'} aria-label="${k.name} spear">` +
        `<span class="dot" style="background:${k.body}"></span>${best >= k.depth ? k.name : `depth ${k.depth}`}</button>`,
    ).join('')}</div>`;
  }

  private wireSkins(): void {
    for (const b of document.querySelectorAll<HTMLButtonElement>('#overlay .skins button')) {
      b.onclick = () => {
        const id = b.dataset.skin!;
        if (!unlockedSkins(load<number>('best', 0)).some((k) => k.id === id)) return;
        save('skin', id);
        setSkin(id);
        for (const o of document.querySelectorAll('#overlay .skins button')) o.classList.toggle('on', o === b);
      };
    }
  }

  showMenu(): void {
    const best = load<number>('best', 0);
    const day = this.run.day;
    const today = todayKey();
    const daily = loadDaily(store);
    const dailyRun = load<SavedRun | null>('dailyRun', null);
    const dailyOn = dailyRun && dailyRun.day === today && dailyRun.v === RULES_VERSION;
    const streak = streakOf(loadDailies());
    const dailyLine = day
      ? `Daily run · ${prettyDay(day)}`
      : `Depth ${this.state.depth} · Best ${best} · Seed ${this.run.seed}`;
    showCard(
      `<h2>Telegraph</h2><p>${dailyLine}${streak ? `<br>🔥 ${plural(streak, 'day')} daily streak` : ''}</p>` +
        `<p style="margin-bottom:0">Spear colour</p>${this.skinsHtml()}`,
      [
        { label: 'Resume', primary: true, onClick: closeOverlay },
        day
          ? { label: 'Back to my own run', onClick: () => this.playOwn() }
          : {
              label: dailyOn
                ? `Continue today’s daily (depth ${replayDepth(dailyRun!)})`
                : `Today’s daily${daily ? ` · best ${daily.label}` : ''}`,
              onClick: () => this.playDaily(),
            },
        ...(daily ? [{ label: 'Copy my daily result', onClick: () => this.share() }] : []),
        { label: 'How to play', onClick: () => this.showHelp() },
        { label: 'Copy bug report', onClick: () => this.copyReport() },
        { label: 'All games', onClick: () => (location.href = '../') },
        {
          label: day ? 'Abandon daily & start a run' : 'Abandon run & start new',
          onClick: () =>
            showCard(
              `<h2>Abandon this run?</h2><p>You're on depth ${this.state.depth}. The run will be lost${day ? ' (you can start today’s daily again)' : ''}.</p>`,
              [
                { label: 'Keep playing', primary: true, onClick: closeOverlay },
                {
                  label: 'Abandon it',
                  onClick: () => {
                    if (day) save('dailyRun', null);
                    this.newRun();
                  },
                },
              ],
            ),
        },
      ],
    );
    this.wireSkins();
  }

  private showGameOver(): void {
    const best = load<number>('best', 0);
    const s = this.state;
    const day = this.run.day;
    if (day) {
      const d = loadDaily(store, day);
      const streak = day === todayKey() ? streakOf(loadDailies()) : 0;
      const streakLine =
        streak > 1 ? `<br>🔥 ${streak}-day streak` : streak === 1 ? '<br>🔥 Streak started: come back tomorrow' : '';
      showCard(
        `<h2>You fell on depth ${s.depth}</h2><p>${plural(s.kills, 'kill')} · ${plural(s.turn, 'turn')}</p>` +
          `<p><b style="color:var(--accent)">Daily run · ${prettyDay(day)}</b>${d ? `<br>Today's best: ${d.label}` : ''}${streakLine}</p>`,
        [
          { label: 'Copy my result', primary: true, onClick: () => this.share() },
          { label: 'Retry today’s daily', onClick: () => this.playDaily() },
          { label: 'Back to my own run', onClick: () => this.playOwn() },
          { label: 'All games', onClick: () => (location.href = '../') },
        ],
        false,
      );
      return;
    }
    const next = SKINS.find((k) => k.depth > best);
    showCard(
      `<h2>You fell on depth ${s.depth}</h2><p>${plural(s.kills, 'kill')} · ${plural(s.turn, 'turn')} · Best depth ${best}` +
        `${next ? `<br><span style="color:var(--muted)">Reach depth ${next.depth} for the ${next.name} spear</span>` : ''}</p>`,
      [
        { label: 'New run', primary: true, onClick: () => this.newRun() },
        { label: 'Today’s daily', onClick: () => this.playDaily() },
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

  /** Enemies to ring in red: who hurts the previewed action, or threatens the looked-at hex. */
  private marked(): number[] {
    if (this.outcome) return this.outcome.hurtBy.map((t) => t.by);
    if (this.probe) return threatsAt(threats(this.state), this.probe).map((t) => t.by);
    return [];
  }

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
        probe: idle ? this.probe : null,
        marked: idle ? this.marked() : [],
        warned: idle && this.outcome ? this.outcome.next.map((t) => t.by) : [],
      },
      t,
    );
  }
}
