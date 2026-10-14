import { describe, it, expect } from 'vitest'
import { PDFDocument, StandardFonts, pushGraphicsState, popGraphicsState, concatTransformationMatrix, drawObject } from 'pdf-lib'
import { readBridgodexPdf, BRIDGODEX_PDF_FIELDS } from '../bridgodexPdf.js'
import { importCard } from '../importCard.js'
import { BRIDGODEX_MAP } from '../spec.js'
import LAYOUT from '../../spec/formats/bridgodex-pdf-layout.json' with { type: 'json' }

const FIELDS = LAYOUT.fields.map(([name, kind, x, y, w, h]) => ({ name, kind, x, y, w, h }))

/**
 * A PDF drawn the way Bridgodex's flattened export is: every box placed as
 * a form XObject where the box sits (a ticked one with a mark, an unticked
 * one empty), and each value drawn as page text at its box. `on` lists
 * ticked boxes, `text` maps boxes to values; `page`, `s`, `dx`, `dy` put
 * the card on other paper.
 */
async function bridgodexPdf({ on = [], text = {}, page = [576, 612], s = 1, dx = 0, dy = 0 } = {}) {
  const doc = await PDFDocument.create()
  const p = doc.addPage(page)
  const font = await doc.embedFont(StandardFonts.Helvetica)
  FIELDS.forEach((f, i) => {
    const mark = f.kind === 'check' && on.includes(f.name)
    const body = mark ? '0 0 m 6 6 l 6 0 m 0 6 l S 0 0 m 6 6 l S' : ''
    const ref = doc.context.register(doc.context.stream(body, { Type: 'XObject', Subtype: 'Form', BBox: [0, 0, f.w, f.h] }))
    const name = p.node.newXObject(`FlatWidget-${i}`, ref).asString().slice(1)
    // Bridgodex draws the values in the stream that places the boxes.
    p.pushOperators(pushGraphicsState(), concatTransformationMatrix(s, 0, 0, s, dx + s * f.x, dy + s * f.y), drawObject(name), popGraphicsState())
  })
  for (const [name, value] of Object.entries(text)) {
    const f = FIELDS.find(f => f.name === name)
    p.drawText(value, { x: dx + s * (f.x + 1), y: dy + s * (f.y + 1), size: 8 * s, font })
  }
  return doc.save({ useObjectStreams: false })
}

describe('bridgodex-pdf-layout.json', () => {
  it('names only boxes Bridgodex has', () => {
    const keys = new Set(BRIDGODEX_PDF_FIELDS.filter(n => n.includes('#')).map(n => n.split('#')[1].replace(/-\d+$/, '')))
    // Every box the map reads is somewhere on the card.
    const mapped = Object.entries(BRIDGODEX_MAP)
      .filter(([, v]) => v && typeof v === 'object' && !Array.isArray(v))
      .flatMap(([, block]) => Object.keys(block))
    const unknown = mapped.filter(k => !keys.has(k) && /^[a-z0-9_]+$/.test(k))
    expect(unknown).toEqual([])
  })
})

describe('readBridgodexPdf', () => {
  it('reads ticks and values by position', async () => {
    const bytes = await bridgodexPdf({
      on: ['1_no_trump#2c_stayman', 'overview#forcing_2c', 'majors#drury_2c'],
      text: { '1_no_trump#a_range_min': '15', '1_no_trump#a_range_max': '17', 'overview#general_approach': '2/1 Game Force' },
    })
    const { settings } = await readBridgodexPdf(bytes)
    expect(settings).toEqual({
      '1_no_trump': { '2c_stayman': 'on', a_range_min: '15', a_range_max: '17' },
      overview: { forcing_2c: 'on', general_approach: '2/1 Game Force' },
      majors: { drury_2c: 'on' },
    })
  })

  it('reads a lead circle as the position of the card led', async () => {
    const bytes = await bridgodexPdf({ text: { 'leads_vs_suits#honor_leads_AKx-2': 'O' } })
    const { settings } = await readBridgodexPdf(bytes)
    expect(settings.leads_vs_suits).toEqual({ honor_leads_AKx: 2 })
  })

  it('finds the card when it is moved and scaled onto other paper', async () => {
    const bytes = await bridgodexPdf({ page: [612, 792], s: 1.0625, dx: 0, dy: 90, on: ['other#nmf'], text: { 'doubles#negative_thru': '3S' } })
    const { settings } = await readBridgodexPdf(bytes)
    expect(settings).toEqual({ other: { nmf: 'on' }, doubles: { negative_thru: '3S' } })
  })

  it('is null for a PDF that is not Bridgodex’s', async () => {
    const doc = await PDFDocument.create()
    doc.addPage([576, 612]).drawText('hello')
    expect(await readBridgodexPdf(await doc.save())).toBeNull()
  })

  it('imports through importCard as a card', async () => {
    const bytes = await bridgodexPdf({ on: ['1_no_trump#2c_stayman', 'overview#1nt_open_strong'] })
    const card = await importCard(bytes)
    expect(card.format).toBe('pdf')
    expect(card.description).toBe('Imported from a Bridgodex PDF')
    expect(card.card_data.general.nt_open_style).toBe('strong')
    expect(card.card_data._bridgeodex_raw['1_no_trump']['2c_stayman']).toBe('on')
  })
})
