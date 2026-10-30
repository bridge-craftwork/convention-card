// Card schema upgrades (spec/migrations/, ADR-0002). A card records its
// `schema_version` at the top of card_data; one whose version is missing or
// older than CARD_SCHEMA_VERSION is upgraded once, when it is read, by the
// migration files in order. The rules and their order are the TOML file's
// header (spec/migrations/1-to-2.toml); this module and the bridge-card
// crate's migrate.rs both follow it.

import MIGRATION_1_TO_2 from '../spec/migrations/1-to-2.json' with { type: 'json' }
import { readPath, writePath } from './paths.js'

/** The schema version every card this library writes records. */
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
    if (style !== undefined) writes.push([s.play, true], [s.style, style])
    else if (found) writes.push([s.play, false])
  }
  for (const a of migration.any || []) {
    if (a.from.some(p => leaf(original, p) === true)) writes.push([a.set, true])
  }
  // The first writer wins; a value the card already has wins over them all.
  for (const [path, value] of writes) {
    if (readPath(card, path) === undefined) writePath(card, path, value)
  }
}

/**
 * Upgrade bare card_data to CARD_SCHEMA_VERSION: a copy with every rename
 * and value change of the migrations it needs, recording the new version.
 * A card already at the current version comes back as it was (the same
 * object); anything that is not an object comes back unchanged.
 */
export function upgradeCardData(cardData) {
  if (!needsUpgrade(cardData)) return cardData
  const card = JSON.parse(JSON.stringify(cardData))
  for (const m of MIGRATIONS) {
    if (major(card.schema_version) >= major(m.to)) continue
    apply(m, card, JSON.parse(JSON.stringify(card)))
    card.schema_version = m.to
  }
  // `schema_version` first, as the library writes it.
  const { schema_version, ...rest } = card
  return { schema_version, ...rest }
}

/** A record `{ name, description, card_data, … }` with its card_data upgraded (upgradeCardData). */
export function upgradeCard(record) {
  if (!record || typeof record !== 'object' || !isObject(record.card_data) || !needsUpgrade(record.card_data)) return record
  return { ...record, card_data: upgradeCardData(record.card_data) }
}
