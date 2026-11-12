// The word list, unpacked from the front-coded string in words.ts (see
// scripts/quarry/build-words.ts). Lookups are one Set probe; prefixes (for
// bots and board searches) are built lazily.

export class Dict {
  /** Every playable word. */
  readonly words = new Set<string>();
  /** The common subset (SCOWL ≤ 35), which bots stick to. */
  readonly common = new Set<string>();
  private pre: Map<boolean, Set<string>> = new Map();

  constructor(packed: string) {
    let prev = '';
    let i = 0;
    while (i < packed.length) {
      const c = packed.charCodeAt(i);
      const isCommon = c < 65;
      const k = isCommon ? c - 48 : c - 65;
      let j = i + 1;
      while (j < packed.length && packed.charCodeAt(j) >= 97) j++;
      const w = prev.slice(0, k) + packed.slice(i + 1, j);
      this.words.add(w);
      if (isCommon) this.common.add(w);
      prev = w;
      i = j;
    }
  }

  has(w: string): boolean {
    return this.words.has(w);
  }

  /** All proper prefixes of the (common) words, for searches that prune dead ends. */
  prefixes(commonOnly = false): Set<string> {
    let p = this.pre.get(commonOnly);
    if (!p) {
      p = new Set<string>();
      for (const w of commonOnly ? this.common : this.words) for (let k = 1; k < w.length; k++) p.add(w.slice(0, k));
      this.pre.set(commonOnly, p);
    }
    return p;
  }
}
