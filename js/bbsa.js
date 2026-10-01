// Import and export of BBA `.bbsa` convention files, in parallel with the
// Rust crate's (crates/bridge-card/src/bbsa.rs; DECISIONS.md, 19). Both read
// the same map (spec/formats/bbsa-map.toml) and layout, and golden files
// written by the crate (tests/golden/bbsa/) keep them in step: a change here
// must be a change there too.
//
// A `.bbsa` file is `Key = value` lines: a `System type` integer and on/off
// toggles, padded with `Not defined` lines. Keys the map does not cover are
// kept in the card's `bba_passthrough`, so an export reproduces them.

import { field, BBSA_MAP, BBSA_LAYOUT } from './spec.js'
import { writePath } from './paths.js'

const PADDING = 'Not defined'
const { implied: IMPLIED = {}, derived: DERIVED = [], ...KEYS } = BBSA_MAP

const canonical = path => {
  const f = field(path)
  if (!f) throw new Error(`.bbsa map: unknown field ${path}`)
  return f.path
}

/** How one key maps onto the card: { toggle } | { set } | { index, values }. */
function mappingOf(spec) {
  if (typeof spec === 'string') return { toggle: canonical(spec) }
  if (spec.set) return { set: Object.entries(spec.set).map(([p, v]) => [canonical(p), v]) }
  if (spec.index) return { index: canonical(spec.index), values: spec.values }
  throw new Error(`.bbsa map: expected a path, {set} or {index}`)
}
const MAPPINGS = new Map(Object.entries(KEYS).map(([key, spec]) => [key, mappingOf(spec)]))
const pairs = obj => Object.entries(obj || {}).map(([p, v]) => [canonical(p), v])
const DERIVED_RULES = DERIVED.map(d => ({ when: pairs(d.when), set: pairs(d.set), defaults: pairs(d.default) }))

/** Parse `.bbsa` text into [key, value] pairs, in file order. */
export function parseBbsa(text) {
  const entries = []
  String(text).split(/\r?\n/).forEach((raw, n) => {
    const line = raw.trim()
    if (!line) return
    const eq = line.lastIndexOf('=')
    if (eq < 0) throw new Error(`line ${n + 1}: expected \`Key = value\``)
    const value = line.slice(eq + 1).trim()
    if (!/^[+-]?\d+$/.test(value)) throw new Error(`line ${n + 1}: ${JSON.stringify(value)} is not an integer`)
    entries.push([line.slice(0, eq).trim(), Number(value)])
  })
  return entries
}

// A card being built: values by canonical path, plus what the export needs.
class Values {
  constructor() { this.values = new Map() }
  set(path, v) { this.values.set(canonical(path), v) }
  get(path) { return this.values.get(canonical(path)) }
  effective(path) {
    const p = canonical(path)
    return this.values.has(p) ? this.values.get(p) : field(p).default
  }
  isOn(path) { return this.effective(path) === true }
}

/**
 * Convert `.bbsa` text to Bridge Classroom's card_data, as the crate's
 * `bbsa::import` does. Returns { card_data, report: { mapped, passthrough, warnings } }.
 */
export function importBbsa(text, name = undefined) {
  const card = new Values()
  for (const [path, v] of Object.entries(IMPLIED)) card.set(path, v)
  const passthrough = {}
  const report = { mapped: 0, passthrough: [], warnings: [] }
  for (const [key, value] of parseBbsa(text)) {
    if (key === PADDING) continue
    const m = MAPPINGS.get(key)
    if (!m) {
      report.passthrough.push([key, value])
      passthrough[key] = value
      continue
    }
    report.mapped += 1
    if (m.toggle) {
      if (value !== 0 && value !== 1) report.warnings.push(`${key} = ${value}: expected 0 or 1`)
      card.set(m.toggle, value !== 0)
    } else if (m.set) {
      if (value === 0) continue
      for (const [path, v] of m.set) {
        const old = card.get(path)
        if (old !== undefined && old !== v) report.warnings.push(`${key} overrides ${path} = ${old}`)
        card.set(path, v)
      }
    } else {
      const v = Number.isInteger(value) && value >= 0 ? m.values[value] : undefined
      if (v === undefined) report.warnings.push(`${key} = ${value}: no such option`)
      else card.set(m.index, v)
    }
  }
  applyDerived(card)
  return { card_data: toCardData(card, passthrough, name), report }
}

// The first rule that holds decides each field; a `default` leaves a field
// the card's own keys set alone, so a .bbsa key beats the derived value.
function applyDerived(card) {
  const done = new Set()
  for (const d of DERIVED_RULES) {
    const holds = d.when.every(([path, v]) => (card.effective(path) ?? false) === v)
    if (!holds) continue
    for (const [path, v] of d.set) {
      if (!done.has(path)) { card.set(path, v); done.add(path) }
    }
    for (const [path, v] of d.defaults) {
      if (!done.has(path)) {
        if (card.get(path) === undefined) card.set(path, v)
        done.add(path)
      }
    }
  }
}

function toCardData(card, passthrough, name) {
  const out = { schema_version: '1.0', format: 'bridge_classroom', metadata: name ? { name } : {} }
  for (const [path, v] of [...card.values].sort(([a], [b]) => (a < b ? -1 : 1))) writePath(out, path, v)
  if (Object.keys(passthrough).length) out.bba_passthrough = Object.fromEntries(Object.entries(passthrough).sort())
  return out
}

// card_data → the values the export reads, through aliases.
function fromCardData(cardData) {
  const card = new Values()
  const walk = (obj, prefix) => {
    for (const [k, v] of Object.entries(obj || {})) {
      const path = prefix ? `${prefix}.${k}` : k
      if (v && typeof v === 'object' && !Array.isArray(v)) walk(v, path)
      else if (field(path)) card.set(path, v)
    }
  }
  const { metadata, bba_passthrough, schema_version, format, ...settings } = cardData || {}
  walk(settings, '')
  return { card, passthrough: bba_passthrough || {} }
}

/**
 * Convert card_data to `.bbsa` text in BBA's current layout (CRLF), as the
 * crate's `bbsa::export` does. Returns { text, report: { dropped } }: the
 * passthrough keys not in the current layout, which are not written.
 */
export function exportBbsa(cardData) {
  const { card, passthrough } = fromCardData(cardData)
  let text = ''
  for (const key of BBSA_LAYOUT) {
    let value
    if (key === PADDING) value = 0
    else if (MAPPINGS.has(key)) value = exportValue(card, MAPPINGS.get(key))
    else value = passthrough[key] ?? 0
    text += `${key} = ${value}\r\n`
  }
  const layout = new Set(BBSA_LAYOUT)
  return { text, report: { dropped: Object.keys(passthrough).filter(k => !layout.has(k)).sort() } }
}

function exportValue(card, m) {
  if (m.toggle) return card.isOn(m.toggle) ? 1 : 0
  if (m.set) return m.set.every(([p, v]) => card.get(p) === v) ? 1 : 0
  const v = card.effective(m.index)
  const i = typeof v === 'string' ? m.values.indexOf(v) : -1
  return i < 0 ? 0 : i
}
