// Last Light, Night 2: fog. A month after the storm, fog lies on Corran, the
// Merrow is feeling her way in with Ada and the doctor aboard, the fog signal
// is "condemned", and the doctor's girl is missing. Bassett, the relief keeper,
// has the key and the rules. Every action spends three minutes; the fog
// thickens until the moor can't be crossed without something to steer by.
// Pure and deterministic: (actions) -> state + text.

import type { Choice, Ending } from './types';

/** v2: Bramble stays with Nell once found (no "let her off the lead"), waiting only indoors. */
export const RULES_VERSION = 2;

export type Room = 'cottage' | 'yard' | 'tower' | 'signal' | 'store' | 'moor' | 'house' | 'point';
export type Item = 'logbook' | 'matches' | 'flask' | 'blowlamp' | 'crowbar' | 'keys' | 'lantern' | 'quilt' | 'note';
export type Npc = 'bassett' | 'nell';

export const ROOM_NAMES: Record<Room, string> = {
  cottage: 'Keeper’s cottage',
  yard: 'The yard',
  tower: 'The watch room',
  signal: 'Fog-signal house',
  store: 'Oil store',
  moor: 'Carn Moor',
  house: 'The doctor’s house',
  point: 'The Point',
};

export const ITEM_NAMES: Record<Item, string> = {
  logbook: 'Ada’s logbook',
  matches: 'matches',
  flask: 'flask of cocoa',
  blowlamp: 'blowlamp',
  crowbar: 'crowbar',
  keys: 'Bassett’s keys',
  lantern: 'Nell’s lantern',
  quilt: 'Nell’s quilt',
  note: 'Nell’s note',
};
const ITEMS = Object.keys(ITEM_NAMES) as Item[];

/** "the crowbar", but "Nell’s quilt". */
export const the = (i: Item) => (ITEM_NAMES[i].includes('’s') ? ITEM_NAMES[i] : `the ${ITEM_NAMES[i]}`);
const The = (i: Item) => the(i).replace(/^./, (c) => c.toUpperCase());

export const NPC_NAMES: Record<Npc, string> = { bassett: 'Bassett', nell: 'Nell' };

const EXITS: Record<Room, Room[]> = {
  cottage: ['yard'],
  yard: ['cottage', 'tower', 'signal', 'store', 'moor'],
  tower: ['yard'],
  signal: ['yard'],
  store: ['yard'],
  moor: ['yard', 'house', 'point'],
  house: ['moor'],
  point: ['moor'],
};
export const INDOORS = new Set<Room>(['cottage', 'tower', 'signal', 'store', 'house']);

/** Minutes per action, the start (11 pm), when the fog shuts the moor, how long the bulb heats, and one o'clock. */
export const STEP = 3;
export const START_MIN = 23 * 60;
export const FOG_T = 20;
export const HEAT = 5;
export const END_T = 40;

export interface State {
  room: Room;
  t: number;
  /** Rooms visited (later visits get the short description). */
  seen: Room[];
  at: Record<Item, Room | 'inv' | 'bassett' | 'nowhere'>;
  f: {
    /** The blowlamp is filled. */
    fuel: boolean;
    /** The signal house was unlocked, or forced. */
    door: boolean;
    forced: boolean;
    /** When the blowlamp went under the bulb (-1: not yet). */
    heatAt: number;
    running: boolean;
    horn: boolean;
    beacon: boolean;
    brewed: boolean;
  };
  /** follows: on her lead with you. withNell: back with Nell, and won't leave her. */
  bramble: { room: Room; follows: boolean; led: boolean; withNell: boolean };
  bassett: { trust: number; room: Room; follows: boolean; agreed: boolean; told: string[] };
  nell: { trust: number; room: Room; follows: boolean; found: boolean; ready: boolean; promised: boolean; home: boolean; told: string[] };
  over: Ending | null;
}

export function newGame(): State {
  return {
    room: 'cottage',
    t: 0,
    seen: ['cottage'],
    at: { logbook: 'cottage', matches: 'cottage', flask: 'nowhere', blowlamp: 'store', crowbar: 'store', keys: 'bassett', lantern: 'moor', quilt: 'house', note: 'house' },
    f: { fuel: false, door: false, forced: false, heatAt: -1, running: false, horn: false, beacon: false, brewed: false },
    bramble: { room: 'cottage', follows: false, led: false, withNell: false },
    bassett: { trust: 0, room: 'tower', follows: false, agreed: false, told: [] },
    nell: { trust: 0, room: 'point', follows: false, found: false, ready: false, promised: false, home: false, told: [] },
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
const bassettHere = (s: State) => s.bassett.room === s.room;
const nellHere = (s: State) => s.nell.room === s.room && s.nell.found;
const brambleHere = (s: State) => s.bramble.room === s.room;
/** Nell is with you, or indoors somewhere. */
export const nellSafe = (s: State) => s.nell.found && (s.nell.follows || INDOORS.has(s.nell.room));
export const blind = (s: State) => s.t >= FOG_T;
/** Bramble is walking with you: on her lead, or beside Nell while Nell holds your hand. */
const brambleWithYou = (s: State) => brambleHere(s) && (s.bramble.follows || (s.bramble.withNell && s.nell.follows));
/** Something to steer by on the moor: the horn, or a dog that knows the way. */
const guided = (s: State) => s.f.horn || brambleWithYou(s);
export const hot = (s: State) => s.f.heatAt >= 0 && s.t - s.f.heatAt >= HEAT;

// ---------------------------------------------------------------- descriptions

function shipLine(s: State): string {
  if (s.f.horn) return 'Out in the grey, the Merrow’s bell answers the horn. She is feeling her way in toward the harbour.';
  const left = END_T - s.t;
  if (left > 26) return 'Far out to sea, very faint, a ship’s bell: the Merrow, feeling her way in blind.';
  if (left > 12) return 'The Merrow’s bell is nearer now, somewhere off the Point. She can’t see the channel. She needs something to listen for.';
  return 'The bell is close, off the Teeth. Without the horn she will never find the channel.';
}

function fogLine(s: State): string {
  if (s.t < FOG_T - 6) return 'The fog is thick, but you can still make out the path a few yards ahead.';
  if (s.t < FOG_T) return 'The fog is thickening fast. Soon you won’t see the path at all.';
  return s.f.horn ? 'You can’t see your own hand. But the horn gives you a direction.' : 'The fog is total. You can’t see your own hand in front of your face.';
}

/** Where Nell is, as a phrase for people lines and endings. */
const NELL_AT: Record<Room, string> = {
  cottage: 'asleep in Ada’s chair by the stove',
  house: 'in her own bed, boots and all',
  tower: 'asleep on the watch-room floor by the lamp',
  signal: 'asleep on the bench by the thudding engine, her fingers in her ears',
  store: 'asleep on a coil of rope in the oil store',
  yard: 'out in the yard',
  moor: 'out on the moor',
  point: 'up at the cairn',
};

/** The room as you find it. Brief: a later visit (short text). Skip: people whose line the caller tells instead. */
function describeRoom(s: State, brief: boolean, skip: string[]): string[] {
  const out: string[] = [];
  switch (s.room) {
    case 'cottage':
      if (brief) {
        out.push('Ada’s cottage. The stove ticks.');
        if (here(s, 'logbook')) out.push('Ada’s logbook lies on the table.');
      } else out.push(`Ada’s cottage, without Ada. The stove is banked and ticking${here(s, 'logbook') ? ', and her logbook lies open on the table where she left it for her relief' : ''}.`);
      if (here(s, 'matches')) out.push('A box of matches sits on the mantelpiece.');
      if (!s.f.brewed && !brief) out.push('There’s milk in the jug and cocoa in the tin.');
      break;
    case 'yard': {
      const door = s.f.forced ? 'The hasp hangs off its door where you levered it.' : s.f.door ? 'Its door stands open.' : 'The door is padlocked.';
      if (brief) out.push('The yard, deep in fog. Overhead the beam swings round.', fogLine(s), `The fog-signal house squats at the cliff edge. ${door}`);
      else
        out.push(
          'The fog came in off the sea at dusk and sat down on Corran. Overhead the lighthouse beam swings round, lighting nothing but grey.',
          fogLine(s),
          `At the cliff edge squats the fog-signal house, its great horn pointing out to sea. ${door}`,
        );
      if (s.f.horn) out.push('Every half minute the horn lets go: a long, low groan you feel in your teeth.');
      if (!brief) out.push('The oil store leans against the signal house. A gate in the wall opens onto the moor.');
      break;
    }
    case 'tower':
      out.push(
        brief
          ? 'The watch room, warm and bright, the lamp turning against the fog.'
          : 'The watch room is warm and bright. The great lamp turns behind its glass, throwing its beam into a wall of fog that throws it straight back.',
      );
      if (!bassettHere(s)) out.push('Bassett’s chair is empty. The lamp turns on without him.');
      out.push(shipLine(s));
      break;
    case 'signal':
      out.push(
        brief
          ? 'The fog-signal house: the engine, its flywheel, the patched air receiver.'
          : 'The engine fills the little house: squat and black, with a flywheel as tall as you and a bulb on its head like an iron onion. Pipes run to the air receiver, a great tank with a bolted patch, and on out to the horn.',
      );
      if (!s.f.running) {
        if (!brief) out.push('A brown tag hangs from the flywheel: CONDEMNED PENDING INSPECTION.');
        if (s.f.heatAt < 0) out.push('The bulb is cold. It wants heating before the engine will fire.');
        else if (hot(s)) out.push('The blowlamp roars. The bulb glows cherry red: hot enough to fire.');
        else if (s.t - s.f.heatAt < 2) out.push('The blowlamp roars under the bulb. It has a long way to go.');
        else out.push('The blowlamp roars. The bulb is turning a dull red.');
      } else if (!s.f.horn) out.push('The engine thuds, steady as a heart. The air valve is shut; the gauge on the receiver reads nothing yet. Its red line is at sixty pounds.');
      else out.push('The engine thuds. The needle sits just under the red line, and every half minute the horn lets go and the floor shakes.');
      break;
    case 'store':
      out.push(brief ? 'The oil store, stinking of paraffin.' : 'A lean-to that stinks of paraffin: a drum on a cradle, a bench, tools on nails.');
      if (here(s, 'blowlamp')) out.push(s.f.fuel ? 'A brass blowlamp hangs on a nail, full.' : 'A brass blowlamp hangs on a nail. It feels empty.');
      if (here(s, 'crowbar')) out.push('A crowbar leans in the corner.');
      break;
    case 'moor':
      out.push(
        brief ? 'Carn Moor. The wall runs beside the path.' : 'Carn Moor: heather and grey wool in every direction. A dry-stone wall runs beside the path, the one thing you can be sure of.',
        fogLine(s),
      );
      if (here(s, 'lantern')) out.push('A small tin lantern lies in the heather, out, its glass cracked. Small boot prints go on up the path toward the Point.');
      if (s.bramble.follows && brambleHere(s) && !s.nell.found) out.push('Bramble strains at her lead, nose down, toward the Point.');
      if (blind(s) && !guided(s)) out.push('Without something to steer by, you would only walk in circles out here. The wall will take you back to the yard.');
      break;
    case 'house':
      out.push(brief ? 'The doctor’s house, dark but for the snoring from the back room.' : 'The doctor’s house is dark, the door on the latch. From the back room comes the sound of Nell’s gran snoring.');
      if (here(s, 'quilt') && s.nell.room !== 'house') out.push('Upstairs, Nell’s bed is empty, its patchwork quilt thrown back.');
      if (here(s, 'note')) out.push('On the kitchen table is a note in a child’s capitals, weighed down with the sugar bowl.');
      break;
    case 'point':
      out.push(
        brief ? 'The Point. The beacon cairn looms out of the fog.' : 'The Point is a hump of turf with the sea all round it, unseen, sucking at the rocks below. On top stands the old beacon cairn, heaped with gorse.',
        shipLine(s),
      );
      break;
  }
  if (bassettHere(s) && !skip.includes('bassett')) {
    const B = s.bassett;
    if (B.follows) {
      if (!brief) out.push('Bassett is with you, coat buttoned to the chin.');
    } else if (s.room === 'tower')
      out.push(
        s.f.forced && B.trust < 2
          ? s.f.horn
            ? 'Bassett stands at the window with his arms folded, listening to the horn. He doesn’t look at you.'
            : 'Bassett is at the window, glaring down at the signal house.'
          : s.f.horn
            ? 'Bassett stands at the window, listening to the horn. He gives you a short nod.'
            : B.trust >= 2
              ? 'Bassett is on his feet by the lamp, his coat already on.'
              : B.trust >= 1
                ? 'Bassett, the relief keeper, keeps looking from the fog to his logbook and back.'
                : brief
                  ? 'Bassett sits by the lamp, his pencil sharpened.'
                  : 'Mr Bassett, the relief keeper, sits by the lamp with his logbook squared on the desk and his pencil sharpened. He came from Falmouth a fortnight ago and has not got used to Corran.',
      );
    else if (s.room === 'signal' && !s.f.running) out.push('Bassett sits on an upturned bucket by the engine, minding the bulb.');
    else if (s.room === 'signal') out.push('Bassett stands by the engine, one hand on the receiver, watching the needle.');
    else out.push('Bassett is here.');
  }
  if (nellHere(s) && !skip.includes('nell')) {
    const N = s.nell;
    if (N.follows) out.push('Nell keeps tight hold of your sleeve.');
    else if (s.room === 'point')
      out.push(
        N.trust >= 2
          ? 'Nell is sitting up against the cairn, watching you.'
          : N.trust >= 1
            ? 'Nell is huddled against the cairn, shivering, watching you sideways.'
            : 'Nell is crouched in the lee of the cairn, striking her last few matches at the wet gorse. Each one fizzles out.',
      );
    else if (s.room === 'house') out.push('Nell is in her own bed, pretending to be asleep.');
    else out.push(`Nell is ${NELL_AT[s.room].replace(/^asleep/, 'half asleep')}.`);
  }
  if (brambleHere(s) && !skip.includes('bramble')) {
    const B = s.bramble;
    if (B.withNell && s.nell.room === s.room) {
      if (!s.nell.follows) out.push('Bramble is lying across Nell’s feet.');
      else if (!brief) out.push('Bramble trots at Nell’s side.');
    } else if (B.follows) {
      if (!brief && !(s.room === 'moor' && !s.nell.found)) out.push('Bramble is at your heel, nose working.');
    } else if (!B.led)
      out.push('Bramble, the doctor’s spaniel, lies steaming by the stove, a snapped lead trailing from her collar. She lifts her head at every sound outside.');
    else out.push('Bramble is sitting here, waiting for you.');
  }
  // Things not already in the room's own description.
  const home: Partial<Record<Item, Room>> = { logbook: 'cottage', matches: 'cottage', blowlamp: 'store', crowbar: 'store', lantern: 'moor', quilt: 'house', note: 'house' };
  for (const i of ITEMS) if (here(s, i) && home[i] !== s.room) out.push(`${The(i)} ${i === 'matches' || i === 'keys' ? 'are' : 'is'} here.`);
  return out;
}

/** The room in full, as on a first visit. */
export function describe(s: State): string[] {
  return describeRoom(s, false, []);
}

// ---------------------------------------------------------------- choices

export function choices(s: State): Choice[] {
  if (s.over) return [];
  const out: Choice[] = [];
  const add = (id: string, label: string, about: string) => out.push({ id, label, about });
  for (const r of EXITS[s.room]) {
    if (s.room === 'yard' && r === 'signal' && !s.f.door) continue;
    add(`go:${r}`, ROOM_NAMES[r], 'go');
  }
  for (const i of ITEMS) if (here(s, i)) add(`take:${i}`, `Take ${the(i)}`, i);
  if (s.room === 'cottage' && !s.f.brewed) add('brew', 'Make a flask of cocoa', 'stove');
  if (here(s, 'logbook') || has(s, 'logbook')) add('read:logbook', 'Read Ada’s logbook', 'logbook');
  if (here(s, 'note') || has(s, 'note')) add('read:note', 'Read the note', 'note');
  if (s.room === 'yard' && !s.f.door) add('look:door', 'Try the signal-house door', 'door');
  if (s.room === 'signal') {
    if (!s.f.running) add('look:engine', 'Look over the engine', 'engine');
    if (!s.f.running && s.f.heatAt >= 0 && !hot(s)) add('wait:bulb', 'Wait for the bulb to heat', 'engine');
    if (!s.f.running && s.f.heatAt >= 0 && bassettHere(s)) add('swing', 'Swing the flywheel with Bassett', 'engine');
    if (s.f.running && !s.f.horn) add('open:valve', 'Open the air valve', 'engine');
  }
  if (s.f.horn && INDOORS.has(s.room)) add('wait', 'Wait for the Merrow', 'merrow');
  // Things carried.
  for (const i of ITEMS) {
    if (!has(s, i)) continue;
    for (const [target, label] of useTargets(s, i)) add(`use:${i}:${target}`, label, i);
    if (bassettHere(s)) {
      if (i === 'logbook' && !s.bassett.told.includes('log')) add('show:logbook:bassett', 'Show Bassett the logbook', i);
      if (i === 'note' && !s.bassett.told.includes('nell')) add('show:note:bassett', 'Show Bassett the note', i);
      if (i === 'flask') add('give:flask:bassett', 'Give the flask to Bassett', i);
    }
    if (nellHere(s) && !s.nell.home) {
      if (i === 'flask') add('give:flask:nell', 'Give the flask to Nell', i);
      if (i === 'lantern') add('give:lantern:nell', 'Give Nell her lantern', i);
      if (i === 'quilt') add('give:quilt:nell', 'Wrap Nell in her quilt', i);
    }
    add(`drop:${i}`, `Put down ${the(i)}`, i);
  }
  // People (and the dog).
  if (bassettHere(s)) for (const [id, label] of bassettTopics(s)) add(`say:bassett:${id}`, label, 'bassett');
  if (nellHere(s)) for (const [id, label] of nellTopics(s)) add(`say:nell:${id}`, label, 'nell');
  if (brambleHere(s) && !s.bramble.follows && !s.bramble.withNell) add('lead', 'Take her on the lead', 'bramble');
  return out;
}

function useTargets(s: State, i: Item): [string, string][] {
  const t: [string, string][] = [];
  if (i === 'matches' && s.room === 'point' && !s.f.beacon) t.push(['beacon', 'Light the beacon']);
  if (i === 'blowlamp' && s.room === 'store' && !s.f.fuel) t.push(['drum', 'Fill the blowlamp from the drum']);
  if (i === 'blowlamp' && s.room === 'signal' && s.f.heatAt < 0) t.push(['bulb', 'Heat the bulb with the blowlamp']);
  if (i === 'keys' && s.room === 'yard' && !s.f.door) t.push(['door', 'Unlock the signal house']);
  if (i === 'crowbar' && s.room === 'yard' && !s.f.door) t.push(['door', 'Force the hasp (Bassett will hear)']);
  if (i === 'crowbar' && s.room === 'signal' && s.f.heatAt >= 0 && !s.f.running) t.push(['flywheel', 'Lever the flywheel round']);
  return t;
}

function bassettTopics(s: State): [string, string][] {
  const B = s.bassett;
  const told = (k: string) => B.told.includes(k);
  const t: [string, string][] = [];
  if (!told('nell')) t.push(['nell', !s.nell.found ? 'Tell him Nell is missing' : nellSafe(s) ? 'Tell him Nell’s safe' : 'Tell him Nell is out on the Point']);
  if (!told('boat')) t.push(['boat', 'Ask about the Merrow']);
  if (!s.f.horn && !B.agreed) t.push(['signal', told('signal') ? 'Ask him again to start the horn' : 'Ask about the fog signal']);
  if (s.f.forced && !told('hasp')) t.push(['hasp', 'Own up about the hasp']);
  if (B.agreed && !B.follows && !s.f.running && s.room !== 'signal') t.push(['come', 'Ask him to come and swing the flywheel']);
  if (B.follows) t.push(['stay', 'Ask him to wait here']);
  return t;
}

function nellTopics(s: State): [string, string][] {
  const N = s.nell;
  if (N.home) return [];
  const told = (k: string) => N.told.includes(k);
  const t: [string, string][] = [];
  if (!told('cross')) t.push(['cross', 'Tell her nobody’s cross']);
  if (!told('scold') && !N.follows) t.push(['scold', 'Tell her off for running away']);
  if (!N.ready) t.push(['horn', s.f.horn ? 'Tell her the horn is for her mam’s boat' : 'Promise her the foghorn will sound']);
  if (!N.follows) t.push(['come', 'Ask her to come home']);
  else if (INDOORS.has(s.room)) t.push(['stay', 'Ask her to wait here']);
  return t;
}

// ---------------------------------------------------------------- acting

/** Applies an action; returns the text that follows. Illegal actions return null. */
export function act(s: State, id: string): string[] | null {
  if (s.over) return null;
  if (!choices(s).some((c) => c.id === id)) return null;
  const [verb, a, b] = id.split(':');
  const t0 = s.t;
  const out: string[] = [];
  let cost = 1;
  switch (verb) {
    case 'go':
      // Moving spends its time first, so the new room is described as it is on arrival.
      go(s, a as Room, out);
      cost = 0;
      break;
    case 'take': {
      const i = a as Item;
      s.at[i] = 'inv';
      out.push(
        {
          logbook: 'You tuck Ada’s logbook under your arm.',
          matches: 'You pocket the matches.',
          flask: 'You take the flask.',
          blowlamp: 'You lift the blowlamp down off its nail.',
          crowbar: 'You take the crowbar. It’s cold and heavy.',
          keys: 'You pick up the keys.',
          lantern: 'You pick up the little lantern. NELL is scratched on the base.',
          quilt: 'You bundle Nell’s quilt under your arm.',
          note: 'You fold the note into your pocket.',
        }[i],
      );
      break;
    }
    case 'drop':
      s.at[a as Item] = s.room;
      out.push(`You put down ${the(a as Item)}.`);
      cost = 0;
      break;
    case 'brew':
      s.f.brewed = true;
      s.at.flask = 'inv';
      out.push('You warm milk on the stove and make cocoa the way Ada does, with too much sugar, and screw it into her old tin flask.');
      break;
    case 'read':
      cost = 0;
      if (a === 'logbook')
        out.push(
          'Ada’s square hand: “3 Nov. Air receiver cracked. Patched it with a plate and twelve bolts. Holds to sixty pound. Keep the needle under the red line and she’ll do. Inspector can whistle.”',
          'Below it, a note for her relief: “Fog engine. Blowlamp under the bulb a good quarter hour, then swing the flywheel. Two to swing her. On your own, lever her round with the bar from the store. Then open the air valve.”',
        );
      else out.push('In big careful capitals: “GONE TO MAKE A LIGHT FOR MAMS BOAT ON THE POINT. BACK SOON. N.”', 'The box of matches by the range is gone too.');
      break;
    case 'look':
      cost = 0;
      if (a === 'door') out.push('Padlocked. Mr Bassett, the relief keeper, has the key on his ring up in the tower. The hasp is old and rusty; a crowbar would have it off, though not quietly.');
      else {
        out.push('Ada taught you this much: heat the bulb with a blowlamp until it glows, swing the flywheel to fire her, then open the air valve to the horn.');
        out.push(
          s.f.heatAt < 0
            ? 'The bulb is cold.'
            : hot(s)
              ? 'The bulb is hot. The flywheel is a two-man swing; on your own you’d have to lever it round with a bar.'
              : 'The bulb is warming, but it isn’t hot yet. Swing her now and she’ll only cough.',
        );
      }
      break;
    case 'use':
      cost = useItem(s, a as Item, b, out);
      break;
    case 'swing':
      if (!hot(s)) out.push('You and Bassett throw your weight on the rim. The engine coughs once and dies. “Bulb’s not hot,” he says. “Give her time.”');
      else {
        s.f.running = true;
        out.push('You and Bassett throw your weight on the rim, once, twice, and on the third swing the engine fires. Thud. Thud. Thud. Bassett wipes his hands. “Well. She hasn’t burst yet.”');
      }
      break;
    case 'open':
      s.f.horn = true;
      out.push(
        'You open the air valve. The needle climbs to the red line and you hold it there, just under. Then the horn speaks: a long, low groan that shakes dust from the rafters and rolls out over the water.',
        'Half a minute later it comes again. Far out in the grey, the Merrow’s bell answers.',
      );
      break;
    case 'lead':
      s.bramble.follows = true;
      out.push(!s.bramble.led ? 'You knot the snapped lead and clip it back on. Bramble is up at once, pulling for the door.' : 'You take Bramble’s lead. She comes to heel.');
      s.bramble.led = true;
      break;
    case 'give':
    case 'show':
      give(s, a as Item, b as Npc, out);
      break;
    case 'say':
      if (a === 'bassett') talkBassett(s, b, out);
      else talkNell(s, b, out);
      break;
    case 'wait':
      if (a === 'bulb') {
        out.push('You sit by the engine and watch the bulb darken to red, then glow.');
        cost = Math.max(1, s.f.heatAt + HEAT - s.t);
        break;
      }
      s.t = END_T;
      out.push('You listen to the horn call, and the Merrow’s bell answer, closer every time.');
      return finish(s, out, 0, t0);
  }
  return finish(s, out, cost, t0);
}

const spend = (s: State, cost: number) => (s.t = Math.min(END_T, s.t + cost));

function go(s: State, to: Room, out: string[]): void {
  const from = s.room;
  let cost = from === 'moor' || to === 'moor' ? 2 : 1;
  if (from === 'moor' && blind(s) && !guided(s)) {
    if (to !== 'yard') {
      out.push(
        `You set off for ${ROOM_NAMES[to].replace(/^The /, 'the ')}. Ten steps and the path is gone; there is only heather and grey. You walk until your hands find the wall again, and you are back where you started.`,
        'Without something to steer by, a sound to walk toward or a nose that knows the way, the moor will only turn you round.',
      );
      spend(s, 2);
      return;
    }
    out.push('You find the wall with your hands and follow it, stone by stone, back toward the yard. It takes an age.');
    cost = 3;
  }
  spend(s, cost);
  const brambleStays = s.bramble.withNell && s.bramble.room === from && !s.nell.follows && s.nell.room === from;
  s.room = to;
  if (s.bramble.follows) s.bramble.room = to;
  if (s.bassett.follows) s.bassett.room = to;
  if (s.nell.follows) s.nell.room = to;
  if (s.bramble.withNell) s.bramble.room = s.nell.room;
  const brief = s.seen.includes(to);
  if (!brief) s.seen.push(to);
  // Events on arrival, told after the room.
  const after: string[] = [];
  const skip: string[] = [];
  if (brambleStays) out.push('Bramble stays pressed against Nell. She won’t leave her now.');
  if (to === 'signal' && s.bassett.follows && !s.f.running) {
    s.bassett.follows = false;
    skip.push('bassett');
    after.push('Bassett takes off his coat and sits on a bucket by the engine. “I’ll mind her. Shout when you want that flywheel swung.”');
  }
  if ((to === 'cottage' || to === 'house') && s.nell.follows) {
    s.nell.follows = false;
    s.nell.home = true;
    skip.push('nell', 'bramble');
    after.push(
      to === 'cottage'
        ? 'Nell goes straight to the stove and holds her hands out to it. In two minutes she’s asleep in Ada’s chair.'
        : 'Nell creeps upstairs past her gran’s door and into her own bed, boots and all.',
    );
    if (s.bramble.withNell || s.bramble.room === to) after.push('Bramble flops down at her feet.');
  }
  if (to === 'point' && !s.nell.found) {
    s.nell.found = true;
    skip.push('nell');
    after.push(
      'Someone small is crouched in the lee of the cairn, striking match after match at the wet gorse.',
      s.f.horn
        ? '“Go away!” A small voice, fierce and shaky. “I’m not coming. I’m waiting for Mam’s boat.”'
        : '“Go away!” A small voice, fierce and shaky. “I’m not coming. I’m keeping a light for Mam’s boat.”',
    );
  }
  if (s.nell.found && !s.bramble.withNell && s.bramble.room === s.nell.room) {
    skip.push('bramble');
    reunite(s, after);
  }
  out.push(...describeRoom(s, brief, skip), ...after);
}

/** Bramble finds Nell again, and stays with her from now on. */
function reunite(s: State, out: string[]) {
  const first = !s.nell.told.includes('bramble');
  s.bramble.withNell = true;
  s.bramble.follows = false;
  if (first) {
    s.nell.told.push('bramble');
    s.nell.trust += 2;
  }
  out.push(
    s.room === 'point'
      ? 'Bramble yanks the lead out of your hand and throws herself at the cairn. “Bramble!” Nell has her arms round the wet dog, laughing and crying at once. “I lost her. I lost her in the fog.”'
      : 'Bramble scrambles up and buries her nose in Nell’s hands. She won’t leave her side now.',
  );
}

function useItem(s: State, i: Item, target: string, out: string[]): number {
  if (i === 'matches') {
    s.f.beacon = true;
    out.push('You crouch out of the wind and strike a match at the gorse. It smokes, and hisses, and goes out. Soaked through. And even if it caught, in this a fire would be a smudge at twenty yards. In fog, it’s sound that carries.');
    return 1;
  }
  if (i === 'blowlamp' && target === 'drum') {
    s.f.fuel = true;
    out.push('You fill the blowlamp from the drum’s brass tap and pump it up hard. It sloshes, full.');
    return 1;
  }
  if (i === 'blowlamp') {
    if (!s.f.fuel) {
      out.push('You pump and pump. Nothing; the blowlamp is dry. There’s a drum of paraffin in the oil store.');
      return 1;
    }
    if (!has(s, 'matches')) {
      out.push('You need a flame to light it. There were matches on the cottage mantelpiece.');
      return 1;
    }
    s.f.heatAt = s.t + 1;
    s.at.blowlamp = 'nowhere';
    out.push('You light the blowlamp, pump it till it roars blue, and set it under the bulb. It will want a good quarter of an hour.');
    return 1;
  }
  if (i === 'keys') {
    s.f.door = true;
    out.push('The padlock is stiff, but Bassett’s key turns it. The door swings in on a smell of cold oil.');
    return 1;
  }
  if (i === 'crowbar' && target === 'door') {
    s.f.door = true;
    s.f.forced = true;
    s.bassett.trust -= 2;
    out.push('You jam the crowbar behind the hasp and heave. The screws shriek out of the wood, and the door is open.');
    out.push(
      bassettHere(s)
        ? '“That’s Trinity House property!” Bassett says, white to the lips.'
        : 'Up in the tower a window bangs open. “Who’s that? What are you doing to that door?” Bassett has heard.',
    );
    return 1;
  }
  // The flywheel, levered round alone.
  if (!hot(s)) {
    out.push('You lever the flywheel round, a notch at a time, and heave it over. The engine coughs once and stops. The bulb isn’t hot enough yet.');
    return 2;
  }
  s.f.running = true;
  out.push('You lever the flywheel round, a notch at a time, until it’s over the top and swinging, then snatch the bar out. The engine coughs, coughs again, and catches. Thud. Thud. Thud.');
  return 3;
}

function give(s: State, i: Item, n: Npc, out: string[]) {
  if (n === 'bassett') {
    const B = s.bassett;
    if (i === 'logbook') {
      B.told.push('log');
      B.trust++;
      out.push('Bassett reads the entry twice, his lips moving. Sixty pound. Twelve bolts. “Her hand?” You nod. “Hm. A keeper’s word, written down. I’ll take that over an inspector’s tag.”');
    } else if (i === 'note') {
      B.told.push('nell');
      B.trust++;
      out.push(nellNews(s));
    } else {
      s.at.flask = 'nowhere';
      B.told.push('flask');
      B.trust++;
      out.push('Bassett unscrews the flask and drinks, and his shoulders come down an inch. “I’ve been up since six,” he says. “Nobody told me the fog here was like this.”');
    }
    return;
  }
  const N = s.nell;
  N.trust++;
  N.told.push(i);
  s.at[i] = 'nowhere';
  out.push(
    {
      flask: 'Nell drinks the cocoa in long gulps, both hands round the cup. “Too much sugar,” she says. “Like Ada makes.”',
      lantern: '“My lantern!” She holds it in her lap, though it’s out and cracked. “I dropped it when Bramble ran off.”',
      quilt: 'You wrap Nell in her own quilt. She burrows into it until only her nose shows.',
    }[i as 'flask' | 'lantern' | 'quilt'],
  );
}

/** What Bassett says about Nell: missing, out on the Point, or brought in. Each moves him the same. */
function nellNews(s: State): string {
  if (!s.nell.found)
    return '“The doctor’s girl? Out in this?” Bassett puts down his pencil. “I’ve a girl that age in Falmouth.” He frowns. “She was up here this afternoon with that dog. Asked why nobody lights the old beacon on the Point any more. I told her a light’s no use in fog. It’s sound that carries.”';
  if (!nellSafe(s)) return '“Up at the old beacon? In this?” Bassett puts down his pencil. “I’ve a girl that age in Falmouth. You get her in, lad.”';
  if (nellHere(s))
    return 'Bassett looks at the small, soaked girl hanging off your sleeve, and something in his face gives. “Out on the Point, in this? I’ve a girl that age in Falmouth.” He finds a toffee in his pocket for her.';
  return '“The doctor’s girl? Lost out there, and you fetched her in?” Bassett puts down his pencil. “I’ve a girl that age in Falmouth.” He looks at you differently.';
}

function talkBassett(s: State, topic: string, out: string[]) {
  const B = s.bassett;
  const told = (k: string) => B.told.includes(k);
  switch (topic) {
    case 'nell':
      out.push(nellNews(s));
      B.told.push('nell');
      B.trust++;
      break;
    case 'boat':
      B.told.push('boat');
      out.push('“The Merrow? Due round the Point at one, with the doctor aboard, and your Ada.” He looks at the fog pressing on the glass. “They’ll be feeling their way in on the lead line, listening for the horn. If there were a horn.”');
      break;
    case 'signal': {
      const first = !told('signal');
      if (first) B.told.push('signal');
      if (B.trust >= 2) {
        B.agreed = true;
        B.follows = true;
        const lead = first ? '“Condemned, by the tag.” ' : '';
        if (!s.f.door) {
          s.at.keys = 'inv';
          out.push(`${lead}Bassett looks at the lamp, then at the fog against the glass, for a long moment. “It’s no use to anyone tonight, is it.” He unhooks his keys and hands them over. “I’ll swing that flywheel with you. Two’s the job. Lead on.”`);
        } else out.push(`${lead}“Well. The door’s open already.” He sighs and reaches for his coat. “I’ll swing that flywheel with you, then. Two’s the job. Lead on.”`);
        break;
      }
      if (first) out.push('“Condemned,” he says. “Inspector’s tag on the flywheel. Cracked air receiver. I’m not having it burst on my watch, and I’m not leaving the light.”');
      if (B.trust >= 1)
        out.push(
          !told('log')
            ? `${first ? 'He hesitates. ' : ''}“I hear you.” He taps the inspector’s report on his desk. “But that receiver’s cracked. If it bursts, it’s my name in the log. Show me it won’t.”`
            : `${first ? 'He hesitates. ' : ''}“Ada’s patch, Ada’s word. But I don’t know this island, and I don’t know you.” He looks at the fog. “The Merrow has charts and a lead line. Give me a better reason to break the rules.”`,
        );
      else if (!first) out.push('“I’ve said. Condemned.” He turns back to his lamp.');
      if (B.trust < 1 && s.f.forced) out.push('He looks at you hard. “And I heard what you did to that door.”');
      break;
    }
    case 'hasp':
      B.told.push('hasp');
      B.trust++;
      out.push('You tell him straight: it was you. Bassett takes off his spectacles and rubs his eyes. “Well. At least you’ve said so.”');
      break;
    case 'come':
      B.follows = true;
      out.push('“Right you are.” He buttons his coat.');
      break;
    case 'stay':
      B.follows = false;
      out.push('“I’ll be here,” he says.');
      break;
  }
}

function talkNell(s: State, topic: string, out: string[]) {
  const N = s.nell;
  switch (topic) {
    case 'cross':
      N.told.push('cross');
      if (N.told.includes('scold')) out.push('“You just were,” she says into her knees.');
      else {
        N.trust++;
        out.push('“Gran will be.” She sniffs. “Mam will be.” But she lets you crouch beside her, out of the wind.');
      }
      break;
    case 'scold':
      N.told.push('scold');
      N.trust--;
      out.push('You tell her what she’s done: out alone in this, her gran asleep and not knowing. Nell shrinks back against the stones. “I knew you’d shout.”');
      break;
    case 'horn':
      N.ready = true;
      if (s.f.horn) {
        N.trust++;
        out.push('“Is that it? The horn?” She lifts her head as it groans again. “Will Mam hear it?” “From miles off.” She lets out a long breath.');
      } else {
        N.promised = true;
        out.push('You tell her that in fog nobody can see a light, but a ship can hear the horn for miles. You’ll get it going, for her mam’s boat. “Promise?” “Promise.” She looks at the wet gorse, and the dead matches, and nods.');
      }
      break;
    case 'come':
      if (N.trust >= 2 && N.ready) {
        N.follows = true;
        out.push('Nell gets up, stiff with cold, and takes your hand. She’s shaking. Get her somewhere warm: the cottage, or home to bed.');
      } else if (N.trust <= 0) out.push('She shakes her head and hugs her knees. “I’m not coming. Everyone’s going to shout. And I lost Bramble.” She is shivering hard.');
      else if (N.trust < 2) out.push('“I lost Bramble,” she says, very small. “She ran off in the fog, and it’s my fault. And I’m so cold.”');
      else out.push('“Not till there’s something for Mam’s boat.” She points at the wet gorse. “Mr Bassett says nobody can see a light in fog. But I’ve got to do something.”');
      break;
    case 'stay':
      N.follows = false;
      out.push('“Don’t be long,” she says.');
      break;
  }
}

function finish(s: State, out: string[], cost: number, prev: number): string[] {
  spend(s, cost);
  const crossed = (k: number) => prev < k && s.t >= k;
  if (crossed(FOG_T - 6))
    out.push(`${INDOORS.has(s.room) ? 'Outside, the' : 'The'} fog is thickening. Soon the moor path will be gone, and out there you’ll need something to steer by.`);
  if (crossed(FOG_T))
    out.push(
      s.f.horn
        ? 'The fog closes in completely. Only the horn gives you a direction now.'
        : 'The fog closes in completely. On the moor now, without something to steer by, you’d only walk in circles.',
    );
  if (s.f.heatAt >= 0 && !s.f.running && crossed(s.f.heatAt + HEAT)) {
    if (s.room === 'signal') out.push('The bulb glows cherry red. Hot enough to fire.');
    else if (s.room !== 'moor' && s.room !== 'house' && s.room !== 'point') out.push('Across the yard, the blowlamp’s roar has steadied. The bulb should be hot by now.');
  }
  if (!s.f.horn && crossed(END_T - 10)) out.push('Out at sea, the Merrow’s bell is close now. Half an hour, no more.');
  if (s.t >= END_T) s.over = ending(s);
  return out;
}

// ---------------------------------------------------------------- endings

export function ending(s: State): Ending {
  const horn = s.f.horn;
  const N = s.nell;
  const safe = N.found && INDOORS.has(N.room);
  const bassett = s.bassett.trust >= 2;
  const stars = +horn + +safe + +bassett;
  const text: string[] = [];
  if (horn)
    text.push('One o’clock. The horn groans out over the water, and out in the grey the Merrow’s bell answers it. She turns, finds the channel she can’t see, and comes in past the Teeth with a fathom to spare.');
  else
    text.push(
      'One o’clock. Out in the fog the Merrow’s bell rings and rings, closer and closer, and then there is a long, grinding scrape on the Teeth.',
      'The lifeboat takes everyone off at first light, cold and soaked. Ada comes ashore on a stretcher, swearing.',
    );
  if (safe) {
    const at = NELL_AT[N.room];
    if (horn) text.push(`The doctor comes up from the quay at a run and finds Nell ${at}.`);
    else
      text.push(
        N.promised
          ? `Nell is safe, ${at}. But when she wakes she listens for a horn that never sounded. “You promised,” she says.`
          : `Nell is safe, ${at}, though she wakes at every sound, listening for her mam’s boat.`,
      );
    if (horn && N.promised) text.push('“You kept your promise,” Nell tells everyone, over and over.');
  } else if (N.follows)
    text.push(
      `Nell is still out ${s.room === 'point' ? 'on the Point' : s.room === 'moor' ? 'on the moor' : 'in the yard'} with you at one o’clock, shaking, your coat round her. You get her indoors at last, frozen through.`,
    );
  else if (N.found)
    text.push(
      s.room === 'point'
        ? 'Nell is still at the cairn beside you at one o’clock; she wouldn’t come. You sit with her till the fog lifts, and the doctor carries her down the hill herself, blue with cold.'
        : 'Nell is still up at the cairn. They find her at dawn asleep against the stones, blue with cold, and the doctor carries her down the hill herself.',
    );
  else text.push('At first light the fog lifts, and they find Nell asleep in the lee of the beacon cairn on the Point, blue with cold. Nobody had come.');
  if (bassett)
    text.push(
      !horn
        ? 'Bassett sits up with you until the fog lifts. “We should have run that engine,” he says. “I should.”'
        : s.f.forced
          ? 'Bassett writes in the log: “Fog signal started on my instructions.” He looks at you over his spectacles and says nothing about the hasp.'
          : 'Bassett writes in the log: “Fog signal started on my instructions, with the assistant keeper.” Then he shakes your hand.',
    );
  else
    text.push(
      s.f.forced
        ? 'Bassett writes it all down: the forced hasp, the condemned engine. There will be an inquiry.'
        : 'Bassett keeps to his watch room and his rules. He leaves on the next boat without a word to you.',
    );
  if (horn) text.push('Ada is first down the gangway, on a stick. “Heard you from halfway to Penhallow,” she says.');
  const title = stars === 3 ? 'All Ashore' : horn ? 'The Horn Sounds' : 'Fog on the Teeth';
  return { title, text, stars };
}

// ---------------------------------------------------------------- replay

/** Replays a list of action ids from a new game (illegal ones stop the replay). */
export function replay(ids: string[]): State {
  const s = newGame();
  for (const id of ids) if (!act(s, id)) break;
  return s;
}
