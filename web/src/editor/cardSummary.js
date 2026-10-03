// A card at a glance, for the table of cards on the editor's home page
// (CardCatalog.vue): its names, its system, how many conventions
// it plays by level band, and a few settings that tell similar cards apart.
// Plain functions of card_data and the spec, so tests can run them.

import { CONVENTION_CATALOG, isEntryChecked, getLevelNumberForEntry } from './conventionCatalog.js'
import { SKILL_LEVELS, bandOf } from './levels.js'
import { readPath } from '../../../js/paths.js'
import { field } from '../../../js/spec.js'

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

/**
 * Settings that tell similar cards apart, in order of how much they say.
 * The table shows those whose values differ between the cards listed.
 */
export const DISTINGUISHING = [
  {
    key: 'nt_range',
    label: '1NT',
    value: data => {
      const lo = end(data, 'notrump.one_nt.range_min')
      const hi = end(data, 'notrump.one_nt.range_max')
      return lo || hi ? `${lo}–${hi}` : ''
    },
  },
  {
    key: 'two_over_one',
    label: '2/1',
    value: data => (on(data, 'major_openings.two_over_one.game_force') ? 'GF' : ''),
  },
  {
    key: 'attitude',
    label: 'Attitude',
    value: data => (on(data, 'carding.suits.upside_down_attitude') ? 'Upside-down'
      : on(data, 'carding.suits.standard_attitude') ? 'Standard' : ''),
  },
  {
    key: 'count',
    label: 'Count',
    value: data => (on(data, 'carding.suits.upside_down_count') ? 'Upside-down'
      : on(data, 'carding.suits.standard_count') ? 'Standard' : ''),
  },
  {
    key: 'keycard',
    label: 'Keycard',
    value: data => (on(data, 'slam.blackwood.rkcb_1430') ? '1430'
      : on(data, 'slam.blackwood.rkcb_0314') ? '0314'
        : on(data, 'slam.blackwood.standard') ? 'Blackwood' : ''),
  },
]

/** The distinguishing settings (at most `max`) whose values are not all the same across `cards`. */
export function distinguishing(cards, max = 3) {
  if (cards.length < 2) return []
  return DISTINGUISHING
    .filter(d => new Set(cards.map(c => d.value(c.card_data || {}))).size > 1)
    .slice(0, max)
}

/** One row of the table. */
export function summarize(card) {
  const data = card.card_data || {}
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

// The paths above must stay real fields (a renamed field would quietly show blanks).
export const PATHS = [
  'general.system', 'general.system_category', 'notrump.one_nt.range_min', 'notrump.one_nt.range_max',
  'major_openings.two_over_one.game_force', 'carding.suits.standard_attitude', 'carding.suits.upside_down_attitude',
  'carding.suits.standard_count', 'carding.suits.upside_down_count', 'slam.blackwood.rkcb_1430',
  'slam.blackwood.rkcb_0314', 'slam.blackwood.standard',
]
export const unknownPaths = () => PATHS.filter(p => !field(p))
