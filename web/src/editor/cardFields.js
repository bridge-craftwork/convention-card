// Every field of the spec, for the editor: which section it belongs to,
// which the section's own rows and panels already show, and a search across
// them all. The sections grew from the ACBL card, but a card holds more than
// that card has room for, so a field no row or panel shows is listed under
// its section by a generic row (FieldRow.vue): nothing on a card is hidden.

import { FIELDS, CONVENTIONS, field } from '../../../js/spec.js'
import { readPath } from '../../../js/paths.js'
import { SECTION_META, STRUCTURED_FIELDS, CONVENTION_CATALOG } from './conventionCatalog.js'
import WIDGET_FIELDS from './widgetFields.json'

const canonical = path => field(path)?.path ?? null

// A catalog row's fields: any string in it that names one
function pathsIn(row, out = []) {
  for (const v of Object.values(row)) {
    if (typeof v === 'string') { const p = canonical(v); if (p) out.push(p) }
    else if (Array.isArray(v)) { for (const item of v) if (item && typeof item === 'object') pathsIn(item, out) }
  }
  return out
}

const ROW_SECTION = new Map()
for (const [section, rows] of Object.entries(STRUCTURED_FIELDS)) {
  for (const row of rows) for (const p of pathsIn(row)) ROW_SECTION.set(p, section)
}
for (const entry of CONVENTION_CATALOG) {
  for (const p of pathsIn(entry)) if (!ROW_SECTION.has(p)) ROW_SECTION.set(p, entry.section)
}
const NOTE_SECTION = new Map(SECTION_META.flatMap(s => (s.notes || []).map(n => [`notes.${n.key}`, s.id])))

const SECTION_IDS = new Set(SECTION_META.map(s => s.id))
const COMPETITIVE_PARTS = new Set(['vs_to_double', 'vs_preempts', 'direct_cuebids'])

/** The section a field belongs to in the editor. */
export function sectionOfPath(path) {
  const known = ROW_SECTION.get(path) || NOTE_SECTION.get(path)
  if (known) return known
  const top = path.split('.')[0]
  if (COMPETITIVE_PARTS.has(top)) return 'competitive'
  if (top === 'metadata' || top === 'notes') return 'general'
  return SECTION_IDS.has(top) ? top : 'other_conventions'
}

// A range end's plus or minus goes with the end: "14+" in one box.
const isQualifier = path => /_(plus|minus)$/.test(path) && !!FIELDS[path.replace(/_(plus|minus)$/, '')]

const SHOWN = new Set([...ROW_SECTION.keys(), ...NOTE_SECTION.keys(), ...WIDGET_FIELDS])

/** The fields of `sectionId` that none of its rows or panels show. */
export function unshownFields(sectionId) {
  return Object.keys(FIELDS).filter(p => !SHOWN.has(p) && !isQualifier(p) && sectionOfPath(p) === sectionId)
}

const SUIT_LETTERS = { '♣': 'c', '♦': 'd', '♥': 'h', '♠': 's' }
// Lower case, suits as letters, so "2h" finds "2♥", and path punctuation as spaces
const fold = s => String(s ?? '').toLowerCase().replace(/[♣♦♥♠]/g, c => SUIT_LETTERS[c]).replace(/[._/-]+/g, ' ')

const ENTRY_NAMES = new Map()
for (const entry of CONVENTION_CATALOG) {
  for (const p of pathsIn(entry)) ENTRY_NAMES.set(p, [...(ENTRY_NAMES.get(p) || []), entry.name, entry.desc])
}
const ROW_LABELS = new Map()
for (const rows of Object.values(STRUCTURED_FIELDS)) {
  for (const row of rows) for (const p of pathsIn(row)) ROW_LABELS.set(p, [...(ROW_LABELS.get(p) || []), row.label])
}

function namesOf(path, def) {
  const ids = [def.skill].flat().filter(Boolean)
  const names = ids.flatMap(id => [CONVENTIONS[id]?.name, ...(CONVENTIONS[id]?.names || [])])
  return [def.label, ...(ENTRY_NAMES.get(path) || []), ...(ROW_LABELS.get(path) || []), ...names].filter(Boolean)
}

const INDEX = Object.entries(FIELDS).filter(([p]) => !isQualifier(p)).map(([path, def]) => ({
  path,
  label: def.label || path,
  section: sectionOfPath(path),
  folded: {
    label: fold(def.label),
    names: fold(namesOf(path, def).join(' ')),
    rest: fold([path, def.desc, ...(def.options || [])].join(' ')),
  },
}))

const SECTION_LABEL = new Map(SECTION_META.map(s => [s.id, s.label]))

/**
 * The fields matching `query`, best first: `[{ path, label, section,
 * sectionLabel }]`. A field matches when every word of the query is in its
 * label, the names of its convention, the words of its path, description or
 * options, its section's name, or the value this card holds for it.
 */
export function searchFields(query, cardData) {
  const words = fold(query).split(/\s+/).filter(Boolean)
  if (!words.length) return []
  const found = []
  for (const row of INDEX) {
    const value = readPath(cardData || {}, row.path)
    const held = value == null || value === false ? '' : fold(value === true ? '' : Array.isArray(value) ? value.join(' ') : value)
    const sectionName = fold(SECTION_LABEL.get(row.section))
    const all = `${row.folded.label} ${row.folded.names} ${row.folded.rest} ${held} ${sectionName}`
    if (!words.every(w => all.includes(w))) continue
    const rank = words.every(w => row.folded.label.includes(w)) ? 0
      : words.every(w => row.folded.names.includes(w)) ? 1
        : words.every(w => held.includes(w)) ? 2 : 3
    found.push({ path: row.path, label: row.label, section: row.section, sectionLabel: SECTION_LABEL.get(row.section), rank })
  }
  const order = new Map(SECTION_META.map((s, i) => [s.id, i]))
  return found.sort((a, b) => (a.rank - b.rank) || (order.get(a.section) - order.get(b.section)))
}

/** The card's `other_agreements` whose words match `query`. */
export function searchAgreements(query, cardData) {
  const words = fold(query).split(/\s+/).filter(Boolean)
  const list = Array.isArray(cardData?.other_agreements) ? cardData.other_agreements : []
  return words.length ? list.filter(a => words.every(w => fold(a?.text).includes(w))) : []
}
