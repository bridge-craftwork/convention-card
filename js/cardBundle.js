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
    card_data: card.card_data || {},
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

const sameSettings = (a, b) => JSON.stringify(a || {}) === JSON.stringify(b || {})

/**
 * What to do with each imported card. `incoming`: records `{ id?, name,
 * description, card_data, updatedAt? }`; `kept`: the cards already kept,
 * `{ id, name, card_data, updated_at }`. Returns, per incoming card,
 * `{ card, action, target }` with `action` one of "add", "same",
 * "replace" (the import is newer) or "ask" (older, or undated), and
 * `target` the kept card it matched.
 */
export function planImport(incoming, kept) {
  const byId = new Map(kept.filter(k => k.id != null).map(k => [String(k.id), k]))
  const byName = new Map()
  for (const k of kept) if (k.name && !byName.has(k.name)) byName.set(k.name, k)
  return incoming.map(card => {
    const target = (card.id != null && byId.get(String(card.id))) || byName.get(card.name)
    if (!target) return { card, action: 'add', target: null }
    if (sameSettings(card.card_data, target.card_data)) return { card, action: 'same', target }
    const theirs = time(card.updatedAt)
    const ours = time(target.updated_at || target.updatedAt)
    if (theirs != null && ours != null && theirs > ours) return { card, action: 'replace', target }
    return { card, action: 'ask', target }
  })
}
