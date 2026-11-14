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
      expect([path, tidy(got[path])]).toEqual([path, tidy(def)])
    }
  })

  it('gives the same alert rules, levels and schema 1 migration', () => {
    const alerts = schema2Alerts(PACK)
    expect(alerts.alert).toEqual(ALERTS_DOC.alert)
    expect(alerts.regulators).toEqual(ALERTS_DOC.regulators)
    expect(PACK.levels.band).toEqual(LEVELS_DOC.band)
    const { schema: _ms, generated_from: _mg, ...migration } = MIGRATION_1_TO_2
    expect(PACK.migrations['1-to-2']).toEqual(migration)
  })

  it('gives every convention its definition', () => {
    expect(Object.keys(CONVENTIONS)).toEqual(Object.keys(CONVENTIONS_DOC.conventions))
    for (const [id, def] of Object.entries(CONVENTIONS_DOC.conventions)) {
      expect([id, CONVENTIONS[id]]).toEqual([id, expect.objectContaining(def)])
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
