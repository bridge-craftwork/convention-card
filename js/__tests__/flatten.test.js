import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { PDFDocument, PDFName, PDFRef, PDFRawStream, decodePDFRawStream } from 'pdf-lib'
import { setAssetLoader, TEMPLATE_FILES, FONT_FILE } from '../assets.js'
import { renderAcblPdfBytes } from '../acblClassicFillPdf.js'

const ROOT = path.resolve(import.meta.dirname, '../..')
const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'web/src/cards/2-1-intermediate.json')))
const card = { name: 'test', card_data: raw.card_data || raw }

// A flattened card (#79): its ticks drawn at the size of their boxes, and
// no page listing an annotation flatten() deleted.
describe('renderAcblPdfBytes with flatten', () => {
  beforeAll(() => setAssetLoader({
    template: name => fs.readFileSync(path.join(ROOT, 'assets/templates', TEMPLATE_FILES[name])),
    font: () => fs.readFileSync(path.join(ROOT, 'assets/fonts', FONT_FILE)),
  }))

  for (const template of ['classic', 'new']) {
    it(`flattens the ${template} card with its ticks and no dangling annotations`, async () => {
      const pdf = await PDFDocument.load(await renderAcblPdfBytes(card, template, { flatten: true }))
      expect(pdf.getForm().getFields()).toHaveLength(0)
      for (const page of pdf.getPages()) {
        for (const ref of page.node.Annots()?.asArray() || []) {
          expect(ref instanceof PDFRef ? pdf.context.lookup(ref) : ref).toBeTruthy()
        }
      }
      // Each Classic tick (a ZapfDingbats glyph) is drawn at least 10pt
      // wide, as its box is, not in the corner at the size its appearance
      // was drawn. (The New card's appearances already fit their boxes.)
      if (template !== 'classic') return
      const xobjects = pdf.getPages()[0].node.Resources().lookup(PDFName.of('XObject'))
      const ticks = xobjects.keys().filter(k => k.asString().startsWith('/FlatWidget'))
        .map(k => xobjects.lookup(k))
        .filter(s => s instanceof PDFRawStream && Buffer.from(decodePDFRawStream(s).decode()).toString('latin1').includes('ZaDb'))
      expect(ticks.length).toBeGreaterThan(5)
      for (const s of ticks) {
        const bbox = s.dict.lookup(PDFName.of('BBox')).asRectangle()
        const scale = s.dict.lookup(PDFName.of('Matrix'))?.asArray()[0].asNumber() ?? 1
        expect(bbox.width * scale).toBeGreaterThan(10)
      }
    })
  }
})
