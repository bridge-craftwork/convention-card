/**
 * Known defense systems vs an opening 1NT.
 *
 * Each entry carries a canonical name, optional aliases, and the
 * standard bid meanings. The convention-card editor consults this
 * registry when the user types a system name — if all the bid fields
 * are currently empty, we auto-fill them so the user can tweak rather
 * than retype.
 *
 * Definitions follow current ACBL Encyclopedia / WBF descriptions.
 * Local variations vary; the user can override per partnership.
 */

export const NT_DEFENSE_BIDS = [
  { key: 'dbl', label: 'Dbl' },
  { key: '2c',  label: '2♣' },
  { key: '2d',  label: '2♦' },
  { key: '2h',  label: '2♥' },
  { key: '2s',  label: '2♠' },
  { key: '2nt', label: '2NT' }
]

export const KNOWN_NT_DEFENSES = [
  {
    name: 'Cappelletti',
    aliases: ['Hamilton', 'Pottage'],
    bids: {
      dbl:  'Penalty',
      '2c': 'Single-suited',
      '2d': 'Both majors',
      '2h': '♥ + a minor',
      '2s': '♠ + a minor',
      '2nt': 'Both minors'
    }
  },
  {
    name: 'DONT',
    aliases: ['Disturbing Opponents NT'],
    bids: {
      dbl:  'Single-suited (pass to play)',
      '2c': '♣ + higher',
      '2d': '♦ + higher',
      '2h': '♥ + ♠',
      '2s': '♠ (long, by inference)',
      '2nt': '—'
    }
  },
  {
    name: 'Meckwell',
    bids: {
      dbl:  '♣ or ♦, or both majors',
      '2c': '♣ + a major',
      '2d': '♦ + a major',
      '2h': 'Natural ♥',
      '2s': 'Natural ♠',
      '2nt': 'Minors'
    }
  },
  {
    name: 'Multi-Landy',
    aliases: ['Landy'],
    bids: {
      dbl:  'Penalty',
      '2c': 'Both majors',
      '2d': 'Single-suited major (weak)',
      '2h': 'Natural ♥',
      '2s': 'Natural ♠',
      '2nt': 'Both minors'
    }
  },
  {
    name: 'Suction',
    bids: {
      dbl:  '♣ + ♥',
      '2c': '♦ or both majors',
      '2d': '♥ or both blacks',
      '2h': '♠ or both minors',
      '2s': '♣ or both reds',
      '2nt': '♦ + ♠'
    }
  },
  {
    name: 'Hello',
    bids: {
      dbl:  'One-suiter in either minor',
      '2c': 'One-suiter in ♥',
      '2d': 'One-suiter in ♠',
      '2h': 'Both majors',
      '2s': 'Both minors',
      '2nt': '—'
    }
  },
  {
    name: 'Penalty',
    aliases: ['Natural', 'Standard'],
    bids: {
      dbl:  'Penalty',
      '2c': 'Natural',
      '2d': 'Natural',
      '2h': 'Natural',
      '2s': 'Natural',
      '2nt': '—'
    }
  }
]

/**
 * Look up a defense by name. Match rules (case-insensitive, ordered):
 *   1. Exact match against canonical name or any alias.
 *   2. The user's text starts with a known name AND adds more (e.g.
 *      "Meckwell (modified)" → Meckwell). A bare prefix shorter than
 *      the known name does NOT match — typing "C" must not silently
 *      resolve to Cappelletti.
 * Returns null if nothing applies.
 */
export function findKnownDefense(systemName) {
  if (!systemName || typeof systemName !== 'string') return null
  const norm = systemName.trim().toLowerCase()
  if (!norm) return null
  // Exact match (including aliases)
  for (const def of KNOWN_NT_DEFENSES) {
    if (def.name.toLowerCase() === norm) return def
    if (def.aliases?.some(a => a.toLowerCase() === norm)) return def
  }
  // Known-name-plus-more match (the user has typed at least the full
  // name and then a separator/extra text — common for cards labelled
  // "Strong 14+ (Meckwell)" or "Meckwell modified").
  for (const def of KNOWN_NT_DEFENSES) {
    const candidates = [def.name, ...(def.aliases || [])]
    for (const c of candidates) {
      const cl = c.toLowerCase()
      if (norm.length > cl.length && norm.includes(cl)) return def
    }
  }
  return null
}
