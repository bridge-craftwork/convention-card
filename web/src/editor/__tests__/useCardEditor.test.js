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

// A shared card that keeps its versions, as Bridge Classroom's does: a
// save against an old version is refused with the card as it is now.
function sharedStorage(role = 'owner') {
  const storage = memoryStorage()
  const versions = [{ schema_version: '2.0', notrump: { one_nt: { range_min: 15, range_max: 17 }, stayman: { play: true } } }]
  const card = () => ({ id: 's1', name: 'Ours', owner_id: 'u1', role, visibility: 'private', version: versions.length, card_data: structuredClone(versions.at(-1)) })
  Object.assign(storage, {
    versions,
    async loadDefault() { return card() },
    async load() { return card() },
    async listLinks() { return [{ card_id: 's1', card_name: 'Ours', is_primary: true, role }] },
    async save(c, cardData) {
      if (c.version !== versions.length) throw Object.assign(new Error('409'), { conflict: { version: versions.length, card_data: structuredClone(versions.at(-1)) } })
      versions.push(structuredClone(cardData))
    },
    async loadVersion(_id, v) { return structuredClone(versions[v - 1]) },
    canEdit: () => role !== 'viewer',
    // A partner's save, made while this editor has the card open
    partnerSaves(change) { const d = structuredClone(versions.at(-1)); change(d); versions.push(d) },
  })
  return storage
}

describe('a shared card saved while a partner saved too', () => {
  it('merges edits to different fields by itself', async () => {
    const storage = sharedStorage()
    const ed = useCardEditor(storage)
    await ed.loadCardForCurrentUser()
    ed.enterEditMode()
    ed.writeField('notrump.one_nt.range_min', 14)
    storage.partnerSaves(d => { d.notrump.stayman.puppet_2nt = true })
    expect(await ed.saveCard()).toBe(true)
    expect(storage.versions.at(-1).notrump).toEqual({ one_nt: { range_min: 14, range_max: 17 }, stayman: { play: true, puppet_2nt: true } })
    expect(ed.currentCard.value.version).toBe(3)
    expect(ed.pendingMerge.value).toBeNull()
  })

  it('asks about a field both changed, then saves the choice', async () => {
    const storage = sharedStorage()
    const ed = useCardEditor(storage)
    await ed.loadCardForCurrentUser()
    ed.enterEditMode()
    ed.writeField('notrump.one_nt.range_min', 14)
    ed.writeField('notrump.one_nt.range_max', 16)
    storage.partnerSaves(d => { d.notrump.one_nt.range_min = 16; d.notrump.stayman.garbage = true })
    expect(await ed.saveCard()).toBe('conflict')
    expect(ed.pendingMerge.value.conflicts).toEqual([{ path: 'notrump.one_nt.range_min', base: 15, mine: 14, theirs: 16 }])
    expect(storage.versions).toHaveLength(2)
    expect(await ed.finishMerge({ 'notrump.one_nt.range_min': 'theirs' })).toBe(true)
    expect(storage.versions.at(-1).notrump).toEqual({ one_nt: { range_min: 16, range_max: 16 }, stayman: { play: true, garbage: true } })
  })

  it('keeps the edits when the person goes on editing instead', async () => {
    const storage = sharedStorage()
    const ed = useCardEditor(storage)
    await ed.loadCardForCurrentUser()
    ed.enterEditMode()
    ed.writeField('notrump.one_nt.range_min', 14)
    storage.partnerSaves(d => { d.notrump.one_nt.range_min = 16 })
    expect(await ed.saveCard()).toBe('conflict')
    expect(await ed.finishMerge(null)).toBe(false)
    expect(ed.editedCardData.value.notrump.one_nt.range_min).toBe(14)
    expect(ed.isDirty.value).toBe(true)
  })

  it('lets only an owner delete a shared card', async () => {
    for (const [role, can] of [['owner', true], ['editor', false]]) {
      const ed = useCardEditor(sharedStorage(role))
      await ed.loadCardForCurrentUser()
      expect(ed.canDelete.value).toBe(can)
    }
  })
})

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
