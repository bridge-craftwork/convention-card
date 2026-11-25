import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import { PDFDocument, PDFName, PDFDict } from 'pdf-lib'
import { setAssetLoader, TEMPLATE_FILES, FONT_FILE, BOLD_FONT_FILE } from '../assets.js'
import { renderAcblPdfBytes } from '../acblClassicFillPdf.js'
import { readCardFromPdf } from '../acblPdfImport.js'

// The card's names and general approach are set in semibold, a size up
// where their line has room; without a semibold font they stay regular.
const ROOT = path.resolve(__dirname, '../..')
const file = (dir, name) => fs.readFileSync(path.join(ROOT, 'assets', dir, name))
const loader = bold => setAssetLoader({
  template: n => file('templates', TEMPLATE_FILES[n]),
  font: () => file('fonts', FONT_FILE),
  boldFont: bold ? () => file('fonts', BOLD_FONT_FILE) : null,
})
const CARD = { name: 'x', card_data: { metadata: { partner_names: 'Pat Lee - Sam Kim' }, general: { system: '2/1 Game Forcing' }, notrump: { one_nt: { range_min: 15, range_max: 17 } } } }
const HEADLINES = { classic: ['NAMES', 'GENERAL APPROACH'], new: ['Name.t.1', 'OV.t.1'] }

// The base fonts a field's appearance stream draws with
async function fontsOf(bytes, name) {
  const pdf = await PDFDocument.load(bytes)
  const ap = pdf.context.lookup(pdf.getForm().getTextField(name).acroField.getWidgets()[0].getNormalAppearance())
  const fonts = ap.dict.lookup(PDFName.of('Resources'), PDFDict).lookup(PDFName.of('Font'), PDFDict)
  return fonts.values().map(ref => String(pdf.context.lookup(ref).get(PDFName.of('BaseFont'))))
}

describe.each(['classic', 'new'])('the headline lines (%s)', template => {
  beforeAll(() => loader(true))

  it('are semibold, and the other boxes regular', async () => {
    const bytes = await renderAcblPdfBytes(CARD, template, { flatten: false })
    for (const name of HEADLINES[template]) expect((await fontsOf(bytes, name)).join()).toMatch(/SemiBold/)
    expect((await fontsOf(bytes, template === 'classic' ? 'to_4' : '1NT.t.1')).join()).not.toMatch(/SemiBold/)
  })

  it('read back as they went in', async () => {
    const read = await readCardFromPdf(await renderAcblPdfBytes(CARD, template, { flatten: false }))
    expect(read.card_data.metadata.partner_names).toBe('Pat Lee - Sam Kim')
    expect(read.card_data.settings?.general?.system ?? read.card_data.general?.system).toBe('2/1 Game Forcing')
    expect(read.report.edits).toEqual([])
  })

  it('stay regular with no semibold font', async () => {
    loader(false)
    const bytes = await renderAcblPdfBytes(CARD, template, { flatten: false })
    expect((await fontsOf(bytes, HEADLINES[template][0])).join()).not.toMatch(/SemiBold/)
    loader(true)
  })
})
