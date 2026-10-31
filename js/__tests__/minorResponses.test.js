import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import { PDFDocument } from 'pdf-lib'
import { setAssetLoader, TEMPLATE_FILES, FONT_FILE } from '../assets.js'
import { renderAcblPdfBytes } from '../acblClassicFillPdf.js'
import { readCardFromPdf } from '../acblPdfImport.js'
import { importBridgeodexJson, exportBridgodexJson } from '../bridgodex.js'

// The ACBL card's 1♣ and 1♦ "Resp" lines: minor_openings.one_club.responses
// and one_diamond.responses. Bridgodex's 1c_response / 1d_response used to
// fold into the minor-openings notes.
const ROOT = path.resolve(__dirname, '../..')
const card_data = {
  minor_openings: {
    one_club: { responses: 'Jump shifts to a major show 5-4' },
    one_diamond: { responses: '2♣ is game forcing' },
  },
}

describe('1♣ and 1♦ "Resp" lines', () => {
  beforeAll(() => {
    setAssetLoader({
      template: name => fs.readFileSync(path.join(ROOT, 'assets/templates', TEMPLATE_FILES[name])),
      font: () => fs.readFileSync(path.join(ROOT, 'assets/fonts', FONT_FILE)),
    })
  })

  it('Bridgodex 1c_response / 1d_response read into the fields, not the notes', () => {
    const { card_data: c } = importBridgeodexJson({ settings: { minors: {
      '1c_response': 'Jump shifts to a major show 5-4', '1d_response': '2!C is game forcing',
    } }, notes: '' })
    expect(c.minor_openings.one_club.responses).toBe('Jump shifts to a major show 5-4')
    expect(c.minor_openings.one_diamond.responses).toBe('2♣ is game forcing')
    expect(c.notes?.minor_notes || '').not.toMatch(/other responses/)
  })

  it('Bridgodex export writes them back', () => {
    const out = exportBridgodexJson(card_data)
    expect(out.settings.minors['1c_response']).toBe('Jump shifts to a major show 5-4')
    expect(out.settings.minors['1d_response']).toBe('2!C is game forcing')
  })

  it('the ACBL New PDF fills both Resp lines, and reads them back', async () => {
    const bytes = await renderAcblPdfBytes({ name: 'Resp', card_data }, 'new')
    const form = (await PDFDocument.load(bytes)).getForm()
    expect(form.getTextField('1C.t.9').getText()).toBe('Jump shifts to a major show 5-4')
    expect(form.getTextField('1D.t.9').getText()).toMatch(/is game forcing/)
    const back = await readCardFromPdf(bytes)
    const data = back.card_data || back
    expect(data.minor_openings.one_club.responses).toBe('Jump shifts to a major show 5-4')
  })
})
