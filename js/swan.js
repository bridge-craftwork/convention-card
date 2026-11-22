// Import and export of BridgeWinners cards in their "Swan" JSON: the file
// BridgeWinners' card editor exports, and reads back with "Import from
// Swan" (with its "New ACBL CC format" box unticked: ticked, the import
// fails with a server error, even on BridgeWinners' own file).
//
//   { Convention_Card: { General: { forcing_openings: { one_club: true, … },
//                                   name: { names: "Pat and Sam", … } },
//                        Notrump_opening: { One_notrump_opening: { … } },
//                        Leads: { vs_suits: { ace_king: { ace: true, … } } },
//                        … } }
//
// It is the ACBL Classic card, box for box: a tick is true or false, and
// every other box a string ("" when empty). spec/formats/swan-map.toml says
// what each box does, for both directions. The import keeps the file in
// `card_data._swan_raw`, and the export starts from it: boxes the map does
// not cover go back unchanged, and a box keeps its value unless the fields
// it fills have changed. The export writes every box, as BridgeWinners'
// own export does, blank where the card has nothing.

import { field, SWAN_MAP } from './spec.js'
import { readPath, writePath } from './paths.js'
import { ledCards, ledValue, sameLead } from './leads.js'
import { upgradeCardData, CARD_SCHEMA_VERSION } from './migrate.js'
import { mapEntries, cardSettings } from './boxMap.js'

const { lead_holdings: LEAD_HOLDINGS = {}, any: ANY = [], left_out: LEFT_OUT = {}, ...SECTIONS } = SWAN_MAP

const isOn = v => v === true || v === 'true'
const ENTRIES = mapEntries(SECTIONS, { name: 'Swan', isOn, ON: true })

for (const a of ANY) if (!field(a.path)) throw new Error(`Swan map: unknown field ${a.path}`)

const LEAD_SIDES = { vs_suits: 'vs_suits', vs_notrump: 'vs_nt' }
const LEADS = Object.entries(LEAD_HOLDINGS).flatMap(([swanSide, holdings]) =>
  Object.entries(holdings).map(([key, spec]) => {
    const side = LEAD_SIDES[swanSide]
    const paths = [spec.holding].flat().map(h =>
      `leads.${side}.${/^x+$/.test(h) ? 'length' : 'honors'}.lead_choice_${h}`)
    for (const p of paths) if (!field(p)) throw new Error(`Swan map: unknown field ${p}`)
    return { key: `${swanSide}.${key}`, cards: spec.cards, paths }
  }))

// ─── The file's shape ──────────────────────────────────────────────

const split = dotted => {
  const i = dotted.indexOf('.')
  return [dotted.slice(0, i), dotted.slice(i + 1)]
}

/** Every box of the format, `Section.rest.of.path` → "tick" or "text". */
const BOXES = new Map()
for (const [section, keys] of Object.entries(SECTIONS)) {
  for (const [key, spec] of Object.entries(keys)) {
    const tick = typeof spec === 'string' || spec.set || spec.filled
    BOXES.set(`${section}.${key}`, tick ? 'tick' : 'text')
  }
}
for (const l of LEADS) for (const c of l.cards) BOXES.set(`Leads.${l.key}.${c}`, 'tick')
for (const [box, kind] of Object.entries(LEFT_OUT)) BOXES.set(box, kind)

const emptyOf = box => (BOXES.get(box) === 'tick' ? false : '')

/** A Swan card's boxes, flat: `{ Section: { "rest.of.path": value } }`. */
function flatten(card) {
  const out = {}
  const walk = (obj, section, prefix) => {
    for (const [k, v] of Object.entries(obj || {})) {
      const path = prefix ? `${prefix}.${k}` : k
      if (v && typeof v === 'object' && !Array.isArray(v)) walk(v, section, path)
      else (out[section] ??= {})[path] = v
    }
  }
  for (const [section, v] of Object.entries(card || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v)) walk(v, section, '')
    else (out[section] ??= {})[''] = v
  }
  return out
}

function unflatten(flat) {
  const out = {}
  for (const [section, boxes] of Object.entries(flat)) {
    for (const [path, v] of Object.entries(boxes)) {
      if (path === '') { out[section] = v; continue }
      let at = (out[section] ??= {})
      const parts = path.split('.')
      for (const p of parts.slice(0, -1)) at = (at[p] ??= {})
      at[parts.at(-1)] = v
    }
  }
  return out
}

/** A blank Swan card: every box, unticked or empty, as BridgeWinners writes one. */
export function blankSwanCard() {
  const flat = {}
  for (const box of BOXES.keys()) {
    const [section, path] = split(box)
    ;(flat[section] ??= {})[path] = emptyOf(box)
  }
  return { Convention_Card: unflatten(flat) }
}

/** Whether `input` looks like a Swan card. */
export function isSwanCard(input) {
  const card = input?.Convention_Card
  return !!card && typeof card === 'object' && Object.keys(card).some(s => s in SECTIONS || s === 'Leads')
}

// ─── Import ────────────────────────────────────────────────────────

const swanNames = flat => String(flat.General?.['name.names'] ?? '').trim()

/** Convert a Swan card into `{ name, description, card_data }`. */
export function importSwanJson(input) {
  if (!input || typeof input !== 'object') throw new Error('Swan file is empty or not JSON')
  const card = input.Convention_Card
  if (!card || typeof card !== 'object') throw new Error('Swan file is missing its Convention_Card')
  const flat = flatten(card)

  const values = new Map()
  for (const e of ENTRIES) e.read(flat[e.block] || {}, values)
  const at = box => { const [s, p] = split(box); return flat[s]?.[p] }
  for (const a of ANY) if (a.keys.some(k => isOn(at(k)))) values.set(a.path, true)

  const names = swanNames(flat)
  const name = names || 'Imported BridgeWinners card'
  const card_data = {
    schema_version: CARD_SCHEMA_VERSION,
    format: 'bridge_classroom',
    metadata: { name, source: 'bridgewinners' },
  }
  for (const [path, v] of values) writePath(card_data, path, v)
  for (const l of LEADS) {
    const choice = ledValue(l.cards.map((c, i) => (isOn(flat.Leads?.[`${l.key}.${c}`]) ? i + 1 : 0)))
    if (choice != null) writePath(card_data, l.paths[0], choice)
  }
  if (names) card_data.metadata.partner_names = names
  card_data._swan_raw = card

  return { name, description: 'Imported from BridgeWinners', card_data }
}

// ─── Export ────────────────────────────────────────────────────────

/** A holding's lead choice on a card: the first of its paths that is set. */
const leadOf = (cardData, l) => l.paths.map(p => readPath(cardData, p)).find(v => ledCards(v).length) ?? null

/**
 * Convert card_data to a Swan card, `{ Convention_Card }`, for BridgeWinners'
 * "Import from Swan". A card imported from a Swan file goes back with every
 * box it came with, changed only where its fields have changed.
 */
export function exportSwanJson(cardData) {
  cardData = upgradeCardData(cardData)
  const raw = cardData?._swan_raw || {}
  const before = Object.keys(raw).length ? importSwanJson({ Convention_Card: raw }).card_data : {}
  const get = cardSettings(cardData)
  const was = cardSettings(before)
  const unchanged = paths => paths.every(p => get(p) === was(p))

  // Every box, blank; then the file as imported
  const out = flatten(blankSwanCard().Convention_Card)
  for (const [section, boxes] of Object.entries(flatten(raw))) Object.assign(out[section] ??= {}, boxes)
  const put = (section, values) => {
    for (const [k, v] of Object.entries(values)) (out[section] ??= {})[k] = v === undefined ? emptyOf(`${section}.${k}`) : v
  }

  for (const e of ENTRIES) {
    if (e.importOnly || unchanged(e.paths)) continue
    put(e.block, e.write(get))
  }

  // The lead grid: a holding as imported keeps its ticks; a changed one is
  // ticked afresh.
  for (const l of LEADS) {
    const now = leadOf(cardData, l)
    if (sameLead(now, leadOf(before, l))) continue
    const led = new Set(ledCards(now))
    put('Leads', Object.fromEntries(l.cards.map((c, i) => [`${l.key}.${c}`, led.has(i + 1)])))
  }

  // A field the boxes carry, set with none of them ticked
  for (const a of ANY) {
    const ticked = a.keys.some(k => { const [s, p] = split(k); return isOn(out[s]?.[p]) })
    if (get(a.path) === true && !ticked) for (const k of a.export || []) { const [s, p] = split(k); put(s, { [p]: true }) }
  }

  // BridgeWinners shows the names as the card's title: a card with none
  // goes by its own name
  const namesOf = data => String(data?.metadata?.partner_names || data?.metadata?.name || '').trim()
  if (namesOf(cardData) !== namesOf(before)) put('General', { 'name.names': namesOf(cardData) })

  return { Convention_Card: unflatten(out) }
}
