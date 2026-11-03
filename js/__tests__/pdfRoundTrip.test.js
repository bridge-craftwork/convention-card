import { describe, it, expect, beforeAll, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import { PDFDocument } from 'pdf-lib'
import { setAssetLoader, TEMPLATE_FILES, FONT_FILE } from '../assets.js'
import { renderAcblPdfBytes, ACBL_FIELD_MAPS } from '../acblClassicFillPdf.js'
import { importBboJson, exportBboCard } from '../bbo.js'
import { importCard } from '../importCard.js'

// A card through a PDF and back: one nobody edited returns as it went in, so
// the extension can tell that the copy on BBO is unchanged, and any change
// the reader makes to a setting is in report.edits.
const ROOT = path.resolve(__dirname, '../..')
const DATE = '1793640000'
const TEMPLATES = ['classic', 'new']

const bboCard = (fields, conventions = {}, leads = {}) => ({
  title: 'Pat and Lee',
  style: 'ACBL',
  fields: { names: 'Pat and Lee', bbccSaved: DATE, ...fields },
  conventions,
  leads,
})

const denseBboCard = () => {
  const { card_data } = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/dense-convention-card.json'), 'utf8'))
  const card = exportBboCard(card_data, { name: 'Dense' })
  return { ...card, fields: { ...card.fields, bbccSaved: DATE } }
}

const makePdf = (card, template) => {
  const { name, card_data } = importBboJson({ cards: [card] })
  return renderAcblPdfBytes({ name, card_data }, template)
}

// What the extension does with a PDF: read it, then write the BBO card.
const readBack = async bytes => {
  const read = await importCard(bytes, { from: 'pdf' })
  return { read, out: exportBboCard(read.card_data, { name: read.name }) }
}

const box = (template, card, kind) => ACBL_FIELD_MAPS[template]
  .find(e => e.card === card && e.kind === kind && e.when === undefined && e.value === undefined).pdf

const edited = async (bytes, edit) => {
  const pdf = await PDFDocument.load(bytes)
  edit(pdf.getForm())
  return pdf.save()
}

beforeAll(() => {
  setAssetLoader({
    template: name => fs.readFileSync(path.join(ROOT, 'assets/templates', TEMPLATE_FILES[name])),
    font: () => fs.readFileSync(path.join(ROOT, 'assets/fonts', FONT_FILE)),
  })
})

describe.each(TEMPLATES)('a BBO card through an unedited PDF (%s)', template => {
  const CASES = [
    ['a system naming 2/1, with its box unticked', () => bboCard(
      { approach: '2/1 Game forcing', '1NTMin1': '15', '1NTMax1': '17', majorOther1: 'Bergen raises' },
      { '1NStayman': 'y', 1430: 'y', drury: 'y' },
    )],
    ['Reverse Drury without the Drury box', () => bboCard({ approach: 'x' }, { druryRev: 'y' })],
    ['two preempt styles', () => bboCard({ approach: 'x' }, { preS: 'y', preL: 'y' })],
    ['the dense card', denseBboCard],
  ]

  it.each(CASES)('reads back the same card_data: %s', async (_, make) => {
    const card = make()
    const { read } = await readBack(await makePdf(card, template))
    expect(read.card_data).toEqual(importBboJson({ cards: [card] }).card_data)
    expect(read.report).toMatchObject({ source: 'card', edits: [] })
    expect(read.implied).toBeUndefined()
    expect(read.recognised).toBeUndefined()
  })

  it.each(CASES)('exports the same BBO card, date and all: %s', async (_, make) => {
    const card = make()
    const { out } = await readBack(await makePdf(card, template))
    expect(out.fields).toEqual(card.fields)
    expect(out.conventions).toEqual(card.conventions)
    expect(out.leads).toEqual(card.leads)
    expect(out.fields.bbccSaved).toBe(DATE)
  })
})

describe.each(TEMPLATES)('a BBO card through an edited PDF (%s)', template => {
  const card = () => bboCard({ approach: '2/1 Game forcing', '1NTMin1': '15', '1NTMax1': '17' }, { '1NStayman': 'y' })

  it('takes a changed box, reports it, and drops the date', async () => {
    const tick = box(template, 'major_openings.jump_raise.inv', 'check')
    const bytes = await edited(await makePdf(card(), template), form => form.getCheckBox(tick).check())
    const { read, out } = await readBack(bytes)
    expect(read.report.source).toBe('card+boxes')
    expect(read.report.edits.map(e => e.path)).toEqual(['major_openings.jump_raise.inv'])
    expect(read.card_data.major_openings.jump_raise.inv).toBe(true)
    expect(out.fields.bbccSaved).toBeUndefined()
  })

  it('takes changed text, reports it, and drops the date', async () => {
    const range = box(template, 'notrump.one_nt.range_min', 'text')
    const bytes = await edited(await makePdf(card(), template), form => form.getTextField(range).setText('14'))
    const { read, out } = await readBack(bytes)
    expect(read.report.edits.map(e => e.path)).toEqual(['notrump.one_nt.range_min'])
    expect(read.card_data.notrump.one_nt.range_min).toBe(14)
    expect(out.fields['1NTMin1']).toBe('14')
    expect(out.fields.bbccSaved).toBeUndefined()
  })

  it('changes nothing it does not report', async () => {
    const range = box(template, 'notrump.one_nt.range_min', 'text')
    const { read } = await readBack(await edited(await makePdf(card(), template), form => form.getTextField(range).setText('14')))
    const expected = importBboJson({ cards: [card()] }).card_data
    expected.notrump.one_nt.range_min = 14
    expect(read.card_data).toEqual(expected)
  })
})

describe('a filled-in PDF with no card inside', () => {
  it('still ticks the boxes its text names', async () => {
    const pdf = await PDFDocument.load(fs.readFileSync(path.join(ROOT, 'assets/templates', TEMPLATE_FILES.classic)))
    const form = pdf.getForm()
    const fill = (card, text) => form.getTextField(box('classic', card, 'text')).setText(text)
    fill('notrump.responses.3c', 'Puppet Stayman')
    fill('notrump.one_nt.range_min', '15')
    const read = await importCard(await pdf.save(), { from: 'pdf' })
    expect(read.report.source).toBe('boxes')
    expect(read.implied.map(s => s.field)).toContain('notrump.stayman.puppet_1nt')
    expect(read.card_data.notrump.stayman.puppet_1nt).toBe(true)
  })
})

// Preview PDF renders in a background tab, where a timer takes about a second:
// each pause pdf-lib makes on one costs that second.
describe('rendering a card', () => {
  it.each(TEMPLATES)('waits on no timers (%s)', async template => {
    const { card_data } = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/dense-convention-card.json'), 'utf8'))
    const spy = vi.spyOn(globalThis, 'setTimeout')
    try {
      await renderAcblPdfBytes({ name: 'Dense', card_data }, template)
      expect(spy).not.toHaveBeenCalled()
    } finally {
      spy.mockRestore()
    }
  })
})
