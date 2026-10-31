// DOM screens: title, characters, shop, level-up, chest, pause, results, help.

import {
  CHARACTERS,
  META,
  PASSIVES,
  WEAPONS,
  type Choice,
  type PassiveId,
  type Profile,
  type WeaponId,
  type World,
} from './core';
import { drawIcon, type Shape } from './render/sprites';

const ui = () => document.getElementById('ui')!;

export const WEAPON_ICON: Record<WeaponId, Shape> = {
  pulse: 'dot',
  storm: 'dot',
  orbit: 'diamond',
  corona: 'diamond',
  nova: 'ring',
  supernova: 'ring',
  arc: 'star',
  tempest: 'star',
  lance: 'kite',
  railgun: 'kite',
  mines: 'circle',
  minefield: 'circle',
  ricochet: 'disc',
  pinball: 'disc',
  halo: 'ring',
  sanctum: 'ring',
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

function screen(cls = ''): HTMLDivElement {
  const root = ui();
  root.className = cls;
  root.innerHTML = '';
  const p = el('div', 'panel');
  root.appendChild(p);
  return p;
}

export function hideUi(): void {
  ui().innerHTML = '';
  ui().className = '';
}

function button(label: string, cls: string, onClick: () => void): HTMLButtonElement {
  const b = el('button', cls);
  b.textContent = label;
  b.onclick = onClick;
  return b;
}

function pips(level: number, max: number): string {
  if (max <= 1) return '';
  let s = '<div class="pips">';
  for (let i = 1; i <= max; i++) s += `<i class="${i <= level ? 'on' : ''}"></i>`;
  return s + '</div>';
}

/** Icon + name + description card for a weapon or passive choice. */
function choiceCard(w: World, c: Choice, onClick: () => void): HTMLButtonElement {
  const card = el('button', 'card');
  const icon = el('canvas');
  let name = 'Glimmer';
  let desc = '+30 health and 5 shards';
  let tag = '';
  let hint = '';
  if (c.kind === 'weapon') {
    const d = WEAPONS[c.id as WeaponId];
    drawIcon(icon, WEAPON_ICON[d.id], d.hue, 52, !!d.from);
    name = d.name;
    desc = d.levels[c.level - 1] ?? d.desc;
    tag = c.level === 1 ? 'new' : `lv ${c.level}`;
    if (d.evolvesWith) hint = `Max level + ${PASSIVES[d.evolvesWith].name} → ${WEAPONS[d.evolvesInto!].name}`;
    if (c.level === 1) card.classList.add('new');
  } else if (c.kind === 'passive') {
    const d = PASSIVES[c.id as PassiveId];
    drawIcon(icon, 'hex', d.hue, 52);
    name = d.name;
    desc = d.desc;
    tag = c.level === 1 ? 'new' : `lv ${c.level}`;
    const evo = Object.values(WEAPONS).find((x) => x.evolvesWith === c.id && w.weapons.some((ws) => ws.id === x.id));
    if (evo) hint = `Evolves ${evo.name} → ${WEAPONS[evo.evolvesInto!].name}`;
    if (c.level === 1) card.classList.add('new');
  } else drawIcon(icon, 'diamond', 185, 52);
  const max = c.kind === 'weapon' ? WEAPONS[c.id as WeaponId].maxLevel : c.kind === 'passive' ? PASSIVES[c.id as PassiveId].maxLevel : 0;
  const body = el(
    'div',
    'body',
    `<div class="name">${name}${tag ? `<span class="tag">${tag}</span>` : ''}</div><div class="desc">${desc}</div>${hint ? `<div class="hint">${hint}</div>` : ''}${pips(c.level, max)}`,
  );
  card.append(icon, body);
  card.onclick = onClick;
  return card;
}

export interface LevelUpHandlers {
  choose(i: number): void;
  reroll(): void;
  skip(): void;
  banish(i: number): void;
}

export function showLevelUp(w: World, h: LevelUpHandlers): void {
  const p = screen();
  let banishing = false;
  p.append(el('h2', '', 'Level up!'));
  p.append(el('p', 'sub', `Level ${w.player.level - w.pendingLevels + 1}${w.pendingLevels > 1 ? ` · ${w.pendingLevels} to pick` : ''}`));
  const cards = w.choices.map((c, i) =>
    choiceCard(w, c, () => {
      if (banishing) h.banish(i);
      else h.choose(i);
    }),
  );
  p.append(...cards);
  const row = el('div', 'row');
  const banishBtn = button(`Banish (${w.banishes})`, 'alt', () => {
    banishing = !banishing;
    banishBtn.textContent = banishing ? 'Tap one to banish' : `Banish (${w.banishes})`;
    cards.forEach((c) => c.classList.toggle('banish', banishing));
  });
  banishBtn.disabled = w.banishes <= 0;
  const rerollBtn = button(`Reroll (${w.rerolls})`, 'alt', h.reroll);
  rerollBtn.disabled = w.rerolls <= 0;
  row.append(rerollBtn, banishBtn, button('Skip', 'alt', h.skip));
  p.append(row);
}

export function showChest(w: World, got: Choice[], done: () => void): void {
  const p = screen();
  const evolved = got.some((c) => c.evolves);
  p.append(el('h2', '', evolved ? 'Evolution!' : got.length > 1 ? `Treasure ×${got.length}` : 'Treasure'));
  for (const c of got) {
    const card = choiceCard(w, c, () => {});
    if (c.evolves) card.classList.add('evo');
    p.append(card);
  }
  p.append(button('Continue', 'big', done));
}

export function buildList(w: World): HTMLElement {
  const box = el('div', 'panel');
  for (const ws of w.weapons) box.append(choiceCard(w, { kind: 'weapon', id: ws.id, level: ws.level }, () => {}));
  for (const [id, lvl] of Object.entries(w.passives) as [PassiveId, number][])
    box.append(choiceCard(w, { kind: 'passive', id, level: lvl }, () => {}));
  return box;
}

export function showPause(w: World, h: { resume(): void; quit(): void; muted: boolean; toggleMute(): void }): void {
  const p = screen();
  p.append(el('h2', '', 'Paused'));
  p.append(button('Resume', 'big', h.resume));
  p.append(buildList(w));
  const row = el('div', 'row');
  row.append(
    button(h.muted ? 'Sound: off' : 'Sound: on', 'alt', h.toggleMute),
    button('Give up', 'alt', h.quit),
  );
  p.append(row);
}

export interface RunSummary {
  won: boolean;
  time: number;
  level: number;
  kills: number;
  shards: number;
  dealt: [WeaponId, number][];
  unlocked: string[];
}

export function fmtTime(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function showResults(r: RunSummary, h: { again(): void; menu(): void }): void {
  const p = screen('title');
  p.append(el('h1', 'logo', r.won ? 'DAWN' : 'FADED'));
  p.append(el('p', 'sub', r.won ? 'You outlasted the Eclipse.' : 'The night took you.'));
  p.append(
    el(
      'table',
      'stats',
      `<tr><td>Survived</td><td>${fmtTime(r.time)}</td></tr><tr><td>Level</td><td>${r.level}</td></tr><tr><td>Kills</td><td>${r.kills}</td></tr><tr><td>Shards earned</td><td>◆ ${r.shards}</td></tr>`,
    ),
  );
  const top = r.dealt[0]?.[1] || 1;
  for (const [id, n] of r.dealt) {
    p.append(el('div', 'dmg', `<span style="width:76px">${WEAPONS[id].name}</span><div class="bar"><i style="width:${(100 * n) / top}%"></i></div><span>${Math.round(n).toLocaleString()}</span>`));
  }
  for (const u of r.unlocked) p.append(el('p', 'shards', `Unlocked: ${u}!`));
  p.append(button('Again', 'big', h.again), button('Menu', 'alt', h.menu));
}

export interface TitleHandlers {
  start(character: string): void;
  shop(): void;
  help(): void;
  hub(): void;
}

export function showTitle(profile: Profile, selected: string, h: TitleHandlers): void {
  const p = screen('title');
  p.append(el('h1', 'logo', 'AFTERGLOW'));
  p.append(el('p', 'sub', 'Survive the night. Ten minutes until the Eclipse.'));
  p.append(el('div', 'shards', `${Math.floor(profile.shards)} shards`));
  const grid = el('div', 'chars');
  let pick = selected;
  const cards: HTMLButtonElement[] = [];
  for (const ch of CHARACTERS) {
    const open = !ch.unlock || ch.unlock.check(profile);
    const card = el('button', `card${open ? '' : ' locked'}${ch.id === pick ? ' picked' : ''}`);
    const icon = el('canvas');
    drawIcon(icon, WEAPON_ICON[ch.weapon], ch.hue, 52);
    card.append(icon, el('div', 'body', `<div class="name">${ch.name}</div><div class="desc">${open ? ch.blurb : `🔒 ${ch.unlock!.text}`}</div>`));
    card.onclick = () => {
      if (!open) return;
      pick = ch.id;
      cards.forEach((c, i) => c.classList.toggle('picked', CHARACTERS[i].id === pick));
    };
    cards.push(card);
    grid.append(card);
  }
  p.append(grid);
  p.append(button('Start', 'big', () => h.start(pick)));
  const row = el('div', 'row');
  row.append(button('Upgrades', 'alt', h.shop), button('How to play', 'alt', h.help));
  p.append(row, button('All games', 'alt', h.hub));
  if (profile.runs > 0)
    p.append(el('p', 'sub', `Best: ${fmtTime(profile.bestTime)} · level ${profile.bestLevel} · ${profile.wins} win${profile.wins === 1 ? '' : 's'}`));
}

export function showShop(profile: Profile, h: { buy(id: string): void; back(): void }): void {
  const p = screen('title');
  p.append(el('h2', '', 'Upgrades'));
  p.append(el('div', 'shards', `${Math.floor(profile.shards)} shards`));
  for (const m of META) {
    const rank = profile.ranks[m.id] ?? 0;
    const maxed = rank >= m.max;
    const cost = m.cost(rank);
    const card = el('button', 'card');
    const icon = el('canvas');
    drawIcon(icon, 'hex', (META.indexOf(m) * 37) % 360, 52);
    card.append(icon, el('div', 'body', `<div class="name">${m.name}</div><div class="desc">${m.desc}</div>${pips(rank, m.max)}`), el('div', 'cost', maxed ? 'MAX' : `◆ ${cost}`));
    card.disabled = maxed || profile.shards < cost;
    card.onclick = () => h.buy(m.id);
    p.append(card);
  }
  p.append(button('Back', 'big', h.back));
}

export function showHelp(back: () => void): void {
  const p = screen('title');
  p.append(el('h2', '', 'How to play'));
  p.append(
    el(
      'ul',
      'help',
      `<li><b>Drag anywhere</b> to move. That's the only control: your weapons fire on their own.</li>
       <li><b>Collect gems</b> to level up. Each level, pick one of three upgrades: new weapons, weapon levels, or passives.</li>
       <li><b>Evolve</b>: a weapon at max level plus its matching passive turns into something much stronger when you open a <b>chest</b>. Elites (gold rings) and bosses drop chests.</li>
       <li><b>Pink means danger</b>: dashed lines are about to be charged down, pink circles are about to explode, pink orbs are enemy shots.</li>
       <li>Wardens (blue hexes) shield nearby enemies. Kill them first.</li>
       <li>At 5:00 the Prism arrives. At 10:00, the Eclipse. Beat it to see the dawn.</li>
       <li>Shards you collect buy permanent upgrades between runs.</li>`,
    ),
  );
  p.append(button('Got it', 'big', back));
}
