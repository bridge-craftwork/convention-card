import { describe, it, expect } from 'vitest'
import { exportRecord, exportAll, isBundle, planImport } from '../cardBundle.js'
import { importCards, importCard } from '../importCard.js'

const A = { id: 'a', name: 'With Pat', description: null, updated_at: '2026-10-01T10:00:00Z', card_data: { notrump: { one_nt: { range_min: 15 } } } }
const B = { id: 'b', name: 'With Lee', description: 'club', updated_at: '2026-10-02T10:00:00Z', card_data: { notrump: { one_nt: { range_min: 14 } } } }

describe('Export all', () => {
  it('carries each card with its id and last change, and reads back', async () => {
    const bundle = exportAll([A, B], '2026-10-03T00:00:00Z')
    expect(isBundle(bundle)).toBe(true)
    expect(bundle.cards[0]).toMatchObject({ id: 'a', name: 'With Pat', updatedAt: A.updated_at, card_data: A.card_data })
    const read = await importCards(JSON.stringify(bundle))
    expect(read.map(r => [r.id, r.name, r.updatedAt])).toEqual([['a', 'With Pat', A.updated_at], ['b', 'With Lee', B.updated_at]])
    await expect(importCard(bundle)).rejects.toThrow(/Export all/)
  })

  it('reads a single card as one', async () => {
    const read = await importCards(JSON.stringify(exportRecord(A)))
    expect(read).toHaveLength(1)
    expect(read[0]).toMatchObject({ id: 'a', updatedAt: A.updated_at })
  })
})

describe('planImport', () => {
  const kept = [A, B]
  const incoming = (over, base = A) => ({ id: base.id, name: base.name, card_data: base.card_data, updatedAt: base.updated_at, ...over })

  it('adds a card it has not seen', () => {
    expect(planImport([incoming({ id: 'z', name: 'New partner' })], kept)[0].action).toBe('add')
  })
  it('skips one with the same settings', () => {
    expect(planImport([incoming({})], kept)[0].action).toBe('same')
  })
  it('replaces with a newer copy, without asking', () => {
    const p = planImport([incoming({ updatedAt: '2026-10-05T00:00:00Z', card_data: { x: 1 } })], kept)[0]
    expect([p.action, p.target.id]).toEqual(['replace', 'a'])
  })
  it('asks about an older or undated copy', () => {
    expect(planImport([incoming({ updatedAt: '2026-09-01T00:00:00Z', card_data: { x: 1 } })], kept)[0].action).toBe('ask')
    expect(planImport([incoming({ updatedAt: null, card_data: { x: 1 } })], kept)[0].action).toBe('ask')
  })
  it('matches by name when the ids differ (another browser, Bridge Classroom)', () => {
    const p = planImport([incoming({ id: 'other-id', name: 'With Lee', updatedAt: '2026-10-09T00:00:00Z', card_data: { x: 1 } })], kept)[0]
    expect([p.action, p.target.id]).toEqual(['replace', 'b'])
  })
})
