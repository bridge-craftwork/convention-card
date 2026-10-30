// Two partners' edits to one shared card, merged (DESIGN.md, "Shared
// cards"; DECISIONS 18). A save names the version it started from; when a
// partner saved since, the editor merges three cards: that version (base),
// its own edits (mine) and the partner's (theirs). A card is paths and
// values, so a field only one side changed takes that side's value, and
// only a field both changed, differently, needs a person.

const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v)
// A copy through JSON, as a card is JSON: structuredClone refuses an
// editor's reactive proxy
const copy = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)))

function same(a, b) {
  if (a === b) return true
  if (a === undefined || b === undefined) return false
  return JSON.stringify(a) === JSON.stringify(b)
}

function merge(base, mine, theirs, path, conflicts) {
  if (same(mine, theirs)) return mine
  if (same(mine, base)) return theirs
  if (same(theirs, base)) return mine
  // Both changed a group: merge it key by key. A group one side removed
  // counts as empty, so the other side's untouched keys go with it and its
  // edits are conflicts.
  const group = v => v === undefined || isObject(v)
  if (group(base) && group(mine) && group(theirs) && (isObject(mine) || isObject(theirs))) {
    const b = base || {}, m = mine || {}, t = theirs || {}
    const out = {}
    for (const key of new Set([...Object.keys(m), ...Object.keys(t), ...Object.keys(b)])) {
      const v = merge(b[key], m[key], t[key], path ? `${path}.${key}` : key, conflicts)
      if (v !== undefined) out[key] = v
    }
    return Object.keys(out).length || (mine !== undefined && theirs !== undefined) ? out : undefined
  }
  // A list (the cards led from a holding) or a value: one agreement.
  conflicts.push({ path, base, mine, theirs })
  return mine
}

/**
 * Merge two edits of one card. `base` is the card_data both started from,
 * `mine` and `theirs` the two edits. Returns `{ card, conflicts }`: `card`
 * has every change only one side made, and, where both changed a field
 * differently, mine; each conflict is `{ path, base, mine, theirs }` (a
 * value is undefined where that side has none). Lists are single values.
 * Nothing passed in is changed.
 */
export function mergeCards(base, mine, theirs) {
  const conflicts = []
  const card = merge(base ?? {}, mine ?? {}, theirs ?? {}, '', conflicts) ?? {}
  return { card: copy(card), conflicts }
}

/**
 * `card` (mergeCards's) with each conflict settled: `choose(conflict)` says
 * 'mine' or 'theirs'. Returns a new card_data.
 */
export function resolveConflicts(card, conflicts, choose) {
  const out = copy(card)
  for (const c of conflicts) {
    if (choose(c) !== 'theirs') continue
    const parts = c.path.split('.')
    let at = out
    for (const p of parts.slice(0, -1)) {
      if (!isObject(at[p])) at[p] = {}
      at = at[p]
    }
    const last = parts.at(-1)
    if (c.theirs === undefined) delete at[last]
    else at[last] = copy(c.theirs)
  }
  return out
}
