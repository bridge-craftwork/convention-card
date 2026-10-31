#!/usr/bin/env node
// Field sheets for the ACBL templates: which card field fills each box.
//
//   node scripts/acbl-field-sheets.mjs
//
// For each template, writes docs/acbl-field-sheets/acbl-<template>-fields.pdf:
//   page 1   the blank card, every box outlined and numbered: green when the
//            export fills it, red when nothing does;
//   page 2+  the numbers as a table: the box's name in the template, its kind,
//            the card field that fills it (and the value, for a box that ticks
//            one option), and the spec's label for that field.
// Filled boxes are numbered in the field map's order, which follows the card's
// sections; unfilled boxes come after them, in reading order.
//
// With pdftoppm on the PATH (poppler), also writes a PNG of page 1 beside it.
// Re-run after changing a field map (js/acblClassicFillPdf.js) or a template.

import fs from 'fs'
import path from 'path'
import { execFileSync } from 'child_process'
import { fileURLToPath } from 'url'
import { PDFDocument, rgb } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { setAssetLoader, TEMPLATE_FILES, FONT_FILE } from '../js/assets.js'
import { ACBL_FIELD_MAPS } from '../js/acblClassicFillPdf.js'
import { field } from '../js/spec.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(ROOT, 'docs/acbl-field-sheets')
const NAMES = { classic: 'ACBL Classic (2023)', new: 'ACBL New' }

const FILLED = rgb(0.05, 0.55, 0.25)
const UNFILLED = rgb(0.85, 0.1, 0.1)
const INK = rgb(0.1, 0.1, 0.1)
const GREY = rgb(0.45, 0.45, 0.45)

setAssetLoader({
  template: name => fs.readFileSync(path.join(ROOT, 'assets/templates', TEMPLATE_FILES[name])),
  font: () => fs.readFileSync(path.join(ROOT, 'assets/fonts', FONT_FILE)),
})

// Barlow has no suit glyphs: write suits as letters, as the export does.
const SUITS = { '♣': 'C', '♦': 'D', '♥': 'H', '♠': 'S', '♡': 'H', '♢': 'D', '♤': 'S', '♧': 'C' }
const plain = (font, s) => [...String(s ?? '')].map(c => {
  if (SUITS[c]) return SUITS[c]
  try { font.encodeText(c); return c } catch { return '?' }
}).join('')

// Each box of the template's first page (the card; Classic's second page is a
// scorecard), with every widget's rectangle.
function boxesOf(templateDoc) {
  const page = templateDoc.getPages()[0]
  const boxes = new Map()
  let elsewhere = 0
  for (const f of templateDoc.getForm().getFields()) {
    for (const w of f.acroField.getWidgets()) {
      const onPage = w.P() ? w.P() === page.ref : true
      if (!onPage) { elsewhere++; continue }
      const name = f.getName()
      if (!boxes.has(name)) boxes.set(name, { name, kind: f.constructor.name.replace(/^PDF/, '').replace(/Field$/, ''), rects: [] })
      boxes.get(name).rects.push(w.getRectangle())
    }
  }
  return { page, boxes, elsewhere }
}

async function sheet(template) {
  const templateDoc = await PDFDocument.load(fs.readFileSync(path.join(ROOT, 'assets/templates', TEMPLATE_FILES[template])))
  const { page: cardPage, boxes, elsewhere } = boxesOf(templateDoc)
  const map = ACBL_FIELD_MAPS[template]

  // Number the boxes: filled ones in map order, then the rest top-to-bottom.
  const order = []
  for (const e of map) if (boxes.has(e.pdf) && !order.includes(e.pdf)) order.push(e.pdf)
  const missingFromTemplate = [...new Set(map.filter(e => !boxes.has(e.pdf)).map(e => e.pdf))]
  const { height: H } = cardPage.getSize()
  const unfilled = [...boxes.values()].filter(b => !order.includes(b.name))
    .sort((a, b) => (Math.round((H - a.rects[0].y) / 4) - Math.round((H - b.rects[0].y) / 4)) || a.rects[0].x - b.rects[0].x)
  order.push(...unfilled.map(b => b.name))
  const number = new Map(order.map((n, i) => [n, i + 1]))

  const doc = await PDFDocument.create()
  // A fixed date, so re-running with nothing changed leaves the files unchanged.
  doc.setCreationDate(new Date(0))
  doc.setModificationDate(new Date(0))
  doc.setProducer('scripts/acbl-field-sheets.mjs')
  doc.registerFontkit(fontkit)
  const font = await doc.embedFont(fs.readFileSync(path.join(ROOT, 'assets/fonts', FONT_FILE)))
  const filledCount = order.length - unfilled.length

  // ─── Page 1: the card, numbered ───
  const [card] = await doc.embedPdf(templateDoc, [0])
  const top = 30
  const p1 = doc.addPage([card.width, card.height + top])
  p1.drawPage(card, { x: 0, y: 0 })
  p1.drawText(plain(font, `${NAMES[template]}: every box, numbered`), { x: 18, y: card.height + 12, size: 12, font, color: INK })
  const key = `green: filled by the export (${filledCount})   red: not filled (${unfilled.length})   table on the next pages`
  p1.drawText(key, { x: 18, y: card.height + 2, size: 7.5, font, color: GREY })
  for (const name of order) {
    const color = number.get(name) <= filledCount ? FILLED : UNFILLED
    for (const r of boxes.get(name).rects) {
      p1.drawRectangle({ x: r.x, y: r.y, width: r.width, height: r.height, borderColor: color, borderWidth: 0.6, color, opacity: 0.08, borderOpacity: 0.9 })
      const label = String(number.get(name))
      const w = font.widthOfTextAtSize(label, 4.2)
      p1.drawRectangle({ x: r.x - 0.3, y: r.y + r.height - 0.2, width: w + 0.8, height: 4.6, color: rgb(1, 1, 1), opacity: 0.85 })
      p1.drawText(label, { x: r.x + 0.1, y: r.y + r.height + 0.6, size: 4.2, font, color })
    }
  }

  // ─── Pages 2+: the table ───
  const rows = []
  for (const name of order) {
    const n = number.get(name)
    const entries = map.filter(e => e.pdf === name)
    if (!entries.length) { rows.push({ n, name, kind: boxes.get(name).kind, card: '', label: 'not filled', filled: false }); continue }
    entries.forEach((e, i) => {
      const def = field(e.card)
      const label = def ? def.label : (e.card.startsWith('metadata.') ? 'card metadata' : 'NOT IN THE SPEC')
      const card = e.card + (e.value !== undefined ? ` = ${e.value}` : '')
      rows.push({ n: i ? '' : n, name: i ? '' : name, kind: i ? '' : boxes.get(name).kind, card, label, filled: true, missing: !def && !e.card.startsWith('metadata.') })
    })
  }

  const W = 612, PH = 792, M = 32, size = 7.6, lh = 10
  const cols = [{ x: M, w: 22 }, { x: M + 24, w: 128 }, { x: M + 154, w: 40 }, { x: M + 196, w: 190 }, { x: M + 388, w: W - M - (M + 388) }]
  const fit = (s, w) => { s = plain(font, s); if (font.widthOfTextAtSize(s, size) <= w) return s; while (s.length && font.widthOfTextAtSize(s + '…', size) > w) s = s.slice(0, -1); return s + '…' }
  let pg, y
  const newPage = () => {
    pg = doc.addPage([W, PH]); y = PH - M
    pg.drawText(plain(font, `${NAMES[template]}: boxes and the card fields that fill them`), { x: M, y, size: 11, font, color: INK }); y -= 13
    const notes = [`${order.length} boxes on the card: ${filledCount} filled, ${unfilled.length} not.`]
    if (elsewhere) notes.push(`Page 2 of the template (a scorecard, ${elsewhere} boxes) is not part of the card and is left out.`)
    if (missingFromTemplate.length) notes.push(`The map also names ${missingFromTemplate.length} box(es) this template does not have: ${missingFromTemplate.join(', ')}.`)
    for (const t of notes) { pg.drawText(plain(font, t), { x: M, y, size: 7.5, font, color: GREY }); y -= 9.5 }
    y -= 4
    ;['#', 'Box in the template', 'Kind', 'Card field', 'Spec label'].forEach((h, i) => pg.drawText(h, { x: cols[i].x, y, size, font, color: GREY }))
    y -= 3; pg.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.4, color: GREY }); y -= lh
  }
  newPage()
  for (const r of rows) {
    if (y < M) newPage()
    const color = !r.filled ? UNFILLED : r.missing ? UNFILLED : INK
    const cells = [String(r.n), r.name, r.kind, r.card, r.label]
    cells.forEach((c, i) => pg.drawText(fit(c, cols[i].w), { x: cols[i].x, y, size, font, color: i === 0 ? (r.filled ? FILLED : UNFILLED) : color }))
    y -= lh
  }

  fs.mkdirSync(OUT, { recursive: true })
  const out = path.join(OUT, `acbl-${template}-fields.pdf`)
  fs.writeFileSync(out, await doc.save())
  let png = ''
  try {
    execFileSync('pdftoppm', ['-f', '1', '-l', '1', '-r', '200', '-png', '-singlefile', out, out.replace(/\.pdf$/, '')], { stdio: 'ignore' })
    png = ` and ${path.relative(ROOT, out.replace(/\.pdf$/, '.png'))}`
  } catch { png = ' (no pdftoppm, so no PNG)' }
  console.log(`${template}: ${order.length} boxes, ${filledCount} filled -> ${path.relative(ROOT, out)}${png}`)
}

for (const t of Object.keys(ACBL_FIELD_MAPS)) await sheet(t)
