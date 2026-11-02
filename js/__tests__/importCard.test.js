import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import { importCard, importCards, detectFormat } from '../importCard.js'
import { planImport } from '../cardBundle.js'
import { recogniseOnImport } from '../recogniseConventions.js'
import { FIELDS } from '../spec.js'
import { encodeCardForUrl } from '../handoff.js'
import { setAssetLoader, TEMPLATE_FILES, FONT_FILE } from '../assets.js'
import { renderAcblPdfBytes } from '../acblClassicFillPdf.js'
import { upgradeCardData } from '../migrate.js'

const ROOT = path.resolve(__dirname, '../..')
const DENSE = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/dense-convention-card.json'), 'utf8'))
const SEED = JSON.parse(fs.readFileSync(path.join(ROOT, 'crates/bridge-card/tests/fixtures/21_intermediate_card.json'), 'utf8'))
const BBSA = fs.readFileSync(path.join(ROOT, 'crates/bridge-card/tests/fixtures/bbsa/21GF-DEFAULT.bbsa'), 'utf8')
const EXPORT = {
  schema: 'bridge-classroom/card_data@v1',
  name: 'Our card',
  description: 'With Pat',
  exportedAt: '2026-10-01T00:00:00Z',
  card_data: SEED,
}
// SEED is a saved 1.0 card: every reader gives it back in schema 2.0.
const SEED_2 = upgradeCardData(SEED)

describe('detectFormat', () => {
  it("tells the editor's own JSON from bridgeodex's", () => {
    expect(detectFormat(EXPORT)).toBe('card')
    expect(detectFormat(SEED)).toBe('card')
    expect(detectFormat(DENSE)).toBe('card')
    expect(detectFormat({ settings: { carding: {} }, notes: '' })).toBe('bridgeodex')
    expect(detectFormat({ source: 'bbo-acbl', cards: [] })).toBe('bbo')
  })

  it('reads text and bytes', async () => {
    expect(detectFormat(JSON.stringify(EXPORT))).toBe('card')
    expect(detectFormat(new TextEncoder().encode(JSON.stringify(SEED)))).toBe('card')
    expect(detectFormat(BBSA)).toBe('bbsa')
    const handoff = await encodeCardForUrl({ card_data: SEED })
    expect(detectFormat(handoff)).toBe('handoff')
    expect(detectFormat(`https://bridge-craftwork.com/card/#import=${handoff}`)).toBe('handoff')
    expect(detectFormat(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]))).toBe('pdf')
  })

  it('knows when it is not a card', () => {
    expect(detectFormat('hello')).toBe(null)
    expect(detectFormat({ hello: 1 })).toBe(null)
    expect(detectFormat('{ not json')).toBe(null)
    expect(detectFormat([])).toBe(null)
  })
})

describe('importCard', () => {
  it("reads back the editor's own export unchanged", async () => {
    // It used to go to the bridgeodex importer, which kept 2 of 88 settings.
    const card = await importCard(JSON.stringify(EXPORT))
    expect(card).toEqual({ format: 'card', name: 'Our card', description: 'With Pat', card_data: SEED_2 })
    expect(card.card_data.schema_version).toBe('2.0')
  })

  it('reads bare card_data, named from its metadata', async () => {
    const card = await importCard(SEED)
    expect(card.card_data).toEqual(SEED_2)
    expect(card.name).toBe(SEED.metadata.name)
    // A card already in 2.0 comes back as it was.
    expect((await importCard(SEED_2)).card_data).toBe(SEED_2)
  })

  it('reads a .bbsa file, named by the caller', async () => {
    const card = await importCard(BBSA, { name: '21GF-DEFAULT' })
    expect(card.format).toBe('bbsa')
    expect(card.name).toBe('21GF-DEFAULT')
    expect(card.report.mapped).toBeGreaterThan(0)
    expect(card.card_data.notrump).toBeTruthy()
  })

  it('reads a hand-off', async () => {
    const handoff = await encodeCardForUrl({ name: 'Handed over', card_data: SEED })
    const card = await importCard(`…/card/#import=${handoff}`)
    expect(card.name).toBe('Handed over')
    expect(card.card_data).toEqual(SEED_2)
  })

  it('honours `from` over the guess', async () => {
    const card = await importCard({ carding: {} }, { from: 'bridgeodex' })
    expect(card.format).toBe('bridgeodex')
    await expect(importCard(SEED, { from: 'word' })).rejects.toThrow(/Unknown format/)
  })

  it('says what it reads when it cannot read the input', async () => {
    await expect(importCard({ hello: 1 })).rejects.toThrow(/\.bbsa/)
  })

  describe('a PDF it wrote', () => {
    beforeAll(() => {
      setAssetLoader({
        template: name => fs.readFileSync(path.join(ROOT, 'assets/templates', TEMPLATE_FILES[name])),
        font: () => fs.readFileSync(path.join(ROOT, 'assets/fonts', FONT_FILE)),
      })
    })

    it('reads the card back out', async () => {
      const bytes = await renderAcblPdfBytes({ name: 'Our card', description: null, card_data: SEED }, 'classic')
      const card = await importCard(bytes)
      expect(card.format).toBe('pdf')
      expect(card.name).toBe('Our card')
      expect(card.card_data).toEqual(SEED_2)
    })

    it('refuses a PDF with no card inside', async () => {
      const blank = fs.readFileSync(path.join(ROOT, 'assets/templates', TEMPLATE_FILES.classic))
      await expect(importCard(blank)).rejects.toThrow(/no card inside/)
    })
  })
})

describe('a BBO file of several cards', () => {
  const bbo = (title, cc_key, fields, extra = {}) => ({ cc_key, title, owner: 'me', stock: false, style: 'ACBL', fields, conventions: {}, leads: {}, ...extra })
  const file = cards => ({ schema_version: '1.1', source: 'bbo-acbl', cards })

  it('reads every card, not just the first', async () => {
    const read = await importCards(file([bbo('A', 'a', { '1NTMin1': '15' }), bbo('B', 'b', { '1NTMin1': '12' })]))
    expect(read.map(r => r.name)).toEqual(['A', 'B'])
    expect(read[0].skipped).toBeUndefined()
  })

  it('reads the same from its text', async () => {
    const read = await importCards(JSON.stringify(file([bbo('A', 'a', { x: '1' }), bbo('B', 'b', { x: '2' })])))
    expect(read.map(r => r.name)).toEqual(['A', 'B'])
  })

  it('keeps cards of one name whose contents differ', async () => {
    const read = await importCards(file([bbo('BMW', 'a', { '2DMin': '5' }), bbo('BMW', 'b', { '2DMin': '11' })]))
    expect(read.map(r => r.card_data._bbo_raw.cc_key)).toEqual(['a', 'b'])
  })

  it('leaves out empty cards and exact copies, and names them', async () => {
    const read = await importCards(file([
      bbo('SAYC', 'stock', { x: '1' }, { stock: true }),
      bbo('Mine', 'm', { y: '1' }),
      bbo('Basic', 'v', {}, { style: 'V2BASIC' }),
      bbo('SAYC', 'own', { x: '1' }),
    ]))
    expect(read.map(r => r.card_data._bbo_raw.cc_key)).toEqual(['m', 'own'])
    expect(read[0].skipped).toEqual({ empty: ['Basic'], copies: ['SAYC'] })
  })

  it('says so when no card has anything in it', async () => {
    await expect(importCards(file([bbo('Basic', 'v', {})]))).rejects.toThrow(/empty: Basic/)
  })

  it('importCard refuses it, rather than reading one card of many', async () => {
    await expect(importCard(file([bbo('A', 'a', { x: '1' }), bbo('B', 'b', { x: '2' })]))).rejects.toThrow(/2 cards.*importCards/)
    expect((await importCard(file([bbo('A', 'a', { x: '1' })]))).name).toBe('A')
  })
})

describe('merging BBO cards of one name', () => {
  const rec = (name, cc_key, v) => ({ name, card_data: { v, _bbo_raw: { cc_key } } })

  it('does not fold them into one kept card', () => {
    const plan = planImport(
      [rec('BMW', 'a', 1), rec('BMW', 'b', 2), rec('BMW', 'c', 3)],
      [{ id: 'k1', name: 'BMW', card_data: rec('BMW', 'a', 1).card_data }, { id: 'k2', name: 'BMW', card_data: rec('BMW', 'b', 2).card_data }],
    )
    expect(plan.map(p => [p.action, p.target?.id ?? null])).toEqual([['same', 'k1'], ['same', 'k2'], ['add', null]])
  })

  it('offers a card kept without a BBO key once, then adds', () => {
    const plan = planImport([rec('BMW', 'a', 1), rec('BMW', 'b', 2)], [{ id: 'k', name: 'BMW', card_data: { v: 9 } }])
    expect(plan.map(p => p.action)).toEqual(['ask', 'add'])
  })
})

describe('conventions named in a BBO card', () => {
  const withText = async text => {
    const r = await importCard({ card_data: { notes: { other_notes: text } } })
    return recogniseOnImport(r.card_data).map(s => s.id)
  }

  it('ticks Reverses, but only asks about a bare Reverse', async () => {
    expect(await withText('Lebensohl/ Reverses // U/U L=L')).toContain('bidding_conventions/reverse_bids')
    expect(await withText('Reverse')).not.toContain('bidding_conventions/reverse_bids')
  })

  it('reads Italian Cue bids as first-or-second-round control bids', async () => {
    const r = await importCard({ card_data: { notes: { other_notes: 'Italian Cue bids below Game' } } })
    expect(recogniseOnImport(r.card_data).map(s => s.id)).toContain('bidding_conventions/control_bids')
    expect(r.card_data.slam.cue_bids.play).toBe(true)
    expect(FIELDS['slam.cue_bids.style'].default).toBe('first_or_second_round')
    expect(await withText('Cue bids below game')).not.toContain('bidding_conventions/control_bids')
  })
})

describe('Parrish relay and Schuler shift named in text', () => {
  const read = async text => {
    const r = await importCard({ card_data: { notes: { other_notes: text } } })
    return { accepted: recogniseOnImport(r.card_data).map(s => s.id), data: r.card_data }
  }

  it('Parrish relay ticks the relay and the 2♥ bust it depends on', async () => {
    const { accepted, data } = await read('Parrish Relay')
    expect(accepted).toEqual(['bidding_conventions/parrish_relay'])
    expect(data.two_level.parrish_bust).toEqual({ relay: true, play: true })
  })

  it('a bare Parrish is only the bust', async () => {
    const { data } = await read('Parrish')
    expect(data.two_level.parrish_bust).toEqual({ play: true })
  })

  it('Schuler shift sets the 2/1 rebid style', async () => {
    const { data } = await read('Schuler shift')
    expect(data.major_openings.two_over_one.rebid_style).toBe('schuler')
  })
})
