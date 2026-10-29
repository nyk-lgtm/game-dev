// DOM UI: HUD, bottom info panel, and modal cards.

import { ENEMIES, type GameState } from '../core';
import { BUILD } from '../debug/debug';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export function renderHud(s: GameState): void {
  $('depth').textContent = String(s.depth);
  $('kills').textContent = String(s.kills);
  const hearts = $('hearts');
  hearts.innerHTML = '';
  for (let i = 0; i < s.player.maxHp; i++) {
    const h = document.createElement('span');
    h.className = i < s.player.hp ? 'h' : 'h empty';
    h.textContent = '♥';
    hearts.appendChild(h);
  }
}

export interface PanelAction {
  label: string;
  danger?: boolean;
  onClick: () => void;
}

export function renderPanel(html: string, action: PanelAction | null): void {
  $('info').innerHTML = html;
  const btn = $<HTMLButtonElement>('actBtn');
  if (action) {
    btn.hidden = false;
    btn.textContent = action.label;
    btn.className = action.danger ? 'primary danger' : 'primary';
    btn.onclick = action.onClick;
  } else {
    btn.hidden = true;
    btn.onclick = null;
  }
}

export function closeOverlay(): void {
  const o = $('overlay');
  o.hidden = true;
  o.innerHTML = '';
}

interface CardButton {
  label: string;
  primary?: boolean;
  onClick: () => void;
}

export function showCard(html: string, buttons: CardButton[], dismissable = true): void {
  const o = $('overlay');
  o.innerHTML = '';
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = html;
  for (const b of buttons) {
    const el = document.createElement('button');
    el.className = b.primary ? 'primary' : 'secondary';
    el.textContent = b.label;
    el.onclick = b.onClick;
    card.appendChild(el);
  }
  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.textContent = `build ${BUILD}`;
  card.appendChild(meta);
  o.appendChild(card);
  o.hidden = false;
  o.onclick = dismissable ? (e) => e.target === o && closeOverlay() : null;
}

export const HELP_HTML = `
<h2>How to play</h2>
<p>You are the <span class="c-player">spear</span>. Reach the stairs at the top of each floor. Go as deep as you can.</p>
<ul>
  <li><b>Tap a hex</b> to preview the move. <b>Tap it again</b> (or press <b>Move</b>) to do it.</li>
  <li><b>Moving is attacking.</b> You never attack by standing still.</li>
  <li><b>Stab</b>: step from one hex next to an enemy to another hex next to it. 1 damage.</li>
  <li><b>Lunge</b>: step straight toward an enemy 2 hexes away. 2 damage.</li>
  <li>Wounded enemies are <b>dazed</b> and skip their next action.</li>
  <li><span class="c-threat">Red hexes</span> are danger zones for the enemy turn.</li>
  <li><span class="c-brute">Brute</span> (2 HP): ${ENEMIES.brute.blurb}</li>
  <li><span class="c-archer">Archer</span> (1 HP): ${ENEMIES.archer.blurb}</li>
  <li>Walls block arrows. Lava blocks walking, not arrows.</li>
  <li>Kill every enemy before taking the stairs to <span class="c-heal">heal 1 ♥</span>.</li>
  <li>The preview is exact: it shows who dies (✕) and damage you will take.</li>
</ul>
`;
