// Modal cards (help, menus, game over) shared by every game.

import { BUILD } from './debug';

const $ = (id: string) => document.getElementById(id)!;

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
