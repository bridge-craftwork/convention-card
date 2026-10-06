// The spec (spec/ in this repository), as the library reads it: the JSON
// that scripts/build_spec.py generates from the TOML sources. Plain data,
// so a page, an extension and Node all read it the same way.

import FIELDS_DOC from '../spec/fields.json' with { type: 'json' }
import BBSA_MAP_DOC from '../spec/formats/bbsa-map.json' with { type: 'json' }
import BBO_MAP_DOC from '../spec/formats/bbo-map.json' with { type: 'json' }
import CONVENTIONS_DOC from '../spec/conventions.json' with { type: 'json' }
import LEVELS_DOC from '../spec/levels.json' with { type: 'json' }
import ALERTS_DOC from '../spec/alerts.json' with { type: 'json' }

const { schema: _fs, generated_from: _ff, ...SECTIONS } = FIELDS_DOC
const { schema: _bs, generated_from: _bf, layout: BBSA_LAYOUT, ...BBSA_MAP } = BBSA_MAP_DOC
const { schema: _bos, generated_from: _bof, ...BBO_MAP } = BBO_MAP_DOC

/**
 * Every card field, by canonical path (`notrump.stayman.play`): its kind,
 * label, options, bounds, default, aliases, skill, level and choice group,
 * as spec/fields.toml declares them.
 */
export const FIELDS = Object.fromEntries(
  Object.entries(SECTIONS).flatMap(([section, fields]) =>
    Object.entries(fields).map(([key, def]) => [`${section}.${key}`, def])
  )
)

/** Canonical path for every path and alias. */
const CANONICAL = new Map(
  Object.entries(FIELDS).flatMap(([path, def]) => [
    [path, path],
    ...(def.aliases || []).map(alias => [alias, path]),
  ])
)

/** The field at `path` or one of its aliases, with its canonical `path`; or undefined. */
export function field(path) {
  const canonical = CANONICAL.get(path)
  return canonical && { path: canonical, ...FIELDS[canonical] }
}

/** The `.bbsa` map (spec/formats/bbsa-map.toml): key → mapping, plus `implied` and `derived`. */
export { BBSA_MAP }

/** BBO's ACBL card map (spec/formats/bbo-map.toml): `conventions`, `fields` and `joined`. */
export { BBO_MAP }

/** BBA's `.bbsa` file layout (spec/formats/bbsa-layout.txt): every key, in the order an export writes them. */
export { BBSA_LAYOUT }

/** Every standard convention and skill, by ID (spec/conventions/). */
export const CONVENTIONS = CONVENTIONS_DOC.conventions

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
