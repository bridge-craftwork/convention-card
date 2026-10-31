import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { PDFDocument, PDFRef } from 'pdf-lib'
import { setAssetLoader, TEMPLATE_FILES, FONT_FILE } from '../assets.js'
import { renderAcblPdfBytes } from '../acblClassicFillPdf.js'
import { notesPageContent } from '../notesPage.js'
import { MARK_TEXT } from '../pdfMark.js'
import { importCard } from '../importCard.js'

const ROOT = path.resolve(import.meta.dirname, '../..')
const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'web/src/cards/2-1-intermediate.json')))
const card = { name: 'Test card', card_data: raw.card_data || raw }

// A PDF ends after the card page unless a second page is asked for:
// smaller, quicker, and what a shared or printed card needs.
describe('the page after the card', () => {
  beforeAll(() => setAssetLoader({
    template: name => fs.readFileSync(path.join(ROOT, 'assets/templates', TEMPLATE_FILES[name])),
    font: () => fs.readFileSync(path.join(ROOT, 'assets/fonts', FONT_FILE)),
  }))

  it('leaves the Classic scoresheet out by default, with its fields and objects', async () => {
    const one = await renderAcblPdfBytes(card, 'classic')
    const two = await renderAcblPdfBytes(card, 'classic', { secondPage: 'acbl' })
    const [a, b] = await Promise.all([PDFDocument.load(one), PDFDocument.load(two)])
    expect(a.getPageCount()).toBe(1)
    expect(b.getPageCount()).toBe(2)
    expect(a.getForm().getFields().length).toBeLessThan(b.getForm().getFields().length)
    expect(one.length).toBeLessThan(two.length * 0.85)
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

  it('refuses a second page it does not have', async () => {
    await expect(renderAcblPdfBytes(card, 'classic', { secondPage: 'teams' })).rejects.toThrow(/No second page/)
  })

  const noted = {
    name: 'Noted',
    card_data: {
      ...card.card_data,
      metadata: { partner_names: 'Rick – Pat' },
      notes: {
        notrump_notes: 'After 1NT–2♣–2♦, 2♥ is weak with both majors.',
        supplementary: '# Relays after 1♣\n1♦ = 0–7\n\n# Defence to Multi\nDouble = 13+ balanced',
      },
      other_agreements: [{ id: 'bidding_conventions/smolen', section: 'notrump', text: 'Smolen' }, { text: 'Lead the queen from KQ doubleton' }],
    },
  }

  it('adds notes pages after the card, on either template', async () => {
    for (const t of ['classic', 'new']) {
      const pdf = await PDFDocument.load(await renderAcblPdfBytes(noted, t, { secondPage: 'notes', flatten: true }))
      expect(pdf.getPageCount()).toBe(2)
      expect(pdf.getPage(1).getSize()).toEqual(pdf.getPage(0).getSize())
    }
  })

  it('gathers the notes under the spec\'s headings, supplementary pages last', () => {
    const { title, blocks } = notesPageContent(noted)
    expect(title).toBe('Notes: Rick – Pat')
    expect(blocks.map(b => b.heading)).toEqual(['Notrump openings', 'Other conventions', 'Supplementary notes'])
    // A convention named as its own text needs no label
    expect(blocks[0].items).toEqual([{ text: 'Smolen' }, { text: 'After 1NT–2♣–2♦, 2♥ is weak with both majors.' }])
    expect(blocks[1].items).toEqual([{ text: 'Lead the queen from KQ doubleton' }])
    expect(blocks[2].items).toEqual([
      { subheading: 'Relays after 1♣' }, { text: '1♦ = 0–7\n' },
      { subheading: 'Defence to Multi' }, { text: 'Double = 13+ balanced' },
    ])
  })

  it('repeats in full a value the card sets too small to read', () => {
    const long = { card_data: { two_level: { two_clubs: { notes: '2♦ waiting; 2♥ = 0-4 HCP, then 2♠ relays' } } } }
    const { blocks } = notesPageContent(long, { small: ['two_level.two_clubs.notes'] })
    const two = blocks.find(b => b.heading === 'Two-level openings')
    expect(two?.items).toEqual([{ label: '2♣: responses / rebids', text: '2♦ waiting; 2♥ = 0-4 HCP, then 2♠ relays' }])
  })

  it('marks the card page and keeps the names clear of it', async () => {
    for (const t of ['classic', 'new']) {
      const pdf = await PDFDocument.load(await renderAcblPdfBytes(noted, t))
      const field = pdf.getForm().getTextField(t === 'new' ? 'Name.t.1' : 'NAMES')
      expect(field.getText()).toBe('Rick - Pat')
      expect(field.acroField.getWidgets()[0].getRectangle().width).toBeLessThan(160)
    }
    expect(MARK_TEXT).toBe('bridge-craftwork.com/card')
  })
})
