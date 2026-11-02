import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'
import { mergeImported } from '../importMerge.js'

// Cards from a BBO file of several, as importCards gives them
const bbo = (name, key, v) => ({
  format: 'bbo', name, description: 'Imported from BBO',
  card_data: { metadata: { name }, v, _bbo_raw: { cc_key: key } },
})

function store(cards = []) {
  const kept = cards.map(c => ({ ...c }))
  let n = 0
  return {
    kept,
    user: ref({ id: 'u' }),
    listLinks: async () => kept.map(c => ({ card_id: c.id })),
    load: async id => kept.find(c => c.id === id),
    create: async ({ name, cardData }) => { const id = `new${++n}`; kept.push({ id, name, card_data: cardData }); return id },
    overwrite: async (id, { name, cardData }) => Object.assign(kept.find(c => c.id === id), { name, card_data: cardData }),
  }
}

const three = () => [bbo('BMW', 'a', 1), bbo('BMW', 'b', 2), bbo('BMW', 'c', 3)]
const never = () => { throw new Error('should not ask') }

describe('importing BBO cards whose names collide', () => {
  it('marks the later ones (BBO), on the card and in its data', async () => {
    const s = store()
    await mergeImported(three(), s, never)
    expect(s.kept.map(c => c.name)).toEqual(['BMW', 'BMW (BBO)', 'BMW (BBO 2)'])
    expect(s.kept.map(c => c.card_data.metadata.name)).toEqual(['BMW', 'BMW (BBO)', 'BMW (BBO 2)'])
  })

  it('leaves a card from another format named as it came', async () => {
    const s = store()
    const other = { format: 'card', name: 'BMW', card_data: { v: 1 } }
    await mergeImported([other, { ...other, card_data: { v: 2 } }], s, () => 'add')
    expect(s.kept.map(c => c.name)).toEqual(['BMW', 'BMW'])
  })

  it('importing the file again changes nothing, renamed or not', async () => {
    const s = store()
    await mergeImported(three(), s, never)
    s.kept[0].name = 'Our BMW'
    s.kept[0].card_data = { ...s.kept[0].card_data, metadata: { name: 'Our BMW' } }
    const out = await mergeImported(three(), s, never)
    expect(out.same).toHaveLength(3)
    expect(s.kept).toHaveLength(3)
  })

  it('"Add as a new card" against a card not from BBO adds it as (BBO)', async () => {
    const s = store([{ id: 'mine', name: 'BMW', card_data: { metadata: { name: 'BMW' }, v: 9 } }])
    const ask = vi.fn(() => 'add')
    await mergeImported([bbo('BMW', 'a', 1)], s, ask)
    expect(ask).toHaveBeenCalledOnce()
    expect(s.kept.map(c => c.name)).toEqual(['BMW', 'BMW (BBO)'])
  })
})

describe('re-importing a BBO card that has changed here', () => {
  const imported = async () => {
    const s = store()
    await mergeImported([bbo('BMW', 'a', 1)], s, never)
    return s
  }
  const edit = (card, v) => { card.card_data = { ...card.card_data, v } }

  it.each([
    ['keep', ['BMW'], [5]],
    ['add', ['BMW', 'BMW (BBO)'], [5, 1]],
    ['replace', ['BMW'], [1]],
  ])('edited: offers all three, and %s does what it says', async (choice, names, values) => {
    const s = await imported()
    edit(s.kept[0], 5)
    const ask = vi.fn(() => choice)
    await mergeImported([bbo('BMW', 'a', 1)], s, ask)
    expect(ask).toHaveBeenCalledOnce()
    expect(s.kept.map(c => c.name)).toEqual(names)
    expect(s.kept.map(c => c.card_data.v)).toEqual(values)
  })

  it('duplicated, and the copy edited: nothing to ask, the copy is left alone', async () => {
    const s = await imported()
    const { _bbo_raw, ...rest } = s.kept[0].card_data
    s.kept.push({ id: 'copy', name: 'Copy of BMW', card_data: { ...rest, v: 7, _bbo_raw: { title: 'BMW' } } })
    const out = await mergeImported([bbo('BMW', 'a', 1)], s, never)
    expect(out.same).toEqual(['new1'])
    expect(s.kept.find(c => c.id === 'copy').card_data.v).toBe(7)
  })

  it('an older duplicate that still has the key: the question is about the original', async () => {
    const s = await imported()
    edit(s.kept[0], 5)
    s.kept.push({ id: 'copy', name: 'Copy of BMW', card_data: { ...s.kept[0].card_data, v: 7 } })
    const ask = vi.fn(() => 'keep')
    await mergeImported([bbo('BMW', 'a', 1)], s, ask)
    expect(ask.mock.calls[0][0].name).toBe('BMW')
  })
})
