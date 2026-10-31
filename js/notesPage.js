// The notes page: a PDF's second-page choice 'notes'. The card page holds
// the agreements; this holds what the card says in words and has no room
// for: the card's notes (the spec's [notes] section, which no ACBL box
// takes), its other_agreements, any value set too small on the card to
// read, and its supplementary pages. Grouped under the [notes] fields'
// headings (fields.toml, `about` and `heading`), on as many pages as it
// takes, in two columns.

import { rgb } from 'pdf-lib'
import { FIELDS, CONVENTIONS } from './spec.js'
import { readPath } from './paths.js'
import { drawMark, markWidth } from './pdfMark.js'

const text = v => (typeof v === 'string' ? v.trim() : '')
const sectionOf = path => path.split('.')[0]

/**
 * What the notes page says: `{ title, blocks: [{ heading, items }] }`,
 * blocks in the spec's [notes] order and empty ones left out. An item is
 * `{ label?, text }` (a labelled value, or a paragraph of notes) or
 * `{ subheading }` (a supplementary page's `# ` line). `small` is the card
 * paths whose values the card page set too small to read.
 */
export function notesPageContent(card, { small = [] } = {}) {
  const data = card?.card_data || {}
  const notePaths = Object.keys(FIELDS).filter(p => p.startsWith('notes.'))
  const home = new Map() // section → the [notes] field it prints under
  for (const p of notePaths) for (const s of FIELDS[p].about || []) home.set(s, p)
  const fallback = 'notes.other_notes'
  const extras = new Map(notePaths.map(p => [p, []]))
  const under = section => extras.get(home.get(section) || fallback)

  for (const path of small) {
    const value = text(readPath(data, path))
    if (value) under(sectionOf(path)).push({ label: FIELDS[path]?.label || path, text: value })
  }
  for (const a of Array.isArray(data.other_agreements) ? data.other_agreements : []) {
    const t = text(a?.text)
    if (!t) continue
    const name = a.id && CONVENTIONS[a.id]?.name
    under(a.section).push(name && name !== t ? { label: name, text: t } : { text: t })
  }

  const blocks = []
  for (const p of notePaths) {
    const items = [...extras.get(p)]
    const own = text(readPath(data, p))
    if (own) items.push(...(p === 'notes.supplementary' ? pagesOf(own) : [{ text: own }]))
    if (items.length) blocks.push({ heading: FIELDS[p].heading || FIELDS[p].label, items })
  }
  const names = text(data.metadata?.partner_names)
  return { title: names ? `Notes: ${names}` : `Notes: ${text(card?.name) || 'convention card'}`, blocks }
}

// Supplementary pages: a line starting with # is a heading
function pagesOf(value) {
  const items = []
  let para = []
  const flush = () => { if (para.length) items.push({ text: para.join('\n') }); para = [] }
  for (const line of value.split('\n')) {
    const m = line.match(/^\s*#+\s*(.*)$/)
    if (m) { flush(); if (m[1].trim()) items.push({ subheading: m[1].trim() }) } else para.push(line)
  }
  flush()
  return items.filter(i => i.subheading || i.text.trim())
}

// ─── Layout ───────────────────────────────────────────────────

const INK = rgb(0.1, 0.1, 0.1)
const GREY = rgb(0.38, 0.38, 0.38)
const GREEN = rgb(0.176, 0.416, 0.31) // the editor's --green-dark
const RED = rgb(0.8, 0.1, 0.1)

const L = {
  margin: 30, gutter: 18, foot: 26,
  title: 13, heading: 10.5, sub: 9.5, body: 9,
  lead: 1.25, // line advance, in sizes
}

/**
 * Add the notes pages to `pdf`, each the size of its first page. `font`
 * is a Unicode font (the condensed field font); suit symbols, which it
 * lacks, are drawn. `markFont` is the Helvetica the mark is set in.
 * `plain`: `font` is that Helvetica too (the field font failed to load),
 * so text outside Latin-1 is simplified or left out.
 */
export function addNotesPages(pdf, card, { font, markFont, small = [], plain = false }) {
  if (plain) font = latin1Only(font)
  const { title, blocks } = notesPageContent(card, { small })
  const { width: W, height: H } = pdf.getPage(0).getSize()
  const colW = (W - 2 * L.margin - L.gutter) / 2
  const bottom = L.margin + L.foot
  let page, col, y

  const newPage = () => {
    page = pdf.addPage([W, H])
    col = 0
    y = H - L.margin
    const mh = 9
    drawMark(page, { x: W - L.margin - markWidth(markFont, mh), y: L.margin - mh / 2, height: mh, font: markFont })
  }
  const colX = () => L.margin + col * (colW + L.gutter)
  // Room for `h` more points, else the next column or page
  const need = h => {
    if (y - h >= bottom) return
    if (col === 0) { col = 1; y = top } else { newPage(); top = y }
  }

  newPage()
  drawRun(page, font, splitSuits(title), L.margin, y - L.title, L.title, GREEN)
  y -= L.title * 1.8
  let top = y
  if (!blocks.length) {
    drawRun(page, font, splitSuits('This card has no notes yet.'), L.margin, y - L.body, L.body, GREY)
    return
  }

  for (const block of blocks) {
    // A heading keeps its first two lines with it
    need(L.heading * 1.6 + L.body * L.lead * 2)
    if (y < top) y -= L.heading * 0.6
    drawRun(page, font, splitSuits(block.heading.toUpperCase()), colX(), y - L.heading, L.heading, GREEN)
    y -= L.heading * 1.3
    page.drawLine({ start: { x: colX(), y }, end: { x: colX() + colW, y }, thickness: 0.5, color: GREEN })
    y -= L.body * 0.5
    for (const item of block.items) {
      if (item.subheading) {
        need(L.sub * 1.5 + L.body * L.lead)
        y -= L.sub * 0.4
        drawRun(page, font, splitSuits(item.subheading), colX(), y - L.sub, L.sub, GREEN)
        y -= L.sub * L.lead
        continue
      }
      for (const [i, para] of item.text.split('\n').entries()) {
        const runs = [...(i === 0 && item.label ? [{ text: `${item.label}: `, color: GREY }] : []), { text: para, color: INK }]
        const lines = wrap(font, runs, L.body, colW)
        if (!lines.length) { y -= L.body * 0.6; continue }
        for (const line of lines) {
          need(L.body * L.lead)
          y -= L.body * L.lead
          let x = colX()
          for (const piece of line) x = drawPiece(page, font, piece, x, y + L.body * 0.25, L.body)
        }
      }
      y -= L.body * 0.45
    }
    y -= L.body * 0.6
  }
}

// A standard font measures and draws only Latin-1
function latin1Only(font) {
  const clean = t => t.replace(/[\u2013\u2014]/g, '-').replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"').replace(/\u2026/g, '...').replace(/[^\x00-\xff]/g, '')
  return {
    widthOfTextAtSize: (t, size) => font.widthOfTextAtSize(clean(t), size),
    draw: (page, t, opts) => page.drawText(clean(t), { ...opts, font }),
  }
}

// ─── Text with suit symbols ───────────────────────────────────

const SUITS = { '♠': 'S', '♥': 'H', '♦': 'D', '♣': 'C', '♤': 'S', '♡': 'H', '♢': 'D', '♧': 'C' }
const SUIT_RE = /([♠♥♦♣♤♡♢♧])/u
const suitAdvance = size => size * 0.72

/** `text` as pieces: `{ text }` and `{ suit }`. */
function splitSuits(str, color) {
  return str.split(SUIT_RE).filter(Boolean).map(s => (SUITS[s] ? { suit: SUITS[s], color } : { text: s, color }))
}

const pieceWidth = (font, p, size) => (p.suit ? suitAdvance(size) : font.widthOfTextAtSize(p.text, size))

/** Greedy word wrap of coloured runs into lines of pieces. */
function wrap(font, runs, size, width) {
  const words = [] // each a list of pieces, and whether a space follows
  for (const run of runs) {
    for (const part of run.text.split(/( +)/)) {
      if (!part) continue
      if (/^ +$/.test(part)) { if (words.length) words.at(-1).space = true; continue }
      words.push({ pieces: splitSuits(part, run.color), space: false })
    }
  }
  const space = font.widthOfTextAtSize(' ', size)
  const lines = []
  let line = [], w = 0
  for (const word of words) {
    const ww = word.pieces.reduce((t, p) => t + pieceWidth(font, p, size), 0)
    if (line.length && w + ww > width) { lines.push(line); line = []; w = 0 }
    for (const p of breakLong(font, word.pieces, size, width, ww)) {
      if (p === BREAK) { lines.push(line); line = []; w = 0; continue }
      line.push(p); w += pieceWidth(font, p, size)
    }
    if (word.space) { line.push({ text: ' ', color: word.pieces.at(-1)?.color }); w += space }
  }
  if (line.length) lines.push(line)
  return lines
}

const BREAK = Symbol('break')

// A word wider than the column breaks between its letters
function breakLong(font, pieces, size, width, ww) {
  if (ww <= width) return pieces
  const out = []
  let w = 0
  for (const p of pieces) {
    for (const ch of p.suit ? [p] : [...p.text].map(c => ({ text: c, color: p.color }))) {
      const cw = pieceWidth(font, ch, size)
      if (w + cw > width && w > 0) { out.push(BREAK); w = 0 }
      out.push(ch); w += cw
    }
  }
  return out
}

function drawRun(page, font, pieces, x, y, size, color) {
  for (const p of pieces) x = drawPiece(page, font, { ...p, color: p.color || color }, x, y, size)
  return x
}

function drawPiece(page, font, p, x, y, size) {
  if (p.suit) { drawSuit(page, p.suit, x, y, size); return x + suitAdvance(size) }
  const opts = { x, y, size, color: p.color || INK }
  if (p.text) font.draw ? font.draw(page, p.text, opts) : page.drawText(p.text, { ...opts, font })
  return x + font.widthOfTextAtSize(p.text, size)
}

// The suit symbols in a 100-unit box, y down, as the card prints them:
// spades and clubs black, hearts and diamonds red
const SUIT_PATHS = {
  D: 'M50 0 L90 50 L50 100 L10 50 Z',
  H: 'M50 100 C22 72 0 52 0 29 C0 11 13 0 28 0 C40 0 47 8 50 18 C53 8 60 0 72 0 C87 0 100 11 100 29 C100 52 78 72 50 100 Z',
  S: 'M50 0 C78 28 100 44 100 62 C100 78 88 87 75 87 C65 87 57 82 54 75 C55 87 60 95 70 100 L30 100 C40 95 45 87 46 75 C43 82 35 87 25 87 C12 87 0 78 0 62 C0 44 22 28 50 0 Z',
  C: 'M46 58 L54 58 C55 80 60 93 70 100 L30 100 C40 93 45 80 46 58 Z',
}
const CLUB_LEAVES = [[50, 24, 23], [25, 57, 23], [75, 57, 23]]

function drawSuit(page, suit, x, y, size) {
  const h = size * 0.68 // about the cap height
  const s = h / 100
  const left = x + (suitAdvance(size) - h) / 2
  const color = suit === 'H' || suit === 'D' ? RED : INK
  page.drawSvgPath(SUIT_PATHS[suit], { x: left, y: y + h, scale: s, color, borderWidth: 0 })
  if (suit === 'C') {
    for (const [cx, cy, r] of CLUB_LEAVES) page.drawCircle({ x: left + cx * s, y: y + h - cy * s, size: r * s, color, borderWidth: 0 })
  }
}
