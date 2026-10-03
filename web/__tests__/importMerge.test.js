import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import { mergeImported } from '../src/editor/importMerge.js'

// A storage adapter in memory, as useCardEditor.js describes it.
function memoryStorage(cards) {
  const store = new Map(cards.map(c => [c.id, { ...c }]))
  let n = 0
  return {
    user: ref({ id: 'local' }),
    store,
    listLinks: async () => [...store.values()].map(c => ({ card_id: c.id, card_name: c.name, is_primary: !!c.is_primary })),
    load: async id => ({ ...store.get(id) }),
    create: async ({ name, description, cardData, primary }) => {
      const id = `new${++n}`
      store.set(id, { id, name, description, card_data: cardData, is_primary: primary, updated_at: '2026-10-03T12:00:00Z' })
      return id
    },
    overwrite: async (id, { name, description, cardData }) => {
      store.set(id, { ...store.get(id), name, description, card_data: cardData, updated_at: '2026-10-03T12:00:00Z' })
    },
  }
}

const kept = [{ id: 'a', name: 'With Pat', updated_at: '2026-10-01T10:00:00Z', card_data: { v: 1 } }]

describe('mergeImported', () => {
  it('adds, replaces newer and asks about older', async () => {
    const storage = memoryStorage(kept)
    const asked = []
    const records = [
      { id: 'x', name: 'New partner', card_data: { v: 9 } },
      { id: 'a', name: 'With Pat', updatedAt: '2026-09-01T00:00:00Z', card_data: { v: 0 } },
    ]
    const out = await mergeImported(records, storage, text => { asked.push(text); return true })
    expect(out.added).toHaveLength(1)
    expect(out.keptOurs).toEqual(['a'])
    expect(asked[0]).toMatch(/With Pat/)
    expect(storage.store.get('a').card_data).toEqual({ v: 1 })
    expect(out.summary).toBe('Imported 2 cards: 1 added, 1 kept as you had it.')
  })

  it('uses the imported copy when asked to', async () => {
    const storage = memoryStorage(kept)
    await mergeImported([{ name: 'With Pat', card_data: { v: 7 } }], storage, () => false)
    expect(storage.store.get('a').card_data).toEqual({ v: 7 })
  })

  it('replaces with a newer copy without asking', async () => {
    const storage = memoryStorage(kept)
    const out = await mergeImported([{ id: 'a', name: 'With Pat', updatedAt: '2026-10-02T00:00:00Z', card_data: { v: 2 } }], storage, () => { throw new Error('asked') })
    expect(out.replaced).toEqual(['a'])
  })
})

describe('what the person is told', () => {
  it('nothing for new cards or ones they were asked about', async () => {
    const out = await mergeImported([{ id: 'n', name: 'Brand new', card_data: {} }, { name: 'With Pat', updatedAt: '2026-01-01T00:00:00Z', card_data: { v: 5 } }], memoryStorage(kept), () => true)
    expect(out.matched).toBe(null)
  })
  it('names the cards replaced and the ones already up to date', async () => {
    const storage = memoryStorage([...kept, { id: 'b', name: 'With Lee', updated_at: '2026-10-01T00:00:00Z', card_data: { w: 1 } }])
    const out = await mergeImported([
      { id: 'a', name: 'With Pat', updatedAt: '2026-10-05T00:00:00Z', card_data: { v: 2 } },
      { id: 'b', name: 'With Lee', card_data: { w: 1 } },
    ], storage)
    expect(out.matched).toBe('Replaced with the newer imported copy: With Pat.\nAlready up to date: With Lee.')
  })
})
