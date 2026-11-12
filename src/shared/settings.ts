// Settings shared by every game, set on the hub: sound and vibration.
// Stored under one key; read when a game starts (and when audio first unlocks).

export interface Settings {
  sound: boolean;
  vibrate: boolean;
  /** Fewer flashes, no screen shake, no endless blinking. Defaults to the phone's reduce-motion setting. */
  reduced: boolean;
}

const KEY = 'hub.settings';
const prefersReduced = (): boolean => {
  try {
    return matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};
const DEFAULTS = (): Settings => ({ sound: true, vibrate: true, reduced: prefersReduced() });

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS(), ...(JSON.parse(raw) as Partial<Settings>) } : DEFAULTS();
  } catch {
    return DEFAULTS();
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // ignore
  }
}

/** Applies what can be applied page-wide: vibration off silences navigator.vibrate. */
export function applySettings(): void {
  const st = loadSettings();
  if (st.reduced) document.documentElement.classList.add('reduced-fx');
  if (st.vibrate) return;
  try {
    Object.defineProperty(navigator, 'vibrate', { value: () => false, configurable: true });
  } catch {
    // ignore
  }
}

/** Sound is on (games check this before starting any audio). */
export const soundOn = (): boolean => loadSettings().sound;

let reducedCache: boolean | null = null;
/** Reduced effects on (cached for the page's life; it's set on the hub). */
export const reducedFx = (): boolean => (reducedCache ??= loadSettings().reduced);
