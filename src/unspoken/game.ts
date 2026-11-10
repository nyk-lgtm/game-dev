// Unspoken controller: owns the run (seed + actions) and builds the page:
// chapters of illustrated panels, the glyph sheet (contexts + meaning
// picker), challenges, the notebook and the ending. Rules live in core/.

import { Sfx } from '../afterglow/audio';
import { closeOverlay, showCard } from '../shared/cards';
import { dailySeed, leaveDaily, loadDaily, prettyDay, recordDaily, todayKey } from '../shared/daily';
import { copyText, toast } from '../shared/debug';
import { makeStore } from '../shared/storage';
import {
  CONCEPT,
  CONCEPTS,
  RULES_VERSION,
  apply,
  contexts,
  encode,
  english,
  grammarNotes,
  morphemes,
  newGame,
  progress,
  realize,
  replay,
  writtenGrammar,
  type Action,
  type Category,
  type Challenge,
  type Frame,
  type Panel,
  type Result,
  type State,
  type Token,
} from './core';
import { glyphCanvas, tokenCanvas } from './render/glyphs';
import { drawScene } from './render/scene';

export const store = makeStore('unspoken.');
const $ = (id: string) => document.getElementById(id)!;

/** Short labels for guesses under glyphs. */
const SHORT: Record<string, string> = {
  ama: 'red woman',
  tor: 'cap boy',
  sef: 'fisher',
  PL: 'many',
  NEG: 'not',
  PAST: 'before',
  FUT: 'later',
  Q: 'what?',
  TO: 'to',
};
const short = (id: string) => SHORT[id] ?? CONCEPT.get(id)!.en;

const TABS: { label: string; cats: Category[] }[] = [
  { label: 'People', cats: ['name', 'person'] },
  { label: 'Animals', cats: ['animal'] },
  { label: 'Things', cats: ['thing'] },
  { label: 'Nature', cats: ['nature'] },
  { label: 'Places', cats: ['place'] },
  { label: 'Actions', cats: ['action'] },
  { label: 'Qualities', cats: ['quality'] },
  { label: 'Grammar', cats: ['grammar'] },
];

type Page = { kind: 'intro' } | { kind: 'panel'; p: Panel } | { kind: 'riddle'; c: Challenge; i: number } | { kind: 'next' };
type Backdrop = State['world']['chapters'][number]['backdrop'];
const PLACE: Record<Backdrop, string> = { shore: 'Shore', market: 'Market', houses: 'Houses', murals: 'Murals', mountain: 'Mountain' };

interface Profile {
  finished: number;
  best: number;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

export class Game {
  s!: State;
  seed = 0;
  actions: string[] = [];
  daily: string | null = null;
  replayOnly = false;
  view = 0;
  sfx = new Sfx();
  private sceneCache = new Map<string, HTMLCanvasElement>();
  private cacheWidth = 0;
  private compose = new Map<string, number[]>();
  private composeMarks = new Map<string, boolean[] | null>();
  private pickWrong = new Map<string, Set<number>>();
  private tab = 0;
  private freshChapter = -1;
  /** Chapter whose scenes are cached (only one at a time, to spare phone memory). */
  private cachedView = -1;
  /** Page within the chapter being viewed. */
  private page = 0;
  /** Direction of the last page turn, for the slide-in. */
  private slide = 0;
  /** Scenes that just came clear (animate once). */
  private justCleared = new Set<string>();

  constructor() {
    this.sfx.setMuted(store.load('muted', false));
    addEventListener('pointerdown', () => this.sfx.unlock(), { capture: true });
    $('notebookBtn').onclick = () => this.showNotebook();
    $('sheet').onclick = (e) => {
      if (e.target === $('sheet')) this.closeSheet();
    };
    this.bindSwipe();
    new ResizeObserver(() => {
      const w = this.sceneWidth();
      if (Math.abs(w - this.cacheWidth) > 4) this.render();
    }).observe($('main'));
  }

  // ---------------------------------------------------------------- run

  start(seed: number, actions = '', fromLink = false, daily: string | null = null): void {
    this.seed = seed;
    this.daily = daily;
    this.replayOnly = fromLink;
    try {
      this.s = replay(seed, actions);
      this.actions = actions ? actions.split(',') : [];
    } catch (e) {
      if (fromLink) toast(`Replay failed: ${(e as Error).message}`);
      this.s = newGame(seed);
      this.actions = [];
    }
    this.sceneCache.clear();
    this.compose.clear();
    this.composeMarks.clear();
    this.pickWrong.clear();
    this.view = this.s.chapter;
    this.page = 0;
    if (!fromLink) this.persist();
    this.render();
    $('main').scrollTop = 0;
    if (this.s.over) setTimeout(() => this.showEnding(), 300);
  }

  private persist(): void {
    if (this.replayOnly) return;
    const run = this.s.over ? null : { v: RULES_VERSION, seed: this.seed, a: this.actions.join(','), day: this.daily };
    store.save(this.daily ? 'dailyRun' : 'run', run);
  }

  private act(a: Action): Result | null {
    const r = apply(this.s, a);
    if (!r) return null;
    this.actions.push(encode(a));
    this.persist();
    return r;
  }

  newLanguage(): void {
    closeOverlay();
    leaveDaily();
    this.start((Math.random() * 0xffffffff) >>> 0);
    this.persist();
  }

  playDaily(fresh = false): void {
    closeOverlay();
    const day = todayKey();
    const saved = store.load<{ v: number; seed: number; a: string; day: string } | null>('dailyRun', null);
    if (!fresh && saved && saved.v === RULES_VERSION && saved.day === day) this.start(saved.seed, saved.a, false, day);
    else this.start(dailySeed('unspoken', day), '', false, day);
    if (this.actions.length === 0) toast(`Today's language · ${prettyDay(day)}`);
  }

  resumeOwn(): void {
    closeOverlay();
    leaveDaily();
    const saved = store.load<{ v: number; seed: number; a: string } | null>('run', null);
    if (saved && saved.v === RULES_VERSION) this.start(saved.seed, saved.a);
    else this.start((Math.random() * 0xffffffff) >>> 0);
  }

  // ---------------------------------------------------------------- scenes

  private sceneWidth(): number {
    return Math.max(200, Math.min(560, $('main').clientWidth - 32));
  }

  private scene(key: string, frame: Frame, w: number, h: number, backdrop: State['world']['chapters'][number]['backdrop']): HTMLCanvasElement {
    // Murals are memories: only past scenes are painted on the wall.
    if (backdrop === 'murals' && frame.tense !== 'past') backdrop = 'houses';
    const k = `${key}@${Math.round(w)}x${Math.round(h)}`;
    let c = this.sceneCache.get(k);
    if (!c) {
      c = document.createElement('canvas');
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
      c.style.width = `${w}px`;
      c.style.height = `${h}px`;
      const g = c.getContext('2d')!;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      try {
        drawScene(g, frame, w, h, { backdrop, seed: this.seed ^ hash(key), t: 0 });
      } catch (e) {
        console.error(e);
      }
      this.sceneCache.set(k, c);
    }
    return c;
  }

  // ---------------------------------------------------------------- tokens

  private status(m: string): 'known' | 'guessed' | 'doubt' | '' {
    if (this.s.confirmed.includes(m)) return 'known';
    if (this.s.notebook[m]) return 'guessed';
    if (this.s.doubted.includes(m)) return 'doubt';
    return '';
  }

  /** A tappable written word with your reading underneath. */
  private tokenButton(t: Token, size = 46, onTap?: () => void, label = true): HTMLButtonElement {
    const b = el('button', 'tok');
    b.appendChild(tokenCanvas(this.s.lang, t, size));
    const parts = [t.m, ...t.marks];
    const st = parts.map((m) => this.status(m));
    if (st.every((x) => x === 'known')) b.classList.add('known');
    else if (st.some((x) => x === 'doubt')) b.classList.add('doubt');
    else if (st.some((x) => x === 'guessed' || x === 'known')) b.classList.add('guessed');
    if (label) {
      const read = parts.map((m) => (this.s.notebook[m] ? short(this.s.notebook[m]) : this.status(m) === 'doubt' ? '✗' : ''));
      b.appendChild(el('span', 'gl', read.some(Boolean) ? read.map((x) => x || '…').join(' · ') : ''));
    }
    b.onclick = onTap ?? (() => this.openSheet(t.m, t));
    return b;
  }

  private caption(tokens: Token[], size = 46): HTMLElement {
    const row = el('div', 'caption');
    for (const t of tokens) row.appendChild(this.tokenButton(t, size));
    return row;
  }

  // ---------------------------------------------------------------- pages

  /** The pages of a chapter: its journal entry, its scenes, its riddles, and a way on. */
  private pages(ch: number): Page[] {
    const c = this.s.world.chapters[ch];
    const out: Page[] = [{ kind: 'intro' }, ...c.panels.map((p) => ({ kind: 'panel' as const, p })), ...c.challenges.map((x, i) => ({ kind: 'riddle' as const, c: x, i }))];
    const done = c.challenges.every((x) => this.s.solved.includes(x.id));
    if (done) out.push({ kind: 'next' });
    return out;
  }

  goPage(n: number, dir = 0): void {
    const pages = this.pages(this.view);
    const k = Math.max(0, Math.min(pages.length - 1, n));
    if (k === this.page && !dir) return;
    this.page = k;
    this.slide = dir;
    this.render();
    $('main').scrollTop = 0;
  }

  goChapter(i: number): void {
    if (i > this.s.chapter) return;
    this.view = i;
    this.freshChapter = this.freshChapter === i ? -1 : this.freshChapter;
    this.page = 0;
    this.slide = 0;
    this.render();
  }

  private bindSwipe(): void {
    const main = $('main');
    let sx = 0;
    let sy = 0;
    let on = false;
    main.addEventListener('pointerdown', (e) => {
      sx = e.clientX;
      sy = e.clientY;
      on = true;
    });
    main.addEventListener('pointerup', (e) => {
      if (!on) return;
      on = false;
      const dx = e.clientX - sx;
      const dy = e.clientY - sy;
      if (Math.abs(dx) > 60 && Math.abs(dy) < 50 && $('sheet').hidden) this.goPage(this.page + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1);
    });
    main.addEventListener('pointercancel', () => (on = false));
    $('prevBtn').onclick = () => this.goPage(this.page - 1, -1);
    $('nextBtn').onclick = () => this.goPage(this.page + 1, 1);
    $('dots').onclick = (e) => {
      const r = $('dots').getBoundingClientRect();
      const n = this.pages(this.view).length;
      const k = Math.floor(((e.clientX - r.left) / r.width) * n);
      this.goPage(k, k > this.page ? 1 : -1);
    };
  }

  render(): void {
    const s = this.s;
    const pr = progress(s);
    $('langName').textContent = s.lang.name + (this.daily ? ' · today' : '');
    $('words').textContent = `${pr.confirmed} of ${pr.total} glyphs read`;
    ($('wordsBar').firstElementChild as HTMLElement).style.width = `${(100 * pr.confirmed) / pr.total}%`;

    // Places.
    const nav = $('places');
    nav.innerHTML = '';
    s.world.chapters.forEach((ch, i) => {
      const b = el('button');
      const done = ch.challenges.every((c) => s.solved.includes(c.id));
      b.innerHTML = `${i > s.chapter ? '<span class="lock">◦</span>' : done ? '<span class="tick">✓</span>' : ''}${PLACE[ch.backdrop]}`;
      b.disabled = i > s.chapter;
      if (i === this.view) b.classList.add('on');
      if (i === this.freshChapter) b.classList.add('new');
      b.onclick = () => this.goChapter(i);
      nav.appendChild(b);
    });
    (nav.children[this.view] as HTMLElement | undefined)?.scrollIntoView?.({ inline: 'nearest', block: 'nearest' });

    // The page.
    const w = this.sceneWidth();
    if (Math.abs(w - this.cacheWidth) > 4 || this.cachedView !== this.view) {
      this.sceneCache.clear();
      this.cacheWidth = w;
      this.cachedView = this.view;
    }
    const pages = this.pages(this.view);
    this.page = Math.max(0, Math.min(pages.length - 1, this.page));
    const page = pages[this.page];
    const box = $('page');
    box.innerHTML = '';
    box.className = this.slide > 0 ? 'in-right' : this.slide < 0 ? 'in-left' : '';
    this.slide = 0;
    const ch = s.world.chapters[this.view];
    if (page.kind === 'intro') this.introPage(box);
    else if (page.kind === 'panel') this.panelPage(box, page.p, w, ch.backdrop);
    else if (page.kind === 'riddle') this.riddlePage(box, page.c, page.i, w, ch.backdrop);
    else this.nextPage(box);

    // Pager.
    const dots = $('dots');
    dots.innerHTML = '';
    pages.forEach((pg, i) => {
      const d = el('i');
      d.className = pg.kind;
      if (pg.kind === 'panel' && s.understood.includes(pg.p.id)) d.classList.add('done');
      if (pg.kind === 'riddle' && s.solved.includes(pg.c.id)) d.classList.add('done');
      if (i === this.page) d.classList.add('at');
      dots.appendChild(d);
    });
    ($('prevBtn') as HTMLButtonElement).disabled = this.page === 0;
    ($('nextBtn') as HTMLButtonElement).disabled = this.page === pages.length - 1;
    $('nextBtn').classList.toggle('pulse', page.kind === 'panel' && s.understood.includes(page.p.id) && this.page < pages.length - 1);
  }

  private kicker(text: string): HTMLElement {
    return el('div', 'kicker', text);
  }

  private introPage(box: HTMLElement): void {
    const s = this.s;
    const ch = s.world.chapters[this.view];
    box.appendChild(this.kicker(`Place ${this.view + 1} of ${s.world.chapters.length}`));
    box.appendChild(el('h1', 'chapter-title', ch.title));
    box.appendChild(el('p', 'journal', ch.intro));
    const clear = ch.panels.filter((p) => s.understood.includes(p.id)).length;
    const solved = ch.challenges.filter((c) => s.solved.includes(c.id)).length;
    box.appendChild(
      el(
        'div',
        'tally',
        `<div><b>${clear}/${ch.panels.length}</b><span>scenes clear</span></div><div><b>${solved}/${ch.challenges.length}</b><span>riddles solved</span></div>`,
      ),
    );
    if (this.view === 0 && Object.keys(s.notebook).length === 0 && s.confirmed.length === 0)
      box.appendChild(el('p', 'tip', 'Each scene has a sign. Tap a glyph on the sign to study it and write down what you think it means.'));
    const go = el('button', 'primary wide');
    go.textContent = clear === 0 && solved === 0 ? 'Begin reading' : 'Continue';
    go.onclick = () => this.goPage(this.firstOpenPage(), 1);
    box.appendChild(go);
  }

  /** The first scene not yet clear, else the first unsolved riddle, else the end. */
  private firstOpenPage(): number {
    const pages = this.pages(this.view);
    const i = pages.findIndex(
      (p, k) => k > 0 && ((p.kind === 'panel' && !this.s.understood.includes(p.p.id)) || (p.kind === 'riddle' && !this.s.solved.includes(p.c.id)) || p.kind === 'next'),
    );
    return i < 0 ? 1 : i;
  }

  private panelPage(box: HTMLElement, p: Panel, w: number, backdrop: Backdrop): void {
    const s = this.s;
    const ch = s.world.chapters[this.view];
    const n = ch.panels.indexOf(p) + 1;
    const clear = s.understood.includes(p.id);
    box.appendChild(this.kicker(`${ch.title} · scene ${n} of ${ch.panels.length}${clear ? ' · <b class="ok">clear ✓</b>' : ''}`));
    const frame = el('div', 'frame');
    if (clear) frame.classList.add('clear');
    if (this.justCleared.has(p.id)) frame.classList.add('clearing');
    const sc = this.scene(p.id, p.frame, w, Math.round(w * 0.64), backdrop);
    sc.className = 'scene';
    frame.appendChild(sc);
    box.appendChild(frame);
    box.appendChild(this.caption(p.tokens, 60));
    const ms = morphemes(p.tokens);
    if (!clear && ms.every((m) => s.notebook[m])) {
      const off = ms.filter((m) => s.notebook[m] !== m).length;
      box.appendChild(el('p', 'tip warn', off === 1 ? 'Every glyph has a reading, but one of them is off.' : 'Every glyph has a reading, but some of them are off.'));
    }
    if (!clear && n <= 2 && this.view === 0 && s.confirmed.length < 3) box.appendChild(el('p', 'tip', 'Tap a glyph to see every scene it appears in.'));
  }

  private nextPage(box: HTMLElement): void {
    const s = this.s;
    if (s.over && this.view === s.world.chapters.length - 1) {
      box.appendChild(this.kicker('The end of the path'));
      box.appendChild(el('h1', 'chapter-title', 'You answered the elder'));
      box.appendChild(el('p', 'journal', 'The village has told you all it will. Read back what you understood.'));
      const b = el('button', 'primary wide');
      b.textContent = 'What you understood';
      b.onclick = () => this.showEnding();
      box.appendChild(b);
      return;
    }
    const next = s.world.chapters[this.view + 1];
    box.appendChild(this.kicker('Onward'));
    box.appendChild(el('h1', 'chapter-title', next.title));
    box.appendChild(el('p', 'journal', next.intro.split('. ')[0] + '.'));
    const b = el('button', 'primary wide');
    b.textContent = `Go to ${PLACE[next.backdrop]}`;
    b.onclick = () => this.goChapter(this.view + 1);
    box.appendChild(b);
  }

  private riddlePage(box: HTMLElement, c: Challenge, i: number, w: number, backdrop: Backdrop): void {
    const s = this.s;
    const solved = s.solved.includes(c.id);
    const total = s.world.chapters[c.ch].challenges.length;
    box.appendChild(this.kicker(`Riddle ${i + 1} of ${total}${solved ? ' · <b class="ok">solved ✓</b>' : ''}`));
    box.appendChild(el('h2', 'riddle-title', c.question ? 'The elder asks you something' : c.kind === 'pick' ? 'Which scene does this sign describe?' : 'Write the sign for this scene'));

    if (c.kind === 'pick') {
      box.appendChild(this.caption(c.tokens, 54));
      const picks = el('div', 'picks');
      // Three wide scenes, stacked: big enough to compare details at a glance.
      const tw = w;
      const th = Math.round(w * 0.36);
      const wrong = this.pickWrong.get(c.id) ?? new Set<number>();
      c.options.forEach((f, k) => {
        const b = el('button');
        b.appendChild(el('span', 'letter', 'ABC'[k]));
        b.appendChild(this.scene(`${c.id}.o${k}`, f, tw, th, backdrop));
        if (wrong.has(k)) b.classList.add('wrong');
        if (solved && k === c.answer) b.classList.add('right');
        b.disabled = solved || wrong.has(k);
        b.onclick = () => this.answerPick(c, k, b);
        picks.appendChild(b);
      });
      box.appendChild(picks);
      if (!solved) box.appendChild(el('p', 'tip', wrong.size ? 'Not that one. Look at what differs between the scenes.' : 'The three scenes differ in just one thing.'));
      return;
    }

    if (c.question) {
      const q = el('div', 'speech');
      q.appendChild(el('b', '', 'The elder:'));
      const cap = this.caption(c.question, 40);
      cap.classList.add('compact');
      q.appendChild(cap);
      box.appendChild(q);
      box.appendChild(el('p', 'tip', 'Answer with what the murals told you.'));
    } else {
      const frame = el('div', 'frame');
      const sc = this.scene(c.id, c.frame, w, Math.round(w * 0.56), backdrop);
      sc.className = 'scene';
      frame.appendChild(sc);
      box.appendChild(frame);
    }
    if (solved) {
      box.appendChild(this.caption(c.tokens, 50));
      return;
    }
    const chosen = this.compose.get(c.id) ?? [];
    const marks = this.composeMarks.get(c.id) ?? null;
    const slots = el('div', 'slots');
    chosen.forEach((ti, pos) => {
      const b = this.tokenButton(c.tiles[ti], 44, () => {
        chosen.splice(pos, 1);
        this.compose.set(c.id, chosen);
        this.composeMarks.set(c.id, null);
        this.sfx.click();
        this.render();
      });
      if (marks) b.classList.add(marks[pos] ? 'ok' : 'no');
      slots.appendChild(b);
    });
    box.appendChild(slots);
    if (chosen.length) box.appendChild(el('p', 'tip', 'Tap a placed glyph to take it back.'));
    const tiles = el('div', 'tiles');
    c.tiles.forEach((t, ti) => {
      const b = this.tokenButton(t, 44, () => {
        if (chosen.includes(ti)) return;
        chosen.push(ti);
        this.compose.set(c.id, chosen);
        this.composeMarks.set(c.id, null);
        this.sfx.click();
        this.render();
      });
      if (chosen.includes(ti)) b.classList.add('used');
      tiles.appendChild(b);
    });
    box.appendChild(tiles);
    const row = el('div', 'row-btns');
    const clear = el('button', 'secondary');
    clear.textContent = 'Clear';
    clear.disabled = chosen.length === 0;
    clear.onclick = () => {
      this.compose.set(c.id, []);
      this.composeMarks.set(c.id, null);
      this.render();
    };
    const go = el('button', 'primary');
    go.textContent = c.question ? 'Answer' : 'Write it';
    go.disabled = chosen.length === 0;
    go.onclick = () => this.answerCompose(c, box);
    row.append(clear, go);
    box.appendChild(row);
  }

  // ---------------------------------------------------------------- answers

  private answerPick(c: Challenge, k: number, btn: HTMLElement): void {
    const r = this.act({ t: 'answer', challenge: c.id, pick: k });
    if (!r) return;
    if (!r.ok) {
      const set = this.pickWrong.get(c.id) ?? new Set<number>();
      set.add(k);
      this.pickWrong.set(c.id, set);
      this.sfx.hurt();
      btn.classList.add('shake');
      setTimeout(() => this.render(), 350);
      return;
    }
    this.solvedFeedback(r);
  }

  private answerCompose(c: Challenge, card: HTMLElement): void {
    const tiles = this.compose.get(c.id) ?? [];
    const r = this.act({ t: 'answer', challenge: c.id, tiles });
    if (!r) return;
    if (!r.ok) {
      this.composeMarks.set(c.id, r.right ?? null);
      this.sfx.hurt();
      card.classList.add('shake');
      setTimeout(() => this.render(), 350);
      toast(tiles.length !== c.tokens.length ? 'Not quite. Something is missing or extra.' : 'Not quite. Green ones are in the right place.');
      return;
    }
    this.solvedFeedback(r);
  }

  private solvedFeedback(r: Result): void {
    this.sfx.levelUp();
    const bits: string[] = [];
    if (r.confirmed.length) bits.push(`${r.confirmed.length} reading${r.confirmed.length > 1 ? 's' : ''} proven`);
    if (r.doubted.length) bits.push(`${r.doubted.length} guess${r.doubted.length > 1 ? 'es were' : ' was'} wrong (cleared)`);
    toast(bits.length ? `Solved! ${bits.join(', ')}.` : 'Solved!');
    if (r.opened !== undefined) {
      this.freshChapter = r.opened;
      setTimeout(() => toast(`A new place opens: ${this.s.world.chapters[r.opened!].title}`), 1600);
      this.sfx.evolve();
    }
    this.render();
    if (r.over) {
      this.recordEnd();
      setTimeout(() => {
        this.goPage(this.pages(this.view).length - 1, 1);
        this.showEnding();
      }, 900);
      return;
    }
    // Move on to the next riddle (or the way onward) after a beat.
    const at = this.page;
    setTimeout(() => {
      if (this.page === at && $('sheet').hidden && $('overlay').hidden) this.goPage(this.firstOpenPage(), 1);
    }, 900);
  }

  // ---------------------------------------------------------------- glyph sheet

  openSheet(id: string, token?: Token): void {
    const s = this.s;
    const lang = s.lang;
    const sheet = $('sheet');
    sheet.innerHTML = '';
    const inner = el('div', 'inner');
    inner.appendChild(el('div', 'grab'));
    const top = el('div', 'top');
    top.appendChild(glyphCanvas(lang, id, 84));
    const info = el('div');
    const st = this.status(id);
    info.appendChild(el('div', 'say', `“${lang.words[id]}”${lang.glyphs[id].mark ? ` · a mark ${lang.glyphs[id].mark} a word` : ''}`));
    const statusText =
      st === 'known'
        ? `✓ ${short(s.notebook[id])}: proven`
        : st === 'guessed'
          ? `Your guess: ${short(s.notebook[id])}`
          : st === 'doubt'
            ? '✗ A solved riddle showed your guess was wrong'
            : 'Not read yet. What could it be?';
    info.appendChild(el('div', `status ${st}`, statusText));
    top.appendChild(info);
    inner.appendChild(top);

    // Marks on this word can be read separately.
    const others = token ? [token.m, ...token.marks].filter((m) => m !== id) : [];
    if (others.length) {
      const row = el('div', 'marks', token && token.m === id ? 'A mark on this word:' : 'Part of the word:');
      for (const m of others) {
        const b = el('button');
        b.appendChild(glyphCanvas(lang, m, 32));
        b.appendChild(document.createTextNode(s.notebook[m] ? short(s.notebook[m]) : '?'));
        b.onclick = () => this.openSheet(m, token);
        row.appendChild(b);
      }
      inner.appendChild(row);
    }

    // Where it appears.
    // The scene you're looking at comes first.
    const here = this.pages(this.view)[this.page];
    const hereId = here?.kind === 'panel' ? here.p.id : '';
    const ctxs = [...(contexts(s.world, s.chapter).get(id) ?? [])].sort((a, b) => Number(b.id === hereId) - Number(a.id === hereId));
    if (ctxs.length) {
      inner.appendChild(el('h4', '', `Seen in ${ctxs.length} scene${ctxs.length > 1 ? 's' : ''}`));
      const box = el('div', 'ctx');
      for (const p of ctxs.slice(0, 8)) {
        const row = el('div', 'row' + (p.id === hereId ? ' here' : ''));
        const th = this.scene(p.id, p.frame, 96, 60, s.world.chapters[p.ch].backdrop).cloneNode(true) as HTMLCanvasElement;
        th.getContext('2d')!.drawImage(this.scene(p.id, p.frame, 96, 60, s.world.chapters[p.ch].backdrop), 0, 0);
        th.className = 'thumb';
        row.appendChild(th);
        const cap = el('div', 'caption');
        for (const t of p.tokens) {
          const b = this.tokenButton(t, 30, () => this.openSheet(t.m, t), false);
          if (t.m === id || t.marks.includes(id)) b.classList.add('hl');
          cap.appendChild(b);
        }
        row.appendChild(cap);
        box.appendChild(row);
      }
      inner.appendChild(box);
    }

    if (st !== 'known') {
      inner.appendChild(el('h4', '', 'What do you think it means?'));
      const guess = s.notebook[id];
      if (guess) this.tab = Math.max(0, TABS.findIndex((t) => t.cats.includes(CONCEPT.get(guess)!.cat)));
      const tabs = el('div', 'tabs');
      const chips = el('div', 'chips');
      const taken = new Set(Object.entries(s.notebook).filter(([g]) => g !== id).map(([, m]) => m));
      const showTab = () => {
        tabs.querySelectorAll('button').forEach((b, i) => b.classList.toggle('on', i === this.tab));
        chips.innerHTML = '';
        for (const c of CONCEPTS.filter((x) => TABS[this.tab].cats.includes(x.cat))) {
          if (c.cat === 'grammar' && !writtenGrammar(lang).includes(c.id)) continue;
          const b = el('button');
          b.textContent = c.cat === 'name' || c.cat === 'grammar' ? short(c.id) : c.en;
          if (guess === c.id) b.classList.add('on');
          if (taken.has(c.id)) b.classList.add('taken');
          b.onclick = () => this.guess(id, guess === c.id ? null : c.id);
          chips.appendChild(b);
        }
      };
      TABS.forEach((t, i) => {
        const b = el('button');
        b.textContent = t.label;
        b.onclick = () => {
          this.tab = i;
          showTab();
        };
        tabs.appendChild(b);
      });
      inner.appendChild(tabs);
      inner.appendChild(chips);
      showTab();
    }
    const actions = el('div', 'actions');
    if (st !== 'known' && s.notebook[id]) {
      const clr = el('button', 'secondary');
      clr.textContent = 'Clear guess';
      clr.onclick = () => this.guess(id, null);
      actions.appendChild(clr);
    }
    const close = el('button', 'secondary');
    close.textContent = 'Done';
    close.onclick = () => this.closeSheet();
    actions.appendChild(close);
    inner.appendChild(actions);
    sheet.appendChild(inner);
    sheet.hidden = false;
  }

  closeSheet(): void {
    $('sheet').hidden = true;
    $('sheet').innerHTML = '';
  }

  private guess(id: string, meaning: string | null): void {
    const r = this.act({ t: 'guess', glyph: id, meaning });
    this.closeSheet();
    if (!r) return;
    this.sfx.pickup();
    if (r.understood.length) {
      this.sfx.levelUp();
      for (const id of r.understood) this.justCleared.add(id);
      const here = this.pages(this.view)[this.page];
      const elsewhere = r.understood.filter((id) => !(here.kind === 'panel' && here.p.id === id)).length;
      if (elsewhere) toast(elsewhere > 1 ? `${elsewhere} other scenes came clear too!` : 'Another scene came clear too!');
      setTimeout(() => this.justCleared.clear(), 1200);
    }
    this.render();
  }

  // ---------------------------------------------------------------- notebook, menu, ending

  showNotebook(): void {
    const s = this.s;
    const seen = new Set<string>();
    for (const ch of s.world.chapters.slice(0, s.chapter + 1)) for (const p of ch.panels) for (const m of morphemes(p.tokens)) seen.add(m);
    const guessed = [...seen].filter((m) => s.notebook[m] && !s.confirmed.includes(m)).length;
    showCard(
      `<h2>Notebook</h2><div class="nb-legend"><span><b>${seen.size}</b> seen</span><span class="g"><b>${guessed}</b> guessed</span><span class="k"><b>${s.confirmed.filter((m) => seen.has(m)).length}</b> proven</span></div><div class="nb-grid" id="nbGrid"></div>`,
      [
      { label: 'Close', primary: true, onClick: closeOverlay },
    ]);
    const grid = $('nbGrid');
    for (const m of [...seen].sort((a, b) => CONCEPTS.findIndex((c) => c.id === a) - CONCEPTS.findIndex((c) => c.id === b))) {
      const isMark = !!s.lang.glyphs[m].mark;
      const t: Token = { m: isMark ? m : m, marks: [] };
      const b = isMark ? this.markButton(m) : this.tokenButton(t, 44, () => (closeOverlay(), this.openSheet(m)));
      grid.appendChild(b);
    }
  }

  private markButton(m: string): HTMLButtonElement {
    const b = el('button', 'tok');
    b.appendChild(glyphCanvas(this.s.lang, m, 44));
    const st = this.status(m);
    if (st) b.classList.add(st === 'known' ? 'known' : st === 'doubt' ? 'doubt' : 'guessed');
    b.appendChild(el('span', 'gl', this.s.notebook[m] ? short(this.s.notebook[m]) : '?'));
    b.onclick = () => (closeOverlay(), this.openSheet(m));
    return b;
  }

  showMenu(): void {
    const muted = this.sfx.muted;
    showCard(`<h2>Unspoken</h2><p>The language of this village: <b>${this.s.lang.name}</b>${this.daily ? ` · today's language` : ''}.</p>`, [
      { label: 'Resume', primary: true, onClick: closeOverlay },
      { label: 'How to play', onClick: () => this.showHelp() },
      { label: 'Notebook', onClick: () => this.showNotebook() },
      this.daily ? { label: 'Back to my language', onClick: () => this.resumeOwn() } : { label: `Today's language · ${loadDaily(store)?.label ?? 'not played'}`, onClick: () => this.playDaily() },
      {
        label: muted ? 'Sound: off' : 'Sound: on',
        onClick: () => {
          this.sfx.setMuted(!muted);
          store.save('muted', !muted);
          this.showMenu();
        },
      },
      { label: 'Copy bug report', onClick: () => this.copyReport() },
      {
        label: 'A new language',
        onClick: () =>
          showCard('<h2>Leave this village?</h2><p>You will start over with a language no one has seen.</p>', [
            { label: 'New language', primary: true, onClick: () => this.newLanguage() },
            { label: 'Cancel', onClick: () => this.showMenu() },
          ]),
      },
      { label: 'Back to Game Lab', onClick: () => (location.href = '../') },
    ]);
  }

  showHelp(): void {
    store.save('seenHelp', true);
    showCard(
      `<h2>Unspoken</h2>
      <p>You are a traveler in a village whose language no one has ever written down for you. Every visit, it is a new language.</p>
      <ul>
        <li>Each painted <b>scene</b> has a sign beneath it. The sign says what the scene shows.</li>
        <li><b>Tap a glyph</b> to see every scene it appears in, and write down what you think it means.</li>
        <li>When every glyph under a scene is read right, the scene <b>comes clear</b> and those readings are proven.</li>
        <li>Little <b>marks</b> above or below a glyph change its meaning. Watch what changes in the pictures.</li>
        <li><b>Riddles</b> close each place: pick the scene a sign describes, or write a scene yourself. Solving one proves your right guesses and clears your wrong ones.</li>
        <li>Notice the order of words. Notice what repeats. Nobody will tell you.</li>
      </ul>`,
      [{ label: 'Begin', primary: true, onClick: closeOverlay }],
    );
  }

  private recordEnd(): void {
    if (this.replayOnly) return;
    const p = progress(this.s);
    const pct = Math.round((100 * p.confirmed) / p.total);
    const prof = store.load<Profile>('profile', { finished: 0, best: 0 });
    prof.finished++;
    prof.best = Math.max(prof.best, pct);
    store.save('profile', prof);
    if (this.daily) recordDaily(store, pct * 100 - this.s.mistakes, `${pct}% · ${this.s.mistakes} slip${this.s.mistakes === 1 ? '' : 's'}`, this.daily);
    this.persist();
  }

  showEnding(): void {
    const s = this.s;
    const p = progress(s);
    const pct = Math.round((100 * p.confirmed) / p.total);
    this.sfx.victory();
    const gloss = (id: string) => (s.notebook[id] ? short(s.notebook[id]) : '⟨?⟩');
    showCard(
      `<div class="ending"><h2>What you understood</h2>
      <p>You proved <b>${p.confirmed}</b> of the ${p.total} glyphs of ${s.lang.name} (${pct}%), with ${s.mistakes} slip${s.mistakes === 1 ? '' : 's'} along the way.</p>
      <h3>The village's story, as you read it</h3><div id="story"></div>
      <h3>How ${s.lang.name} works</h3><ul class="notes">${grammarNotes(s.lang).map((n) => `<li>${n}</li>`).join('')}</ul></div>`,
      [
        { label: 'A new language', primary: true, onClick: () => this.newLanguage() },
        { label: 'Stay in the village', onClick: closeOverlay },
        { label: 'Back to Game Lab', onClick: () => (location.href = '../') },
      ],
    );
    const box = $('story');
    for (const f of s.world.story) {
      const line = el('div', 'line');
      const cap = el('div', 'caption');
      for (const t of realize(s.lang, f)) cap.appendChild(this.tokenButton(t, 30, () => {}, false));
      line.appendChild(cap);
      line.appendChild(el('p', '', english(f, gloss).replace(/⟨\?⟩/g, '<i>?</i>')));
      box.appendChild(line);
    }
  }

  async copyReport(): Promise<void> {
    const a = this.actions.join(',');
    const url = `${location.origin}${location.pathname}?seed=${this.seed}&a=${a || '-'}`;
    toast((await copyText(`UNSPOKEN v${RULES_VERSION} seed=${this.seed} a=${a}\n${url}`)) ? 'Bug report copied' : 'Copy failed');
  }
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
