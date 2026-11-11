// Last Light: a small, tap-driven interactive fiction. The lamp of Corran
// lighthouse has gone out in a storm, a ship is running for the rocks, and Ada,
// the old keeper, hasn't come back up the road. Every action spends three
// minutes of the night. Pure and deterministic: (actions) -> state + text.

export const RULES_VERSION = 1;

export type Room = 'cottage' | 'yard' | 'base' | 'lamp' | 'cliff' | 'road' | 'shore' | 'boathouse';
export type Item = 'coat' | 'matches' | 'kettle' | 'tea' | 'logbook' | 'stone' | 'keys' | 'oil' | 'wick';
export type Npc = 'tomas' | 'ada';

export const ROOM_NAMES: Record<Room, string> = {
  cottage: 'Keeper’s cottage',
  yard: 'The yard',
  base: 'Lighthouse, ground floor',
  lamp: 'The lamp room',
  cliff: 'Cliff path',
  road: 'Village road',
  shore: 'The shore',
  boathouse: 'Boathouse',
};

export const ITEM_NAMES: Record<Item, string> = {
  coat: 'oilskin coat',
  matches: 'matches',
  kettle: 'kettle',
  tea: 'kettle of tea',
  logbook: 'Ada’s logbook',
  stone: 'loose cobble',
  keys: 'Ada’s keys',
  oil: 'oil can',
  wick: 'new wick',
};

/** "the oil can", but "Ada’s keys". */
export const the = (i: Item) => (ITEM_NAMES[i].startsWith('Ada') ? ITEM_NAMES[i] : `the ${ITEM_NAMES[i]}`);
const The = (i: Item) => the(i).replace(/^./, (c) => c.toUpperCase());

export const NPC_NAMES: Record<Npc, string> = { tomas: 'Tomas', ada: 'Ada' };

const EXITS: Record<Room, Room[]> = {
  cottage: ['yard'],
  yard: ['cottage', 'base', 'cliff'],
  base: ['yard', 'lamp'],
  lamp: ['base'],
  cliff: ['yard', 'road', 'shore'],
  road: ['cliff'],
  shore: ['cliff', 'boathouse'],
  boathouse: ['shore'],
};
const OUTDOORS = new Set<Room>(['yard', 'cliff', 'road', 'shore']);

/** Minutes per action, the start time, when the tide closes the shore, and midnight. */
export const STEP = 3;
export const START_MIN = 22 * 60;
export const TIDE_T = 25;
export const END_T = 40;

export interface State {
  room: Room;
  /** Actions taken so far (each is three minutes). */
  t: number;
  /** Where every item is. */
  at: Record<Item, Room | 'inv' | 'tomas' | 'ada' | 'box' | 'drawer' | 'nowhere'>;
  wearing: boolean;
  wet: boolean;
  f: {
    drawer: boolean;
    door: boolean;
    window: boolean;
    hatch: boolean;
    box: boolean;
    oil: boolean;
    wick: boolean;
    lit: boolean;
    wound: boolean;
    sawShip: boolean;
    foundAda: boolean;
    read: boolean;
    heavy: boolean;
  };
  tomas: { trust: number; room: Room; follows: boolean; told: string[] };
  ada: { freed: boolean; room: Room; told: string[]; left: boolean };
  over: Ending | null;
}

export interface Ending {
  title: string;
  text: string[];
  stars: number;
}

export function newGame(): State {
  return {
    room: 'cottage',
    t: 0,
    at: {
      coat: 'cottage',
      matches: 'drawer',
      kettle: 'cottage',
      tea: 'nowhere',
      logbook: 'cottage',
      stone: 'yard',
      keys: 'ada',
      oil: 'boathouse',
      wick: 'box',
    },
    wearing: false,
    wet: false,
    f: { drawer: false, door: false, window: false, hatch: false, box: false, oil: false, wick: false, lit: false, wound: false, sawShip: false, foundAda: false, read: false, heavy: false },
    tomas: { trust: 0, room: 'boathouse', follows: false, told: [] },
    ada: { freed: false, room: 'road', told: [], left: false },
    over: null,
  };
}

export const clock = (s: State): string => {
  const m = START_MIN + Math.min(s.t, END_T) * STEP;
  const h = Math.floor(m / 60) % 24;
  return `${h % 12 || 12}:${String(m % 60).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
};

export const has = (s: State, i: Item) => s.at[i] === 'inv';
const here = (s: State, i: Item) => s.at[i] === s.room;
const tomasHere = (s: State) => s.tomas.room === s.room;
const adaHere = (s: State) => s.ada.room === s.room;
const tideIn = (s: State) => s.t >= TIDE_T;
const oilAtHand = (s: State) => has(s, 'oil') || (s.at.oil === 'tomas' && tomasHere(s));

// ---------------------------------------------------------------- descriptions

function shipLine(s: State): string {
  if (s.f.lit && s.f.wound) return 'Out past the Teeth, the ship’s lantern is swinging wide, away from the rocks.';
  const left = END_T - s.t;
  if (left > 26) return 'Far out, a ship’s lantern dips and rises. It is heading in toward the Teeth.';
  if (left > 12) return 'The ship’s lantern is closer now, low and steady, running straight for the Teeth.';
  return 'The ship is close enough to see its sails. Without the light it will be on the rocks by midnight.';
}

export function describe(s: State): string[] {
  const out: string[] = [];
  switch (s.room) {
    case 'cottage':
      out.push(
        `The stove ticks and the window shakes in its frame. Ada’s chair is empty; her tea has gone cold${here(s, 'logbook') ? ' beside an open logbook' : ''}.`,
      );
      if (here(s, 'coat')) out.push('Her old oilskin coat hangs on the hook by the door.');
      if (here(s, 'kettle')) out.push('A kettle sits on the warm stove.');
      if (!s.f.drawer) out.push('There’s a drawer in the dresser, where Ada keeps the useful things.');
      if (s.ada.room === 'cottage') out.push('Ada is in her chair by the stove, her bad leg up on a stool, a blanket around her shoulders.');
      break;
    case 'yard':
      out.push('Rain comes sideways across the yard. Above you the lighthouse stands dark, its great lens dead.');
      if (here(s, 'stone')) out.push('One of the cobbles by the pump has worked loose.');
      out.push(s.f.window ? 'Glass glitters under the broken ground-floor window.' : s.f.door ? 'The lighthouse door stands open.' : 'The lighthouse door is shut and locked.');
      break;
    case 'base':
      out.push('Inside the tower the storm is a roar overhead. Iron stairs wind up into the dark toward the lamp room.');
      if (s.f.window) out.push('Wind whistles through the broken window and up the stairwell.');
      break;
    case 'lamp':
      out.push(s.f.lit ? 'The lamp burns bright and gold inside its lens.' : 'The great lamp sits cold inside its lens, smelling of old oil.');
      if (!s.f.wick) out.push(s.f.box ? 'The brass box by the lamp is open.' : 'Beside the lamp is the locked brass box where Ada keeps spare wicks.');
      else out.push('A fresh wick is set in the burner.');
      if (!s.f.oil) out.push('The reservoir is empty.');
      if (s.f.lit && !s.f.wound) out.push('The lens is still. The clockwork that turns it needs winding.');
      if (s.f.wound) out.push('The clockwork ticks and the beam sweeps out over the water.');
      if (s.f.window && !s.f.hatch) out.push('A cold draught comes up through the open trapdoor from the stairwell.');
      out.push(shipLine(s));
      break;
    case 'cliff':
      out.push('The path runs along the cliff edge. The wind is strong enough to lean on.');
      out.push(shipLine(s));
      out.push(
        tideIn(s)
          ? 'Below, the tide has covered the steps down to the shore.'
          : s.t >= TIDE_T - 8
            ? 'The sea is nearly at the top of the steps down to the shore. Whoever goes down now may not come back up.'
            : 'Steps cut in the rock lead down to the shore. The tide is rising.',
      );
      if (!s.f.foundAda) out.push('Up the village road, you think you hear someone calling.');
      break;
    case 'road':
      out.push('The road to the village dips between gorse banks. A pine has come down across it.');
      if (!s.ada.freed) out.push('Under its branches, pinned by one leg, is Ada.');
      else out.push('The branch lies where you and Tomas heaved it aside.');
      break;
    case 'shore':
      out.push('Black water climbs the shingle with every wave. The boathouse huddles against the cliff.');
      if (tideIn(s)) out.push('The steps up the cliff are under the sea. You’re cut off here until the tide turns, long after midnight.');
      else if (s.t >= TIDE_T - 8) out.push('The tide is nearly at the foot of the steps. Go back up soon, or not at all.');
      break;
    case 'boathouse':
      out.push('It smells of tar and fish. Rain drums on the tin roof.');
      if (tideIn(s)) out.push('Water slops under the door. The steps are gone; nobody is leaving before morning.');
      else if (s.t >= TIDE_T - 8) out.push('Water is creeping under the door. The tide is nearly at the steps.');
      if (here(s, 'oil')) out.push('A full can of lamp oil stands by the door.');
      break;
  }
  if (tomasHere(s)) {
    if (s.tomas.follows) out.push('Tomas is beside you, collar up.');
    else if (s.room === 'boathouse')
      out.push(
        s.tomas.trust >= 1
          ? 'Tomas is pacing the boathouse, blowing on his hands, glancing at the door and away again.'
          : 'Tomas the fisherman sits on an upturned boat, holding his lantern close, not looking at the door. He’s shivering.',
      );
    else if (s.room === 'cottage') out.push('Tomas is steaming gently by the stove.');
    else out.push('Tomas is here.');
  }
  // Things not already in the room's own description.
  const home: Partial<Record<Item, Room>> = { coat: 'cottage', kettle: 'cottage', logbook: 'cottage', stone: 'yard', oil: 'boathouse' };
  for (const i of ['matches', 'kettle', 'tea', 'logbook', 'stone', 'keys', 'oil', 'wick', 'coat'] as Item[])
    if (here(s, i) && home[i] !== s.room) out.push(`${The(i)} ${i === 'matches' || i === 'keys' ? 'are' : 'is'} here.`);
  return out;
}

// ---------------------------------------------------------------- choices

export interface Choice {
  /** The action, as a token for replays. */
  id: string;
  label: string;
  /** What it's about (exits are 'go'; things and people by name). */
  about: string;
}

export function choices(s: State): Choice[] {
  if (s.over) return [];
  const out: Choice[] = [];
  const add = (id: string, label: string, about: string) => out.push({ id, label, about });
  // Exits (the steps are gone once the tide is in).
  for (const r of EXITS[s.room]) {
    if (r === 'base' && s.room === 'yard' && !s.f.door && !s.f.window) continue;
    if (tideIn(s) && ((s.room === 'cliff' && r === 'shore') || (s.room === 'shore' && r === 'cliff'))) continue;
    add(`go:${r}`, ROOM_NAMES[r], 'go');
  }
  // Things here.
  const takeable: Item[] = ['coat', 'matches', 'kettle', 'tea', 'logbook', 'stone', 'keys', 'oil', 'wick'];
  for (const i of takeable) if (here(s, i)) add(`take:${i}`, `Take ${the(i)}`, i);
  if (s.room === 'cottage') {
    if (!s.f.drawer) add('open:drawer', 'Open the drawer', 'drawer');
    if (here(s, 'kettle')) add('brew', 'Make a pot of tea', 'kettle');
    if (here(s, 'logbook') || has(s, 'logbook')) add('read:logbook', 'Read the logbook', 'logbook');
  }
  if (s.room === 'yard' && !s.f.door && !s.f.window) add('look:door', 'Try the door', 'door');
  if (tideIn(s) && (s.room === 'shore' || s.room === 'boathouse')) add('watch', 'Wait out the night', 'tide');
  if (s.room === 'lamp') {
    if (!s.f.box) add('look:box', 'Try the brass box', 'brass box');
    if (s.f.window && !s.f.hatch) add('shut:hatch', 'Shut the trapdoor', 'trapdoor');
    if (s.f.lit && !s.f.wound) add('wind', 'Wind the clockwork', 'lamp');
    if (!s.f.lit) add('look:lamp', 'Look at the lamp', 'lamp');
    if (s.f.lit && s.f.wound) add('watch', 'Keep watch until midnight', 'lamp');
    if (!s.f.oil && oilAtHand(s) && !has(s, 'oil')) add('pour', 'Have Tomas fill the lamp', 'tomas');
  }
  // Things carried.
  for (const i of takeable) {
    if (!has(s, i)) continue;
    if (i === 'coat') add(s.wearing ? 'unwear' : 'wear', s.wearing ? 'Take off the coat' : 'Put on the coat', i);
    for (const [target, label] of useTargets(s, i)) add(`use:${i}:${target}`, label, i);
    for (const n of ['tomas', 'ada'] as Npc[])
      if ((n === 'tomas' ? tomasHere(s) : adaHere(s)) && (i === 'tea' || (i === 'oil' && n === 'tomas')))
        add(`give:${i}:${n}`, `Give ${the(i)} to ${NPC_NAMES[n]}`, i);
    if (i !== 'coat' || !s.wearing) add(`drop:${i}`, `Put down ${the(i)}`, i);
  }
  // People.
  if (tomasHere(s)) for (const [id, label] of tomasTopics(s)) add(`say:tomas:${id}`, label, 'tomas');
  if (adaHere(s)) for (const [id, label] of adaTopics(s)) add(`say:ada:${id}`, label, 'ada');
  if (s.room === 'road' && !s.ada.freed && tomasHere(s) && s.tomas.follows) add('lift', 'Lift the branch with Tomas', 'ada');
  if (s.room === 'road' && !s.ada.freed) add('look:branch', 'Try to lift the branch', 'ada');
  return out;
}

function useTargets(s: State, i: Item): [string, string][] {
  const t: [string, string][] = [];
  if (i === 'matches' && s.room === 'lamp' && !s.f.lit) t.push(['lamp', 'Light the lamp']);
  if (i === 'matches' && s.room === 'cottage' && s.wet) t.push(['stove', 'Dry the matches by the stove']);
  if (i === 'kettle' && s.room === 'cottage') t.push(['stove', 'Make tea on the stove']);
  if (i === 'stone' && s.room === 'yard' && !s.f.door && !s.f.window) t.push(['window', 'Smash the lighthouse window']);
  if (i === 'stone' && s.room === 'lamp' && !s.f.box) t.push(['box', 'Hammer the brass box open']);
  if (i === 'keys' && s.room === 'yard' && !s.f.door) t.push(['door', 'Unlock the lighthouse door']);
  if (i === 'keys' && s.room === 'lamp' && !s.f.box) t.push(['box', 'Unlock the brass box']);
  if (i === 'oil' && s.room === 'lamp' && !s.f.oil) t.push(['lamp', 'Fill the lamp']);
  if (i === 'wick' && s.room === 'lamp' && !s.f.wick) t.push(['lamp', 'Fit the wick']);
  if (i === 'tea' && (tomasHere(s) || adaHere(s))) {
    /* handled as give */
  }
  return t;
}

function tomasTopics(s: State): [string, string][] {
  const t: [string, string][] = [];
  const told = (k: string) => s.tomas.told.includes(k);
  if (!told('why')) t.push(['why', 'Ask why he’s down here']);
  if (!told('ship')) t.push(['ship', 'Tell him about the ship']);
  if (s.f.foundAda && !told('ada')) t.push(['ada', 'Tell him Ada is trapped']);
  if (!s.tomas.follows) t.push(['help', 'Ask him to come with you']);
  else t.push(['stay', 'Ask him to wait here']);
  return t;
}

function adaTopics(s: State): [string, string][] {
  const t: [string, string][] = [];
  const told = (k: string) => s.ada.told.includes(k);
  if (!told('hurt')) t.push(['hurt', s.ada.freed ? 'Ask how her leg is' : 'Ask if she’s hurt']);
  if (s.at.keys === 'ada' && !told('keys')) t.push(['keys', 'Tell her the lamp is out']);
  if (!told('ship') && !s.f.lit) t.push(['ship', 'Tell her about the ship']);
  return t;
}

// ---------------------------------------------------------------- acting

/** Applies an action; returns the text that follows. Illegal actions return null. */
export function act(s: State, id: string): string[] | null {
  if (s.over) return null;
  if (!choices(s).some((c) => c.id === id)) return null;
  const [verb, a, b] = id.split(':');
  const out: string[] = [];
  let cost = 1;
  switch (verb) {
    case 'go': {
      const to = a as Room;
      if ((to === 'shore' && s.room === 'cliff') || (to === 'cliff' && s.room === 'shore')) {
        if (tideIn(s)) {
          out.push('The steps are under churning water. There’s no way through until the tide turns, long after midnight.');
          return finish(s, out, 0);
        }
      }
      if (has(s, 'oil')) {
        cost = 2;
        if (!s.f.heavy) out.push('The oil can drags at your arm. Every step takes twice as long.');
        s.f.heavy = true;
      }
      if (OUTDOORS.has(to) && !s.wearing && has(s, 'matches') && !s.wet) {
        s.wet = true;
        out.push('The rain soaks straight through your jumper. You feel the matchbox go soft in your pocket.');
      }
      if (s.room === 'road' && !s.ada.freed && to !== 'road') {
        s.ada.left = true;
      }
      s.room = to;
      if (s.tomas.follows) s.tomas.room = to;
      if (to === 'road' && !s.f.foundAda) {
        s.f.foundAda = true;
        out.push('“Here! Over here!” Ada’s voice, thin against the wind.');
      }
      if (to === 'cliff' || to === 'lamp') s.f.sawShip = true;
      out.push(...describe(s));
      break;
    }
    case 'take': {
      const i = a as Item;
      if (i === 'oil' && s.tomas.follows && tomasHere(s)) {
        s.at.oil = 'tomas';
        out.push('Tomas grunts and swings the oil can up onto his shoulder. “I’ve got it. Lead on.”');
        break;
      }
      s.at[i] = 'inv';
      out.push(
        {
          coat: 'You lift the oilskin off its hook. It smells of Ada’s pipe.',
          matches: 'You pocket the matches.',
          kettle: 'You take the kettle, still warm.',
          tea: 'You take the tea.',
          logbook: 'You tuck the logbook under your arm.',
          stone: 'You work the cobble free. It’s heavy and cold in your hand.',
          keys: 'You take the keys.',
          oil: 'You heave up the oil can. It’s full, and heavy.',
          wick: 'You take the new wick from the box.',
        }[i],
      );
      break;
    }
    case 'drop': {
      const i = a as Item;
      s.at[i] = s.room;
      if (i === 'coat') s.wearing = false;
      out.push(`You put down ${the(i)}.`);
      cost = 0;
      break;
    }
    case 'wear':
      s.wearing = true;
      out.push('You shrug into the oilskin and button it to the chin. Let it rain.');
      break;
    case 'unwear':
      s.wearing = false;
      out.push('You take off the coat.');
      break;
    case 'open':
      s.f.drawer = true;
      s.at.matches = 'cottage';
      out.push('String, candle ends, a broken pipe — and a box of matches, dry as a bone.');
      break;
    case 'read':
      s.f.read = true;
      cost = 0;
      out.push(
        'Ada’s last entry, in her square hand: “Wick burned through at dusk. Spare wicks in the brass box — key’s on my ring. Oil low. Full can down in the boathouse; Tomas can help carry it. Gone down the village road for the doctor’s girl. Back by ten.”',
        'It is past ten.',
      );
      break;
    case 'look':
      cost = 0;
      out.push(
        {
          door: 'Locked. Ada keeps the key on her ring, and Ada isn’t here. The window beside it is old, small-paned glass.',
          box: 'Locked tight. A small brass keyhole — or a hard enough knock.',
          lamp: `The burner needs ${[!s.f.oil && 'oil', !s.f.wick && 'a new wick'].filter(Boolean).join(' and ') || 'only a flame'}. Then the clockwork wound to turn the lens.`,
          branch: s.tomas.follows && tomasHere(s) ? 'Together you might manage it.' : 'You heave until your vision swims. It doesn’t move. One person can’t shift it.',
        }[a] ?? '',
      );
      break;
    case 'shut':
      s.f.hatch = true;
      out.push('You drop the trapdoor over the stairwell. The draught dies.');
      break;
    case 'use':
      cost = useItem(s, a as Item, b, out);
      break;
    case 'give':
      give(s, a as Item, b as Npc, out);
      break;
    case 'say':
      talk(s, a as Npc, b, out);
      break;
    case 'lift':
      s.ada.freed = true;
      s.ada.room = 'cottage';
      out.push(
        'You and Tomas get your shoulders under the branch. On three. It lifts — an inch, two — and Ada drags her leg free with a cry.',
        'Tomas makes her an arm to lean on. “I’ll get her to the cottage,” he says. “You see to that light.”',
      );
      s.tomas.follows = false;
      s.tomas.room = 'cottage';
      if (s.at.oil === 'tomas') {
        s.at.oil = 'road';
        out.push('He sets the oil can down in the road.');
      }
      if (s.at.keys === 'ada') {
        s.at.keys = 'inv';
        out.push('Ada presses her ring of keys into your hand. “The brass one’s for the box.”');
      }
      break;
    case 'pour':
      s.f.oil = true;
      s.at.oil = 'nowhere';
      out.push('Tomas sets the can on his knee and fills the reservoir to the brim, not spilling a drop. “There.”');
      break;
    case 'brew':
      s.at.kettle = 'nowhere';
      s.at.tea = 'inv';
      out.push('The kettle sings. You make a strong, sweet pot of tea and wrap the kettle in a cloth to carry.');
      break;
    case 'wind':
      s.f.wound = true;
      out.push('You crank until your arms burn. The weights rise, the clockwork catches, and the great lens begins to turn. The beam swings out across the black water.');
      break;
    case 'watch':
      s.t = END_T;
      out.push(a === undefined && s.f.wound ? 'You keep watch as the beam sweeps round and round.' : 'You sit out the long hours while the sea rises and falls.');
      return finish(s, out, 0);
  }
  return finish(s, out, cost);
}

function useItem(s: State, i: Item, target: string, out: string[]): number {
  if (i === 'matches' && target === 'stove') {
    s.wet = false;
    out.push('You spread the matches on the warm stovetop and wait. Slowly they dry out.');
    return 2;
  }
  if (i === 'matches' && target === 'lamp') {
    if (s.wet) {
      out.push('The match heads crumble, wet through. Not one will strike.');
      return 1;
    }
    if (!s.f.oil || !s.f.wick) {
      out.push(`The match flares and dies. The lamp needs ${!s.f.oil ? 'oil' : 'a wick'} first.`);
      return 1;
    }
    if (s.f.window && !s.f.hatch) {
      out.push('The flame catches — and the draught from the stairwell snuffs it flat. The broken window below is pulling the wind up the tower.');
      return 1;
    }
    s.f.lit = true;
    out.push('The wick catches. Gold light blooms inside the lens, throwing your shadow huge against the glass.');
    return 1;
  }
  if (i === 'kettle' && target === 'stove') {
    s.at.kettle = 'nowhere';
    s.at.tea = 'inv';
    out.push('The kettle sings. You make a strong, sweet pot of tea and wrap the kettle in a cloth to carry.');
    return 1;
  }
  if (i === 'stone' && target === 'window') {
    s.f.window = true;
    out.push('The glass bursts inward. You knock out the shards; the way in is open, and the wind goes in ahead of you.');
    return 1;
  }
  if (i === 'stone' && target === 'box') {
    s.f.box = true;
    s.at.wick = 'lamp';
    out.push('Three hard blows and the hinge gives. Inside, coiled and clean, is a new wick.');
    return 2;
  }
  if (i === 'keys' && target === 'door') {
    s.f.door = true;
    out.push('The big iron key turns stiffly. The door swings in on the dark.');
    return 1;
  }
  if (i === 'keys' && target === 'box') {
    s.f.box = true;
    s.at.wick = 'lamp';
    out.push('The little brass key fits. Inside, coiled and clean, is a new wick.');
    return 1;
  }
  if (i === 'oil' && target === 'lamp') {
    s.f.oil = true;
    s.at.oil = 'nowhere';
    out.push('You tip the can into the reservoir until it brims. The smell of paraffin fills the room.');
    return 1;
  }
  if (i === 'wick' && target === 'lamp') {
    s.f.wick = true;
    s.at.wick = 'nowhere';
    out.push('You thread the new wick into the burner and trim it straight.');
    return 1;
  }
  return 0;
}

function give(s: State, i: Item, n: Npc, out: string[]) {
  if (n === 'tomas') {
    if (i === 'tea') {
      s.at.tea = 'nowhere';
      s.tomas.trust += 2;
      s.tomas.told.push('tea');
      out.push('Tomas wraps both hands round the kettle and drinks. Some colour comes back into his face. “You’re Ada’s lad. She’d have done the same.”');
    } else {
      s.at.oil = 'tomas';
      out.push(s.tomas.follows ? 'Tomas takes the oil can onto his shoulder.' : 'Tomas takes the oil can and sets it by his feet. He isn’t going anywhere.');
    }
  } else {
    if (i === 'tea') {
      s.at.tea = 'nowhere';
      s.ada.told.push('tea');
      out.push('Ada drinks, shaking. “Good lad. Good lad.” Her hands are steadier when she gives the kettle back.');
    }
  }
}

function talk(s: State, n: Npc, topic: string, out: string[]) {
  if (n === 'tomas') {
    const T = s.tomas;
    T.told.push(topic);
    switch (topic) {
      case 'why':
        out.push('“Sea took my boat off the slip at six,” he says. “Watched it go. Didn’t fancy the walk home in this.” He doesn’t meet your eye.');
        break;
      case 'ship':
        T.trust += 1;
        out.push(
          s.f.sawShip
            ? '“A ship?” He’s on his feet. “Running for the Teeth? My brother’s on the Merrow, out of Penhallow…” He looks at the dark lighthouse window, then at you.'
            : '“A ship?” He frowns. “Out there tonight? Then God help them, with no light.”',
        );
        break;
      case 'ada':
        T.trust += 1;
        out.push('“Under a tree? Ada?” He sets down his lantern. “She pulled me out of the harbour when I was nine.”');
        break;
      case 'help':
        if (T.trust >= 2) {
          T.follows = true;
          out.push('He stands, buttons his coat, and picks up his lantern. “Right. Where to?”');
        } else
          out.push(
            T.trust >= 1
              ? '“I want to. I do.” He holds up his hands; they’re shaking. “But I’m frozen to the bone. I’d be no use to you like this.”'
              : 'He shakes his head. “Not out in that. Not for nothing.” He’s frightened, and cold through.',
          );
        break;
      case 'stay':
        T.follows = false;
        out.push('“I’ll be here,” he says.');
        T.told = T.told.filter((x) => x !== 'help' && x !== 'stay');
        break;
    }
    // Asking again is allowed once he might say yes.
    if (topic === 'help' && !T.follows) T.told = T.told.filter((x) => x !== 'help');
    return;
  }
  const A = s.ada;
  A.told.push(topic);
  switch (topic) {
    case 'hurt':
      out.push(
        A.freed
          ? '“It’ll mend,” she says. “I’ve had worse off the rocks.”'
          : '“Leg’s pinned. Not broken, I think.” She grips your wrist. “I can’t shift it on my own and neither can you. You’d want two strong backs.”',
      );
      break;
    case 'keys':
      s.at.keys = 'inv';
      out.push('She fumbles at her belt and pushes the ring of keys into your hand. “Big one’s the door, brass one’s the wick box. Light first. Then come back for me, if there’s time.”');
      break;
    case 'ship':
      out.push('Ada closes her eyes. “Then go. Don’t stand here talking to me.”');
      break;
  }
}

function finish(s: State, out: string[], cost: number): string[] {
  s.t += cost;
  const at = s.room === 'shore' || s.room === 'boathouse';
  if (s.t >= TIDE_T - 8 && s.t - cost < TIDE_T - 8 && (at || s.room === 'cliff'))
    out.push('The sea is climbing the steps to the shore. Soon there will be no way up or down.');
  if (s.t >= TIDE_T && s.t - cost < TIDE_T) {
    out.push(at ? 'Behind you the sea closes over the steps. You’re cut off until morning.' : 'Somewhere below, the sea closes over the steps to the shore.');
  }
  if (s.t >= END_T) s.over = ending(s);
  return out;
}

// ---------------------------------------------------------------- endings

export function ending(s: State): Ending {
  const light = s.f.lit && s.f.wound;
  const text: string[] = [];
  let stars = 0;
  if (light) {
    stars++;
    text.push('Midnight. The beam sweeps round, and round. Out beyond the Teeth, the ship’s lantern swings, hesitates, and turns for open water.');
  } else if (s.f.lit) {
    text.push('Midnight. The lamp burns, but the lens stands still. From the sea it looks like nothing more than a cottage window. You hear the ship strike the Teeth.');
  } else {
    text.push('Midnight. The tower is dark. Over the wind you hear timber break on the Teeth.');
  }
  if (tideIn(s) && (s.room === 'shore' || s.room === 'boathouse'))
    text.push(s.tomas.room === s.room ? 'You and Tomas wait out the tide in the boathouse, saying nothing, listening.' : 'You wait out the tide alone in the boathouse.');
  if (s.ada.freed) {
    stars++;
    text.push(
      s.ada.left
        ? 'Ada is warm by the stove. “You left me under that tree,” she says. “Then you came back. That’s the job, sometimes.”'
        : 'Ada is warm by the stove, her leg strapped. “You came for me first,” she says, and doesn’t say whether that was right.',
    );
  } else {
    text.push(
      s.f.foundAda
        ? 'They find Ada at dawn under the pine, half frozen and furious, and carry her home on a door.'
        : 'At dawn a cart from the village finds Ada under a fallen pine on the road, half frozen. Nobody had come.',
    );
  }
  if (s.tomas.trust >= 2) {
    stars++;
    text.push(
      s.ada.freed
        ? 'Tomas sits up with Ada by the stove until the storm blows out, feeding the fire, telling her lies about fish.'
        : s.tomas.follows
          ? 'Tomas stays at your side until the storm blows out.'
          : 'Tomas comes up from the boathouse at low tide and shakes your hand without a word.',
    );
  }
  if (light && s.tomas.told.includes('ship') && s.f.sawShip)
    text.push('At first light a boat puts in at the harbour, and Tomas runs down the slip shouting his brother’s name.');
  const title = light ? (stars === 3 ? 'The Last Light' : 'The Light Turns') : 'The Dark Tower';
  return { title, text, stars };
}

// ---------------------------------------------------------------- replay

/** Replays a list of action ids from a new game (illegal ones stop the replay). */
export function replay(ids: string[]): State {
  const s = newGame();
  for (const id of ids) if (!act(s, id)) break;
  return s;
}
