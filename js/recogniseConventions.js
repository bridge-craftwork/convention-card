// Conventions named in a card's text (DESIGN.md, "Conventions named in
// text"): "Kokish relay; Spiral" in a note names two conventions the card
// may not yet play as fields. The library finds them and says what playing
// them would set; a person confirms each one, because a bot reads the
// fields and a wrong guess changes its bidding. The typed text is never
// rewritten.
//
// A suggestion the person turns down is remembered on the card
// (`metadata.dismissed_conventions`, a list of convention IDs) and not
// offered again, until they ask to be asked again: the vocabulary grows, and
// a "no" given once can deserve a second look.

import { FIELDS, CONVENTIONS } from './spec.js'
import { cardValues } from './checkCard.js'
import { readPath, writePath } from './paths.js'

export const DISMISSED_PATH = 'metadata.dismissed_conventions'

// Every name of every convention, longest first, so "Exclusion Blackwood"
// is found before "Blackwood" and "Ingberman 2NT" before "Ingberman".
const NAMES = Object.entries(CONVENTIONS)
  .flatMap(([id, c]) => [...new Set([c.name, ...(c.names || [])].filter(Boolean))].map(name => ({ id, name })))
  .filter(n => n.name.trim().length >= 3)
  .sort((a, b) => b.name.length - a.name.length)

const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
// A name stands on its own: no letter or digit right before or after it.
const PATTERNS = NAMES.map(n => ({ ...n, re: new RegExp(`(?<![\\p{L}\\p{N}])${escape(n.name)}(?![\\p{L}\\p{N}])`, 'giu') }))

/**
 * The conventions `text` names: `[{ id, name, written, index }]`, in the
 * order they appear, none overlapping another. `name` is the spec's name
 * that matched, `written` the text as typed.
 */
export function findConventions(text) {
  if (typeof text !== 'string' || !text.trim()) return []
  const taken = []
  const found = []
  for (const p of PATTERNS) {
    p.re.lastIndex = 0
    for (let m; (m = p.re.exec(text));) {
      const start = m.index
      const end = start + m[0].length
      if (taken.some(([s, e]) => start < e && end > s)) continue
      taken.push([start, end])
      found.push({ id: p.id, name: p.name, written: m[0], index: start })
    }
  }
  return found.sort((a, b) => a.index - b.index)
}

// A convention's yes/no fields (its first `skill`), base field first: one
// ending `.play`, else one at the convention's own level, else the first.
const BOOL_FIELDS = new Map()
for (const [path, def] of Object.entries(FIELDS)) {
  const id = [def.skill].flat()[0]
  if (def.kind !== 'bool' || !id) continue
  if (!BOOL_FIELDS.has(id)) BOOL_FIELDS.set(id, [])
  BOOL_FIELDS.get(id).push(path)
}
function baseField(id) {
  const paths = BOOL_FIELDS.get(id) || []
  const level = CONVENTIONS[id]?.level
  return paths.find(p => p.endsWith('.play'))
    || paths.find(p => FIELDS[p].level == null || FIELDS[p].level === level)
    || paths[0]
    || null
}

const isOn = (values, path) => (values.has(path) ? values.get(path) : FIELDS[path].default) === true
const tail = id => id.slice(id.lastIndexOf('/') + 1)

/**
 * Whether the card plays convention `id`, as the crate's
 * `Card::names_convention` reads it: one of its yes/no fields is on, or an
 * `other_agreements` entry names it; or, for a convention that is a choice
 * among others (Suction as the defence to 1NT), a choice field holds it.
 */
export function playsConvention(card_data, id, values = cardValues(card_data)) {
  if ((BOOL_FIELDS.get(id) || []).some(p => isOn(values, p))) return true
  const agreements = Array.isArray(card_data?.other_agreements) ? card_data.other_agreements : []
  if (agreements.some(a => a?.id === id)) return true
  const option = tail(id)
  return [...values].some(([p, v]) => FIELDS[p].kind === 'enum' && v === option)
}

const dismissedOf = card_data => {
  const list = readPath(card_data || {}, DISMISSED_PATH)
  return new Set(Array.isArray(list) ? list.filter(x => typeof x === 'string') : [])
}

function excerpt(text, index, length) {
  const from = Math.max(0, index - 30)
  const to = Math.min(text.length, index + length + 30)
  return `${from > 0 ? '…' : ''}${text.slice(from, to).replace(/\s+/g, ' ').trim()}${to < text.length ? '…' : ''}`
}

/**
 * Conventions the card's text names but the card does not play, one per
 * convention and box: `{ suggestions, dismissed }`, each a list of
 * `{ key, id, name, set, found }`. `name` is the convention's own name; `set`
 * is what adding it does, `{ field: path }` or `{ other_agreements: true }`
 * (it has no yes/no field); `found` is where the text names it,
 * `[{ path, label, written, excerpt }]`. Where the text field says which box
 * a convention named in it means (`implies` in the spec: "Puppet" as the 1NT
 * 3♣ response is Puppet Stayman over 1NT), that box is the one suggested, and
 * it is suggested while that box is off, whatever the convention's other
 * boxes say. A dismissed convention is listed under `dismissed`, not
 * `suggestions`.
 */
export function suggestConventions(card_data) {
  const values = cardValues(card_data)
  const dismissed = dismissedOf(card_data)
  const byKey = new Map()
  for (const [path, value] of values) {
    if (FIELDS[path].kind !== 'text') continue
    for (const m of findConventions(String(value))) {
      const implied = FIELDS[path].implies?.[m.id]
      const key = implied ? `${m.id}|${implied}` : m.id
      if (!byKey.has(key)) {
        const field = implied || baseField(m.id)
        byKey.set(key, {
          key,
          id: m.id,
          name: implied ? FIELDS[implied]?.label || CONVENTIONS[m.id]?.name || m.name : CONVENTIONS[m.id]?.name || m.name,
          set: field ? { field } : { other_agreements: true },
          implied: !!implied,
          found: [],
        })
      }
      byKey.get(key).found.push({
        path,
        label: FIELDS[path].label,
        written: m.written,
        excerpt: excerpt(String(value), m.index, m.written.length),
      })
    }
  }
  const suggestions = []
  const turnedDown = []
  for (const s of byKey.values()) {
    if (s.implied ? isOn(values, s.set.field) : playsConvention(card_data, s.id, values)) continue
    ;(dismissed.has(s.id) ? turnedDown : suggestions).push(s)
  }
  return { suggestions, dismissed: turnedDown }
}

/**
 * Play a suggested convention on `card_data` (changed in place, and
 * returned): its field is set on, or, with none, an `other_agreements`
 * entry is added with its ID, the words as written and the field they were
 * found in (and its card section, which the PDF prints it under). It is no
 * longer dismissed.
 */
export function acceptSuggestion(card_data, suggestion) {
  if (suggestion.set.field) {
    writePath(card_data, suggestion.set.field, true)
  } else {
    const where = suggestion.found[0]
    const entry = { id: suggestion.id, text: where?.written || suggestion.name }
    const section = where?.path.slice(0, where.path.indexOf('.'))
    if (section && section !== 'notes') entry.section = section
    if (where) entry.from = where.path
    card_data.other_agreements = [...(Array.isArray(card_data.other_agreements) ? card_data.other_agreements : []), entry]
  }
  const dismissed = dismissedOf(card_data)
  if (dismissed.delete(suggestion.id)) setDismissed(card_data, dismissed)
  return card_data
}

/** Don't suggest convention `id` on this card again (until `askAgain`). */
export function dismissSuggestion(card_data, id) {
  const dismissed = dismissedOf(card_data)
  dismissed.add(id)
  setDismissed(card_data, dismissed)
  return card_data
}

/** Offer every dismissed suggestion again. */
export function askAgain(card_data) {
  setDismissed(card_data, new Set())
  return card_data
}

function setDismissed(card_data, set) {
  if (set.size) {
    writePath(card_data, DISMISSED_PATH, [...set].sort())
  } else if (card_data.metadata && DISMISSED_PATH.split('.')[1] in card_data.metadata) {
    delete card_data.metadata.dismissed_conventions
  }
}
