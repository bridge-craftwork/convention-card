// The editor's skill-level filter: the four named bands (DECISIONS.md, 12)
// and, for catalog rows that name no level of their own, their skill's
// level as Bridge Classroom's taxonomy gave it (bakerBridgeTaxonomy.js,
// copied 2026-10-01), so the editor filters exactly as it did there.

export const SKILL_LEVELS = ['basic', 'intermediate', 'advanced', 'expert']

const SKILL_LEVEL = {
  'bidding_conventions/blackwood': 'basic',
  'bidding_conventions/fourth_suit_forcing': 'intermediate',
  'bidding_conventions/help_suit_game_try': 'intermediate',
  'bidding_conventions/jacoby_2nt_splinters': 'advanced',
  'bidding_conventions/jacoby_transfers': 'basic',
  'bidding_conventions/new_minor_forcing': 'intermediate',
  'bidding_conventions/ogust': 'intermediate',
  'bidding_conventions/reverse_bids': 'intermediate',
  'bidding_conventions/reverse_drury': 'advanced',
  'bidding_conventions/stayman': 'basic',
  'bidding_conventions/strong_2c': 'basic',
  'bidding_conventions/two_over_one': 'intermediate',
  'bidding_conventions/weak_2s': 'basic',
  'competitive_bidding/michaels_unusual': 'intermediate',
  'competitive_bidding/negative_doubles': 'basic',
  'competitive_bidding/takeout_doubles': 'basic',
}

/** A skill's level band; 'basic' when unknown, as Bridge Classroom did. */
export function getLevelForSkill(skillPath) {
  return SKILL_LEVEL[skillPath] || 'basic'
}
