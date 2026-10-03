import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { summarize, distinguishing, levelsOf, systemOf, unknownPaths } from '../src/editor/cardSummary.js'

const ROOT = path.resolve(__dirname, '../..')
const SEED = JSON.parse(fs.readFileSync(path.join(ROOT, 'crates/bridge-card/tests/fixtures/21_intermediate_card.json'), 'utf8'))
const DENSE = JSON.parse(fs.readFileSync(path.join(__dirname, '../../js/__tests__/fixtures/dense-convention-card.json'), 'utf8')).card_data

describe('the table of cards', () => {
  it('reads only real fields', () => {
    expect(unknownPaths()).toEqual([])
  })

  it('summarises a card', () => {
    const row = summarize({ id: 'a', name: 'Ours', card_data: { ...DENSE, metadata: { partner_names: 'Pat & Lee' } } })
    expect(row).toMatchObject({ id: 'a', name: 'Ours', names: 'Pat & Lee' })
    expect(row.levels.total).toBeGreaterThan(5)
    expect(Object.values(row.levels.bands).reduce((a, b) => a + b, 0)).toBe(row.levels.total)
    expect(row.levels.highest).toBeGreaterThanOrEqual(1)
  })

  it('names the system in the card\'s words, else by its category', () => {
    expect(systemOf({ general: { system: '2/1 with weak NT' } })).toBe('2/1 with weak NT')
    expect(systemOf({ general: { system_category: 'precision' } })).toBe('Precision')
    expect(systemOf({})).toBe('')
  })

  it('counts nothing on an empty card', () => {
    expect(levelsOf({})).toEqual({ total: 0, bands: { basic: 0, intermediate: 0, advanced: 0, expert: 0 }, highest: null })
  })

  it('shows only the settings where the cards differ', () => {
    const a = { card_data: { notrump: { one_nt: { range_min: 15, range_max: 17 } }, carding: { suits: { standard_attitude: true } } } }
    const b = { card_data: { notrump: { one_nt: { range_min: 14, range_min_plus: true, range_max: 17, range_max_minus: true } }, carding: { suits: { standard_attitude: true } } } }
    const cols = distinguishing([a, b])
    expect(cols.map(c => c.key)).toEqual(['nt_range'])
    expect(cols[0].value(b.card_data)).toBe('14+–17-')
    expect(distinguishing([a])).toEqual([])
  })
})

describe("a card's level", () => {
  it('is the highest level three of its conventions reach', async () => {
    const { cardLevel } = await import('../src/editor/cardSummary.js')
    expect(cardLevel({})).toBe(null)
    const lvl = cardLevel(DENSE)
    expect(lvl.level).toBeGreaterThanOrEqual(1)
    expect(['basic', 'intermediate', 'advanced', 'expert']).toContain(lvl.band)
    expect(lvl.why).toMatch(/^Level \d+/)
    // One expert convention on an otherwise basic card does not make it expert.
    const card = { notrump: { stayman: { forcing: true }, transfers: { jacoby: true } }, other_conventions: { xyz: true } }
    expect(cardLevel(card).band).not.toBe('expert')
  })
})
