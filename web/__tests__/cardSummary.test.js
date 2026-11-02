import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { DISTINGUISHING, distinguishing, lastEdit, levelsOf, nextSort, SORT_AFTER, SORT_BEFORE, sortRows, summarize, systemOf, unknownPaths } from '../src/editor/cardSummary.js'

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

describe('the table of cards', () => {
  const value = (key, data) => DISTINGUISHING.find(d => d.key === key).value(data)
  const suits = o => ({ carding: { suits: o } })

  it('says Var for a 1NT whose range depends on seat or vulnerability', () => {
    const one = { notrump: { one_nt: { range_min: 15, range_max: 17, seat_vul: 'V' }, one_nt_alt: { range_min: 12, range_max: 14, seat_vul: 'NV' } } }
    expect(value('nt_range', one)).toBe('Var')
    expect(DISTINGUISHING.find(d => d.key === 'nt_range').title(one)).toBe('15–17 V; 12–14 NV')
    expect(value('nt_range', { notrump: { one_nt: { range_min: 15, range_max: 17 } } })).toBe('15–17')
    expect(value('nt_range', { notrump: { one_nt: { range_min: 15, range_max: 17 }, one_nt_alt: { range_min: 15, range_max: 17 } } })).toBe('15–17')
  })

  it('names the carding: Std, UD, SCUDA, UCSA', () => {
    expect(value('carding', suits({ standard_attitude: true, standard_count: true }))).toBe('Std')
    expect(value('carding', suits({ upside_down_attitude: true, upside_down_count: true }))).toBe('UD')
    expect(value('carding', suits({ upside_down_attitude: true, standard_count: true }))).toBe('SCUDA')
    expect(value('carding', suits({ standard_attitude: true, upside_down_count: true }))).toBe('UCSA')
    expect(value('carding', suits({ upside_down_attitude: true }))).toBe('SCUDA')
    expect(value('carding', {})).toBe('')
  })

  it('has no 2/1 column, attitude or count', () => {
    expect(DISTINGUISHING.map(d => d.key)).toEqual(['nt_range', 'carding', 'keycard'])
  })

  it('says when a card last changed: a time today, a day this week, else a date', () => {
    const now = new Date(2026, 10, 2, 15, 0)
    expect(lastEdit(new Date(2026, 10, 2, 9, 5), now)).toMatch(/9:05/)
    expect(lastEdit(new Date(2026, 10, 1, 23, 0), now)).toBe(new Date(2026, 10, 1).toLocaleDateString(undefined, { weekday: 'short' }))
    expect(lastEdit(new Date(2026, 9, 27), now)).toBe(new Date(2026, 9, 27).toLocaleDateString(undefined, { weekday: 'short' }))
    expect(lastEdit(new Date(2026, 9, 26), now)).toMatch(/2026/)
    expect(lastEdit(null, now)).toBe('')
  })
})

describe('sorting the table of cards', () => {
  const COLUMNS = [...SORT_BEFORE, ...SORT_AFTER]
  const column = key => COLUMNS.find(c => c.key === key)
  const row = (name, system, total = 0, updated = null, level = null) => ({
    name, names: '', system, updated, levels: { total }, cardLevel: level ? { level } : null,
  })
  const names = (rows, sort) => sortRows(rows, sort, COLUMNS).map(r => r.name)

  it('makes the column clicked the first key, keeping the earlier ones behind it', () => {
    let sort = nextSort([], column('name'))
    sort = nextSort(sort, column('system'))
    sort = nextSort(sort, column('level'))
    expect(sort.map(s => s.key)).toEqual(['level', 'system', 'name'])
  })

  it('turns the first key round on a second click, leaving the rest', () => {
    const sort = nextSort(nextSort([], column('name')), column('system'))
    expect(nextSort(sort, column('system'))).toEqual([{ key: 'system', dir: 'desc' }, { key: 'name', dir: 'asc' }])
  })

  it('moves an earlier key to the front rather than listing it twice', () => {
    const sort = nextSort(nextSort([], column('name')), column('system'))
    expect(nextSort(sort, column('name'))).toEqual([{ key: 'name', dir: 'asc' }, { key: 'system', dir: 'asc' }])
  })

  it('starts Last edit with the newest', () => {
    expect(nextSort([], column('updated'))).toEqual([{ key: 'updated', dir: 'desc' }])
  })

  it('uses the prior sort to break ties', () => {
    const rows = [row('B', '2/1'), row('C', 'SAYC'), row('A', '2/1')]
    expect(names(rows, [{ key: 'system', dir: 'asc' }, { key: 'name', dir: 'asc' }])).toEqual(['A', 'B', 'C'])
    expect(names(rows, [{ key: 'system', dir: 'asc' }, { key: 'name', dir: 'desc' }])).toEqual(['B', 'A', 'C'])
  })

  it('keeps the order it was given when nothing separates rows', () => {
    const rows = [row('B', 'x'), row('A', 'x')]
    expect(names(rows, [])).toEqual(['B', 'A'])
    expect(names(rows, [{ key: 'system', dir: 'desc' }])).toEqual(['B', 'A'])
  })

  it('compares numbers as numbers, in text as well', () => {
    expect(names([row('A', '', 10), row('B', '', 9)], [{ key: 'conventions', dir: 'asc' }])).toEqual(['B', 'A'])
    expect(names([row('Card 10', ''), row('Card 9', '')], [{ key: 'name', dir: 'asc' }])).toEqual(['Card 9', 'Card 10'])
  })

  it('puts blanks last in either direction', () => {
    const rows = [row('none', ''), row('b', 'B'), row('a', 'A')]
    expect(names(rows, [{ key: 'system', dir: 'asc' }])).toEqual(['a', 'b', 'none'])
    expect(names(rows, [{ key: 'system', dir: 'desc' }])).toEqual(['b', 'a', 'none'])
    const byLevel = [row('none', ''), row('low', '', 0, null, 3), row('high', '', 0, null, 7)]
    expect(names(byLevel, [{ key: 'level', dir: 'desc' }])).toEqual(['high', 'low', 'none'])
  })

  it('sorts Last edit by the time, with no date last', () => {
    const rows = [row('old', '', 0, '2026-01-02T00:00:00Z'), row('never', ''), row('new', '', 0, '2026-11-02T00:00:00Z')]
    expect(names(rows, [{ key: 'updated', dir: 'desc' }])).toEqual(['new', 'old', 'never'])
  })

  it('lets the prior sort decide between edits in the same minute', () => {
    const rows = [row('B', '', 0, '2026-11-02T10:02:05Z'), row('A', '', 0, '2026-11-02T10:02:01Z')]
    expect(names(rows, [{ key: 'updated', dir: 'desc' }, { key: 'name', dir: 'asc' }])).toEqual(['A', 'B'])
  })

  it('skips a key whose column is not showing', () => {
    const rows = [row('B', ''), row('A', '')]
    expect(names(rows, [{ key: 'carding', dir: 'asc' }, { key: 'name', dir: 'asc' }])).toEqual(['A', 'B'])
  })
})
