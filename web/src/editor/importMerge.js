// Merge imported cards into the ones kept, through the storage adapter, by
// the library's simple rule (js/cardBundle.js, planImport): new cards are
// added, unchanged ones skipped, newer ones replace the kept card, and for
// an older or undated one the person chooses, with a plain OK/Cancel.
// Used by the home page's Import and the editor's Import alike.

import { planImport } from '../../../js/cardBundle.js'

function defaultAsk({ name, ours, theirs }) {
  return window.confirm(`“${name}” is already here.\n${ours} — last saved\n${theirs} — from the import file\n\nOK keeps yours; Cancel uses the imported one.`)
}

export const when = t => (t ? new Date(t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'no date')

/**
 * Merge `records` (from importCards) into `storage`'s cards.
 * `ask({ name, ours, theirs })` decides an older or undated import: it
 * resolves true to keep the card already here. `ours` and `theirs` are the
 * two last-saved times, formatted. Without it, the browser's confirm asks.
 * Returns `{ added, replaced, same, keptOurs, lastId }` (card ids), a
 * one-line `summary`, and `matched`: what to tell the person about cards
 * that met ones already kept, or null when there is nothing to tell.
 */
export async function mergeImported(records, storage, ask = defaultAsk) {
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
      const keepOurs = await ask({ name, ours: when(target.updated_at), theirs: when(card.updatedAt) })
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

  // What the person should hear about: cards that met one already kept
  // without being asked (a newer copy replaced it, or it was the same).
  // New cards and cards they were asked about need no message.
  const nameOf = id => kept.find(k => k.id === id)?.name || records.find(r => r.id === id)?.name || 'a card'
  const lines = []
  if (out.replaced.length) lines.push(`Replaced with the newer imported copy: ${out.replaced.map(nameOf).join(', ')}.`)
  if (out.same.length) lines.push(`Already up to date: ${out.same.map(nameOf).join(', ')}.`)
  out.matched = lines.join('\n') || null
  out.matchedGroups = [
    out.replaced.length && { heading: 'Replaced with the newer imported copy:', items: out.replaced.map(nameOf) },
    out.same.length && { heading: 'Already up to date:', items: out.same.map(nameOf) },
  ].filter(Boolean)

  const parts = []
  if (out.added.length) parts.push(`${out.added.length} added`)
  if (out.replaced.length) parts.push(`${out.replaced.length} replaced`)
  if (out.same.length) parts.push(`${out.same.length} already here`)
  if (out.keptOurs.length) parts.push(`${out.keptOurs.length} kept as you had ${out.keptOurs.length === 1 ? 'it' : 'them'}`)
  out.summary = `${records.length === 1 ? 'Imported 1 card' : `Imported ${records.length} cards`}: ${parts.join(', ')}.`
  return out
}
