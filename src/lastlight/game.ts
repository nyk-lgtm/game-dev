// Last Light controller: the story log, the choice buttons, saving, endings.

import { closeOverlay, showCard } from '../shared/cards';
import { copyText, toast } from '../shared/debug';
import { makeStore } from '../shared/storage';
import { ITEM_NAMES, NPC_NAMES, RULES_VERSION, act, choices, clock, describe, has, newGame, type Choice, type Item, type State } from './core/story';
import { drawSky } from './sky';

export const store = makeStore('lastlight.');
const $ = (id: string) => document.getElementById(id)!;

interface Profile {
  plays: number;
  best: number;
  endings: string[];
}

const INTRO = [
  'Corran Isle, the night of the big storm.',
  'At dusk the wick in the great lamp burned through and the light went out. Ada, the old keeper, went down the road to the village and said she’d be back by ten. She isn’t.',
];

export class Game {
  s: State = newGame();
  ids: string[] = [];
  private open: string | null = null;
  private sky = $('sky') as HTMLCanvasElement;
  private time = 0;
  private last = 0;

  constructor() {
    new ResizeObserver(() => this.sizeSky()).observe(this.sky);
    requestAnimationFrame((t) => this.frame(t));
  }

  /** Starts fresh, or replays saved actions (rebuilding the story text). */
  start(ids: string[] = []): void {
    this.s = newGame();
    this.ids = [];
    this.open = null;
    $('story').innerHTML = '';
    this.para(INTRO, 'intro');
    this.para(describe(this.s), 'room', 'Keeper’s cottage');
    for (const id of ids) {
      const out = act(this.s, id);
      if (!out) break;
      this.ids.push(id);
      this.para(out, id.startsWith('go:') ? 'room' : '', id.startsWith('go:') ? ROOMS_TITLE(this.s) : undefined);
    }
    this.markOld();
    this.render(true);
    this.save();
    if (this.s.over) setTimeout(() => this.showEnd(), 400);
  }

  private save(): void {
    store.save('run', { v: RULES_VERSION, a: this.ids.join(',') });
  }

  private para(lines: string[], cls = '', heading?: string): void {
    const box = document.createElement('div');
    box.className = `beat new ${cls}`;
    if (heading) box.innerHTML = `<h3>${heading}</h3>`;
    for (const l of lines) {
      const p = document.createElement('p');
      p.textContent = l;
      box.appendChild(p);
    }
    $('story').appendChild(box);
  }

  private markOld(): void {
    document.querySelectorAll('#story .beat.new').forEach((b, k, all) => {
      if (k < all.length - 1) b.classList.remove('new');
    });
  }

  private do(id: string): void {
    const out = act(this.s, id);
    if (!out) return;
    this.ids.push(id);
    this.open = null;
    document.querySelectorAll('#story .beat.new').forEach((b) => b.classList.remove('new'));
    this.render(false);
    this.para(out, id.startsWith('go:') ? 'room' : '', id.startsWith('go:') ? ROOMS_TITLE(this.s) : undefined);
    this.save();
    navigator.vibrate?.(6);
    const story = $('story');
    requestAnimationFrame(() => {
      const last = story.lastElementChild as HTMLElement | null;
      if (last) story.scrollTo({ top: last.offsetTop - 8, behavior: 'smooth' });
    });
    if (this.s.over) {
      this.render(false);
      this.recordEnd();
      setTimeout(() => this.showEnd(), 900);
    }
  }

  // ---------------------------------------------------------------- the choice area

  render(scroll: boolean): void {
    const s = this.s;
    $('clock').textContent = clock(s);
    $('clock').classList.toggle('late', !s.f.wound && s.t >= 30);
    $('placeName').textContent = ROOMS_TITLE(s);
    const box = $('acts');
    box.innerHTML = '';
    if (s.over) {
      box.innerHTML = '<button class="primary wide" id="endBtn">The night is over</button>';
      $('endBtn').onclick = () => this.showEnd();
      return;
    }
    const cs = choices(s);
    const go = cs.filter((c) => c.about === 'go');
    const rest = cs.filter((c) => c.about !== 'go');
    // Group by subject: people, then things here, then what you carry.
    const groups = new Map<string, Choice[]>();
    for (const c of rest) groups.set(c.about, [...(groups.get(c.about) ?? []), c]);
    const order = [...groups.keys()].sort((a, b) => rank(s, a) - rank(s, b));
    const row = (title: string, els: HTMLElement[]) => {
      if (!els.length) return;
      const r = document.createElement('div');
      r.className = 'row';
      r.innerHTML = `<span class="lab">${title}</span>`;
      const list = document.createElement('div');
      list.className = 'list';
      els.forEach((e) => list.appendChild(e));
      r.appendChild(list);
      box.appendChild(r);
    };
    const btn = (label: string, cls: string, on: () => void) => {
      const b = document.createElement('button');
      b.className = cls;
      b.textContent = label;
      b.onclick = on;
      return b;
    };
    const subjects = (filter: (k: string) => boolean) =>
      order.filter(filter).flatMap((k) => {
        const list = groups.get(k)!;
        // Carried things always show by name, so you can see what you have.
        const carried = k in ITEM_NAMES && has(s, k as Item);
        if (list.length === 1 && !carried) return [btn(list[0].label, 'act', () => this.do(list[0].id))];
        const chip = btn(subjectName(k), `chip${this.open === k ? ' on' : ''}`, () => {
          this.open = this.open === k ? null : k;
          this.render(false);
        });
        const out = [chip];
        if (this.open === k) for (const c of list) out.push(btn(c.label, 'act sub', () => this.do(c.id)));
        return out;
      });
    row('People', subjects((k) => k === 'tomas' || k === 'ada'));
    row('Here', subjects((k) => k !== 'tomas' && k !== 'ada' && !(k in ITEM_NAMES && has(s, k as Item))));
    row('Carrying', subjects((k) => k in ITEM_NAMES && has(s, k as Item)));
    row('Go', go.map((c) => btn(`→ ${c.label}`, 'go', () => this.do(c.id))));
    if (scroll) {
      const story = $('story');
      story.scrollTop = story.scrollHeight;
    }
  }

  // ---------------------------------------------------------------- endings and cards

  private recordEnd(): void {
    const e = this.s.over!;
    const p = store.load<Profile>('profile', { plays: 0, best: 0, endings: [] });
    p.plays++;
    p.best = Math.max(p.best, e.stars);
    if (!p.endings.includes(e.title)) p.endings.push(e.title);
    store.save('profile', p);
  }

  showEnd(): void {
    const e = this.s.over;
    if (!e) return;
    const p = store.load<Profile>('profile', { plays: 0, best: 0, endings: [] });
    showCard(
      `<h2>${e.title}</h2><div class="stars">${'★'.repeat(e.stars)}<span class="off">${'★'.repeat(3 - e.stars)}</span></div>
       ${e.text.map((t) => `<p>${t}</p>`).join('')}
       <p class="meta2">One star each for the light, for Ada, and for Tomas. Best: ${'★'.repeat(p.best) || 'none yet'}.</p>`,
      [
        { label: 'Play the night again', primary: true, onClick: () => this.restart() },
        { label: 'Read the story so far', onClick: closeOverlay },
        { label: 'All games', onClick: () => (location.href = '../') },
      ],
    );
  }

  restart(): void {
    closeOverlay();
    this.start([]);
  }

  showHelp(): void {
    store.save('seenHelp', true);
    showCard(
      `<h2>Last Light</h2>
       <p>A short story you play by tapping. A ship is running for the rocks and the lighthouse is dark.</p>
       <ul>
         <li>Tap a place under <b>Go</b> to move, and people or things to see what you can do with them.</li>
         <li>Every action spends three minutes. The ship reaches the rocks at <b>midnight</b>.</li>
         <li>The weather, the tide and the people remember what you do. There are several endings.</li>
       </ul>`,
      [{ label: 'Begin', primary: true, onClick: closeOverlay }],
    );
  }

  showMenu(): void {
    const p = store.load<Profile>('profile', { plays: 0, best: 0, endings: [] });
    showCard(
      `<h2>Last Light</h2><p>${clock(this.s)} · ${p.plays ? `${p.plays} night${p.plays > 1 ? 's' : ''} played, ${p.endings.length} ending${p.endings.length === 1 ? '' : 's'} found` : 'Your first night'}</p>`,
      [
        { label: 'Resume', primary: true, onClick: closeOverlay },
        { label: 'How to play', onClick: () => this.showHelp() },
        {
          label: 'Start the night over',
          onClick: () =>
            showCard('<h2>Start over?</h2><p>Back to ten o’clock in the cottage.</p>', [
              { label: 'Keep going', primary: true, onClick: closeOverlay },
              { label: 'Start over', onClick: () => this.restart() },
            ]),
        },
        { label: 'Copy bug report', onClick: () => this.copyReport() },
        { label: 'All games', onClick: () => (location.href = '../') },
      ],
    );
  }

  private async copyReport(): Promise<void> {
    toast((await copyText(`LASTLIGHT v${RULES_VERSION} a=${this.ids.join(',')}`)) ? 'Bug report copied' : 'Copy failed');
  }

  // ---------------------------------------------------------------- sky

  private sizeSky(): void {
    const dpr = Math.min(3, devicePixelRatio || 1);
    this.sky.width = Math.round(this.sky.clientWidth * dpr);
    this.sky.height = Math.round(this.sky.clientHeight * dpr);
  }

  private frame(t: number): void {
    const dt = Math.min(0.1, (t - (this.last || t)) / 1000);
    this.last = t;
    this.time += dt;
    const g = this.sky.getContext('2d')!;
    const dpr = this.sky.width / Math.max(1, this.sky.clientWidth);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawSky(g, this.sky.clientWidth, this.sky.clientHeight, this.s, this.time);
    requestAnimationFrame((tt) => this.frame(tt));
  }
}

const ROOMS_TITLE = (s: State) =>
  ({
    cottage: 'Keeper’s cottage',
    yard: 'The yard',
    base: 'Lighthouse, ground floor',
    lamp: 'The lamp room',
    cliff: 'Cliff path',
    road: 'Village road',
    shore: 'The shore',
    boathouse: 'Boathouse',
  })[s.room];

function subjectName(k: string): string {
  if (k in NPC_NAMES) return NPC_NAMES[k as keyof typeof NPC_NAMES];
  if (k in ITEM_NAMES) return cap(ITEM_NAMES[k as Item]);
  return cap(k);
}
const cap = (x: string) => x[0].toUpperCase() + x.slice(1);
function rank(s: State, k: string): number {
  if (k === 'tomas' || k === 'ada') return 0;
  if (k in ITEM_NAMES && has(s, k as Item)) return 2;
  return 1;
}
