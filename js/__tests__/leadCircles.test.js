import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { PDFDocument } from 'pdf-lib'
import { setAssetLoader, TEMPLATE_FILES, FONT_FILE } from '../assets.js'
import { drawLeadCircles } from '../acblClassicFillPdf.js'

const ROOT = path.resolve(import.meta.dirname, '../..')
const template = async name => PDFDocument.load(fs.readFileSync(path.join(ROOT, 'assets/templates', TEMPLATE_FILES[name])))

// The card led from each holding, circled on both ACBL templates (both
// print a "circle card led" grid and have no form field for it).
describe('drawLeadCircles', () => {
  beforeAll(() => setAssetLoader({
    template: name => fs.readFileSync(path.join(ROOT, 'assets/templates', TEMPLATE_FILES[name])),
    font: () => fs.readFileSync(path.join(ROOT, 'assets/fonts', FONT_FILE)),
  }))

  // As the editor saved it before 0.23: honour holdings under their old spelling
  const card = { card_data: { leads: {
    vs_nt: { honors: { lead_choice_KT9x: 3, lead_choice_QT9x: 3 }, length: { lead_choice_xxx: 2 } },
    vs_suits: { honors: { lead_choice_KT9x: null }, length: { lead_choice_xxxx: 2 } },
  } } }

  it('circles them on the Classic, where it prints the holding', async () => {
    const drawn = drawLeadCircles(await template('classic'), card, 'classic')
    expect(drawn.map(d => `${d.side}.${d.pattern}.${d.n}`).sort()).toEqual(['vs_nt.qt9x.3', 'vs_nt.xxx.2', 'vs_suits.xxxx.2'])
  })

  it('reads the old spelling on the New template', async () => {
    const drawn = drawLeadCircles(await template('new'), card, 'new')
    expect(drawn.map(d => `${d.side}.${d.pattern}.${d.n}`).sort()).toEqual(['vs_nt.kt9x.3', 'vs_nt.qt9x.3', 'vs_nt.xxx.2', 'vs_suits.xxxx.2'])
  })

  it('circles each card of a holding led either way (the A and the K of AKx)', async () => {
    const both = { card_data: { leads: { vs_suits: { honors: { lead_choice_akx: [1, 2] } }, vs_nt: { honors: { lead_choice_akxx: [2, 1] } } } } }
    for (const name of ['classic', 'new']) {
      const drawn = drawLeadCircles(await template(name), both, name)
      expect(drawn.map(d => `${d.side}.${d.pattern}.${d.n}`).sort()).toEqual(['vs_nt.akxx.1', 'vs_nt.akxx.2', 'vs_suits.akx.1', 'vs_suits.akx.2'])
    }
  })
})
