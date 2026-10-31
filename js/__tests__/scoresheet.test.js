import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { PDFDocument, PDFRef } from 'pdf-lib'
import { setAssetLoader, TEMPLATE_FILES, FONT_FILE } from '../assets.js'
import { renderAcblPdfBytes } from '../acblClassicFillPdf.js'
import { importCard } from '../importCard.js'

const ROOT = path.resolve(import.meta.dirname, '../..')
const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'web/src/cards/2-1-intermediate.json')))
const card = { name: 'Test card', card_data: raw.card_data || raw }

// A PDF ends after the card page unless a scoresheet is asked for: smaller,
// quicker, and what a shared or printed card needs.
describe('the scoresheet after the card', () => {
  beforeAll(() => setAssetLoader({
    template: name => fs.readFileSync(path.join(ROOT, 'assets/templates', TEMPLATE_FILES[name])),
    font: () => fs.readFileSync(path.join(ROOT, 'assets/fonts', FONT_FILE)),
  }))

  it('leaves the Classic scoresheet out by default, with its fields and objects', async () => {
    const one = await renderAcblPdfBytes(card, 'classic')
    const two = await renderAcblPdfBytes(card, 'classic', { scoresheet: 'acbl' })
    const [a, b] = await Promise.all([PDFDocument.load(one), PDFDocument.load(two)])
    expect(a.getPageCount()).toBe(1)
    expect(b.getPageCount()).toBe(2)
    expect(a.getForm().getFields().length).toBeLessThan(b.getForm().getFields().length)
    expect(one.length).toBeLessThan(two.length * 0.85)
    expect((await PDFDocument.load(await renderAcblPdfBytes(card, 'classic', { scoresheet: true }))).getPageCount()).toBe(2)
  })

  it('writes no object that nothing refers to, and none that is missing', async () => {
    const pdf = await PDFDocument.load(await renderAcblPdfBytes(card, 'classic', { flatten: true }))
    for (const [, obj] of pdf.context.enumerateIndirectObjects()) {
      const refs = String(obj?.dict ?? obj).match(/\d+ 0 R/g) || []
      for (const r of refs) expect(pdf.context.lookup(PDFRef.of(Number(r.split(' ')[0])))).toBeDefined()
    }
  })

  it('still carries the card, so a one-page PDF imports', async () => {
    const back = await importCard(await renderAcblPdfBytes(card, 'classic'))
    expect(back.card_data.notrump).toEqual(expect.objectContaining({ stayman: expect.anything() }))
  })

  it('refuses a scoresheet it does not have', async () => {
    await expect(renderAcblPdfBytes(card, 'classic', { scoresheet: 'teams' })).rejects.toThrow(/No scoresheet/)
  })
})
