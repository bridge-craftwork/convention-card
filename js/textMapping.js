// What a card's text adds to its boxes (DESIGN.md, "Text on the card").
// A tool that reads a card (a bidding bot) reads its fields, never its
// prose, so each piece of text is one of:
//
//   mapped      the conventions it names are all played as boxes
//   explained   it spells out an agreement set elsewhere ("2♣: ♦ or majors"
//               under a defence to 1NT that is set to Suction): nothing to
//               read unless it differs from the convention
//   pending     it names conventions the card does not play yet (the
//               editor's suggestions)
//   differs     it spells out such an agreement, but not as the convention
//               does ("Penalty" for Suction's double): the card's own
//               agreement, which a tool reading the convention would miss
//   unmapped    no tool can read it: an agreement only a person will see
//   play        carding and leads that name no convention: for a play bot,
//               not a bidding one (text naming one, such as "Trump suit
//               preference", is mapped or pending like any other)
//
// A field that holds a bid (`bid` in the spec: negative doubles through 4♥)
// is not text once it holds one, so it is not listed; when it holds words
// instead, they are unmapped, with `notBid` set.
//
// And `applyImplied` closes the plainest gap at import: a box's text that
// names the convention the spec says that box means (`implies`), such as
// "Puppet" as the 1NT 3♣ response, ticks it.

import { FIELDS, CONVENTIONS } from './spec.js'
import { cardValues } from './checkCard.js'
import { writePath } from './paths.js'
import { findConventions, playsConvention } from './recogniseConventions.js'
import { KNOWN_NT_DEFENSES } from './ntDefenses.js'
import { bidOf } from './suits.js'

const isOn = (values, path) => (values.has(path) ? values.get(path) : FIELDS[path]?.default) === true
const isSet = (values, path) => FIELDS[path]?.kind === 'bool' ? isOn(values, path) : values.has(path)
const humanise = v => String(v).replace(/_/g, ' ')

// Sections about the play of the cards, not the bidding (as rusty-bidding-
// bot's `card coverage` counts them).
const PLAY_SECTIONS = new Set(['carding', 'leads'])

// Two descriptions of a bid, compared loosely: "♦ or majors" and "♦ or both
// majors", "♣ and ♥" and "♣ + ♥", "black suits" and "blacks" are the same.
const loose = s => String(s).toLowerCase()
  .replace(/\bblack suits\b/g, 'blacks').replace(/\bred suits\b/g, 'reds')
  .replace(/\+|&/g, ' and ').replace(/\b(both|the|a)\b/g, ' ')
  .replace(/[^\p{L}\p{N}♣♦♥♠ ]/gu, ' ').replace(/\s+/g, ' ').trim()

// The standard meaning of a defence-to-1NT bid, for a defence the library
// knows by exactly this name ("Suction"; not "Modified Cappelletti" as
// Cappelletti).
function standardBid(values, explains, path) {
  if (!/^competitive\.vs_1nt_(strong|weak)\.system$/.test(explains)) return null
  const system = humanise(values.get(explains) || '').toLowerCase()
  const def = KNOWN_NT_DEFENSES.find(d => [d.name, ...(d.aliases || [])].some(n => n.toLowerCase() === system))
  return def?.bids?.[path.slice(path.lastIndexOf('.') + 1)] || null
}

/**
 * Every text field the card fills in, by path: `{ status, label, text,
 * conventions, explainedBy, standard, notBid? }`. `status` is 'mapped', 'explained',
 * 'differs', 'pending', 'unmapped' or 'play' (above); `conventions` are those it names,
 * `[{ id, name, written, played, field }]`, with `field` the box it means
 * where the spec says (`implies`); `explainedBy` is the field whose
 * agreement it spells out, when that is set, `{ path, label, value }`;
 * `standard` is that convention's own meaning for this bid, where the
 * library knows it, so a person can see whether the card differs. `notBid`
 * is set on a field meant to hold a bid (`bid`) that holds words instead.
 */
export function textMapping(card_data) {
  const values = cardValues(card_data)
  const out = new Map()
  for (const [path, value] of values) {
    const def = FIELDS[path]
    if (def.kind !== 'text') continue
    const text = String(value).trim()
    if (!text || (def.bid && bidOf(text))) continue

    const seen = new Set()
    const conventions = []
    for (const m of findConventions(text)) {
      const field = def.implies?.[m.id] || null
      const key = `${m.id}|${field}`
      if (seen.has(key)) continue
      seen.add(key)
      conventions.push({
        id: m.id,
        name: CONVENTIONS[m.id]?.name || m.name,
        written: m.written,
        field,
        played: field ? isOn(values, field) : playsConvention(card_data, m.id, values),
      })
    }

    const explainedBy = def.explains && isSet(values, def.explains)
      ? { path: def.explains, label: FIELDS[def.explains]?.label || def.explains, value: values.get(def.explains) ?? true }
      : null
    const standard = explainedBy ? standardBid(values, def.explains, path) : null
    const status = conventions.some(c => !c.played) ? 'pending'
      : standard && loose(standard) !== loose(text) ? 'differs'
        : explainedBy ? 'explained'
          : conventions.length ? 'mapped'
            : PLAY_SECTIONS.has(path.slice(0, path.indexOf('.'))) ? 'play'
              : 'unmapped'
    out.set(path, { status, label: def.label, text, conventions, explainedBy, standard, ...(def.bid && { notBid: true }) })
  }
  return out
}

/** How many text fields are in each status: `{ mapped, explained, differs, pending, unmapped, play }`. */
export function textMappingCounts(mapping) {
  const counts = { mapped: 0, explained: 0, differs: 0, pending: 0, unmapped: 0, play: 0 }
  for (const m of mapping.values()) counts[m.status]++
  return counts
}

/**
 * Tick the boxes the card's text says it plays, where the spec ties a text
 * field to a box (`implies`): changes `card_data` in place, and returns what
 * it set, `[{ field, label, id, from, written }]`. The text is kept.
 */
export function applyImplied(card_data) {
  const values = cardValues(card_data)
  const set = []
  for (const [path, value] of values) {
    const implies = FIELDS[path].implies
    if (!implies || FIELDS[path].kind !== 'text') continue
    for (const m of findConventions(String(value))) {
      const field = implies[m.id]
      if (!field || isOn(values, field) || set.some(s => s.field === field)) continue
      writePath(card_data, field, true)
      set.push({ field, label: FIELDS[field]?.label || field, id: m.id, from: path, written: m.written })
    }
  }
  return set
}
