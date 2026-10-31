import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import { PDFDocument, PDFCheckBox } from 'pdf-lib'
import { readCardFromPdf } from '../acblPdfImport.js'
import { setAssetLoader, TEMPLATE_FILES, FONT_FILE } from '../assets.js'
import { renderAcblPdfBytes, ACBL_FIELD_MAPS, ACBL_SPLIT_GROUPS } from '../acblClassicFillPdf.js'

// Boxes the Classic map once sent to the wrong place: the major and 1♣ jump
// raises were crossed between the Major and Minor columns, major Weak landed
// on the vs-takeout-double Jump Shift box, and a "fit" jump shift ticked
// Drury's Fit box.
const ROOT = path.resolve(__dirname, '../..')

const checked = doc => doc.getForm().getFields()
  .filter(f => f instanceof PDFCheckBox && f.isChecked()).map(f => f.getName())

async function ticked(card_data, template = 'classic') {
  const blank = await PDFDocument.load(await renderAcblPdfBytes({ name: 'x', card_data: {} }, template))
  const was = new Set(checked(blank))
  const doc = await PDFDocument.load(await renderAcblPdfBytes({ name: 'x', card_data }, template))
  return checked(doc).filter(n => !was.has(n))
}

describe('ACBL Classic field map', () => {
  beforeAll(() => {
    setAssetLoader({
      template: name => fs.readFileSync(path.join(ROOT, 'assets/templates', TEMPLATE_FILES[name])),
      font: () => fs.readFileSync(path.join(ROOT, 'assets/fonts', FONT_FILE)),
    })
  })

  it.each([
    ['major jump raise inv', 'Inv_4', { major_openings: { jump_raise: { inv: true } } }],
    ['major jump raise weak', 'Weak_5', { major_openings: { jump_raise: { weak: true } } }],
    ['major after overcall inv', 'Inv_5', { major_openings: { jump_raise_after_overcall: { inv: true } } }],
    ['major after overcall weak', 'Weak_6', { major_openings: { jump_raise_after_overcall: { weak: true } } }],
    ['1♣ jump raise inv', 'Inv_3', { minor_openings: { one_club: { jump_raise: { inv: true } } } }],
    ['1♣ jump raise weak', 'Weak_4', { minor_openings: { one_club: { jump_raise: { weak: true } } } }],
    ['1♣ after overcall inv', 'Inv_6', { minor_openings: { one_club: { jump_raise_after_overcall: { inv: true } } } }],
    ['1♣ after overcall weak', 'Weak_7', { minor_openings: { one_club: { jump_raise_after_overcall: { weak: true } } } }],
    ['vs takeout double: jump shift weak', 'Weak_3', { vs_to_double: { jump_shift: 'weak' } }],
  ])('%s ticks %s only', async (_label, box, card_data) => {
    expect(await ticked(card_data)).toEqual([box])
  })

  it('a "fit" jump shift does not tick Drury Fit', async () => {
    expect(await ticked({ vs_to_double: { jump_shift: 'fit' } })).toEqual([])
  })

  it('fills no box from two unrelated card fields', () => {
    // A general first-discard field shares its boxes with the vs-suits / vs-NT
    // variants of the same signal; nothing else may share a box.
    const sharedOnPurpose = ['Lavinthal vs Suits', 'Lavinthal vs NT', 'odd/even vs Suits', 'odd/even vs NT']
    for (const [template, map] of Object.entries(ACBL_FIELD_MAPS)) {
      const fieldsByBox = {}
      for (const e of map) (fieldsByBox[e.pdf] ??= new Set()).add(e.card)
      const shared = Object.entries(fieldsByBox)
        .filter(([box, fields]) => fields.size > 1 && !sharedOnPurpose.includes(box))
        .map(([box, fields]) => `${template} ${box}: ${[...fields].join(', ')}`)
      expect(shared).toEqual([])
    }
  })

  // Group A of the unfilled-box audit: boxes whose card field already existed.
  it.each([
    ['classic', 'major 1M-2NT forcing', '2NT  Forcing', { major_openings: { two_nt_response_forcing: true } }],
    ['classic', 'minor 1m-2NT game forcing', '2NT Forcing', { minor_openings: { two_nt_response: 'game_forcing' } }],
    ['classic', 'minor 1m-2NT invitational', 'Inv_8', { minor_openings: { two_nt_response: 'invitational' } }],
    ['classic', 'direct NT overcall Conv text', 'Conv', { nt_overcalls: { direct: { conv_text: 'Sandwich' } } }],
    ['classic', 'balancing NT overcall Conv text', 'Conv_2', { nt_overcalls: { balance: { conv_text: 'Two-suiter' } } }],
    ['classic', 'forcing opening Other text', 'Other', { general: { forcing_opening_other: '1D' } }],
    ['new', '1D unbalanced', '1D.c.4', { minor_openings: { one_diamond: { unbalanced: true } } }],
    ['new', 'overcall jump raise mixed', 'OC.c.16', { overcalls: { responses: { jump_raise: 'mixed' } } }],
    ['new', 'overcalls Conv text', 'OC.c.9', { overcalls: { conv_text: 'Michaels-ish jumps' } }],
    ['new', 'NT overcalls Conv text', 'NTO.c.7', { nt_overcalls: { conv_text: 'Sandwich' } }],
    ['new', 'first discard other, vs NT only', 'SI.c.13', { carding: { first_discard: { other_nt: 'Revolving' } } }],
    ['new', 'alternate 1NT: same responses', '1NT.c.30', { notrump: { one_nt_alt: { same_responses: true } } }],
    ['new', 'alternate 1NT: different responses', '1NT.c.31', { notrump: { one_nt_alt: { same_responses: false } } }],
  ])('%s: %s ticks %s only', async (template, _label, box, card_data) => {
    expect(await ticked(card_data, template)).toEqual([box])
  })

  it.each([
    ['classic', 'to', { nt_overcalls: { direct: { conv_text: 'Sandwich' } } }, 'Sandwich'],
    ['classic', '3NT', { notrump: { gambling_3nt: { description: 'Solid minor' } } }, 'Solid minor'],
    ['new', '1NT.t.36', { notrump: { notes: 'Puppet over 2C' } }, 'Puppet over 2C'],
    ['new', 'SI.t.14', { carding: { first_discard: { notes: 'Suit preference on 2nd discard' } } }, 'Suit preference on 2nd discard'],
  ])('%s: %s carries the text', async (template, box, card_data, text) => {
    const doc = await PDFDocument.load(await renderAcblPdfBytes({ name: 'x', card_data }, template))
    expect(doc.getForm().getTextField(box).getText()).toBe(text)
  })

  it('reads Same Resp: N back as false, a boolean', async () => {
    const bytes = await renderAcblPdfBytes({ name: 'x', card_data: { notrump: { one_nt_alt: { same_responses: true } } } }, 'new')
    const pdf = await PDFDocument.load(bytes)
    pdf.getForm().getCheckBox('1NT.c.30').uncheck()
    pdf.getForm().getCheckBox('1NT.c.31').check()
    const back = await readCardFromPdf(await pdf.save({ updateFieldAppearances: false }))
    expect(back.card_data.notrump.one_nt_alt.same_responses).toBe(false)
  })

  it('reports a Conv box ticked with no text beside it, and stores nothing', async () => {
    const pdf = await PDFDocument.load(await renderAcblPdfBytes({ name: 'x', card_data: {} }, 'new'))
    pdf.getForm().getCheckBox('OC.c.9').check()
    const back = await readCardFromPdf(await pdf.save({ updateFieldAppearances: false }))
    expect(back.card_data.overcalls?.conv_text).toBeUndefined()
    expect(back.report.skipped.map(s => s.box)).toContain('OC.c.9')
  })

  // Group B: free ruled lines under a field's own, written as more of it.
  const LONG = 'Two-suited hands with both majors at least five-four, and strong jump shifts in competition after a double'
  const groups = Object.entries(ACBL_SPLIT_GROUPS).flatMap(([template, gs]) => gs.map(g => [template, g.card, g.fields]))
  it.each(groups)('%s: %s runs on across its lines', async (template, card, fields) => {
    const card_data = {}
    let at = card_data
    const parts = card.split('.')
    parts.slice(0, -1).forEach(k => { at = at[k] = {} })
    at[parts.at(-1)] = LONG
    const form = (await PDFDocument.load(await renderAcblPdfBytes({ name: 'x', card_data }, template))).getForm()
    const lines = fields.map(f => form.getTextField(f).getText() || '')
    expect(lines[1]).not.toBe('') // it reached the second line
    expect(lines.join(' ').replace(/\s+/g, ' ').trim()).toBe(LONG)
  })
})

