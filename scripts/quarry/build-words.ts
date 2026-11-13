// One-off generator for Quarry's dictionary: `npx vite-node scripts/quarry/build-words.ts`
// writes src/quarry/core/words.ts. Run it again only to change the word list.
//
// Source: SCOWL (Kevin Atkinson, permissive SCOWL licence: use, copy, modify and
// distribute with the copyright notice) via the npm package `wordlist-english`
// (MIT). We take the English, American and British lists at sizes 10-50 (the
// common-to-ordinary words; 55+ is where the rare and odd ones live), keep 3-8
// letters a-z with a vowel, and drop offensive words: the `badwords-list` (MIT)
// and `naughty-words` (CC-BY-4.0, en) lists plus a few slurs they miss, with
// their plain inflections. A handful of everyday words those lists flag
// (pawn, escort, balls…) stay in.
//
// Packing: sorted and front-coded. Each word starts with one character giving
// how many letters it shares with the previous word: '0'-'7' for a common word
// (SCOWL size ≤ 35), 'A'-'H' for an ordinary one (40-50). Bots use only the
// common words; players may use all of them.

import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const COMMON_LEVELS = [10, 20, 35];
const EXTRA_LEVELS = [40, 50];
const DIALECTS = ['english', 'american', 'british'];

const ok = (w: string) => /^[a-z]{3,8}$/.test(w) && /[aeiouy]/.test(w);
const load = (levels: number[]) => {
  const s = new Set<string>();
  for (const n of levels) for (const d of DIALECTS) for (const w of require(`wordlist-english/${d}-words-${n}.json`) as string[]) if (ok(w)) s.add(w);
  return s;
};

// Everyday words the profanity lists flag; they stay playable.
const ALLOW = new Set(
  `pawn escort cox flange knob snatch suck sucks poop bloody dogging playboy swinger bum bums butt butts willies scat hell god gods
   damn lust lusting nude nudity bestial bondage grope kinky eunuch fecal voyeur topless crap balls screwing breasts muff
   bareback prick pricks sex sexual sexually rectum anus nipple nipples sadism sadist`.split(/\s+/),
);
// Slurs and vulgar words the lists miss, spelled out with their inflections
// (no automatic suffixing: short roots would catch "spices" or "assess").
const EXTRA_BLOCK = `kike kikes spic spics wop wops gook gooks dago dagos dagoes honky honkies tranny trannies paki pakis
  jap japs kraut krauts gyp gyps gypped gypping squaw squaws redskin redskins darkie darkies darky coolie coolies
  pikey pikeys yid yids wog wogs towelhead beaner beaners spaz spazz spazzes retard retards retarded homo homos lesbo
  lesbos dyke dykes twat twats bollocks dildo dildos jizz felch cum cums wank wanks wanked wanking wanker wankers
  slut sluts slutty bitch bitches bitchy bitchier bitched bitching whore whores whored whoring negro negros negroes
  queer queers pimp pimps pimped pimping shag shags shagged shagging hooker hookers tit tits titty titties cock cocks
  boob boobs booby boobies arse arses arsehole bugger buggers buggered buggering buggery smut smutty horny hornier
  horniest erotic erotica rape raped rapes raping rapist rapists pervert perverts perv pervs nazi nazis sodomite
  sodomites sodomy incest spunk orgy orgies orgasm orgasms penis penises vagina vaginas clitoris scrotum semen
  testicle testicles genital genitals labia vulva porn porno pornos crotch faggots shittier sexpot sexpots douche
  douches douched douching queered queerer queerest queering queerly sluttish gypsy gypsies boobed boobing dicks hos
  midget midgets hooters bastards niggard niggards`
  .split(/\s+/)
  .filter(Boolean);

const BLOCK = new Set(
  [...(require('badwords-list').array as string[]), ...(require('naughty-words/en.json') as string[]), ...EXTRA_BLOCK]
    .map((s) => s.toLowerCase())
    .filter((s) => /^[a-z]+$/.test(s) && !ALLOW.has(s)),
);

// Everyday informal words SCOWL leaves out at these sizes (players try them; a playtest missed POOF).
// ("poof" stays out: it doubles as a slur.)
const INFORMAL = `yay yikes phew nah bam oof eek whee ooh aww ciao oomph ick eww boing ribbit cuppa telly wifi
  app hiya vlog yeah yep yup nope okay oops meh duh comfy yummy zap zing`.split(/\s+/).filter(Boolean);
// Irregular past participles SCOWL ranks too rare (a playtest missed MOWN); the rest (sewn, sown, strewn,
// swollen, trodden…) are already in at these sizes.
const PARTICIPLES = `mown hewn shorn sawn`.split(/\s+/).filter(Boolean);
const common = load(COMMON_LEVELS);
for (const w of [...INFORMAL, ...PARTICIPLES]) if (ok(w)) common.add(w);
const extra = load(EXTRA_LEVELS);
const dropped: string[] = [];
const words = [...new Set([...common, ...extra])]
  .filter((w) => {
    if (BLOCK.has(w)) dropped.push(w);
    return !BLOCK.has(w);
  })
  .sort();

let prev = '';
let packed = '';
let nCommon = 0;
for (const w of words) {
  let k = 0;
  while (k < prev.length && k < w.length && k < 7 && prev[k] === w[k]) k++;
  const isCommon = common.has(w);
  if (isCommon) nCommon++;
  packed += (isCommon ? String(k) : String.fromCharCode(65 + k)) + w.slice(k);
  prev = w;
}

const out = `// Generated by scripts/quarry/build-words.ts; do not edit by hand.
// ${words.length} words (${nCommon} common), 3-8 letters, from SCOWL sizes 10-50
// (Copyright 2000-2016 Kevin Atkinson; permission to use, copy, modify, distribute
// and sell is granted provided this notice appears) via the npm package
// wordlist-english (MIT), with offensive words removed.
// Front-coded: a digit 0-7 (common word) or letter A-H (ordinary word) gives the
// letters shared with the previous word, then the rest of the word.
export const PACKED = '${packed}';
`;
writeFileSync(resolve(import.meta.dirname ?? __dirname, '../../src/quarry/core/words.ts'), out);
console.log(`${words.length} words (${nCommon} common), ${packed.length} chars; dropped ${dropped.length}: ${dropped.join(' ')}`);
