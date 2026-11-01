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
    const out = await mergeImported(records, storage, info => { asked.push(info.name); return true })
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

// Tomasz, 2026-10-31: a PDF exported from his card before he renamed it
// "Dimitry". Its record carries the card's id and the old name, so it
// matches Dimitry; the question named "My convention card", and replacing
// put the old name back.
describe('an older copy of a card that has since been renamed', () => {
  const dimitry = [{ id: 'd', name: 'Dimitry', updated_at: '2026-10-31T21:44:56Z', card_data: { v: 2, metadata: { name: 'Dimitry' } } }]
  const file = [{ id: 'd', name: 'My convention card', updatedAt: '2026-10-30T12:54:58Z', card_data: { v: 1, metadata: { name: 'My convention card' } } }]

  it('asks by the name the card has now, and says what the file called it', async () => {
    let info
    await mergeImported(file, memoryStorage(dimitry), i => { info = i; return 'keep' })
    expect(info.name).toBe('Dimitry')
    expect(info.importedName).toBe('My convention card')
  })

  it('replacing takes the file\'s settings and keeps the name', async () => {
    const storage = memoryStorage(dimitry)
    await mergeImported(file, storage, () => 'replace')
    const card = storage.store.get('d')
    expect(card.name).toBe('Dimitry')
    expect(card.card_data).toEqual({ v: 1, metadata: { name: 'Dimitry' } })
  })

  it('"Add as a new card" leaves Dimitry alone', async () => {
    const storage = memoryStorage(dimitry)
    const out = await mergeImported(file, storage, () => 'add')
    expect(storage.store.get('d').card_data.v).toBe(2)
    expect(out.added).toHaveLength(1)
    expect(storage.store.get(out.added[0]).name).toBe('My convention card')
    expect(out.lastId).toBe(out.added[0])
  })

  it('a newer copy still brings its own name', async () => {
    const storage = memoryStorage(dimitry)
    await mergeImported([{ ...file[0], updatedAt: '2026-11-01T00:00:00Z' }], storage, () => { throw new Error('asked') })
    expect(storage.store.get('d').name).toBe('My convention card')
  })
})

describe('the question in the page', () => {
  it('names the card, offers adding it, and Esc keeps it', async () => {
    const { askInDialog } = await import('../src/editor/importDialogs.js')
    let shown
    await askInDialog({ show: c => { shown = c; return Promise.resolve('keep') } })({ name: 'Dimitry', importedName: 'My convention card', ours: 'Oct 31', theirs: 'Oct 30' })
    expect(shown.title).toBe('This file holds an older copy of “Dimitry”.')
    expect(shown.dated[1].what).toMatch(/My convention card/)
    expect(shown.buttons.map(b => b.value)).toEqual(['keep', 'add', 'replace'])
    expect(shown.cancel).toBe('keep')
  })
})

