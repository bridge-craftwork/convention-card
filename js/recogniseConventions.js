// Conventions named in a card's text (DESIGN.md, "Conventions written as
// text"): "Kokish relay; Spiral" in a note names two conventions the card
// may not yet play as fields. The library finds them and says what playing
// them would set. A name that is an ordinary word, or could mean another
// convention ("weak 2", "Jacoby": `confirm` and `confirm_names` in the
// spec), is only suggested, for a person to confirm, because a bot reads the
// fields and a wrong guess changes its bidding; any other name is specific
// enough to tick on import (`recogniseOnImport`). The typed text is never
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
const generic = (c, name) => c.confirm === true
  || (c.confirm_names || []).some(n => n.toLowerCase() === name.toLowerCase())
const NAMES = Object.entries(CONVENTIONS)
  .flatMap(([id, c]) => [...new Set([c.name, ...(c.names || [])].filter(Boolean))].map(name => ({ id, name, confirm: generic(c, name) })))
  .filter(n => n.name.trim().length >= 3)
  .sort((a, b) => b.name.length - a.name.length)

const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
// A name stands on its own: no letter or digit right before or after it.
const PATTERNS = NAMES.map(n => ({ ...n, re: new RegExp(`(?<![\\p{L}\\p{N}])${escape(n.name)}(?![\\p{L}\\p{N}])`, 'giu') }))

/**
 * The conventions `text` names: `[{ id, name, written, index, confirm }]`,
 * in the order they appear, none overlapping another. `name` is the spec's
 * name that matched, `written` the text as typed, `confirm` whether that
 * name needs a person to confirm it (an ordinary word, or ambiguous).
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
      found.push({ id: p.id, name: p.name, written: m[0], index: start, confirm: p.confirm })
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
 * `other_agreements` entry names it; or a choice field holds an option the
 * spec says plays it (`plays`: 2♥ meaning "weak" plays Weak Twos), or one
 * named after it (Suction as the defence to 1NT).
 */
export function playsConvention(card_data, id, values = cardValues(card_data)) {
  if ((BOOL_FIELDS.get(id) || []).some(p => isOn(values, p))) return true
  const agreements = Array.isArray(card_data?.other_agreements) ? card_data.other_agreements : []
  if (agreements.some(a => a?.id === id)) return true
  const option = tail(id)
  return [...values].some(([p, v]) => FIELDS[p].kind === 'enum' && (v === option || FIELDS[p].plays?.[v] === id))
}

const dismissedOf = card_data => {
  const list = readPath(card_data || {}, DISMISSED_PATH)
  return new Set(Array.isArray(list) ? list.filter(x => typeof x === 'string') : [])
}

// The line of `text` the match is on (a note is a line per bid), at most
// ~40 characters each side: `{ before, match, after }`, with "…" where cut.
function quote(text, index, length) {
  const lineStart = text.lastIndexOf('\n', index - 1) + 1
  const nl = text.indexOf('\n', index + length)
  const lineEnd = nl < 0 ? text.length : nl
  const from = Math.max(lineStart, index - 40)
  const to = Math.min(lineEnd, index + length + 40)
  return {
    before: `${from > lineStart ? '…' : ''}${text.slice(from, index).replace(/\s+/g, ' ').trimStart()}`,
    match: text.slice(index, index + length),
    after: `${text.slice(index + length, to).replace(/\s+/g, ' ').trimEnd()}${to < lineEnd ? '…' : ''}`,
  }
}
const excerptOf = q => `${q.before}${q.match}${q.after}`

/**
 * Conventions the card's text names but the card does not play, one per
 * convention and box: `{ suggestions, dismissed }`, each a list of
 * `{ key, id, name, set, found, confirm }`; `confirm` is true when every
 * place names it only by a generic name ("weak 2"), so a person should say. `name` is the convention's own name; `set`
 * is what adding it does, `{ field: path }` or `{ other_agreements: true }`
 * (it has no yes/no field); `found` is where the text names it,
 * `[{ path, label, written, quote: { before, match, after }, excerpt }]`, a
 * box of its own before a gathered note, the shortest first; the quote is
 * the line it is on. Where the text field says which box
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
        confirm: m.confirm,
        quote: quote(String(value), m.index, m.written.length),
        excerpt: excerptOf(quote(String(value), m.index, m.written.length)),
        size: String(value).length,
      })
    }
  }
  const suggestions = []
  const turnedDown = []
  for (const s of byKey.values()) {
    s.confirm = s.found.every(f => f.confirm)
    // The plainest place first: a box of its own before a gathered note,
    // then the shortest text.
    s.found.sort((a, b) => (a.path.startsWith('notes.') - b.path.startsWith('notes.')) || a.size - b.size)
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

/**
 * Tick every convention the card's text names by a specific name (not one
 * that needs confirming, and not one the card has turned down), as import
 * does for another tool's card: changes `card_data` in place and returns the
 * suggestions it accepted. Generic names are left as suggestions.
 */
export function recogniseOnImport(card_data) {
  const accepted = suggestConventions(card_data).suggestions.filter(s => !s.confirm)
  for (const s of accepted) acceptSuggestion(card_data, s)
  return accepted
}
