#!/usr/bin/env node
// Field sheet for BBO's ACBL convention card: which card field each BBO slot
// fills, as the BBO import and export (js/bbo.js, spec/formats/bbo-map.toml)
// have it.
//
//   node scripts/bbo-field-sheets.mjs        (then python3 scripts/build_spec.py)
//
// Opens BBO's card editor (EDITOR, no account needed) in headless Chromium and
// reads every slot from the page itself: the text slots (E_), checkboxes (C_)
// and lead circles (L_) that BBO's own editor script lists, with where each
// sits and the words printed beside it. Then writes:
//
//   spec/formats/bbo-slots.toml   every slot: its section and label on BBO's card
//   docs/bbo-field-sheets/bbo-acbl-fields.pdf
//       page 1   BBO's card, every slot outlined and numbered: green when the
//                map covers it, red when nothing does, amber for a lead
//                circle that imports to a field the spec lacks or exports
//                under another name;
//       page 2+  the numbers as a table: the slot, its label on BBO's card,
//                the card field it fills, and the spec's label for that field.
//
// Slots are numbered in the page's order, which follows the card's sections.
// Re-run after changing bbo-map.toml, or when BBO changes its card. The repo
// keeps no copy of BBO's page: the script reads it live.

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { chromium } from 'playwright'
import { PDFDocument, rgb } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { FONT_FILE } from '../js/assets.js'
import { field, BBO_MAP } from '../js/spec.js'
import { leadPath, leadKey } from '../js/bbo.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(ROOT, 'docs/bbo-field-sheets')
const SLOTS_TOML = path.join(ROOT, 'spec/formats/bbo-slots.toml')
const EDITOR = 'https://webutil.bridgebase.com/v2/acblcc/acblCC.html?edit=y'

const OK = rgb(0.05, 0.55, 0.25)
const NONE = rgb(0.85, 0.1, 0.1)
const ODD = rgb(0.85, 0.5, 0.0)
const INK = rgb(0.1, 0.1, 0.1)
const GREY = rgb(0.45, 0.45, 0.45)
const CSS_COLOR = { ok: '#0d8c40', none: '#d91a1a', odd: '#d98000' }

const PREFIX = { fields: 'E_', conventions: 'C_', leads: 'L_' }
const KIND = { fields: 'Text', conventions: 'Tick', leads: 'Circle' }

// ─── Read BBO's card ───────────────────────────────────────────────

async function readCard(page) {
  await page.goto(EDITOR, { waitUntil: 'networkidle' })
  // Lay the card out flat, as for printing, so every slot has a place on one page.
  await page.addStyleTag({ content: `
    #buttonDiv { display: none !important; }
    html, body { margin: 0 !important; background: white !important; overflow: visible !important; }
    body { padding: 40px 20px 20px !important; }
    #mainDiv, #ccDiv { position: static !important; top: 0 !important; height: auto !important; overflow: visible !important; visibility: visible !important; }
  ` })
  return page.evaluate(() => {
    /* global edits, checkBoxes, cardGroups */
    const lists = { fields: edits, conventions: checkBoxes, leads: cardGroups.flat() }
    const slotEls = new Set(document.querySelectorAll('input, select, textarea, span[onclick]'))
    const clean = s => String(s || '').replace(/\s+/g, ' ').replace(/^[\s:]+|[\s:]+$/g, '').trim()

    // The words beside a slot, up to the next slot either side, within its cell.
    function around(el) {
      const cell = el.closest('td') || el.parentElement
      const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT)
      const before = [], after = []
      let seen = false
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (n === el) { seen = true; continue }
        if (n.nodeType === 1) {
          if (slotEls.has(n)) { if (seen) break; before.length = 0 }
          continue
        }
        if (el.contains(n)) continue
        ;(seen ? after : before).push(n.textContent)
      }
      return { before: clean(before.join(' ')), after: clean(after.join(' ')), row: clean(el.closest('tr')?.innerText) }
    }

    // The heading over a slot: the last bold text before it, and when that is
    // a sub-heading ("RESPONSES", "Direct"), the section heading before it too
    // ("MAJOR OPENING › RESPONSES").
    const heads = [...document.querySelectorAll('b, [style*="bold"]')]
      .filter(h => !h.querySelector('input, span[onclick]') && !h.closest('span[onclick]'))
      .map(h => ({ h, text: clean(h.innerText) })).filter(x => x.text)
    const caps = t => t === t.toUpperCase() && /[A-Z]{3}/.test(t)
    const generic = t => !caps(t) || t === 'RESPONSES'
    function section(el, group) {
      if (group === 'leads') return el.id.startsWith('ln-') ? 'Leads vs NT' : 'Leads vs Suits'
      const before = heads.filter(x => !x.h.contains(el) && (x.h.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING))
      const last = before[before.length - 1]?.text ?? ''
      // The two-level box has no heading, only its two column heads.
      if (last === 'RESPONSES/REBIDS' && before[before.length - 2]?.text === 'DESCRIBE') return 'DESCRIBE | RESPONSES/REBIDS'
      if (!generic(last)) return last
      const outer = before.map(x => x.text).reverse().find(t => !generic(t))
      return outer ? `${outer} › ${last}` : last
    }

    // The words a cell opens with, before its first slot or label ("Double Raise:").
    function leadIn(el) {
      const cell = el.closest('td')
      if (!cell) return ''
      const words = []
      for (const n of cell.childNodes) {
        if (n.nodeType === 1 && (slotEls.has(n) || n.matches('label') || n.querySelector('input, label'))) break
        words.push(n.textContent)
      }
      return clean(words.join(' '))
    }

    function label(el, group) {
      // A circle: the holding and the card circled ("AKx: A").
      if (group === 'leads') return `${clean(el.closest('td')?.innerText).replace(/ /g, '')}: ${clean(el.innerText)}`
      const title = clean(el.title)
      if (title) return title
      const opening = leadIn(el)
      const withOpening = words => (opening && !words.startsWith(opening) ? `${opening} ${words}` : words)
      const named = clean(document.querySelector(`label[for="${el.id}"]`)?.innerText)
      if (named) return withOpening(named)
      const { before, after, row } = around(el)
      if (group === 'conventions') return withOpening(after || before) || row
      const words = [before, after].filter(Boolean).join(' … ')
      // "to" alone (the top of a range) says less than its row.
      return words.length > 3 ? words : row || words
    }

    const slots = []
    for (const [group, ids] of Object.entries(lists)) {
      for (const id of [...new Set(ids)]) {
        const els = [...document.querySelectorAll(`[id="${CSS.escape(id)}"]`)]
        if (!els.length) continue
        slots.push({
          group, id,
          repeated: ids.filter(x => x === id).length > 1,
          section: section(els[0], group),
          label: label(els[0], group),
          rects: els.map(e => { const r = e.getBoundingClientRect(); return { x: r.x + scrollX, y: r.y + scrollY, w: r.width, h: r.height } }),
          order: 0,
          el: els[0],
        })
      }
    }
    // Number in the page's order.
    slots.sort((a, b) => (a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
    const absent = Object.fromEntries(Object.entries(lists).map(([g, ids]) => [g, ids.filter(id => !document.getElementById(id))]))
    return {
      // The card's own size, with the body's margin round it.
      width: Math.ceil(document.getElementById('entireTable').getBoundingClientRect().right + scrollX + 20),
      height: Math.ceil(document.getElementById('entireTable').getBoundingClientRect().bottom + scrollY + 20),
      slots: slots.map(({ el, ...s }) => s),
      absent,
    }
  })
}

// ─── What the map does with each slot ──────────────────────────────

const show = v => (typeof v === 'string' ? `"${v}"` : String(v))

/** The card fields a slot fills: [{ card, path }]. */
function mapped(group, id) {
  const out = []
  if (group === 'conventions') {
    const spec = BBO_MAP.conventions[id]
    if (typeof spec === 'string') out.push({ card: spec, path: spec })
    else if (spec) for (const [p, v] of Object.entries(spec.set)) out.push({ card: v === true ? p : `${p} = ${show(v)}`, path: p })
  }
  if (group === 'fields') {
    const spec = BBO_MAP.fields[id]
    if (typeof spec === 'string') out.push({ card: spec, path: spec })
    else if (spec?.range) {
      out.push({ card: `${spec.range} (the number)`, path: spec.range })
      for (const s of ['plus', 'minus']) if (field(`${spec.range}_${s}`)) out.push({ card: `${spec.range}_${s} (a ${s === 'plus' ? '+' : '-'} after it)`, path: `${spec.range}_${s}` })
    } else if (spec?.plain) out.push({ card: `${spec.plain} (as typed)`, path: spec.plain })
    else if (spec?.text) {
      out.push({ card: spec.text, path: spec.text })
      for (const [p, v] of Object.entries(spec.also || {})) out.push({ card: `${p} = ${show(v)} (when filled)`, path: p })
    }
    for (const j of BBO_MAP.joined || []) {
      const i = j.keys.indexOf(id)
      if (i >= 0) out.push({ card: `${j.path} (line ${i + 1} of ${j.keys.length}${j.export === false ? ', import only' : ''})`, path: j.path })
    }
    // Rules in js/bbo.js rather than entries in the map.
    const TC = 'two_level.two_clubs'
    const twoClubs = {
      '2COther1': [`${TC}.description`, '2C describe, line 1'],
      '2COther2': [`${TC}.continuation_describe`, '2C describe, line 2'],
      '2COther3': [`${TC}.continuation_describe`, '2C describe, line 3 (with line 2)'],
      '2COther4': [`${TC}.notes`, '2C responses, line 1'],
      '2COther5': [`${TC}.continuation_response`, '2C responses, line 2'],
      '2COther6': [`${TC}.continuation_describe`, '2C responses, line 3 (import only)'],
    }[id]
    if (twoClubs) out.push({ card: `${twoClubs[0]} (${twoClubs[1]})`, path: twoClubs[0] })
    if (id === 'names') out.push({ card: 'metadata.partner_names', path: 'metadata.partner_names' })
  }
  return out
}

/** One slot's status and table rows. */
function describe(slot) {
  if (slot.group === 'leads') {
    const lead = leadPath(slot.id)
    if (!lead) return { status: 'none', rows: [{ card: 'not read', label: '' }] }
    const [p, pos] = lead
    const inSpec = !!field(p)
    const back = leadKey(p, pos)
    const status = inSpec && back === slot.id ? 'ok' : 'odd'
    const label = !inSpec ? 'NOT IN THE SPEC' : back !== slot.id ? `${field(p).label}; exports as L_${back}` : field(p).label
    return { status, rows: [{ card: `${p} = ${pos}`, label }] }
  }
  const entries = mapped(slot.group, slot.id)
  if (!entries.length) return { status: 'none', rows: [{ card: 'not mapped', label: '' }] }
  return {
    status: 'ok',
    rows: entries.map(e => ({
      card: e.card,
      label: field(e.path)?.label ?? (e.path.startsWith('metadata.') ? 'card metadata' : 'NOT IN THE SPEC'),
    })),
  }
}

// ─── The slot list ─────────────────────────────────────────────────

const tomlString = s => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`

function writeSlots(slots, absent) {
  const lines = [
    '# Every slot on BBO\'s ACBL convention card, read from BBO\'s card editor',
    `# (${EDITOR.replace(/\?.*/, '')}) by scripts/bbo-field-sheets.mjs.`,
    '# Generated; don\'t edit. Re-run the script when BBO changes its card.',
    '#',
    '# The three groups are the three kinds of element in a BBO card\'s XML, as',
    '# the BBO import reads them (js/bbo.js): [fields] the text slots (<E_id t="…"/>),',
    '# [conventions] the checkboxes (<C_id c="y"/>), [leads] the lead circles',
    '# (<L_id l="y"/>). Each slot: `section`, the heading over it on BBO\'s card,',
    '# and `label`, the words beside it (BBO\'s own tooltip where it has one).',
    '# Within a group, slots are in the order BBO\'s editor lists them.',
  ]
  const repeated = slots.filter(s => s.repeated).map(s => PREFIX[s.group] + s.id)
  if (repeated.length) lines.push('#', `# BBO's editor lists ${repeated.join(', ')} twice; each is one slot.`)
  for (const [g, ids] of Object.entries(absent)) {
    if (ids.length) lines.push('#', `# BBO's editor also lists ${ids.length} ${g} slot(s) the card page doesn't have: ${ids.join(', ')}.`)
  }
  for (const group of ['fields', 'conventions', 'leads']) {
    lines.push('', `[${group}]`)
    for (const s of slots.filter(s => s.group === group).sort((a, b) => a.listed - b.listed)) {
      lines.push(`${tomlString(s.id)} = { section = ${tomlString(s.section)}, label = ${tomlString(s.label)} }`)
    }
  }
  fs.writeFileSync(SLOTS_TOML, lines.join('\n') + '\n')
}

// ─── The sheet ─────────────────────────────────────────────────────

// Barlow has no suit glyphs: write suits as letters, as the PDF export does.
const SUITS = { '♣': 'C', '♦': 'D', '♥': 'H', '♠': 'S' }
const plain = (font, s) => [...String(s ?? '')].map(c => {
  if (SUITS[c]) return SUITS[c]
  try { font.encodeText(c); return c } catch { return '?' }
}).join('')

async function main() {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1900, height: 1200 } })
  page.on('dialog', d => d.dismiss())
  const card = await readCard(page)

  // Remember each slot's place in BBO's own lists, for the slot file's order.
  const listed = await page.evaluate(() => [...edits, ...checkBoxes, ...cardGroups.flat()])
  for (const s of card.slots) s.listed = listed.indexOf(s.id)
  card.slots.forEach((s, i) => { s.n = i + 1; Object.assign(s, describe(s)) })

  // Page 1: BBO's card with every slot outlined and numbered.
  await page.evaluate(({ slots, colors }) => {
    const layer = document.createElement('div')
    layer.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;z-index:9999'
    for (const s of slots) {
      const c = colors[s.status]
      s.rects.forEach((r, i) => {
        const o = document.createElement('div')
        o.style.cssText = `position:absolute;left:${r.x - 1}px;top:${r.y - 1}px;width:${r.w + 2}px;height:${r.h + 2}px;border:1px solid ${c};background:${c}18`
        layer.appendChild(o)
        const n = document.createElement('div')
        n.textContent = s.n + (s.rects.length > 1 ? String.fromCharCode(97 + i) : '')
        n.style.cssText = `position:absolute;left:${r.x - 1}px;top:${r.y - 9}px;font:bold 7.5px Arial,sans-serif;line-height:8px;color:${c};background:rgba(255,255,255,.85);padding:0 1px`
        layer.appendChild(n)
      })
    }
    document.body.appendChild(layer)
  }, { slots: card.slots, colors: CSS_COLOR })
  // Print with the screen's styles at the measured size, so nothing moves.
  await page.emulateMedia({ media: 'screen' })
  const cardPdf = await page.pdf({ width: `${card.width}px`, height: `${card.height}px`, printBackground: true, pageRanges: '1', margin: { top: '0', left: '0', right: '0', bottom: '0' } })
  await browser.close()

  writeSlots(card.slots, card.absent)

  const doc = await PDFDocument.create()
  // A fixed date, so re-running with nothing changed leaves the file unchanged.
  doc.setCreationDate(new Date(0))
  doc.setModificationDate(new Date(0))
  doc.setProducer('scripts/bbo-field-sheets.mjs')
  doc.registerFontkit(fontkit)
  const font = await doc.embedFont(fs.readFileSync(path.join(ROOT, 'assets/fonts', FONT_FILE)))

  const counts = status => card.slots.filter(s => s.status === status).length
  const byGroup = g => card.slots.filter(s => s.group === g)
  const [cardPage] = await doc.copyPages(await PDFDocument.load(cardPdf), [0])
  doc.addPage(cardPage)
  const { height: CH } = cardPage.getSize()
  cardPage.drawText("BBO's ACBL card: every slot, numbered", { x: 15, y: CH - 14, size: 11, font, color: INK })
  cardPage.drawText(`green: the BBO map covers it (${counts('ok')})   red: nothing does (${counts('none')})   amber: a lead circle the round trip gets wrong (${counts('odd')})   table on the next pages`, { x: 15, y: CH - 25, size: 7.5, font, color: GREY })

  // Map keys that name no slot on BBO's card: they never import, and export writes them for nothing.
  const onCard = g => new Set(byGroup(g).map(s => s.id))
  const deadTicks = Object.keys(BBO_MAP.conventions).filter(k => !onCard('conventions').has(k))
  const deadText = [...Object.keys(BBO_MAP.fields), ...(BBO_MAP.joined || []).flatMap(j => j.keys)].filter(k => !onCard('fields').has(k))

  const notes = [
    `${card.slots.length} slots on BBO's card: ${byGroup('fields').length} text slots (E_), ${byGroup('conventions').length} checkboxes (C_), ${byGroup('leads').length} lead circles (L_). Read from ${EDITOR.replace(/\?.*/, '')}.`,
    `Mapped: ${byGroup('fields').filter(s => s.status === 'ok').length} text slots, ${byGroup('conventions').filter(s => s.status === 'ok').length} checkboxes, ${byGroup('leads').filter(s => s.status === 'ok').length} lead circles. A slot the map doesn't cover still goes back to BBO unchanged when the card came from BBO (the export starts from _bbo_raw); a card made in the editor has nothing for it.`,
    'Lead circles are read by a rule in js/bbo.js (ls-akx-a: vs suits, from AKx, the A), not by the map. Amber: the holding is not in the spec, or the export writes the circle under another key.',
    'The 2C lines (2COther1-6) and the names slot are rules in js/bbo.js too.',
  ]
  if (deadTicks.length || deadText.length) notes.push(`The map names ${deadTicks.length + deadText.length} slot(s) BBO's card does not have: ${[...deadTicks.map(k => 'C_' + k), ...deadText.map(k => 'E_' + k)].join(', ')}.`)
  const repeated = card.slots.filter(s => s.repeated)
  if (repeated.length) notes.push(`BBO's page uses the ids ${repeated.map(s => PREFIX[s.group] + s.id).join(', ')} for two circles each (numbered a and b); BBO can only read the first.`)

  const W = 792, PH = 612, M = 30, size = 7.4, lh = 9.6
  const cols = [{ x: M, w: 22 }, { x: M + 24, w: 82 }, { x: M + 108, w: 30 }, { x: M + 140, w: 230 }, { x: M + 372, w: 220 }, { x: M + 594, w: W - M - (M + 594) }]
  const fit = (s, w) => { s = plain(font, s); if (font.widthOfTextAtSize(s, size) <= w) return s; while (s.length && font.widthOfTextAtSize(s + '…', size) > w) s = s.slice(0, -1); return s + '…' }
  let pg, y, notesDone = false
  const newPage = () => {
    pg = doc.addPage([W, PH]); y = PH - M
    pg.drawText("BBO's ACBL card: slots and the card fields they fill", { x: M, y, size: 11, font, color: INK }); y -= 13
    if (!notesDone) {
      for (const t of notes) {
        let line = ''
        for (const word of plain(font, t).split(' ')) {
          const next = line ? `${line} ${word}` : word
          if (line && font.widthOfTextAtSize(next, 7.5) > W - 2 * M) { pg.drawText(line, { x: M, y, size: 7.5, font, color: GREY }); y -= 9.5; line = word } else line = next
        }
        pg.drawText(line, { x: M, y, size: 7.5, font, color: GREY }); y -= 9.5
      }
      notesDone = true
    }
    y -= 4
    ;['#', 'BBO slot', 'Kind', "On BBO's card", 'Card field', 'Spec label'].forEach((h, i) => pg.drawText(h, { x: cols[i].x, y, size, font, color: GREY }))
    y -= 3; pg.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.4, color: GREY }); y -= lh
  }
  newPage()
  const COLOR = { ok: OK, none: NONE, odd: ODD }
  for (const s of card.slots) {
    s.rows.forEach((r, i) => {
      if (y < M) newPage()
      const where = [s.section, s.label].filter(Boolean).join(': ')
      const cells = i ? ['', '', '', '', r.card, r.label] : [String(s.n), PREFIX[s.group] + s.id, KIND[s.group], where, r.card, r.label]
      const color = s.status === 'ok' && r.label !== 'NOT IN THE SPEC' ? INK : COLOR[s.status]
      cells.forEach((c, j) => pg.drawText(fit(c, cols[j].w), { x: cols[j].x, y, size, font, color: j === 0 ? COLOR[s.status] : color }))
      y -= lh
    })
  }

  fs.mkdirSync(OUT, { recursive: true })
  const out = path.join(OUT, 'bbo-acbl-fields.pdf')
  fs.writeFileSync(out, await doc.save())
  console.log(`${card.slots.length} slots: ${counts('ok')} mapped, ${counts('none')} not, ${counts('odd')} lead circles wrong -> ${path.relative(ROOT, out)}, ${path.relative(ROOT, SLOTS_TOML)}`)
}

await main()
