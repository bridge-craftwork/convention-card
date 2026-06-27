/**
 * Old ACBL Classic convention card PDF export — fills the official
 * ACBL fillable PDF (2023 revision) with values from `card_data`.
 *
 * The template ships at `public/templates/acbl-classic-2023.pdf` and
 * is fetched on demand when the user clicks Export. We use pdf-lib to
 * walk the form fields and apply checkbox / text values from a static
 * FIELD_MAP that pairs the PDF field name with the corresponding
 * `card_data` path.
 *
 * Why not draw the card from scratch? The ACBL Classic has 800+
 * positioned elements in a dense layout. Filling the official PDF
 * gives pixel-perfect output that's printable + submittable to
 * tournaments, in a fraction of the code we'd need to lay it out by
 * hand. The trade-off is a 1.4 MB template that loads only when the
 * user clicks Export (no impact on initial page load).
 */

import { PDFDocument, PDFCheckBox, PDFTextField, PDFName, PDFHexString, PDFBool, StandardFonts, rgb } from 'pdf-lib'
import { readPath } from './conventionCatalog.js'

// Custom Info-dict key under which we embed the source card_data as
// JSON, so a generated PDF can be re-imported into the editor with
// full fidelity. Namespaced so other PDF tools ignore it.
const EMBED_INFO_KEY = 'BridgeClassroomCard'

const BASE = import.meta.env.BASE_URL || '/'
const TEMPLATE_URLS = {
  classic: `${BASE}templates/acbl-classic-2023.pdf`,
  new:     `${BASE}templates/acbl-new.pdf`
}

const _cachedBytes = {}
async function loadTemplateBytes(templateName = 'classic') {
  if (_cachedBytes[templateName]) return _cachedBytes[templateName]
  const url = TEMPLATE_URLS[templateName]
  if (!url) throw new Error(`Unknown ACBL template "${templateName}"`)
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Failed to load ACBL template (${res.status}). Expected at ${url}.`)
  }
  _cachedBytes[templateName] = await res.arrayBuffer()
  return _cachedBytes[templateName]
}

// ─── Field mapping ────────────────────────────────────────────
// Pairs an exact PDF field name with the card_data path that feeds
// it. `kind` is 'check' (boolean checkbox), 'text' (free text), or
// 'range' (text field holding a single number — typically a HCP
// minimum or maximum; pdf has separate fields for each end of every
// range so range pairs are two entries: one for min, one for max).
//
// Built incrementally — the first pass covers the obviously-named
// fields. The PDF has 284 unique non-scoresheet fields, many with
// auto-generated names like `Weak_3` / `to_12` / `undefined_8` whose
// physical location takes a debug-fill pass to identify.
//
// Convention: `value: true` means the checkbox represents the boolean
// truthy state directly; `value: {match}` means "check this box when
// the card_data value === match" (used for enum fields where one of
// several checkboxes is on).

// Field mappings are built from the labelled debug PDF (Shift+click
// Export from the editor). The "_N" suffixed names are auto-generated
// by Acrobat when a label is reused; the suffix follows the field
// creation order in the original PDF design, not strict reading order.
const FIELD_MAP_CLASSIC = [
  // ─── NAMES ───
  { pdf: 'NAMES', card: 'metadata.partner_names', kind: 'text' },

  // ─── GENERAL APPROACH ───
  { pdf: 'GENERAL APPROACH',                       card: 'general.system',                     kind: 'text' },
  { pdf: 'Two Over One Game Forcing',              card: 'major_openings.two_over_one.game_force', kind: 'check' },
  // Very Light per-area checkboxes
  { pdf: 'Openings', card: 'general.very_light.openings',  kind: 'check' },
  { pdf: '3rd Hand', card: 'general.very_light.third_hand', kind: 'check' },
  { pdf: 'Overcalls', card: 'general.very_light.overcalls', kind: 'check' },
  { pdf: 'Preempts',  card: 'general.very_light.preempts',  kind: 'check' },
  // Forcing Opening row
  { pdf: 'FORCING OPENING 1c', card: 'general.forcing_opening_1c', kind: 'check' },
  { pdf: '2c',                 card: 'general.forcing_opening_2c', kind: 'check' },
  { pdf: 'Natural 2 Bids',     card: 'general.forcing_opening_natural_2', kind: 'check' },
  { pdf: 'undefined_4',        card: 'general.forcing_opening_other', kind: 'text' },

  // ─── NOTRUMP OPENING BIDS ───
  { pdf: '5card Major common', card: 'notrump.one_nt.five_card_major', kind: 'check', value: ['sometimes', 'always'] },
  { pdf: 'System on over',     card: 'notrump.one_nt.sys_on_vs',        kind: 'text' },
  { pdf: '2c Stayman',         card: 'notrump.stayman.forcing',         kind: 'check' },
  { pdf: 'Puppet',             card: 'notrump.stayman.puppet',          kind: 'check' },
  { pdf: '2d Transfer to h',   card: 'notrump.transfers.jacoby',        kind: 'check' },
  { pdf: '2h Transfer to s',   card: 'notrump.transfers.jacoby',        kind: 'check' },
  { pdf: '4d  4h  Transfer',   card: 'notrump.transfers.texas',         kind: 'check' },
  { pdf: 'Forcing Stayman',    card: 'notrump.stayman.garbage',         kind: 'check' },
  { pdf: 'Smolen',             card: 'notrump.smolen.play',             kind: 'check' },
  { pdf: 'Lebensohl',          card: 'notrump.lebensohl.over_interference', kind: 'check' },
  { pdf: 'Neg Double',         card: 'notrump.dbl.negative',            kind: 'check' },
  // Text fields inside the NT opening box (responses)
  { pdf: 'to_4',                              card: 'notrump.one_nt.range_min',     kind: 'text' },
  { pdf: '1_2',                               card: 'notrump.one_nt.range_max',     kind: 'text' },
  { pdf: 'to_6',                              card: 'notrump.one_nt_alt.range_min', kind: 'text' },
  { pdf: '2_2',                               card: 'notrump.one_nt_alt.range_max', kind: 'text' },
  { pdf: '2s',                                card: 'notrump.responses.2s_other',   kind: 'text' },
  { pdf: '2NT_2',                             card: 'notrump.responses.2nt_other',  kind: 'text' },
  { pdf: 'NOTRUMP OPENING BIDS',              card: 'notrump.responses.3c',         kind: 'text' },
  { pdf: '3d',                                card: 'notrump.responses.3d',         kind: 'text' },
  { pdf: '3h 1',                              card: 'notrump.responses.3h',         kind: 'text' },
  { pdf: '3h 2',                              card: 'notrump.responses.3s',         kind: 'text' },
  { pdf: 'denies Conventional NT Openings',   card: 'notrump.lebensohl.description', kind: 'text' },
  { pdf: 'Other_3',                           card: 'notrump.notes',                kind: 'text' },

  // ─── 2NT side panel ───
  { pdf: '2NT',             card: 'notrump.two_nt.range_min', kind: 'text' },
  { pdf: 'to_5',            card: 'notrump.two_nt.range_max', kind: 'text' },
  { pdf: 'Puppet Stayman',  card: 'notrump.two_nt.puppet',    kind: 'check' },
  { pdf: 'Jacoby',          card: 'notrump.two_nt.transfers_3level', kind: 'check' },
  { pdf: 'Texas',           card: 'notrump.two_nt.transfers_4level', kind: 'check' },
  { pdf: 'undefined_6',     card: 'notrump.two_nt.three_s_desc', kind: 'text' },

  // ─── 3NT ───
  { pdf: 'to_7',         card: 'three_nt.range_min', kind: 'text' },
  { pdf: 'undefined_8',  card: 'three_nt.range_max', kind: 'text' },

  // ─── MAJOR OPENING ───
  { pdf: '1st/2nd 4', card: 'major_openings.min_length_1st_2nd', kind: 'check', value: '4' },
  { pdf: '1st/2nd 5', card: 'major_openings.min_length_1st_2nd', kind: 'check', value: '5' },
  { pdf: '3rd/rth 4', card: 'major_openings.min_length_3rd_4th', kind: 'check', value: '4' },
  { pdf: '3rd/rth 5', card: 'major_openings.min_length_3rd_4th', kind: 'check', value: '5' },
  // Double Raise = jump raise (e.g. 1♥-3♥). Our card_data has
  // weak/mixed/inv as three separate booleans; ACBL has Force/Inv/Weak.
  // "Force" has no card_data equivalent and "Mixed" has no ACBL Classic
  // equivalent (Bergen-style raises would be noted in `art_raises_other`).
  { pdf: 'Inv_3',              card: 'major_openings.jump_raise.inv',  kind: 'check' },
  { pdf: 'Weak_3',             card: 'major_openings.jump_raise.weak', kind: 'check' },
  { pdf: 'Inv_5',              card: 'major_openings.jump_raise_after_overcall.inv',  kind: 'check' },
  { pdf: 'Weak_4',             card: 'major_openings.jump_raise_after_overcall.weak', kind: 'check' },
  { pdf: 'Conv Raise 2NT',    card: 'major_openings.jacoby_2nt.play', kind: 'check' },
  { pdf: '3NT_2',             card: 'major_openings.three_nt_raise.play', kind: 'check' },
  { pdf: 'Splinter',          card: 'major_openings.splinters.play',  kind: 'check' },
  { pdf: 'Other_5',           card: 'major_openings.art_raises_other', kind: 'text' },
  { pdf: '1NT  Forcing',      card: 'major_openings.one_nt_response.forcing',      kind: 'check' },
  { pdf: 'Semiforcing',       card: 'major_openings.one_nt_response.semi_forcing', kind: 'check' },
  { pdf: '2NT Forcing',       card: 'major_openings.two_nt_response_forcing', kind: 'check' },
  { pdf: 'Inv_7',             card: 'major_openings.two_nt_response_inv', kind: 'check' },
  { pdf: 'to_8',              card: 'major_openings.two_nt_response_range_min', kind: 'text' },
  { pdf: 'undefined_10',      card: 'major_openings.two_nt_response_range_max', kind: 'text' },
  { pdf: 'to_10',             card: 'major_openings.three_nt_raise.range_min', kind: 'text' },
  { pdf: 'undefined_11',      card: 'major_openings.three_nt_raise.range_max', kind: 'text' },
  { pdf: 'Drury',             card: 'major_openings.drury.play',      kind: 'check' },
  { pdf: 'Reverse',           card: 'major_openings.drury.reverse',   kind: 'check' },
  { pdf: '2Way',              card: 'major_openings.drury.two_way',   kind: 'check' },
  { pdf: 'Fit',               card: 'major_openings.drury.fit',       kind: 'check' },
  { pdf: 'undefined_16',      card: 'major_openings.notes',           kind: 'text' },

  // ─── MINOR OPENING ───
  { pdf: '1c 3',    card: 'minor_openings.one_club.min_length', kind: 'check', value: '3' },
  { pdf: '1c 4',    card: 'minor_openings.one_club.min_length', kind: 'check', value: '4' },
  { pdf: '1c NF',   card: 'minor_openings.one_club.nf0', kind: 'check' },
  { pdf: '1c conv', card: 'minor_openings.one_club.art_forcing', kind: 'check' },
  { pdf: '1d 3',    card: 'minor_openings.one_diamond.min_length', kind: 'check', value: '3' },
  { pdf: '1d 4',    card: 'minor_openings.one_diamond.min_length', kind: 'check', value: '4' },
  { pdf: '1d NF',   card: 'minor_openings.one_diamond.nf2_4432_only', kind: 'check' },
  { pdf: '1d conv', card: 'minor_openings.one_diamond.art_forcing', kind: 'check' },
  // Minor Double Raise = jump raise of opener's minor. Same Force/Inv/Weak
  // structure as Major. Our card_data only has weak/mixed/inv on the
  // minor.one_club.jump_raise object; we map inv + weak.
  { pdf: 'Inv_4',                  card: 'minor_openings.one_club.jump_raise.inv',  kind: 'check' },
  { pdf: 'Weak_5',                 card: 'minor_openings.one_club.jump_raise.weak', kind: 'check' },
  { pdf: 'Inv_6',                  card: 'minor_openings.one_club.jump_raise_after_overcall.inv',  kind: 'check' },
  { pdf: 'Weak_6',                 card: 'minor_openings.one_club.jump_raise_after_overcall.weak', kind: 'check' },
  { pdf: 'Forcing Raise JS in other minor', card: 'minor_openings.inverted_minors.play', kind: 'check' },
  // "Single raise" on ACBL is a single checkbox indicating you play one.
  // Our data has three booleans (nf/inv/gf); check the ACBL box if any are set.
  { pdf: 'Single raise', card: 'minor_openings.one_club.single_raise.nf',  kind: 'check' },
  { pdf: 'Other_6',      card: 'minor_openings.one_club.single_raise.other', kind: 'text' },
  // 1♣ length flags. ACBL has "NF 0–2 Conv." — interpret "NF" as
  // covering nf0/nf1/nf2 (any unbalanced 1♣ count is "non-forcing
  // short club"), and "Conv." as art_forcing. The 1♣ "Unbal" concept
  // doesn't have a column on ACBL Classic — it's captured implicitly.
  { pdf: '1c 5',    card: 'minor_openings.one_club.min_length', kind: 'check', value: '5' },
  { pdf: '1d 5',    card: 'minor_openings.one_diamond.min_length', kind: 'check', value: '5' },
  { pdf: 'Freq bypass 4d',  card: 'minor_openings.bypass_5_plus', kind: 'check' },
  { pdf: 'Transfer Resp_2', card: 'minor_openings.one_club.transfer_resp', kind: 'check' },
  { pdf: 'to_9',         card: 'minor_openings.one_club.one_nt_range_min', kind: 'text' },
  { pdf: 'to_11',        card: 'minor_openings.one_club.one_nt_range_max', kind: 'text' },
  { pdf: 'undefined_12', card: 'minor_openings.one_club.two_nt_range_min', kind: 'text' },
  { pdf: 'undefined_13', card: 'minor_openings.one_club.two_nt_range_max', kind: 'text' },
  { pdf: '3NT_3',        card: 'minor_openings.one_club.three_nt_range_min', kind: 'text' },
  { pdf: 'undefined_15', card: 'minor_openings.one_club.three_nt_range_max', kind: 'text' },
  { pdf: 'to_12',        card: 'minor_openings.notes', kind: 'text' },

  // ─── 2♣ / weak twos ───
  { pdf: 'Other_7',                  card: 'two_level.two_clubs.min_hcp_str', kind: 'text' },
  { pdf: 'to_13',                    card: 'two_level.two_clubs.max_hcp',     kind: 'text' },
  { pdf: 'Very Strong',              card: 'two_level.two_clubs.meaning', kind: 'check', value: 'very_strong' },
  { pdf: 'Other_8',                  card: 'two_level.two_clubs.meaning', kind: 'check', value: ['strong', 'natural', 'conventional'] },
  { pdf: '2d Resp  Neg',             card: 'two_level.two_clubs.2d_response', kind: 'check', value: 'negative' },
  { pdf: 'Waiting',                  card: 'two_level.two_clubs.2d_response', kind: 'check', value: 'waiting' },
  { pdf: '2C Force New describe',    card: 'two_level.two_clubs.description', kind: 'text' },
  { pdf: '2C Force New Suit NFRow1', card: 'two_level.two_clubs.notes',       kind: 'text' },

  { pdf: '2d_2',         card: 'two_level.two_diamonds.min_hcp', kind: 'text' },
  { pdf: 'to_14',        card: 'two_level.two_diamonds.max_hcp', kind: 'text' },
  { pdf: 'NaturalWeak',   card: 'two_level.two_diamonds.meaning', kind: 'check', value: 'weak' },
  { pdf: 'Intermediate_2', card: 'two_level.two_diamonds.meaning', kind: 'check', value: 'intermediate' },
  { pdf: 'Strong_2',      card: 'two_level.two_diamonds.meaning', kind: 'check', value: 'strong' },
  { pdf: 'Conv_3',        card: 'two_level.two_diamonds.meaning', kind: 'check', value: 'conventional' },
  { pdf: '2NT Force',     card: 'two_level.two_diamonds.two_nt_force', kind: 'check' },
  { pdf: 'New Suit NF',   card: 'two_level.two_diamonds.new_suit_nf', kind: 'check' },
  { pdf: '2D Force New describe',    card: 'two_level.two_diamonds.description', kind: 'text' },
  { pdf: '2D Force New Suit NFRow1', card: 'two_level.two_diamonds.notes',       kind: 'text' },

  { pdf: '2h_2',         card: 'two_level.two_hearts.min_hcp', kind: 'text' },
  { pdf: 'to_15',        card: 'two_level.two_hearts.max_hcp', kind: 'text' },
  { pdf: 'NaturalWeak_2', card: 'two_level.two_hearts.meaning', kind: 'check', value: 'weak' },
  { pdf: 'Intermediate_3', card: 'two_level.two_hearts.meaning', kind: 'check', value: 'intermediate' },
  { pdf: 'Strong_3',      card: 'two_level.two_hearts.meaning', kind: 'check', value: 'strong' },
  { pdf: 'Conv_4',        card: 'two_level.two_hearts.meaning', kind: 'check', value: 'conventional' },
  { pdf: '2NT Force_2',   card: 'two_level.two_hearts.two_nt_force', kind: 'check' },
  { pdf: 'New Suit NF_2', card: 'two_level.two_hearts.new_suit_nf', kind: 'check' },
  { pdf: '2H Force New describe',    card: 'two_level.two_hearts.description', kind: 'text' },
  { pdf: '2NT Force New Suit NFRow1', card: 'two_level.two_hearts.notes',      kind: 'text' },

  { pdf: '2s_2',         card: 'two_level.two_spades.min_hcp', kind: 'text' },
  { pdf: 'to_16',        card: 'two_level.two_spades.max_hcp', kind: 'text' },
  { pdf: 'NaturalWeak_3', card: 'two_level.two_spades.meaning', kind: 'check', value: 'weak' },
  { pdf: 'Intermediate_4', card: 'two_level.two_spades.meaning', kind: 'check', value: 'intermediate' },
  { pdf: 'Strong_4',      card: 'two_level.two_spades.meaning', kind: 'check', value: 'strong' },
  { pdf: 'Conv_5',        card: 'two_level.two_spades.meaning', kind: 'check', value: 'conventional' },
  { pdf: '2NT Force_3',   card: 'two_level.two_spades.two_nt_force', kind: 'check' },
  { pdf: 'New Suit NF_3', card: 'two_level.two_spades.new_suit_nf', kind: 'check' },
  { pdf: '2S Force New describe',      card: 'two_level.two_spades.description', kind: 'text' },
  { pdf: '2NT Force New Suit NFRow1_2', card: 'two_level.two_spades.notes',      kind: 'text' },

  // ─── OTHER CONV CALLS ───
  { pdf: 'OTHER CONV CALLS New Minor Forcing', card: 'other_conventions.new_minor_forcing.play', kind: 'check' },
  { pdf: '2Way NMF',                            card: 'other_conventions.two_way_nmf', kind: 'check' },
  { pdf: 'undefined_17',                        card: 'other_conventions.nmf_notes',   kind: 'text' },
  { pdf: 'Weak  Jump  Shifts  In  Comp',        card: 'other_conventions.weak_jump_shifts_in_comp', kind: 'check' },
  { pdf: 'Not  in  Comp',                       card: 'other_conventions.weak_jump_shifts_not_in_comp', kind: 'check' },
  { pdf: 'undefined_18',                        card: 'other_conventions.weak_jump_shifts_notes', kind: 'text' },
  { pdf: '4th  Suit  Forcing  1 Rd',            card: 'other_conventions.fourth_suit_forcing.one_round', kind: 'check' },
  { pdf: 'Game',                                card: 'other_conventions.fourth_suit_forcing.game_force', kind: 'check' },
  { pdf: 'undefined_19',                        card: 'other_conventions.fourth_suit_forcing.notes', kind: 'text' },

  // ─── SPECIAL DOUBLES ───
  { pdf: 'After Overcall Penalty', card: 'doubles.after_overcall_penalty', kind: 'check' },
  { pdf: 'SPECIAL DOUBLES',  card: 'doubles.after_overcall_penalty_notes', kind: 'text' },
  { pdf: 'Negative',         card: 'doubles.negative.play',    kind: 'check' },
  { pdf: 'thru',             card: 'doubles.negative.through', kind: 'text' },
  { pdf: 'Responsive',       card: 'doubles.responsive.play',  kind: 'check' },
  { pdf: 'thru_2',           card: 'doubles.responsive.through', kind: 'text' },
  { pdf: 'Maximal',          card: 'doubles.maximal',          kind: 'check' },
  { pdf: 'Support Dbl',      card: 'doubles.support.play',     kind: 'check' },
  { pdf: 'thru_3',           card: 'doubles.support.through',  kind: 'text' },
  { pdf: 'Redbl',            card: 'doubles.support.rdbl',     kind: 'check' },
  { pdf: 'Cardshowing',      card: 'doubles.card_showing',     kind: 'check' },
  { pdf: 'Min Offshape TO',  card: 'doubles.min_offshape_to',  kind: 'check' },
  { pdf: 'undefined_5',      card: 'doubles.notes',            kind: 'text' },

  // ─── SIMPLE OVERCALL ───
  { pdf: 'SIMPLE OVERCALL',   card: 'overcalls.one_level_min',    kind: 'text' },
  { pdf: 'to_3',              card: 'overcalls.one_level_max',    kind: 'text' },
  { pdf: 'often 4 cards',     card: 'overcalls.often_4_cards',    kind: 'check' },
  { pdf: 'very light style',  card: 'overcalls.very_light',       kind: 'check' },
  { pdf: 'New Suit Forcing',  card: 'overcalls.responses.new_suit', kind: 'check', value: 'forcing' },
  { pdf: 'NFConst',           card: 'overcalls.responses.new_suit', kind: 'check', value: 'nf_constructive' },
  { pdf: 'NF',                card: 'overcalls.responses.new_suit', kind: 'check', value: 'nf' },
  { pdf: 'Jump Raise Forcing', card: 'overcalls.responses.jump_raise', kind: 'check', value: 'invitational' },
  { pdf: 'Inv',               card: 'overcalls.responses.jump_raise', kind: 'check', value: 'invitational' },
  { pdf: 'Weak',              card: 'overcalls.responses.jump_raise', kind: 'check', value: 'weak' },
  { pdf: 'undefined_7',       card: 'overcalls.notes',            kind: 'text' },

  // ─── JUMP OVERCALL ───
  { pdf: 'Strong',       card: 'overcalls.jump', kind: 'check', value: 'strong' },
  { pdf: 'Intermediate', card: 'overcalls.jump', kind: 'check', value: 'intermediate' },
  { pdf: 'Weak_2',       card: 'overcalls.jump', kind: 'check', value: 'weak' },

  // ─── OPENING PREEMPTS ───
  { pdf: 'Sound',      card: 'preempts.three_level_style', kind: 'check', value: 'sound' },
  { pdf: 'Light',      card: 'preempts.three_level_style', kind: 'check', value: 'light' },
  { pdf: 'Very Light', card: 'preempts.three_level_style', kind: 'check', value: 'very_light' },
  { pdf: 'ConvResp',   card: 'preempts.three_level_response', kind: 'text' },

  // ─── DIRECT CUEBID (3×3 matrix: rows = Natural/Strong T/O/Michaels; cols = Minor/Major/Artif Bids) ───
  { pdf: 'Natural Minor',       card: 'direct_cuebids.nat_minors_natural',  kind: 'check' },
  { pdf: 'Natural Major',       card: 'direct_cuebids.nat_majors_natural',  kind: 'check' },
  { pdf: 'Natural Artif Bids',  card: 'direct_cuebids.art_natural',         kind: 'check' },
  { pdf: 'Strong Minor',        card: 'direct_cuebids.nat_minors_other',    kind: 'check' },
  { pdf: 'Strong Major',        card: 'direct_cuebids.nat_majors_other',    kind: 'check' },
  { pdf: 'Strong Artif Bids',   card: 'direct_cuebids.art_other',           kind: 'check' },
  { pdf: 'Michaels Minor',      card: 'direct_cuebids.nat_minors_michaels', kind: 'check' },
  { pdf: 'Michaels Major',      card: 'direct_cuebids.nat_majors_michaels', kind: 'check' },
  { pdf: 'Michaels Artif Bids', card: 'direct_cuebids.art_michaels',        kind: 'check' },
  { pdf: 'Michaels',            card: 'direct_cuebids.description',         kind: 'text' },

  // ─── SLAM CONVENTIONS ───
  { pdf: 'SLAM CONVENTIONS   Gerber', card: 'other_conventions.gerber.play', kind: 'check' },
  { pdf: '4NT Blackwood',             card: 'other_conventions.blackwood.standard', kind: 'check' },
  { pdf: 'RKC',                       card: 'other_conventions.blackwood.rkcb_0314', kind: 'check' },
  { pdf: '1430',                      card: 'other_conventions.blackwood.rkcb_1430', kind: 'check' },
  { pdf: 'vs Interference DOPI',      card: 'slam.dopi', kind: 'check' },
  { pdf: 'DEPO',                       card: 'slam.depo', kind: 'check' },
  { pdf: 'ROPI',                       card: 'slam.ropi', kind: 'check' },
  { pdf: 'undefined_14',              card: 'slam.trump_level', kind: 'text' },
  { pdf: '1_4',                       card: 'slam.control_bids',     kind: 'text' },
  { pdf: '2_4',                       card: 'slam.vs_interference',  kind: 'text' },

  // ─── NOTRUMP OVERCALLS ───
  { pdf: 'NOTRUMP OVERCALLS', card: 'nt_overcalls.direct.range_min', kind: 'text' },
  { pdf: 'undefined',         card: 'nt_overcalls.direct.range_max', kind: 'text' },
  { pdf: 'Systems on',        card: 'nt_overcalls.direct.systems_on', kind: 'check' },
  { pdf: 'Conv',              card: 'nt_overcalls.direct.conv_text',  kind: 'text' },
  { pdf: 'to_2',              card: 'nt_overcalls.balance.range_min', kind: 'text' },
  { pdf: 'undefined_2',       card: 'nt_overcalls.balance.range_max', kind: 'text' },
  { pdf: 'Jump to 2NT 2 Lowest', card: 'nt_overcalls.jump_2nt_lowest_unbid', kind: 'check' },
  { pdf: 'Minors',               card: 'nt_overcalls.jump_2nt_minors',       kind: 'check' },
  { pdf: 'undefined_3',          card: 'nt_overcalls.balance.conv_text',     kind: 'text' },

  // ─── DEFENSE VS NOTRUMP ───
  // Left column (vs strong) + right column (vs weak)
  { pdf: 'DEFENSE VS NOTRUMP', card: 'competitive.vs_1nt_strong.system', kind: 'text' },
  { pdf: '1',                  card: 'competitive.vs_1nt_weak.system',   kind: 'text' },
  { pdf: '2c_2', card: 'competitive.vs_1nt_strong.2c', kind: 'text' },
  { pdf: '2',    card: 'competitive.vs_1nt_weak.2c',   kind: 'text' },
  { pdf: '2d',   card: 'competitive.vs_1nt_strong.2d', kind: 'text' },
  { pdf: '3',    card: 'competitive.vs_1nt_weak.2d',   kind: 'text' },
  { pdf: '2h',   card: 'competitive.vs_1nt_strong.2h', kind: 'text' },
  { pdf: '4',    card: 'competitive.vs_1nt_weak.2h',   kind: 'text' },
  { pdf: '2s 1', card: 'competitive.vs_1nt_strong.2s', kind: 'text' },
  { pdf: '5',    card: 'competitive.vs_1nt_weak.2s',   kind: 'text' },
  { pdf: 'Dbl',  card: 'competitive.vs_1nt_strong.dbl', kind: 'text' },
  { pdf: '6',    card: 'competitive.vs_1nt_weak.dbl',   kind: 'text' },
  { pdf: '2s 2', card: 'competitive.vs_1nt_strong.other', kind: 'text' },
  { pdf: 'Other_2', card: 'competitive.vs_1nt_weak.other', kind: 'text' },

  // ─── OVER OPP'S T/O DOUBLE ───
  { pdf: 'New Suit Forcing 1 level',  card: 'vs_to_double.new_suit_forcing_1lvl',     kind: 'check' },
  { pdf: '2 level',                   card: 'vs_to_double.new_suit_forcing_2lvl',     kind: 'check' },
  { pdf: 'Jump Shift Forcing',        card: 'vs_to_double.jump_shift', kind: 'check', value: 'forcing' },
  { pdf: 'Inv_2',                     card: 'vs_to_double.jump_shift', kind: 'check', value: 'inv' },
  { pdf: 'Weak_3',                    card: 'vs_to_double.jump_shift', kind: 'check', value: 'weak' },
  { pdf: 'Fit',                       card: 'vs_to_double.jump_shift', kind: 'check', value: 'fit' },
  { pdf: 'Redbl implies no fit',      card: 'vs_to_double.redouble.denies_fit',       kind: 'check' },
  { pdf: 'Transfer Resp',             card: 'vs_to_double.new_suit_forcing_tfr',      kind: 'check' },
  // 2NT Over matrix
  { pdf: 'Majors Limit+', card: 'vs_to_double.two_nt_raise_majors.limit_plus', kind: 'check' },
  { pdf: 'Majors Limit',  card: 'vs_to_double.two_nt_raise_majors.limit',      kind: 'check' },
  { pdf: 'Majors Weak',   card: 'vs_to_double.two_nt_raise_majors.weak',       kind: 'check' },
  { pdf: 'Minors Limit+', card: 'vs_to_double.two_nt_raise_minors.limit_plus', kind: 'check' },
  { pdf: 'Minors Limit',  card: 'vs_to_double.two_nt_raise_minors.limit',      kind: 'check' },
  { pdf: 'Minors Weak',   card: 'vs_to_double.two_nt_raise_minors.weak',       kind: 'check' },
  { pdf: 'Minors_2',      card: 'vs_to_double.notes',                          kind: 'text' },

  // ─── VS Opening Preempts ───
  { pdf: 'Takeout',                  card: 'vs_preempts.takeout_double',           kind: 'check' },
  { pdf: 'VS Opening Preempts Double Is', card: 'vs_preempts.takeout_double_thru', kind: 'text' },
  { pdf: 'Penalty',                  card: 'vs_preempts.takeout_double_penalty',   kind: 'check' },
  { pdf: 'thru_4',                   card: 'vs_preempts.conv_takeout',             kind: 'text' },
  { pdf: 'Lebensohl  2NT  Response', card: 'vs_preempts.lebensohl_response',       kind: 'check' },
  { pdf: 'Other_4',                  card: 'vs_preempts.notes',                    kind: 'text' },

  // ─── DEFENSIVE CARDING ───
  { pdf: 'Standard vs Suits',  card: 'carding.suits.standard_attitude', kind: 'check' },
  { pdf: 'Standard vs NT',     card: 'carding.nt.standard_attitude',    kind: 'check' },
  { pdf: 'Except',             card: 'carding.exceptions_present',      kind: 'check' },
  { pdf: 'Except 1',           card: 'carding.exception_suits',         kind: 'text' },
  { pdf: 'Except 2',           card: 'carding.exception_nt',            kind: 'text' },
  { pdf: 'count vs Suits',     card: 'carding.suits.upside_down_count', kind: 'check' },
  { pdf: 'count vs NT',        card: 'carding.nt.upside_down_count',    kind: 'check' },
  { pdf: 'attitude vs Suits',  card: 'carding.suits.upside_down_attitude', kind: 'check' },
  { pdf: 'attitude vs NT',     card: 'carding.nt.upside_down_attitude',    kind: 'check' },
  { pdf: 'Upside-down',        card: 'carding.upside_down_notes',       kind: 'text' },

  // ─── FIRST DISCARD ───
  { pdf: 'Lavinthal vs Suits',  card: 'carding.first_discard.lavinthal_suits', kind: 'check' },
  { pdf: 'Lavinthal vs NT',     card: 'carding.first_discard.lavinthal_nt',    kind: 'check' },
  { pdf: 'odd/even vs Suits',   card: 'carding.first_discard.odd_even_suits',  kind: 'check' },
  { pdf: 'odd/even vs NT',      card: 'carding.first_discard.odd_even_nt',     kind: 'check' },
  { pdf: 'other vs Suits',      card: 'carding.first_discard.other_suits',     kind: 'check' },
  { pdf: 'other vs NT',         card: 'carding.first_discard.other_nt',        kind: 'check' },
  { pdf: 'OddEven',             card: 'carding.first_discard.notes',           kind: 'text' },

  // ─── OTHER CARDING ───
  { pdf: 'smith echo vs Suits',  card: 'carding.smith_echo_suits',  kind: 'check' },
  { pdf: 'smith echo vs NT',     card: 'carding.smith_echo_nt',     kind: 'check' },
  { pdf: 'Trump vs Suits',       card: 'carding.trump_signals',     kind: 'check' },
  { pdf: 'foster echo vs Suits', card: 'carding.foster_echo_suits', kind: 'check' },
  { pdf: 'foster echo vs NT',    card: 'carding.foster_echo_nt',    kind: 'check' },

  // ─── PRIMARY SIGNAL (to partner's leads) ───
  { pdf: 'Attitude',        card: 'carding.partner_lead.attitude',        kind: 'check' },
  { pdf: 'Count',           card: 'carding.partner_lead.count',           kind: 'check' },
  { pdf: 'Suit preference', card: 'carding.partner_lead.suit_preference', kind: 'check' },

  // ─── LENGTH LEADS ───
  { pdf: 'vs SUITS',        card: 'leads.vs_suits.length.fourth_best', kind: 'check' },
  { pdf: 'vs NT',           card: 'leads.vs_nt.length.fourth_best',    kind: 'check' },
  { pdf: 'vs SUITS_2',      card: 'leads.vs_suits.length.third_fifth', kind: 'check' },
  { pdf: 'vs NT_2',         card: 'leads.vs_nt.length.third_fifth',    kind: 'check' },
  { pdf: 'Attitude vs NT',  card: 'leads.vs_nt.length.attitude',       kind: 'check' },
  { pdf: 'Attitude vs NT text', card: 'leads.vs_nt.length.attitude_text', kind: 'text' },

  // ─── SPECIAL CARDING ───
  { pdf: 'SPECIAL CARDING', card: 'carding.special_carding', kind: 'check' },

  // ─── Additional NT openings ───
  { pdf: 'Game Forcing Except When Suit Rebid', card: 'major_openings.two_over_one.game_forcing_except', kind: 'check' },

  // ─── 2♣ continuation row + Drury In Comp ───
  // The 2♣ box has a second row of DESCRIBE / RESPONSES-REBIDS columns
  // that don't map to existing card_data — placeholder for future fields.
  { pdf: '2CD Force New describe',    card: 'two_level.two_clubs.continuation_describe', kind: 'text' },
  { pdf: '2CD Force New Suit NFRow1', card: 'two_level.two_clubs.continuation_response', kind: 'text' },

  // ─── First-discard fixes ───
  // bridgeodex writes a single first_discard flag (not separated by
  // SUITS/NT). Mirror the boolean to both ACBL columns so users see
  // both filled when they play Lavinthal or Odd/Even universally.
  // (These OVERRIDE the earlier suits-only mappings.)
  { pdf: 'Lavinthal vs Suits',  card: 'carding.first_discard.lavinthal', kind: 'check' },
  { pdf: 'Lavinthal vs NT',     card: 'carding.first_discard.lavinthal', kind: 'check' },
  { pdf: 'odd/even vs Suits',   card: 'carding.first_discard.odd_even',  kind: 'check' },
  { pdf: 'odd/even vs NT',      card: 'carding.first_discard.odd_even',  kind: 'check' }
]

// ─────────────────────────────────────────────────────────────────
// ACBL "New" form field map
// ─────────────────────────────────────────────────────────────────
// The New form uses a clean hierarchical naming scheme:
//   <SECTION>.<c|t>.<N>
// where SECTION is a short code (Name, OV, 1NT, 2NT, …) and c/t marks
// checkbox vs text. Mappings derived from documentation/convention-card-
// formats/SCHEMA_MAPPING.md, which itself was built from the labelled
// debug PDF (Shift+Alt+click Export in the editor).

const FIELD_MAP_NEW = [
  // ─── Names + Overview ───
  { pdf: 'Name.t.1', card: 'metadata.partner_names', kind: 'text' },
  { pdf: 'OV.t.1',  card: 'general.system',             kind: 'text' },
  { pdf: 'OV.t.2',  card: 'general.min_hcp_open',       kind: 'text' },
  { pdf: 'OV.t.3',  card: 'general.min_hcp_respond',    kind: 'text' },
  { pdf: 'OV.c.4',  card: 'general.forcing_opening_1c', kind: 'check' },
  { pdf: 'OV.c.5',  card: 'general.forcing_opening_2c', kind: 'check' },
  { pdf: 'OV.t.6',  card: 'general.forcing_opening_other', kind: 'text' },
  { pdf: 'OV.c.7',  card: 'general.nt_open_style', kind: 'check', value: 'strong' },
  { pdf: 'OV.c.8',  card: 'general.nt_open_style', kind: 'check', value: 'weak' },
  { pdf: 'OV.c.9',  card: 'general.nt_open_style', kind: 'check', value: 'variable' },
  { pdf: 'OV.t.10', card: 'general.bids_requiring_prep', kind: 'text' },

  // ─── 1NT ───
  { pdf: '1NT.t.1',  card: 'notrump.one_nt.range_min', kind: 'text' },
  { pdf: '1NT.t.2',  card: 'notrump.one_nt.range_max', kind: 'text' },
  { pdf: '1NT.t.3',  card: 'notrump.one_nt.seat_vul',  kind: 'text' },
  { pdf: '1NT.c.4',  card: 'notrump.one_nt.five_card_major', kind: 'check', value: ['sometimes', 'always'] },
  { pdf: '1NT.t.5',  card: 'notrump.one_nt.sys_on_vs', kind: 'text' },
  { pdf: '1NT.c.6',  card: 'notrump.stayman.forcing',  kind: 'check' },
  { pdf: '1NT.c.7',  card: 'notrump.stayman.puppet',   kind: 'check' },
  // Each "N: Nat ☐ Tfr ☐" row has the Natural box FIRST (lower x) and the
  // Transfer box SECOND. The transfer flags must target the second box
  // (.c.10/.13/.16/.19); the first box (.c.9/.12/.15/.18) is "Natural"
  // and is intentionally left unmapped so it stays unchecked for a
  // transfer-playing pair. (Mapping transfers to the first box checked
  // "Nat" instead of "Tfr" — a silent mismap, since the field exists.)
  { pdf: '1NT.c.10', card: 'notrump.transfers.jacoby', kind: 'check' },
  { pdf: '1NT.t.11', card: 'notrump.responses.2d_other', kind: 'text' },
  { pdf: '1NT.c.13', card: 'notrump.transfers.jacoby', kind: 'check' },
  { pdf: '1NT.t.14', card: 'notrump.responses.2h_other', kind: 'text' },
  { pdf: '1NT.c.16', card: 'notrump.transfers.spades_relay', kind: 'check' },
  { pdf: '1NT.t.17', card: 'notrump.responses.2s_other', kind: 'text' },
  { pdf: '1NT.c.18', card: 'notrump.two_nt_natural', kind: 'check' },
  { pdf: '1NT.c.19', card: 'notrump.transfers.two_nt', kind: 'check' },
  { pdf: '1NT.t.20', card: 'notrump.responses.2nt_other', kind: 'text' },
  { pdf: '1NT.c.21', card: 'notrump.smolen.play',      kind: 'check' },
  { pdf: '1NT.c.22', card: 'notrump.transfers.texas_4c', kind: 'check' },
  { pdf: '1NT.c.23', card: 'notrump.transfers.texas_4d', kind: 'check' },
  { pdf: '1NT.c.24', card: 'notrump.transfers.texas_4h', kind: 'check' },
  { pdf: '1NT.c.25', card: 'notrump.dbl.negative',     kind: 'check' },
  { pdf: '1NT.t.26', card: 'notrump.dbl.negative_desc', kind: 'text' },
  { pdf: '1NT.c.27', card: 'notrump.dbl.penalty',      kind: 'check' },
  { pdf: '1NT.t.28', card: 'notrump.one_nt_alt.range_min', kind: 'text' },
  { pdf: '1NT.t.29', card: 'notrump.one_nt_alt.range_max', kind: 'text' },
  { pdf: '1NT.c.30', card: 'notrump.one_nt_alt.same_responses', kind: 'check' },
  { pdf: '1NT.t.32', card: 'notrump.responses.3c',     kind: 'text' },
  { pdf: '1NT.t.33', card: 'notrump.responses.3d',     kind: 'text' },
  { pdf: '1NT.t.34', card: 'notrump.responses.3h',     kind: 'text' },
  { pdf: '1NT.t.35', card: 'notrump.responses.3s',     kind: 'text' },
  { pdf: '1NT.t.38', card: 'notrump.dbl.other',        kind: 'text' },
  { pdf: '1NT.c.39', card: 'notrump.lebensohl.over_interference', kind: 'check' },
  { pdf: '1NT.t.40', card: 'notrump.lebensohl.description', kind: 'text' },

  // ─── 2NT ───
  { pdf: '2NT.t.1',  card: 'notrump.two_nt.range_min', kind: 'text' },
  { pdf: '2NT.t.2',  card: 'notrump.two_nt.range_max', kind: 'text' },
  { pdf: '2NT.c.3',  card: 'notrump.two_nt.puppet',    kind: 'check' },
  { pdf: '2NT.c.4',  card: 'notrump.two_nt.three_s',   kind: 'check' },
  { pdf: '2NT.t.5',  card: 'notrump.two_nt.three_s_desc', kind: 'text' },
  { pdf: '2NT.c.8',  card: 'notrump.two_nt.transfers_3level', kind: 'check' },
  { pdf: '2NT.c.9',  card: 'notrump.two_nt.transfers_4level', kind: 'check' },
  { pdf: '2NT.c.10', card: 'notrump.two_nt.neg_dbl',   kind: 'check' },
  { pdf: '2NT.t.11', card: 'notrump.two_nt.notes',     kind: 'text' },

  // ─── 3NT ───
  { pdf: '3NT.t.1', card: 'three_nt.range_min', kind: 'text' },
  { pdf: '3NT.t.2', card: 'three_nt.range_max', kind: 'text' },
  { pdf: '3NT.c.3', card: 'three_nt.one_suit',  kind: 'check' },
  { pdf: '3NT.t.4', card: 'three_nt.one_suit_desc', kind: 'text' },

  // ─── Major opening (1H1S) ───
  { pdf: '1H1S.c.1',  card: 'major_openings.min_length_1st_2nd', kind: 'check', value: '4' },
  { pdf: '1H1S.c.2',  card: 'major_openings.min_length_1st_2nd', kind: 'check', value: '5' },
  { pdf: '1H1S.c.3',  card: 'major_openings.min_length_3rd_4th', kind: 'check', value: '4' },
  { pdf: '1H1S.c.4',  card: 'major_openings.min_length_3rd_4th', kind: 'check', value: '5' },
  { pdf: '1H1S.c.5',  card: 'major_openings.one_nt_response.forcing',      kind: 'check' },
  { pdf: '1H1S.c.6',  card: 'major_openings.one_nt_response.semi_forcing', kind: 'check' },
  { pdf: '1H1S.c.7',  card: 'major_openings.one_nt_response.bypass_1s',    kind: 'check' },
  { pdf: '1H1S.c.8',  card: 'major_openings.jacoby_2nt.play',    kind: 'check' },
  { pdf: '1H1S.c.9',  card: 'major_openings.three_nt_raise.play', kind: 'check' },
  { pdf: '1H1S.c.10', card: 'major_openings.splinters.play',     kind: 'check' },
  { pdf: '1H1S.t.11', card: 'major_openings.art_raises_other',    kind: 'text' },
  { pdf: '1H1S.c.12', card: 'major_openings.drury.play',          kind: 'check' },
  { pdf: '1H1S.c.13', card: 'major_openings.drury.reverse',       kind: 'check' },
  { pdf: '1H1S.c.14', card: 'major_openings.drury.in_comp',       kind: 'check' },
  { pdf: '1H1S.c.17', card: 'major_openings.jump_raise.weak',     kind: 'check' },
  { pdf: '1H1S.c.18', card: 'major_openings.jump_raise.mixed',    kind: 'check' },
  { pdf: '1H1S.c.19', card: 'major_openings.jump_raise.inv',      kind: 'check' },
  { pdf: '1H1S.c.20', card: 'major_openings.jump_raise_after_overcall.weak',  kind: 'check' },
  { pdf: '1H1S.c.21', card: 'major_openings.jump_raise_after_overcall.mixed', kind: 'check' },
  { pdf: '1H1S.c.22', card: 'major_openings.jump_raise_after_overcall.inv',   kind: 'check' },
  { pdf: '1H1S.t.16', card: 'major_openings.notes',               kind: 'text' },
  { pdf: '1H1S.t.16b', card: 'major_openings.bergen_raises_notes', kind: 'text' },

  // ─── 1♣ opening (1C) ───
  { pdf: '1C.c.1', card: 'minor_openings.one_club.min_length', kind: 'check', value: '5' },
  { pdf: '1C.c.2', card: 'minor_openings.one_club.min_length', kind: 'check', value: '4' },
  { pdf: '1C.c.3', card: 'minor_openings.one_club.min_length', kind: 'check', value: '3' },
  { pdf: '1C.c.4', card: 'minor_openings.one_club.nf2', kind: 'check' },
  { pdf: '1C.c.6', card: 'minor_openings.one_club.nf1', kind: 'check' },
  { pdf: '1C.c.7', card: 'minor_openings.one_club.nf0', kind: 'check' },
  { pdf: '1C.c.8', card: 'minor_openings.one_club.art_forcing', kind: 'check' },
  { pdf: '1C.c.10', card: 'minor_openings.one_club.transfer_resp', kind: 'check' },
  { pdf: '1C.t.11', card: 'minor_openings.notes', kind: 'text' },
  { pdf: '1C.c.13', card: 'minor_openings.bypass_5_plus', kind: 'check' },
  { pdf: '1C.t.14', card: 'minor_openings.one_club.one_nt_range_min', kind: 'text' },
  { pdf: '1C.t.15', card: 'minor_openings.one_club.one_nt_range_max', kind: 'text' },
  { pdf: '1C.t.16', card: 'minor_openings.one_club.two_nt_range_min', kind: 'text' },
  { pdf: '1C.t.17', card: 'minor_openings.one_club.two_nt_range_max', kind: 'text' },
  { pdf: '1C.c.18', card: 'minor_openings.one_club.single_raise.nf', kind: 'check' },
  { pdf: '1C.c.19', card: 'minor_openings.one_club.single_raise.inv', kind: 'check' },
  { pdf: '1C.c.20', card: 'minor_openings.one_club.single_raise.gf', kind: 'check' },
  { pdf: '1C.c.21', card: 'minor_openings.one_club.jump_raise.weak', kind: 'check' },
  { pdf: '1C.c.22', card: 'minor_openings.one_club.jump_raise.mixed', kind: 'check' },
  { pdf: '1C.c.23', card: 'minor_openings.one_club.jump_raise.inv', kind: 'check' },
  { pdf: '1C.c.24', card: 'minor_openings.one_club.jump_raise_after_overcall.weak', kind: 'check' },
  { pdf: '1C.c.25', card: 'minor_openings.one_club.jump_raise_after_overcall.mixed', kind: 'check' },
  { pdf: '1C.c.26', card: 'minor_openings.one_club.jump_raise_after_overcall.inv', kind: 'check' },

  // ─── 1♦ opening (1D) ───
  { pdf: '1D.c.1', card: 'minor_openings.one_diamond.min_length', kind: 'check', value: '5' },
  { pdf: '1D.c.2', card: 'minor_openings.one_diamond.min_length', kind: 'check', value: '4' },
  { pdf: '1D.c.3', card: 'minor_openings.one_diamond.min_length', kind: 'check', value: '3' },
  { pdf: '1D.c.5', card: 'minor_openings.one_diamond.nf2_4432_only', kind: 'check' },
  { pdf: '1D.c.8', card: 'minor_openings.one_diamond.art_forcing',  kind: 'check' },
  { pdf: '1D.c.10', card: 'minor_openings.one_diamond.same_as_1c', kind: 'check' },
  // 1♦ raises mirror the 1♣ schema if the user keeps separate flags;
  // when same_as_1c is set, the editor leaves these empty.
  { pdf: '1D.t.12', card: 'minor_openings.one_diamond.one_nt_range_min', kind: 'text' },
  { pdf: '1D.t.13', card: 'minor_openings.one_diamond.one_nt_range_max', kind: 'text' },
  { pdf: '1D.t.14', card: 'minor_openings.one_diamond.two_nt_range_min', kind: 'text' },
  { pdf: '1D.t.15', card: 'minor_openings.one_diamond.two_nt_range_max', kind: 'text' },
  { pdf: '1D.c.16', card: 'minor_openings.one_diamond.single_raise.nf',  kind: 'check' },
  { pdf: '1D.c.17', card: 'minor_openings.one_diamond.single_raise.inv', kind: 'check' },
  { pdf: '1D.c.18', card: 'minor_openings.one_diamond.single_raise.gf',  kind: 'check' },
  { pdf: '1D.c.19', card: 'minor_openings.one_diamond.jump_raise.weak',  kind: 'check' },
  { pdf: '1D.c.20', card: 'minor_openings.one_diamond.jump_raise.mixed', kind: 'check' },
  { pdf: '1D.c.21', card: 'minor_openings.one_diamond.jump_raise.inv',   kind: 'check' },
  { pdf: '1D.c.22', card: 'minor_openings.one_diamond.jump_raise_after_overcall.weak',  kind: 'check' },
  { pdf: '1D.c.23', card: 'minor_openings.one_diamond.jump_raise_after_overcall.mixed', kind: 'check' },
  { pdf: '1D.c.24', card: 'minor_openings.one_diamond.jump_raise_after_overcall.inv',   kind: 'check' },

  // ─── 2♣ opening (2C) ───
  { pdf: '2C.t.1',  card: 'two_level.two_clubs.min_hcp_str', kind: 'text' },
  { pdf: '2C.t.2',  card: 'two_level.two_clubs.max_hcp',     kind: 'text' },
  { pdf: '2C.t.3a', card: 'two_level.two_clubs.description', kind: 'text' },
  { pdf: '2C.c.3b', card: 'two_level.two_clubs.2d_response', kind: 'check', value: 'negative' },
  { pdf: '2C.c.4',  card: 'two_level.two_clubs.2d_response', kind: 'check', value: 'waiting' },
  { pdf: '2C.c.5',  card: 'two_level.two_clubs.2h_response', kind: 'check', value: 'steps' },
  { pdf: '2C.c.7',  card: 'two_level.two_clubs.2h_response', kind: 'check', value: 'negative' },
  { pdf: '2C.c.8',  card: 'two_level.two_clubs.meaning', kind: 'check', value: 'very_strong' },
  { pdf: '2C.c.9',  card: 'two_level.two_clubs.meaning', kind: 'check', value: 'strong' },
  { pdf: '2C.c.10', card: 'two_level.two_clubs.meaning', kind: 'check', value: 'natural' },
  { pdf: '2C.c.11', card: 'two_level.two_clubs.meaning', kind: 'check', value: 'conventional' },
  { pdf: '2C.t.13', card: 'two_level.two_clubs.notes', kind: 'text' },

  // ─── 2♦ / 2♥ / 2♠ weak twos ───
  ...weakTwoMapping('2D', 'diamonds'),
  ...weakTwoMapping('2H', 'hearts'),
  // 2♠ max-HCP field is named `21.t.2` in the template (typo in the
  // original PDF authoring tool — likely "2S" got turned into "21").
  ...weakTwoMapping('2S', 'spades', '21'),

  // ─── Other Conventional Calls (O) ───
  { pdf: 'O.t.1', card: 'other_conventions.jump_shift_response', kind: 'text' },
  { pdf: 'O.t.2', card: 'other_conventions.vs_strong_open', kind: 'text' },
  { pdf: 'O.c.3', card: 'other_conventions.new_minor_forcing.play', kind: 'check' },
  { pdf: 'O.c.4', card: 'other_conventions.two_way_nmf', kind: 'check' },
  { pdf: 'O.c.5', card: 'other_conventions.xyz', kind: 'check' },
  { pdf: 'O.c.6', card: 'other_conventions.fourth_suit_forcing.one_round', kind: 'check' },
  { pdf: 'O.c.7', card: 'other_conventions.fourth_suit_forcing.game_force', kind: 'check' },
  // Two catch-all free-text rows at the bottom of the OTHER section.
  // The bridgeodex importer writes `more1`/`more2` into these.
  { pdf: 'O.t.8', card: 'other_conventions.notes_line_1', kind: 'text' },
  { pdf: 'O.t.9', card: 'other_conventions.notes_line_2', kind: 'text' },

  // ─── Doubles (D) ───
  { pdf: 'D.c.1',  card: 'doubles.negative.play',           kind: 'check' },
  { pdf: 'D.t.2',  card: 'doubles.negative.through',        kind: 'text' },
  { pdf: 'D.c.3',  card: 'doubles.after_overcall_penalty',  kind: 'check' },
  { pdf: 'D.c.4',  card: 'doubles.responsive.play',         kind: 'check' },
  { pdf: 'D.t.5',  card: 'doubles.responsive.through',      kind: 'text' },
  { pdf: 'D.c.6',  card: 'doubles.maximal',                  kind: 'check' },
  { pdf: 'D.c.7',  card: 'doubles.support.play',             kind: 'check' },
  { pdf: 'D.t.8',  card: 'doubles.support.through',          kind: 'text' },
  { pdf: 'D.c.9',  card: 'doubles.support.rdbl',             kind: 'check' },
  { pdf: 'D.t.10', card: 'doubles.takeout_style',            kind: 'text' },
  { pdf: 'D.t.11', card: 'doubles.notes',                    kind: 'text' },

  // ─── Overcalls (OC) ───
  { pdf: 'OC.t.1',  card: 'overcalls.one_level_min', kind: 'text' },
  { pdf: 'OC.t.2',  card: 'overcalls.one_level_max', kind: 'text' },
  { pdf: 'OC.c.3',  card: 'overcalls.often_4_cards', kind: 'check' },
  { pdf: 'OC.t.4',  card: 'overcalls.two_level_min', kind: 'text' },
  { pdf: 'OC.t.5',  card: 'overcalls.two_level_max', kind: 'text' },
  { pdf: 'OC.c.6',  card: 'overcalls.jump', kind: 'check', value: 'weak' },
  { pdf: 'OC.c.7',  card: 'overcalls.jump', kind: 'check', value: 'intermediate' },
  { pdf: 'OC.c.8',  card: 'overcalls.jump', kind: 'check', value: 'strong' },
  { pdf: 'OC.t.10', card: 'overcalls.conv_text', kind: 'text' },
  { pdf: 'OC.c.11', card: 'overcalls.responses.new_suit', kind: 'check', value: 'forcing' },
  { pdf: 'OC.c.12', card: 'overcalls.responses.new_suit', kind: 'check', value: 'nf_constructive' },
  { pdf: 'OC.c.13', card: 'overcalls.responses.new_suit', kind: 'check', value: 'nf' },
  { pdf: 'OC.c.14', card: 'overcalls.responses.new_suit', kind: 'check', value: 'transfer' },
  { pdf: 'OC.c.15', card: 'overcalls.responses.jump_raise', kind: 'check', value: 'weak' },
  { pdf: 'OC.c.17', card: 'overcalls.responses.jump_raise', kind: 'check', value: 'invitational' },
  { pdf: 'OC.t.18', card: 'overcalls.responses.cuebids_text', kind: 'text' },
  { pdf: 'OC.c.19', card: 'overcalls.responses.support_cuebid', kind: 'check' },
  { pdf: 'OC.t.20', card: 'overcalls.notes', kind: 'text' },

  // ─── NT Overcalls (NTO) ───
  { pdf: 'NTO.t.1',  card: 'nt_overcalls.direct.range_min', kind: 'text' },
  { pdf: 'NTO.t.2',  card: 'nt_overcalls.direct.range_max', kind: 'text' },
  { pdf: 'NTO.c.3',  card: 'nt_overcalls.direct.systems_on', kind: 'check' },
  { pdf: 'NTO.t.4',  card: 'nt_overcalls.balance.range_min', kind: 'text' },
  { pdf: 'NTO.t.5',  card: 'nt_overcalls.balance.range_max', kind: 'text' },
  { pdf: 'NTO.c.6',  card: 'nt_overcalls.balance.systems_on', kind: 'check' },
  { pdf: 'NTO.t.8',  card: 'nt_overcalls.conv_text', kind: 'text' },
  { pdf: 'NTO.c.9',  card: 'nt_overcalls.jump_2nt_lowest_unbid', kind: 'check' },
  { pdf: 'NTO.t.10', card: 'nt_overcalls.notes', kind: 'text' },

  // ─── Defense vs 1NT (V1NT) ───
  { pdf: 'V1NT.t.1',  card: 'competitive.vs_1nt_strong.system', kind: 'text' },
  { pdf: 'V1NT.t.2',  card: 'competitive.vs_1nt_weak.system',   kind: 'text' },
  { pdf: 'V1NT.t.3',  card: 'competitive.vs_1nt_strong.dbl',    kind: 'text' },
  { pdf: 'V1NT.t.4',  card: 'competitive.vs_1nt_weak.dbl',      kind: 'text' },
  { pdf: 'V1NT.t.5',  card: 'competitive.vs_1nt_strong.2c',     kind: 'text' },
  { pdf: 'V1NT.t.6',  card: 'competitive.vs_1nt_weak.2c',       kind: 'text' },
  { pdf: 'V1NT.t.7',  card: 'competitive.vs_1nt_strong.2d',     kind: 'text' },
  { pdf: 'V1NT.t.8',  card: 'competitive.vs_1nt_weak.2d',       kind: 'text' },
  { pdf: 'V1NT.t.9',  card: 'competitive.vs_1nt_strong.2h',     kind: 'text' },
  { pdf: 'V1NT.t.10', card: 'competitive.vs_1nt_weak.2h',       kind: 'text' },
  { pdf: 'V1NT.t.11', card: 'competitive.vs_1nt_strong.2s',     kind: 'text' },
  { pdf: 'V1NT.t.12', card: 'competitive.vs_1nt_weak.2s',       kind: 'text' },
  { pdf: 'V1NT.t.13', card: 'competitive.vs_1nt_strong.2nt',    kind: 'text' },
  { pdf: 'V1NT.t.14', card: 'competitive.vs_1nt_weak.2nt',      kind: 'text' },
  { pdf: 'V1NT.t.15', card: 'competitive.vs_1nt_strong.other',  kind: 'text' },

  // ─── Vs Takeout Double (VTD) ───
  { pdf: 'VTD.c.1',  card: 'vs_to_double.new_suit_forcing_2lvl', kind: 'check' },
  { pdf: 'VTD.c.2',  card: 'vs_to_double.new_suit_forcing_tfr',  kind: 'check' },
  { pdf: 'VTD.c.4',  card: 'vs_to_double.jump_shift', kind: 'check', value: 'weak' },
  { pdf: 'VTD.c.5',  card: 'vs_to_double.jump_shift', kind: 'check', value: 'mixed' },
  { pdf: 'VTD.c.6',  card: 'vs_to_double.jump_shift', kind: 'check', value: 'inv' },
  { pdf: 'VTD.c.7',  card: 'vs_to_double.jump_shift', kind: 'check', value: ['forcing', 'fit'] },
  { pdf: 'VTD.c.8',  card: 'vs_to_double.redouble.ten_plus',    kind: 'check' },
  { pdf: 'VTD.c.9',  card: 'vs_to_double.redouble.conv',        kind: 'check' },
  { pdf: 'VTD.t.10', card: 'vs_to_double.redouble.conv_desc',   kind: 'text' },
  { pdf: 'VTD.c.12', card: 'vs_to_double.two_nt_raise_minors.play', kind: 'check' },
  { pdf: 'VTD.t.13', card: 'vs_to_double.two_nt_raise_minors.range_min', kind: 'text' },
  { pdf: 'VTD.t.14', card: 'vs_to_double.two_nt_raise_minors.range_max', kind: 'text' },
  { pdf: 'VTD.c.16', card: 'vs_to_double.two_nt_raise_majors.play', kind: 'check' },
  { pdf: 'VTD.t.17', card: 'vs_to_double.two_nt_raise_majors.range_min', kind: 'text' },
  { pdf: 'VTD.t.18', card: 'vs_to_double.two_nt_raise_majors.range_max', kind: 'text' },
  { pdf: 'VTD.t.19', card: 'vs_to_double.notes', kind: 'text' },

  // ─── Vs Preempts (VP) ───
  { pdf: 'VP.t.1', card: 'vs_preempts.two_nt_overcall',          kind: 'text' },
  { pdf: 'VP.t.2', card: 'vs_preempts.takeout_double_thru',      kind: 'text' },
  { pdf: 'VP.c.3', card: 'vs_preempts.takeout_double_penalty',   kind: 'check' },
  { pdf: 'VP.c.4', card: 'vs_preempts.lebensohl_response',       kind: 'check' },
  { pdf: 'VP.t.5', card: 'vs_preempts.cuebid',                   kind: 'text' },
  { pdf: 'VP.t.6', card: 'vs_preempts.jump_overcalls',           kind: 'text' },
  { pdf: 'VP.t.7', card: 'vs_preempts.notes',                    kind: 'text' },

  // ─── Preempts (P) ───
  { pdf: 'P.t.1', card: 'preempts.three_level_style',    kind: 'text' },
  { pdf: 'P.t.3', card: 'preempts.three_level_response', kind: 'text' },
  { pdf: 'P.t.4', card: 'preempts.four_level_style',     kind: 'text' },
  { pdf: 'P.t.5', card: 'preempts.four_level_response',  kind: 'text' },
  { pdf: 'P.c.6', card: 'preempts.transfer_4_minor',     kind: 'check' },
  { pdf: 'P.t.7', card: 'preempts.notes',                kind: 'text' },

  // ─── Direct Cuebids (DC) — 4-column matrix: Art / Quasi / Nat-minors / Nat-majors ───
  { pdf: 'DC.c.1',  card: 'direct_cuebids.art_michaels',         kind: 'check' },
  { pdf: 'DC.c.2',  card: 'direct_cuebids.quasi_michaels',       kind: 'check' },
  { pdf: 'DC.c.3',  card: 'direct_cuebids.nat_minors_michaels',  kind: 'check' },
  { pdf: 'DC.c.4',  card: 'direct_cuebids.nat_majors_michaels',  kind: 'check' },
  { pdf: 'DC.c.5',  card: 'direct_cuebids.art_natural',          kind: 'check' },
  { pdf: 'DC.c.6',  card: 'direct_cuebids.quasi_natural',        kind: 'check' },
  { pdf: 'DC.c.7',  card: 'direct_cuebids.nat_minors_natural',   kind: 'check' },
  { pdf: 'DC.c.8',  card: 'direct_cuebids.nat_majors_natural',   kind: 'check' },
  { pdf: 'DC.c.9',  card: 'direct_cuebids.art_other',            kind: 'check' },
  { pdf: 'DC.c.10', card: 'direct_cuebids.quasi_other',          kind: 'check' },
  { pdf: 'DC.c.11', card: 'direct_cuebids.nat_minors_other',     kind: 'check' },
  { pdf: 'DC.c.12', card: 'direct_cuebids.nat_majors_other',     kind: 'check' },
  { pdf: 'DC.t.13', card: 'direct_cuebids.description',          kind: 'text' },

  // ─── Slams (SL) ───
  { pdf: 'SL.c.1',  card: 'other_conventions.gerber.directly_over_nt', kind: 'check' },
  { pdf: 'SL.c.2',  card: 'other_conventions.gerber.over_nt_seq',      kind: 'check' },
  { pdf: 'SL.c.3',  card: 'other_conventions.gerber.non_nt_seq',       kind: 'check' },
  { pdf: 'SL.c.5',  card: 'other_conventions.blackwood.standard',      kind: 'check' },
  { pdf: 'SL.c.6',  card: 'other_conventions.blackwood.rkcb_0314',     kind: 'check' },
  { pdf: 'SL.c.7',  card: 'other_conventions.blackwood.rkcb_1430',     kind: 'check' },
  { pdf: 'SL.t.8',  card: 'other_conventions.blackwood.notes',         kind: 'text' },
  { pdf: 'SL.t.9',  card: 'slam.control_bids',                          kind: 'text' },
  { pdf: 'SL.t.10', card: 'slam.vs_interference',                       kind: 'text' },
  { pdf: 'SL.t.11', card: 'slam.notes',                                 kind: 'text' },

  // ─── Carding (C) ───
  { pdf: 'C.c.1',  card: 'carding.suits.standard_attitude',       kind: 'check' },
  { pdf: 'C.c.2',  card: 'carding.nt.standard_attitude',          kind: 'check' },
  { pdf: 'C.c.3',  card: 'carding.suits.standard_count',          kind: 'check' },
  { pdf: 'C.c.4',  card: 'carding.nt.standard_count',             kind: 'check' },
  { pdf: 'C.c.5',  card: 'carding.suits.upside_down_attitude',    kind: 'check' },
  { pdf: 'C.c.6',  card: 'carding.nt.upside_down_attitude',       kind: 'check' },
  { pdf: 'C.c.7',  card: 'carding.suits.upside_down_count',       kind: 'check' },
  { pdf: 'C.c.8',  card: 'carding.nt.upside_down_count',          kind: 'check' },
  { pdf: 'C.t.9',  card: 'carding.exceptions',                    kind: 'text' },
  { pdf: 'C.t.10', card: 'carding.notes',                         kind: 'text' },
  { pdf: 'C.c.11', card: 'carding.smith_echo_suits',              kind: 'check' },
  { pdf: 'C.c.12', card: 'carding.smith_echo_nt',                 kind: 'check' },
  { pdf: 'C.c.13', card: 'carding.smith_echo_reverse',            kind: 'check' },
  { pdf: 'C.t.15', card: 'carding.trump_signals',                 kind: 'text' },

  // ─── Signals (SI) ───
  { pdf: 'SI.c.2',  card: 'carding.declarer_lead.attitude',        kind: 'check' },
  { pdf: 'SI.c.3',  card: 'carding.partner_lead.attitude',         kind: 'check' },
  { pdf: 'SI.c.4',  card: 'carding.declarer_lead.count',           kind: 'check' },
  { pdf: 'SI.c.5',  card: 'carding.partner_lead.count',            kind: 'check' },
  { pdf: 'SI.c.6',  card: 'carding.declarer_lead.suit_preference', kind: 'check' },
  { pdf: 'SI.c.7',  card: 'carding.partner_lead.suit_preference',  kind: 'check' },
  { pdf: 'SI.c.9',  card: 'carding.first_discard.standard',        kind: 'check' },
  { pdf: 'SI.c.10', card: 'carding.first_discard.upside_down',     kind: 'check' },
  { pdf: 'SI.c.11', card: 'carding.first_discard.lavinthal',       kind: 'check' },
  { pdf: 'SI.c.12', card: 'carding.first_discard.odd_even',        kind: 'check' },

  // ─── Leads vs Suits (LS) ───
  { pdf: 'LS.c.1', card: 'leads.vs_suits.length.fourth_best',   kind: 'check' },
  { pdf: 'LS.c.2', card: 'leads.vs_suits.length.third_fifth',   kind: 'check' },
  { pdf: 'LS.c.3', card: 'leads.vs_suits.length.third_low',     kind: 'check' },
  { pdf: 'LS.c.4', card: 'leads.vs_suits.length.attitude',      kind: 'check' },
  { pdf: 'LS.c.5', card: 'leads.vs_suits.length.small_from_xx', kind: 'check' },
  { pdf: 'LS.t.6', card: 'leads.vs_suits.after_first_trick',    kind: 'text' },
  { pdf: 'LS.t.9', card: 'leads.vs_suits.exceptions',           kind: 'text' },

  // ─── Leads vs NT (LN) ───
  { pdf: 'LN.c.1', card: 'leads.vs_nt.length.fourth_best',       kind: 'check' },
  { pdf: 'LN.c.2', card: 'leads.vs_nt.length.third_fifth',       kind: 'check' },
  { pdf: 'LN.c.3', card: 'leads.vs_nt.length.third_low',         kind: 'check' },
  { pdf: 'LN.c.4', card: 'leads.vs_nt.length.attitude',          kind: 'check' },
  { pdf: 'LN.c.5', card: 'leads.vs_nt.length.second_from_4plus', kind: 'check' },
  { pdf: 'LN.t.6', card: 'leads.vs_nt.after_first_trick',        kind: 'text' },
  { pdf: 'LN.t.9', card: 'leads.vs_nt.exceptions',               kind: 'text' }
]

/**
 * Weak-two opening field mapping generator — the 2♦/2♥/2♠ boxes on
 * the ACBL New form share a single field schema, so we generate
 * mappings via a helper rather than duplicating 11+ lines per suit.
 *
 * `maxPrefix` defaults to `prefix` but can be overridden for the 2♠
 * box, whose `.t.2` field name is `21.t.2` rather than `2S.t.2`
 * (apparent template author typo).
 */
function weakTwoMapping(prefix, suitName, maxPrefix = prefix) {
  const base = `two_level.two_${suitName}`
  return [
    { pdf: `${prefix}.t.1`,    card: `${base}.min_hcp`,       kind: 'text' },
    { pdf: `${maxPrefix}.t.2`, card: `${base}.max_hcp`,       kind: 'text' },
    { pdf: `${prefix}.t.3`,    card: `${base}.description`,   kind: 'text' },
    { pdf: `${prefix}.c.4`,    card: `${base}.meaning`, kind: 'check', value: 'weak' },
    { pdf: `${prefix}.c.5`,    card: `${base}.meaning`, kind: 'check', value: 'intermediate' },
    { pdf: `${prefix}.c.6`,    card: `${base}.meaning`, kind: 'check', value: 'strong' },
    { pdf: `${prefix}.c.7`,    card: `${base}.meaning`, kind: 'check', value: 'conventional' },
    { pdf: `${prefix}.c.8`,    card: `${base}.two_suited`,    kind: 'check' },
    { pdf: `${prefix}.t.9`,    card: `${base}.rebids_2nt`,    kind: 'text' },
    { pdf: `${prefix}.t.10`,   card: `${base}.notes`,         kind: 'text' }
  ]
}

// ─── Public API ─────────────────────────────────────────────────

/**
 * Load a template, walk its FIELD_MAP, fill every matching form field,
 * and return the pdf-lib PDFDocument ready to serialize.
 *
 * `templateName` selects between 'classic' (the 2023 SS1 Rev 4-12 form)
 * and 'new' (the redesigned ACBL form with cleaner field naming).
 */
export async function buildAcblPdf(card, templateName = 'classic') {
  const bytes = await loadTemplateBytes(templateName)
  const pdf = await PDFDocument.load(bytes)
  const form = pdf.getForm()
  const fieldMap = templateName === 'new' ? FIELD_MAP_NEW : FIELD_MAP_CLASSIC

  const missingFields = []
  const droppedPaths = []
  for (const entry of fieldMap) {
    const cardValue = readPath(card?.card_data, entry.card)
    try {
      applyEntry(form, entry, cardValue)
    } catch (e) {
      // Field doesn't exist in the template (likely a name typo or
      // pdf-lib parsing quirk). Collect for one summary log instead of
      // spamming the console per entry.
      missingFields.push(entry.pdf)
      // If the entry actually carried data, the value just fell on the
      // floor — record its card path so we can print it on the card as
      // a visible "this didn't export" diagnostic.
      if (entryHasMeaningfulValue(entry, cardValue)) droppedPaths.push(entry.card)
    }
  }
  if (missingFields.length) {
    console.warn(`ACBL fill (${templateName}): ${missingFields.length} field(s) not found in template`, missingFields)
  }
  if (droppedPaths.length) {
    console.warn(`ACBL fill (${templateName}): ${droppedPaths.length} value(s) had no destination field`, droppedPaths)
    await drawDiagnosticFooter(pdf, templateName, droppedPaths)
  }
  embedCardDataInPdf(pdf, card)
  return pdf
}

/**
 * Does this field-map entry carry a value worth reporting if it can't
 * be written? Text entries count when non-blank; checkbox entries count
 * only when they'd actually be checked (an unchecked box hitting a
 * nonexistent field is a no-op, not a data loss).
 */
function entryHasMeaningfulValue(entry, cardValue) {
  if (entry.kind === 'text') return cardValue != null && String(cardValue).trim() !== ''
  if (entry.kind === 'check') return isCheckOn(entry, cardValue)
  return false
}

// The two blank write-in lines at the bottom of the Classic card's
// OTHER CONV. CALLS box (PDF points, bottom-left origin). Measured from
// the template's field geometry — the box's last mapped field
// (undefined_19) sits at y≈32, and these two ruled lines follow below it.
const CLASSIC_DIAG_LINES = [
  { x: 346, y: 23, maxWidth: 218 },
  { x: 346, y: 10, maxWidth: 218 }
]

// The New card's two bottom "Other" write-in lines (O.t.8 / O.t.9 — the
// OTHER CONVENTIONS section). These hold the imported notes_line_1/2 if
// present; in practice they're usually empty, and the diagnostic only
// fires when a value was dropped, so an overlap is rare and acceptable.
const NEW_DIAG_LINES = [
  { x: 305, y: 18, maxWidth: 262 },
  { x: 305, y: 6,  maxWidth: 262 }
]

/**
 * Draw a visible "these values didn't make it onto the card" note on the
 * exported PDF, so the user can spot mapping gaps without opening the
 * console. On both templates it lands on the two bottom "Other
 * conventions" write-in lines (Classic: OTHER CONV. CALLS box; New:
 * the OTHER section's O.t.8/O.t.9 lines).
 *
 * Paths shown are card_data paths (e.g. `notrump.one_nt.range_max`)
 * rather than raw PDF field names, since the card path names the
 * convention that was lost — far more actionable than `to_1_2`.
 */
async function drawDiagnosticFooter(pdf, templateName, droppedPaths) {
  try {
    const page = pdf.getPages()[0]
    const font = await pdf.embedFont(StandardFonts.Helvetica)
    const color = rgb(0.0, 0.25, 0.75) // blue — clearly an app annotation, not card ink
    const size = 6
    // "!" not "⚠" — the Helvetica standard font can't encode the glyph.
    const text = sanitizeForWinAnsi(`! ${droppedPaths.length} not exported: ${droppedPaths.join(', ')}`)
    const lines = templateName === 'classic' ? CLASSIC_DIAG_LINES : NEW_DIAG_LINES
    drawWrappedAcrossLines(page, font, size, color, text, lines)
  } catch (err) {
    console.warn('Failed to draw diagnostic footer:', err)
  }
}

/** Trim a string with a trailing ellipsis until it fits `maxWidth`. */
function truncateToWidth(font, size, text, maxWidth) {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text
  let t = text
  while (t.length > 1 && font.widthOfTextAtSize(t + '…', size) > maxWidth) t = t.slice(0, -1)
  return t + '…'
}

/**
 * Greedy word-wrap `text` across a fixed set of `lines` (each with its
 * own x/y/maxWidth). Anything that doesn't fit in the last line is
 * truncated with an ellipsis so the note never overruns the box.
 */
function drawWrappedAcrossLines(page, font, size, color, text, lines) {
  const words = text.split(' ')
  let idx = 0
  for (let li = 0; li < lines.length; li++) {
    const { x, y, maxWidth } = lines[li]
    const isLast = li === lines.length - 1
    let line = ''
    while (idx < words.length) {
      const trial = line ? `${line} ${words[idx]}` : words[idx]
      if (font.widthOfTextAtSize(trial, size) > maxWidth) break
      line = trial
      idx++
    }
    // A single word too wide for an empty line — hard-place it truncated.
    if (!line && idx < words.length) {
      line = truncateToWidth(font, size, words[idx], maxWidth)
      idx++
    }
    // Out of lines with text remaining — mark the overflow.
    if (isLast && idx < words.length) {
      line = truncateToWidth(font, size, `${line} …`, maxWidth)
      idx = words.length
    }
    if (line) page.drawText(line, { x, y, size, font, color })
    if (idx >= words.length) break
  }
}

/** Backwards-compatible alias — defaults to the Classic template. */
export const buildAcblClassicPdf = (card) => buildAcblPdf(card, 'classic')

/**
 * Embed the source card_data JSON as a custom entry in the PDF's
 * Info dictionary, so that a previously-exported PDF can be re-imported
 * into the editor with full fidelity (every field, every note, every
 * `_bridgeodex_raw` blob).
 *
 * The Info dict is part of every PDF; standard readers display known
 * keys (Title, Author, …) in their properties panel and ignore unknown
 * ones. Our namespaced `BridgeClassroomCard` key is invisible to other
 * tools but trivially readable via pdf-lib.
 */
function embedCardDataInPdf(pdf, card) {
  if (!card?.card_data) return
  try {
    const payload = {
      schema: 'bridge-classroom/card_data@v1',
      name: card.name || null,
      description: card.description || null,
      exportedAt: new Date().toISOString(),
      card_data: card.card_data
    }
    const json = JSON.stringify(payload)
    const info = pdf.getInfoDict()
    info.set(PDFName.of(EMBED_INFO_KEY), PDFHexString.fromText(json))
  } catch (err) {
    console.warn('Failed to embed card_data in PDF metadata:', err)
  }
}

/**
 * Read a previously-exported ACBL PDF's embedded card_data back out.
 * Returns the original payload `{ name, description, card_data }` or
 * null if the PDF wasn't generated by us (no embedded data).
 */
export async function extractCardDataFromPdf(bytes) {
  let pdf
  try {
    pdf = await PDFDocument.load(bytes, { ignoreEncryption: true })
  } catch (err) {
    throw new Error(`Could not parse PDF (${err?.message || err})`)
  }
  let info
  try {
    info = pdf.getInfoDict()
  } catch { return null }
  const raw = info?.get(PDFName.of(EMBED_INFO_KEY))
  if (!raw) return null
  let json
  try {
    json = typeof raw.decodeText === 'function' ? raw.decodeText()
         : typeof raw.asString === 'function' ? raw.asString()
         : String(raw)
  } catch (err) {
    throw new Error(`Embedded card_data is not readable text (${err?.message || err})`)
  }
  let payload
  try {
    payload = JSON.parse(json)
  } catch (err) {
    throw new Error(`Embedded card_data is not valid JSON (${err?.message || err})`)
  }
  return {
    name: payload.name || 'Imported convention card',
    description: payload.description || 'Imported from PDF',
    card_data: payload.card_data || payload // backward-compat if older PDFs stored the bare card_data
  }
}

function applyEntry(form, entry, cardValue) {
  if (entry.kind === 'check') {
    const box = form.getCheckBox(entry.pdf)
    const on = isCheckOn(entry, cardValue)
    if (on) box.check()
    else box.uncheck()
    return
  }
  if (entry.kind === 'text') {
    if (cardValue == null) return
    const tf = form.getTextField(entry.pdf)
    tf.setText(sanitizeForWinAnsi(String(cardValue)))
    return
  }
}

/**
 * Strip characters that aren't in WinAnsi encoding from a string so
 * pdf-lib can render it in the standard Helvetica font used by ACBL
 * form fields. Notably, the Unicode suit glyphs ♣♦♥♠ aren't in
 * WinAnsi — we substitute the conventional single-letter shorthand
 * (C/D/H/S) used throughout bridge.
 *
 * TODO: embed a Unicode-capable TTF and assign it via
 * `form.updateFieldAppearances(font)` so the actual suit glyphs
 * render in the PDF.
 */
function sanitizeForWinAnsi(str) {
  if (typeof str !== 'string') return str
  return str
    .replace(/♣/g, 'C')
    .replace(/♦/g, 'D')
    .replace(/♥/g, 'H')
    .replace(/♠/g, 'S')
    // Drop any remaining non-Latin-1 codepoints — they'd also fail
    // WinAnsi encoding. Most card values should be plain ASCII by now.
    .replace(/[^\x00-\xff]/g, '')
}

function isCheckOn(entry, value) {
  // Plain boolean checkbox
  if (entry.value === undefined) return !!value
  if (value == null) return false
  // Enum match — checkbox is on when cardValue equals (or is in) entry.value.
  // Compare as strings: map values are strings ('3'/'4'/'5', 'strong', …)
  // but importers store some as numbers (min_length = 3), so a strict ===
  // would miss them.
  const v = String(value)
  if (Array.isArray(entry.value)) return entry.value.some(e => String(e) === v)
  return v === String(entry.value)
}

/**
 * Build the PDF and trigger a browser download. Filename derives from
 * partner names + card name + today's date.
 *
 * The form is left INTERACTIVE (fillable) so the user can fine-tune the
 * exported card in any PDF editor. We strip the Classic template's
 * text-field hairline borders without flattening — see finalizeForm.
 * Pass `{ flatten: true }` to bake everything into static page art
 * instead (no longer editable).
 */
export async function downloadAcblPdf(card, templateName = 'classic', { flatten = false } = {}) {
  const pdf = await buildAcblPdf(card, templateName)
  finalizeForm(pdf, templateName, { flatten })
  // Draw red ellipses around the user's chosen lead cards for the New
  // template. The Classic template represents leads via form-field
  // checkboxes (4th/3rd5/3rdLow) rather than circle-the-card markings,
  // so we skip this step there.
  if (templateName === 'new') {
    drawLeadCircles(pdf, card)
  }
  const bytes = await pdf.save()
  triggerDownload(bytes, pdfFilename(card, templateName))
}

/** Backwards-compatible alias — defaults to the Classic template. */
export const downloadAcblClassicPdf = (card) => downloadAcblPdf(card, 'classic')

// ─── Lead-card circling (New template only) ──────────────────────
// Coordinates were extracted from the New template's content stream
// via pdfplumber. Each entry maps pattern key → array of (x, y) pairs
// for character positions 1..N, expressed in pdf-lib's bottom-up
// coordinate system. The user's card_data stores 1-based positions at
// `leads.{vs_suits|vs_nt}.{length|honors}.lead_choice_<pattern>`.
//
// x values are the character CENTER (= pdfplumber's left edge + ~half
// the character width). Initial extraction used the left edge directly,
// which shifted every ellipse ~3pt to the left of its target character.

// Half-character offset added to every left-edge coordinate from pdfplumber.
// Empirically tuned across several test renders:
//   +3.0 → far past the character center (much too right)
//   +2.0 → a little right of center
//   +1.5 → a little left of center
//   +1.75 → centered for the New template's ~5pt character spacing
const CHAR_HALF_W = 1.75

// Per-character height correction. Each y value in LEAD_COORDS_NEW
// assumed an 8pt character height; the actual New-template fonts run
// slightly smaller. Empirically:
//   0   → ovals "a little low"
//   2   → ovals "too high"
//   1   → centered
const Y_OFFSET = 1.0

const LEAD_COORDS_NEW = {
  vs_suits: {
    length: {
      xx:    [ { x: 22.9, y: 92 }, { x: 28.8, y: 92 } ],
      xxx:   [ { x: 42.7, y: 92 }, { x: 48.5, y: 92 }, { x: 54.3, y: 92 } ],
      xxxx:  [ { x: 69.4, y: 92 }, { x: 75.2, y: 92 }, { x: 81.0, y: 92 }, { x: 86.9, y: 92 } ],
      xxxxx: [ { x: 101.9, y: 92 }, { x: 107.7, y: 92 }, { x: 113.5, y: 92 }, { x: 119.4, y: 92 }, { x: 125.2, y: 92 } ],
      hxx:   [ { x: 22.1, y: 82 }, { x: 29.7, y: 82 }, { x: 35.5, y: 82 } ],
      hxxx:  [ { x: 52.1, y: 82 }, { x: 59.7, y: 82 }, { x: 65.5, y: 82 }, { x: 71.4, y: 82 } ],
      hxxxx: [ { x: 86.6, y: 82 }, { x: 94.2, y: 82 }, { x: 100.0, y: 82 }, { x: 105.9, y: 82 }, { x: 111.7, y: 82 } ]
    },
    honors: {
      akx:   [ { x: 21.8, y: 49 }, { x: 27.8, y: 49 }, { x: 33.8, y: 49 } ],
      kqx:   [ { x: 21.8, y: 38 }, { x: 28.9, y: 38 }, { x: 36.3, y: 38 } ],
      qjx:   [ { x: 53.8, y: 38 }, { x: 61.2, y: 38 }, { x: 67.6, y: 38 } ],
      jtx:   [ { x: 83.8, y: 38 }, { x: 90.1, y: 38 }, { x: 96.7, y: 38 } ],
      t9x:   [ { x: 112.8, y: 38 }, { x: 119.6, y: 38 }, { x: 125.9, y: 38 } ],
      kjtx:  [ { x: 21.5, y: 17 }, { x: 28.1, y: 17 }, { x: 35.0, y: 17 }, { x: 41.5, y: 17 } ],
      kt9x:  [ { x: 53.8, y: 17 }, { x: 60.1, y: 17 }, { x: 66.5, y: 17 }, { x: 72.8, y: 17 } ],
      qt9x:  [ { x: 83.7, y: 17 }, { x: 90.4, y: 17 }, { x: 96.9, y: 17 }, { x: 103.3, y: 17 } ]
    }
  },
  vs_nt: {
    length: {
      xx:    [ { x: 166.3, y: 92 }, { x: 172.1, y: 92 } ],
      xxx:   [ { x: 188.3, y: 92 }, { x: 194.2, y: 92 }, { x: 200.0, y: 92 } ],
      xxxx:  [ { x: 215.0, y: 92 }, { x: 220.9, y: 92 }, { x: 226.7, y: 92 }, { x: 232.5, y: 92 } ],
      xxxxx: [ { x: 247.5, y: 92 }, { x: 253.3, y: 92 }, { x: 259.2, y: 92 }, { x: 265.0, y: 92 }, { x: 270.8, y: 92 } ],
      hxx:   [ { x: 165.5, y: 82 }, { x: 173.1, y: 82 }, { x: 179.0, y: 82 } ],
      hxxx:  [ { x: 195.5, y: 82 }, { x: 203.1, y: 82 }, { x: 209.0, y: 82 }, { x: 214.8, y: 82 } ],
      hxxxx: [ { x: 230.1, y: 82 }, { x: 237.7, y: 82 }, { x: 243.5, y: 82 }, { x: 249.3, y: 82 }, { x: 255.2, y: 82 } ]
    },
    honors: {
      akxx:  [ { x: 164.7, y: 49 }, { x: 170.7, y: 49 }, { x: 176.8, y: 49 }, { x: 181.6, y: 49 } ],
      kqjx:  [ { x: 164.7, y: 38 }, { x: 171.7, y: 38 }, { x: 179.0, y: 38 }, { x: 185.4, y: 38 } ],
      kqt9:  [ { x: 194.2, y: 38 }, { x: 200.6, y: 38 }, { x: 207.2, y: 38 }, { x: 213.8, y: 38 } ],
      qjtx:  [ { x: 225.7, y: 38 }, { x: 233.1, y: 38 }, { x: 239.3, y: 38 }, { x: 245.9, y: 38 } ],
      jt9x:  [ { x: 256.7, y: 38 }, { x: 263.6, y: 38 }, { x: 270.1, y: 38 }, { x: 276.5, y: 38 } ],
      aqjx:  [ { x: 163.9, y: 17 }, { x: 170.9, y: 17 }, { x: 178.0, y: 17 }, { x: 184.3, y: 17 } ],
      ajtx:  [ { x: 194.2, y: 17 }, { x: 200.9, y: 17 }, { x: 207.3, y: 17 }, { x: 213.8, y: 17 } ],
      kt9x:  [ { x: 225.8, y: 17 }, { x: 232.0, y: 17 }, { x: 238.6, y: 17 }, { x: 245.0, y: 17 } ],
      qt9x:  [ { x: 255.7, y: 17 }, { x: 263.3, y: 17 }, { x: 270.1, y: 17 }, { x: 276.5, y: 17 } ]
    }
  }
}

/**
 * Walk the card's lead_choice_* paths and draw red ellipses around
 * each user-chosen lead position. Only invoked for the New template.
 *
 * Card data shape: `leads.vs_suits.length.lead_choice_xxxx = 3` means
 * the user leads the 3rd card in an "xxxx" length-lead pattern; we
 * draw an oval around that character on the page.
 */
function drawLeadCircles(pdf, card) {
  const page = pdf.getPages()[0]
  const cardData = card?.card_data
  if (!cardData) return

  const red = rgb(0.78, 0.10, 0.12)
  const drawn = []
  const missing = []
  const seen = []
  for (const side of ['vs_suits', 'vs_nt']) {
    for (const type of ['length', 'honors']) {
      const patterns = LEAD_COORDS_NEW[side]?.[type]
      if (!patterns) continue
      for (const [pattern, positions] of Object.entries(patterns)) {
        const choice = readPath(cardData, `leads.${side}.${type}.lead_choice_${pattern}`)
        seen.push({ side, type, pattern, choice })
        const n = Number(choice)
        if (!Number.isFinite(n) || n < 1 || n > positions.length) {
          if (choice !== undefined && choice !== null) {
            missing.push({ side, type, pattern, choice })
          }
          continue
        }
        const coord = positions[n - 1]
        page.drawEllipse({
          x: coord.x + CHAR_HALF_W, // pdfplumber gave LEFT edge; shift to char center
          y: coord.y + Y_OFFSET,    // correct for slightly-overshot character-height estimate
          xScale: 3.0,
          yScale: 4.8,              // tall-aspect ellipse approximates a vertical racetrack
          borderColor: red,
          borderWidth: 0.6
        })
        drawn.push({ side, type, pattern, n })
      }
    }
  }
  // Diagnostic: show what lead choices were found in card_data and which
  // ones we successfully drew. If the user expects circles that don't
  // appear, the seen[] list reveals whether the path is missing data or
  // whether our coords are off.
  console.log(`drawLeadCircles: drew ${drawn.length}, parsed ${seen.filter(s => s.choice != null).length}/${seen.length} lead_choice paths`)
  console.log('  drawn:', drawn)
  const populated = seen.filter(s => s.choice != null)
  if (populated.length) console.log('  populated in card_data:', populated)
  if (missing.length) console.log('  populated but value out of range:', missing)

  // Also dump the raw bridgeodex leads payload so we can see what keys
  // the source data actually uses for Hxx-style length leads and honor
  // leads. If they're present in `_bridgeodex_raw` but not making it
  // into our `leads.*.length.lead_choice_*` or `leads.*.honors.lead_choice_*`
  // paths, the bridgeodex importer needs a fix.
  const raw = cardData._bridgeodex_raw
  if (raw) {
    const vsSuitsKeys = raw.leads_vs_suits ? Object.entries(raw.leads_vs_suits)
      .filter(([k, v]) => v != null && v !== '' && (k.startsWith('length') || k.startsWith('honor')))
      .map(([k, v]) => `${k}=${JSON.stringify(v)}`) : []
    const vsNtKeys = raw.leads_vs_nt ? Object.entries(raw.leads_vs_nt)
      .filter(([k, v]) => v != null && v !== '' && (k.startsWith('length') || k.startsWith('honor')))
      .map(([k, v]) => `${k}=${JSON.stringify(v)}`) : []
    console.log('  raw bridgeodex leads_vs_suits:', vsSuitsKeys)
    console.log('  raw bridgeodex leads_vs_nt:', vsNtKeys)
  } else {
    console.log('  (no _bridgeodex_raw on this card)')
  }
}

/**
 * Convert all form fields to flat page content. After flatten() the
 * PDF is no longer editable but it also no longer carries the grey
 * field-highlight overlay that viewers draw over interactive fields,
 * so the printed/saved card looks clean.
 *
 * We also zero out each field's border before flatten() — the ACBL
 * template draws a hairline border around every checkbox and text
 * field as part of the field appearance, which becomes static line
 * art when we flatten. Stripping it first keeps the output looking
 * like the printed card.
 */
/**
 * Final pass over the filled form before save.
 *
 * Default (`flatten: false`) keeps the form INTERACTIVE so the exported
 * card stays editable: we strip the Classic template's text-field
 * hairline borders, regenerate appearance streams, and set
 * NeedAppearances=false so viewers trust those streams instead of
 * re-rendering (which would re-introduce the borders). Checkbox
 * appearances are left untouched — see the warning below.
 *
 * `flatten: true` additionally bakes every field into static page
 * content (no longer editable) — kept as an option for callers that
 * want a locked, non-editable card.
 */
function finalizeForm(pdf, templateName = 'classic', { flatten = false } = {}) {
  try {
    const form = pdf.getForm()
    const apName = PDFName.of('AP')

    // The Classic template ships text fields with cached appearance
    // streams that include a hairline border. When flattened those
    // hairlines become visible static line art. We work around it by
    // zeroing the border width, painting the border color white, and
    // dropping the cached AP so updateFieldAppearances regenerates from
    // the borderless properties.
    //
    // CRITICAL: this treatment must be applied to TEXT FIELDS ONLY.
    // Deleting a checkbox widget's cached /AP throws away the template's
    // "on"-state appearance glyph; updateFieldAppearances() can't
    // faithfully reconstruct it, so every checked box flattens to a
    // blank square (the user sees "all my conventions are missing").
    // Checkboxes have no visible border to clean up anyway — the printed
    // □ is part of the static page art, not a field border — so we leave
    // their appearance streams untouched.
    //
    // The New template's fields don't have visible borders to begin with —
    // and crucially, the field rectangles are sized tightly around the
    // text area without room for descenders. Applying the same
    // white-stroke (border) treatment there draws a 1-device-pixel white
    // line at each field's bottom edge, which clips the descenders of any
    // text that runs through that y-coordinate (commonly the row of text
    // immediately below). So we skip the BORDER treatment for the New
    // form — but we still give its text fields a white background below
    // (a fill bounded to the rect, no edge stroke) so viewers don't tint
    // them with the form-field highlight wash.
    if (templateName === 'new') {
      for (const field of form.getFields()) {
        if (!(field instanceof PDFTextField)) continue
        try {
          if (typeof field.setBorderWidth === 'function') field.setBorderWidth(0)
        } catch { /* not every field type has setBorderWidth — ignore */ }
        try {
          for (const widget of field.acroField.getWidgets()) {
            const ac = widget.getOrCreateAppearanceCharacteristics()
            ac.setBorderColor([1, 1, 1])
            ac.setBackgroundColor([1, 1, 1])
            // Drop the cached AP so it regenerates borderless with the
            // white background (matching the classic text-field path);
            // without this the regenerated appearance draws the field's
            // native border as a black box around the value.
            widget.dict.delete(apName)
          }
        } catch { /* widget without a writable MK dict — ignore */ }
      }
    }
    if (templateName === 'classic') {
      for (const field of form.getFields()) {
        const isText = field instanceof PDFTextField
        // Zero the border on EVERY field: this kills both the template's
        // hairline box around text fields and the faint outline viewers
        // draw around live checkbox widgets (which double-boxes the
        // printed □). Setting width 0 is safe for checkboxes.
        try {
          if (typeof field.setBorderWidth === 'function') field.setBorderWidth(0)
        } catch { /* not every field type has setBorderWidth — ignore */ }
        try {
          for (const widget of field.acroField.getWidgets()) {
            const ac = widget.getOrCreateAppearanceCharacteristics()
            ac.setBorderColor([1, 1, 1]) // RGB white as components array
            // Bake a white background into TEXT fields only. Interactive
            // viewers tint un-backgrounded form fields with their
            // form-field highlight colour (the light-blue wash the user
            // sees); an explicit white /BG makes the big text fields
            // render white while staying editable. We do NOT do this for
            // checkboxes: their widget rects are wider than the printed □
            // and overlap the neighbouring label, so a white fill erases
            // the label's adjacent characters (e.g. "Transfer Resp" →
            // "ransfer Resp"). Their highlight wash is tiny anyway.
            //
            // Text fields also get their cached /AP dropped so it
            // regenerates borderless and with the white background.
            // (Dropping a CHECKBOX's /AP would throw away the template's
            // "on"-state glyph and the checkmark would vanish — the
            // original "all my conventions are missing" bug.)
            if (isText) {
              ac.setBackgroundColor([1, 1, 1])
              widget.dict.delete(apName)
            }
          }
        } catch { /* ignore — some widgets may not have a writable MK dict */ }
      }
    }
    form.updateFieldAppearances()
    if (flatten) {
      form.flatten()
      return
    }
    // Fillable path: keep the fields live but tell viewers to render the
    // appearance streams we just generated rather than regenerating
    // their own. Without this, Acrobat re-adds the hairline borders we
    // just stripped (and can re-render checkboxes from scratch).
    try {
      form.acroForm.dict.set(PDFName.of('NeedAppearances'), PDFBool.False)
    } catch { /* template without a writable AcroForm dict — ignore */ }
  } catch (err) {
    console.warn('Form finalize failed (saving as-is):', err)
  }
}

function triggerDownload(bytes, filename) {
  const blob = new Blob([bytes], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function pdfFilename(card, templateName = 'classic') {
  const partner = (card?.card_data?.metadata?.partner_names || '').trim()
  const name = (card?.name || 'convention-card').trim()
  const base = (partner || name).replace(/[^\w\s.-]+/g, '').replace(/\s+/g, '-')
  const date = new Date().toISOString().slice(0, 10)
  const suffix = templateName === 'new' ? '-acbl-new' : ''
  return `${base || 'convention-card'}${suffix}-${date}.pdf`
}

/**
 * Debug helper — fills every form field in the template with its own
 * field name, so the resulting PDF lets you visually identify which
 * physical box corresponds to which field name. Use this to expand
 * the FIELD_MAP for the auto-named fields (`Weak_3`, `to_12`,
 * `undefined_8`, etc.) whose location isn't obvious from their name.
 *
 * Implementation note: type-checks use `instanceof` against the
 * imported pdf-lib classes — `field.constructor.name` doesn't survive
 * Vite's production minification (the class name becomes a single
 * letter), so an earlier version of this function silently filled no
 * fields after build.
 */
export async function downloadAcblFieldDebugPdf(templateName = 'classic') {
  const bytes = await loadTemplateBytes(templateName)
  const pdf = await PDFDocument.load(bytes)
  const form = pdf.getForm()
  const fields = form.getFields()
  const pages = pdf.getPages()
  const font = await pdf.embedFont(StandardFonts.Helvetica)

  // ── Pass 1: fill text fields, check checkboxes, and cache each
  // checkbox widget's position so we can label it later.
  const checkboxLabels = []
  let textCount = 0, checkCount = 0, otherCount = 0
  for (const field of fields) {
    const name = field.getName()
    try {
      if (field instanceof PDFTextField) {
        field.setText(name)
        textCount++
      } else if (field instanceof PDFCheckBox) {
        field.check()
        for (const widget of field.acroField.getWidgets()) {
          const page = findPageForWidget(widget, pages) || pages[0]
          checkboxLabels.push({ page, name, rect: widget.getRectangle() })
        }
        checkCount++
      } else {
        otherCount++
      }
    } catch { /* skip */ }
  }

  // ── Pass 2: flatten the form. This appends each field's appearance
  // (checkmark glyphs, text values) to the page content stream.
  flattenForm(pdf, templateName)

  // ── Pass 3: draw checkbox labels AFTER flatten so they sit on top
  // of the flattened field appearances rather than getting covered.
  for (const { page, name, rect } of checkboxLabels) {
    const size = 4.5
    const textWidth = name.length * size * 0.55
    const labelX = rect.x + rect.width + 0.6
    const labelY = rect.y + rect.height * 0.15
    page.drawRectangle({
      x: labelX - 0.4,
      y: labelY - 0.8,
      width: textWidth + 0.8,
      height: size + 1,
      color: rgb(1, 1, 0.55) // pale yellow highlight for legibility
    })
    page.drawText(name, {
      x: labelX,
      y: labelY,
      size,
      font,
      color: rgb(0.85, 0, 0)
    })
  }

  console.log(`Debug fill: ${textCount} text fields, ${checkCount} checkboxes labeled, ${otherCount} other`)
  const out = await pdf.save()
  triggerDownload(out, `acbl-${templateName}-field-debug.pdf`)
}

/**
 * Draw a checkbox's field name next to its widget rectangle on the
 * appropriate page. Used by the debug-fill flow so the user can read
 * each checkbox's pdf field name.
 *
 * Each label sits inside a pale-yellow highlight rectangle so it
 * stays readable when it overlaps with adjacent printed card text
 * (which is the common case — checkboxes are followed by static text
 * labels that occupy the same horizontal space).
 */
function labelCheckbox(field, pages, font) {
  const widgets = field.acroField.getWidgets()
  const name = field.getName()
  for (const widget of widgets) {
    const page = findPageForWidget(widget, pages)
    if (!page) continue
    const rect = widget.getRectangle()
    const size = 4.5
    // Approximate text width — Helvetica avg char ~0.55em
    const textWidth = name.length * size * 0.55
    const labelX = rect.x + rect.width + 0.6
    const labelY = rect.y + rect.height * 0.15
    page.drawRectangle({
      x: labelX - 0.4,
      y: labelY - 0.8,
      width: textWidth + 0.8,
      height: size + 1,
      color: rgb(1, 1, 0.55) // pale yellow highlight
    })
    page.drawText(name, {
      x: labelX,
      y: labelY,
      size,
      font,
      color: rgb(0.85, 0, 0)
    })
  }
}

function findPageForWidget(widget, pages) {
  const wRef = widget.ref
  for (const page of pages) {
    const annots = page.node.Annots()
    if (!annots) continue
    for (let i = 0; i < annots.size(); i++) {
      if (annots.get(i) === wRef) return page
    }
  }
  return null
}
