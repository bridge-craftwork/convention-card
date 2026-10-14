// Read a card PDF that Bridgodex made. Bridgodex fills in a form and then
// flattens it, so the PDF keeps no field names: each box is a drawing
// placed where the box was, and each typed value is page text drawn there.
// spec/formats/bridgodex-pdf-layout.json says which box sits where, so a
// tick or a value is read by its position and turned into the same
// `{ settings, notes }` Bridgodex's JSON export holds. importBridgeodexJson
// (bridgodex.js) does the rest.

import { PDFDocument, PDFName, PDFRawStream, PDFArray, PDFHexString, PDFString, decodePDFRawStream } from 'pdf-lib'
import LAYOUT from '../spec/formats/bridgodex-pdf-layout.json' with { type: 'json' }

const FIELDS = LAYOUT.fields.map(([name, kind, x, y, w, h]) => ({ name, kind, x, y, w, h }))
// How close, in points, a placement must sit to a box to be that box.
const NEAR = 0.6
// At least this share of the placed drawings must be Bridgodex boxes.
const ENOUGH = 0.8

function streamText(stream) {
  const bytes = stream instanceof PDFRawStream ? decodePDFRawStream(stream).decode() : stream.getContents()
  let s = ''
  for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode(...bytes.subarray(i, i + 8192))
  return s
}

function contentStreams(doc, page) {
  const c = page.node.Contents()
  if (!c) return []
  return c instanceof PDFArray ? c.asArray().map(r => doc.context.lookup(r)) : [c]
}

// ─── Fonts ─────────────────────────────────────────────────────────

const hexOf = s => parseInt(s, 16)

/** A font's codes → text, from its ToUnicode map; null when it has none. */
function unicodeMap(font) {
  const tu = font?.lookup(PDFName.of('ToUnicode'))
  if (!tu) return null
  const s = streamText(tu)
  const map = new Map()
  let width = 2
  for (const [, lo] of s.matchAll(/begincodespacerange\s*<([0-9a-fA-F]+)>/g)) width = lo.length / 2
  const text = hex => String.fromCodePoint(...(hex.match(/.{4}/g) || []).map(hexOf))
  for (const block of s.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const [, k, v] of block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) map.set(hexOf(k), text(v))
  }
  for (const block of s.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const [, a, z, v] of block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) {
      for (let i = hexOf(a); i <= hexOf(z); i++) map.set(i, String.fromCodePoint(hexOf(v) + i - hexOf(a)))
    }
  }
  return { map, width }
}

/** Decode a shown string's bytes with the font in use. */
function decodeShown(bytes, cmap) {
  if (!cmap) return String.fromCharCode(...bytes)
  let out = ''
  for (let i = 0; i + cmap.width <= bytes.length; i += cmap.width) {
    let code = 0
    for (let j = 0; j < cmap.width; j++) code = code * 256 + bytes[i + j]
    out += cmap.map.get(code) ?? ''
  }
  return out
}

function literalBytes(s) {
  const out = []
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== '\\') { out.push(s.charCodeAt(i)); continue }
    const c = s[++i]
    const esc = { n: 10, r: 13, t: 9, b: 8, f: 12 }[c]
    if (esc != null) out.push(esc)
    else if (/[0-7]/.test(c)) {
      let oct = c
      while (oct.length < 3 && /[0-7]/.test(s[i + 1])) oct += s[++i]
      out.push(parseInt(oct, 8))
    } else if (c !== '\n' && c !== '\r') out.push(c.charCodeAt(0))
  }
  return out
}

// ─── Content ───────────────────────────────────────────────────────

const multiply = (a, b) => [
  a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3],
  a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3],
  a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5],
]

const isString = t => t != null && (t[0] === '(' || (t[0] === '<' && t[1] !== '<'))

const TOKEN = /<<|>>|<[0-9a-fA-F\s]*>|\((?:\\.|[^\\)])*\)|\[|\]|\/[^\s/<>()[\]{}%]+|[+-]?(?:\d+\.?\d*|\.\d+)|[A-Za-z'"*]+|%[^\n]*/g

/**
 * Walk a content stream: where each XObject is drawn (`placed`) and each
 * run of text, with the point it starts at (`texts`).
 */
function walk(content, fonts) {
  const placed = []
  const texts = []
  const stack = []
  let ctm = [1, 0, 0, 1, 0, 0]
  let tm = [1, 0, 0, 1, 0, 0]
  let line = tm
  let leading = 0
  let cmap = null
  let run = null
  const operands = []
  const cmaps = new Map()
  const fontMap = name => {
    if (!cmaps.has(name)) cmaps.set(name, unicodeMap(fonts?.lookup(PDFName.of(name))))
    return cmaps.get(name)
  }
  const show = bytes => {
    const at = multiply(line, ctm)
    const text = decodeShown(bytes, cmap)
    if (run && Math.abs(run.y - at[5]) < 0.5) run.text += text
    else texts.push(run = { x: at[4], y: at[5], text })
  }
  const shownBytes = tok => tok.startsWith('<')
    ? (tok.slice(1, -1).replace(/\s/g, '').match(/.{1,2}/g) || []).map(h => parseInt(h.padEnd(2, '0'), 16))
    : literalBytes(tok.slice(1, -1))
  for (const [tok] of content.matchAll(TOKEN)) {
    if (tok[0] === '%') continue
    if (!/^[A-Za-z'"*]/.test(tok) || tok === 'true' || tok === 'false' || tok === 'null') { operands.push(tok); continue }
    const n = i => parseFloat(operands[operands.length - i])
    const last = () => operands[operands.length - 1]
    switch (tok) {
      case 'q': stack.push(ctm); break
      case 'Q': ctm = stack.pop() || [1, 0, 0, 1, 0, 0]; break
      case 'cm': ctm = multiply([n(6), n(5), n(4), n(3), n(2), n(1)], ctm); break
      case 'Do': placed.push({ name: operands[operands.length - 1].slice(1), x: ctm[4], y: ctm[5], scale: Math.hypot(ctm[0], ctm[1]) }); break
      case 'BT': tm = line = [1, 0, 0, 1, 0, 0]; run = null; break
      case 'Tf': cmap = fontMap(operands[operands.length - 2].slice(1)); break
      case 'TL': leading = n(1); break
      case 'Tm': tm = line = [n(6), n(5), n(4), n(3), n(2), n(1)]; run = null; break
      case 'Td': case 'TD':
        if (tok === 'TD') leading = -n(1)
        tm = line = multiply([1, 0, 0, 1, n(2), n(1)], line); run = null; break
      case 'T*': tm = line = multiply([1, 0, 0, 1, 0, -leading], line); run = null; break
      case 'Tj': if (isString(last())) show(shownBytes(last())); break
      case "'": case '"':
        tm = line = multiply([1, 0, 0, 1, 0, -leading], line); run = null
        if (isString(last())) show(shownBytes(last())); break
      case 'TJ': {
        const open = operands.lastIndexOf('[')
        for (const t of operands.slice(open + 1)) if (t[0] === '(' || t[0] === '<') show(shownBytes(t))
        break
      }
    }
    operands.length = 0
  }
  return { placed, texts }
}

// ─── Reading ───────────────────────────────────────────────────────

// Where the card sits on the page: the layout's point (x, y) is drawn at
// (dx + s·x, dy + s·y).
const toPage = (f, t) => ({ x: t.dx + t.s * f.x, y: t.dy + t.s * f.y, w: t.s * f.w, h: t.s * f.h })

function fieldAt(x, y, t) {
  return FIELDS.find(f => { const r = toPage(f, t); return Math.abs(r.x - x) < NEAR * t.s && Math.abs(r.y - y) < NEAR * t.s })
}

/**
 * Bridgodex lays the card out at 8 × 8.5 in and puts it on the paper
 * chosen, so on Letter or A4 it may be moved or scaled. Its first two
 * boxes are always the footer (`meta`) and the names, so those two
 * placements give the move and the scale.
 */
function placement(placed) {
  const [a, b] = FIELDS
  const tries = [{ s: 1, dx: 0, dy: 0 }]
  if (placed.length >= 2) {
    const [p, q] = placed
    const s = Math.hypot(q.x - p.x, q.y - p.y) / Math.hypot(b.x - a.x, b.y - a.y)
    if (s > 0.2 && s < 5) tries.push({ s, dx: p.x - s * a.x, dy: p.y - s * a.y })
  }
  return tries
}

function fieldHolding(x, y, t) {
  let best = null
  for (const f of FIELDS) {
    if (f.kind !== 'text') continue
    const { x: fx, y: fy, w: fw, h: fh } = toPage(f, t)
    if (x < fx - 3 || x > fx + fw || y < fy - 4 || y > fy + fh + 2) continue
    const d = Math.abs(fx - x) + Math.abs(fy - y)
    if (!best || d < best.d) best = { f, d }
  }
  return best?.f
}

function set(settings, name, value) {
  const [block, key] = name.split('#')
  if (!key) return
  const lead = key.match(/^(.*)-(\d+)$/)
  ;(settings[block] ||= {})[lead ? lead[1] : key] = lead ? parseInt(lead[2], 10) : value
}

/**
 * Read a Bridgodex card PDF. Returns `{ settings, notes }`, the shape of
 * Bridgodex's JSON export, or null when `bytes` is not a card PDF from
 * Bridgodex.
 */
export async function readBridgodexPdf(bytes) {
  let doc
  try {
    doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false })
  } catch {
    return null
  }
  if (!doc.getPageCount()) return null
  const page = doc.getPage(0)
  const resources = page.node.Resources()
  const xobjects = resources?.lookup(PDFName.of('XObject'))
  const fonts = resources?.lookup(PDFName.of('Font'))

  const walked = contentStreams(doc, page)
    .map(streamText)
    .filter(content => /\bDo\b/.test(content))
    .map(content => walk(content, fonts))
  const placed = walked.flatMap(w => w.placed)
  // Take whichever placement of the card matches the most boxes.
  let best = null
  for (const t of placement(placed)) {
    const hits = placed.map(p => ({ p, f: fieldAt(p.x, p.y, t) })).filter(h => h.f)
    if (!best || hits.length > best.hits.length) best = { t, hits }
  }
  if (!best || best.hits.length < 40 || best.hits.length < ENOUGH * placed.length) {
    if (placed.some(p => p.name.startsWith('FlatWidget-')) && /bridgodex/i.test(walked.flatMap(w => w.texts).map(t => t.text).join(' ') + (doc.getTitle() || ''))) {
      throw new Error("This looks like a Bridgodex PDF, but not one this editor can read yet. Export it from Bridgodex at Card (8 x 8.5in) size, or export Bridgodex's JSON instead.")
    }
    return null
  }

  // Values are drawn in the stream that places the boxes; the card's
  // printed labels are elsewhere.
  const texts = walked.filter(w => w.placed.some(p => fieldAt(p.x, p.y, best.t))).flatMap(w => w.texts)
  const settings = {}
  for (const { p, f } of best.hits) {
    if (f.kind !== 'check') continue
    const xo = xobjects?.lookup(PDFName.of(p.name))
    // An unticked box is drawn from an empty appearance.
    if (xo && streamText(xo).trim().length > 10) set(settings, f.name, 'on')
  }

  const values = new Map()
  {
    for (const t of texts) {
      const f = fieldHolding(t.x, t.y, best.t)
      if (!f || f.name === 'meta' || !t.text.trim()) continue
      values.set(f.name, [...(values.get(f.name) || []), t])
    }
  }
  for (const [name, runs] of values) {
    // Lines read top to bottom.
    const text = runs.sort((a, b) => b.y - a.y || a.x - b.x).map(r => r.text.trimEnd()).join('\n')
    set(settings, name, text)
  }
  return { settings, notes: '' }
}

/** Every box the layout knows, as `block#key`: for tests and tools. */
export const BRIDGODEX_PDF_FIELDS = FIELDS.map(f => f.name)
