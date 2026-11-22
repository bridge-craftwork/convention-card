// The entries of a box map: a format that keeps a card as named boxes in
// blocks (Bridgodex's `settings.majors.drury_2c`, BridgeWinners' Swan
// `Convention_Card.General.forcing_openings.one_club`), described by a TOML
// map in spec/formats/ (bridgodex-map.toml, swan-map.toml). Each entry
// covers some boxes of one block and some card fields, and reads and writes
// them both ways. The formats differ in what a tick is ("on", or true).

import { field } from './spec.js'
import { normalizeSuitShorthand } from './suits.js'
import { upgradeCardData } from './migrate.js'

export const blank = v => v == null || String(v).trim() === ''

/** Text typed in another app, its suit shorthand ("!C", "2C") as ♠♥♦♣. */
export const suits = v => normalizeSuitShorthand(String(v))

/** Card text for an app that writes suits as !S !H !D !C. */
export const shorthand = v => (blank(v) ? undefined : String(v)
  .replace(/♠/g, '!S').replace(/♥/g, '!H').replace(/♦/g, '!D').replace(/♣/g, '!C'))

export function num(value) {
  if (value == null || String(value).trim() === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

/**
 * A range end: "14+" → { n: 14, plus }, "17 Vul" → { n: 17, words: "Vul" }.
 * The + or - must end the number ("17-ish" is words).
 */
export function parseRange(value) {
  if (value == null || value === '') return { n: null }
  const s = String(value).trim()
  const m = s.match(/^([+\-]?\d+)([+-]?)(?=\s|$)\s*(.*)$/)
  if (!m) return { n: null, words: s }
  return { n: parseInt(m[1], 10), plus: m[2] === '+', minus: m[2] === '-', words: m[3].trim() || null }
}

/**
 * The entries of a map's blocks: `{ block: { key: spec } }` → a list of
 *   { block, keys, paths, read(b, card), write(get), importOnly }
 * where `read` writes the import into `card` (a Map of path → value) from
 * the block's boxes `b`, and `write` gives `{ key: value | undefined }`
 * for the export (undefined: the box left empty).
 *
 * `format.name` names the map in errors; `format.isOn(v)` says whether a
 * box is ticked; `format.ON` is what a tick writes.
 */
export function mapEntries(blocks, { name, isOn, ON }) {
  const known = path => {
    if (!field(path)) throw new Error(`${name} map: unknown field ${path}`)
    return path
  }
  // A `when_any` value may list several: any of them ticks the box
  const holds = (want, got) => (Array.isArray(want) ? want.includes(got) : want === got)

  function entry(block, key, spec) {
    if (typeof spec === 'string') spec = { set: { [spec]: true } }
    const base = { block, keys: [key], importOnly: spec.export === false }

    if (spec.set) {
      const set = Object.entries(spec.set).map(([p, v]) => [known(p), v])
      const whenAny = spec.when_any && Object.entries(spec.when_any).map(([p, v]) => [known(p), v])
      const ticked = whenAny
        ? get => whenAny.some(([p, v]) => holds(v, get(p)))
        : get => set.every(([p, v]) => get(p) === v)
      return {
        ...base, paths: [...new Set([...set, ...(whenAny || [])].map(([p]) => p))],
        read: (b, card) => { if (isOn(b[key])) for (const [p, v] of set) card.set(p, v) },
        write: get => ({ [key]: ticked(get) ? ON : undefined }),
      }
    }
    if (spec.filled) {
      const path = known(spec.filled)
      return {
        ...base, paths: [path],
        read: () => {},
        write: get => ({ [key]: blank(get(path)) ? undefined : ON }),
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
    throw new Error(`${name} map: ${block}.${key} has no kind`)
  }

  return Object.entries(blocks).flatMap(([block, keys]) =>
    Object.entries(keys).map(([key, spec]) => entry(block, key, spec)))
}

/**
 * A card's settings by canonical path, read through aliases: `get(path)`,
 * with `get.values` the Map itself. The card's metadata and the data kept
 * for other apps (keys starting `_`, and `bba_passthrough`) are not settings.
 */
export function cardSettings(cardData) {
  const canonical = path => field(path)?.path ?? path
  const values = new Map()
  const walk = (obj, prefix) => {
    for (const [k, v] of Object.entries(obj || {})) {
      const path = prefix ? `${prefix}.${k}` : k
      if (v && typeof v === 'object' && !Array.isArray(v)) walk(v, path)
      else if (field(path) && !blank(v)) values.set(canonical(path), v)
    }
  }
  const { metadata, bba_passthrough, schema_version, format, ...rest } = upgradeCardData(cardData || {})
  walk(Object.fromEntries(Object.entries(rest).filter(([k]) => !k.startsWith('_'))), '')
  const get = path => values.get(canonical(path))
  get.values = values
  return get
}
