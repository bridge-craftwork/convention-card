// Bringing a card to the form the library works in (ADR-0002). A card
// records its `schema_version` at the top of card_data. Whatever version it
// was stored in, it is read into the working form: schema 2's dotted paths,
// holding what the card means in schema 3.
//
// - A schema 1 card is first brought to schema 2 by the pack's migration
//   (migrations/1-to-2.toml; its header gives the rules and their order).
// - A schema 2 card is normalised: taken to schema 3 and back (js/schema3.js),
//   so a convention the card shows only by its treatments or in a note reads
//   as played, as it does in schema 3.
// - A schema 3 card is converted to the working form.
//
// The bridge-card crate's migrate.rs and pack.rs follow the same rules.

import PACK_DOC from '../spec/pack.json' with { type: 'json' }

const MIGRATION_1_TO_2 = PACK_DOC.migrations['1-to-2']
import { readPath, writePath } from './paths.js'
import { fromSchema3, normalise } from './schema3.js'

/**
 * The version the working form records: schema 2's paths. A card is stored
 * as STORED_SCHEMA_VERSION (js/schema3.js).
 */
export const CARD_SCHEMA_VERSION = '2.0'

const MIGRATIONS = [MIGRATION_1_TO_2]

const isObject = v => v != null && typeof v === 'object' && !Array.isArray(v)
const major = version => {
  const m = /^(\d+)/.exec(String(version ?? '1'))
  return m ? Number(m[1]) : 1
}

/** Whether `cardData` (bare card_data) is older than CARD_SCHEMA_VERSION. */
export function needsUpgrade(cardData) {
  return isObject(cardData) && major(cardData.schema_version) < major(CARD_SCHEMA_VERSION)
}

/** Take the leaf at `path` off `obj`, pruning objects it leaves empty. */
function takePath(obj, path) {
  const parts = path.split('.')
  const chain = [obj]
  for (const p of parts.slice(0, -1)) {
    const next = chain[chain.length - 1][p]
    if (!isObject(next)) return
    chain.push(next)
  }
  const last = parts[parts.length - 1]
  const parent = chain[chain.length - 1]
  if (!Object.hasOwn(parent, last) || isObject(parent[last])) return
  delete parent[last]
  for (let i = chain.length - 1; i > 0; i--) {
    if (Object.keys(chain[i]).length) break
    delete chain[i - 1][parts[i - 1]]
  }
}

/** A leaf of the card as given (undefined for a missing path or an object). */
function leaf(card, path) {
  const v = readPath(card, path)
  return isObject(v) ? undefined : v
}

/** Apply one migration file's rules to `card` in place; `original` is the card as given. */
function apply(migration, card, original) {
  const writes = []
  const take = path => {
    const v = leaf(original, path)
    if (v !== undefined) takePath(card, path)
    return v
  }
  for (const [from, to] of Object.entries(migration.rename || {})) {
    const v = take(from)
    if (v !== undefined) writes.push([to, v])
  }
  for (const s of migration.split || []) {
    const v = leaf(original, s.from)
    if (typeof v !== 'string') continue
    takePath(card, s.from)
    if (v === s.off) writes.push([s.play, false])
    else writes.push([s.play, true], [s.style, v])
  }
  for (const s of migration.select || []) {
    let found = false
    let style
    for (const o of s.options) {
      const v = take(o.box)
      if (v === undefined) continue
      found = true
      if (v === true && style === undefined) style = o.value
    }
    if (style !== undefined) {
      if (s.play) writes.push([s.play, true])
      writes.push([s.style, style])
    } else if (found) {
      if (s.play) writes.push([s.play, false])
      if (s.off) writes.push([s.style, s.off])
    }
  }
  for (const a of migration.any || []) {
    if (a.from.some(p => leaf(original, p) === true)) writes.push([a.set, true])
  }
  // The first writer wins; a value the card already has wins over them all.
  for (const [path, value] of writes) {
    if (readPath(card, path) === undefined) writePath(card, path, value)
  }
}

const canonical = v =>
  Array.isArray(v) ? v.map(canonical)
  : isObject(v) ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])]))
  : v
const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b))

/**
 * Bare card_data with schema 2's paths, as the card itself has them: a
 * schema 1 card with its renames and value changes applied, a schema 3 card
 * converted. Nothing is inferred (see upgradeCardData). A schema 2 card
 * comes back as it was (the same object), as does anything that is not an
 * object.
 */
export function migrateCardData(cardData) {
  if (!isObject(cardData)) return cardData
  if (major(cardData.schema_version) >= 3) return first(fromSchema3(cardData))
  if (!needsUpgrade(cardData)) return cardData
  const card = JSON.parse(JSON.stringify(cardData))
  for (const m of MIGRATIONS) {
    if (major(card.schema_version) >= major(m.to)) continue
    apply(m, card, JSON.parse(JSON.stringify(card)))
    card.schema_version = m.to
  }
  return first(card)
}

// `schema_version` first, as the library writes it.
const first = ({ schema_version, ...rest }) => ({ schema_version, ...rest })

/**
 * Bare card_data in the working form, whatever version it was stored in:
 * migrated (migrateCardData), then normalised so it reads as it does in
 * schema 3. A card already in the working form comes back as it was (the
 * same object); anything that is not an object comes back unchanged.
 */
export function upgradeCardData(cardData) {
  if (!isObject(cardData)) return cardData
  const migrated = migrateCardData(cardData)
  if (major(cardData.schema_version) >= 3) return migrated
  const card = normalise(migrated)
  if (migrated === cardData && same(card, { ...cardData, schema_version: CARD_SCHEMA_VERSION })) return cardData
  return first(card)
}

/** A record `{ name, description, card_data, … }` with its card_data in the working form (upgradeCardData). */
export function upgradeCard(record) {
  if (!record || typeof record !== 'object' || !isObject(record.card_data)) return record
  const card_data = upgradeCardData(record.card_data)
  return card_data === record.card_data ? record : { ...record, card_data }
}
