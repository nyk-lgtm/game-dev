// Everything the invented language can talk about. Each concept is one
// morpheme, written with one glyph (or, for grammar, a mark or particle).

export type Category = 'name' | 'person' | 'animal' | 'thing' | 'nature' | 'place' | 'action' | 'quality' | 'grammar';

export interface Concept {
  id: string;
  /** Plain English gloss, shown in the notebook's meaning picker. */
  en: string;
  cat: Category;
}

const c = (id: string, en: string, cat: Category): Concept => ({ id, en, cat });

export const CONCEPTS: Concept[] = [
  // Three villagers with names (drawn as distinct characters).
  c('ama', 'the woman in red', 'name'),
  c('tor', 'the boy in the cap', 'name'),
  c('sef', 'the fisher in the yellow hat', 'name'),
  // People
  c('person', 'person', 'person'),
  c('child', 'child', 'person'),
  c('elder', 'elder', 'person'),
  // Animals
  c('fish', 'fish', 'animal'),
  c('bird', 'bird', 'animal'),
  c('dog', 'dog', 'animal'),
  c('goat', 'goat', 'animal'),
  // Things
  c('bread', 'bread', 'thing'),
  c('basket', 'basket', 'thing'),
  c('boat', 'boat', 'thing'),
  c('fire', 'fire', 'thing'),
  c('lamp', 'lamp', 'thing'),
  c('stone', 'stone', 'thing'),
  // Nature
  c('sun', 'sun', 'nature'),
  c('moon', 'moon', 'nature'),
  c('rain', 'rain', 'nature'),
  c('tree', 'tree', 'nature'),
  c('river', 'river', 'nature'),
  // Places
  c('house', 'house', 'place'),
  c('mountain', 'mountain', 'place'),
  c('market', 'market', 'place'),
  // Actions
  c('see', 'see', 'action'),
  c('eat', 'eat', 'action'),
  c('give', 'give', 'action'),
  c('take', 'take', 'action'),
  c('carry', 'carry', 'action'),
  c('go', 'go', 'action'),
  c('sleep', 'sleep', 'action'),
  c('make', 'make', 'action'),
  c('fear', 'fear', 'action'),
  c('find', 'find', 'action'),
  c('break', 'break', 'action'),
  // Qualities
  c('big', 'big', 'quality'),
  c('small', 'small', 'quality'),
  c('old', 'old', 'quality'),
  c('new', 'new', 'quality'),
  c('dark', 'dark', 'quality'),
  // Grammar
  c('PL', 'many (plural)', 'grammar'),
  c('NEG', 'not', 'grammar'),
  c('PAST', 'before (past)', 'grammar'),
  c('FUT', 'later (future)', 'grammar'),
  c('Q', 'question', 'grammar'),
  c('TO', 'to / toward', 'grammar'),
];

/** Grammar only the second village's language has: case particles and verb agreement.
 *  Kept out of CONCEPTS so the first village's language (built by walking CONCEPTS) never changes. */
export const GRAMMAR2: Concept[] = [
  c('SUBJ', 'the doer (who acts)', 'grammar'),
  c('OBJ', 'the one it is done to', 'grammar'),
  c('PLV', 'many are doing it (on the action)', 'grammar'),
];
/** Every concept either village can write. */
export const ALL_CONCEPTS: Concept[] = [...CONCEPTS, ...GRAMMAR2];

export const CONCEPT = new Map(ALL_CONCEPTS.map((x) => [x.id, x]));
export const ids = (cat: Category) => CONCEPTS.filter((x) => x.cat === cat).map((x) => x.id);

export const NOUN_CATS: Category[] = ['name', 'person', 'animal', 'thing', 'nature', 'place'];
export const isNoun = (id: string) => NOUN_CATS.includes(CONCEPT.get(id)!.cat);

/** What can do each action (as subject) and receive it (as object). */
export interface VerbFrame {
  subj: Category[];
  obj: Category[] | null;
  /** Takes a destination with TO (go, carry, give). */
  dest?: Category[];
}

export const AGENTS: Category[] = ['name', 'person'];
export const VERBS: Record<string, VerbFrame> = {
  see: { subj: ['name', 'person', 'animal'], obj: ['name', 'person', 'animal', 'thing', 'nature', 'place'] },
  eat: { subj: ['name', 'person', 'animal'], obj: ['thing', 'animal'] },
  give: { subj: AGENTS, obj: ['thing', 'animal'], dest: ['name', 'person'] },
  take: { subj: ['name', 'person', 'animal'], obj: ['thing', 'animal'] },
  carry: { subj: AGENTS, obj: ['thing', 'animal'], dest: ['place'] },
  go: { subj: ['name', 'person', 'animal'], obj: null, dest: ['place'] },
  sleep: { subj: ['name', 'person', 'animal'], obj: null },
  make: { subj: AGENTS, obj: ['thing'] },
  fear: { subj: ['name', 'person', 'animal'], obj: ['animal', 'nature', 'thing'] },
  find: { subj: ['name', 'person', 'animal'], obj: ['thing', 'animal'] },
  break: { subj: ['name', 'person', 'nature'], obj: ['thing', 'place'] },
};

/** Which things can be eaten, carried, etc. (keeps scenes sensible). */
export const EDIBLE = new Set(['fish', 'bread']);
export const PORTABLE = new Set(['fish', 'bread', 'basket', 'lamp', 'stone', 'fire', 'goat', 'dog', 'bird']);
export const MAKEABLE = new Set(['bread', 'basket', 'boat', 'fire', 'lamp']);
export const BREAKABLE = new Set(['basket', 'boat', 'lamp', 'stone', 'house']);
/** Nouns that make sense in the plural. */
export const COUNTABLE = new Set(['person', 'child', 'elder', 'fish', 'bird', 'dog', 'goat', 'bread', 'basket', 'boat', 'fire', 'lamp', 'stone', 'tree', 'house']);
/** Nature that can act: the weather and the river, not the sky. */
export const FORCES = new Set(['rain', 'river']);
