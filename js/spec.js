// The vocabulary, as the library reads it. The conventions, card fields,
// levels and alert rules come from a convention pack (spec/pack.json, a
// copy of bridge-common-conventions' published snapshot: scripts/
// sync_pack.mjs). The format maps are this repository's own (spec/formats/,
// built by scripts/build_spec.py). Plain data, so a page, an extension and
// Node all read it the same way.

import PACK_DOC from '../spec/pack.json' with { type: 'json' }
import { schema2Fields, schema2Alerts, addressMaps, conventionPaths, definitions } from './pack.js'
import BBSA_MAP_DOC from '../spec/formats/bbsa-map.json' with { type: 'json' }
import BBO_MAP_DOC from '../spec/formats/bbo-map.json' with { type: 'json' }
import BBO_SLOTS_DOC from '../spec/formats/bbo-slots.json' with { type: 'json' }
import BRIDGODEX_MAP_DOC from '../spec/formats/bridgodex-map.json' with { type: 'json' }

/** The pack the vocabulary was read from (its name, format numbers and the commit it was built from). */
export const PACK = { ...PACK_DOC.pack, source_commit: PACK_DOC.source_commit }

const LEVELS_DOC = PACK_DOC.levels
const ALERTS_DOC = schema2Alerts(PACK_DOC)
const { schema: _bs, generated_from: _bf, layout: BBSA_LAYOUT, ...BBSA_MAP } = BBSA_MAP_DOC
const { schema: _bos, generated_from: _bof, ...BBO_MAP } = BBO_MAP_DOC
const { schema: _bss, generated_from: _bsf, ...BBO_SLOTS } = BBO_SLOTS_DOC
const { schema: _bds, generated_from: _bdf, ...BRIDGODEX_MAP } = BRIDGODEX_MAP_DOC

/**
 * Every card field, by canonical path (`notrump.stayman.play`): its kind,
 * label, options, bounds, default, aliases, skill, level and choice group.
 * These are card schema 2's paths, rebuilt from the pack (js/pack.js).
 */
export const FIELDS = schema2Fields(PACK_DOC)

/** Canonical path for every path and alias. */
const CANONICAL = new Map(
  Object.entries(FIELDS).flatMap(([path, def]) => [
    [path, path],
    ...(def.aliases || []).map(alias => [alias, path]),
  ])
)

/**
 * Every path that names the same field as `path`: its canonical path first,
 * then its aliases. Undefined when `path` names no field.
 */
export function spellings(path) {
  const canonical = CANONICAL.get(path)
  return canonical && [canonical, ...(FIELDS[canonical].aliases || [])]
}

/** The pack's address for each field (`bidding_conventions/stayman`, `<id>:<treatment>`), to its path. */
const BY_ADDRESS = addressMaps(PACK_DOC).path
/** For a convention with no single box (several places, or chosen by a setting), the path that stands for it. */
const BY_CONVENTION = conventionPaths(PACK_DOC)

/**
 * The field at `path`, one of its aliases, or its address in the pack
 * (`bidding_conventions/stayman`, which a bidding engine reports), with its
 * canonical `path`; or undefined. A convention with no single box (Texas,
 * played over 1NT and over 2NT; Meckwell, chosen as the defence to 1NT)
 * reads as the box that best stands for it.
 */
export function field(path) {
  const canonical = CANONICAL.get(path) ?? CANONICAL.get(BY_ADDRESS.get(path)) ?? CANONICAL.get(BY_CONVENTION.get(path))
  return canonical && { path: canonical, ...FIELDS[canonical] }
}

/** The `.bbsa` map (spec/formats/bbsa-map.toml): key → mapping, plus `implied` and `derived`. */
export { BBSA_MAP }

/** BBO's ACBL card map (spec/formats/bbo-map.toml): `conventions`, `fields`, `joined` and `left_out`. */
export { BBO_MAP }

/** Every slot on BBO's ACBL card (spec/formats/bbo-slots.toml): `fields`, `conventions` and `leads`, each id → { section, label }. */
export { BBO_SLOTS }

/** Bridgodex's card map (spec/formats/bridgodex-map.toml): a table per Bridgodex block, plus `any` and `notes`. */
export { BRIDGODEX_MAP }

/** BBA's `.bbsa` file layout (spec/formats/bbsa-layout.txt): every key, in the order an export writes them. */
export { BBSA_LAYOUT }

/**
 * Every standard convention and skill, by ID (the pack's definitions),
 * among them the IDs the pack added for what card schema 2 held as a bare
 * switch (Texas, Michaels...): cards are stored in schema 3, which names
 * them.
 */
export const CONVENTIONS = Object.fromEntries(
  Object.entries(definitions(PACK_DOC))
    .map(([id, d]) => [id, 'summary' in d ? { ...d, summary: d.summary.trim() } : d])
)

/**
 * The named level bands, in order: `{ name, label, max }`, each covering the
 * levels up to and including `max` (spec/levels.toml; DECISIONS.md, 12).
 */
export const LEVEL_BANDS = LEVELS_DOC.band

/** The band (`{ name, label, max }`) a 1–10 level falls in, or undefined. */
export function levelBand(level) {
  if (!Number.isFinite(level)) return undefined
  return LEVEL_BANDS.find(b => level <= b.max)
}

/**
 * The level of the field at `path` (or an alias): its own, else that of the
 * convention it names (its first `skill`), else undefined.
 */
export function fieldLevel(path) {
  const f = field(path)
  if (!f) return undefined
  if (f.level != null) return f.level
  const skill = [f.skill || []].flat()[0]
  return skill ? CONVENTIONS[skill]?.level : undefined
}

/**
 * The regulators alerts.toml covers, by id (`acbl`, `ebu`, `wbf`):
 * `{ name, source: { title, url, version } }`.
 */
export const REGULATORS = ALERTS_DOC.regulators

/** Which calls need an alert, by card field (spec/alerts.toml). */
const ALERTS_BY_FIELD = new Map()
for (const a of ALERTS_DOC.alert || []) {
  for (const p of a.fields) {
    const path = field(p)?.path || p
    if (!ALERTS_BY_FIELD.has(path)) ALERTS_BY_FIELD.set(path, [])
    ALERTS_BY_FIELD.get(path).push(a)
  }
}

/**
 * The calls of the field at `path` (or an alias) that a regulator's alerting
 * rules cover: `[{ call, after, by, rule, note }]`, with `rule` ("alert",
 * "announce", "delayed" or "none") as `regulator` has it: its own entry
 * where it differs, else the common rule.
 */
export function alertsFor(path, regulator) {
  const canonical = field(path)?.path || path
  return (ALERTS_BY_FIELD.get(canonical) || []).map(a => ({
    call: a.call,
    after: a.after ?? null,
    by: a.by ?? null,
    when: a.when ?? null,
    rule: a[regulator] ?? a.rule,
    note: a.note ?? null,
  }))
}

const RULE_WEIGHT = { none: 0, announce: 1, delayed: 2, alert: 3 }

/**
 * A field's alerting at a glance, for `regulator`: `main` is the rule for
 * its first entry (the convention's own call: Michaels' cuebid, RKCB's 4NT),
 * and `more` the strongest rule among its other calls when that is
 * stronger than `main` (the 2NT asking for Michaels' minor; RKCB's replies),
 * else null. Variants (`when`) are left out. Null when nothing is listed.
 */
export function alertSummary(path, regulator) {
  const calls = alertsFor(path, regulator).filter(c => !c.when)
  if (!calls.length) return null
  const main = calls[0].rule
  const rest = calls.slice(1).reduce((best, c) => (RULE_WEIGHT[c.rule] > RULE_WEIGHT[best] ? c.rule : best), 'none')
  return { main, more: RULE_WEIGHT[rest] > RULE_WEIGHT[main] ? rest : null }
}

/**
 * The strongest rule among a field's own calls for `regulator` ("alert" >
 * "delayed" > "announce" > "none"), or null if it has none listed. Variants
 * (entries with `when`) are left out: they apply only to some partnerships.
 */
export function alertBadge(path, regulator) {
  const calls = alertsFor(path, regulator).filter(c => !c.when)
  if (!calls.length) return null
  return calls.reduce((best, c) => (RULE_WEIGHT[c.rule] > RULE_WEIGHT[best] ? c.rule : best), 'none')
}
