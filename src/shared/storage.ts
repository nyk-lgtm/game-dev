// Thin, failure-tolerant wrapper over localStorage. Storage may be missing
// (private mode, blocked site data), so every access is guarded. Each game
// gets its own key prefix; all games share one origin.

export interface Store {
  load<T>(name: string, fallback: T): T;
  save(name: string, value: unknown): void;
}

export function makeStore(prefix: string): Store {
  return {
    load<T>(name: string, fallback: T): T {
      try {
        const raw = localStorage.getItem(prefix + name);
        return raw === null ? fallback : (JSON.parse(raw) as T);
      } catch {
        return fallback;
      }
    },
    save(name: string, value: unknown): void {
      try {
        localStorage.setItem(prefix + name, JSON.stringify(value));
      } catch {
        // ignore
      }
    },
  };
}
