// On-device debugging shared by every game: errors are shown on screen (there
// are no devtools on a phone), plus clipboard and toast helpers.
import { applySettings } from './settings';

export const BUILD = `${__BUILD_ID__} · ${__BUILD_TIME__} UTC`;

export function installErrorOverlay(): void {
  applySettings();
  // Remember which game was played last, for the hub's Continue button.
  try {
    const game = location.pathname.split('/').filter(Boolean).pop();
    if (game && !game.includes('.')) localStorage.setItem('hub.last', game);
  } catch {
    // storage blocked: no Continue button
  }
  const box = document.getElementById('errors')!;
  const show = (msg: string) => {
    const el = document.createElement('div');
    el.className = 'err';
    el.textContent = `⚠ ${msg}`;
    el.onclick = () => el.remove();
    box.appendChild(el);
    while (box.children.length > 3) box.firstElementChild?.remove();
  };
  window.addEventListener('error', (e) => show(`${e.message} @ ${e.filename?.split('/').pop()}:${e.lineno}`));
  window.addEventListener('unhandledrejection', (e) => show(String(e.reason)));
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for browsers without async clipboard permission.
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

export function toast(msg: string): void {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}
