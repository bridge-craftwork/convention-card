// The spec (spec/ in this repository), as the library reads it: the JSON
// that scripts/build_spec.py generates from the TOML sources. Plain data,
// so a page, an extension and Node all read it the same way.

import FIELDS_DOC from '../spec/fields.json' with { type: 'json' }
import BBSA_MAP_DOC from '../spec/formats/bbsa-map.json' with { type: 'json' }
import CONVENTIONS_DOC from '../spec/conventions.json' with { type: 'json' }
import LEVELS_DOC from '../spec/levels.json' with { type: 'json' }

const { schema: _fs, generated_from: _ff, ...SECTIONS } = FIELDS_DOC
const { schema: _bs, generated_from: _bf, layout: BBSA_LAYOUT, ...BBSA_MAP } = BBSA_MAP_DOC

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
