import { describe, expect, it } from 'vitest';
import {
  ETHER_MP,
  MONSTERS,
  MP_REGEN_EVERY,
  SIGHT,
  SPELLS,
  XP_TABLE,
  applyAction,
  attackOf,
  defenceOf,
  fireDamage,
  generateFloor,
  idx,
  isLegal,
  los,
  monsterAt,
  type GameState,
  type Monster,
} from '../../src/delve/core';
import { act, cast, cell, reroll, setup } from './helpers';

const N = 0;
const E = 1;
const S = 2;
const W = 3;
const mon = (s: GameState, kind: string) => s.monsters.find((m) => m.kind === kind)!;
const pos = (s: GameState) => ({ x: s.player.x, y: s.player.y });
const tile = (s: GameState, x: number, y: number) => s.level.tiles[idx(x, y)];
/** Make a monster effectively unkillable and harmless-to-assert-on. */
const tough = (m: Monster, hp = 999) => {
  m.hp = m.maxHp = hp;
  return m;
};

describe('movement', () => {
  const room = ['.....', '..@..', '.....'];

  it('forward / back / strafe move one cell relative to the facing, and take a turn', () => {
    const s = setup(room, { dir: E });
    const at = cell(2, 1);
    expect(pos(act(s, 'forward').state)).toEqual({ x: at.x + 1, y: at.y });
    expect(pos(act(s, 'back').state)).toEqual({ x: at.x - 1, y: at.y });
    expect(pos(act(s, 'strafeL').state)).toEqual({ x: at.x, y: at.y - 1 });
    expect(pos(act(s, 'strafeR').state)).toEqual({ x: at.x, y: at.y + 1 });
    for (const a of ['forward', 'back', 'strafeL', 'strafeR'] as const) {
      const r = act(s, a);
      expect(r.state.turn).toBe(1);
      expect(r.state.player.dir).toBe(E);
      expect(r.events).toContainEqual({ type: 'move' });
    }
  });

  it('turning is free: it changes facing without advancing the turn or letting monsters act', () => {
    const s = setup(['@r.'], { dir: N });
    let r = act(s, 'right');
    expect(r.state.player.dir).toBe(E);
    expect(r.state.turn).toBe(0);
    expect(r.state.player.hp).toBe(s.player.hp);
    r = act(r.state, 'left', 'left', 'left', 'left');
    expect(r.state.player.dir).toBe(E);
    expect(r.state.turn).toBe(0);
    expect(r.state.rolls).toBe(s.rolls);
    expect(r.events.filter((e) => e.type === 'turn').map((e) => (e as { dir: number }).dir)).toEqual([N, W, S, E]);
  });

  it('walls and pillars block without spending a turn', () => {
    const s = setup(['#@O', '...'], { dir: E });
    for (const dir of [E, W, N] as const) {
      const t = structuredClone(s);
      t.player.dir = dir;
      const r = act(t, 'forward');
      expect(pos(r.state)).toEqual(pos(s));
      expect(r.state.turn).toBe(0);
      expect(r.events).toEqual([{ type: 'bump' }]);
    }
    // Back / strafe into a wall too.
    expect(act(s, 'back').state.turn).toBe(0);
    expect(act(s, 'strafeL').state.turn).toBe(0);
    expect(pos(act(s, 'strafeR').state)).toEqual({ x: s.player.x, y: s.player.y + 1 });
  });

  it('a door opens on bump (spending the turn), then can be walked through; use closes it', () => {
    const s = setup(['@+..'], { dir: E });
    const door = cell(1, 0);
    let r = act(s, 'forward');
    expect(tile(r.state, door.x, door.y)).toBe('open');
    expect(pos(r.state)).toEqual(pos(s));
    expect(r.state.turn).toBe(1);
    expect(r.events).toContainEqual({ type: 'door' });
    r = act(r.state, 'forward');
    expect(pos(r.state)).toEqual(door);
    // Step back and pull it shut.
    r = act(r.state, 'back', 'use');
    expect(tile(r.state, door.x, door.y)).toBe('door');
    r = act(r.state, 'use');
    expect(tile(r.state, door.x, door.y)).toBe('open');
  });

  it('closed doors block sight until opened', () => {
    const s = setup(['@+...'], { dir: E });
    const beyond = cell(3, 0);
    expect(los(s, s.player.x, s.player.y, beyond.x, beyond.y)).toBe(false);
    const r = act(s, 'forward');
    expect(los(r.state, s.player.x, s.player.y, beyond.x, beyond.y)).toBe(true);
    expect(r.state.level.seen[idx(beyond.x, beyond.y)]).toBe(true);
    const t = act(s, 'wait').state;
    expect(t.level.seen[idx(beyond.x, beyond.y)]).toBe(false);
    expect(t.level.seen[idx(s.player.x + 1, s.player.y)]).toBe(true); // the door itself is seen
  });

  it('back and strafe never attack: bumping a monster that way is a free no-op', () => {
    const s = setup(['r@.'], { dir: E });
    const r = act(s, 'back');
    expect(r.state.turn).toBe(0);
    expect(mon(r.state, 'rat').hp).toBe(MONSTERS.rat.hp);
    expect(r.events).toEqual([{ type: 'bump' }]);
  });
});

describe('combat', () => {
  it('melee hits, misses and crits stay within the formula', () => {
    const base = setup(['@g'], { dir: E });
    tough(mon(base, 'ghoul'));
    base.player.weapon = 2;
    const raw = attackOf(base) - MONSTERS.ghoul.def;
    let hits = 0;
    let crits = 0;
    const n = 600;
    for (let i = 0; i < n; i++) {
      const r = act(reroll(base, i * 7), 'forward');
      const hit = r.events.find((e) => e.type === 'hit');
      if (!hit) {
        expect(r.events.some((e) => e.type === 'miss')).toBe(true);
        continue;
      }
      if (hit.type !== 'hit') continue;
      hits++;
      const lo = Math.max(1, raw - 1);
      const hi = raw + 2;
      if (hit.crit) {
        crits++;
        expect(hit.dmg % 2).toBe(0);
        expect(hit.dmg / 2).toBeGreaterThanOrEqual(lo);
        expect(hit.dmg / 2).toBeLessThanOrEqual(hi);
      } else {
        expect(hit.dmg).toBeGreaterThanOrEqual(lo);
        expect(hit.dmg).toBeLessThanOrEqual(hi);
      }
      expect(mon(r.state, 'ghoul').hp).toBe(999 - hit.dmg);
    }
    expect(hits / n).toBeGreaterThan(0.8);
    expect(hits / n).toBeLessThan(0.95);
    expect(crits / hits).toBeGreaterThan(0.04);
    expect(crits / hits).toBeLessThan(0.18);
  });

  it('a hit always deals at least 1, even against armour', () => {
    const base = setup(['@G'], { dir: E });
    tough(mon(base, 'golem'));
    base.player.baseAtk = 0;
    for (let i = 0; i < 50; i++) {
      const hit = act(reroll(base, i), 'forward').events.find((e) => e.type === 'hit');
      if (hit && hit.type === 'hit') expect(hit.dmg).toBeGreaterThanOrEqual(1);
    }
  });

  it('monster blows stay within atk - defence +-1 (min 1), about 80% land', () => {
    const base = setup(['@.', '.g'], { dir: E });
    const g = tough(mon(base, 'ghoul'));
    g.x = base.player.x + 1;
    g.y = base.player.y;
    base.player.dir = S; // facing away; just wait
    base.player.armor = 2;
    base.player.hp = base.player.maxHp = 999;
    const raw = MONSTERS.ghoul.atk - defenceOf(base);
    let landed = 0;
    for (let i = 0; i < 300; i++) {
      const r = act(reroll(base, i * 3), 'wait');
      const h = r.events.find((e) => e.type === 'hurt');
      if (!h || h.type !== 'hurt') continue;
      landed++;
      expect(h.by).toBe('ghoul');
      expect(h.dmg).toBeGreaterThanOrEqual(Math.max(1, raw - 1));
      expect(h.dmg).toBeLessThanOrEqual(raw + 1);
      expect(r.state.player.hp).toBe(999 - h.dmg);
    }
    expect(landed / 300).toBeGreaterThan(0.7);
    expect(landed / 300).toBeLessThan(0.9);
  });

  it('kills grant XP, count, and remove the monster', () => {
    const base = setup(['@r'], { dir: E });
    mon(base, 'rat').hp = 1;
    let r = act(base, 'forward');
    for (let i = 1; !r.events.some((e) => e.type === 'kill'); i++) r = act(reroll(base, i), 'forward');
    expect(r.state.player.xp).toBe(MONSTERS.rat.xp);
    expect(r.state.kills).toBe(1);
    expect(r.state.monsters).toEqual([]);
    expect(r.events).toContainEqual({ type: 'kill', kind: 'rat' });
  });

  it('level-ups raise stats and teach spells at their levels', () => {
    for (const [spell, def] of Object.entries(SPELLS)) {
      if (def.level === 1) continue;
      const s = setup(['@r'], { dir: E });
      const p = s.player;
      p.level = def.level - 1;
      p.xp = XP_TABLE[p.level] - 1;
      p.spells = p.spells.filter((x) => x === 'fire');
      p.mp = p.maxMp;
      const before = structuredClone(p);
      mon(s, 'rat').hp = 1;
      const r = act(s, cast('fire'));
      const q = r.state.player;
      expect(q.level, spell).toBe(def.level);
      expect(q.maxHp).toBe(before.maxHp + 6);
      expect(q.hp).toBe(before.hp + 6);
      expect(q.maxMp).toBe(before.maxMp + 2);
      expect(q.baseAtk).toBe(before.baseAtk + 1);
      expect(q.baseDef).toBe(before.baseDef + (def.level % 2 === 0 ? 1 : 0));
      expect(q.spells).toContain(spell);
      expect(r.events).toContainEqual({ type: 'levelUp', level: def.level });
    }
  });

  it('a big XP gain levels up several times at once and learns every spell on the way', () => {
    const s = setup(['@G'], { dir: E });
    const g = mon(s, 'golem');
    g.hp = 1;
    s.player.xp = XP_TABLE[6] - MONSTERS.golem.xp; // exactly enough for level 7 from level 1
    s.player.mp = s.player.maxMp;
    const r = act(s, cast('fire'));
    expect(r.state.player.level).toBe(7);
    expect(r.events.filter((e) => e.type === 'levelUp').length).toBe(6);
    expect([...r.state.player.spells].sort()).toEqual(['blink', 'fire', 'frost', 'heal']);
  });

  it('XP thresholds rise steadily', () => {
    for (let i = 1; i < XP_TABLE.length; i++) expect(XP_TABLE[i]).toBeGreaterThan(XP_TABLE[i - 1]);
    for (const def of Object.values(SPELLS)) expect(def.level).toBeLessThanOrEqual(XP_TABLE.length);
  });

  it('death at 0 HP ends the run and nothing further is legal', () => {
    const s = setup(['@g'], { dir: S });
    s.player.hp = 1;
    tough(mon(s, 'ghoul'));
    let r = act(s, 'wait');
    for (let i = 1; r.state.status === 'playing'; i++) r = act(reroll(s, i), 'wait');
    expect(r.state.status).toBe('dead');
    expect(r.state.player.hp).toBe(0);
    expect(r.events).toContainEqual({ type: 'death' });
    for (const a of ['forward', 'wait', 'left'] as const) {
      expect(isLegal(r.state, { type: a })).toBe(false);
      expect(() => applyAction(r.state, { type: a })).toThrow();
    }
  });
});

describe('spells', () => {
  it('firebolt hits only the first monster in line, for fireDamage(level), and costs MP', () => {
    const s = setup(['@..s.s'], { dir: E });
    s.monsters.forEach((m) => tough(m));
    s.player.level = 4;
    const r = act(s, cast('fire'));
    const [a, b] = r.state.monsters;
    expect(a.hp).toBe(999 - fireDamage(4));
    expect(b.hp).toBe(999);
    expect(r.state.player.mp).toBe(s.player.mp - SPELLS.fire.cost);
    expect(r.events).toContainEqual({ type: 'bolt', spell: 'fire', dist: 3 });
  });

  it('firebolt stops at walls, pillars and closed doors, but flies through open doors', () => {
    for (const [row, hits] of [
      ['@.#.s', false],
      ['@.O.s', false],
      ['@.+.s', false],
      ["@.'.s", true],
    ] as const) {
      const s = setup([row], { dir: E });
      tough(mon(s, 'skeleton'));
      const r = act(s, cast('fire'));
      expect(mon(r.state, 'skeleton').hp < 999, row).toBe(hits);
    }
    // Not in the facing line: nothing.
    const s = setup(['@...', '..s.'], { dir: E });
    tough(mon(s, 'skeleton'));
    expect(mon(act(s, cast('fire')).state, 'skeleton').hp).toBe(999);
  });

  it('frost damages and stuns for 3 monster turns', () => {
    const s = setup(['@r'], { dir: E });
    s.player.spells.push('frost');
    s.player.mp = 20;
    s.player.level = 3;
    tough(mon(s, 'rat'));
    let r = act(s, cast('frost'));
    expect(mon(r.state, 'rat').hp).toBe(999 - (3 + 3));
    expect(r.events.some((e) => e.type === 'hurt')).toBe(false);
    r = act(r.state, 'left', 'left', 'wait', 'wait'); // turn away and stand still
    expect(r.events.some((e) => e.type === 'hurt')).toBe(false);
    expect(mon(r.state, 'rat').stun).toBe(0);
    // Then it fights again.
    let hurt = false;
    for (let i = 0; i < 10 && !hurt; i++) {
      r = act(r.state, 'wait');
      hurt = r.events.some((e) => e.type === 'hurt');
    }
    expect(hurt).toBe(true);
  });

  it('the Warden shakes off frost after one turn', () => {
    const s = setup(['@W'], { dir: E });
    s.player.spells.push('frost');
    s.player.mp = 20;
    const r = act(s, cast('frost'));
    expect(mon(r.state, 'warden').stun).toBe(0);
  });

  it('Mend restores half your health (capped) and is illegal at full health', () => {
    const s = setup(['@.'], { dir: E });
    s.player.spells.push('heal');
    s.player.mp = 20;
    expect(isLegal(s, cast('heal'))).toBe(false);
    s.player.hp = 1;
    let r = act(s, cast('heal'));
    expect(r.state.player.hp).toBe(1 + Math.ceil(s.player.maxHp / 2));
    expect(r.state.player.mp).toBe(20 - SPELLS.heal.cost);
    s.player.hp = s.player.maxHp - 2;
    r = act(s, cast('heal'));
    expect(r.state.player.hp).toBe(s.player.maxHp);
  });

  it('blink jumps up to 4 cells, stopping before walls, monsters and closed doors', () => {
    for (const [row, d] of [
      ['@........', 4],
      ['@..#.....', 2],
      ['@.r......', 1],
      ['@+.......', 0],
      ["@.'......", 4],
      ['@O.......', 0],
    ] as const) {
      const s = setup([row], { dir: E });
      s.player.spells.push('blink');
      s.player.mp = 20;
      const r = act(s, cast('blink'));
      expect(r.state.player.x - s.player.x, row).toBe(d);
      expect(r.state.player.mp).toBe(20 - SPELLS.blink.cost);
      if (row.includes('+')) expect(r.state.level.tiles[idx(s.player.x + 1, s.player.y)]).toBe('door');
    }
  });

  it('blink picks up what it lands on and descends if it lands on the stairs', () => {
    const s = setup(['@...!'], { dir: E });
    s.player.spells.push('blink');
    s.player.mp = 20;
    expect(act(s, cast('blink')).state.player.potions).toBe(s.player.potions + 1);
    const t = setup(['@...>'], { dir: E });
    t.player.spells.push('blink');
    t.player.mp = 20;
    expect(act(t, cast('blink')).state.depth).toBe(2);
  });

  it('casting needs the spell and the MP', () => {
    const s = setup(['@.'], { dir: E });
    expect(s.player.spells).toEqual(['fire']);
    expect(isLegal(s, cast('frost'))).toBe(false);
    expect(() => applyAction(s, cast('blink'))).toThrow();
    s.player.mp = SPELLS.fire.cost - 1;
    expect(isLegal(s, cast('fire'))).toBe(false);
    s.player.mp = SPELLS.fire.cost;
    expect(isLegal(s, cast('fire'))).toBe(true);
  });

  it(`MP regenerates by 1 every ${MP_REGEN_EVERY} turns, never above max`, () => {
    const s = setup(['@.'], { dir: E });
    s.player.mp = 0;
    let r = act(s, ...Array(MP_REGEN_EVERY - 1).fill('wait'));
    expect(r.state.player.mp).toBe(0);
    r = act(r.state, 'right', 'left'); // free turns don't count
    expect(r.state.player.mp).toBe(0);
    r = act(r.state, 'wait');
    expect(r.state.player.mp).toBe(1);
    r = act(r.state, ...Array(MP_REGEN_EVERY * 40).fill('wait'));
    expect(r.state.player.mp).toBe(r.state.player.maxMp);
  });
});

describe('items', () => {
  it('walking onto items picks them up', () => {
    const s = setup(['@!?$'], { dir: E, itemValue: 25 });
    const r = act(s, 'forward', 'forward', 'forward');
    expect(r.state.player.potions).toBe(s.player.potions + 1);
    expect(r.state.player.ethers).toBe(s.player.ethers + 1);
    expect(r.state.player.gold).toBe(25);
    expect(r.state.items).toEqual([]);
    expect(r.events.filter((e) => e.type === 'pickup').length).toBe(3);
  });

  it('weapons and armour are equipped only if better', () => {
    const s = setup(['@)['], { dir: E, itemValue: 2 });
    let r = act(s, 'forward', 'forward');
    expect(r.state.player.weapon).toBe(2);
    expect(r.state.player.armor).toBe(2);
    const t = setup(['@)['], { dir: E, itemValue: 1 });
    t.player.weapon = 3;
    t.player.armor = 3;
    r = act(t, 'forward', 'forward');
    expect(r.state.player.weapon).toBe(3);
    expect(r.state.player.armor).toBe(3);
    expect(r.state.items).toEqual([]);
  });

  it('potions and ethers: legal only when they would help and you have one', () => {
    const s = setup(['@.'], { dir: E });
    const p = s.player;
    expect(p.hp).toBe(p.maxHp);
    expect(isLegal(s, { type: 'potion' })).toBe(false);
    p.hp = 3;
    expect(isLegal(s, { type: 'potion' })).toBe(true);
    let r = act(s, 'potion');
    expect(r.state.player.hp).toBe(3 + Math.ceil(p.maxHp / 2));
    expect(r.state.player.potions).toBe(p.potions - 1);
    expect(r.state.turn).toBe(1);
    p.potions = 0;
    expect(isLegal(s, { type: 'potion' })).toBe(false);
    expect(() => applyAction(s, { type: 'potion' })).toThrow();
    // Ether.
    expect(p.mp).toBe(p.maxMp);
    expect(isLegal(s, { type: 'ether' })).toBe(false);
    p.mp = 0;
    p.maxMp = 20;
    r = act(s, 'ether');
    expect(r.state.player.mp).toBe(ETHER_MP);
    expect(r.state.player.ethers).toBe(p.ethers - 1);
    p.ethers = 0;
    expect(isLegal(s, { type: 'ether' })).toBe(false);
  });
});

describe('monsters', () => {
  it('sleep until they see you', () => {
    // Behind a wall: never wakes, never moves.
    const s = setup(['@...', '###.', 'r...'], { dir: E, awake: false });
    let r = act(s, ...Array(20).fill('wait'));
    expect(mon(r.state, 'rat')).toMatchObject({ awake: false, x: cell(0, 2).x, y: cell(0, 2).y });
    // Out of sight range in an open corridor: still asleep.
    const far = setup(['@' + '.'.repeat(SIGHT + 1) + 'r'], { dir: E, awake: false });
    r = act(far, ...Array(5).fill('wait'));
    expect(mon(r.state, 'rat').awake).toBe(false);
    // In sight: wakes and comes.
    const near = setup(['@....r'], { dir: E, awake: false });
    r = act(near, 'wait');
    expect(mon(r.state, 'rat').awake).toBe(true);
    r = act(r.state, 'wait', 'wait');
    expect(mon(r.state, 'rat').x).toBeLessThan(cell(5, 0).x);
  });

  it('hitting a sleeping monster wakes it', () => {
    const s = setup(['@g'], { dir: E, awake: false });
    tough(mon(s, 'ghoul'));
    s.player.mp = 10;
    expect(mon(act(s, cast('fire')).state, 'ghoul').awake).toBe(true);
  });

  it('melee only from orthogonally adjacent cells', () => {
    const s = setup(['@.', '.g'], { dir: E });
    tough(mon(s, 'ghoul'));
    const r = act(s, 'wait');
    expect(r.events.some((e) => e.type === 'hurt')).toBe(false);
    const g = mon(r.state, 'ghoul');
    expect(Math.abs(g.x - s.player.x) + Math.abs(g.y - s.player.y)).toBe(1);
  });

  it('archers and mages shoot only along a clear straight line', () => {
    const shots = (rows: string[], kind: string, turns = 12) => {
      let n = 0;
      let st = setup(rows, { dir: E });
      st.player.hp = st.player.maxHp = 9999;
      for (const m of st.monsters) if (m.kind !== kind) m.stun = 999;
      for (let i = 0; i < turns; i++) {
        const r = act(st, 'wait');
        n += r.events.filter((e) => e.type === 'shot').length;
        st = r.state;
        if (mon(st, kind).x !== mon(setup(rows), kind).x || mon(st, kind).y !== mon(setup(rows), kind).y) break; // it moved: stop counting
      }
      return n;
    };
    for (const kind of ['archer', 'mage'] as const) {
      const c = kind === 'archer' ? 'a' : 'm';
      expect(shots([`@...${c}`], kind), `${kind} in line`).toBeGreaterThan(3);
      expect(shots([`@.O.${c}`, '.....'], kind), `${kind} behind a pillar`).toBe(0);
      expect(shots([`@.+.${c}`], kind, 1), `${kind} behind a door`).toBe(0);
      expect(shots([`@.s.${c}`], kind), `${kind} behind another monster`).toBe(0);
      expect(shots(['@....', '.....', `...${c}.`], kind, 1), `${kind} off the line`).toBe(0);
      const range = MONSTERS[kind].range;
      expect(shots([`@${'.'.repeat(range)}${c}`], kind, 1), `${kind} out of range`).toBe(0);
    }
  });

  it('wraiths drift through walls; others go around', () => {
    const s = setup(['@.#.w', '.....'], { dir: E });
    let r = act(s, 'wait', 'wait');
    const w = mon(r.state, 'wraith');
    expect(w.x).toBe(cell(2, 0).x); // inside the wall
    expect(tile(r.state, w.x, w.y)).toBe('wall');
    const t = setup(['@.#.g', '.....'], { dir: E });
    r = act(t, 'wait', 'wait');
    const g = mon(r.state, 'ghoul');
    expect(tile(r.state, g.x, g.y)).toBe('floor');
    expect(g.y).toBe(cell(0, 1).y);
  });

  it('slow monsters act every other turn', () => {
    for (const kind of ['slime', 'golem'] as const) {
      const c = kind === 'slime' ? 'l' : 'G';
      let st = setup([`@......${c}`], { dir: E });
      const xs: number[] = [];
      for (let i = 0; i < 6; i++) {
        st = act(st, 'wait').state;
        xs.push(mon(st, kind).x);
      }
      const start = cell(7, 0).x;
      expect(xs, kind).toEqual([start - 1, start - 1, start - 2, start - 2, start - 3, start - 3]);
    }
  });

  it('monsters open doors (spending their move) and never stack', () => {
    const s = setup(['@.+.r'], { dir: E });
    let r = act(s, 'wait');
    expect(mon(r.state, 'rat').x).toBe(cell(3, 0).x);
    r = act(r.state, 'wait');
    expect(tile(r.state, cell(2, 0).x, cell(2, 0).y)).toBe('open');
    expect(mon(r.state, 'rat').x).toBe(cell(3, 0).x);
    // A crowd converging on the player never shares a cell or steps onto the player.
    let st = setup(['rrr...', 'r.....', 'r..@..', '....rr', 'r.r.r.'], { dir: E });
    st.player.hp = st.player.maxHp = 9999;
    for (let i = 0; i < 30; i++) {
      st = act(st, 'wait').state;
      const cells = st.monsters.map((m) => `${m.x},${m.y}`);
      expect(new Set(cells).size).toBe(cells.length);
      expect(cells).not.toContain(`${st.player.x},${st.player.y}`);
    }
  });

  it('bats flutter erratically but still stay on walkable ground', () => {
    let st = setup(['......', '..@...', '......', 'b....b'], { dir: E });
    st.player.hp = st.player.maxHp = 9999;
    for (let i = 0; i < 40; i++) {
      st = act(st, 'wait').state;
      for (const m of st.monsters) expect(tile(st, m.x, m.y)).not.toBe('wall');
    }
  });
});

describe('floors and the Warden', () => {
  it('stairs descend to depth + 1 and heal 15%', () => {
    const s = setup(['@>'], { dir: E });
    s.player.hp = 10;
    const r = act(s, 'forward');
    expect(r.state.depth).toBe(2);
    expect(r.state.player.hp).toBe(10 + Math.ceil(s.player.maxHp * 0.15));
    expect(r.events).toContainEqual({ type: 'descend', depth: 2 });
    const f = generateFloor(s.seed, 2);
    expect(pos(r.state)).toEqual(f.start);
    expect(r.state.level.tiles).toEqual(f.level.tiles);
    expect(r.state.monsters.map((m) => m.kind)).toEqual(f.monsters.map((m) => m.kind));
    // The heal never overfills.
    s.player.hp = s.player.maxHp;
    expect(act(s, 'forward').state.player.hp).toBe(s.player.maxHp);
  });

  it('the Warden raises skeletons every 7 turns', () => {
    let st = setup(['.......', '...W...', '.......', '.......', '...@...'], { dir: N });
    st.player.hp = st.player.maxHp = 9999;
    st.depth = 10;
    tough(mon(st, 'warden'));
    let raised = 0;
    for (let i = 0; i < 21; i++) {
      const before = st.monsters.length;
      st = act(st, 'wait').state;
      if (st.monsters.length > before) {
        raised++;
        expect(st.turn % 7).toBe(0);
        const sk = st.monsters[st.monsters.length - 1];
        expect(sk).toMatchObject({ kind: 'skeleton', hp: MONSTERS.skeleton.hp, awake: true });
      }
    }
    expect(raised).toBe(3);
  });

  it('killing the Warden wins', () => {
    const s = setup(['@W'], { dir: E });
    mon(s, 'warden').hp = 1;
    s.player.mp = 10;
    const r = act(s, cast('fire'));
    expect(r.state.status).toBe('won');
    expect(r.events).toContainEqual({ type: 'win' });
    expect(r.state.turn).toBe(s.turn);
    expect(isLegal(r.state, { type: 'wait' })).toBe(false);
    expect(r.state.log.join('\n')).not.toMatch(/the the/i);
  });

  it('monsterAt ignores the dead', () => {
    const s = setup(['@r'], { dir: E });
    const m = mon(s, 'rat');
    expect(monsterAt(s, m.x, m.y)).toBe(m);
    m.hp = 0;
    expect(monsterAt(s, m.x, m.y)).toBeUndefined();
  });
});
