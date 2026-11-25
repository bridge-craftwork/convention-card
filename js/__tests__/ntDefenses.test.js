import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import { PDFDocument } from 'pdf-lib'
import { ntHeadingText, ntSystemName, readNtHeading } from '../ntDefenses.js'
import { setAssetLoader, TEMPLATE_FILES, FONT_FILE } from '../assets.js'
import { renderAcblPdfBytes } from '../acblClassicFillPdf.js'
import { readCardFromPdf } from '../acblPdfImport.js'

// The ACBL cards' "vs:" line over each column of the defense to 1NT: which
// 1NTs the column is for, then the defense's name. A defense with no name
// once printed "other", which is what a PDF read back showed in place of
// the "strong" and "weak" typed there.
describe('ntHeadingText', () => {
  it.each([
    ['strong', 'other', null, true, 'Strong'],
    ['weak', null, null, true, 'Weak'],
    ['weak', null, null, false, null],
    ['strong', 'other', 15, true, 'Strong 15+'],
    ['weak', 'natural', null, false, 'Weak: Natural'],
    ['strong', 'cappelletti', null, false, 'Strong: Cappelletti'],
    ['weak', 'multi_landy', 15, false, 'Weak No 15: Multi-Landy'],
    ['strong', 'dont', null, false, 'Strong: DONT'],
    ['strong', 'Meckwell modified', null, false, 'Strong: Meckwell modified'],
    // Too long for the blank: the name is shortened, never the side
    ['strong', 'modified_cappelletti', null, false, 'Strong: Mod. Capp.'],
    // Kept as another card wrote it
    ['strong', 'strong', null, true, 'Strong'],
    ['weak', 'Weak 1NT', null, true, 'Weak'],
    ['strong', 'Strong 14+ (Meckwell)', null, false, 'Strong 14+: Meckwell'],
  ])('%s column, %s, from %s (filled %s): %s', (side, system, includes, filled, heading) => {
    expect(ntHeadingText(side, system, includes, filled)).toBe(heading)
  })
})

describe('readNtHeading', () => {
  it.each([
    ['Strong - Cappelletti', null, 'Cappelletti', false],
    ['strong: capp.', null, 'capp.', false],
    ['Weak (Natural)', null, 'Natural', false],
    ['Strong 15+: Meckwell', 15, 'Meckwell', false],
    ['Weak No 15: Natural', 15, 'Natural', false],
    ['strong', null, null, true],
    ['Meckwell', null, 'Meckwell', false],
  ])('%s', (text, includes, system, label) => {
    expect(readNtHeading(text)).toEqual({ includes, system, label })
  })
})

describe('ntSystemName', () => {
  it('names a spec option, leaves typed text, and has no name for other or a label', () => {
    expect(ntSystemName('multi_landy')).toBe('Multi-Landy')
    expect(ntSystemName('cappelletti')).toBe('Cappelletti')
    expect(ntSystemName('2-suited Landy')).toBe('2-suited Landy')
    expect(ntSystemName('other')).toBe(null)
    expect(ntSystemName('Strong 1NT')).toBe(null)
  })
})

describe('a "vs:" heading typed on the PDF, read back', () => {
  const ROOT = path.resolve(__dirname, '../..')
  beforeAll(() => setAssetLoader({
    template: name => fs.readFileSync(path.join(ROOT, 'assets/templates', TEMPLATE_FILES[name])),
    font: () => fs.readFileSync(path.join(ROOT, 'assets/fonts', FONT_FILE)),
  }))
  const card = { competitive: { vs_1nt_strong: { system: 'other', '2c': 'C and M' }, vs_1nt_weak: { '2c': 'natural' } } }
  const typed = async (strong, weak) => {
    const pdf = await PDFDocument.load(await renderAcblPdfBytes({ name: 'x', card_data: card }, 'classic'))
    const form = pdf.getForm()
    expect([form.getTextField('DEFENSE VS NOTRUMP').getText(), form.getTextField('1').getText()]).toEqual(['Strong', 'Weak'])
    if (strong != null) form.getTextField('DEFENSE VS NOTRUMP').setText(strong)
    if (weak != null) form.getTextField('1').setText(weak)
    return (await readCardFromPdf(await pdf.save())).card_data.competitive
  }

  it('keeps a column that only says strong or weak', async () => {
    const c = await typed('strong', 'weak')
    expect(c.vs_1nt_strong.system).toBe('other')
    expect(c.vs_1nt_weak.system).toBeUndefined()
  })

  it('reads the defense named after the side, and where strong starts', async () => {
    const c = await typed('Strong 15+ - Capp.', 'Weak: Natural')
    expect(c.vs_1nt_strong.system).toBe('cappelletti')
    expect(c.vs_1nt_strong_includes).toBe(15)
    expect(c.vs_1nt_weak.system).toBe('natural')
  })

  it('keeps a name the spec does not know as typed', async () => {
    expect((await typed('Strong: Woolsey', null)).vs_1nt_strong.system).toBe('Woolsey')
  })
})
