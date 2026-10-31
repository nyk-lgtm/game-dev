// The smart Glyphwright bot. It plays like a careful human who reads the wave
// preview: it scores each loom row with a damage model of the incoming foes
// (armor, resistances, flyers, crowd size, overkill), rearranges runes by
// greedy swaps, values merges and pairs, banks gold for interest, rerolls
// within a budget and freezes a shop that holds a merge it can't yet afford.
// It never peeks at battle outcomes (no simulation of the real wave).
import {
  BENCH_SIZE,
  ENEMIES,
  REROLL_COST,
  RUNES,
  WAVES,
  buy,
  casterBase,
  compileRow,
  enemyHp,
  get,
  isBoss,
  mixSeed,
  mergeAll,
  move,
  price,
  sell,
  sellValue,
  waveQueue,
  waveWindow,
  type Element,
  type EnemyKind,
  type GameState,
  type Rune,
  type RuneId,
  type Slot,
  type Spell,
} from '../../src/glyph/core';
import type { Act, Player } from './bot';

interface Foe {
  kind: EnemyKind;
  /** Share of the wave's total HP. */
  w: number;
  hp: number;
  armor: number;
  resist: Partial<Record<Element, number>>;
  flying: boolean;
  steady: boolean;
}

export interface Profile {
  foes: Foe[];
  /** Typical crowding: how many foes an area hit or a pierce finds. */
  density: number;
  kills: number;
}

export interface SmartOptions {
  /** Multiply the value of the best row built on this caster, or holding this
   *  modifier (to probe rune strength under good play). */
  favor?: RuneId;
  favorMult?: number;
  /** Interest gold kept once the loom is filled (0..15). */
  reserve?: number;
  /** Rerolls allowed per build phase. */
  maxRerolls?: number;
  /** Minimum relative loom gain per gold to buy freely / to dip into the reserve. */
  tauFree?: number;
  tauReserve?: number;
  /** Below this damage/threat ratio, spend the interest reserve. */
  threatSpend?: number;
}

/** Total HP (and shields) a wave brings, splitter imps included. */
export function waveHpTotal(s: GameState): number {
  let hp = 0;
  for (const [, k] of waveQueue(s.seed, s.wave)) hp += enemyHp(k, s.wave) + ENEMIES[k].shield + (k === 'splitter' ? 2 * enemyHp('imp', s.wave) : 0);
  return hp;
}

function addFoe(m: Map<EnemyKind, number>, k: EnemyKind, n: number) {
  m.set(k, (m.get(k) ?? 0) + n);
}

/** The foes the next battle brings (from the wave preview), blended with a
 *  typical wave a little later: bought runes have to keep working. */
export function profileFor(seed: number, wave: number, lookahead = 0.3): Profile {
  const now = composition(waveQueue(seed, wave), wave);
  const later = composition(waveQueue(mixSeed(seed, 0x5eed), Math.min(WAVES, wave + 2)), Math.min(WAVES, wave + 2));
  const foes = new Map<EnemyKind, Foe>();
  for (const [src, k] of [
    [now, 1 - lookahead],
    [later, lookahead],
  ] as const)
    for (const f of src.foes) {
      const e = foes.get(f.kind);
      if (e) e.w += f.w * k;
      else foes.set(f.kind, { ...f, w: f.w * k });
    }
  return { foes: [...foes.values()], density: now.density, kills: now.kills };
}

function composition(q: [number, EnemyKind, number][], wave: number): Profile {
  const counts = new Map<EnemyKind, number>();
  for (const [, k] of q) {
    addFoe(counts, k, 1);
    if (k === 'splitter') addFoe(counts, 'imp', 2);
    if (k === 'lich') addFoe(counts, 'imp', 20);
  }
  let total = 0;
  const foes: Foe[] = [];
  for (const [kind, n] of counts) {
    const d = ENEMIES[kind];
    const hp = enemyHp(kind, wave) + d.shield;
    total += hp * n;
    foes.push({ kind, w: hp * n, hp, armor: d.armor, resist: d.resist, flying: d.flying, steady: d.steady });
  }
  for (const f of foes) f.w /= total;
  const n = [...counts.values()].reduce((a, b) => a + b, 0);
  return { foes, density: Math.min(3, Math.max(0.6, n / 14)), kills: n };
}

interface RowEval {
  dps: number;
  /** Slow applied per second, weighted by how much of the wave it can slow. */
  slowCov: number;
  gild: number;
  leech: number;
}

/** Tunable weights of the damage model (fit against scripts/glyph/probe.ts). */
export const W = {
  pierceD: 0.112,
  orbD: 0.225,
  orbEff: 0.8,
  beamD: 0.6,
  novaBase: 0.22,
  novaD: 0.525,
  rainD: 0.075,
  chainD: 0.235,
  splitEff: 1,
  slow: 0.45,
  burn: 0.5,
  arc: 1,
  shred: 0.013,
  // Per-caster trust (set from favor runs in balance.ts, not the row fit).
  bolt: 1,
  beam: 1.3,
  nova: 0.85,
  rain: 1.4,
  orb: 1.1,
};

function castValue(sp: Spell, cd: number, P: Profile): number {
  const D = P.density;
  let instances = sp.count;
  let per: number;
  switch (sp.caster) {
    case 'bolt':
      instances = 1 + (sp.count - 1) * W.splitEff;
      per = 1 + Math.min(sp.pierce - 1, 4) * W.pierceD * D;
      break;
    case 'orb':
      instances = 1 + (sp.count - 1) * W.splitEff;
      per = (1 + Math.min(sp.pierce - 1, 8) * W.orbD * D) * W.orbEff;
      break;
    case 'beam':
      instances = 1 + (sp.count - 1) * 0.9;
      per = 1 + W.beamD * D * (sp.area / casterBase('beam').area);
      break;
    case 'nova':
      instances = 1;
      per = (W.novaBase + W.novaD * D) * (1 + (sp.count - 1) * 0.35) * (sp.area / casterBase('nova').area) ** 2;
      break;
    case 'rain':
      per = 1 + W.rainD * D * (sp.area / casterBase('rain').area);
      break;
  }
  const hits = instances * per * W[sp.caster];
  const arcs = sp.chain > 0 ? instances * Math.min(sp.chain, 1 + W.chainD * D) * W.arc : 0;
  const burnT = Math.min(3, 1.5 + cd) * W.burn;
  let v = 0;
  for (const f of P.foes) {
    if (sp.caster === 'nova' && f.flying) continue;
    const res = f.resist[sp.element] ?? 1;
    const raw = sp.dmg * res;
    const armor = Math.max(0, f.armor - sp.shred * W.shred);
    const hitD = raw > 0 ? Math.min(f.hp, Math.max(1, raw - armor)) : 0;
    const arcD = raw > 0 ? Math.min(f.hp, Math.max(1, raw * 0.7 - armor)) : 0;
    const burn = sp.burn > 0 && (f.resist.fire ?? 1) > 0 ? Math.min(f.hp, sp.burn * burnT) : 0;
    v += f.w * (hits * (hitD + burn) + arcs * (arcD + burn));
  }
  return v;
}

export function evalRow(row: (Rune | null)[], P: Profile): RowEval {
  const sp = compileRow(row);
  if (!sp) return { dps: 0, slowCov: 0, gild: 0, leech: 0 };
  let v = castValue(sp, sp.cooldown, P);
  for (const e of sp.echoes) v += castValue(e, sp.cooldown, P);
  const dps = v / sp.cooldown;
  let slowCov = 0;
  const casts = (1 + sp.echoes.length) / sp.cooldown;
  const slowers = [sp, ...sp.echoes].filter((x) => x.slow > 0);
  for (const x of slowers) {
    let share = 0;
    for (const f of P.foes) {
      if (ENEMIES[f.kind].steady || (x.caster === 'nova' && f.flying)) continue;
      if (f.flying && x.element === 'frost' && (f.resist.frost ?? 1) < 0.5) continue;
      share += f.w;
    }
    slowCov = Math.max(slowCov, x.slow * share * Math.min(1, (casts * (x.caster === 'nova' ? 0.6 : 1)) / 0.8));
  }
  return { dps, slowCov, gild: sp.gild, leech: sp.leech };
}

const rowKey = (row: (Rune | null)[]) => row.map((r) => (r ? r.id + r.tier : '-')).join(',');

export class Evaluator {
  private cache = new Map<string, RowEval>();
  constructor(
    public P: Profile,
    private s: GameState,
    private opts: SmartOptions,
  ) {}

  row(row: (Rune | null)[]): RowEval {
    const k = rowKey(row);
    let e = this.cache.get(k);
    if (!e) {
      e = evalRow(row, this.P);
      this.cache.set(k, e);
    }
    return e;
  }

  loom(loom: (Rune | null)[][]): number {
    let rows = loom.map((r) => this.row(r));
    // Probing a caster: its best row (one only) counts extra.
    if (this.opts.favor) {
      let fi = -1;
      rows.forEach((r, i) => loom[i].some((x) => x?.id === this.opts.favor) && loom[i][0] && (fi < 0 || r.dps > rows[fi].dps) && (fi = i));
      if (fi >= 0) rows = rows.map((r, i) => (i === fi ? { ...r, dps: r.dps * (this.opts.favorMult ?? 1.4) } : r));
    }
    const dps = rows.reduce((a, r) => a + r.dps, 0);
    const slow = Math.min(0.55, rows.reduce((a, r) => a + r.slowCov, 0));
    let v = dps * (1 + W.slow * slow);
    // Economy runes: gold from kills while there are waves left to spend it.
    const left = Math.max(0, WAVES - this.s.wave) / WAVES;
    for (const r of rows) {
      if (!dps) break;
      const share = r.dps / dps;
      v += r.gild * share * this.P.kills * left * dps * 0.012;
      if (this.s.hp < this.s.maxHp) v += r.leech * share * this.P.kills * dps * 0.01 * Math.min(1, (this.s.maxHp - this.s.hp) / 5);
    }
    return v;
  }
}

const SLOTS: Slot[] = [];
for (let row = 0; row < 3; row++) for (let col = 0; col < 4; col++) SLOTS.push({ area: 'loom', row, col });
for (let i = 0; i < BENCH_SIZE; i++) SLOTS.push({ area: 'bench', i });

const fitsAt = (r: Rune | null, at: Slot) => !r || at.area === 'bench' || (at.area === 'loom' && (at.col === 0) === (RUNES[r.id].kind === 'caster'));

/** Greedy best-swap search. Mutates `s` with legal moves; returns them. */
function optimize(s: GameState, ev: Evaluator): [Slot, Slot][] {
  const moves: [Slot, Slot][] = [];
  let cur = ev.loom(s.loom);
  for (let it = 0; it < 24; it++) {
    let best = cur * 1.0005 + 1e-6;
    let pick: [Slot, Slot] | null = null;
    for (let i = 0; i < SLOTS.length; i++) {
      const A = SLOTS[i];
      if (A.area === 'bench') break;
      const a = get(s, A);
      for (let j = i + 1; j < SLOTS.length; j++) {
        const B = SLOTS[j];
        const b = get(s, B);
        if (!a && !b) continue;
        if (!fitsAt(a, B) || !fitsAt(b, A)) continue;
        // Swap in place, score, swap back.
        setSlot(s, A, b);
        setSlot(s, B, a);
        const v = ev.loom(s.loom);
        setSlot(s, A, a);
        setSlot(s, B, b);
        if (v > best) {
          best = v;
          pick = a ? [A, B] : [B, A];
        }
      }
    }
    if (!pick) break;
    move(s, pick[0], pick[1]);
    moves.push(pick);
    cur = ev.loom(s.loom);
  }
  return moves;
}

function setSlot(s: GameState, at: Slot, r: Rune | null) {
  if (at.area === 'loom') s.loom[at.row][at.col] = r;
  else if (at.area === 'bench') s.bench[at.i] = r;
}

function clone(s: GameState): GameState {
  return {
    ...s,
    loom: s.loom.map((r) => r.map((x) => x && { ...x })),
    bench: s.bench.map((x) => x && { ...x }),
    shop: s.shop.map((o) => ({ rune: { ...o.rune }, sold: o.sold })),
    battle: null,
  };
}

const owned = (s: GameState, id: string, tier: number) => [...s.loom.flat(), ...s.bench].filter((r) => r && r.id === id && r.tier === tier).length;

/** Value of keeping a bench rune: pairs and spares that could slot in. */
function benchKeep(s: GameState, i: number, ev: Evaluator): number {
  const r = s.bench[i];
  if (!r) return -1;
  const n = owned(s, r.id, r.tier);
  // Without it, how good is the best loom? (it may be a spare for some waves)
  const t = clone(s);
  t.bench[i] = null;
  const base = ev.loom(s.loom);
  optimize(t, ev);
  const tc = clone(s);
  optimize(tc, ev);
  const lost = Math.max(0, ev.loom(tc.loom) - ev.loom(t.loom)) / Math.max(1, base);
  return lost + (n >= 2 ? 0.08 * r.tier : 0) + (r.tier > 1 ? 0.05 : 0);
}

interface Plan {
  score: number;
  sellFirst: number | null;
  i: number;
}

export function smartPlayer(opts: SmartOptions = {}): Player {
  const reserveMax = opts.reserve ?? 10;
  const maxRerolls = opts.maxRerolls ?? 10;
  const tauFree = opts.tauFree ?? 0.004;
  const tauReserve = opts.tauReserve ?? 0.01;
  let lastHp = 20;
  let lastWave = 0;
  return {
    name: opts.favor ? `smart+${opts.favor}` : 'smart',
    turn(s: GameState, act: Act) {
      if (s.wave <= lastWave || s.wave === 1) lastHp = s.maxHp;
      const hurt = lastHp - s.hp;
      lastHp = s.hp;
      lastWave = s.wave;
      const P = profileFor(s.seed, s.wave);
      const ev = new Evaluator(P, s, opts);
      const boss = waveQueue(s.seed, s.wave).some(([, k]) => isBoss(k));
      const rowsFilled = s.loom.every((r) => r[0]);
      // Bank interest once the loom has casters; spend more when bleeding or a boss is near.
      let reserve = s.wave <= 2 || !rowsFilled ? 0 : reserveMax;
      if (hurt >= 3 || boss) reserve = Math.min(reserve, 5);
      // Threat: the loom's modelled damage against the wave's HP per second of
      // arrivals. Below ~3 the tower usually gets hurt (measured): spend.
      const threat = () => ev.loom(s.loom) / (waveHpTotal(s) / waveWindow(s.wave));
      if (s.wave >= WAVES - 1) reserve = 0;

      const doOpt = () => {
        for (const [a, b] of optimize(clone(s), ev)) if (!act({ t: 'move', from: a, to: b })) break;
      };
      doOpt();
      let rerolls = 0;
      for (let guard = 0; guard < 40; guard++) {
        const base = Math.max(1, ev.loom(s.loom));
        const ts = opts.threatSpend ?? 3;
        const threatNow = threat();
        const keep = threatNow < ts ? 0 : threatNow < ts + 0.5 ? Math.min(5, reserve) : reserve;
        let best: Plan | null = null;
        // The least useful bench rune, sold to make room when the bench is full.
        let worst = -1;
        let wv = Infinity;
        if (!s.bench.includes(null))
          for (let b = 0; b < BENCH_SIZE; b++) {
            const k = benchKeep(s, b, ev);
            if (k < wv) {
              wv = k;
              worst = b;
            }
          }
        for (let i = 0; i < s.shop.length; i++) {
          const o = s.shop[i];
          const cost = price(o.rune);
          if (o.sold || cost > s.gold) continue;
          // Try buying (selling the least useful bench rune first if needed).
          const tries: (number | null)[] = worst >= 0 ? [null, worst] : [null];
          for (const sf of tries) {
            const t = clone(s);
            let refund = 0;
            if (sf !== null) {
              refund = sellValue(t.bench[sf]!);
              sell(t, { area: 'bench', i: sf });
            }
            if (!buy(t, i)) continue;
            optimize(t, ev);
            let gain = (ev.loom(t.loom) - base) / base;
            // A pair is half way to a merge.
            const r = o.rune;
            const n = owned(t, r.id, r.tier);
            if (n === 2 && r.tier < 3) {
              const h = clone(t);
              // Pretend the third copy arrives.
              h.bench.push({ ...r });
              mergeAll(h);
              h.bench = h.bench.slice(0, BENCH_SIZE);
              optimize(h, ev);
              gain += Math.max(0, (ev.loom(h.loom) - base) / base - gain) * 0.35;
            }
            if (sf !== null) gain -= 0.01 + wv;
            const net = cost - refund;
            const free = s.gold - cost >= keep;
            const score = gain / Math.max(1, net);
            if (score < (free ? tauFree : tauReserve)) continue;
            if (!best || score > best.score) best = { score, sellFirst: sf, i };
          }
        }
        if (best) {
          if (best.sellFirst !== null) act({ t: 'sell', at: { area: 'bench', i: best.sellFirst } });
          act({ t: 'buy', i: best.i });
          doOpt();
          continue;
        }
        if (rerolls < maxRerolls && s.gold - REROLL_COST >= keep + 2) {
          if (act({ t: 'reroll' })) {
            rerolls++;
            continue;
          }
        }
        break;
      }
      // Round gold up to the next interest step by selling junk.
      if (s.gold % 5 === 4 && s.gold < 15) {
        let worst = -1;
        let wv = 0.02;
        for (let b = 0; b < BENCH_SIZE; b++) {
          const k = benchKeep(s, b, ev);
          if (s.bench[b] && k < wv) {
            wv = k;
            worst = b;
          }
        }
        if (worst >= 0) act({ t: 'sell', at: { area: 'bench', i: worst } });
      }
      // Freeze a shop holding the third copy of something we couldn't afford.
      const want = s.shop.some((o) => !o.sold && price(o.rune) > s.gold && o.rune.tier < 3 && owned(s, o.rune.id, o.rune.tier) >= 2);
      if (want !== s.frozen) act({ t: 'freeze' });
    },
  };
}
