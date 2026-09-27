// localStorage persistence (brief §14): debounced writes, flush on
// pagehide/visibilitychange, every storage call wrapped in try/catch.

export const STORAGE_KEY = "benchmate:v1";
const DEBOUNCE_MS = 250;

export type StorageLike = Pick<Storage, "getItem" | "setItem">;

export function loadJSON<T>(storage: StorageLike | null, key = STORAGE_KEY): T | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/** Returns false if the write failed (quota exceeded, private mode, …). */
export function saveJSON(storage: StorageLike | null, value: unknown, key = STORAGE_KEY): boolean {
  if (!storage) return false;
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function browserStorage(): StorageLike | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

/** Debounced writer with an explicit flush for page lifecycle events. */
export function createDebouncedWriter(write: () => void, delayMs = DEBOUNCE_MS) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    schedule() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        write();
      }, delayMs);
    },
    flush() {
      if (!timer) return;
      clearTimeout(timer);
      timer = null;
      write();
    },
  };
}
