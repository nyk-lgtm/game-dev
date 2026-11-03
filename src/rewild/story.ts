// Words for what the island did: the season report card, its one-line
// summary in the panel, and short reasons for the cell forecast.

import { PLANTS, SEASON_NAMES, SPECIES, isPlant, seasonOf, yearOf, type Cause, type SeasonReport, type SpeciesId, type Tally } from './core';

export const lower = (id: SpeciesId) => SPECIES[id].name.toLowerCase();

/** Animals and some plants have plural names ("rabbits", "reeds", "fungi"). */
export const plural = (id: SpeciesId) => !isPlant(id) || id === 'reeds' || id === 'flowers' || id === 'fungi';
/** The species name with a verb agreeing with it: say('oak', 'grows', 'grow'). */
export const say = (id: SpeciesId, one: string, many: string) => `${lower(id)} ${plural(id) ? many : one}`;

/** What happens to a population next season, with the reason: "rabbits starve: not enough food in reach". */
export function fate(id: SpeciesId, why: Cause | undefined, by: SpeciesId | undefined, dies: boolean): string {
  switch (why) {
    case 'hunted':
      return `${say(id, 'is', 'are')} hunted by ${by ? lower(by) : 'predators'}`;
    case 'starved':
      return `${say(id, 'starves', 'starve')}: not enough food in reach`;
    case 'hungry':
      return `${say(id, 'goes', 'go')} hungry and shrink${plural(id) ? '' : 's'}`;
    case 'no home':
      return `${say(id, "can't", "can't")} live on this ground`;
    case 'too dry':
      return `${say(id, dies ? 'dries out' : 'shrinks', dies ? 'dry out' : 'shrink')}: too dry${isPlant(id) ? ` (needs moisture ${PLANTS[id].minWet})` : ''}`;
    case 'unsuited':
      return `${say(id, dies ? 'withers' : 'shrinks', dies ? 'wither' : 'shrink')}: ${id === 'fungi' ? 'no oak or shrub beside them' : 'the ground no longer suits it'}`;
    case 'burnt':
      return `${say(id, 'burns', 'burn')}`;
    case 'flooded':
      return `${say(id, 'is', 'are')} flooded by a beaver dam`;
    default:
      return dies ? say(id, 'dies', 'die') : say(id, 'shrinks', 'shrink');
  }
}

/** Present tense, for forecasts ("rabbits starve"). */
export function causeNow(why: Cause | undefined, id: SpeciesId, by?: SpeciesId): string {
  switch (why) {
    case 'hunted':
      return by ? `hunted by ${lower(by)}` : 'hunted';
    case 'starved':
      return 'starve: not enough food in reach';
    case 'hungry':
      return 'go hungry';
    case 'no home':
      return `can't live on this ground`;
    case 'too dry':
      return isPlant(id) ? `too dry (needs moisture ${PLANTS[id].minWet})` : 'too dry';
    case 'unsuited':
      return isPlant(id) && id === 'fungi' ? 'need an oak or shrub next to them' : 'the ground no longer suits it';
    case 'burnt':
      return 'burn';
    case 'flooded':
      return 'flooded by a beaver dam';
    default:
      return '';
  }
}

/** Past tense, for the report ("starved"). */
function causePast(t: Tally): string {
  switch (t.why) {
    case 'hunted':
      return t.by ? `hunted by ${lower(t.by)}` : 'hunted';
    case 'starved':
      return 'starved (not enough food in reach)';
    case 'hungry':
      return 'went hungry and shrank';
    case 'no home':
      return 'had nowhere to live';
    case 'too dry':
      return 'dried out';
    case 'unsuited':
      return t.id === 'fungi' ? 'withered with no oak or shrub beside them' : 'withered: the ground no longer suits it';
    case 'burnt':
      return 'burnt in the wildfire';
    case 'flooded':
      return 'flooded by a beaver dam';
    default:
      return t.id === 'lichen' ? 'all crumbled into soil' : 'gone';
  }
}

const times = (n: number) => (n > 1 ? ` ×${n}` : '');
const name = (id: SpeciesId) => `<b>${SPECIES[id].name}</b>`;

function landParts(r: SeasonReport): string[] {
  const out: string[] = [];
  const L = r.land;
  if (L.soil) out.push(`${L.soil} new soil`);
  if (L.marsh) out.push(`${L.marsh} new marsh`);
  if (L.ponds) out.push(`${L.ponds} new pond${L.ponds > 1 ? 's' : ''}`);
  if (L.richer) out.push(`${L.richer} richer soil`);
  if (L.burnt) out.push(`<span class="warn">${L.burnt} burnt</span>`);
  return out;
}

function growthParts(r: SeasonReport): string[] {
  const ids = new Map<SpeciesId, number>();
  for (const t of [...r.spread, ...r.born]) ids.set(t.id, (ids.get(t.id) ?? 0) + t.n);
  return [...ids].sort((a, b) => b[1] - a[1]).map(([id, n]) => `${lower(id)} +${n}`);
}

function lossParts(r: SeasonReport): string[] {
  const lost = new Set(r.lost.map((t) => t.id));
  const out: string[] = [];
  for (const t of r.died) if (!lost.has(t.id)) out.push(`${lower(t.id)} ${t.why === 'hunted' ? 'hunted' : causePast(t).replace(/ \(.*\)$/, '').replace(/: .*/, '')}${times(t.n)}`);
  for (const t of r.shrank) if (t.why !== 'hunted' || !r.died.some((d) => d.id === t.id)) out.push(`${lower(t.id)} ${t.why === 'hunted' ? 'hunted' : t.why === 'hungry' ? 'hungry' : causePast(t).replace(/: .*/, '')}${times(t.n)}`);
  return out;
}

/** Up to `max` short lines for the panel, most important first. */
export function summaryLines(r: SeasonReport, risk: SeasonReport | null, max: number): string[] {
  const lines: string[] = [];
  for (const t of r.lost) lines.push(`<span class="warn">✖ ${SPECIES[t.id].name} died out</span> — ${causePast(t)}`);
  for (const g of r.goals) lines.push(`<span class="gold">★ ${g}</span>`);
  const grow = growthParts(r);
  if (grow.length) lines.push(`<span class="good">▲</span> ${grow.join(', ')}`);
  const loss = lossParts(r);
  if (loss.length) lines.push(`<span class="warn">▼</span> ${loss.join(', ')}`);
  const land = landParts(r);
  if (land.length) lines.push(`<span class="land">◆</span> ${land.join(', ')}`);
  const doom = risk ? risk.lost : [];
  const dying = doom.filter((t) => t.why);
  if (dying.length) lines.push(`<span class="warn">⚠ Next season</span> ${dying.map((t) => lower(t.id)).join(', ')} will die out`);
  else if (doom.length) lines.push(`Next season the last ${doom.map((t) => lower(t.id)).join(', ')} ${doom[0].id === 'lichen' ? 'crumbles into soil' : 'will be gone'}`);
  if (!lines.length) lines.push('A quiet season.');
  return lines.slice(0, max);
}

function tallyList(list: Tally[], verb: (t: Tally) => string): string {
  return list.map((t) => `<li>${name(t.id)}${times(t.n)} ${verb(t)}</li>`).join('');
}

/** The full season report card. `risk` is what next season does if nothing is played. */
export function reportHtml(r: SeasonReport, risk: SeasonReport | null): string {
  const out: string[] = [];
  const d = r.delta > 0 ? `+${r.delta}` : r.delta < 0 ? `${r.delta}` : '±0';
  out.push(`<h2>${SEASON_NAMES[seasonOf(r.season)]}, year ${yearOf(r.season)}</h2>`);
  out.push(`<p><b style="color:var(--gold)">+${r.points} points</b> · ${r.species} species (${d})</p>`);
  if (r.goals.length) out.push(`<p>${r.goals.map((g) => `<b style="color:var(--gold)">★ Goal reached:</b> ${g}`).join('<br>')}</p>`);
  if (r.lost.length) out.push(`<h3 class="warn">Died out</h3><ul>${r.lost.map((t) => `<li>${name(t.id)} ${causePast(t)}. Every species alive scores each season; its card can turn up again.</li>`).join('')}</ul>`);
  const grew: string[] = [];
  for (const t of r.spread) grew.push(`<li>${name(t.id)} ${isPlant(t.id) ? 'spread to' : 'sent young to'} ${t.n} new cell${t.n > 1 ? 's' : ''}</li>`);
  for (const t of r.born) grew.push(`<li>${name(t.id)} had young${t.n > 1 ? ` on ${t.n} cells` : ''}</li>`);
  if (grew.length) out.push(`<h3 class="good">Growth</h3><ul>${grew.join('')}</ul>`);
  const losses =
    tallyList(
      r.died.filter((t) => !r.lost.some((l) => l.id === t.id && l.why === t.why)),
      (t) => `— ${causePast(t)}`,
    ) +
    tallyList(r.shrank, (t) => `— ${t.why === 'hunted' ? `thinned out, ${causePast(t)}` : t.why === 'hungry' ? 'went hungry and shrank' : `shrank: ${causePast(t)}`}`);
  if (losses) out.push(`<h3 class="warn">Losses</h3><ul>${losses}</ul>`);
  if (r.moved.length) out.push(`<h3>On the move</h3><ul>${tallyList(r.moved, () => 'moved to find food or safety')}</ul>`);
  const land = landParts(r);
  if (land.length) out.push(`<h3>The land</h3><p>${land.join(' · ')}</p>`);
  if (risk) {
    const warn: string[] = [];
    for (const t of risk.lost) warn.push(t.why ? `<li>${name(t.id)} will die out — ${causeNow(t.why, t.id, t.by)}</li>` : `<li>The last ${name(t.id)} ${t.id === 'lichen' ? 'crumbles into soil' : 'will be gone'}</li>`);
    const lost = new Set(risk.lost.map((t) => t.id));
    const hurt = new Map<SpeciesId, Tally>();
    for (const t of [...risk.died, ...risk.shrank]) if (!lost.has(t.id) && !hurt.has(t.id) && !isPlant(t.id)) hurt.set(t.id, t);
    for (const t of hurt.values()) warn.push(`<li>${name(t.id)} ${causeNow(t.why, t.id, t.by) || 'struggle'}</li>`);
    out.push(
      `<h3>Next season, if you play nothing</h3>` +
        (warn.length ? `<ul>${warn.join('')}</ul><p>Tap a cell to see food and what will happen there.</p>` : '<p>No animals are in trouble.</p>'),
    );
  }
  return out.join('');
}
