// Exporting cards, one or all, and merging imported cards with those
// already kept. A card's export carries its id and when it last changed
// (`updatedAt`), so an import can tell the same card, and the newer copy.
//
// The merge rule, kept simple on purpose (Rick Wilson, 2026-10-03): an
// imported card is matched to a kept one by id, else by name. No match: it
// is added. Same settings: nothing to do. The import is newer: it replaces
// the kept card. Otherwise (older, or either has no date) the person
// chooses: keep theirs, or use the imported one.

import { EXPORT_SCHEMA } from './checkCard.js'
import { upgradeCardData } from './migrate.js'
import { withoutSavedDate } from './bbo.js'

/** The `schema` of an "Export all" file: `{ schema, exportedAt, cards: [<card export>] }`. */
export const BUNDLE_SCHEMA = 'bridge-classroom/cards@v1'

/**
 * A card ({ id, name, description, card_data, updated_at }) as the editor's
 * export: `{ schema, id, name, description, updatedAt, exportedAt, card_data }`.
 */
export function exportRecord(card, exportedAt = new Date().toISOString()) {
  return {
    schema: EXPORT_SCHEMA,
    id: card.id ?? null,
    name: card.name || null,
    description: card.description || null,
    updatedAt: card.updated_at || card.updatedAt || null,
    exportedAt,
    card_data: upgradeCardData(card.card_data || {}),
  }
}

/** Every card in one file ("Export all"). */
export function exportAll(cards, exportedAt = new Date().toISOString()) {
  return { schema: BUNDLE_SCHEMA, exportedAt, cards: cards.map(c => exportRecord(c, exportedAt)) }
}

/** Whether `obj` is an "Export all" file. */
export function isBundle(obj) {
  return !!obj && typeof obj === 'object' && obj.schema === BUNDLE_SCHEMA && Array.isArray(obj.cards)
}

const time = t => {
  const n = t ? Date.parse(t) : NaN
  return Number.isFinite(n) ? n : null
}

// Compared in the current schema, so a kept card saved before an upgrade
// matches its own export, and without the BBO card's saved date, which isn't
// a setting.
const comparable = c => {
  const u = upgradeCardData(c || {})
  const raw = u._bbo_raw
  return raw?.fields ? { ...u, _bbo_raw: { ...raw, fields: withoutSavedDate(raw.fields) } } : u
}
const sameSettings = (a, b) => JSON.stringify(comparable(a)) === JSON.stringify(comparable(b))

// The same, whatever each is called: a card matched by its BBO key may have
// been renamed here.
const sameUnderAnyName = (a, b) => {
  const unnamed = c => { const u = comparable(c); return { ...u, metadata: { ...u.metadata, name: null } } }
  return JSON.stringify(unnamed(a)) === JSON.stringify(unnamed(b))
}

/**
 * What to do with each imported card. `incoming`: records `{ id?, name,
 * description, card_data, updatedAt? }`; `kept`: the cards already kept,
 * `{ id, name, card_data, updated_at }`. Returns, per incoming card,
 * `{ card, action, target }` with `action` one of "add", "same",
 * "replace" (the import is newer) or "ask" (older, or undated), and
 * `target` the kept card it matched. A card from BBO is also matched by its
 * BBO key, and BBO allows several cards of one name, so a name matches a
 * kept card only once in a file, and never one that BBO says is another card.
 */
export function planImport(incoming, kept) {
  const byId = new Map(kept.filter(k => k.id != null).map(k => [String(k.id), k]))
  const byName = new Map()
  for (const k of kept) if (k.name && !byName.has(k.name)) byName.set(k.name, k)
  const bboKey = c => c.card_data?._bbo_raw?.cc_key || null
  // Which kept card is this BBO card? Older duplicates share its key: the
  // one still the same, else the one of its name, else the first.
  const byKey = card => {
    const key = bboKey(card)
    const all = key ? kept.filter(k => bboKey(k) === key) : []
    return all.find(k => sameUnderAnyName(k.card_data, card.card_data)) || all.find(k => k.name === card.name) || all[0] || null
  }
  const named = new Set()
  const byNameOnce = card => {
    const k = byName.get(card.name)
    if (!k || named.has(k) || (bboKey(k) && bboKey(card))) return null
    named.add(k)
    return k
  }
  return incoming.map(card => {
    const sameId = card.id != null && byId.get(String(card.id))
    const keyed = !sameId && byKey(card)
    const target = sameId || keyed || byNameOnce(card)
    if (!target) return { card, action: 'add', target: null }
    if ((keyed ? sameUnderAnyName : sameSettings)(card.card_data, target.card_data)) return { card, action: 'same', target }
    const theirs = time(card.updatedAt)
    const ours = time(target.updated_at || target.updatedAt)
    if (theirs != null && ours != null && theirs > ours) return { card, action: 'replace', target }
    return { card, action: 'ask', target }
  })
}
