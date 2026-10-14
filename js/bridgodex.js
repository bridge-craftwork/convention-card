// Import and export of Bridgodex.com cards, the JSON its export writes and
// its import reads:
//
//   { settings: { overview: { general_approach: "2/1", forcing_2c: "on", … },
//                 "1_no_trump": { a_range_min: "15", "2c_stayman": "on", … },
//                 …, names: { names: "Pat and Sam" } },
//     notes: "…" }
//
// Each block of `settings` is a table in spec/formats/bridgodex-map.toml,
// which says what each box does; both directions read it. A ticked box is
// "on". The import keeps the settings in `card_data._bridgeodex_raw` (the
// name saved cards have always used), and the export starts from them:
// boxes the map does not cover go back unchanged, and a box keeps its value
// unless the fields it fills have changed.

import { field, BRIDGODEX_MAP } from './spec.js'
import { readPath, writePath } from './paths.js'
import { normalizeSuitShorthand } from './suits.js'

const { any: ANY = [], notes: NOTES = [], ...BLOCKS } = BRIDGODEX_MAP

const known = path => {
  if (!field(path)) throw new Error(`Bridgodex map: unknown field ${path}`)
  return path
}
const canonical = path => field(path)?.path ?? path

// ─── Values in and out ─────────────────────────────────────────────

const on = v => v === 'on' || v === true
const blank = v => v == null || String(v).trim() === ''
const ON = 'on'

/** Text typed on Bridgodex, its suit shorthand ("!C", "2C") as ♠♥♦♣. */
const suits = v => normalizeSuitShorthand(String(v))
/** Card text for Bridgodex, which writes suits as !S !H !D !C. */
const shorthand = v => (blank(v) ? undefined : String(v)
  .replace(/♠/g, '!S').replace(/♥/g, '!H').replace(/♦/g, '!D').replace(/♣/g, '!C'))

function num(value) {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

/**
 * A range end: "14+" → { n: 14, plus }, "17 Vul" → { n: 17, words: "Vul" }.
 * The + or - must end the number ("17-ish" is words).
 */
function parseRange(value) {
  if (value == null || value === '') return { n: null }
  const s = String(value).trim()
  const m = s.match(/^([+\-]?\d+)([+-]?)(?=\s|$)\s*(.*)$/)
  if (!m) return { n: null, words: s }
  return { n: parseInt(m[1], 10), plus: m[2] === '+', minus: m[2] === '-', words: m[3].trim() || null }
}

/** Whether a system's description names 2/1 ("2/1", "2 over 1", "two over one"). */
export function namesTwoOverOne(text) {
  return /(^|[^\d])2\s*\/\s*1(?!\d)|\b2\s*over\s*1\b|\btwo[\s-]*over[\s-]*one\b/i.test(String(text || ''))
}

// ─── The map, as entries ───────────────────────────────────────────
// Each entry covers some boxes of one block and some card paths:
//   block, keys   where its boxes are
//   paths         the card fields it fills
//   read(b, card) writes the import into `card` (a Map of path → value)
//   write(get)    → { key: value | undefined } for the export
//   importOnly    an older spelling, read but not written

function entry(block, key, spec) {
  if (typeof spec === 'string') spec = { set: { [spec]: true } }
  const base = { block, keys: [key], importOnly: spec.export === false }

  if (spec.set) {
    const set = Object.entries(spec.set).map(([p, v]) => [known(p), v])
    const whenAny = spec.when_any && Object.entries(spec.when_any).map(([p, v]) => [known(p), v])
    const ticked = whenAny
      ? get => whenAny.some(([p, v]) => get(p) === v)
      : get => set.every(([p, v]) => get(p) === v)
    return {
      ...base, paths: [...new Set([...set, ...(whenAny || [])].map(([p]) => p))],
      read: (b, card) => { if (on(b[key])) for (const [p, v] of set) card.set(p, v) },
      write: get => ({ [key]: ticked(get) ? ON : undefined }),
    }
  }
  if (spec.text) {
    const path = known(spec.text)
    const other = spec.unless_same_as
    return {
      ...base, paths: [path],
      read: (b, card) => { if (b[key] && !(other && b[key] === b[other])) card.set(path, suits(b[key])) },
      write: get => ({ [key]: shorthand(get(path)) }),
    }
  }
  if (spec.plain) {
    const path = known(spec.plain)
    return {
      ...base, paths: [path],
      read: (b, card) => { if (!blank(b[key])) card.set(path, String(b[key]).trim()) },
      write: get => ({ [key]: blank(get(path)) ? undefined : String(get(path)) }),
    }
  }
  if (spec.number) {
    const path = known(spec.number)
    return {
      ...base, paths: [path],
      read: (b, card) => { const n = num(b[key]); if (n != null) card.set(path, n) },
      write: get => ({ [key]: get(path) == null ? undefined : String(get(path)) }),
    }
  }
  if (spec.range) {
    const path = known(spec.range)
    const signs = ['plus', 'minus'].filter(s => field(`${path}_${s}`)).map(s => [s, `${path}_${s}`])
    const words = spec.words && known(spec.words)
    const wordsBack = words && spec.words_export
    return {
      ...base, paths: [path, ...signs.map(([, p]) => p), ...(wordsBack ? [words] : [])],
      read: (b, card) => {
        const r = parseRange(b[key])
        if (r.n != null) card.set(path, r.n)
        for (const [s, p] of signs) if (r[s]) card.set(p, true)
        if (words && r.words) card.set(words, [card.get(words), r.words].filter(Boolean).join(' '))
      },
      write: get => {
        const n = get(path)
        const sign = signs.find(([, p]) => get(p) === true)?.[0]
        const after = wordsBack && !blank(get(words)) ? String(get(words)) : ''
        const text = [n == null ? '' : `${n}${sign === 'plus' ? '+' : sign === 'minus' ? '-' : ''}`, after].filter(Boolean).join(' ')
        return { [key]: text || undefined }
      },
    }
  }
  throw new Error(`Bridgodex map: ${block}.${key} has no kind`)
}

const ENTRIES = Object.entries(BLOCKS).flatMap(([block, keys]) =>
  Object.entries(keys).map(([key, spec]) => entry(block, key, spec)))

const split = dotted => {
  const i = dotted.indexOf('.')
  return [dotted.slice(0, i), dotted.slice(i + 1)]
}
const at = (settings, dotted) => {
  const [block, key] = split(dotted)
  return settings?.[block]?.[key]
}

for (const a of ANY) known(a.path)
for (const n of NOTES) known(n.path)

/** A note's lines, as the import makes them from Bridgodex's boxes. */
function noteLines(note, settings) {
  return note.lines.flatMap(line => {
    const v = [line.key].flat().map(k => at(settings, k)).find(Boolean)
    if (!v || (line.unless_same_as && v === at(settings, line.unless_same_as))) return []
    return [`${line.label || ''}${suits(v)}`]
  })
}

// ─── Lead circles ──────────────────────────────────────────────────
// `honor_leads_AKx: 1` is the A from AKx, by position, under
// leads.<side>.honors.lead_choice_akx; `length_leads_Hxx` is with the
// lengths, and `honor_interior_seq_KT9x` (an interior sequence) with the
// honors.

const LEAD_BLOCKS = { leads_vs_suits: 'vs_suits', leads_vs_nt: 'vs_nt' }
const LEAD_PREFIXES = [
  { prefix: 'length_leads_', group: 'length' },
  { prefix: 'honor_leads_', group: 'honors' },
  { prefix: 'honor_interior_seq_', group: 'honors' },
]
// Holdings Bridgodex lists as interior sequences (KJTx, KT9x and QT9x vs
// suits; AQJx, AJTx, KT9x and QT9x vs NT).
const INTERIOR = new Set(['kjtx', 'kt9x', 'qt9x', 'aqjx', 'ajtx'])

function leadPath(side, key) {
  const match = LEAD_PREFIXES.find(p => key.startsWith(p.prefix))
  return match && `leads.${side}.${match.group}.lead_choice_${key.slice(match.prefix.length).toLowerCase()}`
}

function leadKey(path) {
  const m = path.match(/^leads\.(?:vs_suits|vs_nt)\.(length|honors)\.lead_choice_(.+)$/)
  if (!m) return null
  const holding = m[2].toLowerCase()
  const prefix = m[1] === 'length' ? 'length_leads_' : INTERIOR.has(holding) ? 'honor_interior_seq_' : 'honor_leads_'
  return prefix + holding.replace(/[^x]/g, c => c.toUpperCase())
}

/** The lead choices a card holds, by side: lower-case path → position. */
function leadChoices(cardData, side) {
  const out = new Map()
  for (const group of ['length', 'honors']) {
    for (const [k, v] of Object.entries(readPath(cardData, `leads.${side}.${group}`) || {})) {
      if (k.startsWith('lead_choice_') && v != null) out.set(`leads.${side}.${group}.${k}`.toLowerCase(), v)
    }
  }
  return out
}

// ─── Import ────────────────────────────────────────────────────────

function deriveName(settings) {
  const names = settings?.names?.names?.trim()
  return names || 'Imported Bridgodex card'
}

/** Convert a Bridgodex card into `{ name, description, card_data }`. */
export function importBridgeodexJson(input) {
  if (!input || typeof input !== 'object') {
    throw new Error('Bridgodex file is empty or not JSON')
  }
  const s = input.settings || input
  if (!s || typeof s !== 'object') {
    throw new Error('Bridgodex file is missing the settings block')
  }

  const values = new Map()
  for (const e of ENTRIES) e.read(s[e.block] || {}, values)
  // Bridgodex has no 2/1 box: its general approach names the system in
  // words, and "2/1" there is the ACBL card's Two Over One Game Forcing box.
  if (namesTwoOverOne(s.overview?.general_approach)) values.set('major_openings.two_over_one.game_force', true)
  for (const a of ANY) if (a.keys.some(k => on(at(s, k)))) values.set(a.path, true)
  for (const n of NOTES) {
    const lines = noteLines(n, s)
    if (lines.length) values.set(n.path, lines.join('\n'))
  }

  const card_data = {
    schema_version: '1.0',
    format: 'bridge_classroom',
    metadata: { name: deriveName(s), source: 'bridgeodex' },
  }
  for (const [path, v] of values) writePath(card_data, path, v)
  for (const [block, side] of Object.entries(LEAD_BLOCKS)) {
    for (const [key, v] of Object.entries(s[block] || {})) {
      const path = leadPath(side, key)
      const n = path && num(v)
      if (n != null) writePath(card_data, path, n)
    }
  }
  if (input.notes) writePath(card_data, 'notes.general', String(input.notes))
  if (s.names?.names) card_data.metadata.partner_names = String(s.names.names)
  card_data._bridgeodex_raw = s

  return { name: deriveName(s), description: 'Imported from Bridgodex.com', card_data }
}

// ─── Export ────────────────────────────────────────────────────────

/** The card's settings by canonical path, read through aliases. */
function settingsOf(cardData) {
  const values = new Map()
  const walk = (obj, prefix) => {
    for (const [k, v] of Object.entries(obj || {})) {
      const path = prefix ? `${prefix}.${k}` : k
      if (v && typeof v === 'object' && !Array.isArray(v)) walk(v, path)
      else if (field(path) && !blank(v)) values.set(canonical(path), v)
    }
  }
  const { metadata, _bbo_raw, _bridgeodex_raw, bba_passthrough, schema_version, format, ...rest } = cardData || {}
  walk(rest, '')
  const get = path => values.get(canonical(path))
  get.values = values
  return get
}

/**
 * Convert card_data to a Bridgodex card, `{ settings, notes }`, for
 * Bridgodex's import. A card imported from Bridgodex goes back with every
 * box it came with, changed only where its fields have changed.
 */
export function exportBridgodexJson(cardData) {
  const raw = cardData?._bridgeodex_raw || {}
  const before = Object.keys(raw).length ? importBridgeodexJson({ settings: raw }).card_data : {}
  const get = settingsOf(cardData)
  const was = settingsOf(before)
  const unchanged = paths => paths.every(p => get(p) === was(p))

  const out = Object.fromEntries(Object.entries(raw).map(([k, v]) =>
    [k, v && typeof v === 'object' && !Array.isArray(v) ? { ...v } : v]))
  const put = (block, values) => {
    for (const [k, v] of Object.entries(values)) {
      if (v === undefined) { if (out[block]) delete out[block][k] } else (out[block] ??= {})[k] = v
    }
  }

  for (const e of ENTRIES) {
    if (e.importOnly || unchanged(e.paths)) continue
    put(e.block, e.write(get))
  }

  // Lead circles: a choice as imported keeps its key and value; a changed
  // one is written afresh.
  for (const [block, side] of Object.entries(LEAD_BLOCKS)) {
    const now = leadChoices(cardData, side)
    const then = leadChoices(before, side)
    for (const key of Object.keys(out[block] || {})) {
      const path = leadPath(side, key)
      if (path && now.get(path) !== then.get(path)) delete out[block][key]
    }
    for (const [path, pos] of now) {
      if (pos === then.get(path)) continue
      const key = leadKey(path)
      if (key) put(block, { [key]: Number(pos) })
    }
  }

  // A field the boxes carry (Texas), set with none of them ticked.
  for (const a of ANY) {
    if (get(a.path) === true && !a.keys.some(k => on(at(out, k)))) {
      for (const k of a.export || []) { const [block, key] = split(k); put(block, { [key]: ON }) }
    }
  }

  // A note's lines its boxes would not give back go in its export_to box.
  const notePaths = new Set(NOTES.map(n => canonical(n.path)))
  const texts = new Set([...get.values].filter(([p, v]) => !notePaths.has(p) && typeof v === 'string').map(([, v]) => v.trim()))
  for (const n of NOTES) {
    if (!n.export_to || blank(get(n.path))) continue
    // A line the boxes give back, or one repeating a field of the card
    // ("Lebensohl: fast denies", as older imports wrote notes), is carried
    // already.
    const made = new Set(noteLines(n, out))
    const carried = l => made.has(l) || texts.has(l.trim()) || texts.has(l.slice(l.indexOf(': ') + 2).trim())
    const extra = String(get(n.path)).split('\n').filter(l => l.trim() && !carried(l))
    if (!extra.length) continue
    const [block, key] = split(n.export_to)
    put(block, { [key]: [out[block]?.[key], ...extra.map(shorthand)].filter(v => !blank(v)).join('\n') })
  }

  const names = cardData?.metadata?.partner_names
  if (names !== before.metadata?.partner_names) put('names', { names: blank(names) ? undefined : String(names) })

  for (const [k, v] of Object.entries(out)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length) delete out[k]
  }
  const notes = readPath(cardData, 'notes.general')
  return { settings: out, notes: blank(notes) ? '' : String(notes) }
}
