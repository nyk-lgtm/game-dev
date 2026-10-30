import { RULES_VERSION } from '../core';

// On-device debugging: errors are shown on screen (no devtools on a phone),
// and a run can be exported as a short text code and replayed exactly.

export const BUILD = `${__BUILD_ID__} · ${__BUILD_TIME__} UTC`;

export function installErrorOverlay(): void {
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

export function bugReport(seed: number, actions: string, depth: number): string {
  const ua = navigator.userAgent.replace(/\s+/g, ' ');
  return `TELEGRAPH build=${__BUILD_ID__} rules=${RULES_VERSION} seed=${seed} depth=${depth} a=${actions || '-'} screen=${innerWidth}x${innerHeight}@${devicePixelRatio} ua="${ua}"`;
}

/** Reads ?seed=123&a=0152w from the URL (for reproducing bug reports). */
export function replayFromUrl(): { seed: number; actions: string } | null {
  const p = new URLSearchParams(location.search);
  const seed = Number(p.get('seed'));
  if (!p.has('seed') || !Number.isFinite(seed)) return null;
  const a = p.get('a') ?? '';
  return { seed, actions: a === '-' ? '' : a };
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
