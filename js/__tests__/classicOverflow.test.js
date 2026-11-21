import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { PDFDocument, PDFName } from 'pdf-lib'
import { setAssetLoader, TEMPLATE_FILES, FONT_FILE } from '../assets.js'
import { renderAcblPdfBytes } from '../acblClassicFillPdf.js'
import { readCardFromPdf } from '../acblPdfImport.js'

// The Classic card: Texas's one box, and the values it has no box for
// (Tomasz's card, 2026-11-20: Texas 4♦/4♥ ticked, and a 2NT note).
const ROOT = path.resolve(import.meta.dirname, '../..')
const SEED = JSON.parse(fs.readFileSync(path.join(ROOT, 'crates/bridge-card/tests/fixtures/21_intermediate_card.json'), 'utf8'))

const cardWith = change => {
  const card_data = structuredClone(SEED)
  change(card_data)
  return { name: 'Test', card_data }
}
const load = async (card, opts) => PDFDocument.load(await renderAcblPdfBytes(card, 'classic', opts))
const text = (pdf, name) => pdf.getForm().getTextField(name).getText() || ''

beforeAll(() => setAssetLoader({
  template: name => fs.readFileSync(path.join(ROOT, 'assets/templates', TEMPLATE_FILES[name])),
  font: () => fs.readFileSync(path.join(ROOT, 'assets/fonts', FONT_FILE)),
}))

describe('the Classic Texas box', () => {
  const texas = t => ({ name: 'Texas', card_data: { schema_version: '2.0', notrump: { texas: t } } })

  it('is ticked by the 4♦ and 4♥ bids, as the editor sets them', async () => {
    const pdf = await load(texas({ play: false, bid_4d: true, bid_4h: true }))
    expect(pdf.getForm().getCheckBox('4d  4h  Transfer').isChecked()).toBe(true)
  })

  it('is ticked by the switch, and empty with neither', async () => {
    const on = await load(texas({ play: true }))
    const off = await load(texas({ play: false, bid_4c: true }))
    expect(on.getForm().getCheckBox('4d  4h  Transfer').isChecked()).toBe(true)
    expect(off.getForm().getCheckBox('4d  4h  Transfer').isChecked()).toBe(false)
  })

  it('unticked in a PDF editor, turns the bids off too', async () => {
    const pdf = await load(texas({ play: false, bid_4d: true, bid_4h: true }))
    pdf.getForm().getCheckBox('4d  4h  Transfer').uncheck()
    const read = await readCardFromPdf(await pdf.save({ updateFieldAppearances: false }))
    expect(read.card_data.notrump.texas).toEqual(expect.objectContaining({ bid_4d: false, bid_4h: false }))
  })
})

describe('a value the Classic has no box for', () => {
  const twoNtNote = (extra = () => {}) => cardWith(cd => {
    cd.notrump = { ...cd.notrump, two_nt: { ...cd.notrump?.two_nt, notes: '3NT: 4♥+5♠' } }
    extra(cd)
  })

  it('takes a free line in its own section, unlabelled there', async () => {
    const pdf = await load(twoNtNote(cd => { cd.notrump.two_nt.three_s_desc = 'puppet' }))
    expect(text(pdf, '3s')).toBe('3NT: 4H+5S')
    expect(pdf.getPageCount()).toBe(1)
  })

  it('goes to the extras lines, labelled, when its section has no room', async () => {
    const pdf = await load(twoNtNote(cd => {
      cd.notrump.two_nt.three_s_desc = 'puppet Stayman, then 3♦ denies a major and 3♥ shows both majors, 3NT neither'
    }))
    expect(text(pdf, '3s')).not.toContain('4H+5S')
    expect(`${text(pdf, '1_5')} ${text(pdf, '2_5')}`).toContain('2NT notes: 3NT: 4H+5S')
  })

  it('goes to a notes page when the extras lines are full', async () => {
    const card = twoNtNote(cd => {
      cd.notrump.two_nt.three_s_desc = 'puppet Stayman, then 3♦ denies a major and 3♥ shows both majors, 3NT neither'
      cd.other_conventions = { ...cd.other_conventions, notes_line_1: 'Inverted minors', notes_line_2: 'Ogust' }
    })
    const one = await load(card)
    expect(one.getPageCount()).toBe(2)
    // After the scoresheet, when that is the second page
    const two = await load(card, { secondPage: 'acbl' })
    expect(two.getPageCount()).toBe(3)
  })

  it('edited on its line in a PDF editor, reads back into its own field', async () => {
    const pdf = await load(twoNtNote(cd => { cd.notrump.two_nt.three_s_desc = 'puppet' }))
    pdf.getForm().getTextField('3s').setText('3NT: 4H+5S and 4C slam try')
    const read = await readCardFromPdf(await pdf.save({ updateFieldAppearances: false }))
    expect(read.card_data.notrump.two_nt.notes).toBe('3NT: 4♥+5♠ and 4C slam try')
    expect(read.card_data.notrump.two_nt.three_s_desc).toBe('puppet')
  })

  it('reads back untouched with no edits', async () => {
    const read = await readCardFromPdf(await renderAcblPdfBytes(twoNtNote(), 'classic'))
    expect([read.report.edits, read.report.skipped]).toEqual([[], []])
  })
})

// Acrobat hides a scrolling field's text behind a "+" when it measures it
// as too long (Rick's tests, 2026-11-21): no field scrolls.
describe('the text fields in Acrobat', () => {
  it.each(['classic', 'new'])('do not scroll on the %s card', async template => {
    const pdf = await PDFDocument.load(await renderAcblPdfBytes({ name: 'Test', card_data: SEED }, template))
    const fields = pdf.getForm().getFields().filter(f => f.constructor.name === 'PDFTextField')
    expect(fields.length).toBeGreaterThan(50)
    expect(fields.filter(f => f.isScrollable())).toEqual([])
  })

  // Preview reads the font and size from the widget only
  it.each(['classic', 'new'])('give each widget its field\'s font and size on the %s card', async template => {
    const pdf = await PDFDocument.load(await renderAcblPdfBytes({ name: 'Test', card_data: SEED }, template))
    const DA = PDFName.of('DA')
    const missing = pdf.getForm().getFields()
      .filter(f => f.constructor.name === 'PDFTextField' && f.acroField.dict.get(DA))
      .filter(f => f.acroField.getWidgets().some(w => String(w.dict.get(DA)) !== String(f.acroField.dict.get(DA))))
      .map(f => f.getName())
    expect(missing).toEqual([])
  })
})

// Acrobat and Chrome type with the embedded font, and leave a letter it
// lacks blank (Rick's test in Chrome, 2026-11-21): a fillable card carries
// the whole font, a flattened one only the letters it uses.
describe('the embedded font', () => {
  const fontBytes = async opts => {
    const pdf = await PDFDocument.load(await renderAcblPdfBytes({ name: 'Test', card_data: SEED }, 'classic', opts))
    const { PDFDict, PDFRawStream, decodePDFRawStream } = await import('pdf-lib')
    const programs = [...pdf.context.enumerateIndirectObjects()]
      .filter(([, o]) => o instanceof PDFDict && /Barlow/.test(String(o.get(PDFName.of('FontName')))))
      .map(([, o]) => o.lookup(PDFName.of('FontFile2')))
      .filter(s => s instanceof PDFRawStream)
      .map(s => decodePDFRawStream(s).decode().length)
    return Math.max(...programs)
  }
  it('is whole on a fillable card, and a subset on a flattened one', async () => {
    const whole = fs.statSync(path.join(ROOT, 'assets/fonts', FONT_FILE)).size
    expect(await fontBytes()).toBeGreaterThan(whole * 0.9)
    expect(await fontBytes({ flatten: true })).toBeLessThan(whole / 4)
  })
})
