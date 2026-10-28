// What a bidding bot plays of a card (DESIGN.md, "Playing a card with a
// bot"), as Rusty's status page shows the system: one tile per convention.
// The bot says which of the card's settings its rules read (Rusty's WASM
// `coverage`: `read` and `ignored`, the bidding settings the card switches
// on); this groups them by the convention each belongs to, so a person sees
// "Bergen raises: plays it" rather than a list of paths. Conventions the
// card lists only by name (`other_agreements`) have no setting to read.
// What the bot reads is not what it plays: it may play Stayman and ignore
// "Stayman is forcing". When the bot also says which conventions it
// implements (`skills`: Rusty's `conventions` modules name theirs), a
// convention it implements counts as played, whatever it ignores of it.

import { FIELDS, CONVENTIONS, levelBand } from './spec.js'

const tail = s => s.slice(s.lastIndexOf('/') + 1)
const humanise = s => s.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase())

/**
 * The bot's coverage of `card_data` by convention. `coverage` is the bot's
 * answer for this card: `{ read: [path], ignored: [path], other?: [path],
 * skills?: [skillId] }`, `skills` the conventions it implements.
 * Returns `{ read, total, score, other, tiles }`: `read` of `total` bidding
 * settings, `other` the cardplay and notes the bot leaves to people, and
 * `tiles`, one per convention (or, for settings of no convention, per card
 * section), by level, then the most needing attention, then name:
 * `{ id, name, convention, level, band, status, fields: [{ path, label, read }] }`.
 * `status` is 'plays' (every setting read), 'partial', 'gap' (none read)
 * or 'listed' (named in other agreements, nothing to read). With `skills`,
 * a tile also has `module` (whether the bot implements the convention): one
 * it implements is 'plays', or 'partial' if it ignores some settings of it,
 * and one it doesn't is never 'plays'.
 */
export function botReport(card_data, coverage) {
  const read = new Set(coverage?.read || [])
  const implemented = coverage?.skills ? new Set(coverage.skills) : null
  const paths = [...read, ...(coverage?.ignored || [])]
  const tiles = new Map()
  const tile = (id, convention) => {
    if (!tiles.has(id)) {
      const c = convention ? CONVENTIONS[id] : null
      const level = c?.level ?? null
      tiles.set(id, {
        id,
        name: c?.name || (convention ? humanise(tail(id)) : `Other ${humanise(id.slice(id.indexOf(':') + 1))} settings`),
        convention,
        level,
        band: levelBand(level)?.name || 'other',
        status: null,
        fields: [],
      })
    }
    return tiles.get(id)
  }
  for (const path of paths) {
    const def = FIELDS[path]
    const skill = [def?.skill || []].flat()[0]
    const t = skill ? tile(skill, true) : tile(`section:${path.slice(0, path.indexOf('.'))}`, false)
    t.fields.push({ path, label: def?.label || path, read: read.has(path) })
  }
  for (const a of Array.isArray(card_data?.other_agreements) ? card_data.other_agreements : []) {
    if (typeof a?.id !== 'string' || !CONVENTIONS[a.id] || tiles.has(a.id)) continue
    tile(a.id, true).status = 'listed'
  }
  for (const t of tiles.values()) {
    const n = t.fields.filter(f => f.read).length
    const module = implemented && t.convention ? implemented.has(t.id) : null
    if (module !== null) t.module = module
    if (t.status === 'listed') {
      if (module) t.status = 'plays'
    } else if (module === null) {
      t.status = n === t.fields.length ? 'plays' : n ? 'partial' : 'gap'
    } else {
      t.status = module ? (n === t.fields.length ? 'plays' : 'partial') : n ? 'partial' : 'gap'
    }
  }
  const ORDER = { gap: 0, partial: 1, listed: 2, plays: 3 }
  const sorted = [...tiles.values()].sort((a, b) =>
    (a.convention === b.convention ? 0 : a.convention ? -1 : 1)
    || (a.level ?? 99) - (b.level ?? 99)
    || ORDER[a.status] - ORDER[b.status]
    || a.name.localeCompare(b.name))
  return {
    read: read.size,
    total: paths.length,
    score: paths.length ? read.size / paths.length : 1,
    other: (coverage?.other || []).length,
    tiles: sorted,
  }
}
