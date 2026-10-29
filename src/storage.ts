// Thin, failure-tolerant wrapper over localStorage. Storage may be missing
// (private mode, blocked site data), so every access is guarded.

const PREFIX = 'telegraph.';

export function load<T>(name: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + name);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function save(name: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + name, JSON.stringify(value));
  } catch {
    // ignore
  }
}
