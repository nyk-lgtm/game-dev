// Hints for Last Light: the next useful step from the current state, as a gentle
// nudge and then a plain pointer. Each night walks a ladder of conditions that
// follows its best route (tests/lastlight), skipping what's done or no longer
// possible. Pure: reads a state, never changes it.

import * as n1 from './story';
import * as n2 from './night2';

export interface Hint {
  /** Which step this is (the same step keeps the same key). */
  key: string;
  /** Level 1: points the way without giving it away. */
  nudge: string;
  /** Level 2: says exactly what to do. */
  pointer: string;
  /** The action to tap next, if it's on screen now (a step toward the place, or the action itself). */
  target?: string;
}

/** The first step from `from` toward the nearest of `to`, or null when already there or cut off. */
export function stepToward<R extends string>(exits: Record<R, R[]>, from: R, to: R | R[], open: (a: R, b: R) => boolean): R | null {
  const goals = new Set(Array.isArray(to) ? to : [to]);
  if (goals.has(from)) return null;
  const first = new Map<R, R>();
  const queue: R[] = [];
  for (const r of exits[from])
    if (open(from, r) && !first.has(r)) {
      first.set(r, r);
      queue.push(r);
    }
  while (queue.length) {
    const r = queue.shift()!;
    if (goals.has(r)) return first.get(r)!;
    for (const n of exits[r])
      if (n !== from && !first.has(n) && open(r, n)) {
        first.set(n, first.get(r)!);
        queue.push(n);
      }
  }
  return null;
}

/** "the oil store", for "Fetch X from …". */
const PLACES: Record<string, string> = {
  cottage: 'the cottage', yard: 'the yard', base: 'the foot of the tower', lamp: 'the lamp room', cliff: 'the cliff path',
  road: 'the village road', shore: 'the shore', boathouse: 'the boathouse', tower: 'the watch room', signal: 'the signal house',
  store: 'the oil store', moor: 'the moor', house: 'the doctor’s house', point: 'the Point',
};
/** " from the oil store", or nothing when it's right here. */
const from = (where: string, room: string) => (where === room || !PLACES[where] ? '' : ` from ${PLACES[where]}`);

/** Moves from one room to another (ignoring locked doors and the tide). */
export function distance<R extends string>(exits: Record<R, R[]>, from: R, to: R): number {
  const seen = new Map<R, number>([[from, 0]]);
  const queue = [from];
  while (queue.length) {
    const r = queue.shift()!;
    if (r === to) return seen.get(r)!;
    for (const n of exits[r]) if (!seen.has(n)) (seen.set(n, seen.get(r)! + 1), queue.push(n));
  }
  return 99;
}

type Step = Omit<Hint, 'target'> & { room?: string | string[]; act?: string };

/** Turns a step into a hint: the action when you're in its room, else the next move toward it. */
function resolve<R extends string>(step: Step, room: R, exits: Record<R, R[]>, open: (a: R, b: R) => boolean, ids: Set<string>): Hint {
  const rooms = (step.room === undefined ? [] : Array.isArray(step.room) ? step.room : [step.room]) as R[];
  let target: string | undefined;
  if (!rooms.length || rooms.includes(room)) target = step.act;
  else {
    const next = stepToward(exits, room, rooms, open);
    if (next) target = `go:${next}`;
  }
  return { key: step.key, nudge: step.nudge, pointer: step.pointer, target: target && ids.has(target) ? target : undefined };
}

// ---------------------------------------------------------------- night 1: the storm

export function hint1(s: n1.State): Hint | null {
  if (s.over) return null;
  const ids = new Set(n1.choices(s).map((c) => c.id));
  const step = steps1(s);
  if (!step) return null;
  const tide = s.t >= n1.TIDE_T;
  return resolve(step, s.room, n1.EXITS, (a, b) => !(tide && ((a === 'cliff' && b === 'shore') || (a === 'shore' && b === 'cliff'))) && !(a === 'yard' && b === 'base' && !s.f.door && !s.f.window), ids);
}

function steps1(s: n1.State): Step | null {
  const step = ladder1(s);
  // Carrying the heavy can on an errand away from the tower: leave it in the yard for now.
  if (step && n1.has(s, 'oil') && s.room === 'yard' && !s.f.oil && !['yard', 'base', 'lamp'].includes(String(step.room ?? 'yard')))
    return { key: 'drop-oil', nudge: 'That oil can doubles every walk.', pointer: 'Put the oil can down here in the yard for now; pick it up on your way into the tower.', act: 'drop:oil' };
  return step;
}

function ladder1(s: n1.State): Step | null {
  const below = (r: string) => r === 'shore' || r === 'boathouse';
  const tide = s.t >= n1.TIDE_T;
  const has = (i: n1.Item) => n1.has(s, i);
  if (tide && below(s.room))
    return {
      key: 'stranded',
      nudge: 'Look at the steps. Is anyone getting back up tonight?',
      pointer: 'The tide has cut you off below until morning. All that’s left is to wait out the night. Next time, be back up the cliff steps before a quarter past eleven.',
      act: 'watch',
    };
  const light = s.f.lit && s.f.wound;
  /** Where something is, as a room (with Tomas or in your hands counts as where they are). */
  const whereIs = (i: n1.Item): string => (s.at[i] === 'inv' ? s.room : s.at[i] === 'tomas' ? s.tomas.room : s.at[i] === 'ada' ? s.ada.room : s.at[i]);
  const oilDone = s.f.oil;
  const d = (a: string, b: string) => distance(n1.EXITS, a as n1.Room, b as n1.Room);
  /** Can you get down to `r`, spend `work` actions there and be back up the steps before the tide? */
  const tripOk = (r: string, work: number, heavy: boolean) => !below(r) || (!tide && s.t + d(s.room, r) + work + (heavy ? 2 : 1) * d(r, 'shore') < n1.TIDE_T);
  const oilWhere = whereIs('oil');
  const oilCarried = s.at.oil === 'inv' || (s.at.oil === 'tomas' && s.tomas.follows);
  const oilLost = !oilDone && (s.at.oil === 'nowhere' || (below(oilWhere) && !(oilCarried && below(s.room) ? !tide : tripOk(oilWhere, 1, !s.tomas.follows))));
  const lightPossible = !light && !oilLost;
  const tomasReachable = !below(s.tomas.room) || (s.tomas.follows && below(s.room) ? !tide : tripOk(s.tomas.room, 3, false));
  const teaGone = s.at.tea === 'nowhere' && s.at.kettle === 'nowhere';
  const canWinTomas = s.tomas.trust >= 2 || (tomasReachable && (!teaGone || !s.tomas.told.includes('ship') || !s.tomas.told.includes('ada')));
  const adaPossible = !s.ada.freed && tomasReachable && canWinTomas;
  // Short of time: the light first.
  const hurry = lightPossible && s.t >= 27;

  // The matches, and keeping them dry.
  const prep = (): Step | null => {
    if (!lightPossible || s.f.lit) return null;
    if (!s.wearing && s.at.coat !== 'nowhere')
      return {
        key: 'coat',
        nudge: 'It’s raining sideways out there. Anything in your pockets will be soaked through.',
        pointer: 'Put on Ada’s oilskin coat before you go out. It keeps the matches dry.',
        room: whereIs('coat'),
        act: has('coat') || s.room === 'cottage' ? 'wear' : 'take:coat',
      };
    if (!has('matches'))
      return s.at.matches === 'drawer'
        ? {
            key: 'matches',
            nudge: 'A lamp needs a flame. Ada keeps the useful things in the dresser.',
            pointer: 'Open the drawer in the cottage and take the matches.',
            room: 'cottage',
            act: 'open:drawer',
          }
        : { key: 'matches', nudge: 'A lamp needs a flame.', pointer: `Take the matches${from(whereIs('matches'), s.room)}.`, room: whereIs('matches'), act: 'take:matches' };
    if (s.wet)
      return {
        key: 'wet',
        nudge: 'Those matches won’t strike. Somewhere warm would dry them.',
        pointer: 'Dry the matches on the cottage stove (and wear the coat out, so they stay dry).',
        room: 'cottage',
        act: 'use:matches:stove',
      };
    return null;
  };
  // Cheap prep right here comes before the dash for the oil.
  const near = prep();
  if (near && (near.room === undefined || near.room === s.room)) return near;

  // The tide is coming: the oil (and Tomas, if he can be won quickly) before the steps go under.
  const oilBelow = lightPossible && !oilDone && s.at.oil !== 'inv' && !(s.at.oil === 'tomas' && s.tomas.follows) && below(whereIs('oil'));
  if (oilBelow && (s.t >= n1.TIDE_T - 12 || below(s.room))) {
    const tide = ' The tide covers the shore steps at a quarter past eleven.';
    const talks = s.tomas.trust >= 2 ? 0 : has('tea') ? 1 : 2 - s.tomas.trust;
    const canTalk = s.tomas.trust >= 2 || has('tea') || [!s.tomas.told.includes('ship'), s.f.foundAda && !s.tomas.told.includes('ada')].filter(Boolean).length >= talks;
    if (below(s.tomas.room) && !s.ada.freed && !s.tomas.follows && canTalk && tripOk(s.tomas.room, talks + 2, false)) {
      if (s.tomas.trust < 2 && has('tea'))
        return { key: 'tea-give', nudge: 'Tomas is frozen to the bone, and you have something hot.', pointer: 'Give the tea to Tomas.', room: s.tomas.room, act: 'give:tea:tomas' };
      if (s.tomas.trust < 2 && !s.tomas.told.includes('ship'))
        return { key: 'tomas-ship', nudge: 'Tomas might care more if he knew who was out there.', pointer: `Tell Tomas about the ship, then ask him to help with the oil.${tide}`, room: s.tomas.room, act: 'say:tomas:ship' };
      if (s.tomas.trust < 2 && s.f.foundAda && !s.tomas.told.includes('ada'))
        return { key: 'tomas-ada', nudge: 'Tomas owes Ada a great deal.', pointer: `Tell Tomas that Ada is trapped, then ask him to come.${tide}`, room: s.tomas.room, act: 'say:tomas:ada' };
      if (s.tomas.trust >= 2)
        return { key: 'tomas-come', nudge: 'The oil can is heavy, and Tomas is willing now.', pointer: `Ask Tomas to come with you; he’ll carry the oil.${tide}`, room: s.tomas.room, act: 'say:tomas:help' };
    }
    return {
      key: 'oil',
      nudge: 'The lamp’s reservoir is empty, and the only full can is down by the sea.',
      pointer: `Fetch the oil can${from(whereIs('oil'), '')} before the tide cuts you off.${tide}`,
      room: whereIs('oil'),
      act: s.at.oil === 'tomas' ? 'say:tomas:help' : 'take:oil',
    };
  }

  const p = prep();
  if (p) return p;

  // Tomas: warm him up, then ask him along (he carries the oil and lifts the branch).
  if (!hurry && s.tomas.trust < 2 && tomasReachable && canWinTomas) {
    if (has('tea'))
      return { key: 'tea-give', nudge: 'Someone down by the sea is frozen to the bone.', pointer: 'Take the tea down to the boathouse and give it to Tomas.', room: s.tomas.room, act: 'give:tea:tomas' };
    if (!teaGone && s.at.tea !== 'nowhere')
      return { key: 'tea-take', nudge: 'You made tea. Where did you leave it?', pointer: 'Pick up the kettle of tea and take it to Tomas.', room: whereIs('tea'), act: 'take:tea' };
    if (!teaGone)
      return {
        key: 'tea',
        nudge: 'Whoever is out on a night like this will be frozen. Something hot would go a long way.',
        pointer: 'Make a pot of tea with the kettle on the cottage stove, for Tomas down in the boathouse.',
        room: has('kettle') ? 'cottage' : whereIs('kettle'),
        act: has('kettle') ? 'use:kettle:stove' : whereIs('kettle') === 'cottage' ? 'brew' : 'take:kettle',
      };
    if (!s.tomas.told.includes('ship'))
      return { key: 'tomas-ship', nudge: 'Tomas might care more if he knew who was out there.', pointer: 'Tell Tomas about the ship.', room: s.tomas.room, act: 'say:tomas:ship' };
    if (!s.f.foundAda)
      return { key: 'tomas-ada0', nudge: 'Someone has been calling up the village road.', pointer: 'Go up the village road from the cliff path, then tell Tomas what you found there.', room: 'road' };
    return { key: 'tomas-ada', nudge: 'Tomas owes Ada a great deal.', pointer: 'Tell Tomas that Ada is trapped.', room: s.tomas.room, act: 'say:tomas:ada' };
  }
  if (!hurry && adaPossible && !s.tomas.follows)
    return {
      key: 'tomas-come',
      nudge: 'Some jobs need two strong backs, and the oil can is heavy.',
      pointer: 'Ask Tomas to come with you.',
      room: s.tomas.room,
      act: 'say:tomas:help',
    };

  // The oil, before the tide covers the steps.
  if (lightPossible && !oilDone && !oilCarried && s.at.oil !== 'tomas' && !['yard', 'base', 'lamp'].includes(oilWhere))
    return {
      key: 'oil',
      nudge: 'The lamp’s reservoir is empty. Ada’s logbook says where the full can is.',
      pointer: `Fetch the oil can${from(whereIs('oil'), '')}${s.tomas.follows ? '; with Tomas beside you he’ll carry it' : ''}. The tide covers the shore steps at a quarter past eleven.`,
      room: whereIs('oil'),
      act: 'take:oil',
    };

  // Ada under the pine.
  if (!hurry && adaPossible && s.tomas.follows)
    return {
      key: 'ada',
      nudge: s.f.foundAda ? 'Ada can’t shift that branch alone, and neither can you.' : 'Up the village road, someone has been calling.',
      pointer: 'Go up the village road with Tomas and lift the branch off Ada together.',
      room: 'road',
      act: 'lift',
    };

  if (lightPossible) {
    if (!oilDone && s.at.oil === 'tomas' && !s.tomas.follows)
      return { key: 'oil-tomas', nudge: 'Tomas has the oil can.', pointer: 'Ask Tomas to come with you; he’ll bring the oil.', room: s.tomas.room, act: 'say:tomas:help' };
    if (!s.f.door && !s.f.window) {
      if (has('keys'))
        return { key: 'door', nudge: 'You have Ada’s keys. The big iron one is for a door.', pointer: 'Unlock the lighthouse door in the yard with Ada’s keys.', room: 'yard', act: 'use:keys:door' };
      const stoneOk = has('stone') || (s.at.stone !== 'nowhere' && tripOk(whereIs('stone'), 1, false));
      if (s.at.keys === 'ada' && (s.room === 'road' || !stoneOk))
        return {
          key: 'keys',
          nudge: 'The lighthouse is locked, and Ada keeps her keys on her belt.',
          pointer: 'Go up the village road to Ada and tell her the lamp is out; she’ll give you her keys.',
          room: 'road',
          act: 'say:ada:keys',
        };
      if (s.at.keys === 'ada')
        return has('stone')
          ? { key: 'window', nudge: 'The door is locked and Ada has the key. That window is only old glass.', pointer: 'Smash the lighthouse window with the cobble. (Ada’s keys would open the door, but she’s up the village road.)', room: 'yard', act: 'use:stone:window' }
          : {
              key: 'window',
              nudge: 'The door is locked and Ada has the key, up the village road. Or there’s the window.',
              pointer: `Take the loose cobble${from(whereIs('stone'), s.room)} and smash the window, or fetch Ada’s keys from her up the village road.`,
              room: whereIs('stone'),
              act: 'take:stone',
            };
      return { key: 'keys-take', nudge: 'You put Ada’s keys down somewhere.', pointer: 'Pick up Ada’s keys.', room: whereIs('keys'), act: 'take:keys' };
    }
    if (!oilDone && !oilCarried && s.at.oil !== 'tomas' && ['yard', 'base', 'lamp'].includes(oilWhere))
      return { key: 'oil-up', nudge: 'Don’t climb all those stairs without the oil.', pointer: 'Pick up the oil can and take it up to the lamp room.', room: oilWhere, act: 'take:oil' };
    if (!s.f.wick) {
      if (!s.f.box)
        return has('keys')
          ? { key: 'box', nudge: 'The spare wicks are in the brass box by the lamp. One of Ada’s keys is brass.', pointer: 'Climb to the lamp room and unlock the brass box with Ada’s keys.', room: 'lamp', act: 'use:keys:box' }
          : has('stone')
            ? { key: 'box', nudge: 'The spare wicks are locked in the brass box. A hard knock would do it.', pointer: 'Hammer the brass box open with the cobble.', room: 'lamp', act: 'use:stone:box' }
            : s.at.keys === 'ada'
              ? { key: 'box-keys', nudge: 'The spare wicks are locked in the brass box. Ada has the key on her ring.', pointer: 'Go up the village road and tell Ada the lamp is out; she’ll give you her keys. (A loose cobble from the yard would break the box too.)', room: 'road', act: 'say:ada:keys' }
              : s.at.keys !== 'nowhere' && s.at.keys !== 'inv'
                ? { key: 'box-keys', nudge: 'The brass box wants Ada’s keys. Where did you leave them?', pointer: `Fetch Ada’s keys${from(whereIs('keys'), s.room)} and unlock the brass box.`, room: whereIs('keys'), act: 'take:keys' }
                : { key: 'box-stone', nudge: 'The brass box is locked. A hard knock would open it.', pointer: `Fetch the loose cobble${from(whereIs('stone'), s.room)} and hammer the box open.`, room: whereIs('stone'), act: 'take:stone' };
      if (!has('wick'))
        return { key: 'wick-take', nudge: 'The box is open. Something clean and coiled is inside.', pointer: 'Take the new wick.', room: whereIs('wick'), act: 'take:wick' };
      return { key: 'wick', nudge: 'The burner is empty.', pointer: 'Fit the new wick in the lamp.', room: 'lamp', act: 'use:wick:lamp' };
    }
    if (!oilDone)
      return s.at.oil === 'tomas'
        ? { key: 'pour', nudge: 'Tomas has the oil.', pointer: 'Bring Tomas up to the lamp room and have him fill the lamp.', room: 'lamp', act: 'pour' }
        : has('oil')
          ? { key: 'fill', nudge: 'The reservoir is dry.', pointer: 'Fill the lamp from the oil can.', room: 'lamp', act: 'use:oil:lamp' }
          : { key: 'oil-fetch', nudge: 'The reservoir is dry. Where did you leave the oil?', pointer: `Fetch the oil can${from(oilWhere, s.room)} and fill the lamp.`, room: oilWhere, act: 'take:oil' };
    if (!s.f.lit)
      return s.f.window && !s.f.hatch
        ? { key: 'hatch', nudge: 'Feel that draught coming up the stairs? A flame won’t live in it.', pointer: 'Shut the trapdoor, then light the lamp.', room: 'lamp', act: 'shut:hatch' }
        : { key: 'light', nudge: 'Oil, a wick… all it wants now is a flame.', pointer: 'Light the lamp with the matches.', room: 'lamp', act: 'use:matches:lamp' };
    if (!s.f.wound) return { key: 'wind', nudge: 'The lamp burns, but the beam doesn’t move.', pointer: 'Wind the clockwork so the lens turns.', room: 'lamp', act: 'wind' };
  }
  // The light is done (or can't be); Ada if there's still time.
  if (adaPossible && s.tomas.follows) return { key: 'ada', nudge: 'Ada is still under that pine.', pointer: 'Take Tomas up the village road and lift the branch off Ada.', room: 'road', act: 'lift' };
  if (light)
    return s.room === 'lamp'
      ? { key: 'watch', nudge: 'The beam is turning. You’ve done what you came to do.', pointer: 'Keep watch until midnight.', act: 'watch' }
      : { key: 'watch', nudge: 'The beam is turning. You’ve done what you came to do.', pointer: 'Go up to the lamp room and keep watch until midnight.', room: 'lamp', act: 'watch' };
  if (below(s.room) && !tide)
    return { key: 'climb', nudge: 'Watch the tide on those steps.', pointer: 'Get back up the cliff steps before the tide covers them at a quarter past eleven.', room: 'cliff' };
  return {
    key: 'lost',
    nudge: 'The light can’t be saved tonight.',
    pointer: oilLost
      ? `${tide ? 'The only oil can was left below the tide.' : 'There’s no longer time to bring the only oil can up from the shore before the tide covers the steps.'} Start the night over from the menu and fetch it early.`
      : 'There isn’t much left to do. Start the night over from the menu and try another way.',
  };
}

// ---------------------------------------------------------------- night 2: the fog

export function hint2(s: n2.State): Hint | null {
  if (s.over) return null;
  const ids = new Set(n2.choices(s).map((c) => c.id));
  const step = steps2(s);
  if (!step) return null;
  return resolve(step, s.room, n2.EXITS, (a, b) => !(a === 'yard' && b === 'signal' && !s.f.door), ids);
}

function steps2(s: n2.State): Step | null {
  const has = (i: n2.Item) => n2.has(s, i);
  const B = s.bassett;
  const N = s.nell;
  const whereIs = (i: n2.Item): string => (s.at[i] === 'inv' ? s.room : s.at[i] === 'bassett' ? B.room : s.at[i]);

  // Right by the locked door with the keys in hand.
  if (s.room === 'yard' && !s.f.door && has('keys'))
    return { key: 'unlock', nudge: 'You’re carrying Bassett’s keys.', pointer: 'Unlock the signal house with Bassett’s keys.', act: 'use:keys:door' };
  // While you're in the cottage: things you'll want.
  if (s.room === 'cottage' && !s.f.horn) {
    if (s.f.heatAt < 0 && s.at.matches === 'cottage')
      return { key: 'matches', nudge: 'Whatever you light tonight will need a flame.', pointer: 'Take the matches from the mantelpiece.', act: 'take:matches' };
    if (!N.found && !s.bramble.led)
      return { key: 'lead', nudge: 'Bramble came home without Nell. A dog’s nose doesn’t need to see.', pointer: 'Take Bramble on her lead. She’ll lead you to Nell, even in thick fog.', act: 'lead' };
    if (B.trust < 2 && !B.told.includes('log') && s.at.logbook === 'cottage')
      return { key: 'logbook', nudge: 'Ada left something on the table for her relief.', pointer: 'Take Ada’s logbook. Bassett trusts things written down.', act: 'take:logbook' };
  }

  /** The next thing that would win Bassett over, or null when nothing is left to try. */
  const bassettStep = (): Step | null => {
    if (B.trust >= 2) return null;
    if (s.f.forced && !B.told.includes('hasp'))
      return { key: 'hasp', nudge: 'Bassett heard that padlock go. He hates being lied to more than broken rules.', pointer: 'Own up to Bassett about the hasp.', room: B.room, act: 'say:bassett:hasp' };
    if (!B.told.includes('log') && s.at.logbook !== 'nowhere')
      return has('logbook')
        ? { key: 'show-log', nudge: 'Bassett says the receiver is cracked. Ada wrote something about that.', pointer: 'Show Bassett Ada’s logbook.', room: B.room, act: 'show:logbook:bassett' }
        : { key: 'take-log', nudge: 'Bassett won’t take your word for it. Would he take Ada’s, in writing?', pointer: `Fetch Ada’s logbook${from(whereIs('logbook'), s.room)} and show it to Bassett.`, room: whereIs('logbook'), act: 'take:logbook' };
    if (!B.told.includes('nell'))
      return { key: 'tell-nell', nudge: 'Bassett has a family of his own. Does he know about Nell?', pointer: 'Tell Bassett about Nell.', room: B.room, act: 'say:bassett:nell' };
    if (!B.told.includes('flask')) {
      if (has('flask')) return { key: 'give-flask', nudge: 'Bassett has been up since six.', pointer: 'Give Bassett the flask of cocoa.', room: B.room, act: 'give:flask:bassett' };
      if (!s.f.brewed) return { key: 'brew', nudge: 'Bassett has been up since six, and the cottage stove is warm.', pointer: 'Make a flask of cocoa in the cottage and give it to Bassett.', room: 'cottage', act: 'brew' };
    }
    return null;
  };

  if (!s.f.horn) {
    // The blowlamp, filled.
    if (s.f.heatAt < 0) {
      if (s.at.blowlamp !== 'inv')
        return { key: 'blowlamp', nudge: 'Ada’s note says the engine’s bulb wants heating first. With what?', pointer: 'Take the blowlamp from the oil store.', room: whereIs('blowlamp'), act: 'take:blowlamp' };
      if (!s.f.fuel) return { key: 'fuel', nudge: 'The blowlamp feels light. Empty.', pointer: 'Fill the blowlamp from the paraffin drum in the oil store.', room: 'store', act: 'use:blowlamp:drum' };
    }
    // The signal-house door.
    if (!s.f.door) {
      if (has('keys')) return { key: 'unlock', nudge: 'You’re carrying Bassett’s keys.', pointer: 'Unlock the signal house in the yard with Bassett’s keys.', room: 'yard', act: 'use:keys:door' };
      if (s.at.keys !== 'bassett') return { key: 'keys-take', nudge: 'You put Bassett’s keys down somewhere.', pointer: 'Pick up Bassett’s keys.', room: whereIs('keys'), act: 'take:keys' };
      if (B.trust >= 2 && !B.agreed)
        return { key: 'ask', nudge: 'Bassett has heard enough. Ask him now.', pointer: 'Ask Bassett about the fog signal. He’ll hand over his keys.', room: B.room, act: 'say:bassett:signal' };
      const b = bassettStep();
      if (b) return b;
      return has('crowbar')
        ? { key: 'force', nudge: 'Bassett won’t budge. The hasp on that door is old and rusty.', pointer: 'Force the hasp with the crowbar (Bassett will hear).', room: 'yard', act: 'use:crowbar:door' }
        : { key: 'crowbar', nudge: 'Bassett won’t budge. The hasp on that door is old and rusty.', pointer: 'Take the crowbar from the oil store; it will have the hasp off.', room: whereIs('crowbar'), act: 'take:crowbar' };
    }
    // Heat the bulb.
    if (s.f.heatAt < 0) {
      if (!has('matches'))
        return { key: 'matches', nudge: 'The blowlamp wants a flame.', pointer: `Fetch the matches${from(whereIs('matches'), s.room)}.`, room: whereIs('matches'), act: 'take:matches' };
      return { key: 'heat', nudge: 'The engine’s bulb has to be hot before it will fire, and that takes a quarter of an hour.', pointer: 'Light the blowlamp under the engine’s bulb in the signal house.', room: 'signal', act: 'use:blowlamp:bulb' };
    }
  }

  // Nell, while the bulb heats.
  const nellIn = N.home || (N.found && !N.follows && n2.INDOORS.has(N.room));
  if (!nellIn) {
    if (!N.found) {
      const fogShut = n2.blind(s) && !s.f.horn;
      if ((fogShut || !s.bramble.led) && !s.bramble.follows)
        return {
          key: 'bramble',
          nudge: fogShut ? 'You can’t see the path. Who knows it without seeing?' : 'Bramble knows exactly where Nell went.',
          pointer: 'Fetch Bramble and take her on the lead: she’ll lead you to Nell on the Point, fog or no fog.',
          room: s.bramble.room,
          act: 'lead',
        };
      return { key: 'find', nudge: 'Nell’s note said where she was going. Small boot prints lead across the moor.', pointer: 'Cross Carn Moor to the Point and find Nell.', room: 'point' };
    }
    if (!N.follows) {
      const at = N.room;
      if (N.trust < 2) {
        if (!N.told.includes('cross'))
          return { key: 'cross', nudge: 'Nell is frightened she’s in trouble.', pointer: 'Tell Nell nobody’s cross.', room: at, act: 'say:nell:cross' };
        for (const i of ['lantern', 'quilt', 'flask'] as const)
          if (has(i)) return { key: `give-${i}`, nudge: 'Nell is cold, and you have something of hers, or something warm.', pointer: `Give Nell ${n2.the(i)}.`, room: at, act: `give:${i}:nell` };
        if (!N.told.includes('bramble'))
          return { key: 'bramble-nell', nudge: '“I lost Bramble,” she said.', pointer: 'Bring Bramble to Nell on her lead.', room: s.bramble.follows ? at : s.bramble.room, act: s.bramble.follows ? undefined : 'lead' };
        if (s.at.lantern === 'moor') return { key: 'lantern', nudge: 'Nell dropped something on the moor.', pointer: 'Pick up the little lantern on the moor and give it back to Nell.', room: 'moor', act: 'take:lantern' };
        if (s.at.quilt === 'house') return { key: 'quilt', nudge: 'Nell is shivering. Her bed at home has a warm quilt.', pointer: 'Fetch Nell’s quilt from the doctor’s house and wrap her in it.', room: 'house', act: 'take:quilt' };
      }
      if (!N.ready && !s.f.horn)
        return { key: 'promise', nudge: 'Nell won’t leave until there’s something for her mam’s boat.', pointer: 'Promise Nell the foghorn will sound.', room: at, act: 'say:nell:horn' };
      return { key: 'come', nudge: 'Nell is ready to go somewhere warm.', pointer: 'Ask Nell to come home.', room: at, act: 'say:nell:come' };
    }
    if (n2.INDOORS.has(s.room) && s.room !== 'cottage' && s.room !== 'house')
      return { key: 'stay', nudge: 'It’s warm enough in here for Nell.', pointer: 'Ask Nell to wait here, or take her on to the cottage.', act: 'say:nell:stay' };
    return {
      key: 'warm',
      nudge: 'Nell is shaking with cold.',
      pointer: 'Take Nell somewhere warm. The cottage stove is on your way back to the engine (her own bed at the doctor’s house works too, but the walk back from there is blind).',
      room: 'cottage',
    };
  }

  if (!s.f.horn) {
    // The engine.
    if (!s.f.running) {
      if (!n2.hot(s)) return { key: 'heating', nudge: 'The bulb isn’t hot yet. Swing her now and she’ll only cough.', pointer: 'Wait in the signal house for the bulb to heat.', room: 'signal', act: 'wait:bulb' };
      if (B.room === 'signal' || (B.follows && B.room === s.room))
        return { key: 'swing', nudge: 'The bulb is cherry red. The flywheel is a two-man swing.', pointer: 'Swing the flywheel with Bassett.', room: 'signal', act: 'swing' };
      if (B.agreed)
        return { key: 'fetch-bassett', nudge: 'The flywheel is a two-man swing, and Bassett said he’d help.', pointer: 'Ask Bassett to come and swing the flywheel.', room: B.room, act: 'say:bassett:come' };
      return has('crowbar')
        ? { key: 'lever', nudge: 'The flywheel is a two-man swing. On your own you need leverage.', pointer: 'Lever the flywheel round with the crowbar.', room: 'signal', act: 'use:crowbar:flywheel' }
        : { key: 'lever-bar', nudge: 'The flywheel is a two-man swing. Ada’s note says what to do alone.', pointer: 'Take the crowbar from the oil store and lever the flywheel round with it.', room: whereIs('crowbar'), act: 'take:crowbar' };
    }
    return { key: 'valve', nudge: 'The engine is running, but the horn is silent.', pointer: 'Open the air valve.', room: 'signal', act: 'open:valve' };
  }

  // The horn is sounding: Bassett, if he's still sore, then wait indoors.
  const b = bassettStep();
  if (b) return b;
  return {
    key: 'wait',
    nudge: 'The horn is calling and the Merrow’s bell is answering. You’ve done what you can.',
    pointer: n2.INDOORS.has(s.room) ? 'Wait for the Merrow.' : 'Go indoors and wait for the Merrow.',
    room: n2.INDOORS.has(s.room) ? undefined : ['cottage', 'signal', 'tower', 'store', 'house'],
    act: 'wait',
  };
}
