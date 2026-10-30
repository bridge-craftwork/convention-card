import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { upgradeCardData, upgradeCard, needsUpgrade, CARD_SCHEMA_VERSION } from '../migrate.js'
import { field } from '../spec.js'
import MIGRATION from '../../spec/migrations/1-to-2.json' with { type: 'json' }

// The same cases the crate checks (crates/bridge-card/tests/migrations.rs),
// so the two readers of spec/migrations/ agree.
const ROOT = path.resolve(__dirname, '../..')
const CASES = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/migrations/1-to-2.cases.json'), 'utf8')).cases
const SEED = JSON.parse(fs.readFileSync(path.join(ROOT, 'crates/bridge-card/tests/fixtures/21_intermediate_card.json'), 'utf8'))

describe('upgrading a card from schema 1.x', () => {
  for (const c of CASES) {
    it(c.name, () => {
      const before = JSON.stringify(c.before)
      expect(upgradeCardData(c.before)).toEqual(c.after)
      // The card given is not changed.
      expect(JSON.stringify(c.before)).toBe(before)
    })
  }

  it('upgrades once: the result needs no upgrade, and comes back as it is', () => {
    const once = upgradeCardData(SEED)
    expect(once.schema_version).toBe(CARD_SCHEMA_VERSION)
    expect(needsUpgrade(once)).toBe(false)
    expect(upgradeCardData(once)).toBe(once)
    expect(Object.keys(once)[0]).toBe('schema_version')
  })

  it('upgrades a record, and leaves what is not a card alone', () => {
    const record = { name: 'Seed', card_data: SEED }
    expect(upgradeCard(record).card_data).toEqual(upgradeCardData(SEED))
    expect(upgradeCard(record).name).toBe('Seed')
    const current = { name: 'x', card_data: upgradeCardData(SEED) }
    expect(upgradeCard(current)).toBe(current)
    expect(upgradeCardData(null)).toBe(null)
    expect(upgradeCardData([1])).toEqual([1])
    expect(upgradeCard(null)).toBe(null)
  })

  it('leaves nothing at a path the spec no longer has', () => {
    const leaves = (o, p = '', out = []) => {
      for (const [k, v] of Object.entries(o)) {
        const q = p ? `${p}.${k}` : k
        if (v && typeof v === 'object' && !Array.isArray(v)) leaves(v, q, out)
        else out.push(q)
      }
      return out
    }
    const card = upgradeCardData(SEED)
    const stale = leaves(card).filter(p => !field(p) && !/^(schema_version|format|metadata\.|conventions_list|other_agreements)/.test(p) && !p.endsWith('.skill_path'))
    expect(stale).toEqual([])
  })

  it('writes only fields, and takes off only paths that are no longer fields', () => {
    const written = [
      ...Object.values(MIGRATION.rename),
      ...MIGRATION.split.flatMap(s => [s.play, s.style]),
      ...MIGRATION.select.flatMap(s => [s.play, s.style]),
      ...MIGRATION.any.map(a => a.set),
    ]
    const taken = [
      ...Object.keys(MIGRATION.rename),
      ...MIGRATION.split.map(s => s.from),
      ...MIGRATION.select.flatMap(s => s.options.map(o => o.box)),
    ]
    expect(written.filter(p => field(p)?.path !== p)).toEqual([])
    expect(taken.filter(p => field(p))).toEqual([])
  })
})
