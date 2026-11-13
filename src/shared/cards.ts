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
  /** A second main action: rides in the long card's sticky footer with the primary. */
  pin?: boolean;
  onClick: () => void;
}

export function showCard(html: string, buttons: CardButton[], dismissable = true): void {
  const o = $('overlay');
  o.innerHTML = '';
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = html;
  const pinned: HTMLButtonElement[] = [];
  for (const b of buttons) {
    const el = document.createElement('button');
    el.className = b.primary ? 'primary' : 'secondary';
    el.textContent = b.label;
    el.onclick = b.onClick;
    card.appendChild(el);
    if (b.pin && !b.primary) pinned.push(el);
  }
  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.textContent = `build ${BUILD}`;
  card.appendChild(meta);
  o.appendChild(card);
  o.hidden = false;
  // A long card whose primary button starts out below the fold keeps that
  // button pinned to the card's bottom edge (a sticky footer) until you scroll
  // to where it really sits, so "Got it" is always one tap away.
  const primary = [...card.querySelectorAll<HTMLButtonElement>(':scope > button.primary')][0];
  let footer: HTMLElement | null = null;
  if (primary && primary.getBoundingClientRect().bottom > card.getBoundingClientRect().bottom) {
    footer = document.createElement('div');
    footer.className = 'stick';
    // Span the card's side padding and cover its bottom padding, whatever a
    // game's own card style sets them to.
    const cs = getComputedStyle(card);
    footer.style.margin = `0 -${cs.paddingRight} 0 -${cs.paddingLeft}`;
    footer.style.paddingLeft = cs.paddingLeft;
    footer.style.paddingRight = cs.paddingRight;
    footer.style.bottom = `-${cs.paddingBottom}`;
    card.insertBefore(footer, primary);
    footer.appendChild(primary);
    for (const el of pinned) footer.appendChild(el);
  }
  // Long cards get a "more below" hint pinned to the bottom until you scroll
  // there. Only real content counts: not the build line, nor the hint itself.
  const hidden = card.scrollHeight - card.clientHeight - meta.offsetHeight;
  // How far real content reaches below the card's visible edge (a last button that
  // merely dips into the card's bottom padding is in view and needs no hint over it).
  const edge = card.getBoundingClientRect().bottom;
  const reach = Math.max(0, ...[...card.children].filter((el) => el !== meta).map((el) => el.getBoundingClientRect().bottom - edge));
  if (hidden > 24 && reach > 24) {
    const more = document.createElement('div');
    more.className = 'more';
    more.textContent = '▼ scroll for more';
    // With a sticky footer the hint rides just above its button.
    if (footer) footer.prepend(more);
    else card.appendChild(more);
    card.addEventListener('scroll', () => {
      more.style.opacity = card.scrollTop >= hidden - 8 ? '0' : '1';
    });
  }
  // A tap on the backdrop closes it. Pointer events rather than click: a tap
  // whose finger drifts a little can lose its click on a phone.
  let downOnBackdrop = false;
  o.onclick = null;
  o.onpointerdown = dismissable ? (e) => (downOnBackdrop = e.target === o) : null;
  o.onpointerup = dismissable ? (e) => downOnBackdrop && e.target === o && closeOverlay() : null;
}
