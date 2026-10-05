import { describe, it, expect } from 'vitest'
import { ref, nextTick } from 'vue'
import { useCardEditor } from '../useCardEditor.js'

// A storage adapter in memory, with the shape useCardEditor.js describes.
function memoryStorage({ signedIn = true } = {}) {
  const cards = new Map([['system', { id: 'system', name: 'System', owner_id: null, visibility: 'public', card_data: { notrump: { stayman: { forcing: true } } } }]])
  let next = 1
  const calls = []
  return {
    calls,
    user: ref(signedIn ? { id: 'u1', role: 'member', firstName: 'Pat' } : null),
    async loadDefault() { return structuredClone([...cards.values()].find(c => c.is_primary) || cards.get('system')) },
    async load(id) { calls.push(['load', id]); return structuredClone(cards.get(id)) },
    async listLinks() { return [...cards.values()].filter(c => c.owner_id).map(c => ({ card_id: c.id, card_name: c.name, is_primary: !!c.is_primary })) },
    async save(card, cardData) { calls.push(['save', card.id]); cards.get(card.id).card_data = structuredClone(JSON.parse(JSON.stringify(cardData))) },
    async overwrite(id, { name, cardData }) { Object.assign(cards.get(id), { name, card_data: JSON.parse(JSON.stringify(cardData)) }) },
    async create({ name, cardData }) {
      for (const c of cards.values()) c.is_primary = false
      const id = `c${next++}`
      cards.set(id, { id, name, owner_id: 'u1', visibility: 'private', is_primary: true, card_data: JSON.parse(JSON.stringify(cardData)) })
      return id
    },
    async remove(id) { cards.delete(id) },
    canEdit(card, user) { return !!user && card.owner_id === user.id },
  }
}

describe('the editor state, against a storage adapter', () => {
  it('takes a built-in card off the list without deleting it, when the adapter can', async () => {
    const storage = memoryStorage()
    const linked = new Set(['system'])
    storage.listLinks = async () => [...linked].map(id => ({ card_id: id, card_name: id, is_primary: true }))
    storage.loadDefault = async () => storage.load([...linked][0] || 'system')
    expect(useCardEditor(memoryStorage()).canUnlink).toBe(false)
    storage.unlink = async id => { linked.delete(id) }
    const ed = useCardEditor(storage)
    expect(ed.canUnlink).toBe(true)
    await ed.loadCardForCurrentUser()
    expect(ed.userCardLinks.value.map(l => l.card_id)).toEqual(['system'])
    expect(await ed.unlinkCurrentCard()).toBe(true)
    expect(ed.userCardLinks.value).toEqual([])
    expect(await storage.load('system')).toMatchObject({ id: 'system' })
  })

  it('opens the default card read-only and lets nothing change it', async () => {
    const storage = memoryStorage()
    const ed = useCardEditor(storage)
    await ed.loadCardForCurrentUser()
    expect(ed.currentCard.value.id).toBe('system')
    expect(ed.canEdit.value).toBe(false)
    ed.enterEditMode()
    ed.writeField('notrump.smolen.play', true)
    expect(ed.isDirty.value).toBe(false)
  })

  it('duplicates, edits, saves and reloads through the adapter', async () => {
    const storage = memoryStorage()
    const ed = useCardEditor(storage)
    await ed.loadCardForCurrentUser()
    const id = await ed.duplicateCurrentCard()
    expect(ed.currentCard.value).toMatchObject({ id, name: 'Copy of System' })
    expect(ed.userCardLinks.value.map(l => l.card_id)).toEqual([id])
    ed.enterEditMode()
    ed.writeField('notrump.smolen.play', true)
    await nextTick()
    expect(ed.isDirty.value).toBe(true)
    expect(await ed.saveCard()).toBe(true)
    expect(storage.calls).toContainEqual(['save', id])
    expect(ed.currentCard.value.card_data.notrump.smolen.play).toBe(true)
    expect(ed.isDirty.value).toBe(false)
    expect(ed.viewMode.value).toBe(true)
  })

  it('shares one state per storage adapter, and keeps adapters apart', () => {
    const a = memoryStorage(), b = memoryStorage()
    expect(useCardEditor(a)).toBe(useCardEditor(a))
    expect(useCardEditor(a)).not.toBe(useCardEditor(b))
  })

  it('takes coverage and mastery from the overlays adapter', async () => {
    const storage = memoryStorage()
    const overlays = {
      covered: skill => skill === 'bidding_conventions/stayman',
      mastery: async () => ({ 'bidding_conventions/stayman': 'Mastering' }),
    }
    const ed = useCardEditor(storage, overlays)
    await ed.loadCardForCurrentUser()
    await ed.loadMasteryForCurrentUser()
    const stayman = ed.coverageByEntry.value.get('stayman')
    expect(stayman).toMatchObject({ covered: true, tier: 'Mastering', profStatus: 'good', checked: true })
    // Smolen's catalog row is taught under Stayman, so it is covered too; Jacoby's is not.
    expect(ed.coverageByEntry.value.get('smolen').covered).toBe(true)
    expect(ed.coverageByEntry.value.get('jacoby_transfers').covered).toBe(false)
  })

  it('refuses to create a card with no one signed in', async () => {
    const ed = useCardEditor(memoryStorage({ signedIn: false }))
    await expect(ed.createCard({ name: 'X' })).rejects.toThrow(/signed in/)
  })
})
