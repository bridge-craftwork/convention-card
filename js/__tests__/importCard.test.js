import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import { importCard, detectFormat } from '../importCard.js'
import { encodeCardForUrl } from '../handoff.js'
import { setAssetLoader, TEMPLATE_FILES, FONT_FILE } from '../assets.js'
import { renderAcblPdfBytes } from '../acblClassicFillPdf.js'

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
    expect(card).toEqual({ format: 'card', name: 'Our card', description: 'With Pat', card_data: SEED })
  })

  it('reads bare card_data, named from its metadata', async () => {
    const card = await importCard(SEED)
    expect(card.card_data).toBe(SEED)
    expect(card.name).toBe(SEED.metadata.name)
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
    expect(card.card_data).toEqual(SEED)
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
      expect(card.card_data).toEqual(SEED)
    })

    it('refuses a PDF with no card inside', async () => {
      const blank = fs.readFileSync(path.join(ROOT, 'assets/templates', TEMPLATE_FILES.classic))
      await expect(importCard(blank)).rejects.toThrow(/no card inside/)
    })
  })
})
