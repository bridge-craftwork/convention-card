import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import { PDFDocument, PDFName, PDFHexString } from 'pdf-lib'
import { setAssetLoader, TEMPLATE_FILES, FONT_FILE } from '../assets.js'
import { renderAcblPdfBytes, ACBL_FIELD_MAPS } from '../acblClassicFillPdf.js'
import { readCardFromPdf, mergeTyped } from '../acblPdfImport.js'

// Reading a card back from an ACBL PDF, with what was changed in its boxes
// after export. The edits are made the way a PDF editor makes them: pdf-lib
// changes the form fields and saves, leaving the rest of the file alone.
const ROOT = path.resolve(__dirname, '../..')
const DENSE = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/dense-convention-card.json'), 'utf8'))
const SEED = JSON.parse(fs.readFileSync(path.join(ROOT, 'crates/bridge-card/tests/fixtures/21_intermediate_card.json'), 'utf8'))
const TEMPLATES = ['classic', 'new']

const boxFor = (template, cardPath, kind) =>
  ACBL_FIELD_MAPS[template].find(e => e.card === cardPath && (!kind || e.kind === kind)).pdf

async function edit(bytes, change) {
  const pdf = await PDFDocument.load(bytes)
  await change(pdf.getForm(), pdf)
  return pdf.save({ updateFieldAppearances: false })
}

const exported = {}
beforeAll(async () => {
  setAssetLoader({
    template: name => fs.readFileSync(path.join(ROOT, 'assets/templates', TEMPLATE_FILES[name])),
    font: () => fs.readFileSync(path.join(ROOT, 'assets/fonts', FONT_FILE)),
  })
  for (const t of TEMPLATES) {
    exported[t] = {
      dense: await renderAcblPdfBytes({ name: 'Dense', card_data: DENSE.card_data }, t),
      seed: await renderAcblPdfBytes({ name: 'Seed', card_data: SEED }, t),
    }
  }
})

describe.each(TEMPLATES)('the %s card', template => {
  it('reads an untouched export back as it was, with no edits', async () => {
    for (const [which, card] of [['dense', DENSE.card_data], ['seed', SEED]]) {
      const read = await readCardFromPdf(exported[template][which])
      expect([which, read.report.edits, read.report.skipped]).toEqual([which, [], []])
      expect(read.report.source).toBe('card')
      expect(read.card_data).toEqual(card)
    }
  })

  it('applies a ticked box', async () => {
    const box = boxFor(template, 'notrump.smolen.play', 'check')
    const bytes = await edit(exported[template].seed, form => form.getCheckBox(box).check())
    const read = await readCardFromPdf(bytes)
    expect(read.report.source).toBe('card+boxes')
    expect(read.report.edits).toEqual([{ box, path: 'notrump.smolen.play', from: null, to: true }])
    expect(read.card_data.notrump.smolen.play).toBe(true)
  })

  it('applies an unticked box', async () => {
    const box = boxFor(template, 'notrump.smolen.play', 'check')
    const bytes = await edit(exported[template].dense, form => form.getCheckBox(box).uncheck())
    const read = await readCardFromPdf(bytes)
    expect(read.report.edits).toEqual([{ box, path: 'notrump.smolen.play', from: true, to: false }])
  })

  it('reads a changed number, plus and all', async () => {
    const box = boxFor(template, 'notrump.one_nt.range_min')
    const bytes = await edit(exported[template].dense, form => form.getTextField(box).setText('15+'))
    const read = await readCardFromPdf(bytes)
    expect(read.card_data.notrump.one_nt.range_min).toBe(15)
    expect(read.card_data.notrump.one_nt.range_min_plus).toBe(true)
  })

  it('keeps the suit symbols the box could not show, and takes the typed words', async () => {
    const box = boxFor(template, 'notrump.responses.2s_other')
    // The box reads "Range ask: 2NT rebid shows min, 3C shows max".
    const bytes = await edit(exported[template].dense, form => {
      const f = form.getTextField(box)
      f.setText(`${f.getText().replace(/\s+/g, ' ')} (not vul)`)
    })
    const read = await readCardFromPdf(bytes)
    expect(read.card_data.notrump.responses['2s_other']).toBe('Range ask: 2NT rebid shows min, 3♣ shows max (not vul)')
  })

  it('reports what it cannot read, and does not guess', async () => {
    const box = boxFor(template, 'notrump.one_nt.range_min')
    const bytes = await edit(exported[template].dense, form => form.getTextField(box).setText('fifteen'))
    const read = await readCardFromPdf(bytes)
    expect(read.card_data.notrump.one_nt.range_min).toBe(14)
    expect(read.report.skipped).toEqual([expect.objectContaining({ box, found: 'fifteen' })])
  })

  it('reads a filled-in card with no card inside from its boxes', async () => {
    const bytes = await edit(exported[template].dense, (form, pdf) => {
      pdf.getInfoDict().delete(PDFName.of('BridgeClassroomCard'))
    })
    const read = await readCardFromPdf(bytes)
    expect(read.report.source).toBe('boxes')
    expect(read.card_data.notrump.one_nt.range_min).toBe(14)
    expect(read.card_data.notrump.smolen.play).toBe(true)
    expect(read.card_data.notrump.responses['3d']).toBe('minors, GF, slam interest')
  })
})

describe('readCardFromPdf', () => {
  it('flags a yes/no field printed twice when only one box is ticked', async () => {
    // Jacoby transfers: the Classic card has a 2♦ box and a 2♥ box.
    const boxes = ACBL_FIELD_MAPS.classic.filter(e => e.card === 'notrump.transfers.jacoby').map(e => e.pdf)
    expect(boxes.length).toBe(2)
    const bytes = await edit(exported.classic.dense, form => form.getCheckBox(boxes[0]).uncheck())
    const read = await readCardFromPdf(bytes)
    expect(read.card_data.notrump.transfers.jacoby).toBe(true)
    expect(read.report.skipped[0].reason).toMatch(/only some are ticked/)
  })

  it('reports text typed into a box the editor does not fill', async () => {
    const mapped = new Set(ACBL_FIELD_MAPS.classic.map(e => e.pdf))
    let typed
    const bytes = await edit(exported.classic.seed, form => {
      const free = form.getFields().find(f => f.constructor.name === 'PDFTextField' && !mapped.has(f.getName()) && !f.getText())
      typed = free.getName()
      free.setText('Our own note')
    })
    const read = await readCardFromPdf(bytes)
    expect(read.report.skipped).toContainEqual(expect.objectContaining({ box: typed, found: 'Our own note' }))
  })

  it.each(TEMPLATES)('reads a %s PDF exported before the record of written boxes', async template => {
    // Rewrite the embedded card without `pdf_fields`, as older exports were.
    // The dense card has lines moved into added boxes and enum values
    // written as prose, which the prediction has to account for.
    const bytes = await edit(exported[template].dense, (form, pdf) => {
      const key = PDFName.of('BridgeClassroomCard')
      const payload = JSON.parse(pdf.getInfoDict().get(key).decodeText())
      delete payload.pdf_fields
      pdf.getInfoDict().set(key, PDFHexString.fromText(JSON.stringify(payload)))
    })
    const read = await readCardFromPdf(bytes)
    expect([read.report.edits, read.report.skipped]).toEqual([[], []])
    expect(read.card_data).toEqual(DENSE.card_data)
  })

  it('refuses a blank form', async () => {
    const blank = fs.readFileSync(path.join(ROOT, 'assets/templates', TEMPLATE_FILES.classic))
    expect(await readCardFromPdf(blank)).toBe(null)
  })
})

describe('mergeTyped', () => {
  it('maps the written words back to the card, and keeps what was typed', () => {
    expect(mergeTyped('2♣ asks for majors', '2C asks for majors')).toBe('2♣ asks for majors')
    expect(mergeTyped('2♣ asks', '2C asks, then 2♦ shows')).toBe('2♣ asks, then 2♦ shows')
    expect(mergeTyped('2♣ asks for majors', '2C asks')).toBe('2♣ asks')
    expect(mergeTyped('', 'new text')).toBe('new text')
  })
})
