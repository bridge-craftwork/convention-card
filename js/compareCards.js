// Compare cards: one column per card, one row per agreement (DESIGN.md,
// "Comparing cards"). A pure function of the cards and the spec, for the
// editor's grid, a printout, or anything else that wants the differences
// between a player's partnerships.
//
// What keeps the grid readable:
//   - A choice group is one row ("Count vs suits: Standard | Upside-down"),
//     not a row per alternative.
//   - A range is one row ("1NT range: 15+–17"), its plus and minus boxes
//     folded in.
//   - A yes/no field that is unset is off (or its default, where the spec
//     gives one): formats that leave unticked boxes out don't differ from
//     ones that write them as false.
//   - Any other field that is unset is "not recorded": a difference from a
//     card that records it ("Suction" against nothing written), shown apart
//     from a different value. Text is compared ignoring case and spacing.

import { FIELDS, CONVENTIONS } from './spec.js'
import { cardValues } from './checkCard.js'

// Choice groups: id → member paths, in spec order.
const CHOICES = new Map()
for (const [path, def] of Object.entries(FIELDS)) {
  if (def.choice) {
    if (!CHOICES.has(def.choice)) CHOICES.set(def.choice, [])
    CHOICES.get(def.choice).push(path)
  }
}

// Ranges: `…range_min` with a `…range_max` beside it, and the plus/minus
// qualifiers of each end where the spec has them.
const RANGES = new Map()
for (const path of Object.keys(FIELDS)) {
  if (!path.endsWith('range_min')) continue
  const max = `${path.slice(0, -3)}max`
  if (!FIELDS[max]) continue
  RANGES.set(path, {
    min: path,
    max,
    qualifiers: [path, max].map(end => ({
      plus: FIELDS[`${end}_plus`] ? `${end}_plus` : null,
      minus: FIELDS[`${end}_minus`] ? `${end}_minus` : null,
    })),
  })
}
const IN_RANGE = new Set([...RANGES.values()].flatMap(r => [r.min, r.max, ...r.qualifiers.flatMap(q => [q.plus, q.minus])]).filter(Boolean))

const words = s => s.split(/\s+/).filter(Boolean)
const capitalise = s => s.charAt(0).toUpperCase() + s.slice(1)
const humanise = s => capitalise(String(s).replace(/_/g, ' '))

// A choice group's row label and each member's short name: the words every
// member's label shares, and what is left of each. "Standard count vs suits"
// and "Upside-down count vs suits" are "Count vs suits": "Standard" and
// "Upside-down". With nothing shared, the group's own name and the labels.
function choiceNames(group, members) {
  const labels = members.map(p => FIELDS[p].label)
  const lists = labels.map(l => words(l))
  const shared = lists[0].filter(w => lists.every(list => list.includes(w)))
  if (!shared.length) {
    return { label: humanise(group.slice(group.lastIndexOf('.') + 1)), short: labels }
  }
  const label = capitalise(shared.join(' ').replace(/[:,]$/, ''))
  const short = lists.map((list, i) => {
    const rest = list.filter(w => !shared.includes(w)).join(' ').replace(/^[:,(]+|[:,)]+$/g, '').trim()
    return rest ? capitalise(rest) : labels[i]
  })
  return { label, short }
}

const sectionOf = path => path.slice(0, path.indexOf('.'))
const foldText = s => s.trim().replace(/\s+/g, ' ').toLowerCase()

/** A yes/no field's state on a card: its value, else its default, else off. */
const isOn = (values, path) => (values.has(path) ? values.get(path) : FIELDS[path].default) === true

// Each row's reader: card values → { recorded, key, text }. `key` compares,
// `text` shows; `recorded: false` is "not recorded".
function fieldReader(path) {
  const def = FIELDS[path]
  if (def.kind === 'bool') {
    return values => {
      const on = isOn(values, path)
      return { recorded: true, key: on ? 'yes' : 'no', text: on ? 'Yes' : null }
    }
  }
  return values => {
    if (!values.has(path)) return { recorded: false, key: null, text: null }
    const v = values.get(path)
    if (def.kind === 'text') {
      const text = String(v).trim()
      return text ? { recorded: true, key: foldText(text), text } : { recorded: false, key: null, text: null }
    }
    return { recorded: true, key: String(v), text: def.kind === 'enum' ? humanise(v) : String(v) }
  }
}

function choiceReader(members, short) {
  return values => {
    const on = members.map((p, i) => (isOn(values, p) ? i : -1)).filter(i => i >= 0)
    return on.length
      ? { recorded: true, key: on.join('+'), text: on.map(i => short[i]).join(' + ') }
      : { recorded: true, key: 'none', text: null }
  }
}

function rangeReader(range) {
  const end = (values, path, q) => {
    if (!values.has(path)) return ''
    const sign = q.plus && isOn(values, q.plus) ? '+' : q.minus && isOn(values, q.minus) ? '-' : ''
    return `${values.get(path)}${sign}`
  }
  return values => {
    const lo = end(values, range.min, range.qualifiers[0])
    const hi = end(values, range.max, range.qualifiers[1])
    if (!lo && !hi) return { recorded: false, key: null, text: null }
    const text = `${lo}–${hi}`
    return { recorded: true, key: text, text }
  }
}

// The rows the spec gives, in its order: a choice group where its first
// member stands, a range where its minimum does.
const ROWS = []
{
  const placed = new Set()
  for (const [path, def] of Object.entries(FIELDS)) {
    if (placed.has(path)) continue
    if (RANGES.has(path)) {
      const range = RANGES.get(path)
      ROWS.push({
        key: path.slice(0, -'_min'.length),
        section: sectionOf(path),
        label: def.label.replace(/[:,]\s*minimum$/, ''),
        paths: [range.min, range.max],
        read: rangeReader(range),
      })
      continue
    }
    if (IN_RANGE.has(path)) continue
    if (def.choice) {
      const members = CHOICES.get(def.choice)
      members.forEach(p => placed.add(p))
      const { label, short } = choiceNames(def.choice, members)
      ROWS.push({ key: def.choice, section: sectionOf(path), label, paths: members, read: choiceReader(members, short) })
      continue
    }
    ROWS.push({ key: path, section: sectionOf(path), label: def.label, paths: [path], read: fieldReader(path) })
  }
}

// other_agreements entries (ADR-0001 D5): by convention ID, else by their text.
function agreementsOf(card_data) {
  const list = Array.isArray(card_data?.other_agreements) ? card_data.other_agreements : []
  const out = new Map()
  for (const a of list) {
    if (!a || typeof a.text !== 'string') continue
    const key = a.id ? `id:${a.id}` : `text:${foldText(a.text)}`
    if (!out.has(key)) out.set(key, a)
  }
  return out
}

function unwrap(card, i) {
  const data = card?.card_data && typeof card.card_data === 'object' ? card.card_data : card || {}
  const meta = data.metadata || {}
  const name = card?.name || meta.name || `Card ${i + 1}`
  const names = typeof meta.partner_names === 'string' ? meta.partner_names.trim() : ''
  return { id: card?.id ?? null, name, names, data }
}

/**
 * Compare cards, each a bare `card_data` or a record `{ id, name, card_data }`.
 *
 * Returns `{ cards, rows }`. `cards` are the columns, in the order given:
 * `{ id, name, names }`. Each row is `{ key, section, label, paths, status,
 * cells, blanks }`: `status` is 'differs' (two cards record different
 * values, or one records it and another doesn't) or 'same'; `blanks` is
 * how many cards don't record it; `cells`, one per card, are `{ recorded,
 * text }`, with `text` null for a box that is off or a choice with none
 * chosen. Rows no card sets at all are left out.
 */
export function compareCards(cards) {
  const columns = (cards || []).map(unwrap)
  const values = columns.map(c => cardValues(c.data))
  const rows = []

  // A row needs a card that sets it: a default alone (five-card majors)
  // would put it on every card.
  const add = (row, readings, setSomewhere = true) => {
    const recorded = readings.filter(r => r.recorded)
    if (!setSomewhere || !recorded.some(r => r.text != null)) return
    const blanks = readings.length - recorded.length
    const status = blanks || new Set(recorded.map(r => r.key)).size > 1 ? 'differs' : 'same'
    rows.push({
      key: row.key,
      section: row.section,
      label: row.label,
      paths: row.paths,
      status,
      blanks,
      cells: readings.map(r => ({ recorded: r.recorded, text: r.text })),
    })
  }

  for (const row of ROWS) {
    add(row, values.map(v => row.read(v)), values.some(v => row.paths.some(p => v.has(p))))
  }

  // Agreements kept in other_agreements, after the fields.
  const agreements = columns.map(c => agreementsOf(c.data))
  const seen = new Map()
  for (const list of agreements) for (const [key, a] of list) if (!seen.has(key)) seen.set(key, a)
  for (const [key, a] of seen) {
    const label = (a.id && CONVENTIONS[a.id]?.name) || a.text
    add(
      { key: `other_agreements.${key}`, section: 'other_agreements', label, paths: ['other_agreements'] },
      agreements.map(list => {
        const mine = list.get(key)
        return mine
          ? { recorded: true, key: 'yes', text: a.id ? mine.text || 'Yes' : 'Yes' }
          : { recorded: true, key: 'no', text: null }
      }),
    )
  }

  return { cards: columns.map(({ id, name, names }) => ({ id, name, names })), rows }
}
