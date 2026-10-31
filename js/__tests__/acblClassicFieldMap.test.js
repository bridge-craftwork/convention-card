import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import { PDFDocument, PDFCheckBox } from 'pdf-lib'
import { setAssetLoader, TEMPLATE_FILES, FONT_FILE } from '../assets.js'
import { renderAcblPdfBytes, ACBL_FIELD_MAPS } from '../acblClassicFillPdf.js'

// Boxes the Classic map once sent to the wrong place: the major and 1♣ jump
// raises were crossed between the Major and Minor columns, major Weak landed
// on the vs-takeout-double Jump Shift box, and a "fit" jump shift ticked
// Drury's Fit box.
const ROOT = path.resolve(__dirname, '../..')

const checked = doc => doc.getForm().getFields()
  .filter(f => f instanceof PDFCheckBox && f.isChecked()).map(f => f.getName())

async function ticked(card_data) {
  const blank = await PDFDocument.load(await renderAcblPdfBytes({ name: 'x', card_data: {} }, 'classic'))
  const was = new Set(checked(blank))
  const doc = await PDFDocument.load(await renderAcblPdfBytes({ name: 'x', card_data }, 'classic'))
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
})
