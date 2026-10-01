/**
 * Convention Catalog
 *
 * The presentation catalog the Convention Card editor renders against.
 * Each entry maps a dotted card path (the boolean flag in card_data
 * that says whether the player uses this convention) to display
 * metadata: human name, one-line description, the section it belongs
 * to, and the underlying skill it teaches.
 *
 * Phase 1 reads this catalog and renders read-only rows. Phase 2 will
 * make the catalog the source of truth for which conventions exist;
 * `card_data` shrinks to `{ cardPath: boolean | scalar }`.
 *
 * Levels are inherited from the skill in BAKER_BRIDGE_TAXONOMY but may
 * be overridden per-row via a `level` field (rare — used when one
 * skill teaches conventions of differing complexity, e.g. Stayman vs.
 * Puppet Stayman).
 */

import { getLevelForSkill } from './bakerBridgeTaxonomy.js'

/**
 * Top-level sections in display order. `icon` is a key into ICON_SVG
 * below — a small inline SVG (the prototype uses Tabler `ti-*` classes
 * but we'd rather not pull a dep for ~8 icons).
 *
 * `notes` declares the section's notes blocks. `[]` means no notes.
 * The General section has three separate blocks (general / partnership
 * understandings / special agreements). Other sections have one block
 * each, stored at `card_data.notes.<key>`.
 */
export const SECTION_META = [
  { id: 'general',           label: 'General approach',   icon: 'compass',
    notes: [
      { key: 'general',                    label: 'General notes',             hint: 'Anything about overall style, tendencies, partnership history…' },
      { key: 'partnership_understandings', label: 'Partnership understandings', hint: "Specific agreements that don't fit elsewhere…" },
      { key: 'special_agreements',         label: 'Special agreements',        hint: 'Unusual treatments, opponent-specific tactics…' }
    ]
  },
  { id: 'notrump',           label: 'NT openings',         icon: 'cards',           notes: [{ key: 'notrump_notes',     hint: 'Specific agreements for NT auctions…' }] },
  { id: 'major_openings',    label: 'Major openings',      icon: 'arrow-up-right',  notes: [{ key: 'major_notes',       hint: 'Specific agreements for major openings…' }] },
  { id: 'minor_openings',    label: 'Minor openings',      icon: 'arrow-down-right', notes: [{ key: 'minor_notes',       hint: 'Specific agreements for minor openings…' }] },
  { id: 'two_level',         label: 'Two-level openings',  icon: 'arrows-up',       notes: [{ key: 'two_level_notes',   hint: 'Specific agreements for 2-level openings…' }] },
  { id: 'slam',              label: 'Slam bidding',        icon: 'crown',           notes: [{ key: 'slam_notes',        hint: 'Specific slam agreements…' }] },
  { id: 'preempts',          label: 'Preempts',            icon: 'rocket',          notes: [{ key: 'preempts_notes',    hint: '3-level / 4-level style; vs preempts; etc.' }] },
  { id: 'overcalls',         label: 'Overcalls',           icon: 'arrows-up',       notes: [{ key: 'overcalls_notes',   hint: 'Suit-overcall agreements and response treatments…' }] },
  { id: 'nt_overcalls',      label: 'NT overcalls',        icon: 'cards',           notes: [{ key: 'nt_overcalls_notes', hint: '1NT direct / balance ranges, runouts…' }] },
  { id: 'doubles',           label: 'Doubles',             icon: 'doubles',         notes: [{ key: 'doubles_notes',     hint: 'Negative / responsive / support / lead-directing…' }] },
  { id: 'competitive',       label: 'Competitive',         icon: 'swords',          notes: [{ key: 'competitive_notes', hint: 'Defenses to opponents’ NT, preempts, takeout doubles…' }] },
  { id: 'carding',           label: 'Carding & signals',   icon: 'signal',          notes: [{ key: 'carding_notes',     hint: 'Trump signals, exceptions, first-discard…' }] },
  { id: 'leads',             label: 'Opening leads',       icon: 'lead',            notes: [{ key: 'leads_notes',       hint: 'After 1st trick, exceptions, honor-lead variants…' }] },
  { id: 'other_conventions', label: 'Other conventions',   icon: 'puzzle',          notes: [{ key: 'other_notes',       hint: 'Anything that doesn’t fit elsewhere…' }] }
]

/**
 * Structured (non-checkbox) fields per section. Each has a label, the
 * card-data path to the value, and a small render hint (`text` for
 * free-text, `select` with options, or `number`). Phase 1 displays
 * these read-only.
 */
export const STRUCTURED_FIELDS = {
  general: [
    { label: 'System',                    cardPath: 'general.system',              kind: 'text',
      placeholder: 'e.g. 2/1 Game forcing' },
    { label: 'Min HCP to open',           cardPath: 'general.min_hcp_open',        kind: 'number' },
    { label: 'Min HCP to respond',        cardPath: 'general.min_hcp_respond',     kind: 'number' },
    { label: 'Light in 3rd/4th seat',     cardPath: 'general.third_fourth_light',  kind: 'boolean' },
    { label: '1NT opening style', cardPath: 'general.nt_open_style', kind: 'radio_inline',
      options: [
        { value: 'strong',   label: 'Strong' },
        { value: 'weak',     label: 'Weak' },
        { value: 'variable', label: 'Variable' }
      ] },
    { label: 'Forcing opening', kind: 'inline_checks',
      paths: [
        { label: '1♣', cardPath: 'general.forcing_opening_1c' },
        { label: '2♣', cardPath: 'general.forcing_opening_2c' }
      ] },
    { label: 'Forcing opening (other)', cardPath: 'general.forcing_opening_other',
      kind: 'text', placeholder: 'e.g. 1♦' },
    { label: 'Bids that may require preparation', cardPath: 'general.bids_requiring_prep',
      kind: 'text', placeholder: 'e.g. 2♣ opening, multi 2♦' }
  ],
  notrump: [
    // ─── 1NT ───
    { label: '1NT range (primary)', kind: 'range',
      from: 'notrump.one_nt.range_min', to: 'notrump.one_nt.range_max' },
    { label: '1NT seat / vul', cardPath: 'notrump.one_nt.seat_vul', kind: 'seat_vul',
      placeholder: 'e.g. all seats, vul, 1st/2nd seat' },
    { label: '1NT range (alternate)', kind: 'range', level: 'advanced',
      from: 'notrump.one_nt_alt.range_min', to: 'notrump.one_nt_alt.range_max' },
    { label: 'Alternate seat / vul', cardPath: 'notrump.one_nt_alt.seat_vul', kind: 'seat_vul',
      level: 'advanced', placeholder: 'e.g. not vul, 3rd seat' },
    { label: 'Alternate uses same responses', cardPath: 'notrump.one_nt_alt.same_responses',
      kind: 'boolean', level: 'advanced' },
    { label: 'May contain 5-card major', cardPath: 'notrump.one_nt.five_card_major',
      kind: 'select', options: ['never', 'sometimes', 'always'] },
    { label: 'Systems on vs', cardPath: 'notrump.one_nt.sys_on_vs',
      kind: 'text', placeholder: 'e.g. X, 2♣' },
    { label: '1NT double', kind: 'inline_checks',
      paths: [
        { label: 'Negative', cardPath: 'notrump.dbl.negative' },
        { label: 'Penalty',  cardPath: 'notrump.dbl.penalty' }
      ] },
    { label: 'Negative double notes', cardPath: 'notrump.dbl.negative_desc',
      kind: 'text', placeholder: 'e.g. at 3-level or higher' },
    { label: 'Other double notes', cardPath: 'notrump.dbl.other',
      kind: 'text', placeholder: 'e.g. penalty at 2-level' },
    { label: 'Lebensohl notes', cardPath: 'notrump.lebensohl.description',
      kind: 'text', placeholder: 'e.g. fast denies stopper' },
    { label: 'Texas transfers', kind: 'inline_checks',
      paths: [
        { label: '4♣',  cardPath: 'notrump.transfers.texas_4c' },
        { label: '4♦',  cardPath: 'notrump.transfers.texas_4d' },
        { label: '4♥',  cardPath: 'notrump.transfers.texas_4h' },
        { label: '4♠',  cardPath: 'notrump.transfers.texas_4s' }
      ] },
    // ─── 2NT ───
    { label: '2NT range', kind: 'range',
      from: 'notrump.two_nt.range_min', to: 'notrump.two_nt.range_max' },
    { label: '2NT options', kind: 'inline_checks',
      paths: [
        { label: 'Puppet',           cardPath: 'notrump.two_nt.puppet' },
        { label: '3♠ relay',         cardPath: 'notrump.two_nt.three_s' },
        { label: 'Transfer 3-level', cardPath: 'notrump.two_nt.transfers_3level' },
        { label: 'Transfer 4-level', cardPath: 'notrump.two_nt.transfers_4level' },
        { label: 'Negative double',  cardPath: 'notrump.two_nt.neg_dbl' }
      ] },
    { label: '2NT 3♠ relay notes', cardPath: 'notrump.two_nt.three_s_desc',
      kind: 'text', placeholder: 'e.g. 3♥ = 4M minor, 4M = both minors' },
    // ─── 3NT ───
    { label: '3NT range', kind: 'range',
      from: 'three_nt.range_min', to: 'three_nt.range_max' },
    { label: '3NT one suit (gambling)', cardPath: 'three_nt.one_suit', kind: 'boolean' },
    { label: '3NT one-suit notes', cardPath: 'three_nt.one_suit_desc',
      kind: 'text', placeholder: 'e.g. solid minor, no outside A or K' },
    // ─── Responses (right column) ───
    { label: '2♦ response', cardPath: 'notrump.responses.2d_other', column: 2,
      kind: 'text', placeholder: 'e.g. transfer to ♥' },
    { label: '2♥ response', cardPath: 'notrump.responses.2h_other', column: 2,
      kind: 'text', placeholder: 'e.g. transfer to ♠' },
    { label: '2♠ response', cardPath: 'notrump.responses.2s_other', column: 2,
      kind: 'text', placeholder: 'e.g. range ask, transfer to ♣ (puppet)' },
    { label: '2NT response', cardPath: 'notrump.responses.2nt_other', column: 2,
      kind: 'text', placeholder: 'e.g. transfer to ♦, 3♣ superaccept range' },
    { label: '3♣ response', cardPath: 'notrump.responses.3c', column: 2,
      kind: 'text', placeholder: 'e.g. Puppet, Gambling, Minors' },
    { label: '3♦ response', cardPath: 'notrump.responses.3d', column: 2,
      kind: 'text', placeholder: 'e.g. Minors GF, Splinter, Texas' },
    { label: '3♥ response', cardPath: 'notrump.responses.3h', column: 2,
      kind: 'text', placeholder: 'e.g. Splinter, Natural slammish' },
    { label: '3♠ response', cardPath: 'notrump.responses.3s', column: 2,
      kind: 'text', placeholder: 'e.g. Splinter, Natural slammish' }
  ],
  major_openings: [
    { label: 'Min length 1st/2nd seat',   cardPath: 'major_openings.min_length_1st_2nd',
      kind: 'select', options: ['4', '5'] },
    { label: 'Min length 3rd/4th seat',   cardPath: 'major_openings.min_length_3rd_4th',
      kind: 'select', options: ['4', '5'] },
    { label: '1NT response is forcing',   cardPath: 'major_openings.one_nt_response.forcing',  kind: 'boolean' },
    { label: '1NT response is semi-forcing', cardPath: 'major_openings.one_nt_response.semi_forcing', kind: 'boolean' },
    { label: 'Bypass 1♠ over 1♥',         cardPath: 'major_openings.one_nt_response.bypass_1s', kind: 'boolean' },
    { label: 'Artificial raises: 3NT (4333)', cardPath: 'major_openings.three_nt_raise.play',   kind: 'boolean' },
    { label: 'Artificial raises: other',  cardPath: 'major_openings.art_raises_other',
      kind: 'text', placeholder: 'e.g. Modified Jacoby 2NT' },
    // ─── Raises (right column) ───
    { label: 'Jump raise', kind: 'inline_checks', column: 2,
      paths: [
        { label: 'Weak',          cardPath: 'major_openings.jump_raise.weak' },
        { label: 'Mixed',         cardPath: 'major_openings.jump_raise.mixed' },
        { label: 'Invitational',  cardPath: 'major_openings.jump_raise.inv' }
      ] },
    { label: 'Jump raise (after overcall)', kind: 'inline_checks', column: 2,
      paths: [
        { label: 'Weak',          cardPath: 'major_openings.jump_raise_after_overcall.weak' },
        { label: 'Mixed',         cardPath: 'major_openings.jump_raise_after_overcall.mixed' },
        { label: 'Invitational',  cardPath: 'major_openings.jump_raise_after_overcall.inv' }
      ] },
    { label: 'Drury', kind: 'inline_checks', column: 2,
      paths: [
        { label: '2♣',             cardPath: 'major_openings.drury.play' },
        { label: '2♦',             cardPath: 'major_openings.drury.two_d' },
        { label: 'In competition', cardPath: 'major_openings.drury.in_comp' }
      ] }
  ],
  minor_openings: [
    // ─── 1♣ (left column) ───
    { label: '1♣ min length',  cardPath: 'minor_openings.one_club.min_length',
      kind: 'select', options: ['3', '4', '5'] },
    { label: '1♣ flags', kind: 'inline_checks',
      paths: [
        { label: 'Unbalanced',         cardPath: 'minor_openings.one_club.unbalanced' },
        { label: 'NF2',                cardPath: 'minor_openings.one_club.nf2' },
        { label: 'NF1',                cardPath: 'minor_openings.one_club.nf1' },
        { label: 'NF0',                cardPath: 'minor_openings.one_club.nf0' },
        { label: 'Artificial forcing', cardPath: 'minor_openings.one_club.art_forcing' }
      ] },
    { label: 'Bypass 5+ ♦ to bid 1♥/1♠', cardPath: 'minor_openings.bypass_5_plus', kind: 'boolean' },
    { label: '1♣ 1NT range (Bergen)', kind: 'range',
      from: 'minor_openings.one_club.one_nt_range_min', to: 'minor_openings.one_club.one_nt_range_max' },
    { label: '1♣ 2NT range (Bergen)', kind: 'range',
      from: 'minor_openings.one_club.two_nt_range_min', to: 'minor_openings.one_club.two_nt_range_max' },
    // ─── 1♣ raises + 1♦ (right column) ───
    { label: '1♣ single raise', kind: 'inline_checks', column: 2,
      paths: [
        { label: 'Non-forcing',  cardPath: 'minor_openings.one_club.single_raise.nf' },
        { label: 'Inv+',         cardPath: 'minor_openings.one_club.single_raise.inv' },
        { label: 'Game forcing', cardPath: 'minor_openings.one_club.single_raise.gf' }
      ] },
    { label: '1♣ jump raise', kind: 'inline_checks', column: 2,
      paths: [
        { label: 'Weak',         cardPath: 'minor_openings.one_club.jump_raise.weak' },
        { label: 'Mixed',        cardPath: 'minor_openings.one_club.jump_raise.mixed' },
        { label: 'Invitational', cardPath: 'minor_openings.one_club.jump_raise.inv' }
      ] },
    { label: '1♣ jump raise (after overcall)', kind: 'inline_checks', column: 2,
      paths: [
        { label: 'Weak',         cardPath: 'minor_openings.one_club.jump_raise_after_overcall.weak' },
        { label: 'Mixed',        cardPath: 'minor_openings.one_club.jump_raise_after_overcall.mixed' },
        { label: 'Invitational', cardPath: 'minor_openings.one_club.jump_raise_after_overcall.inv' }
      ] },
    { label: '1♦ min length', cardPath: 'minor_openings.one_diamond.min_length', column: 2,
      kind: 'select', options: ['3', '4', '5'] },
    { label: '1♦ flags', kind: 'inline_checks', column: 2,
      paths: [
        { label: 'Unbalanced',      cardPath: 'minor_openings.one_diamond.unbalanced' },
        { label: 'NF2 (4432 only)', cardPath: 'minor_openings.one_diamond.nf2_4432_only' },
        { label: 'Same as over 1♣', cardPath: 'minor_openings.one_diamond.same_as_1c' }
      ] }
  ],
  two_level: [
    // ─── 2♣ ───
    { label: '2♣ minimum HCP', cardPath: 'two_level.two_clubs.min_hcp_str',
      kind: 'text', placeholder: 'e.g. 22+' },
    { label: '2♣ meaning', cardPath: 'two_level.two_clubs.meaning', kind: 'radio_inline',
      options: [
        { value: 'very_strong',  label: 'Very strong' },
        { value: 'strong',       label: 'Strong' },
        { value: 'natural',      label: 'Natural' },
        { value: 'conventional', label: 'Conventional' }
      ] },
    { label: '2♣ → 2♦ response', cardPath: 'two_level.two_clubs.2d_response', kind: 'radio_inline',
      options: [
        { value: 'negative', label: 'Negative' },
        { value: 'waiting',  label: 'Waiting' },
        { value: 'steps',    label: 'Steps' }
      ] },
    { label: '2♣ → 2♥ response', cardPath: 'two_level.two_clubs.2h_response', kind: 'radio_inline',
      options: [
        { value: 'negative', label: 'Negative' },
        { value: 'steps',    label: 'Steps' }
      ] },
    // ─── 2♦ ───
    { label: '2♦ range', kind: 'range',
      from: 'two_level.two_diamonds.min_hcp', to: 'two_level.two_diamonds.max_hcp' },
    { label: '2♦ meaning', cardPath: 'two_level.two_diamonds.meaning', kind: 'radio_inline',
      options: [
        { value: 'weak',         label: 'Weak' },
        { value: 'intermediate', label: 'Intermediate' },
        { value: 'strong',       label: 'Strong' },
        { value: 'conventional', label: 'Conventional' }
      ] },
    { label: '2♦ flags', kind: 'inline_checks',
      paths: [
        { label: '2-suited',    cardPath: 'two_level.two_diamonds.two_suited' },
        { label: 'New suit non-forcing', cardPath: 'two_level.two_diamonds.new_suit_nf' }
      ] },
    { label: '2♦ rebid 2NT', cardPath: 'two_level.two_diamonds.rebids_2nt',
      kind: 'text', placeholder: 'Ogust / Singleton-void / …' },
    // ─── 2♥ ───
    { label: '2♥ range', kind: 'range',
      from: 'two_level.two_hearts.min_hcp', to: 'two_level.two_hearts.max_hcp' },
    { label: '2♥ meaning', cardPath: 'two_level.two_hearts.meaning', kind: 'radio_inline',
      options: [
        { value: 'weak',         label: 'Weak' },
        { value: 'intermediate', label: 'Intermediate' },
        { value: 'strong',       label: 'Strong' },
        { value: 'conventional', label: 'Conventional' }
      ] },
    { label: '2♥ flags', kind: 'inline_checks',
      paths: [
        { label: '2-suited',    cardPath: 'two_level.two_hearts.two_suited' },
        { label: 'New suit non-forcing', cardPath: 'two_level.two_hearts.new_suit_nf' }
      ] },
    { label: '2♥ rebid 2NT', cardPath: 'two_level.two_hearts.rebids_2nt',
      kind: 'text', placeholder: 'Ogust / new suit / …' },
    // ─── 2♠ ───
    { label: '2♠ range', kind: 'range',
      from: 'two_level.two_spades.min_hcp', to: 'two_level.two_spades.max_hcp' },
    { label: '2♠ meaning', cardPath: 'two_level.two_spades.meaning', kind: 'radio_inline',
      options: [
        { value: 'weak',         label: 'Weak' },
        { value: 'intermediate', label: 'Intermediate' },
        { value: 'strong',       label: 'Strong' },
        { value: 'conventional', label: 'Conventional' }
      ] },
    { label: '2♠ flags', kind: 'inline_checks',
      paths: [
        { label: '2-suited',    cardPath: 'two_level.two_spades.two_suited' },
        { label: 'New suit non-forcing', cardPath: 'two_level.two_spades.new_suit_nf' }
      ] },
    { label: '2♠ rebid 2NT', cardPath: 'two_level.two_spades.rebids_2nt',
      kind: 'text', placeholder: 'Ogust / new suit / …' }
  ],
  preempts: [
    { label: '3-level style', cardPath: 'preempts.three_level_style',
      kind: 'text', placeholder: 'Light / Sound / Disciplined …' },
    { label: '3-level response', cardPath: 'preempts.three_level_response',
      kind: 'text', placeholder: 'New suit forcing? Raises? …' },
    { label: '4-level style', cardPath: 'preempts.four_level_style',
      kind: 'text', placeholder: 'Light / Sound …' },
    { label: '4-level response', cardPath: 'preempts.four_level_response',
      kind: 'text', placeholder: 'New suit forcing? …' },
    { label: '4♣/4♦ Transfer to major', cardPath: 'preempts.transfer_4_minor', kind: 'boolean' }
  ],
  overcalls: [
    { label: '1-level range', kind: 'range',
      from: 'overcalls.one_level_min', to: 'overcalls.one_level_max' },
    { label: '2-level range', kind: 'range',
      from: 'overcalls.two_level_min', to: 'overcalls.two_level_max' },
    { label: 'Often 4-card suits at 1-level', cardPath: 'overcalls.often_4_cards', kind: 'boolean' },
    { label: 'Jump overcalls', cardPath: 'overcalls.jump',
      kind: 'select', options: ['weak', 'intermediate', 'strong'] },
    { label: 'Convention text', cardPath: 'overcalls.conv_text',
      kind: 'text', placeholder: 'Conventional overcalls, if any' },
    { label: 'New-suit response', cardPath: 'overcalls.responses.new_suit',
      kind: 'select', options: ['forcing', 'nf_constructive', 'nf', 'transfer'] },
    { label: 'Jump-raise response', cardPath: 'overcalls.responses.jump_raise',
      kind: 'select', options: ['weak', 'mixed', 'invitational'] },
    { label: 'Cuebid response', cardPath: 'overcalls.responses.cuebids_text',
      kind: 'text', placeholder: 'e.g. limit raise+, fit-showing' },
    { label: 'Support cuebid', cardPath: 'overcalls.responses.support_cuebid', kind: 'boolean' }
  ],
  nt_overcalls: [
    { label: 'Direct 1NT range', kind: 'range',
      from: 'nt_overcalls.direct.range_min', to: 'nt_overcalls.direct.range_max' },
    { label: 'Direct Systems on', cardPath: 'nt_overcalls.direct.systems_on', kind: 'boolean' },
    { label: 'Balance 1NT range', kind: 'range',
      from: 'nt_overcalls.balance.range_min', to: 'nt_overcalls.balance.range_max' },
    { label: 'Balance Systems on', cardPath: 'nt_overcalls.balance.systems_on', kind: 'boolean' },
    { label: 'Jump-2NT = 2 lowest unbid', cardPath: 'nt_overcalls.jump_2nt_lowest_unbid', kind: 'boolean' },
    { label: 'Convention text', cardPath: 'nt_overcalls.conv_text',
      kind: 'text', placeholder: 'Other treatments' }
  ],
  doubles: [
    { label: 'Negative thru', cardPath: 'doubles.negative.through',
      kind: 'text', placeholder: 'e.g. 4♥' },
    { label: 'Responsive thru', cardPath: 'doubles.responsive.through',
      kind: 'text', placeholder: 'e.g. 3♠' },
    { label: 'Support thru', cardPath: 'doubles.support.through',
      kind: 'text', placeholder: 'e.g. 2♦' },
    { label: 'Support redouble', cardPath: 'doubles.support.rdbl', kind: 'boolean' },
    { label: 'Takeout style', cardPath: 'doubles.takeout_style',
      kind: 'text', placeholder: 'Moderate / Aggressive / Conservative' }
  ],
  slam: [
    { label: '4♣ Gerber', kind: 'inline_checks',
      paths: [
        { label: 'Directly over NT', cardPath: 'other_conventions.gerber.directly_over_nt' },
        { label: 'Over NT sequence', cardPath: 'other_conventions.gerber.over_nt_seq' },
        { label: 'Non-NT sequence',  cardPath: 'other_conventions.gerber.non_nt_seq' }
      ] },
    { label: '4NT notes', cardPath: 'other_conventions.blackwood.notes',
      kind: 'text', placeholder: 'e.g. 0314 if used for minor suit' },
    { label: 'Vs Blackwood interference', kind: 'inline_checks',
      paths: [
        { label: 'DOPI', cardPath: 'slam.dopi' },
        { label: 'DEPO', cardPath: 'slam.depo' },
        { label: 'ROPI', cardPath: 'slam.ropi' }
      ] },
    { label: 'Control bids', cardPath: 'slam.control_bids',
      kind: 'text', placeholder: 'e.g. First/second round controls' },
    { label: 'Vs interference', cardPath: 'slam.vs_interference',
      kind: 'text', placeholder: 'e.g. Western cue, last train' },
    { label: 'Trump-level cutover', cardPath: 'slam.trump_level',
      kind: 'text', placeholder: 'e.g. above 5 of trump suit' }
  ]
}

/**
 * Source-of-truth convention catalog. Each row is one selectable
 * convention with display metadata + the skill it teaches.
 *
 * Fields:
 *   - id:        Stable identifier
 *   - section:   Matches a SECTION_META.id
 *   - name:      Display name
 *   - desc:      One-line description (suit glyphs OK — use HTML entities)
 *   - cardPath:  Dotted path into card_data whose truthiness decides
 *                whether this row is checked
 *   - skillPath: Underlying skill in BAKER_BRIDGE_TAXONOMY (or null if
 *                this convention has no corresponding lesson yet)
 *   - level:     Optional override; defaults to getLevelForSkill(skillPath)
 *   - form:      ACBL alert procedure: 'alert' (red — non-standard, must
 *                be alerted at the table) or 'announce' (blue — bids
 *                that opener announces, like NT range or transfers).
 *                Undefined means standard / no announcement required.
 *                Assignments follow current ACBL Alert Procedure; treat
 *                them as a guideline, not gospel — local regulations
 *                vary and the user can correct them per partnership.
 */
export const CONVENTION_CATALOG = [
  // ─── NT openings ───
  {
    id: 'stayman', section: 'notrump', name: 'Stayman',
    desc: '2♣ asking for 4-card major',
    cardPath: 'notrump.stayman.forcing', skillPath: 'bidding_conventions/stayman'
  },
  {
    id: 'jacoby_transfers', section: 'notrump', name: 'Jacoby transfers',
    desc: '2♦ → 2♥, 2♥ → 2♠',
    cardPath: 'notrump.transfers.jacoby', skillPath: 'bidding_conventions/jacoby_transfers',
    form: 'announce'
  },
  {
    id: 'texas_transfers', section: 'notrump', name: 'Texas transfers',
    desc: '4♦/4♥ at game level',
    cardPath: 'notrump.transfers.texas', skillPath: 'bidding_conventions/jacoby_transfers',
    level: 'intermediate', form: 'announce'
  },
  {
    id: 'smolen', section: 'notrump', name: 'Smolen',
    desc: 'Show 5-4 majors after Stayman',
    cardPath: 'notrump.smolen.play', skillPath: 'bidding_conventions/stayman',
    level: 'intermediate', form: 'alert'
  },
  {
    id: 'puppet_stayman', section: 'notrump', name: 'Puppet Stayman',
    desc: 'Over 2NT, asks for 5-card major',
    cardPath: 'notrump.stayman.puppet', skillPath: 'bidding_conventions/stayman',
    level: 'advanced', form: 'alert'
  },
  {
    id: 'lebensohl_interference', section: 'notrump', name: 'Lebensohl (over interference)',
    desc: '2NT relay after interference to 1NT',
    cardPath: 'notrump.lebensohl.over_interference', skillPath: 'competitive_bidding/lebensohl',
    level: 'advanced', form: 'alert'
  },
  {
    id: 'garbage_stayman', section: 'notrump', name: 'Garbage Stayman',
    desc: 'Weak hand with both majors',
    cardPath: 'notrump.stayman.garbage', skillPath: 'bidding_conventions/stayman',
    level: 'intermediate', form: 'alert'
  },

  // ─── Major openings ───
  {
    id: 'two_over_one', section: 'major_openings', name: 'Two-over-one game force',
    desc: '2♣/2♦/2♥ response = GF',
    cardPath: 'major_openings.two_over_one.game_force', skillPath: 'bidding_conventions/two_over_one'
  },
  {
    id: 'jacoby_2nt', section: 'major_openings', name: 'Jacoby 2NT',
    desc: 'GF raise of major',
    cardPath: 'major_openings.jacoby_2nt.play', skillPath: 'bidding_conventions/jacoby_2nt_splinters',
    form: 'alert'
  },
  {
    id: 'modified_jacoby_2nt', section: 'major_openings', name: 'Modified Jacoby 2NT',
    desc: 'Variant response structure (showing controls/HCP first)',
    cardPath: 'major_openings.jacoby_2nt.modified', skillPath: 'bidding_conventions/jacoby_2nt_splinters',
    level: 'advanced', form: 'alert'
  },
  {
    id: 'bergen_raises', section: 'major_openings', name: 'Bergen raises',
    desc: '3♣ = 7-9 pts, 3♦ = 10-12 pts (or similar)',
    cardPath: 'major_openings.bergen_raises.play', skillPath: null,
    level: 'intermediate', form: 'alert'
  },
  {
    id: 'mixed_jump_raise', section: 'major_openings', name: 'Mixed jump raise',
    desc: 'Jump raise = 4-card support, ~6-9 pts',
    cardPath: 'major_openings.jump_raise.mixed', skillPath: null,
    level: 'intermediate', form: 'alert'
  },
  {
    id: 'splinters', section: 'major_openings', name: 'Splinters',
    desc: 'Double-jump shows shortness',
    cardPath: 'major_openings.splinters.play', skillPath: 'bidding_conventions/jacoby_2nt_splinters',
    form: 'alert'
  },
  {
    id: 'drury', section: 'major_openings', name: 'Drury',
    desc: '2♣ by passed hand = limit raise',
    cardPath: 'major_openings.drury.play', skillPath: 'bidding_conventions/reverse_drury',
    form: 'alert'
  },
  {
    id: 'reverse_drury', section: 'major_openings', name: 'Reverse Drury',
    desc: '3-step responses with reverse strength',
    cardPath: 'major_openings.drury.reverse', skillPath: 'bidding_conventions/reverse_drury',
    level: 'advanced', form: 'alert'
  },
  {
    id: 'semi_forcing_1nt', section: 'major_openings', name: 'Semi-forcing 1NT',
    desc: 'Opener may pass with balanced minimum',
    cardPath: 'major_openings.one_nt_response.semi_forcing', skillPath: null,
    level: 'intermediate', form: 'announce'
  },
  {
    id: 'forcing_1nt', section: 'major_openings', name: 'Forcing 1NT',
    desc: 'Opener must bid again',
    cardPath: 'major_openings.one_nt_response.forcing', skillPath: null,
    level: 'intermediate', form: 'announce'
  },

  // ─── Minor openings ───
  {
    id: 'inverted_minors', section: 'minor_openings', name: 'Inverted minors',
    desc: 'Single raise = strong, jump = weak',
    cardPath: 'minor_openings.inverted_minors.play', skillPath: null, level: 'intermediate',
    form: 'alert'
  },
  {
    id: 'walsh', section: 'minor_openings', name: 'Walsh responses',
    desc: 'After 1♣, bypass 4-card ♦ to show 4-card major',
    cardPath: 'minor_openings.walsh.play', skillPath: null,
    level: 'intermediate', form: 'alert'
  },
  {
    id: 'transfer_responses_1c', section: 'minor_openings', name: 'Transfer responses to 1♣',
    desc: '1♦ → ♥, 1♥ → ♠ (or similar)',
    cardPath: 'minor_openings.one_club.transfer_resp', skillPath: null,
    level: 'expert', form: 'alert'
  },

  // ─── Two-level openings ───
  {
    id: 'strong_2c', section: 'two_level', name: 'Strong 2♣',
    desc: '22+ HCP or game force',
    cardPath: 'two_level.two_clubs.meaning', skillPath: 'bidding_conventions/strong_2c',
    truthy: ['very_strong', 'strong']
  },
  {
    id: 'weak_2d', section: 'two_level', name: 'Weak 2♦',
    desc: '2♦ = 5-10 HCP, 6-card suit',
    cardPath: 'two_level.two_diamonds.meaning', skillPath: 'bidding_conventions/weak_2s',
    truthy: 'weak', level: 'basic'
  },
  {
    id: 'weak_2h', section: 'two_level', name: 'Weak 2♥',
    desc: '2♥ = 5-10 HCP, 6-card suit',
    cardPath: 'two_level.two_hearts.meaning', skillPath: 'bidding_conventions/weak_2s',
    truthy: 'weak'
  },
  {
    id: 'weak_2s', section: 'two_level', name: 'Weak 2♠',
    desc: '2♠ = 5-10 HCP, 6-card suit',
    cardPath: 'two_level.two_spades.meaning', skillPath: 'bidding_conventions/weak_2s',
    truthy: 'weak'
  },
  {
    id: 'ogust', section: 'two_level', name: 'Ogust',
    desc: '2NT over weak two asks suit + hand quality',
    cardPath: 'two_level.ogust.play', skillPath: 'bidding_conventions/ogust',
    form: 'alert'
  },
  {
    id: 'multi_2d', section: 'two_level', name: 'Multi 2♦',
    desc: 'Weak 2 in a major (or strong variants)',
    cardPath: 'two_level.two_diamonds.multi', skillPath: null,
    level: 'expert', form: 'alert'
  },
  {
    id: 'mini_roman_2d', section: 'two_level', name: 'Mini-Roman 2♦',
    desc: '3-suited hand, short in a specified suit',
    cardPath: 'two_level.two_diamonds.mini_roman', skillPath: null,
    level: 'advanced', form: 'alert'
  },
  {
    id: 'reverse_flannery_2d', section: 'two_level', name: 'Reverse Flannery 2♦',
    desc: '5+ ♥ and 4+ ♠, 11-15 HCP',
    cardPath: 'two_level.two_diamonds.reverse_flannery', skillPath: null,
    level: 'advanced', form: 'alert'
  },
  {
    id: 'kokish', section: 'two_level', name: 'Kokish relay',
    desc: 'After 2♣–2♦, 2♥ asks; rebid shows hearts',
    cardPath: 'two_level.two_clubs.kokish', skillPath: null,
    level: 'advanced', form: 'alert'
  },
  {
    id: 'parrish_2h_bust', section: 'two_level', name: 'Parrish 2♥ bust',
    desc: 'After 2♣, 2♥ shows a flat 0-3 HCP',
    cardPath: 'two_level.two_clubs.parrish_bust', skillPath: null,
    level: 'advanced', form: 'alert'
  },
  {
    id: 'mccabe', section: 'two_level', name: 'McCabe adjunct',
    desc: 'After weak two doubled: 2NT = lead-directing raise',
    cardPath: 'two_level.mccabe.play', skillPath: null,
    level: 'advanced', form: 'alert'
  },

  // ─── Slam bidding ───
  // Schema note: the seed previously used `slam.blackwood.*` paths,
  // but `cardToTaxonomyMapping.js` looks for `other_conventions.*`.
  // We follow the mapping so toggling these conventions in the editor
  // also lights up the corresponding skill in coverage detection.
  {
    id: 'standard_blackwood', section: 'slam', name: 'Standard Blackwood',
    desc: '4NT asks for aces (4 / 5 / 6 / 7 = 0–3 aces)',
    cardPath: 'other_conventions.blackwood.standard', skillPath: 'bidding_conventions/blackwood'
  },
  {
    id: 'rkcb_1430', section: 'slam', name: 'RKCB 1430',
    desc: 'Roman Keycard Blackwood — 1-or-4 then 3-or-0',
    cardPath: 'other_conventions.blackwood.rkcb_1430', skillPath: 'bidding_conventions/roman_keycard',
    level: 'intermediate', form: 'alert'
  },
  {
    id: 'rkcb_0314', section: 'slam', name: 'RKCB 0314',
    desc: 'Roman Keycard Blackwood — 0-or-3 then 1-or-4',
    cardPath: 'other_conventions.blackwood.rkcb_0314', skillPath: 'bidding_conventions/roman_keycard',
    level: 'intermediate', form: 'alert'
  },
  {
    id: 'queen_ask', section: 'slam', name: 'Queen ask',
    desc: '5NT (or next step) asks for trump queen',
    cardPath: 'other_conventions.blackwood.queen_ask', skillPath: 'bidding_conventions/roman_keycard',
    level: 'advanced', form: 'alert'
  },
  {
    id: 'gerber', section: 'slam', name: 'Gerber',
    desc: '4♣ ace ask over 1NT/2NT',
    cardPath: 'other_conventions.gerber.play', skillPath: 'bidding_conventions/blackwood'
  },
  {
    id: 'kickback', section: 'slam', name: 'Kickback',
    desc: 'Suit-above-trump = keycard ask',
    cardPath: 'other_conventions.kickback.play', skillPath: 'bidding_conventions/roman_keycard',
    level: 'expert', form: 'alert'
  },
  {
    id: 'minorwood', section: 'slam', name: 'Minorwood',
    desc: '4 of the agreed minor = RKCB',
    cardPath: 'slam.minorwood.play', skillPath: 'bidding_conventions/roman_keycard',
    level: 'advanced', form: 'alert'
  },
  {
    id: 'exclusion_blackwood', section: 'slam', name: 'Exclusion Blackwood',
    desc: 'Jump in a void suit asks for keycards excluding that suit',
    cardPath: 'slam.exclusion_blackwood.play', skillPath: 'bidding_conventions/roman_keycard',
    level: 'advanced', form: 'alert'
  },
  {
    id: 'pick_a_slam_5nt', section: 'slam', name: 'Pick-a-slam 5NT',
    desc: '5NT after a fit suggests slam, lets partner pick the strain',
    cardPath: 'slam.pick_a_slam_5nt.play', skillPath: null,
    level: 'advanced'
  },
  {
    id: 'western_cuebid', section: 'slam', name: 'Western cuebid',
    desc: '4 of an opponent\'s suit asks for a stopper for 3NT',
    cardPath: 'slam.western_cuebid.play', skillPath: null,
    level: 'intermediate'
  },
  {
    id: 'spiral_cuebids', section: 'slam', name: 'Spiral cuebids',
    desc: 'Step-wise control showing (1st-round controls in order)',
    cardPath: 'slam.spiral_cuebids.play', skillPath: null,
    level: 'expert', form: 'alert'
  },
  {
    id: 'non_serious_3nt', section: 'slam', name: 'Non-serious 3NT',
    desc: 'In a 2/1 auction, 3NT denies slam interest',
    cardPath: 'slam.non_serious_3nt.play', skillPath: null,
    level: 'expert', form: 'alert'
  },

  // ─── Competitive ───
  {
    id: 'takeout_doubles', section: 'doubles', name: 'Takeout doubles',
    desc: 'Double of suit opening = takeout',
    cardPath: 'doubles.takeout_style', skillPath: 'competitive_bidding/takeout_doubles',
    truthy: ['moderate', 'aggressive', 'conservative']
  },
  {
    id: 'negative_doubles', section: 'doubles', name: 'Negative doubles',
    desc: 'Takeout-style double after overcall',
    cardPath: 'doubles.negative.play', skillPath: 'competitive_bidding/negative_doubles'
  },
  {
    id: 'responsive_doubles', section: 'doubles', name: 'Responsive doubles',
    desc: 'Double after partner double + opp raise = takeout',
    cardPath: 'doubles.responsive.play', skillPath: null,
    level: 'intermediate'
  },
  {
    id: 'support_doubles', section: 'doubles', name: 'Support doubles',
    desc: 'Double after interference = exactly 3-card support',
    cardPath: 'doubles.support.play', skillPath: 'competitive_bidding/support_cuebids',
    level: 'advanced'
  },
  {
    id: 'michaels', section: 'competitive', name: 'Michaels cue bid',
    desc: 'Cue = two-suited overcall',
    cardPath: 'competitive.michaels.play', skillPath: 'competitive_bidding/michaels_unusual'
  },
  {
    id: 'unusual_2nt', section: 'competitive', name: 'Unusual 2NT',
    desc: '2NT = two lowest unbid suits',
    cardPath: 'competitive.unusual_2nt.play', skillPath: 'competitive_bidding/michaels_unusual',
    form: 'alert'
  },
  {
    id: 'dont', section: 'competitive', name: 'DONT',
    desc: 'Disturbing Opponents NT — double = single-suited',
    cardPath: 'competitive.dont.play', skillPath: 'competitive_bidding/dont',
    level: 'advanced', form: 'alert'
  },
  {
    id: 'cue_bid_raise', section: 'competitive', name: 'Cue-bid raise',
    desc: 'Cue of opp\'s suit = 3+ card limit raise',
    cardPath: 'competitive.cue_bid_raise.play', skillPath: 'competitive_bidding/support_cuebids',
    level: 'intermediate'
  },
  {
    id: 'lead_directing_double', section: 'competitive', name: 'Lead-directing doubles',
    desc: 'Double of artificial bid suggests opening lead',
    cardPath: 'competitive.lead_directing_double.play', skillPath: null,
    level: 'intermediate'
  },
  {
    id: 'lebensohl_weak_twos', section: 'competitive', name: 'Lebensohl (over weak twos)',
    desc: '2NT relay after partner doubles a weak two',
    cardPath: 'competitive.lebensohl_weak_twos.play', skillPath: 'competitive_bidding/lebensohl',
    level: 'advanced', form: 'alert'
  },
  {
    id: 'sandwich_nt', section: 'competitive', name: 'Sandwich NT',
    desc: '1NT in 4th seat after two suits bid = unusual NT',
    cardPath: 'competitive.sandwich_nt.play', skillPath: null,
    level: 'advanced', form: 'alert'
  },
  {
    id: 'snapdragon', section: 'competitive', name: 'Snapdragon doubles',
    desc: 'After 3 suits bid, double = 4+ in 4th suit + tolerance for partner',
    cardPath: 'competitive.snapdragon.play', skillPath: null,
    level: 'advanced', form: 'alert'
  },
  {
    id: 'maximal_doubles', section: 'doubles', name: 'Maximal doubles',
    desc: 'Game-try double when no suit available for help-suit try',
    cardPath: 'doubles.maximal', skillPath: null,
    level: 'advanced', form: 'alert'
  },
  {
    id: 'unusual_vs_unusual', section: 'competitive', name: 'Unusual vs Unusual',
    desc: 'Defenses to opponents\' Unusual 2NT',
    cardPath: 'competitive.unusual_vs_unusual.play', skillPath: null,
    level: 'advanced', form: 'alert'
  },
  {
    id: 'leaping_michaels', section: 'competitive', name: 'Leaping Michaels',
    desc: '4♣/4♦ over weak two = good 5+ in that minor + 5+ major',
    cardPath: 'competitive.leaping_michaels.play', skillPath: null,
    level: 'advanced', form: 'alert'
  },

  // ─── Other conventions ───
  {
    id: 'fourth_suit_forcing_1rnd', section: 'other_conventions', name: 'Fourth suit forcing (1 round)',
    desc: '4th-suit bid by responder = artificial force for one round',
    cardPath: 'other_conventions.fourth_suit_forcing.one_round',
    skillPath: 'bidding_conventions/fourth_suit_forcing',
    form: 'alert'
  },
  {
    id: 'fourth_suit_forcing_gf', section: 'other_conventions', name: 'Fourth suit forcing (game force)',
    desc: '4th-suit bid by responder = game force',
    cardPath: 'other_conventions.fourth_suit_forcing.game_force',
    skillPath: 'bidding_conventions/fourth_suit_forcing',
    form: 'alert'
  },
  {
    id: 'help_suit_game_tries', section: 'other_conventions', name: 'Help suit game tries',
    desc: 'Sub-game bid asks help in that suit',
    cardPath: 'other_conventions.help_suit_game_tries.play', skillPath: 'bidding_conventions/help_suit_game_try',
    form: 'alert'
  },
  {
    id: 'reverse_bids', section: 'other_conventions', name: 'Reverse bids',
    desc: "Opener's 2-of-higher-suit shows extra values",
    cardPath: 'other_conventions.reverse_bids.forcing', skillPath: 'bidding_conventions/reverse_bids'
  },
  {
    id: 'nmf', section: 'other_conventions', name: 'New minor forcing',
    desc: 'After 1m-1M-1NT, 2 of other minor = forcing inquiry',
    cardPath: 'other_conventions.new_minor_forcing.play',
    skillPath: 'bidding_conventions/new_minor_forcing',
    form: 'alert'
  },
  {
    id: 'two_way_nmf', section: 'other_conventions', name: '2-Way new minor forcing',
    desc: 'After 1m-1M-1NT: 2♣ = invite-only, 2♦ = game-forcing',
    cardPath: 'other_conventions.two_way_nmf', skillPath: 'bidding_conventions/new_minor_forcing',
    level: 'intermediate', form: 'alert'
  },
  {
    id: 'xyz', section: 'other_conventions', name: 'XYZ',
    desc: 'After 1x-1y-1z: 2♣ = relay, 2♦ = game force',
    cardPath: 'other_conventions.xyz', skillPath: null,
    level: 'advanced', form: 'alert'
  },
  {
    id: 'sos_redouble', section: 'other_conventions', name: 'SOS redouble',
    desc: 'Redouble asking partner to pick another suit',
    cardPath: 'other_conventions.sos_redouble.play', skillPath: null,
    level: 'advanced', form: 'alert'
  },
  {
    id: 'ingberman_2nt', section: 'other_conventions', name: 'Ingberman 2NT',
    desc: 'After 1♣-1♥-1♠, 2NT = forcing minor-suit inquiry',
    cardPath: 'other_conventions.ingberman_2nt.play', skillPath: null,
    level: 'advanced', form: 'alert'
  }
]

/** Entries for a single section. */
export function getCatalogEntries(sectionId) {
  return CONVENTION_CATALOG.filter(e => e.section === sectionId)
}

/** Single entry lookup by id (not cardPath — id is the stable key). */
export function getCatalogEntry(id) {
  return CONVENTION_CATALOG.find(e => e.id === id) || null
}

/** Resolve the effective level for a catalog row. */
export function getLevelForEntry(entry) {
  if (entry.level) return entry.level
  if (entry.skillPath) return getLevelForSkill(entry.skillPath)
  return 'basic'
}

/**
 * Read a dotted path out of an object. Returns undefined if any
 * intermediate step is missing.
 */
export function readPath(obj, dotted) {
  if (!obj || !dotted) return undefined
  const parts = dotted.split('.')
  let cur = obj
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined
    cur = cur[p]
  }
  return cur
}

/**
 * Write a value at a dotted path, creating intermediate objects as
 * needed. Mutates the target object. Used by the editor to flip a
 * convention on/off.
 */
export function writePath(obj, dotted, value) {
  if (!obj || !dotted) return
  const parts = dotted.split('.')
  let cur = obj
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i]
    if (cur[key] == null || typeof cur[key] !== 'object') {
      cur[key] = {}
    }
    cur = cur[key]
  }
  cur[parts[parts.length - 1]] = value
}

/**
 * Apply a checked/unchecked toggle for a catalog entry to `cardData`.
 * Handles entries with simple booleans, `truthy` overrides (single
 * value or list-of-allowed). Mutates cardData.
 */
export function setEntryChecked(entry, cardData, checked) {
  if (entry.truthy === undefined) {
    writePath(cardData, entry.cardPath, !!checked)
    return
  }
  if (Array.isArray(entry.truthy)) {
    if (checked) {
      // Keep current value if it's already one of the allowed truthy
      // values; otherwise default to the first.
      const cur = readPath(cardData, entry.cardPath)
      if (!entry.truthy.includes(cur)) {
        writePath(cardData, entry.cardPath, entry.truthy[0])
      }
    } else {
      writePath(cardData, entry.cardPath, null)
    }
    return
  }
  // Single-value truthy override
  writePath(cardData, entry.cardPath, checked ? entry.truthy : null)
}

/**
 * Is the catalog row "checked" in the given card_data?
 * Default: truthy means checked. Rows with a `truthy` field treat
 * specific values (or one of several) as checked — e.g.
 * `two_clubs.meaning === 'strong'`.
 */
export function isEntryChecked(entry, cardData) {
  const value = readPath(cardData, entry.cardPath)
  if (value === undefined || value === null) return false
  if (entry.truthy === undefined) return !!value
  if (Array.isArray(entry.truthy)) return entry.truthy.includes(value)
  return value === entry.truthy
}

/**
 * Inline SVG icon definitions used by the section tree. Each is a
 * 16x16 stroke-only glyph that picks up `currentColor`.
 */
export const ICON_SVG = {
  compass: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><circle cx="12" cy="12" r="9"/><polygon points="14 10 12 12 10 14 10 14 12 12 14 10"/><polygon points="9 15 12 12 15 9 11 13"/></svg>',
  cards: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><rect x="6" y="4" width="12" height="16" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/></svg>',
  'arrow-up-right': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="9 7 17 7 17 15"/></svg>',
  'arrow-down-right': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><line x1="7" y1="7" x2="17" y2="17"/><polyline points="17 9 17 17 9 17"/></svg>',
  'arrows-up': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><polyline points="6 11 9 8 12 11"/><line x1="9" y1="20" x2="9" y2="8"/><polyline points="12 11 15 8 18 11"/><line x1="15" y1="20" x2="15" y2="8"/></svg>',
  crown: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M12 6l3 5 4-3-1 8H6L5 8l4 3 3-5z"/></svg>',
  swords: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><polyline points="14 4 19 4 19 9"/><line x1="19" y1="4" x2="12" y2="11"/><polyline points="10 4 5 4 5 9"/><line x1="5" y1="4" x2="12" y2="11"/><line x1="12" y1="11" x2="18" y2="17"/><line x1="12" y1="11" x2="6" y2="17"/></svg>',
  puzzle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M4 7h4V3h4v4h4v4h4v4h-4v4h-4v-4h-4v-4H4z"/></svg>',
  rocket: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M5 13l4 4L4 22l1-9zM13 5l6 6-7 7-6-6 7-7zM15 3l6 6M9 15l3-3"/></svg>',
  doubles: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M5 5l6 6M11 5L5 11M13 13l6 6M19 13l-6 6"/></svg>',
  signal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M4 20h2v-5H4zM10 20h2v-9h-2zM16 20h2v-13h-2zM22 20h-2v-17h2"/></svg>',
  lead: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><rect x="3" y="6" width="9" height="13" rx="2"/><path d="M14 8l4 2-2 4M14 12l4 2-2 4"/></svg>'
}
