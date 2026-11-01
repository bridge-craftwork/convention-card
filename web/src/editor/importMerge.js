// Merge imported cards into the ones kept, through the storage adapter, by
// the library's simple rule (js/cardBundle.js, planImport): new cards are
// added, unchanged ones skipped, newer ones replace the kept card, and for
// an older or undated one the person chooses, with a plain OK/Cancel.
// Used by the home page's Import and the editor's Import alike.

import { planImport } from '../../../js/cardBundle.js'

function defaultAsk({ name, ours, theirs }) {
  return window.confirm(`This file holds ${theirs !== 'no date' && ours !== 'no date' ? 'an older copy' : 'a copy'} of “${name}”.\n${ours} — “${name}”, last saved\n${theirs} — the file's copy\n\nOK keeps “${name}” as it is; Cancel replaces it with the file's copy.`)
}

// The answer to `ask`: 'keep', 'add' (as a new card) or 'replace'. A
// boolean is read as before: true keeps.
const choiceOf = a => (a === true || a === 'keep' ? 'keep' : a === 'add' ? 'add' : 'replace')

// A card's settings under the name it already has.
const named = (cardData, name) =>
  cardData?.metadata ? { ...cardData, metadata: { ...cardData.metadata, name } } : cardData

export const when = t => (t ? new Date(t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'no date')

/**
 * Merge `records` (from importCards) into `storage`'s cards.
 * `ask({ name, importedName, ours, theirs })` decides an older or undated
 * import that matches a card already here (by its id, or its name). `name`
 * is that card's name now, which is the one the person knows; `importedName`
 * is the name the file's copy carries, which may be an old one. It resolves
 * 'keep', 'add' (keep the card, and add the file's copy as a new card) or
 * 'replace' (true/false: keep/replace). Replacing an older copy keeps the
 * card's name: the person chose the file's settings, not its old name. A
 * newer copy (replaced without asking) brings its own name. `ours` and
 * `theirs` are the two last-saved times, formatted. Without `ask`, the
 * browser's confirm asks.
 * Returns `{ added, replaced, same, keptOurs, lastId }` (card ids), a
 * one-line `summary`, and `matched`: what to tell the person about cards
 * that met ones already kept, or null when there is nothing to tell.
 */
export async function mergeImported(records, storage, ask = defaultAsk) {
  const links = storage.user?.value ? await storage.listLinks() : []
  const kept = await Promise.all(links.map(l => storage.load(l.card_id)))
  const plan = planImport(records, kept)
  const out = { added: [], replaced: [], same: [], keptOurs: [], lastId: null }
  const askedAbout = new Set()
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
      const ours = target.name || name
      const choice = choiceOf(await ask({ name: ours, importedName: name, ours: when(target.updated_at), theirs: when(card.updatedAt) }))
      askedAbout.add(target.id)
      if (choice === 'keep') {
        out.keptOurs.push(target.id)
        out.lastId = target.id
        continue
      }
      if (choice === 'add') {
        const id = await storage.create({ ...fields, primary: false })
        out.added.push(id)
        out.lastId = id
        continue
      }
      fields.name = ours
      fields.cardData = named(fields.cardData, ours)
    }
    await storage.overwrite(target.id, fields)
    out.replaced.push(target.id)
    out.lastId = target.id
  }

  // What the person should hear about: cards that met one already kept
  // without being asked (a newer copy replaced it, or it was the same).
  // New cards and cards they were asked about need no message.
  const nameOf = id => kept.find(k => k.id === id)?.name || records.find(r => r.id === id)?.name || 'a card'
  const unasked = out.replaced.filter(id => !askedAbout.has(id))
  const lines = []
  if (unasked.length) lines.push(`Replaced with the newer imported copy: ${unasked.map(nameOf).join(', ')}.`)
  if (out.same.length) lines.push(`Already up to date: ${out.same.map(nameOf).join(', ')}.`)
  out.matched = lines.join('\n') || null
  out.matchedGroups = [
    unasked.length && { heading: 'Replaced with the newer imported copy:', items: unasked.map(nameOf) },
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
