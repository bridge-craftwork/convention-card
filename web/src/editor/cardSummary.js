// A card at a glance, for the table of cards on the editor's home page
// (CardCatalog.vue): its names, its system, how many conventions
// it plays by level band, and a few settings that tell similar cards apart.
// Plain functions of card_data and the spec, so tests can run them.

import { CONVENTION_CATALOG, isEntryChecked, getLevelNumberForEntry } from './conventionCatalog.js'
import { SKILL_LEVELS, bandOf } from './levels.js'
import { readPath } from '../../../js/paths.js'
import { field } from '../../../js/spec.js'
import { upgradeCardData } from '../../../js/migrate.js'

const SYSTEM_NAMES = {
  two_over_one: '2/1',
  sayc: 'SAYC',
  polish_club: 'Polish Club',
  precision: 'Precision',
  acol: 'Acol',
}

/** The system: the card's own words, else its category's name. */
export function systemOf(data) {
  const text = String(readPath(data, 'general.system') || '').trim()
  if (text) return text
  const category = readPath(data, 'general.system_category')
  return SYSTEM_NAMES[category] || (category ? String(category) : '')
}

/**
 * A card's level (DECISIONS.md, open question 9; the rule on trial): the
 * highest level that at least `CARD_LEVEL_SPREAD` of its conventions reach,
 * so one exotic convention does not make a card "expert"; with fewer
 * conventions than that, the highest. `{ level, band, why }` or null.
 */
export const CARD_LEVEL_SPREAD = 3

export function cardLevel(data) {
  const levels = []
  const names = []
  for (const entry of CONVENTION_CATALOG) {
    if (!isEntryChecked(entry, data)) continue
    const level = getLevelNumberForEntry(entry)
    if (!level) continue
    levels.push(level)
    names.push([level, entry.name])
  }
  if (!levels.length) return null
  levels.sort((a, b) => b - a)
  const level = levels[Math.min(CARD_LEVEL_SPREAD, levels.length) - 1]
  const atOrAbove = names.filter(([l]) => l >= level).sort((a, b) => b[0] - a[0]).map(([l, n]) => `${n} (${l})`)
  return {
    level,
    band: bandOf(level),
    why: `Level ${level}: the highest level at least ${Math.min(CARD_LEVEL_SPREAD, levels.length)} of its conventions reach (${atOrAbove.slice(0, 6).join(', ')}${atOrAbove.length > 6 ? ', …' : ''})`,
  }
}

/** How many conventions the card plays, by band, and the highest level among them. */
export function levelsOf(data) {
  const bands = Object.fromEntries(SKILL_LEVELS.map(b => [b, 0]))
  let highest = 0
  let total = 0
  for (const entry of CONVENTION_CATALOG) {
    if (!isEntryChecked(entry, data)) continue
    const level = getLevelNumberForEntry(entry)
    bands[bandOf(level)]++
    highest = Math.max(highest, level || 0)
    total++
  }
  return { total, bands, highest: highest || null }
}

// A range end with its qualifier: "14+", "17-".
function end(data, path) {
  const n = readPath(data, path)
  if (n == null || n === '') return ''
  return `${n}${readPath(data, `${path}_plus`) ? '+' : readPath(data, `${path}_minus`) ? '-' : ''}`
}

const on = (data, path) => readPath(data, path) === true

// A range's two ends, "15–17", or ''
function rangeOf(data, path) {
  const lo = end(data, `${path}.range_min`)
  const hi = end(data, `${path}.range_max`)
  return lo || hi ? `${lo}–${hi}` : ''
}

/**
 * Settings that tell similar cards apart, in order of how much they say.
 * The table shows those whose values differ between the cards listed.
 */
export const DISTINGUISHING = [
  {
    key: 'nt_range',
    label: '1NT',
    value: data => {
      const main = rangeOf(data, 'notrump.one_nt')
      const alt = rangeOf(data, 'notrump.one_nt_alt')
      return alt && alt !== main ? 'Var' : main
    },
    // A range that depends on seat or vulnerability: what "Var" stands for
    title: data => {
      const alt = rangeOf(data, 'notrump.one_nt_alt')
      if (!alt || alt === rangeOf(data, 'notrump.one_nt')) return ''
      const line = (path, range) => [range, readPath(data, `${path}.seat_vul`)].filter(Boolean).join(' ')
      return `${line('notrump.one_nt', rangeOf(data, 'notrump.one_nt'))}; ${line('notrump.one_nt_alt', alt)}`
    },
  },
  {
    key: 'carding',
    label: 'Carding',
    // Vs suits. Std, UD (upside-down count and attitude), SCUDA (standard
    // count, upside-down attitude) or UCSA (upside-down count, standard
    // attitude). A card that sets only one reads the other as standard.
    value: data => {
      const udAttitude = on(data, 'carding.suits.upside_down_attitude')
      const udCount = on(data, 'carding.suits.upside_down_count')
      if (udAttitude) return udCount ? 'UD' : 'SCUDA'
      if (udCount) return 'UCSA'
      return on(data, 'carding.suits.standard_attitude') || on(data, 'carding.suits.standard_count') ? 'Std' : ''
    },
    title: data => ({ Std: 'Standard count and attitude', UD: 'Upside-down count and attitude', SCUDA: 'Standard count, upside-down attitude', UCSA: 'Upside-down count, standard attitude' })[DISTINGUISHING.find(d => d.key === 'carding').value(data)] || '',
  },
  {
    key: 'keycard',
    label: 'Keycard',
    value: data => (on(data, 'slam.rkcb.play') ? (['1430', '0314'].includes(readPath(data, 'slam.rkcb.style')) ? readPath(data, 'slam.rkcb.style') : 'RKCB')
      : on(data, 'slam.blackwood.play') ? 'Blackwood' : ''),
  },
]

/**
 * When a card last changed, as briefly as it can be said: a time today, a day
 * of the week within the past week, otherwise a date.
 */
export function lastEdit(when, now = new Date()) {
  const t = when ? new Date(when) : null
  if (!t || Number.isNaN(t.getTime())) return ''
  const days = (startOfDay(now) - startOfDay(t)) / 86400000
  if (days <= 0) return t.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  if (days < 7) return t.toLocaleDateString(undefined, { weekday: 'short' })
  return t.toLocaleDateString(undefined, { dateStyle: 'medium' })
}

const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()

/** The distinguishing settings (at most `max`) whose values are not all the same across `cards`. */
export function distinguishing(cards, max = 3) {
  if (cards.length < 2) return []
  return DISTINGUISHING
    .filter(d => new Set(cards.map(c => d.value(upgradeCardData(c.card_data || {})))).size > 1)
    .slice(0, max)
}

/** One row of the table. */
export function summarize(card) {
  // A card saved in an older schema is read as the current one.
  const data = upgradeCardData(card.card_data || {})
  return {
    id: card.id,
    name: card.name || 'Untitled card',
    names: String(readPath(data, 'metadata.partner_names') || '').trim(),
    system: systemOf(data),
    levels: levelsOf(data),
    cardLevel: cardLevel(data),
    updated: card.updated_at || null,
  }
}

// ─── Sorting the table ────────────────────────────────────────────
// The sort is a list of `{ key, dir }`, the column last clicked first, so each
// earlier choice breaks the ties of the one after it.

/** The table's columns before and after the distinguishing ones. `value`: what a row sorts by. */
export const SORT_BEFORE = [
  { key: 'name', label: 'Card', value: row => row.name },
  { key: 'names', label: 'Names on the card', value: row => row.names },
  { key: 'system', label: 'System', value: row => row.system },
  { key: 'level', label: 'Level', value: row => row.cardLevel?.level },
  { key: 'conventions', label: 'Conventions', value: row => row.levels.total },
]
export const SORT_AFTER = [
  // To the minute: cards imported together read the same, so they tie.
  { key: 'updated', label: 'Last edit', first: 'desc', value: row => (row.updated ? Math.floor(Date.parse(row.updated) / 60000) : null) },
]

/** The sort after clicking `column`: a second click on the first key turns it round. */
export function nextSort(sort, column) {
  const [head] = sort
  if (head?.key === column.key) return [{ key: column.key, dir: head.dir === 'asc' ? 'desc' : 'asc' }, ...sort.slice(1)]
  return [{ key: column.key, dir: column.first || 'asc' }, ...sort.filter(s => s.key !== column.key)]
}

const isBlank = v => v == null || v === '' || Number.isNaN(v)
const compareValues = (a, b) => (typeof a === 'number' && typeof b === 'number'
  ? a - b
  : String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' }))

/**
 * `rows` in the sort's order; rows it can't tell apart stay in the order they
 * came. A blank goes last either way round, and a key with no column (one
 * that isn't showing just now) is skipped.
 */
export function sortRows(rows, sort, columns) {
  const keys = sort
    .map(s => ({ dir: s.dir === 'desc' ? -1 : 1, value: columns.find(c => c.key === s.key)?.value }))
    .filter(k => k.value)
  return [...rows].sort((x, y) => {
    for (const { dir, value } of keys) {
      const a = value(x)
      const b = value(y)
      if (isBlank(a) || isBlank(b)) {
        if (isBlank(a) !== isBlank(b)) return isBlank(a) ? 1 : -1
        continue
      }
      const order = compareValues(a, b)
      if (order) return order * dir
    }
    return 0
  })
}

// The paths above must stay real fields (a renamed field would quietly show blanks).
export const PATHS = [
  'general.system', 'general.system_category', 'notrump.one_nt.range_min', 'notrump.one_nt.range_max',
  'notrump.one_nt_alt.range_min', 'notrump.one_nt_alt.range_max', 'notrump.one_nt.seat_vul', 'notrump.one_nt_alt.seat_vul',
  'carding.suits.standard_attitude', 'carding.suits.upside_down_attitude',
  'carding.suits.standard_count', 'carding.suits.upside_down_count', 'slam.rkcb.play',
  'slam.rkcb.style', 'slam.blackwood.play',
]
export const unknownPaths = () => PATHS.filter(p => !field(p))
