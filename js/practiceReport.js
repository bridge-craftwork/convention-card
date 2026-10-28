// Ways to practise a card alone (DESIGN.md, "Solo practice"): for each
// convention the card plays, which deal collections have deals for it
// (Baker Bridge lessons, PBS scenarios: each collection tags its deals with
// skill IDs) and whether a bidding bot plays it (botReport.js). One tile
// per convention, as Rusty's status page shows the system.

import { CONVENTIONS, levelBand } from './spec.js'
import { botReport } from './botReport.js'
import { playsConvention } from './recogniseConventions.js'
import { cardValues } from './checkCard.js'

/**
 * The card's conventions and what practises each. `coverage` is the bot's
 * answer for the card (botReport.js), or null with no bot. `sources` are the
 * deal collections: `[{ id, name, skills: { skillId: [{ name, href? }] } }]`.
 * Returns `{ bot, sources, tiles }`: `bot` is botReport's summary (`read`,
 * `total`, `score`, `other`) or null; each tile is botReport's (`id`, `name`,
 * `convention`, `level`, `band`, `fields`), with `bot` its bot status
 * ('plays' | 'partial' | 'gap' | 'listed', null with no bot) and `practice`,
 * `{ sourceId: [{ name, href? }] }`, the deals each collection has for it.
 * Settings of no one convention (tiles `section:…`) come only from the bot.
 */
export function practiceReport(card_data, { coverage = null, sources = [] } = {}) {
  const bot = coverage ? botReport(card_data, coverage) : null
  const tiles = new Map((bot?.tiles || []).map(t => [t.id, { ...t, bot: t.status }]))
  const values = cardValues(card_data)
  for (const [id, c] of Object.entries(CONVENTIONS)) {
    if (tiles.has(id) || !playsConvention(card_data, id, values)) continue
    tiles.set(id, { id, name: c.name || id, convention: true, level: c.level ?? null, band: levelBand(c.level)?.name || 'other', fields: [], bot: null })
  }
  for (const t of tiles.values()) {
    delete t.status
    t.practice = Object.fromEntries(sources.map(s => [s.id, (t.convention && s.skills?.[t.id]) || []]))
  }
  const sorted = [...tiles.values()].sort((a, b) =>
    (a.convention === b.convention ? 0 : a.convention ? -1 : 1)
    || (a.level ?? 99) - (b.level ?? 99)
    || ways(a) - ways(b)
    || a.name.localeCompare(b.name))
  return {
    bot: bot && { read: bot.read, total: bot.total, score: bot.score, other: bot.other },
    sources: sources.map(({ id, name }) => ({ id, name })),
    tiles: sorted,
  }
}

/** How many ways there are to practise tile `t`: collections with deals, and the bot if it plays it. */
export function ways(t) {
  return Object.values(t.practice || {}).filter(d => d.length).length + (t.bot === 'plays' ? 1 : 0)
}
