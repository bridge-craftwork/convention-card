// The editor's level filter: the named bands of the spec's 1–10 level
// (spec/levels.toml; DECISIONS.md, 11 and 12). A row's level is its card
// field's level in the spec, or else its convention's; the band is derived
// from that number, never stored.

import { LEVEL_BANDS, levelBand, fieldLevel } from '../../../js/spec.js'

/** The band names, in order: the filter's buttons. */
export const SKILL_LEVELS = LEVEL_BANDS.map(b => b.name)

/** A band's label ("Intermediate"), by name. */
export const bandLabel = name => LEVEL_BANDS.find(b => b.name === name)?.label || name

/** The 1–10 level of the card field at `path`, or undefined. */
export const levelOfPath = path => (path ? fieldLevel(path) : undefined)

/** The band name for a 1–10 level; the lowest band when there is none. */
export const bandOf = level => levelBand(level)?.name || SKILL_LEVELS[0]
