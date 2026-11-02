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

// Which 1NTs count as strong: the point count their range includes.
export const NT_STRONG_INCLUDES = 'competitive.vs_1nt_strong_includes'

/**
 * A heading of the card's defense to 1NT, as BBO's cards write them:
 * `{ includes, system, label }`. `includes`: the 16 of "Strong 16+" and "Weak
 * No 16". `system`: the words naming a defense ("Meckwell" in "Strong 14+
 * (Meckwell)"), or null. `label`: it only says which 1NTs the column is for
 * ("Strong 1NT", "(WEAK)", "strong/weak").
 */
export function readNtHeading(text) {
  const t = String(text ?? '').trim()
  if (/^\(?\s*(strong|weak|strong\s*\/\s*weak)(\s*1\s*nt)?\s*\)?$/i.test(t)) return { includes: null, system: null, label: true }
  const m = /^\(?\s*(?:strong\s+|weak\s+no\s+)(\d{1,2})(?![\dA-Za-z])\s*\+?\s*\)?/i.exec(t)
  if (!m) return { includes: null, system: t || null, label: false }
  const rest = t.slice(m[0].length).replace(/^[\s:(-]+|[\s)]+$/g, '')
  return { includes: Number(m[1]), system: rest || null, label: false }
}

const isNatural = system => String(system ?? '').trim().toLowerCase() === 'natural'

/**
 * What a column's heading prints: the defense as written, but with where
 * strong starts when the card says ("Weak No 16: Natural"), and with which
 * 1NTs a natural column is for ("Weak 1NT: Natural"), since the ACBL cards'
 * two columns are otherwise labelled only by what's written here.
 */
export function ntHeadingText(side, system, includes) {
  const Side = side === 'strong' ? 'Strong' : 'Weak'
  const named = system == null || system === '' ? null : isNatural(system) ? 'Natural' : String(system)
  const start = includes == null || includes === '' ? null : side === 'strong' ? `Strong ${includes}+` : `Weak No ${includes}`
  if (start) return named ? `${start}: ${named}` : start
  return named === 'Natural' ? `${Side} 1NT: Natural` : system
}

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
  // Bids are as named: nothing to fill in, or to differ from
  { name: 'Natural', bids: {} },
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
