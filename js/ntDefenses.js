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
 * A heading of the card's defense to 1NT, as the cards write them (BBO's,
 * the ACBL "vs:" lines, or typed): `{ includes, system, label }`.
 * `includes`: the 16 of "Strong 16+" and "Weak No 16". `system`: the words
 * naming a defense ("Meckwell" in "Strong 14+ (Meckwell)", "Cappelletti" in
 * "Strong - Cappelletti"), or null. `label`: it only says which 1NTs the
 * column is for ("Strong 1NT", "(WEAK)", "strong/weak").
 */
export function readNtHeading(text) {
  const t = String(text ?? '').trim()
  if (/^\(?\s*(strong|weak|strong\s*\/\s*weak)(\s*1\s*nt)?\s*\)?$/i.test(t)) return { includes: null, system: null, label: true }
  const rest = s => s.replace(/^[\s:(\-\u2013\u2014]+|[\s)]+$/g, '') || null
  const m = /^\(?\s*(?:strong\s+|weak\s+no\s+)(\d{1,2})(?![\dA-Za-z])\s*\+?\s*\)?/i.exec(t)
  if (m) return { includes: Number(m[1]), system: rest(t.slice(m[0].length)), label: false }
  // "Strong: Cappelletti", "weak - natural", "Weak (Natural)", "Strong 1NT: X"
  const side = /^(strong|weak)(\s*1\s*nt)?\s*[:(\-\u2013\u2014]\s*/i.exec(t)
  if (side) return { includes: null, system: rest(t.slice(side[0].length)), label: false }
  return { includes: null, system: t || null, label: false }
}

const isNatural = system => String(system ?? '').trim().toLowerCase() === 'natural'

/**
 * How a system is written for people. The card keeps an imported system as
 * the spec's option (`multi_landy`); that reads as the defense's name
 * ("Multi-Landy"). `other`, a defense that has no name, reads as null, as
 * does a label kept from another card ("Strong 1NT"); a whole heading kept
 * from one ("Strong 14+ (Meckwell)") reads as its defense; anything else
 * as typed.
 */
export function ntSystemName(system) {
  if (system == null) return null
  const t = String(system).trim()
  if (!t || t.toLowerCase() === 'other') return null
  if (/^[a-z_]+$/.test(t) && !/^(strong|weak)$/.test(t)) {
    const key = t.replace(/_/g, '')
    const known = KNOWN_NT_DEFENSES.find(d => [d.name, ...(d.aliases || [])].some(n => n.toLowerCase().replace(/[^a-z]/g, '') === key))
    return known ? known.name : t.split('_').map(w => w[0].toUpperCase() + w.slice(1)).join(' ')
  }
  const heading = readNtHeading(t)
  if (heading.label) return null
  return heading.system && heading.system !== t ? ntSystemName(heading.system) : t
}

// Shorter names, for a heading too long for its blank
const SHORT_NAMES = { 'Modified Cappelletti': 'Mod. Capp.', Cappelletti: 'Capp.', 'Multi-Landy': 'M-Landy' }
// About what the ACBL cards' "vs:" blanks (52pt) hold before the text
// drops below 6.5pt in the condensed field font.
const HEADING_FITS = 23

/** A name for a defense written short ("Capp."), as its full name. */
export const ntSystemFromShort = name =>
  Object.keys(SHORT_NAMES).find(n => SHORT_NAMES[n].toLowerCase() === String(name ?? '').trim().toLowerCase()) ?? null

/**
 * What a column's heading prints on the ACBL cards' "vs:" line: which 1NTs
 * the column is for, first ("Strong", "Weak", or where strong starts,
 * "Strong 15+" / "Weak No 15"), then the defense by name when it has one
 * ("Strong: Cappelletti"; "Weak: Natural"). A name that would not fit is
 * shortened ("Strong 15+: Mod. Capp."); the side never is. `filled`: the
 * column has anything in it; an empty column with no system and no
 * starting point prints nothing.
 */
export function ntHeadingText(side, system, includes, filled = false) {
  const Side = side === 'strong' ? 'Strong' : 'Weak'
  const own = readNtHeading(system)
  const n = includes == null || includes === '' ? own.includes : includes
  const start = n == null || n === '' ? Side : side === 'strong' ? `Strong ${n}+` : `Weak No ${n}`
  const named = isNatural(system) ? 'Natural' : ntSystemName(system)
  if (!named) return start !== Side || filled || (system != null && String(system).trim()) ? start : null
  const full = `${start}: ${named}`
  return full.length > HEADING_FITS && SHORT_NAMES[named] ? `${start}: ${SHORT_NAMES[named]}` : full
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

/** Whether a column of the defense to 1NT (`competitive.vs_1nt_strong`) has anything in it. */
export const ntColumnFilled = column =>
  !!column && typeof column === 'object' && Object.values(column).some(v => v != null && v !== false && String(v).trim() !== '')
