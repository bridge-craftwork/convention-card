// Card schema 3 (bridge-common-conventions' docs/CONTRACT.md, section 8), and
// the working form the library still uses.
//
// A schema 3 card holds `conventions`, keyed by ID, and `settings`:
//
//   { "schema_version": "3.0",
//     "conventions": { "bidding_conventions/stayman": { "forcing": true } },
//     "settings": { "notrump": { "one_nt": { "range_min": 15 } } } }
//
// An entry means the card plays the convention, unless it says
// `"play": false`. The library, the editor and the format maps still read a
// card by schema 2's dotted paths (`notrump.stayman.play`), so in memory a
// card stays in that shape: the working form. This module converts between
// the two, by the pack's record of the move (migrations/2-to-3.toml):
//
//   toSchema3(working)    what a card means, as schema 3; what is written
//   fromSchema3(card)     a schema 3 card in the working form
//   normalise(working)    fromSchema3(toSchema3(working))
//
// toSchema3 follows the bridge-card crate's `Pack::upgrade_to_3` rule for
// rule, and js/__tests__/schema3.test.js holds the two to the same cards:
//
// - A convention's switch becomes its entry. With the switch unset, the entry
//   is played when the card lists the convention or holds a treatment of it
//   that is on or filled in (a card with no box for Stayman still shows
//   Puppet); with nothing filled in there is no entry.
// - A setting that named a convention (the defence to 1NT) becomes that
//   convention's entry, with `for` when it fills only some parts. The card's
//   own wording is kept: as the entry's `text`, or as the setting when it
//   names no convention.
// - A tick beats a note. A convention only listed, or only inferred from its
//   treatments, does not take a function from one the card ticked or named:
//   it stays listed, or keeps its treatments with `play: false`.

import PACK_DOC from '../spec/pack.json' with { type: 'json' }
import { addressMaps } from './pack.js'

/** The version a stored card records. */
export const STORED_SCHEMA_VERSION = '3.0'

const isObject = v => v != null && typeof v === 'object' && !Array.isArray(v)
const clone = v => (v === undefined ? v : JSON.parse(JSON.stringify(v)))
const fold = s => s.trim().replace(/[ -]/g, '_').replace(/[A-Z]/g, c => c.toLowerCase())
const sortedEntries = o => Object.keys(o).sort().map(k => [k, o[k]])
const TOP = new Set(['format', 'metadata', 'bba_passthrough', 'conventions_list'])
const keptOnTop = k => TOP.has(k) || k.startsWith('_')

function writeLeaf(root, path, value) {
  const parts = path.split('.')
  let cur = root
  for (const p of parts.slice(0, -1)) {
    if (!isObject(cur[p])) cur[p] = {}
    cur = cur[p]
  }
  cur[parts[parts.length - 1]] = value
}

/** Every leaf under `value`, keys in order; a key starting `_` is a leaf whatever it holds. */
function flatten(prefix, value, out) {
  if (!isObject(value)) return void out.push([prefix, value])
  for (const [k, v] of sortedEntries(value)) {
    if (k.startsWith('_')) out.push([`${prefix}.${k}`, v])
    else flatten(`${prefix}.${k}`, v, out)
  }
}

/** A treatment that is on or filled in. */
const isFilled = v =>
  typeof v === 'boolean' ? v : typeof v === 'string' ? v.trim() !== '' : Array.isArray(v) ? v.length > 0 : v != null

// ---- the pack's record of the move, indexed once ----

function index(pack) {
  const mig = pack.migrations['2-to-3']
  const targets = new Map()
  const placeOf = new Set()
  for (const [path, id] of Object.entries(mig.convention || {})) targets.set(path, { kind: 'switch', id })
  for (const [path, address] of Object.entries(mig.treatment || {})) {
    const [id, t] = address.split(':')
    targets.set(path, { kind: 'treatment', id, t })
  }
  for (const place of mig.place || []) {
    for (const [path, t] of Object.entries(place.switches)) {
      placeOf.add(`${place.convention}:${t}`)
      targets.set(path, { kind: 'place', id: place.convention, t })
    }
  }
  for (const f of mig.function || []) {
    for (const [part, path] of Object.entries(f.settings)) targets.set(path, { kind: 'function', f: f.function, part })
  }
  for (const [old, address] of Object.entries(mig.alias || {})) {
    if (address.includes(':')) {
      const [id, t] = address.split(':')
      targets.set(old, { kind: placeOf.has(address) ? 'place' : 'treatment', id, t })
    } else if (address.includes('/')) {
      targets.set(old, { kind: 'switch', id: address })
    } else {
      const [f, part = ''] = address.split('.')
      if (pack.functions[f]) targets.set(old, { kind: 'function', f, part })
    }
  }
  // function → [[id, parts]], an implementer with no parts filling them all
  const implementers = new Map()
  const claim = (id, name, whole) => {
    const [f, part] = name.split('.')
    if (!implementers.has(f)) implementers.set(f, new Map())
    const byId = implementers.get(f)
    if (!byId.has(id)) byId.set(id, part ? [part] : [])
    else if (part && byId.get(id).length && !whole.has(`${f} ${id}`)) byId.get(id).push(part)
    else byId.set(id, [])
    if (!part) whole.add(`${f} ${id}`)
  }
  const whole = new Set()
  for (const [id, def] of sortedEntries(pack.conventions)) {
    for (const name of [def.implements ?? []].flat()) claim(id, name, whole)
    // A treatment may say what its convention fills while it is on.
    for (const [, attrs] of sortedEntries(def.treatments || {})) {
      for (const name of [attrs.implements ?? []].flat()) claim(id, name, whole)
    }
  }
  // The spellings of a function setting's options, folded.
  const words = new Map()
  for (const [f, fn] of Object.entries(pack.functions)) {
    for (const [part, was] of Object.entries(fn.was || {})) {
      const m = new Map((was.options || []).map(o => [fold(o), o]))
      for (const [k, v] of Object.entries(was.value_aliases || {})) m.set(fold(k), v)
      words.set(`${f}.${part}`, m)
    }
  }
  return { mig, targets, implementers, words, back: addressMaps(pack).path }
}

let INDEX = null
const indexOf = pack => (pack === PACK_DOC ? (INDEX ??= index(pack)) : index(pack))

function contends(ix, id, others) {
  for (const byId of ix.implementers.values()) {
    const mine = byId.get(id)
    if (!mine) continue
    for (const o of others) {
      const theirs = o !== id && byId.get(o)
      if (theirs && (!mine.length || !theirs.length || mine.some(p => theirs.includes(p)))) return true
    }
  }
  return false
}
const implementsAFunction = (ix, id) => [...ix.implementers.values()].some(byId => byId.has(id))

// ---- working form → schema 3 ----

/**
 * A working-form card (schema 2 paths) as schema 3. `data` is bare
 * card_data, already at schema 2 (js/migrate.js brings an older one there).
 */
export function toSchema3(data, pack = PACK_DOC) {
  const ix = indexOf(pack)
  const { mig } = ix
  const top = {}
  const settings = {}
  const entries = new Map()
  const entry = id => {
    if (!entries.has(id)) entries.set(id, { play: null, treatments: {}, places: {}, extra: {}, listed: false })
    return entries.get(id)
  }
  const chosen = new Map() // "function.part" → word
  const wording = new Map() // "function.part" → the card's own text for it
  const leaves = []
  const listedFn = []
  let listedRest = []
  const list = (id, a) => {
    const e = entry(id)
    e.listed = true
    for (const [k, v] of Object.entries(a)) if (k !== 'id') e.extra[k] = v
  }

  for (const [key, value] of sortedEntries(data || {})) {
    if (key === 'schema_version') continue
    if (key === 'other_agreements') {
      for (const a of Array.isArray(value) ? value : []) {
        const id = isObject(a) && typeof a.id === 'string' ? a.id : null
        if (!id) listedRest.push(a)
        else if (implementsAFunction(ix, id)) listedFn.push([id, a])
        else list(id, a)
      }
    } else if (keptOnTop(key)) top[key] = clone(value)
    else flatten(key, value, leaves)
  }

  for (const [path, value] of leaves) {
    const t = ix.targets.get(path)
    if (value === null || !t) writeLeaf(settings, path, clone(value))
    else if (t.kind === 'switch') {
      const e = entry(t.id)
      if (e.play === null) e.play = typeof value === 'boolean' ? value : null
    } else if (t.kind === 'treatment') {
      const e = entry(t.id)
      if (!(t.t in e.treatments)) e.treatments[t.t] = clone(value)
    } else if (t.kind === 'place') {
      const e = entry(t.id)
      if (typeof value === 'boolean' && !(t.t in e.places)) e.places[t.t] = value
    } else if (typeof value !== 'string') {
      writeLeaf(settings, path, clone(value))
    } else {
      const key = `${t.f}.${t.part}`
      const word = ix.words.get(key)?.get(fold(value)) ?? value
      const namesOne = Object.hasOwn(pack.functions[t.f]?.option || {}, word)
      if (!namesOne) writeLeaf(settings, path, value)
      else if (value !== word && !wording.has(key)) wording.set(key, value)
      if (!chosen.has(key)) chosen.set(key, word)
    }
  }

  // A setting's value becomes its convention's entry.
  for (const m of mig.function || []) {
    const allParts = pack.functions[m.function]?.parts || []
    const fills = new Map()
    const fill = (id, part) => fills.set(id, [...(fills.get(id) || []), part])
    for (const part of Object.keys(m.settings).sort()) {
      const id = m.options?.[chosen.get(`${m.function}.${part}`)]
      if (!id) continue
      fill(id, part)
      // The wording goes on the entry; a second part worded differently
      // ("Strong - Suction", "Weak - Suction") keeps its own as the setting.
      const text = wording.get(`${m.function}.${part}`)
      if (text === undefined) continue
      const e = entry(id)
      if (!('text' in e.extra)) e.extra.text = text
      else if (e.extra.text !== text) writeLeaf(settings, m.settings[part], text)
    }
    for (const [sw, part] of sortedEntries(m.unless_chosen || {})) {
      const id = mig.convention?.[sw]
      if (!id) continue
      const on = entries.get(id)?.play === true
      const word = chosen.get(`${m.function}.${part}`)
      if (on && (word === undefined || word === 'other')) fill(id, part)
      // Another defence, or `natural`, was chosen: the switch did nothing.
      else if (on && !fills.has(id)) entries.delete(id)
    }
    for (const [id, parts] of fills) {
      const own = [...new Set(parts)].sort()
      // `for` narrows what the convention can fill: every part of the
      // function, or the ones its definition names.
      const named = ix.implementers.get(m.function)?.get(id) || []
      const canFill = named.length ? named : allParts
      const e = entry(id)
      e.play = true
      if (canFill.length && canFill.some(p => !own.includes(p))) e.extra.for = own.map(p => `${m.function}.${p}`)
    }
  }

  // An agreement the card only lists plays its convention, unless the card
  // chose something else for the same function. Then it stays listed.
  const tickedNow = [...entries].filter(([, e]) => e.play === true).map(([id]) => id)
  for (const [id, a] of listedFn) {
    const settingFilled = [...ix.implementers].some(
      ([f, byId]) => byId.has(id) && [...chosen.keys()].some(k => k.split('.')[0] === f)
    )
    if (settingFilled || contends(ix, id, tickedNow)) listedRest.push(a)
    else list(id, a)
  }
  if (listedRest.length) top.other_agreements = clone(listedRest)

  // A tick beats an inference.
  const ticked = [...entries]
    .filter(([, e]) => e.play === true || Object.values(e.places).some(Boolean))
    .map(([id]) => id)
  const conventions = {}
  for (const [id, e] of [...entries].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    const filled = Object.values(e.treatments).some(isFilled)
    const places = Object.values(e.places)
    let play
    if (!places.length) {
      if (e.play === null && !e.listed && filled && contends(ix, id, ticked)) play = false
      else if (e.play !== null) play = e.play
      else if (e.listed || filled) play = true
      else continue
    } else if (places.some(Boolean)) play = true
    else if (places.some(on => !on) || filled) play = false
    else continue
    const out = {}
    if (!play) out.play = false
    if (places.length) {
      // Every place is written, so none falls back on a default.
      for (const p of mig.place || []) {
        if (p.convention === id) for (const t of Object.values(p.switches)) out[t] = e.places[t] ?? false
      }
    }
    Object.assign(out, e.treatments, e.extra)
    conventions[id] = out
  }
  return { schema_version: STORED_SCHEMA_VERSION, ...top, conventions, settings }
}

// ---- schema 3 → working form ----

/**
 * A schema 3 card in the working form: schema 2's paths, marked "2.0". An
 * entry the working form has no switch for (a skill, a convention schema 2
 * only listed) becomes an `other_agreements` item, as does an entry's own
 * note (`text`, `from`).
 */
export function fromSchema3(card, pack = PACK_DOC) {
  const ix = indexOf(pack)
  const { mig, back } = ix
  const out = { schema_version: '2.0' }
  const listed = []
  for (const [k, v] of Object.entries(card)) {
    if (k === 'other_agreements') listed.push(...clone(Array.isArray(v) ? v : []))
    else if (keptOnTop(k)) out[k] = clone(v)
  }
  for (const [section, v] of Object.entries(card.settings || {})) out[section] = clone(v)
  const write = (path, value) => writeLeaf(out, path, clone(value))
  const set = path => {
    const parts = path.split('.')
    let cur = out
    for (const p of parts) cur = isObject(cur) ? cur[p] : undefined
    return cur !== undefined
  }

  const placeSwitches = new Map((mig.place || []).map(p => [p.convention, p.switches]))
  const optionWord = new Map() // id → [function, word]
  for (const [f, fn] of Object.entries(pack.functions)) {
    for (const [word, id] of Object.entries(fn.option || {})) optionWord.set(id, [f, word])
  }

  for (const [id, e] of sortedEntries(card.conventions || {})) {
    if (!isObject(e)) continue
    const played = e.play !== false
    const treatments = pack.conventions[id]?.treatments || {}
    const places = placeSwitches.get(id)
    const extra = {}
    for (const [k, v] of Object.entries(e)) {
      if (k === 'play' || k === 'for') continue
      const path = back.get(`${id}:${k}`)
      if (k in treatments && path) write(path, v)
      else extra[k] = v
    }
    const option = optionWord.get(id)
    const fromANote = 'from' in extra
    let known = false
    if (places) {
      known = true
    } else if (option && played && !fromANote) {
      // The setting that named it, in the card's own wording where it kept it.
      const [f, word] = option
      const fn = pack.functions[f]
      const named = ix.implementers.get(f)?.get(id) || []
      const parts = Array.isArray(e.for)
        ? e.for.filter(a => a.split('.')[0] === f).map(a => a.split('.')[1])
        : named.length ? named : fn.parts || []
      const text = typeof extra.text === 'string' && ix.words.get(`${f}.${parts[0]}`)?.get(fold(extra.text)) === word ? extra.text : null
      for (const part of parts) {
        const path = fn.was?.[part]?.setting
        if (path && !set(path)) {
          write(path, text ?? word)
          known = true
        }
      }
      if (known && text) delete extra.text
    }
    const sw = back.get(id)
    if (!known && sw && !places) {
      // A convention the card's own choice displaced stays a note.
      if (!(option && played)) {
        write(sw, played)
        known = true
      }
    }
    if (Object.keys(extra).length || (!known && played)) listed.push({ id, ...clone(extra) })
  }
  if (listed.length) out.other_agreements = listed
  return out
}

function readLiteral(obj, path) {
  let cur = obj
  for (const p of path.split('.')) cur = isObject(cur) ? cur[p] : undefined
  return cur
}

function removeLiteral(obj, path) {
  const parts = path.split('.')
  const chain = [obj]
  for (const p of parts.slice(0, -1)) {
    const next = chain[chain.length - 1][p]
    if (!isObject(next)) return
    chain.push(next)
  }
  delete chain[chain.length - 1][parts[parts.length - 1]]
  for (let i = chain.length - 1; i > 0; i--) {
    if (Object.keys(chain[i]).length) break
    delete chain[i - 1][parts[i - 1]]
  }
}

/**
 * A working-form card as it reads back from schema 3: what it means, in
 * schema 2's paths. A field the card holds under an older spelling
 * (`other_conventions.gerber.play` for `slam.gerber.play`) stays under it:
 * the format maps and the editor still ask for some fields by those.
 */
export function normalise(data, pack = PACK_DOC) {
  const ix = indexOf(pack)
  const out = fromSchema3(toSchema3(data, pack), pack)
  const leaves = []
  for (const [key, value] of sortedEntries(data || {})) {
    if (key !== 'schema_version' && key !== 'other_agreements' && !keptOnTop(key)) flatten(key, value, leaves)
  }
  for (const [path] of leaves) {
    const t = ix.targets.get(path)
    if (!t) continue
    const address = t.kind === 'switch' ? t.id : t.kind === 'function' ? `${t.f}.${t.part}` : `${t.id}:${t.t}`
    const canonical = ix.back.get(address)
    if (!canonical || canonical === path || readLiteral(out, path) !== undefined) continue
    const value = readLiteral(out, canonical)
    if (value === undefined) continue
    removeLiteral(out, canonical)
    writeLeaf(out, path, value)
  }
  return out
}
