// Settings shared by every game, set on the hub: sound and vibration.
// Stored under one key; read when a game starts (and when audio first unlocks).

export interface Settings {
  sound: boolean;
  vibrate: boolean;
}

const KEY = 'hub.settings';
const DEFAULTS: Settings = { sound: true, vibrate: true };

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) } : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
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
  if (loadSettings().vibrate) return;
  try {
    Object.defineProperty(navigator, 'vibrate', { value: () => false, configurable: true });
  } catch {
    // ignore
  }
}

/** Sound is on (games check this before starting any audio). */
export const soundOn = (): boolean => loadSettings().sound;
