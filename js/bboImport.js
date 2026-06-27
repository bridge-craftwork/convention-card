/**
 * BBO (Bridge Base Online) ACBL-style convention-card JSON import.
 *
 * BBO's exporter produces a very different shape from bridgeodex:
 *
 *   {
 *     "schema_version": "1.1",
 *     "source": "bbo-acbl",
 *     "cards": [ {
 *       cc_key, title, partner, owner, style,
 *       fields:      { ...flat text slots: "1NTMin1", "majorOther1", ... },
 *       conventions: { ...checkbox flags, each "y" when on: "1NStayman" },
 *       leads:       { "ls-akx-a": "y", ... }   // lead-circle choices
 *     } ]
 *   }
 *
 * - `fields` holds the free-text slots (ranges + "…Other<N>" descriptions).
 * - `conventions` holds the CHECKBOXES — every checked box is a key set to
 *   "y". This is where almost all the boolean agreements live.
 * - `leads` holds "circle which card to lead" choices, keyed
 *   `<ls|ln>-<pattern>-<card>` (ls = vs suits, ln = vs NT).
 *
 * We keep the original card blob under `card_data._bbo_raw`.
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

function on(v) { return v === 'y' || v === true || v === 'on' || v === 1 }

/** Detect a BBO export (vs a bridgeodex one). */
export function isBboCard(input) {
  if (!input || typeof input !== 'object') return false
  const src = String(input.source || '').toLowerCase()
  return src.includes('bbo') || Array.isArray(input.cards)
}

// ─── Checkbox (conventions) map ────────────────────────────────────
// Each BBO `conventions` key → a card_data path + the value to write.
// `true` is a plain boolean checkbox; a string is an enum value (e.g. a
// 2♣ meaning or jump-overcall strength). Card paths match the ones the
// ACBL field maps (acblClassicFillPdf.js) already read, so they light up
// the right boxes on both templates. Min-length and Drury are handled
// specially below.
const CONVENTIONS = {
  // Slam / Blackwood
  '1430': ['other_conventions.blackwood.rkcb_1430', true],
  'rkc': ['other_conventions.blackwood.rkcb_0314', true],
  'blackwood': ['other_conventions.blackwood.standard', true],
  'gerber': ['other_conventions.gerber.play', true],
  'dopi': ['slam.dopi', true],
  'depo': ['slam.depo', true],
  'ropi': ['slam.ropi', true],
  // General / forcing openings
  '2over1GF': ['major_openings.two_over_one.game_force', true],
  'F1C': ['general.forcing_opening_1c', true],
  'F2C': ['general.forcing_opening_2c', true],
  // Major openings
  'major2RaiseW': ['major_openings.jump_raise.weak', true],
  'major2RaiseI': ['major_openings.jump_raise.inv', true],
  'majorO2RaiseW': ['major_openings.jump_raise_after_overcall.weak', true],
  'majorO2RaiseI': ['major_openings.jump_raise_after_overcall.inv', true],
  'major2NTRaise': ['major_openings.jacoby_2nt.play', true],
  'major3NTRaise': ['major_openings.three_nt_raise.play', true],
  'majorSplinter': ['major_openings.splinters.play', true],
  'major1NTF': ['major_openings.one_nt_response.forcing', true],
  'major1NTSF': ['major_openings.one_nt_response.semi_forcing', true],
  // Minor openings
  'minor2RaiseW': ['minor_openings.one_club.jump_raise.weak', true],
  'minor2RaiseI': ['minor_openings.one_club.jump_raise.inv', true],
  'minorO2RaiseW': ['minor_openings.one_club.jump_raise_after_overcall.weak', true],
  'minorO2RaiseI': ['minor_openings.one_club.jump_raise_after_overcall.inv', true],
  'minorSingleRaise': ['minor_openings.one_club.single_raise.nf', true],
  'minorInvForcing': ['minor_openings.inverted_minors.play', true],
  'bypassDs': ['minor_openings.bypass_5_plus', true],
  // 2♣ + weak twos
  '2CStrong': ['two_level.two_clubs.meaning', 'strong'],
  '2CVeryStrong': ['two_level.two_clubs.meaning', 'very_strong'],
  '2DWaiting': ['two_level.two_clubs.2d_response', 'waiting'],
  '2DNeg': ['two_level.two_clubs.2d_response', 'negative'],
  '2DWeak': ['two_level.two_diamonds.meaning', 'weak'],
  '2HWeak': ['two_level.two_hearts.meaning', 'weak'],
  '2SWeak': ['two_level.two_spades.meaning', 'weak'],
  '2D2NT': ['two_level.two_diamonds.two_nt_force', true],
  '2H2NT': ['two_level.two_hearts.two_nt_force', true],
  '2S2NT': ['two_level.two_spades.two_nt_force', true],
  '2DNew': ['two_level.two_diamonds.new_suit_nf', true],
  '2HNew': ['two_level.two_hearts.new_suit_nf', true],
  '2SNew': ['two_level.two_spades.new_suit_nf', true],
  // Other conventional calls
  'WJS': ['other_conventions.weak_jump_shifts_not_in_comp', true],
  'WJSComp': ['other_conventions.weak_jump_shifts_in_comp', true],
  'FSF1': ['other_conventions.fourth_suit_forcing.one_round', true],
  'FSFG': ['other_conventions.fourth_suit_forcing.game_force', true],
  'NMF': ['other_conventions.new_minor_forcing.play', true],
  'NMF2': ['other_conventions.two_way_nmf', true],
  // 1NT
  '1N5M': ['notrump.one_nt.five_card_major', 'sometimes'],
  '1NStayman': ['notrump.stayman.forcing', true],
  '1NPuppet': ['notrump.stayman.puppet', true],
  '1N2DTrans': ['notrump.transfers.jacoby', true],
  '1N2HTrans': ['notrump.transfers.jacoby', true],
  '1NTexas': ['notrump.transfers.texas', true],
  '1NSmolen': ['notrump.smolen.play', true],
  '1NLeb': ['notrump.lebensohl.over_interference', true],
  '1NNeg': ['notrump.dbl.negative', true],
  // 2NT
  '2NPuppet': ['notrump.two_nt.puppet', true],
  '2NJacoby': ['notrump.two_nt.transfers_3level', true],
  '2NTexas': ['notrump.two_nt.transfers_4level', true],
  // Special doubles
  'dblNegative': ['doubles.negative.play', true],
  'dblResponsive': ['doubles.responsive.play', true],
  'dblMaximal': ['doubles.maximal', true],
  'dblSupport': ['doubles.support.play', true],
  'rdblSupport': ['doubles.support.rdbl', true],
  // Overcalls
  'ocallNSF': ['overcalls.responses.new_suit', 'forcing'],
  'ocallNSC': ['overcalls.responses.new_suit', 'nf_constructive'],
  'ocallJRW': ['overcalls.responses.jump_raise', 'weak'],
  'jOcallW': ['overcalls.jump', 'weak'],
  'jOcallI': ['overcalls.jump', 'intermediate'],
  'jOcallS': ['overcalls.jump', 'strong'],
  // Preempts
  'preS': ['preempts.three_level_style', 'sound'],
  'preL': ['preempts.three_level_style', 'light'],
  'preVL': ['preempts.three_level_style', 'very_light'],
  // Direct cuebids (Michaels)
  'cueMinorM': ['direct_cuebids.nat_minors_michaels', true],
  'cueMajorM': ['direct_cuebids.nat_majors_michaels', true],
  // NT overcalls
  'systemOn': ['nt_overcalls.direct.systems_on', true],
  'systemOnB': ['nt_overcalls.balance.systems_on', true],
  '2NTOcallLowest': ['nt_overcalls.jump_2nt_lowest_unbid', true],
  // Vs takeout double
  'vsTONSF1': ['vs_to_double.new_suit_forcing_1lvl', true],
  'vsTONSF2': ['vs_to_double.new_suit_forcing_2lvl', true],
  'vsTORdbl': ['vs_to_double.redouble.ten_plus', true],
  'vsTOMajorsLP': ['vs_to_double.two_nt_raise_majors.limit_plus', true],
  'vsTOMinorsLP': ['vs_to_double.two_nt_raise_minors.limit_plus', true],
  // Vs preempts
  'vsPreTO': ['vs_preempts.takeout_double', true],
  'vsPreLeb': ['vs_preempts.lebensohl_response', true],
  // Leads + carding
  '4thSuits': ['leads.vs_suits.length.fourth_best', true],
  '4thNT': ['leads.vs_nt.length.fourth_best', true],
  'primaryA': ['carding.partner_lead.attitude', true],
  'primaryC': ['carding.partner_lead.count', true],
  'primarySP': ['carding.partner_lead.suit_preference', true],
  'UDCSuits': ['carding.suits.upside_down_count', true],
  'UDCNT': ['carding.nt.upside_down_count', true],
  'UDASuits': ['carding.suits.upside_down_attitude', true],
  'UDANT': ['carding.nt.upside_down_attitude', true],
  'smithSuits': ['carding.smith_echo_suits', true],
  'smithNT': ['carding.smith_echo_nt', true],
  'trumpSP': ['carding.trump_signals', 'Suit Preference']
}

/**
 * Convert a BBO ACBL card export into `{ name, description, card_data }`.
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
  const conv = card.conventions || {}
  const leads = card.leads || {}

  const name = (card.title || 'Imported BBO card').trim()
  const partnerNames = (f.names && String(f.names).trim()) || name

  const card_data = {
    schema_version: '1.0',
    format: 'bridge_classroom',
    metadata: { name, source: 'bbo', partner_names: partnerNames },
    general: {},
    notrump: { one_nt: {}, one_nt_alt: {}, two_nt: {}, transfers: {}, stayman: {}, lebensohl: {}, dbl: {}, responses: {} },
    three_nt: {},
    major_openings: { one_nt_response: {}, jump_raise: {}, jump_raise_after_overcall: {}, jacoby_2nt: {}, splinters: {}, three_nt_raise: {}, two_over_one: {}, drury: {} },
    minor_openings: { one_club: { jump_raise: {}, jump_raise_after_overcall: {}, single_raise: {} }, one_diamond: {}, inverted_minors: {} },
    two_level: { two_clubs: {}, two_diamonds: {}, two_hearts: {}, two_spades: {} },
    slam: {},
    other_conventions: { blackwood: {}, gerber: {}, fourth_suit_forcing: {}, new_minor_forcing: {} },
    competitive: { vs_1nt_strong: {}, vs_1nt_weak: {} },
    overcalls: { responses: {} },
    nt_overcalls: { direct: {}, balance: {} },
    doubles: { negative: {}, responsive: {}, support: {} },
    preempts: {},
    vs_preempts: {},
    direct_cuebids: {},
    carding: { suits: {}, nt: {}, partner_lead: {} },
    leads: { vs_suits: { length: {}, honors: {} }, vs_nt: { length: {}, honors: {} } },
    notes: {},
    _bbo_raw: card
  }

  // ─── Checkboxes (conventions) ─────────────────────────────────
  applyConventions(conv, card_data)
  applyLeads(leads, card_data)

  // ─── General ──────────────────────────────────────────────────
  if (f.approach) card_data.general.system = suits(f.approach)

  // ─── 1NT opening ──────────────────────────────────────────────
  setIf(card_data.notrump.one_nt, 'range_min', rangeNum(f['1NTMin1']))
  setIf(card_data.notrump.one_nt, 'range_max', rangeNum(f['1NTMax1']))
  setIf(card_data.notrump.one_nt_alt, 'range_min', rangeNum(f['1NTMin2']))
  setIf(card_data.notrump.one_nt_alt, 'range_max', rangeNum(f['1NTMax2']))
  if (f['1NSysOn'])     card_data.notrump.one_nt.sys_on_vs = suits(f['1NSysOn'])
  if (f['1N2S'])        card_data.notrump.responses['2s_other']  = suits(f['1N2S'])
  if (f['1N2N'])        card_data.notrump.responses['2nt_other'] = suits(f['1N2N'])
  if (f['1N3C'])        card_data.notrump.responses['3c'] = suits(f['1N3C'])
  if (f['1N3D'])        card_data.notrump.responses['3d'] = suits(f['1N3D'])
  if (f['1N3H'])        card_data.notrump.responses['3h'] = suits(f['1N3H'])
  if (f['1N3S'])        card_data.notrump.responses['3s'] = suits(f['1N3S'])
  if (f['1NLebDenies']) card_data.notrump.lebensohl.description = suits(f['1NLebDenies'])
  if (f['1NNegOther'])  card_data.notrump.dbl.negative_desc = suits(f['1NNegOther'])

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
  if (f['2CMax'] && String(f['2CMax']).trim()) card_data.two_level.two_clubs.max_hcp = String(f['2CMax']).trim()
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

  // ─── Defense vs 1NT (strong = column 1, weak = column 2) ──────
  if (f.vs1NTHead1) card_data.competitive.vs_1nt_strong.system = suits(f.vs1NTHead1)
  if (f.vs1NTHead2) card_data.competitive.vs_1nt_weak.system = suits(f.vs1NTHead2)
  for (const bid of ['2C', '2D', '2H', '2S', '2N', 'Dbl']) {
    const path = bid.toLowerCase().replace('2n', '2nt')
    if (f[`vs1NT${bid}1`]) card_data.competitive.vs_1nt_strong[path] = suits(f[`vs1NT${bid}1`])
    if (f[`vs1NT${bid}2`]) card_data.competitive.vs_1nt_weak[path] = suits(f[`vs1NT${bid}2`])
  }

  // ─── Vs preempts ──────────────────────────────────────────────
  if (f.vsPreTOThru) card_data.vs_preempts.takeout_double_thru = suits(f.vsPreTOThru)

  // ─── Slam level ───────────────────────────────────────────────
  if (f.slamLevel) card_data.slam.trump_level = suits(f.slamLevel)

  // ─── Notes — every descriptive slot we didn't structure ───────
  setNotes(card_data.notes, 'notrump_notes', [f['1NOther1'], f['1NOther2'], f['1NOther3'], f['2NOther'], f.CNTOther1])
  setNotes(card_data.notes, 'major_notes', [f.majorOther1, f.majorOther2])
  setNotes(card_data.notes, 'minor_notes', [f.minorOther1, f.minorOther2])
  setNotes(card_data.two_level.two_clubs, 'notes',
    [f['2COther1'], f['2COther4'], f['2COther5'], f['2COther6']])
  setNotes(card_data.slam, 'notes', [f.slamOther1, f.slamOther2])
  setNotes(card_data.nt_overcalls, 'notes', [f['1NOcallOther1'], f['1NOcallOther2']])
  setNotes(card_data.overcalls, 'notes', [f.ocallOther])
  setNotes(card_data.competitive, 'notes', [f.vs1NTOther1, f.vs1NTOther2])
  setNotes(card_data.doubles, 'notes', [f.dblOther2, f.dblOther3, f.dblOther4, f.dblOther5])
  setNotes(card_data.direct_cuebids, 'description', [f.cueOther])
  setNotes(card_data.vs_to_double, 'notes', [f.vsTOOther])
  setNotes(card_data.carding, 'notes', [f.discardOther])
  // BBO's OTHER-CONV-CALLS lines, top to bottom: other1 trails New Minor
  // Forcing, other2 trails Weak Jump Shifts, other3 trails 4th Suit
  // Forcing, and other4/other5 are the two bottom catch-all lines.
  if (f.other1) card_data.other_conventions.nmf_notes = suits(f.other1)
  if (f.other2) card_data.other_conventions.weak_jump_shifts_notes = suits(f.other2)
  if (f.other3) card_data.other_conventions.fourth_suit_forcing.notes = suits(f.other3)
  if (f.other4) card_data.other_conventions.notes_line_1 = suits(f.other4)
  if (f.other5) card_data.other_conventions.notes_line_2 = suits(f.other5)

  pruneEmpty(card_data)

  return { name, description: 'Imported from BBO', card_data }
}

/** Apply the `conventions` checkbox map (+ Drury & min-length specials). */
function applyConventions(conv, card_data) {
  for (const [key, raw] of Object.entries(conv)) {
    if (!on(raw)) continue
    const entry = CONVENTIONS[key]
    if (entry) {
      setPath(card_data, entry[0], entry[1])
      continue
    }
    // Drury — BBO splits into druryRev / drury / drury2W / druryFit.
    if (key === 'druryRev') { setPath(card_data, 'major_openings.drury.play', true); setPath(card_data, 'major_openings.drury.reverse', true); continue }
    if (key === 'drury')    { setPath(card_data, 'major_openings.drury.play', true); continue }
    if (key === 'drury2W')  { setPath(card_data, 'major_openings.drury.play', true); setPath(card_data, 'major_openings.drury.two_way', true); continue }
    // Min-length flags: major12-5 / major34-4 / minorC3 / minorD5 …
    const major = key.match(/^major(12|34)-([45])$/)
    if (major) { setPath(card_data, major[1] === '12' ? 'major_openings.min_length_1st_2nd' : 'major_openings.min_length_3rd_4th', Number(major[2])); continue }
    const minor = key.match(/^minor([CD])([345])$/)
    if (minor) { setPath(card_data, minor[1] === 'C' ? 'minor_openings.one_club.min_length' : 'minor_openings.one_diamond.min_length', Number(minor[2])); continue }
    // Unknown convention key — left in _bbo_raw for a future mapping.
  }
}

/**
 * Apply BBO `leads` keys ("ls-akx-a" / "ln-xxxx-3") to the lead_choice_*
 * fields the New-template circle renderer reads. ls = vs suits, ln = vs NT;
 * the trailing token is the chosen card (letter → its position in the
 * pattern, or a bare digit position).
 */
function applyLeads(leads, card_data) {
  for (const [key, raw] of Object.entries(leads)) {
    if (!on(raw)) continue
    const m = key.match(/^(ls|ln)-([a-z0-9]+)-([a-z0-9]+)$/i)
    if (!m) continue
    const side = m[1] === 'ls' ? 'vs_suits' : 'vs_nt'
    const pattern = m[2].toLowerCase()
    const card = m[3].toLowerCase()
    const group = /^x+$/.test(pattern) ? 'length' : 'honors'
    let pos = /^\d+$/.test(card) ? Number(card) : pattern.indexOf(card) + 1
    if (!pos || pos < 1) continue
    setPath(card_data, `leads.${side}.${group}.lead_choice_${pattern}`, pos)
  }
}

function setIf(obj, key, value) {
  if (value != null) obj[key] = value
}

/** Set a dotted path, creating intermediate objects. */
function setPath(root, path, value) {
  const parts = path.split('.')
  let cur = root
  for (let i = 0; i < parts.length - 1; i++) {
    if (cur[parts[i]] == null || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {}
    cur = cur[parts[i]]
  }
  cur[parts[parts.length - 1]] = value
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
