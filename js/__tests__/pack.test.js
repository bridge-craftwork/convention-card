import { describe, it, expect } from 'vitest'
import PACK from '../../spec/pack.json' with { type: 'json' }
import FIELDS_DOC from '../../spec/fields.json' with { type: 'json' }
import CONVENTIONS_DOC from '../../spec/conventions.json' with { type: 'json' }
import LEVELS_DOC from '../../spec/levels.json' with { type: 'json' }
import ALERTS_DOC from '../../spec/alerts.json' with { type: 'json' }
import MIGRATION_1_TO_2 from '../../spec/migrations/1-to-2.json' with { type: 'json' }
import { schema2Fields, schema2Alerts, addressMaps } from '../pack.js'
import { FIELDS, CONVENTIONS, field } from '../spec.js'

// Until the cut-over this repository still holds the vocabulary it used to
// own (spec/fields.toml and the files built from it). The library reads the
// pack instead; these tests hold the two together, so nothing is lost or
// changed by the move.
const { schema: _s, generated_from: _g, ...SECTIONS } = FIELDS_DOC
const OLD = Object.fromEntries(
  Object.entries(SECTIONS).flatMap(([section, fields]) =>
    Object.entries(fields).map(([key, def]) => [`${section}.${key}`, def])
  )
)
// Text the pack has corrected since (bridge-common-conventions Phase 5):
// "<path or ID> <attribute>". Each is a deliberate difference from the files
// this repository still carries.
const CORRECTED = new Set([
  // Reverse Flannery is responder's jump over one of a minor, not an opening.
  'two_level.reverse_flannery.play desc',
  'bidding_conventions/reverse_flannery summary',
  'bidding_conventions/reverse_flannery desc',
  'bidding_conventions/reverse_flannery contexts',
  // Its 2♦ treatment was left from that opening: retired, name kept.
  'two_level.reverse_flannery.two_d retired',
])
const without = (name, def) =>
  Object.fromEntries(Object.entries(def).filter(([k]) => !CORRECTED.has(`${name} ${k}`)))
const tidy = def => ({
  ...def,
  ...(def.skill !== undefined ? { skill: [def.skill].flat() } : {}),
  ...(def.aliases ? { aliases: [...def.aliases].sort() } : {}),
})

describe('the pack, read as card schema 2', () => {
  const got = schema2Fields(PACK)

  it('gives every field spec/fields.toml had, in the same order', () => {
    expect(Object.keys(got)).toEqual(Object.keys(OLD))
  })

  it('gives each field the same attributes', () => {
    for (const [path, def] of Object.entries(OLD)) {
      expect([path, without(path, tidy(got[path]))]).toEqual([path, without(path, tidy(def))])
    }
  })

  it('gives the same alert rules, levels and schema 1 migration', () => {
    const alerts = schema2Alerts(PACK)
    // Every alert rule this repository had, in order; the pack has added
    // some since (Reverse Flannery's jumps over one of a minor) and dropped
    // the three for the 2♦ opening Reverse Flannery never was.
    const had = new Set(ALERTS_DOC.alert.map(a => JSON.stringify(a)))
    const kept = ALERTS_DOC.alert.filter(a => a.fields[0] !== 'two_level.reverse_flannery.two_d')
    expect(ALERTS_DOC.alert.length - kept.length).toBe(3)
    expect(alerts.alert.filter(a => had.has(JSON.stringify(a)))).toEqual(kept)
    const added = alerts.alert.filter(a => !had.has(JSON.stringify(a)))
    expect(added.map(a => a.fields[0]).sort()).toEqual([
      'two_level.reverse_flannery.two_h',
      'two_level.reverse_flannery.two_h',
      'two_level.reverse_flannery.two_s',
    ])
    expect(alerts.regulators).toEqual(ALERTS_DOC.regulators)
    expect(PACK.levels.band).toEqual(LEVELS_DOC.band)
    const { schema: _ms, generated_from: _mg, ...migration } = MIGRATION_1_TO_2
    expect(PACK.migrations['1-to-2']).toEqual(migration)
  })

  it('gives every convention its definition', () => {
    expect(Object.keys(CONVENTIONS)).toEqual(Object.keys(CONVENTIONS_DOC.conventions))
    for (const [id, def] of Object.entries(CONVENTIONS_DOC.conventions)) {
      // Sources may have been added to `see` since; none is dropped.
      // Robert S. Todd's site is named as it is today; this repository's
      // older list has its former name.
      const renamed = e => (e.site === 'Advancing in Bridge' ? { ...e, site: 'Adventures in Bridge' } : e)
      const { see: older = [], ...rest } = without(id, def)
      const see = older.map(renamed)
      expect([id, CONVENTIONS[id]]).toEqual([id, expect.objectContaining(rest)])
      expect([id, CONVENTIONS[id].see ?? []]).toEqual([id, expect.arrayContaining(see)])
    }
  })

  it('maps every address to one path and back', () => {
    const { path, address } = addressMaps(PACK)
    expect(path.size).toBe(address.size)
    expect(path.get('bidding_conventions/stayman')).toBe('notrump.stayman.play')
    expect(path.get('bidding_conventions/stayman:forcing')).toBe('notrump.stayman.forcing')
    expect(path.get('defence_to_1nt.strong')).toBe('competitive.vs_1nt_strong.system')
    for (const p of path.values()) expect([p, p in FIELDS]).toEqual([p, true])
  })

  it('is what the library reads', () => {
    expect(FIELDS).toEqual(got)
    expect(field('notrump.stayman.puppet').path).toBe('notrump.stayman.puppet_1nt')
  })
})
