// Import and export of BBO's ACBL convention card, as the JSON the Better BBO
// Convention Card extension reads and writes (`source: "bbo-acbl"`; its
// docs/architecture.md):
//
//   { schema_version: "1.1", exported_at, source: "bbo-acbl",
//     cards: [ { cc_key, title, partner, owner, stock, default, style,
//                fields:      { "1NTMin1": "15", "majorOther1": "…", … },
//                conventions: { "1NStayman": "y", … },
//                leads:       { "ls-akx-a": "y", … } } ] }
//
// Both directions read one map, spec/formats/bbo-map.toml, which says what
// each entry does. The import keeps the BBO card in `card_data._bbo_raw`, and
// the export starts from it: slots and boxes the map does not cover go back
// unchanged, and a text slot keeps its words unless the fields it fills have
// changed. Ticks are worked out from the card each time.

import { field, BBO_MAP } from './spec.js'
import { readPath, writePath } from './paths.js'
import { normalizeSuitShorthand } from './suits.js'

const SCHEMA_VERSION = '1.1'
const SOURCE = 'bbo-acbl'

const known = path => {
  if (!field(path)) throw new Error(`BBO map: unknown field ${path}`)
  return path
}
const canonical = path => field(path)?.path ?? path

// ─── Values in and out ─────────────────────────────────────────────

const blank = v => v == null || String(v).trim() === ''
const on = v => v === 'y' || v === true || v === 'on' || v === 1

/** Text typed on BBO, with its suit shorthand as ♠♥♦♣. */
const suitText = v => (blank(v) ? null : normalizeSuitShorthand(String(v).trim()))
/** Card text for BBO, which writes suits as !S !H !D !C. */
const bboText = v => (blank(v) ? undefined : String(v)
  .replace(/♠/g, '!S').replace(/♥/g, '!H').replace(/♦/g, '!D').replace(/♣/g, '!C'))

/** "14+" → { n: 14, plus: true }; "17" → { n: 17 }; "" → { n: null }. */
function parseRange(v) {
  const m = blank(v) ? null : String(v).trim().match(/^([+-]?\d+)([+-]?)/)
  if (!m) return { n: null }
  return { n: parseInt(m[1], 10), plus: m[2] === '+', minus: m[2] === '-' }
}

// ─── The map, as entries ───────────────────────────────────────────
// Each entry covers some BBO slots and some card paths:
//   group   which BBO object its slots are in ('conventions' or 'fields')
//   keys    its slots
//   paths   the card fields it fills
//   read(slots)  → [[path, value], …] for the import
//   write(get)   → { key: text | undefined } for the export, `get` reading
//                  the card through aliases

function convention(key, spec) {
  const set = typeof spec === 'string'
    ? [[known(spec), true]]
    : Object.entries(spec.set).map(([p, v]) => [known(p), v])
  return {
    group: 'conventions', keys: [key], paths: set.map(([p]) => p),
    read: slots => (on(slots[key]) ? set : []),
    write: get => ({ [key]: set.every(([p, v]) => get(p) === v) ? 'y' : undefined }),
  }
}

function textField(key, spec) {
  if (typeof spec === 'string') spec = { text: spec }
  if (spec.range) {
    const path = known(spec.range)
    const signs = ['plus', 'minus'].filter(s => field(`${path}_${s}`)).map(s => [s, `${path}_${s}`])
    return {
      group: 'fields', keys: [key], paths: [path, ...signs.map(([, p]) => p)],
      read: slots => {
        const r = parseRange(slots[key])
        if (r.n == null) return []
        return [[path, r.n], ...signs.filter(([s]) => r[s]).map(([, p]) => [p, true])]
      },
      write: get => {
        const n = get(path)
        if (n == null || n === '') return { [key]: undefined }
        const sign = signs.find(([, p]) => get(p) === true)?.[0]
        return { [key]: `${n}${sign === 'plus' ? '+' : sign === 'minus' ? '-' : ''}` }
      },
    }
  }
  if (spec.plain) {
    const path = known(spec.plain)
    return {
      group: 'fields', keys: [key], paths: [path],
      read: slots => (blank(slots[key]) ? [] : [[path, String(slots[key]).trim()]]),
      write: get => ({ [key]: blank(get(path)) ? undefined : String(get(path)) }),
    }
  }
  const path = known(spec.text)
  const also = Object.entries(spec.also || {}).map(([p, v]) => [known(p), v])
  return {
    group: 'fields', keys: [key], paths: [path, ...also.map(([p]) => p)],
    read: slots => {
      const t = suitText(slots[key])
      return t ? [[path, t], ...also] : []
    },
    write: get => ({ [key]: bboText(get(path)) }),
  }
}

function joined({ path, keys, export: exported = true }) {
  known(path)
  return {
    group: 'fields', keys, paths: [path], importOnly: !exported,
    read: slots => {
      const lines = keys.map(k => suitText(slots[k])).filter(Boolean)
      return lines.length ? [[path, lines.join('\n')]] : []
    },
    write: get => {
      const lines = blank(get(path)) ? [] : String(get(path)).split('\n').filter(l => l.trim())
      const last = keys.length - 1
      return Object.fromEntries(keys.map((k, i) =>
        [k, bboText(i < last ? lines[i] : lines.slice(last).join('; '))]))
    },
  }
}

// The 2♣ box: BBO has DESCRIBE (2COther1–3) and RESPONSES/REBIDS (2COther4–6);
// the card has two lines for each. Each column fills from the top, and what
// does not fit (a 2nd or 3rd describe, a 3rd response) goes on the free 2nd
// DESCRIBE line.
const TC = 'two_level.two_clubs'
const TWO_CLUBS = {
  group: 'fields',
  keys: ['2COther1', '2COther2', '2COther3', '2COther4', '2COther5', '2COther6'],
  paths: ['description', 'notes', 'continuation_response', 'continuation_describe'].map(k => known(`${TC}.${k}`)),
  read: slots => {
    const describe = ['2COther1', '2COther2', '2COther3'].map(k => suitText(slots[k])).filter(Boolean)
    const respond = ['2COther4', '2COther5', '2COther6'].map(k => suitText(slots[k])).filter(Boolean)
    const spill = [describe[1], describe[2], respond[2]].filter(Boolean)
    return [
      [`${TC}.description`, describe[0]], [`${TC}.notes`, respond[0]],
      [`${TC}.continuation_response`, respond[1]],
      [`${TC}.continuation_describe`, spill.length ? spill.join('; ') : null],
    ].filter(([, v]) => v)
  },
  write: get => {
    const more = blank(get(`${TC}.continuation_describe`)) ? [] : String(get(`${TC}.continuation_describe`)).split('; ')
    return {
      '2COther1': bboText(get(`${TC}.description`)),
      '2COther2': bboText(more[0]),
      '2COther3': bboText(more.slice(1).join('; ')),
      '2COther4': bboText(get(`${TC}.notes`)),
      '2COther5': bboText(get(`${TC}.continuation_response`)),
      '2COther6': undefined,
    }
  },
}

const ENTRIES = [
  ...Object.entries(BBO_MAP.conventions).map(([k, s]) => convention(k, s)),
  ...Object.entries(BBO_MAP.fields).map(([k, s]) => textField(k, s)),
  ...(BBO_MAP.joined || []).map(joined),
  TWO_CLUBS,
]

// ─── Lead circles ──────────────────────────────────────────────────
// `ls-akx-a`: vs suits (ls; vs NT is ln), the holding AKx, the A led. The
// card keeps the led card's position in the holding, under
// leads.<side>.<length | honors>.lead_choice_<holding>. A small card is
// x1, x2… (the first x, the second…); a bare number is a position.

const SIDES = { ls: 'vs_suits', ln: 'vs_nt' }

function leadPath(key) {
  const m = key.match(/^(ls|ln)-([a-z0-9]+)-([a-z0-9]+)$/i)
  if (!m) return null
  const pattern = m[2].toLowerCase()
  const led = m[3].toLowerCase()
  let pos
  if (/^\d+$/.test(led)) pos = Number(led)
  else if (/^x\d+$/.test(led)) {
    const nth = Number(led.slice(1))
    let seen = 0
    pos = [...pattern].findIndex(c => c === 'x' && ++seen === nth) + 1
  } else pos = pattern.indexOf(led) + 1
  if (!pos || pos < 1) return null
  // The spec says which group a holding is in (Hxx is with the lengths);
  // a holding it lacks goes by its cards.
  const side = SIDES[m[1].toLowerCase()]
  const group = ['length', 'honors'].find(g => field(`leads.${side}.${g}.lead_choice_${pattern}`))
    ?? (/^x+$/.test(pattern) ? 'length' : 'honors')
  return [`leads.${side}.${group}.lead_choice_${pattern}`, pos]
}

function leadKey(path, pos) {
  const m = path.match(/^leads\.(vs_suits|vs_nt)\.(?:length|honors)\.lead_choice_(.+)$/)
  if (!m || !Number.isInteger(pos) || pos < 1) return null
  const pattern = m[2].toLowerCase()
  const c = pattern[pos - 1]
  const led = !c ? String(pos)
    : c !== 'x' ? c
    : `x${[...pattern.slice(0, pos)].filter(ch => ch === 'x').length}`
  return `${m[1] === 'vs_suits' ? 'ls' : 'ln'}-${pattern}-${led}`
}

/** The lead choices a card holds: lower-case path → position. */
function leadChoices(cardData) {
  const out = new Map()
  for (const side of Object.values(SIDES)) {
    for (const group of ['length', 'honors']) {
      for (const [k, v] of Object.entries(readPath(cardData, `leads.${side}.${group}`) || {})) {
        if (k.startsWith('lead_choice_') && v != null) out.set(`leads.${side}.${group}.${k}`.toLowerCase(), v)
      }
    }
  }
  return out
}

// ─── Import ────────────────────────────────────────────────────────

/** Detect a BBO export (vs a Bridgodex one). */
export function isBboCard(input) {
  if (!input || typeof input !== 'object') return false
  const src = String(input.source || '').toLowerCase()
  return src.includes('bbo') || Array.isArray(input.cards)
}

/** Convert a BBO ACBL card export into `{ name, description, card_data }`. */
export function importBboJson(input) {
  if (!input || typeof input !== 'object') {
    throw new Error('BBO file is empty or not JSON')
  }
  const card = Array.isArray(input.cards) ? input.cards[0] : input
  if (!card || typeof card !== 'object') {
    throw new Error('BBO file has no cards')
  }
  const slots = { fields: card.fields || {}, conventions: card.conventions || {}, leads: card.leads || {} }

  const name = (card.title || 'Imported BBO card').trim()
  const partnerNames = (slots.fields.names && String(slots.fields.names).trim()) || name

  const card_data = {
    schema_version: '1.0',
    format: 'bridge_classroom',
    metadata: { name, source: 'bbo', partner_names: partnerNames },
  }
  // Ticks, then lead circles, then text, as BBO lists them.
  for (const e of ENTRIES.filter(e => e.group === 'conventions')) {
    for (const [path, v] of e.read(slots.conventions)) writePath(card_data, path, v)
  }
  for (const [key, v] of Object.entries(slots.leads)) {
    const lead = on(v) && leadPath(key)
    if (lead) writePath(card_data, lead[0], lead[1])
  }
  for (const e of ENTRIES.filter(e => e.group === 'fields')) {
    for (const [path, v] of e.read(slots.fields)) writePath(card_data, path, v)
  }
  card_data._bbo_raw = card

  return { name, description: 'Imported from BBO', card_data }
}

// ─── Export ────────────────────────────────────────────────────────

/** The card's settings by canonical path, read through aliases. */
function settings(cardData) {
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
  return path => values.get(canonical(path))
}

/**
 * Convert card_data to BBO's ACBL card JSON, one card in the extension's
 * envelope. `name` is the card's title on BBO (default: the imported title,
 * else the card's own name).
 */
export function exportBboJson(cardData, { name, exportedAt } = {}) {
  const raw = cardData?._bbo_raw || {}
  const before = raw.fields || raw.conventions || raw.leads ? importBboJson({ cards: [raw] }).card_data : {}
  const get = settings(cardData)
  const was = settings(before)
  const unchanged = paths => paths.every(p => get(p) === was(p))

  const out = {
    fields: { ...(raw.fields || {}) },
    conventions: { ...(raw.conventions || {}) },
    leads: { ...(raw.leads || {}) },
  }
  const put = (group, slots) => {
    for (const [k, v] of Object.entries(slots)) {
      if (v === undefined) delete out[group][k]
      else out[group][k] = v
    }
  }
  for (const e of ENTRIES) {
    if (e.importOnly) continue
    // A text slot keeps its words while its fields are as imported.
    if (e.group === 'fields' && unchanged(e.paths)) continue
    put(e.group, e.write(get))
  }

  // Lead circles: a choice as imported keeps its key; a changed one is
  // written afresh.
  const now = leadChoices(cardData)
  const then = leadChoices(before)
  for (const [key, v] of Object.entries(out.leads)) {
    const lead = on(v) && leadPath(key)
    const path = lead && lead[0].toLowerCase()
    if (path && now.get(path) !== then.get(path)) delete out.leads[key]
  }
  for (const [path, pos] of now) {
    if (pos === then.get(path)) continue
    const key = leadKey(path, Number(pos))
    if (key) out.leads[key] = 'y'
  }

  const partnerNames = cardData?.metadata?.partner_names
  if (partnerNames !== before.metadata?.partner_names) put('fields', { names: blank(partnerNames) ? undefined : String(partnerNames) })

  const { fields, conventions, leads, ...meta } = raw
  return {
    schema_version: SCHEMA_VERSION,
    exported_at: exportedAt ?? new Date().toISOString(),
    source: SOURCE,
    cards: [{
      ...meta,
      title: name ?? raw.title ?? cardData?.metadata?.name ?? 'Convention card',
      style: meta.style || 'ACBL',
      ...out,
    }],
  }
}
