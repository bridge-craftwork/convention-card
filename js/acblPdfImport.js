// Read a card back out of an ACBL PDF, including what was changed in its
// boxes after export. The export leaves the form fillable and embeds the
// card it was made from (acblClassicFillPdf.js, embedCardDataInPdf), with a
// record of what it wrote into each box. Comparing that record with the
// boxes as they are now finds the hand edits, and the fill map, read in
// reverse, says which card field each edited box is.
//
// Three cases:
//   - Our PDF, with the record: edits are exact.
//   - Our PDF from before the record existed: what the export wrote is
//     predicted from the card, so a line the layout moved into a
//     neighbouring box can show up as an unreadable edit.
//   - Any other filled-in ACBL PDF (no card inside): the card is read from
//     the boxes alone.
//
// Text keeps what was there: a box that read "2C asks" (the PDF's fonts
// have no suit symbols) and now reads "2C asks for majors" becomes
// "2♣ asks for majors" on the card, because the words the export wrote are
// matched back to the card's own text and only the typed words are new.

import { PDFDocument, PDFCheckBox, PDFTextField } from 'pdf-lib'
import {
  ACBL_FIELD_MAPS,
  ACBL_SPLIT_GROUPS,
  isCheckOn,
  readEmbeddedPayload,
  sanitizeForWinAnsi,
} from './acblClassicFillPdf.js'
import { readPath, writePath } from './paths.js'
import { field } from './spec.js'
import { checkValue } from './checkCard.js'

// The suffix of the box the export adds for a value's second line (trySplitIntoTwoLines).
const SECOND_LINE = '__bc_line2'

const words = text => String(text ?? '').trim().split(/\s+/).filter(Boolean)
const same = (a, b) => a === b || (typeof a === 'string' && typeof b === 'string' && words(a).join(' ') === words(b).join(' '))

/** The boxes as they are: name → text, or true/false for a checkbox. */
function readBoxes(form) {
  const boxes = {}
  for (const f of form.getFields()) {
    try {
      if (f instanceof PDFCheckBox) boxes[f.getName()] = f.isChecked()
      else if (f instanceof PDFTextField) boxes[f.getName()] = f.getText() || ''
    } catch { /* unreadable: leave it out */ }
  }
  return boxes
}

/** Which template the form is, by how many of each map's boxes it has. */
function detectTemplate(boxes) {
  let best = null
  let bestCount = 0
  for (const [template, map] of Object.entries(ACBL_FIELD_MAPS)) {
    const count = new Set(map.map(e => e.pdf).filter(n => n in boxes)).size
    if (count > bestCount) [best, bestCount] = [template, count]
  }
  return bestCount >= 20 ? best : null
}

/** What the fill would write from `cardData`: for a PDF exported before the record. */
function predictWritten(cardData, template) {
  const values = {}
  for (const e of ACBL_FIELD_MAPS[template]) {
    const v = readPath(cardData, e.card)
    if (e.kind === 'check') values[e.pdf] = isCheckOn(e, v)
    else if (v != null) values[e.pdf] = sanitizeForWinAnsi(shaped(e, v, cardData))
  }
  return { values, moved: {} }
}

/** An entry's text as the fill writes it, before the WinAnsi substitution. */
function shaped(entry, value, cardData) {
  const text = entry.transform ? entry.transform(value) : String(value)
  const mark = readPath(cardData, `${entry.card}_plus`) ? '+' : readPath(cardData, `${entry.card}_minus`) ? '-' : ''
  return text + mark
}

/**
 * The new text of a box: the card's words where the box still has the
 * words the export wrote, and the box's own words where they differ. A
 * word-level longest common subsequence against the written words, each
 * mapped back to the card's word (suit symbols and all).
 */
export function mergeTyped(original, typed) {
  const orig = words(original)
  const written = orig.map(w => sanitizeForWinAnsi(w))
  const now = words(typed)
  const n = written.length
  const m = now.length
  const lcs = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = written[i] === now[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
    }
  }
  const out = []
  let i = 0
  let j = 0
  while (j < m) {
    if (i < n && written[i] === now[j]) { out.push(orig[i]); i++; j++ }
    else if (i < n && lcs[i + 1][j] >= lcs[i][j + 1]) i++
    else { out.push(now[j]); j++ }
  }
  return out.join(' ')
}

/** `text` as the value of the field at `path`: { value } (undefined: unset) or { problem }. */
function parseText(path, text) {
  const def = field(path)
  const t = String(text).trim()
  if (!t) return { value: undefined }
  if (!def || def.kind === 'text') return { value: t }
  if (def.kind === 'int') {
    const m = /^(\d+)\s*([+-])?$/.exec(t)
    if (!m) return { problem: `"${t}" is not a number` }
    const checked = checkValue(def, Number(m[1]))
    return checked.problem ? checked : { value: checked.value, plus: m[2] === '+', minus: m[2] === '-' }
  }
  return checkValue(def, t)
}

/**
 * Read a card from an ACBL PDF's bytes: `{ name, description, card_data,
 * report }`, or null when the PDF holds neither our card nor an ACBL form.
 * `report` is `{ source, template, edits, skipped }`: `source` is "card"
 * (embedded, nothing changed), "card+boxes" (embedded, with hand edits
 * applied) or "boxes" (no card inside: read from the boxes); each edit is
 * `{ box, path, from, to }` and each skipped box `{ box, found, reason }`.
 */
export async function readCardFromPdf(bytes) {
  let pdf
  try {
    pdf = await PDFDocument.load(bytes, { ignoreEncryption: true })
  } catch (err) {
    throw new Error(`Could not parse PDF (${err?.message || err})`)
  }
  const payload = readEmbeddedPayload(pdf)
  const embedded = payload && (payload.card_data || payload)
  let boxes = {}
  try { boxes = readBoxes(pdf.getForm()) } catch { /* no form */ }
  const template = payload?.pdf_fields?.template || detectTemplate(boxes)

  const record = {
    name: payload?.name || null,
    description: payload?.description || null,
    card_data: JSON.parse(JSON.stringify(embedded || { schema_version: '1.0', format: 'bridge_classroom', metadata: {} })),
  }
  const report = { source: embedded ? 'card' : 'boxes', template, edits: [], skipped: [] }
  if (!template || !Object.keys(boxes).length) {
    // A flattened PDF, or not an ACBL card: only the embedded card, if any.
    return embedded ? { ...record, report } : null
  }

  const written = payload?.pdf_fields?.template === template
    ? payload.pdf_fields
    : embedded ? predictWritten(embedded, template) : { values: {}, moved: {} }
  const writtenOf = name => written.values[name] ?? (typeof boxes[name] === 'boolean' ? false : '')
  const changed = new Set(Object.keys(boxes).filter(name => !same(boxes[name], writtenOf(name))))
  // Nothing filled in and no card inside: a blank form, not a card.
  if (!changed.size) return embedded ? { ...record, report } : null

  const map = ACBL_FIELD_MAPS[template]
  const entriesFor = new Map()
  for (const e of map) {
    if (!entriesFor.has(e.pdf)) entriesFor.set(e.pdf, [])
    entriesFor.get(e.pdf).push(e)
  }
  const cardData = record.card_data
  const set = (box, path, to) => {
    const from = readPath(cardData, path)
    if (from === to || (from == null && to == null)) return
    writePath(cardData, path, to)
    report.edits.push({ box, path, from: from ?? null, to: to ?? null })
  }
  const skip = (box, found, reason) => report.skipped.push({ box, found, reason })

  // ── Text: each box with the boxes that carry its lines.
  const carriers = new Map() // owner box → [owner, ...boxes holding its moved lines]
  // A moved line's box is one the export added, named after its owner, so
  // a PDF from before the record still says whose line it is.
  const moved = { ...written.moved }
  for (const box of Object.keys(boxes)) {
    const owner = box.endsWith(SECOND_LINE) ? box.slice(0, -SECOND_LINE.length) : null
    if (owner && owner in boxes && !(box in moved)) moved[box] = owner
  }
  for (const [box, owner] of Object.entries(moved)) {
    if (!carriers.has(owner)) carriers.set(owner, [owner])
    carriers.get(owner).push(box)
  }
  for (const group of ACBL_SPLIT_GROUPS[template] || []) carriers.set(group.fields[0], [...group.fields])
  const ownerOf = new Map()
  for (const [owner, list] of carriers) for (const b of list) ownerOf.set(b, owner)

  const textOwners = new Set()
  for (const box of changed) if (typeof boxes[box] === 'string') textOwners.add(ownerOf.get(box) || box)
  for (const owner of textOwners) {
    const list = carriers.get(owner) || [owner]
    const now = list.map(b => boxes[b] || '').join(' ')
    const split = (ACBL_SPLIT_GROUPS[template] || []).find(g => g.fields[0] === owner)
    const entries = split
      ? [{ pdf: owner, card: split.card, kind: 'text' }]
      : (entriesFor.get(owner) || []).filter(e => e.kind === 'text')
    if (!entries.length) {
      if (words(now).length) skip(owner, now.trim(), 'not a box this editor fills in')
      continue
    }
    if (new Set(entries.map(e => e.card)).size > 1) {
      skip(owner, now.trim(), `this box stands for ${entries.map(e => e.card).join(' and ')}`)
      continue
    }
    const entry = entries[0]
    const current = readPath(cardData, entry.card)
    const original = current == null ? '' : shaped(entry, current, cardData)
    let text = embedded ? mergeTyped(original, now) : now.trim()
    // A transform shortened the card's text for the box (Lebensohl's
    // "denies", printed on the card): put back what it took off.
    if (entry.transform && current != null && text) {
      const full = String(current)
      const kept = entry.transform(current)
      if (full !== kept && full.startsWith(kept)) text += full.slice(kept.length)
    }
    // The box's words are the card's own (a line moved, nothing typed).
    if (embedded && words(text).join(' ') === words(original).join(' ')) continue
    const parsed = parseText(entry.card, text)
    if (parsed.problem) {
      skip(owner, now.trim(), `${entry.card}: ${parsed.problem}`)
      continue
    }
    set(owner, entry.card, parsed.value)
    // "14+" is a good 14, "17-" a poor 17 (the NT ranges' _plus and _minus).
    if (field(`${entry.card}_plus`)) set(owner, `${entry.card}_plus`, parsed.plus ? true : undefined)
    if (field(`${entry.card}_minus`)) set(owner, `${entry.card}_minus`, parsed.minus ? true : undefined)
  }

  // ── Checkboxes: settle each card path from all of its boxes.
  const paths = new Map() // card path → [entries]
  for (const box of changed) {
    if (typeof boxes[box] !== 'boolean') continue
    const entries = (entriesFor.get(box) || []).filter(e => e.kind === 'check')
    if (!entries.length) {
      if (boxes[box]) skip(box, true, 'not a box this editor fills in')
      continue
    }
    if (new Set(entries.map(e => e.card)).size > 1) {
      skip(box, boxes[box], `this box stands for ${entries.map(e => e.card).join(' and ')}`)
      continue
    }
    const path = entries[0].card
    if (!paths.has(path)) paths.set(path, map.filter(e => e.kind === 'check' && e.card === path))
  }
  for (const [path, entries] of paths) {
    const box = entries.map(e => e.pdf).find(b => changed.has(b))
    const on = entries.filter(e => boxes[e.pdf] === true)
    const current = readPath(cardData, path)
    if (entries.every(e => e.value === undefined)) {
      // Yes/no, perhaps printed more than once (Jacoby: the 2♦ and 2♥ boxes).
      if (on.length && on.length < entries.length) {
        skip(box, true, `${path} has ${entries.length} boxes on this card, and only some are ticked`)
        continue
      }
      set(box, path, on.length > 0 ? true : (current == null ? undefined : false))
      continue
    }
    // A choice: each box is one value of the field.
    if (on.length > 1) {
      skip(box, true, `${path}: ${on.length} of its boxes are ticked, and it holds one value`)
      continue
    }
    if (on.length === 1) {
      const v = on[0].value
      const values = (Array.isArray(v) ? v : [v]).map(String)
      if (!values.includes(String(current))) set(box, path, values[0])
    } else if (entries.some(e => isCheckOn(e, current))) {
      set(box, path, undefined)
    }
  }

  if (!embedded) {
    record.name = String(readPath(record.card_data, 'metadata.partner_names') || '').trim() || 'Imported ACBL card'
    record.card_data.metadata = { ...(record.card_data.metadata || {}), name: record.name }
    record.description = 'Read from the boxes of an ACBL PDF'
  } else if (report.edits.length) {
    report.source = 'card+boxes'
  }
  return { ...record, report }
}

const show = v => (v === true ? 'ticked' : v === false ? 'not ticked' : v == null ? 'blank' : typeof v === 'number' ? String(v) : `"${v}"`)
const label = path => field(path)?.label || path

/**
 * The report as diagnostics, `{ severity, message, path?, hint? }`: one
 * for where the card came from, one per edit applied ("info") and one per
 * box that could not be read ("warning").
 */
export function pdfReportDiagnostics(report) {
  if (!report) return []
  const out = []
  if (report.source === 'boxes') {
    out.push({ severity: 'info', message: `This PDF had no card inside, so the card was read from the boxes of the ACBL ${report.template === 'new' ? 'New' : 'Classic'} card: ${report.edits.length} settings.` })
  } else if (report.edits.length) {
    out.push({ severity: 'info', message: `${report.edits.length === 1 ? '1 box was' : `${report.edits.length} boxes were`} changed in the PDF after it was exported; the card now has ${report.edits.length === 1 ? 'that change' : 'those changes'}.` })
  }
  if (report.source !== 'boxes') {
    for (const e of report.edits) {
      out.push({ severity: 'info', message: `${label(e.path)}: ${show(e.from)} → ${show(e.to)}`, path: e.path })
    }
  }
  for (const s of report.skipped) {
    out.push({ severity: 'warning', message: `Box "${s.box}" (${show(s.found)}) was not read: ${s.reason}` })
  }
  return out
}
