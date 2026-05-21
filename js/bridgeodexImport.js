/**
 * Bridgeodex JSON import
 *
 * Converts a card exported from bridgeodex.com into our card_data
 * shape. Lossy where the bridgeodex schema has fields we haven't
 * catalogued yet — we keep the original blob under
 * `card_data._bridgeodex_raw` so nothing's discarded, and the editor
 * can surface those fields once we catalogue them.
 *
 * Bridgeodex quirks we handle here:
 *   - Boolean fields appear as the string "on" when checked; missing
 *     when unchecked.
 *   - Numeric range fields are strings like "14+", "17 Vul", "11+".
 *     We split the leading integer out and stash the trailing
 *     qualifier on the matching seat/vul / notes field.
 *   - Suit shortcodes "!C/!D/!H/!S" appear inside free-text fields;
 *     we normalise to ♣ ♦ ♥ ♠.
 *   - Most "X_thru" fields use the same shortcodes (e.g. "4!H" = 4♥).
 */

import { writePath } from './conventionCatalog.js'
import { normalizeSuitShorthand } from './cardFormatting.js'

function on(v) { return v === 'on' || v === true }

/**
 * Convert every suit-shorthand variant the user might have typed into
 * a real ♠♥♦♣ character. Handles both bridgeodex's "!C/!H/..." style
 * and bare "2C" / "1C" / "S" / "H" patterns. Idempotent.
 */
function suits(text) {
  if (text == null) return text
  return normalizeSuitShorthand(String(text))
}

/**
 * Split a bridgeodex range string into a leading integer and an
 * optional trailing qualifier. "14+" → {n: 14, suffix: null},
 * "17 Vul" → {n: 17, suffix: "Vul"}.
 */
function parseRange(value) {
  if (value == null || value === '') return { n: null, suffix: null }
  const s = String(value).trim()
  const m = s.match(/^([+\-]?\d+)\+?\s*(.*)$/)
  if (!m) return { n: null, suffix: s }
  const n = parseInt(m[1], 10)
  const suffix = m[2].trim() || null
  return { n: Number.isFinite(n) ? n : null, suffix }
}

function num(value) {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

/**
 * Pick a human-readable card name from the bridgeodex payload.
 */
function deriveName(settings) {
  const namesText = settings?.names?.names?.trim()
  if (namesText) return namesText
  return 'Imported bridgeodex card'
}

/**
 * Main converter. Returns `{ name, description, card_data }` ready to
 * pass to the convention-card create endpoint.
 */
export function importBridgeodexJson(input) {
  if (!input || typeof input !== 'object') {
    throw new Error('Bridgeodex file is empty or not JSON')
  }
  const s = input.settings || input
  if (!s || typeof s !== 'object') {
    throw new Error('Bridgeodex file is missing the settings block')
  }

  const card_data = {
    schema_version: '1.0',
    format: 'bridge_classroom',
    metadata: { name: deriveName(s), source: 'bridgeodex' },
    general: {},
    notrump: { one_nt: {}, one_nt_alt: {}, two_nt: {}, transfers: {}, stayman: {}, lebensohl: {}, dbl: {}, responses: {} },
    three_nt: {},
    major_openings: { drury: {}, one_nt_response: {}, jump_raise: {}, jump_raise_after_overcall: {}, jacoby_2nt: {}, splinters: {}, three_nt_raise: {}, two_over_one: {} },
    minor_openings: { one_club: { jump_raise: {}, jump_raise_after_overcall: {}, single_raise: {} }, one_diamond: {} },
    two_level: { two_clubs: {}, two_diamonds: {}, two_hearts: {}, two_spades: {}, ogust: {} },
    slam: { blackwood: {}, gerber: {} },
    other_conventions: { blackwood: {}, gerber: {}, fourth_suit_forcing: {}, new_minor_forcing: {} },
    competitive: { vs_1nt_strong: {}, vs_1nt_weak: {} },
    overcalls: { responses: {} },
    doubles: { negative: {}, responsive: {}, support: {}, maximal: {} },
    preempts: {},
    nt_overcalls: { direct: {}, balance: {} },
    vs_to_double: { redouble: {}, two_nt_raise_minors: {}, two_nt_raise_majors: {} },
    vs_preempts: {},
    direct_cuebids: {},
    carding: { suits: {}, nt: {}, partner_lead: {}, declarer_lead: {}, first_discard: {} },
    leads: { vs_suits: { length: {}, honors: {} }, vs_nt: { length: {}, honors: {} } },
    notes: {},
    _bridgeodex_raw: s
  }

  // ─── Overview ─────────────────────────────────────────────────
  const ov = s.overview || {}
  if (ov.general_approach) card_data.general.system = suits(ov.general_approach)
  card_data.general.min_hcp_open = num(ov.min_exp_hcp_bal_opening)
  card_data.general.min_hcp_respond = num(ov.min_exp_hcp_bal_responding)
  if (on(ov.forcing_1c)) card_data.general.forcing_opening_1c = true
  if (on(ov.forcing_2c)) card_data.general.forcing_opening_2c = true
  if (ov.forcing_other)  card_data.general.forcing_opening_other = suits(ov.forcing_other)
  if (on(ov['1nt_open_str']))      card_data.general.nt_open_style = 'strong'
  if (on(ov['1nt_open_wk']))       card_data.general.nt_open_style = 'weak'
  if (on(ov['1nt_open_variable'])) card_data.general.nt_open_style = 'variable'
  if (ov.bids_prep) card_data.general.bids_requiring_prep = suits(ov.bids_prep)

  // ─── 1NT (primary + alternate) ────────────────────────────────
  const nt = s['1_no_trump'] || {}
  const aMin = parseRange(nt.a_range_min)
  const aMax = parseRange(nt.a_range_max)
  if (aMin.n != null) card_data.notrump.one_nt.range_min = aMin.n
  if (aMax.n != null) card_data.notrump.one_nt.range_max = aMax.n
  card_data.notrump.one_nt.seat_vul = [aMin.suffix, aMax.suffix].filter(Boolean).join(' ').trim() || null

  const bMin = parseRange(nt.b_range_min)
  const bMax = parseRange(nt.b_range_max)
  if (bMin.n != null) card_data.notrump.one_nt_alt.range_min = bMin.n
  if (bMax.n != null) card_data.notrump.one_nt_alt.range_max = bMax.n
  card_data.notrump.one_nt_alt.seat_vul = [bMin.suffix, bMax.suffix].filter(Boolean).join(' ').trim() || null
  if (on(nt.b_range_same_resp)) card_data.notrump.one_nt_alt.same_responses = true

  if (on(nt['5_card_major']))       card_data.notrump.one_nt.five_card_major = 'sometimes'
  if (nt.sys_on_vs)                 card_data.notrump.one_nt.sys_on_vs = suits(nt.sys_on_vs)
  if (on(nt['2c_stayman']))         card_data.notrump.stayman.forcing = true
  if (on(nt['2c_puppet']))          card_data.notrump.stayman.puppet = true
  if (on(nt['2d_tfr']))             card_data.notrump.transfers.jacoby = true
  if (on(nt['2h_tfr']))             card_data.notrump.transfers.jacoby = true
  if (on(nt['2s_tfr']))             card_data.notrump.transfers.spades_relay = true
  if (on(nt['2nt_tfr']))            card_data.notrump.transfers.two_nt = true
  // Texas transfers — bridgeodex has per-suit flags. We mirror them
  // 1:1 (so the per-suit checkboxes light up in the editor) and also
  // keep an umbrella `texas` boolean so the "Texas transfers" catalog
  // row stays checked from a single source of truth.
  if (on(nt.tfr_4c)) card_data.notrump.transfers.texas_4c = true
  if (on(nt.tfr_4d)) card_data.notrump.transfers.texas_4d = true
  if (on(nt.tfr_4h)) card_data.notrump.transfers.texas_4h = true
  if (on(nt.tfr_4s)) card_data.notrump.transfers.texas_4s = true
  if (on(nt.tfr_4c) || on(nt.tfr_4d) || on(nt.tfr_4h) || on(nt.tfr_4s)) {
    card_data.notrump.transfers.texas = true
  }
  if (on(nt.smolen))                card_data.notrump.smolen = { play: true }
  if (on(nt.lebensohl))             card_data.notrump.lebensohl.over_interference = true
  if (nt.lebensohl_desc)            card_data.notrump.lebensohl.description = suits(nt.lebensohl_desc)
  if (on(nt.dbl_neg))               card_data.notrump.dbl.negative = true
  if (on(nt.dbl_pen))               card_data.notrump.dbl.penalty = true
  if (nt.dbl_neg_desc)              card_data.notrump.dbl.negative_desc = suits(nt.dbl_neg_desc)
  if (nt.dbl_other)                 card_data.notrump.dbl.other = suits(nt.dbl_other)
  if (nt['3c']) card_data.notrump.responses['3c'] = suits(nt['3c'])
  if (nt['3d']) card_data.notrump.responses['3d'] = suits(nt['3d'])
  if (nt['3h']) card_data.notrump.responses['3h'] = suits(nt['3h'])
  if (nt['3s']) card_data.notrump.responses['3s'] = suits(nt['3s'])
  if (nt['2d_other']) card_data.notrump.responses['2d_other'] = suits(nt['2d_other'])
  if (nt['2h_other']) card_data.notrump.responses['2h_other'] = suits(nt['2h_other'])
  if (nt['2s_other']) card_data.notrump.responses['2s_other'] = suits(nt['2s_other'])
  if (nt['2nt_other']) card_data.notrump.responses['2nt_other'] = suits(nt['2nt_other'])
  if (nt.more) card_data.notrump.notes = suits(nt.more)

  // ─── 2NT ──────────────────────────────────────────────────────
  const n2 = s['2_no_trump'] || {}
  card_data.notrump.two_nt.range_min = num(n2.range_min)
  card_data.notrump.two_nt.range_max = num(n2.range_max)
  if (on(n2.puppet))    card_data.notrump.two_nt.puppet = true
  if (on(n2['3s']))     card_data.notrump.two_nt.three_s = true
  if (n2['3s_desc'])    card_data.notrump.two_nt.three_s_desc = suits(n2['3s_desc'])
  if (on(n2.tfr_3lvl))  card_data.notrump.two_nt.transfers_3level = true
  if (on(n2.tfr_4lvl))  card_data.notrump.two_nt.transfers_4level = true
  if (on(n2.neg_dbl))   card_data.notrump.two_nt.neg_dbl = true
  if (n2.other)         card_data.notrump.two_nt.notes = suits(n2.other)

  // ─── 3NT ──────────────────────────────────────────────────────
  const n3 = s['3_no_trump'] || {}
  card_data.three_nt.range_min = num(n3.range_min)
  card_data.three_nt.range_max = num(n3.range_max)
  if (on(n3.one_suit))  card_data.three_nt.one_suit = true
  if (n3.one_suit_desc) card_data.three_nt.one_suit_desc = suits(n3.one_suit_desc)

  // ─── Major openings ───────────────────────────────────────────
  const mj = s.majors || {}
  if (on(mj.min_len_1st_2nd_4)) card_data.major_openings.min_length_1st_2nd = 4
  if (on(mj.min_len_1st_2nd_5)) card_data.major_openings.min_length_1st_2nd = 5
  if (on(mj.min_len_3rd_4th_4)) card_data.major_openings.min_length_3rd_4th = 4
  if (on(mj.min_len_3rd_4th_5)) card_data.major_openings.min_length_3rd_4th = 5
  if (on(mj['1nt_forcing']))      card_data.major_openings.one_nt_response.forcing = true
  if (on(mj['1nt_semi_forcing'])) card_data.major_openings.one_nt_response.semi_forcing = true
  if (on(mj.bypass_1s))           card_data.major_openings.one_nt_response.bypass_1s = true
  if (on(mj.jump_raise_weak))  card_data.major_openings.jump_raise.weak = true
  if (on(mj.jump_raise_mixed)) card_data.major_openings.jump_raise.mixed = true
  if (on(mj.jump_raise_inv))   card_data.major_openings.jump_raise.inv = true
  if (on(mj.jump_raise_overcall_weak))  card_data.major_openings.jump_raise_after_overcall.weak = true
  if (on(mj.jump_raise_overcall_mixed)) card_data.major_openings.jump_raise_after_overcall.mixed = true
  if (on(mj.jump_raise_overcall_inv))   card_data.major_openings.jump_raise_after_overcall.inv = true
  if (on(mj.art_raises_2nt))      card_data.major_openings.jacoby_2nt.play = true
  if (on(mj.art_raises_3nt))      card_data.major_openings.three_nt_raise.play = true
  if (on(mj.art_raises_splinter)) card_data.major_openings.splinters.play = true
  if (mj.art_raises_other)        card_data.major_openings.art_raises_other = suits(mj.art_raises_other)
  // Bridgeodex only has a single Drury checkbox. Almost everyone who
  // plays Drury today plays Reverse Drury (low responses = strong,
  // 2♣ = limit raise). When the bridgeodex flag is on we mark both:
  //   - `drury.play=true` — the structured "Drury bid: 2♣" checkbox
  //     on the ACBL-style card lights up
  //   - `drury.reverse=true` — the Reverse Drury catalog row lights up
  // If a user actually plays classic Drury, they can clear the reverse
  // flag in the editor.
  if (on(mj.drury_2c)) {
    card_data.major_openings.drury.play = true
    card_data.major_openings.drury.reverse = true
  }
  if (on(mj.drury_2d))            card_data.major_openings.drury.two_d = true
  if (on(mj.drury_in_comp))       card_data.major_openings.drury.in_comp = true
  if (mj.more)                    card_data.major_openings.notes = suits(mj.more)
  if (mj.other && mj.other !== mj.more) {
    card_data.major_openings.bergen_raises_notes = suits(mj.other)
  }

  // ─── Minor openings ───────────────────────────────────────────
  const mn = s.minors || {}
  // 1♣ length flags
  if (on(mn['1c_min_len_3'])) card_data.minor_openings.one_club.min_length = 3
  if (on(mn['1c_min_len_4'])) card_data.minor_openings.one_club.min_length = 4
  if (on(mn['1c_min_len_5'])) card_data.minor_openings.one_club.min_length = 5
  if (on(mn['1c_unbal']))     card_data.minor_openings.one_club.unbalanced = true
  if (on(mn['1c_nf2']))       card_data.minor_openings.one_club.nf2 = true
  if (on(mn['1c_nf1']))       card_data.minor_openings.one_club.nf1 = true
  if (on(mn['1c_nf0']))       card_data.minor_openings.one_club.nf0 = true
  if (on(mn['1c_art_f']))     card_data.minor_openings.one_club.art_forcing = true
  if (on(mn['1d_min_len_3'])) card_data.minor_openings.one_diamond.min_length = 3
  if (on(mn['1d_min_len_4'])) card_data.minor_openings.one_diamond.min_length = 4
  if (on(mn['1d_min_len_5'])) card_data.minor_openings.one_diamond.min_length = 5
  if (on(mn['1d_4432_only'])) card_data.minor_openings.one_diamond.nf2_4432_only = true
  if (on(mn['1d_same_as_1c'])) card_data.minor_openings.one_diamond.same_as_1c = true
  if (on(mn['1c_1d_bypass_5'])) card_data.minor_openings.bypass_5_plus = true
  if (on(mn['1c_transfer_resp'])) card_data.minor_openings.one_club.transfer_resp = true
  card_data.minor_openings.one_club.one_nt_range_min = num(mn['1c_1nt_min'])
  card_data.minor_openings.one_club.one_nt_range_max = num(mn['1c_1nt_max'])
  card_data.minor_openings.one_club.two_nt_range_min = num(mn['1c_2nt_min'])
  card_data.minor_openings.one_club.two_nt_range_max = num(mn['1c_2nt_max'])
  if (on(mn['1c_single_raise_nf']))  card_data.minor_openings.one_club.single_raise.nf = true
  if (on(mn['1c_single_raise_inv'])) card_data.minor_openings.one_club.single_raise.inv = true
  if (on(mn['1c_single_raise_gf']))  card_data.minor_openings.one_club.single_raise.gf = true
  if (on(mn['1c_jump_raise_weak']))  card_data.minor_openings.one_club.jump_raise.weak = true
  if (on(mn['1c_jump_raise_mixed'])) card_data.minor_openings.one_club.jump_raise.mixed = true
  if (on(mn['1c_jump_raise_inv']))   card_data.minor_openings.one_club.jump_raise.inv = true
  if (on(mn['1c_jump_raise_overcall_weak']))  card_data.minor_openings.one_club.jump_raise_after_overcall.weak = true
  if (on(mn['1c_jump_raise_overcall_mixed'])) card_data.minor_openings.one_club.jump_raise_after_overcall.mixed = true
  if (on(mn['1c_jump_raise_overcall_inv']))   card_data.minor_openings.one_club.jump_raise_after_overcall.inv = true
  if (mn['1c_1d']) card_data.minor_openings.notes = suits(mn['1c_1d'])

  // ─── Two-level openings ───────────────────────────────────────
  const tl = s.two_level || {}
  if (tl['2c_min'])   card_data.two_level.two_clubs.min_hcp_str = tl['2c_min']
  // 4 mutually exclusive meanings on the ACBL card. Order matters
  // (later wins) — the most-distinctive option should be last so a
  // card with both "very_str" and "str" ends up at "very_strong".
  if (on(tl['2c_str']))      card_data.two_level.two_clubs.meaning = 'strong'
  if (on(tl['2c_nat']))      card_data.two_level.two_clubs.meaning = 'natural'
  if (on(tl['2c_conv']))     card_data.two_level.two_clubs.meaning = 'conventional'
  if (on(tl['2c_very_str'])) card_data.two_level.two_clubs.meaning = 'very_strong'
  if (on(tl['2c_2d_neg']))     card_data.two_level.two_clubs['2d_response'] = 'negative'
  if (on(tl['2c_2d_waiting'])) card_data.two_level.two_clubs['2d_response'] = 'waiting'
  if (on(tl['2c_2d_steps']))   card_data.two_level.two_clubs['2d_response'] = 'steps'
  if (on(tl['2c_2h_neg']))     card_data.two_level.two_clubs['2h_response'] = 'negative'
  if (on(tl['2c_2h_steps']))   card_data.two_level.two_clubs['2h_response'] = 'steps'
  if (tl['2c_other']) card_data.two_level.two_clubs.notes = suits(tl['2c_other'])

  for (const suit of ['d', 'h', 's']) {
    const key = `2${suit}`
    const obj = card_data.two_level[`two_${ {d:'diamonds',h:'hearts',s:'spades'}[suit] }`]
    obj.min_hcp = num(tl[`${key}_min`])
    obj.max_hcp = num(tl[`${key}_max`])
    if (on(tl[`${key}_weak`]))    obj.meaning = 'weak'
    if (on(tl[`${key}_int`]))     obj.meaning = 'intermediate'
    if (on(tl[`${key}_str`]))     obj.meaning = 'strong'
    if (on(tl[`${key}_conv`]))    obj.meaning = 'conventional'
    if (on(tl[`${key}_2suits`]))  obj.two_suited = true
    if (on(tl[`${key}_nsnf`]))    obj.new_suit_nf = true
    if (tl[`${key}_rebids_2nt`])  obj.rebids_2nt = suits(tl[`${key}_rebids_2nt`])
    if (tl[`${key}_desc`])        obj.description = suits(tl[`${key}_desc`])
    if (tl[`${key}_other`])       obj.notes = suits(tl[`${key}_other`])
  }
  if (on(tl.ogust)) card_data.two_level.ogust.play = true

  // ─── Slams ────────────────────────────────────────────────────
  const sl = s.slams || {}
  if (on(sl.gerber_directly_over_nt)) card_data.other_conventions.gerber.directly_over_nt = true
  if (on(sl.gerber_over_nt_seq))      card_data.other_conventions.gerber.over_nt_seq = true
  if (on(sl.gerber_non_nt_seq))       card_data.other_conventions.gerber.non_nt_seq = true
  // Umbrella `gerber.play` lights up the catalog row whenever any
  // variant is on — bridgeodex itself doesn't have a top-level "Gerber"
  // flag, just the three variant checkboxes.
  if (on(sl.gerber_directly_over_nt) || on(sl.gerber_over_nt_seq) || on(sl.gerber_non_nt_seq)) {
    card_data.other_conventions.gerber.play = true
  }
  if (on(sl['4nt_blackwood'])) card_data.other_conventions.blackwood.standard = true
  if (on(sl['4nt_rkc_0314']))  card_data.other_conventions.blackwood.rkcb_0314 = true
  if (on(sl['4nt_rkc_1430']))  card_data.other_conventions.blackwood.rkcb_1430 = true
  if (sl['4nt_more'])    card_data.other_conventions.blackwood.notes = suits(sl['4nt_more'])
  // DOPI / DEPO / ROPI — bridgeodex doesn't surface these as named
  // flags; they typically live in the slam notes blob. BBO does have
  // them as `C_dopi`/`C_depo`/`C_ropi` and the future BBO importer
  // will write here.
  if (on(sl.dopi)) card_data.slam.dopi = true
  if (on(sl.depo)) card_data.slam.depo = true
  if (on(sl.ropi)) card_data.slam.ropi = true
  if (sl.control_bids)    card_data.slam.control_bids = suits(sl.control_bids)
  if (sl.vs_interference) card_data.slam.vs_interference = suits(sl.vs_interference)
  if (sl.trump_level)     card_data.slam.trump_level = suits(sl.trump_level)
  if (sl.other)           card_data.slam.notes = suits(sl.other)

  // ─── Competitive: vs 1NT openings ─────────────────────────────
  const v1 = s.vs_1nt_opening || {}
  if (v1.vs_a) card_data.competitive.vs_1nt_strong.system = suits(v1.vs_a)
  if (v1.vs_b) card_data.competitive.vs_1nt_weak.system = suits(v1.vs_b)
  for (const bid of ['dbl', '2c', '2d', '2h', '2s', '2nt']) {
    if (v1[`vs_a_${bid}`]) card_data.competitive.vs_1nt_strong[bid] = suits(v1[`vs_a_${bid}`])
    if (v1[`vs_b_${bid}`]) card_data.competitive.vs_1nt_weak[bid] = suits(v1[`vs_b_${bid}`])
  }

  // ─── Overcalls ────────────────────────────────────────────────
  const oc = s.overcalls || {}
  card_data.overcalls.one_level_min = num(oc['1_lvl_min'])
  card_data.overcalls.one_level_max = num(oc['1_lvl_max'])
  card_data.overcalls.two_level_min = num(oc['2_lvl_min'])
  card_data.overcalls.two_level_max = num(oc['2_lvl_max'])
  if (on(oc.often_4_cards)) card_data.overcalls.often_4_cards = true
  if (on(oc.jump_weak)) card_data.overcalls.jump = 'weak'
  if (on(oc.jump_int))  card_data.overcalls.jump = 'intermediate'
  if (on(oc.jump_str))  card_data.overcalls.jump = 'strong'
  if (oc.conv) card_data.overcalls.conv_text = suits(oc.conv)
  if (on(oc.new_suit_f))       card_data.overcalls.responses.new_suit = 'forcing'
  if (on(oc.new_suit_nf_const)) card_data.overcalls.responses.new_suit = 'nf_constructive'
  if (on(oc.new_suit_nf))       card_data.overcalls.responses.new_suit = 'nf'
  if (on(oc.new_suit_tfr))      card_data.overcalls.responses.new_suit = 'transfer'
  if (on(oc.jump_raise_wk))    card_data.overcalls.responses.jump_raise = 'weak'
  if (on(oc.jump_raise_mixed)) card_data.overcalls.responses.jump_raise = 'mixed'
  if (on(oc.jump_raise_inv))   card_data.overcalls.responses.jump_raise = 'invitational'
  if (oc.cuebids)    card_data.overcalls.responses.cuebids_text = suits(oc.cuebids)
  if (on(oc.cue_support)) card_data.overcalls.responses.support_cuebid = true
  if (oc.other)      card_data.overcalls.notes = suits(oc.other)

  // ─── Doubles ─────────────────────────────────────────────────
  const db = s.doubles || {}
  if (on(db.negative))     card_data.doubles.negative.play = true
  if (db.negative_thru)    card_data.doubles.negative.through = suits(db.negative_thru)
  if (on(db.responsive))   card_data.doubles.responsive.play = true
  if (db.responsive_thru)  card_data.doubles.responsive.through = suits(db.responsive_thru)
  if (on(db.maximal))      card_data.doubles.maximal = true
  if (on(db.support))      card_data.doubles.support.play = true
  if (db.support_thru)     card_data.doubles.support.through = suits(db.support_thru)
  if (on(db.support_rdbl)) card_data.doubles.support.rdbl = true
  if (db.to_style)         card_data.doubles.takeout_style = suits(db.to_style)
  if (db.other)            card_data.doubles.notes = suits(db.other)

  // ─── Preempts ─────────────────────────────────────────────────
  const pr = s.preempts || {}
  if (pr['3_lvl_style']) card_data.preempts.three_level_style = suits(pr['3_lvl_style'])
  if (pr['4_lvl_style']) card_data.preempts.four_level_style = suits(pr['4_lvl_style'])
  if (pr['3_lvl_response']) card_data.preempts.three_level_response = suits(pr['3_lvl_response'])
  if (pr['4_lvl_response']) card_data.preempts.four_level_response = suits(pr['4_lvl_response'])
  if (on(pr.transfer_4c4d))  card_data.preempts.transfer_4_minor = true
  if (pr.other) card_data.preempts.notes = suits(pr.other)

  // ─── NT overcalls ─────────────────────────────────────────────
  const no = s.nt_overcalls || {}
  card_data.nt_overcalls.direct.range_min = parseRange(no.direct_1nt_min).n
  card_data.nt_overcalls.direct.range_max = parseRange(no.direct_1nt_max).n
  card_data.nt_overcalls.balance.range_min = parseRange(no.balance_1nt_min).n
  card_data.nt_overcalls.balance.range_max = parseRange(no.balance_1nt_max).n
  if (on(no.direct_systems_on))  card_data.nt_overcalls.direct.systems_on = true
  if (on(no.balance_systems_on)) card_data.nt_overcalls.balance.systems_on = true
  if (on(no.jump_2nt_2_lowest_unbid)) card_data.nt_overcalls.jump_2nt_lowest_unbid = true
  if (no.conv) card_data.nt_overcalls.conv_text = suits(no.conv)
  if (no.other) card_data.nt_overcalls.notes = suits(no.other)

  // ─── Vs takeout double ────────────────────────────────────────
  const vd = s.vs_to_double || {}
  if (on(vd.new_suit_forcing_2_level)) card_data.vs_to_double.new_suit_forcing_2lvl = true
  if (on(vd.new_suit_forcing_trf))     card_data.vs_to_double.new_suit_forcing_tfr = true
  if (on(vd.jump_shift_weak)) card_data.vs_to_double.jump_shift = 'weak'
  if (on(vd.jump_shift_inv))  card_data.vs_to_double.jump_shift = 'inv'
  if (on(vd.jump_shift_f))    card_data.vs_to_double.jump_shift = 'forcing'
  if (on(vd.jump_shift_fit))  card_data.vs_to_double.jump_shift = 'fit'
  if (on(vd.redouble_10_plus))   card_data.vs_to_double.redouble.ten_plus = true
  if (on(vd.redouble_conv))      card_data.vs_to_double.redouble.conv = true
  if (on(vd.redouble_denies_fit)) card_data.vs_to_double.redouble.denies_fit = true
  if (vd.redouble_conv_desc)     card_data.vs_to_double.redouble.conv_desc = suits(vd.redouble_conv_desc)
  if (on(vd['2nt_over_minors_raise'])) card_data.vs_to_double.two_nt_raise_minors.play = true
  if (on(vd['2nt_over_majors_raise'])) card_data.vs_to_double.two_nt_raise_majors.play = true
  card_data.vs_to_double.two_nt_raise_minors.range_min = parseRange(vd['2nt_over_minors_min']).n
  card_data.vs_to_double.two_nt_raise_minors.range_max = parseRange(vd['2nt_over_minors_max']).n
  card_data.vs_to_double.two_nt_raise_majors.range_min = parseRange(vd['2nt_over_majors_min']).n
  card_data.vs_to_double.two_nt_raise_majors.range_max = parseRange(vd['2nt_over_majors_max']).n
  if (vd.other) card_data.vs_to_double.notes = suits(vd.other)

  // ─── Vs preempts ──────────────────────────────────────────────
  const vp = s.vs_preempts || {}
  if (vp['2nt_overcall']) card_data.vs_preempts.two_nt_overcall = suits(vp['2nt_overcall'])
  if (vp.to_dbl_thru)     card_data.vs_preempts.takeout_double_thru = suits(vp.to_dbl_thru)
  if (on(vp.to_dbl_penalty)) card_data.vs_preempts.takeout_double_penalty = true
  if (on(vp['2nt_lebensohl_resp'])) card_data.vs_preempts.lebensohl_response = true
  if (vp.cuebid) card_data.vs_preempts.cuebid = suits(vp.cuebid)
  if (vp.jump_overcalls) card_data.vs_preempts.jump_overcalls = suits(vp.jump_overcalls)
  if (vp.other) card_data.vs_preempts.notes = suits(vp.other)

  // ─── Direct cuebids (3×4 matrix: row × column) ────────────────
  const dc = s.direct_cuebids || {}
  for (const col of ['art', 'quasi', 'nat_minors', 'nat_majors']) {
    for (const row of ['michaels', 'natural', 'other']) {
      if (on(dc[`${col}_${row}`])) {
        card_data.direct_cuebids[`${col}_${row}`] = true
      }
    }
  }
  if (dc.describe) card_data.direct_cuebids.description = suits(dc.describe)

  // ─── Carding & signals ───────────────────────────────────────
  const cd = s.carding || {}
  if (on(cd.suits_ud_att))   card_data.carding.suits.upside_down_attitude = true
  if (on(cd.suits_ud_count)) card_data.carding.suits.upside_down_count = true
  if (on(cd.suits_std_att))  card_data.carding.suits.standard_attitude = true
  if (on(cd.suits_std_count)) card_data.carding.suits.standard_count = true
  if (on(cd.nt_ud_att))      card_data.carding.nt.upside_down_attitude = true
  if (on(cd.nt_ud_count))    card_data.carding.nt.upside_down_count = true
  if (on(cd.nt_std_att))     card_data.carding.nt.standard_attitude = true
  if (on(cd.nt_std_count))   card_data.carding.nt.standard_count = true
  if (on(cd.smith_echo_suits)) card_data.carding.smith_echo_suits = true
  if (on(cd.smith_echo_nt))   card_data.carding.smith_echo_nt = true
  if (on(cd.smith_echo_reverse)) card_data.carding.smith_echo_reverse = true
  if (cd.trump_signals)       card_data.carding.trump_signals = suits(cd.trump_signals)
  if (cd.exceptions)          card_data.carding.exceptions = suits(cd.exceptions)
  if (cd.other)               card_data.carding.notes = suits(cd.other)

  const sg = s.signals || {}
  if (on(sg.declarer_lead_att))   card_data.carding.declarer_lead.attitude = true
  if (on(sg.declarer_lead_count)) card_data.carding.declarer_lead.count = true
  if (on(sg.declarer_lead_sp))    card_data.carding.declarer_lead.suit_preference = true
  if (on(sg.partner_lead_att))    card_data.carding.partner_lead.attitude = true
  if (on(sg.partner_lead_count))  card_data.carding.partner_lead.count = true
  if (on(sg.partner_lead_sp))     card_data.carding.partner_lead.suit_preference = true
  if (on(sg.first_discard_std))   card_data.carding.first_discard.standard = true
  if (on(sg.first_discard_ud))    card_data.carding.first_discard.upside_down = true
  if (on(sg.first_discard_lavinthal)) card_data.carding.first_discard.lavinthal = true
  if (on(sg.first_discard_odd_even))  card_data.carding.first_discard.odd_even = true

  // ─── Leads tables ────────────────────────────────────────────
  importLeadsBlock(s.leads_vs_suits, card_data.leads.vs_suits)
  importLeadsBlock(s.leads_vs_nt, card_data.leads.vs_nt)

  // ─── Other / misc ────────────────────────────────────────────
  const ot = s.other || {}
  if (on(ot.nmf))         card_data.other_conventions.new_minor_forcing.play = true
  if (on(ot['2_way_nmf'])) card_data.other_conventions.two_way_nmf = true
  if (on(ot.xyz))         card_data.other_conventions.xyz = true
  if (on(ot.fsf_gf))      card_data.other_conventions.fourth_suit_forcing.game_force = true
  if (on(ot.fsf_1_rnd))   card_data.other_conventions.fourth_suit_forcing.one_round = true
  if (ot.jump_shift_resp) card_data.other_conventions.jump_shift_response = suits(ot.jump_shift_resp)
  if (ot.vs_str_open)     card_data.other_conventions.vs_strong_open = suits(ot.vs_str_open)
  // Bridgeodex's "Other" section has two free-text rows. We preserve
  // them as separate fields (notes_line_1 / notes_line_2) so PDF
  // exporters can fill the two corresponding text fields on the ACBL
  // New card, and also keep a joined `notes` field for the editor's
  // single-textarea view.
  if (ot.more1) card_data.other_conventions.notes_line_1 = suits(ot.more1)
  if (ot.more2) card_data.other_conventions.notes_line_2 = suits(ot.more2)
  const otherNotes = [ot.more1, ot.more2].filter(Boolean).map(suits).join('\n')
  if (otherNotes) card_data.other_conventions.notes = otherNotes

  // ─── Top-level notes ─────────────────────────────────────────
  if (s.names?.names) card_data.metadata.partner_names = String(s.names.names)

  // Flatten all the free-text fields from the bridgeodex source into
  // per-section notes that the editor actually displays. Without this
  // pass, descriptions like "Range ask: 2NT rebid shows min, 3♣ shows
  // max" — important agreements — would be invisible in the editor
  // even though _bridgeodex_raw preserves them for round-tripping.
  populateNotesFromBridgeodex(s, card_data.notes, input.notes)

  // Prune empty objects so the saved card doesn't carry noise.
  pruneEmpty(card_data)

  return {
    name: deriveName(s),
    description: 'Imported from bridgeodex.com',
    card_data
  }
}

/**
 * Walk the bridgeodex source and gather every free-text / descriptive
 * field into per-section notes. We use the same notes keys the editor
 * already exposes (see SECTION_META.notes in conventionCatalog.js), so
 * imported descriptions show up in the editor's Notes block.
 */
function populateNotesFromBridgeodex(s, notes, topLevelNotes) {
  // ── General / partnership-level free text ──────────────────
  // bids_prep is surfaced as a structured field now (see general STRUCTURED_FIELDS)
  // so it doesn't land in the notes blob.
  const generalLines = []
  if (topLevelNotes) generalLines.push(String(topLevelNotes))
  if (generalLines.length) notes.general = generalLines.join('\n')

  // ── NT openings ────────────────────────────────────────────
  const nt = s['1_no_trump'] || {}
  const n2 = s['2_no_trump'] || {}
  const n3 = s['3_no_trump'] || {}
  const ntLines = []
  // The bulk of the NT free-text fields are surfaced as structured
  // fields now (sys-on-vs, dbl notes, lebensohl notes, 3♠ relay notes,
  // 3NT one-suit notes, all 2-level + 3-level responses). Only generic
  // 1NT "more" and 2NT "other" content lands in the notes blob.
  if (nt.more)   ntLines.push(suits(nt.more))
  if (n2.other)  ntLines.push(`2NT: ${suits(n2.other)}`)
  if (ntLines.length) notes.notrump_notes = ntLines.join('\n')

  // ── Major openings ────────────────────────────────────────
  const mj = s.majors || {}
  const majorLines = []
  if (mj.art_raises_other)  majorLines.push(`Artificial raises: ${suits(mj.art_raises_other)}`)
  if (mj.drury_other)       majorLines.push(`Drury: ${suits(mj.drury_other)}`)
  if (mj.more && mj.more !== mj.other) majorLines.push(suits(mj.more))
  if (mj.other)             majorLines.push(suits(mj.other))
  if (majorLines.length) notes.major_notes = majorLines.join('\n')

  // ── Minor openings ────────────────────────────────────────
  const mn = s.minors || {}
  const minorLines = []
  if (mn['1c_1d'])  minorLines.push(`1♣/1♦ responses: ${suits(mn['1c_1d'])}`)
  if (mn['1c'])     minorLines.push(`1♣: ${suits(mn['1c'])}`)
  if (mn['1d'])     minorLines.push(`1♦: ${suits(mn['1d'])}`)
  if (minorLines.length) notes.minor_notes = minorLines.join('\n')

  // ── Two-level openings ────────────────────────────────────
  const tl = s.two_level || {}
  const tlLines = []
  if (tl['2c_other'])      tlLines.push(`2♣: ${suits(tl['2c_other'])}`)
  if (tl['2d_desc'])       tlLines.push(`2♦ description: ${suits(tl['2d_desc'])}`)
  if (tl['2d_other'])      tlLines.push(`2♦: ${suits(tl['2d_other'])}`)
  if (tl['2d_rebids_2nt']) tlLines.push(`2♦ rebid 2NT: ${suits(tl['2d_rebids_2nt'])}`)
  if (tl['2h_other'])      tlLines.push(`2♥: ${suits(tl['2h_other'])}`)
  if (tl['2h_rebids_2nt']) tlLines.push(`2♥ rebid 2NT: ${suits(tl['2h_rebids_2nt'])}`)
  if (tl['2s_other'])      tlLines.push(`2♠: ${suits(tl['2s_other'])}`)
  if (tl['2s_rebids_2nt']) tlLines.push(`2♠ rebid 2NT: ${suits(tl['2s_rebids_2nt'])}`)
  if (tlLines.length) notes.two_level_notes = tlLines.join('\n')

  // ── Slam ──────────────────────────────────────────────────
  // Control bids, vs-interference, 4NT notes, trump-level cutover are
  // surfaced as structured fields now. Only the generic "other" blob
  // lands here.
  const sl = s.slams || {}
  const slamLines = []
  if (sl.other) slamLines.push(suits(sl.other))
  if (slamLines.length) notes.slam_notes = slamLines.join('\n')

  // ── Competitive bucket (defenses to opps' actions) ────────
  // vs-1NT defense is captured as structured fields (system + bid
  // meanings), so it's intentionally NOT added to the notes blob.
  const compLines = []

  // Vs takeout double
  const vd = s.vs_to_double || {}
  if (vd.redouble_conv_desc) compLines.push(`Redouble: ${suits(vd.redouble_conv_desc)}`)
  if (vd.other)              compLines.push(`Vs takeout double: ${suits(vd.other)}`)

  // Vs preempts
  const vp = s.vs_preempts || {}
  if (vp['2nt_overcall']) compLines.push(`Vs preempts — 2NT overcall: ${suits(vp['2nt_overcall'])}`)
  if (vp.cuebid)          compLines.push(`Vs preempts — cuebid: ${suits(vp.cuebid)}`)
  if (vp.jump_overcalls)  compLines.push(`Vs preempts — jump overcalls: ${suits(vp.jump_overcalls)}`)
  if (vp.other)           compLines.push(`Vs preempts: ${suits(vp.other)}`)

  // Direct cuebids
  const dc = s.direct_cuebids || {}
  if (dc.describe) compLines.push(`Direct cuebids: ${suits(dc.describe)}`)

  if (compLines.length) notes.competitive_notes = compLines.join('\n')

  // ── Doubles section notes ─────────────────────────────────
  const dbLines = []
  const db = s.doubles || {}
  if (db.other) dbLines.push(suits(db.other))
  if (dbLines.length) notes.doubles_notes = dbLines.join('\n')

  // ── Overcalls section notes ───────────────────────────────
  const ocLines = []
  const oc = s.overcalls || {}
  if (oc.conv)    ocLines.push(`Convention: ${suits(oc.conv)}`)
  if (oc.cuebids) ocLines.push(`Cuebid responses: ${suits(oc.cuebids)}`)
  if (oc.other)   ocLines.push(suits(oc.other))
  if (ocLines.length) notes.overcalls_notes = ocLines.join('\n')

  // ── NT overcalls section notes ────────────────────────────
  const noLines = []
  const no = s.nt_overcalls || {}
  if (no.conv)  noLines.push(`Convention: ${suits(no.conv)}`)
  if (no.other) noLines.push(suits(no.other))
  if (noLines.length) notes.nt_overcalls_notes = noLines.join('\n')

  // ── Preempts section notes ────────────────────────────────
  const prLines = []
  const pr = s.preempts || {}
  if (pr.other) prLines.push(suits(pr.other))
  if (prLines.length) notes.preempts_notes = prLines.join('\n')

  // ── Carding section notes ─────────────────────────────────
  const cardingLines = []
  const cd = s.carding || {}
  if (cd.other) cardingLines.push(suits(cd.other))
  if (cardingLines.length) notes.carding_notes = cardingLines.join('\n')

  // ── Leads section notes ───────────────────────────────────
  // (after-1st-trick and exceptions are surfaced as their own
  // structured fields in OpeningLeadsPanel, so we don't duplicate
  // them in notes here.)
  const leadsLines = []
  const ls = s.leads_vs_suits || {}
  if (ls.other) leadsLines.push(`vs suits: ${suits(ls.other)}`)
  const ln = s.leads_vs_nt || {}
  if (ln.other) leadsLines.push(`vs NT: ${suits(ln.other)}`)
  if (leadsLines.length) notes.leads_notes = leadsLines.join('\n')

  // ── Other / misc ──────────────────────────────────────────
  const otherLines = []
  const ot = s.other || {}
  if (ot.jump_shift_resp) otherLines.push(`Jump-shift response: ${suits(ot.jump_shift_resp)}`)
  if (ot.vs_str_open)     otherLines.push(`Vs (very) strong open: ${suits(ot.vs_str_open)}`)
  if (ot.more1)           otherLines.push(suits(ot.more1))
  if (ot.more2)           otherLines.push(suits(ot.more2))

  if (otherLines.length) notes.other_notes = otherLines.join('\n')
}

function importLeadsBlock(src, target) {
  if (!src) return
  if (on(src.length_4th))   target.length.fourth_best = true
  if (on(src.length_3_5))   target.length.third_fifth = true
  if (on(src.length_3_low)) target.length.third_low = true
  if (on(src.length_attitude)) target.length.attitude = true
  if (on(src.length_2nd_from_xxxx_plus)) target.length.second_from_4plus = true
  if (on(src.small_from_xx)) target.length.small_from_xx = true
  // Numeric "circle which card to lead" indicators.
  // Bridgeodex uses capitalized pattern names (`length_leads_Hxx`,
  // `honor_leads_AKx`); we normalize to lowercase so downstream
  // consumers can use a single canonical key per pattern.
  for (const key of Object.keys(src)) {
    if (key.startsWith('length_leads_') || key.startsWith('honor_leads_')) {
      const value = src[key]
      const n = num(value)
      if (n != null) {
        const suffix = key.startsWith('length_leads_')
          ? key.slice('length_leads_'.length).toLowerCase()
          : key.slice('honor_leads_'.length).toLowerCase()
        const path = key.startsWith('length_leads_')
          ? `length.lead_choice_${suffix}`
          : `honors.lead_choice_${suffix}`
        writePath(target, path, n)
      }
    }
  }
  if (src.after_first_trick) target.after_first_trick = suits(src.after_first_trick)
  if (src.exceptions) target.exceptions = suits(src.exceptions)
}

function pruneEmpty(obj) {
  if (obj == null || typeof obj !== 'object' || Array.isArray(obj)) return
  for (const key of Object.keys(obj)) {
    const v = obj[key]
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      pruneEmpty(v)
      if (Object.keys(v).length === 0 && !isPreservedKey(key)) {
        delete obj[key]
      }
    } else if (v === null || v === '') {
      delete obj[key]
    }
  }
}

function isPreservedKey(key) {
  // Don't prune these even if empty — they're scaffolding the editor
  // expects to exist (so saving + reloading doesn't strip structure).
  return ['_bridgeodex_raw', 'metadata'].includes(key)
}
