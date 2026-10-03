// Merge imported cards into the ones kept, through the storage adapter, by
// the library's simple rule (js/cardBundle.js, planImport): new cards are
// added, unchanged ones skipped, newer ones replace the kept card, and for
// an older or undated one the person chooses, with a plain OK/Cancel.
// Used by the home page's Import and the editor's Import alike.

import { planImport } from '../../../js/cardBundle.js'

const when = t => (t ? new Date(t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'no date')

/**
 * Merge `records` (from importCards) into `storage`'s cards. `ask(text)`
 * returns true to keep the kept card (defaults to window.confirm).
 * Returns `{ added, replaced, same, keptOurs, lastId }` (card ids) and a
 * one-line `summary`.
 */
export async function mergeImported(records, storage, ask = text => window.confirm(text)) {
  const links = storage.user?.value ? await storage.listLinks() : []
  const kept = await Promise.all(links.map(l => storage.load(l.card_id)))
  const plan = planImport(records, kept)
  const out = { added: [], replaced: [], same: [], keptOurs: [], lastId: null }
  let first = !kept.length

  for (const { card, action, target } of plan) {
    const name = card.name || 'Imported convention card'
    const fields = { name, description: card.description || null, cardData: card.card_data || {} }
    if (action === 'add') {
      const id = await storage.create({ ...fields, primary: first })
      first = false
      out.added.push(id)
      out.lastId = id
      continue
    }
    if (action === 'same') {
      out.same.push(target.id)
      out.lastId = target.id
      continue
    }
    if (action === 'ask') {
      const keepOurs = ask(
        `“${name}” is already here, last changed ${when(target.updated_at)}.\n` +
        `The imported copy was last changed ${when(card.updatedAt)}.\n\n` +
        'OK keeps the card you have; Cancel replaces it with the imported one.'
      )
      if (keepOurs) {
        out.keptOurs.push(target.id)
        out.lastId = target.id
        continue
      }
    }
    await storage.overwrite(target.id, fields)
    out.replaced.push(target.id)
    out.lastId = target.id
  }

  const parts = []
  if (out.added.length) parts.push(`${out.added.length} added`)
  if (out.replaced.length) parts.push(`${out.replaced.length} replaced`)
  if (out.same.length) parts.push(`${out.same.length} already here`)
  if (out.keptOurs.length) parts.push(`${out.keptOurs.length} kept as you had ${out.keptOurs.length === 1 ? 'it' : 'them'}`)
  out.summary = `${records.length === 1 ? 'Imported 1 card' : `Imported ${records.length} cards`}: ${parts.join(', ')}.`
  return out
}
