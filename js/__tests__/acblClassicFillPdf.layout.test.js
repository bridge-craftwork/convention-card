import { describe, it, expect, beforeAll, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import { PDFDocument, PDFTextField, PDFName, PDFRawStream, decodePDFRawStream } from 'pdf-lib'
import { renderAcblPdfBytes } from '../acblClassicFillPdf.js'
import { TEMPLATE_INK } from '../acblTemplateInk.js'

// Fills the Classic ACBL card with a dense real-world card and checks what
// the export actually DRAWS, read back from each field's appearance stream.
// It guards the three faults found on 2026-09-30:
//   1. descenders clipped: lines placed so low that the field's clip cut off
//      the tails of g, j, p, y ("Strong" printed as "Strona");
//   2. grown boxes written over the card's printed headings and labels;
//   3. grown boxes tracing a white hairline round their edge, cutting
//      through the printed art they crossed.

const PUBLIC = path.resolve(__dirname, '../../../public')
const CARD = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/dense-convention-card.json'), 'utf8'))

// Where Barlow Condensed's glyphs really reach, in em, measured from the
// font file: '(' tops out at 0.763 and 'j' drops to -0.208. Deliberately
// the font's TRUE extent, not the exporter's constants, so a mismatch
// between the two shows up here as clipped ink.
const TRUE_ASCENT = 0.763
const TRUE_DESCENT = 0.208
const EPS = 0.05

const TEMPLATES = {
  classic: 'templates/acbl-classic-2023.pdf',
  new: 'templates/acbl-new.pdf',
}
const docs = {}

const num = '(-?[\\d.]+)'

/** What one widget's appearance stream draws: clip box, font size, line baselines. */
function drawn(widget) {
  const ap = widget.dict.lookup(PDFName.of('AP'))?.lookup(PDFName.of('N'))
  const src = new TextDecoder('latin1').decode(ap instanceof PDFRawStream ? decodePDFRawStream(ap).decode() : ap.getContents())
  // The clip is a 4-corner path closed with `h W n`, in the stream's own
  // coordinates (origin at the widget's lower-left).
  const clip = new RegExp(`${num} ${num} m\\s+${num} ${num} l\\s+${num} ${num} l\\s+${num} ${num} l\\s+h\\s+W`).exec(src)
  const ys = clip ? [2, 4, 6, 8].map(i => Number(clip[i])) : null
  return {
    src,
    clip: ys && { bottom: Math.min(...ys), top: Math.max(...ys) },
    size: Number(/([\d.]+)\s+Tf/.exec(src)?.[1]),
    baselines: [...src.matchAll(new RegExp(`1 0 0 1 ${num} ${num} Tm`, 'g'))].map(m => Number(m[2])),
  }
}

function filledTextFields(doc) {
  return doc.getForm().getFields().filter(f => f instanceof PDFTextField && (f.getText() || '').trim())
}

beforeAll(async () => {
  vi.stubGlobal('fetch', async (url) => {
    const buf = fs.readFileSync(path.join(PUBLIC, String(url).replace(/^\//, '')))
    return { ok: true, status: 200, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) }
  })
  for (const [name, file] of Object.entries(TEMPLATES)) {
    docs[name] = {
      out: await PDFDocument.load(await renderAcblPdfBytes(CARD, name)),
      template: await PDFDocument.load(fs.readFileSync(path.join(PUBLIC, file))),
    }
  }
}, 60000)

/** Widgets the exporter moved, resized or added, with their original rect. */
function movedWidgets({ out, template }) {
  const original = new Map()
  for (const f of template.getForm().getFields()) {
    const r = f.acroField.getWidgets()[0]?.getRectangle()
    if (r) original.set(f.getName(), r)
  }
  const pageOf = new Map()
  out.getPages().forEach((p, i) => {
    const annots = p.node.Annots()
    for (let a = 0; annots && a < annots.size(); a++) pageOf.set(out.context.lookup(annots.get(a)), i)
  })
  const moved = []
  for (const field of filledTextFields(out)) {
    const base = original.get(field.getName().replace(/__bc_line2$/, ''))
    for (const widget of field.acroField.getWidgets()) {
      const rect = widget.getRectangle()
      const added = !base || field.getName().endsWith('__bc_line2')
      if (added || Math.abs(rect.y - base.y) > EPS || Math.abs(rect.height - base.height) > EPS) {
        moved.push({ field, widget, rect, base, page: pageOf.get(widget.dict) })
      }
    }
  }
  return moved
}

describe.each(Object.keys(TEMPLATES))('ACBL %s export: what the fields draw', (name) => {
  const out = () => docs[name].out

  it('fills the card at a legible size', () => {
    const sizes = filledTextFields(out()).map(f => drawn(f.acroField.getWidgets()[0]).size)
    expect(sizes.length).toBeGreaterThan(50)
    const mean = sizes.reduce((a, b) => a + b, 0) / sizes.length
    expect(mean).toBeGreaterThan(8)
  })

  it('keeps every glyph, descenders included, inside the field clip', () => {
    const clipped = []
    for (const field of filledTextFields(out())) {
      for (const widget of field.acroField.getWidgets()) {
        const { clip, size, baselines } = drawn(widget)
        for (const y of baselines) {
          if (y - TRUE_DESCENT * size < clip.bottom - EPS || y + TRUE_ASCENT * size > clip.top + EPS) {
            clipped.push(`${field.getName()}: "${field.getText().split('\n')[0]}" at ${size}pt`)
          }
        }
      }
    }
    expect(clipped).toEqual([])
  })

  it('never writes a grown or added field over the printed card', () => {
    const ink = TEMPLATE_INK[name].map(([page, x, y, w, h, underline]) => ({ page, x, y, w, h, underline: !!underline }))
    const collisions = []
    for (const { field, widget, rect, base, page } of movedWidgets(docs[name])) {
      const { size, baselines } = drawn(widget)
      for (const y of baselines) {
        const bottom = rect.y + y - TRUE_DESCENT * size
        const top = rect.y + y + TRUE_ASCENT * size
        for (const r of ink) {
          if (r.page !== page) continue
          if (Math.min(rect.x + rect.width, r.x + r.w) - Math.max(rect.x, r.x) <= 2) continue
          // A field may sit on its own underline.
          if (r.underline && base && r.y >= base.y - 3 && r.y <= base.y + base.height / 2) continue
          if (Math.min(top, r.y + r.h) - Math.max(bottom, r.y) > EPS) {
            collisions.push(`${field.getName()} "${field.getText().split('\n')[0]}" over ink at y=${r.y}`)
          }
        }
      }
    }
    expect(collisions).toEqual([])
  })

  it('paints nothing but text in a grown or added field', () => {
    // No fill (`f`) and no stroke (`S`): either would paint over the
    // printed art the box now overlaps.
    const painted = movedWidgets(docs[name])
      .filter(({ widget }) => /\n(f|S|B)\n/.test(drawn(widget).src))
      .map(({ field }) => field.getName())
    expect(painted).toEqual([])
  })
})
