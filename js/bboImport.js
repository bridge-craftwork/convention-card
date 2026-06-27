/**
 * BBO (Bridge Base Online) ACBL-style convention-card JSON import.
 *
 * BBO's exporter produces a very different shape from bridgeodex:
 *
 *   {
 *     "schema_version": "1.1",
 *     "source": "bbo-acbl",
 *     "cards": [ { cc_key, title, partner, owner, style, fields: {...} } ]
 *   }
 *
 * `fields` is a flat map of ACBL-card slots. Unlike bridgeodex (which
 * uses "on" booleans for checkboxes), the BBO card is almost entirely
 * FREE TEXT — ranges like "1NTMin1": "14+" plus a lot of "…Other<N>"
 * description slots. So this importer is mostly: parse the handful of
 * numeric ranges into structured fields, and route the descriptive
 * slots into the matching card_data text/notes fields.
 *
 * We keep the original blob under `card_data._bbo_raw` so nothing is
 * lost and a future, richer mapping can recover anything we skipped.
 */

import { normalizeSuitShorthand } from './cardFormatting.js'

function suits(text) {
  if (text == null) return text
  const t = String(text).trim()
  return t ? normalizeSuitShorthand(t) : t
}

/** Leading integer of a range string: "14+" → 14, "17" → 17, "" → null. */
function rangeNum(value) {
  if (value == null || value === '') return null
  const m = String(value).trim().match(/^([+-]?\d+)/)
  if (!m) return null
  const n = parseInt(m[1], 10)
  return Number.isFinite(n) ? n : null
}

/** Detect a BBO export (vs a bridgeodex one). */
export function isBboCard(input) {
  if (!input || typeof input !== 'object') return false
  const src = String(input.source || '').toLowerCase()
  return src.includes('bbo') || Array.isArray(input.cards)
}

/**
 * Convert a BBO ACBL card export into `{ name, description, card_data }`.
 * Imports the first card in the `cards` array (BBO exports one card per
 * file in practice).
 */
export function importBboJson(input) {
  if (!input || typeof input !== 'object') {
    throw new Error('BBO file is empty or not JSON')
  }
  const card = Array.isArray(input.cards) ? input.cards[0] : input
  if (!card || typeof card !== 'object') {
    throw new Error('BBO file has no cards')
  }
  const f = card.fields || {}

  const name = (card.title || 'Imported BBO card').trim()

  const card_data = {
    schema_version: '1.0',
    format: 'bridge_classroom',
    metadata: { name, source: 'bbo', partner_names: name },
    general: {},
    notrump: { one_nt: {}, one_nt_alt: {}, two_nt: {}, transfers: {}, stayman: {}, lebensohl: {}, dbl: {}, responses: {} },
    three_nt: {},
    major_openings: { three_nt_raise: {} },
    minor_openings: { one_club: {}, one_diamond: {} },
    two_level: { two_clubs: {}, two_diamonds: {}, two_hearts: {}, two_spades: {} },
    three_nt_resp: {},
    slam: {},
    other_conventions: {},
    competitive: { vs_1nt_strong: {}, vs_1nt_weak: {} },
    overcalls: {},
    nt_overcalls: { direct: {}, balance: {} },
    doubles: {},
    vs_preempts: {},
    carding: {},
    notes: {},
    _bbo_raw: card
  }

  // ─── General ──────────────────────────────────────────────────
  if (f.approach) card_data.general.system = suits(f.approach)

  // ─── 1NT opening ──────────────────────────────────────────────
  setIf(card_data.notrump.one_nt, 'range_min', rangeNum(f['1NTMin1']))
  setIf(card_data.notrump.one_nt, 'range_max', rangeNum(f['1NTMax1']))
  if (f['1NSysOn'])     card_data.notrump.one_nt.sys_on_vs = suits(f['1NSysOn'])
  if (f['1N2S'])        card_data.notrump.responses['2s_other']  = suits(f['1N2S'])
  if (f['1N2N'])        card_data.notrump.responses['2nt_other'] = suits(f['1N2N'])
  if (f['1N3C'])        card_data.notrump.responses['3c'] = suits(f['1N3C'])
  if (f['1N3D'])        card_data.notrump.responses['3d'] = suits(f['1N3D'])
  if (f['1N3H'])        card_data.notrump.responses['3h'] = suits(f['1N3H'])
  if (f['1N3S'])        card_data.notrump.responses['3s'] = suits(f['1N3S'])
  if (f['1NLebDenies']) {
    card_data.notrump.lebensohl.over_interference = true
    card_data.notrump.lebensohl.description = suits(f['1NLebDenies'])
  }

  // ─── 2NT opening ──────────────────────────────────────────────
  setIf(card_data.notrump.two_nt, 'range_min', rangeNum(f['2NTMin']))
  setIf(card_data.notrump.two_nt, 'range_max', rangeNum(f['2NTMax']))
  if (f['2N3S']) card_data.notrump.two_nt.three_s_desc = suits(f['2N3S'])

  // ─── 3NT opening ──────────────────────────────────────────────
  if (f['3NOther']) {
    card_data.three_nt.one_suit = true
    card_data.three_nt.one_suit_desc = suits(f['3NOther'])
  }

  // ─── Major openings ───────────────────────────────────────────
  setIf(card_data.major_openings.three_nt_raise, 'range_min', rangeNum(f.major3NTMin))
  setIf(card_data.major_openings.three_nt_raise, 'range_max', rangeNum(f.major3NTMax))

  // ─── Minor openings (1♣ range columns) ────────────────────────
  setIf(card_data.minor_openings.one_club, 'one_nt_range_min', rangeNum(f.minor1NTMin))
  setIf(card_data.minor_openings.one_club, 'one_nt_range_max', rangeNum(f.minor1NTMax))
  setIf(card_data.minor_openings.one_club, 'two_nt_range_min', rangeNum(f.minor2NTMin))
  setIf(card_data.minor_openings.one_club, 'two_nt_range_max', rangeNum(f.minor2NTMax))
  setIf(card_data.minor_openings.one_club, 'three_nt_range_min', rangeNum(f.minor3NTMin))
  setIf(card_data.minor_openings.one_club, 'three_nt_range_max', rangeNum(f.minor3NTMax))

  // ─── 2♣ + weak twos ───────────────────────────────────────────
  if (f['2CMin']) card_data.two_level.two_clubs.min_hcp_str = String(f['2CMin']).trim()
  for (const [suit, key] of [['two_diamonds', '2D'], ['two_hearts', '2H'], ['two_spades', '2S']]) {
    const obj = card_data.two_level[suit]
    setIf(obj, 'min_hcp', rangeNum(f[`${key}Min`]))
    setIf(obj, 'max_hcp', rangeNum(f[`${key}Max`]))
    if (f[`${key}Other1`]) obj.description = suits(f[`${key}Other1`])
    if (f[`${key}Other2`]) obj.notes = suits(f[`${key}Other2`])
  }

  // ─── Overcalls ────────────────────────────────────────────────
  setIf(card_data.overcalls, 'one_level_min', rangeNum(f.ocallMin))
  setIf(card_data.overcalls, 'one_level_max', rangeNum(f.ocallMax))

  // ─── NT overcalls ─────────────────────────────────────────────
  setIf(card_data.nt_overcalls.direct, 'range_min', rangeNum(f['1NOcallDMin']))
  setIf(card_data.nt_overcalls.direct, 'range_max', rangeNum(f['1NOcallDMax']))
  setIf(card_data.nt_overcalls.balance, 'range_min', rangeNum(f['1NOcallBMin']))
  setIf(card_data.nt_overcalls.balance, 'range_max', rangeNum(f['1NOcallBMax']))

  // ─── Defense vs 1NT ───────────────────────────────────────────
  if (f.vs1NT2C1)  card_data.competitive.vs_1nt_strong['2c']  = suits(f.vs1NT2C1)
  if (f.vs1NT2D1)  card_data.competitive.vs_1nt_strong['2d']  = suits(f.vs1NT2D1)
  if (f.vs1NT2H1)  card_data.competitive.vs_1nt_strong['2h']  = suits(f.vs1NT2H1)
  if (f.vs1NT2S1)  card_data.competitive.vs_1nt_strong['2s']  = suits(f.vs1NT2S1)
  if (f.vs1NTDbl1) card_data.competitive.vs_1nt_strong['dbl'] = suits(f.vs1NTDbl1)
  if (f.vs1NTOther1) card_data.competitive.vs_1nt_strong.other = suits(f.vs1NTOther1)

  // ─── Vs preempts ──────────────────────────────────────────────
  if (f.vsPreTOThru) card_data.vs_preempts.takeout_double_thru = suits(f.vsPreTOThru)

  // ─── Notes (every descriptive slot we didn't structure) ───────
  setNotes(card_data.notes, 'notrump_notes', [f['1NOther1'], f['1NOther2']])
  setNotes(card_data.notes, 'major_notes', [f.majorOther1, f.majorOther2])
  setNotes(card_data.notes, 'minor_notes', [f.minorOther1, f.minorOther2])
  setNotes(card_data.two_level.two_clubs, 'notes',
    [f['2COther1'], f['2COther5'], f['2COther6']])
  setNotes(card_data.slam, 'notes', [f.slamOther1, f.slamOther2])
  setNotes(card_data.nt_overcalls, 'notes', [f['1NOcallOther2']])
  setNotes(card_data.competitive, 'notes', [f.vs1NTOther2])
  setNotes(card_data.doubles, 'notes', [f.dblOther2, f.dblOther3, f.dblOther4])
  setNotes(card_data.carding, 'notes', [f.signalsOther2])
  setNotes(card_data.other_conventions, 'notes', [f.other3])

  pruneEmpty(card_data)

  return {
    name,
    description: 'Imported from BBO',
    card_data
  }
}

function setIf(obj, key, value) {
  if (value != null) obj[key] = value
}

/** Join the non-empty descriptive strings and store under `key` if any. */
function setNotes(target, key, values) {
  const lines = values.filter(v => v != null && String(v).trim() !== '').map(suits)
  if (lines.length) target[key] = lines.join('\n')
}

function pruneEmpty(obj) {
  if (obj == null || typeof obj !== 'object' || Array.isArray(obj)) return
  for (const key of Object.keys(obj)) {
    const v = obj[key]
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      pruneEmpty(v)
      if (Object.keys(v).length === 0 && !['_bbo_raw', 'metadata'].includes(key)) {
        delete obj[key]
      }
    } else if (v === null || v === '') {
      delete obj[key]
    }
  }
}
