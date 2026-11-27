import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import { PDFDocument, PDFTextField } from 'pdf-lib'
import { setAssetLoader, TEMPLATE_FILES, FONT_FILE } from '../assets.js'
import { renderAcblPdfBytes, withInk } from '../acblClassicFillPdf.js'

// What the card says prints in green, as BBO's card shows it (#140), or in
// black when asked. The colour is in each box's default appearance, so the
// box draws in it and a viewer types in it.
const ROOT = path.resolve(__dirname, '../..')
const file = (dir, name) => fs.readFileSync(path.join(ROOT, 'assets', dir, name))
const CARD = { name: 'x', card_data: { metadata: { partner_names: 'Pat Lee - Sam Kim' }, notrump: { one_nt: { range_min: 15, range_max: 17 } } } }
const GREEN = '0.18 0.49 0.196 rg'

async function colours(bytes) {
  const pdf = await PDFDocument.load(bytes)
  const seen = new Set()
  for (const f of pdf.getForm().getFields()) {
    if (!(f instanceof PDFTextField)) continue
    for (const w of [f.acroField, ...f.acroField.getWidgets()]) {
      const da = w.getDefaultAppearance?.() ?? ''
      seen.add(da.match(/[\d.\s]+(?:rg|g|k)\b/)?.[0].trim())
    }
  }
  return seen
}

describe('withInk', () => {
  it.each([
    ['/Helv 0 Tf 0 g', 'green', `${GREEN} /Helv 0 Tf`],
    ['0 0 1 rg /F1-9816 9 Tf', 'black', '0 g /F1-9816 9 Tf'],
    ['/F1 9 Tf', 'green', `${GREEN} /F1 9 Tf`],
    ['', 'black', '0 g'],
  ])('%j in %s', (da, ink, out) => expect(withInk(da, ink)).toBe(out))
})

describe.each(['classic', 'new'])('the entries\' ink (%s)', template => {
  beforeAll(() => setAssetLoader({ template: n => file('templates', TEMPLATE_FILES[n]), font: () => file('fonts', FONT_FILE) }))

  it('is green unless asked', async () => {
    expect([...await colours(await renderAcblPdfBytes(CARD, template))]).toEqual([GREEN])
  })

  it('is black when asked', async () => {
    expect([...await colours(await renderAcblPdfBytes(CARD, template, { ink: 'black' }))]).toEqual(['0 g'])
  })

  it('refuses an ink it does not know', async () => {
    await expect(renderAcblPdfBytes(CARD, template, { ink: 'blue' })).rejects.toThrow(/No ink/)
  })
})
