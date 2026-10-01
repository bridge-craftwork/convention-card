/**
 * Old ACBL convention card PDF export (SS1 Rev. 4-12 layout).
 *
 * Renders `card_data` into a single-page letter-portrait PDF with the
 * same section structure as the printed ACBL card. Uses jspdf with
 * coordinate-positioned text and shape drawing — no rasterization, so
 * text in the output is selectable + copyable.
 *
 * Phase 3b: layout primitives + first batch of sections (header, 1NT,
 * 2NT, 3NT, Major openings, Minor openings, 2♣, weak twos). Phase 3b.2
 * fills in the remaining boxes (Overcalls, Doubles, vs NT, vs TO Dbl,
 * vs Preempts, Direct cuebids, Preempts, Slams, Carding, Signals, Leads).
 *
 * Suit glyphs (♠♥♦♣): rendered via lightweight inline shape drawing
 * rather than embedding a Unicode font, so the bundle stays small.
 */

import { jsPDF } from 'jspdf'
import { readPath } from './conventionCatalog.js'

// ─── Page constants (mm) ───────────────────────────────────────
const PAGE_W = 215.9   // letter portrait
const PAGE_H = 279.4
const MARGIN = 5       // tight margins — the ACBL card is densely packed
const COL_GAP = 2
const COLS = 3
const CONTENT_W = PAGE_W - 2 * MARGIN
const COL_W = (CONTENT_W - (COLS - 1) * COL_GAP) / COLS

// ─── Visual tokens ─────────────────────────────────────────────
const FONT_FAMILY = 'helvetica'
const COLOR_BLACK = [0, 0, 0]
const COLOR_GREY  = [85, 85, 85]
const COLOR_RED   = [200, 30, 30]
const BORDER_WIDTH = 0.2

// ─── Layout state ──────────────────────────────────────────────
function makeLayout() {
  return {
    // Per-column cursor (y position where the next section starts).
    colY: [MARGIN, MARGIN, MARGIN]
  }
}

/** Top-left of a column. */
function colX(col) {
  return MARGIN + col * (COL_W + COL_GAP)
}

// ─── Drawing primitives ────────────────────────────────────────

function setStroke(doc, color = COLOR_BLACK, width = BORDER_WIDTH) {
  doc.setDrawColor(color[0], color[1], color[2])
  doc.setLineWidth(width)
}

function setText(doc, size, style = 'normal', color = COLOR_BLACK) {
  doc.setFont(FONT_FAMILY, style)
  doc.setFontSize(size)
  doc.setTextColor(color[0], color[1], color[2])
}

/**
 * Outlined rectangle. No fill.
 */
function drawBox(doc, x, y, w, h) {
  setStroke(doc)
  doc.rect(x, y, w, h)
}

/**
 * Section header bar: bold uppercase title pinned to the top-left of
 * a box, in red (ACBL convention). Suit chars in the title render as
 * vector glyphs in the same red color as the surrounding text.
 */
function drawSectionTitle(doc, x, y, title) {
  setText(doc, 8, 'bold', COLOR_RED)
  // Title text is red but suit glyphs keep their native colors (♣♠
  // black, ♥♦ red) — matches the printed ACBL card. Suit size capped
  // at 2.2mm so the glyph fits inside the title bar.
  drawText(doc, x + 1.2, y + 2.6, title.toUpperCase(), 2.2)
}

/**
 * Label : value pair on one line. Label in grey, value in black.
 * Both can contain suit glyphs.
 */
function drawLabelValue(doc, x, y, w, label, value, labelWidth = 14) {
  setText(doc, 6.5, 'normal', COLOR_GREY)
  drawText(doc, x, y, label, 2.2)
  setText(doc, 6.5, 'normal', COLOR_BLACK)
  const valueX = x + labelWidth
  const valueW = w - labelWidth
  const str = value == null || value === '' ? '' : String(value)
  if (!str) return
  // Naive truncation if the rendered value is wider than the column.
  const rendered = measureText(doc, str, 2.2)
  const trimmed = rendered > valueW
    ? truncateToWidth(doc, str, valueW)
    : str
  drawText(doc, valueX, y, trimmed, 2.2)
}

function truncateToWidth(doc, str, maxWidth) {
  // Binary search on character count, measuring the rendered width
  // (suits + text) at each candidate.
  let lo = 0, hi = str.length
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (measureText(doc, str.slice(0, mid) + '…', 2.2) <= maxWidth) lo = mid
    else hi = mid - 1
  }
  return lo >= str.length ? str : str.slice(0, lo) + '…'
}

/**
 * Filled / unfilled checkbox. Tiny square; filled with a thick check
 * mark glyph when on. Returns the right edge so callers can chain.
 */
function drawCheckbox(doc, x, y, checked, size = 1.8) {
  setStroke(doc)
  doc.rect(x, y - size, size, size)
  if (checked) {
    // Solid fill — simpler and prints more reliably than a check glyph.
    doc.setFillColor(0, 0, 0)
    doc.rect(x + 0.4, y - size + 0.4, size - 0.8, size - 0.8, 'F')
  }
  return x + size
}

/**
 * Row of [label · checkbox label · checkbox label …] for the inline
 * checkbox patterns the ACBL card uses everywhere (e.g. "Jump Raise:
 * Wk ☐ Mixed ☐ Inv ☐"). Returns the y at the bottom of the row.
 */
function drawCheckRow(doc, x, y, _w, label, items, labelWidth = 14) {
  setText(doc, 6.5, 'normal', COLOR_GREY)
  drawText(doc, x, y, label, 2.2)
  setText(doc, 6.5, 'normal', COLOR_BLACK)
  let cx = x + labelWidth
  for (const item of items) {
    drawCheckbox(doc, cx, y, !!item.checked)
    cx += 2.6
    cx = drawText(doc, cx, y, item.label, 2.2) + 2
  }
  return y + 3
}

/**
 * Suit glyph drawn as vector paths. Tiny — used inline with text.
 * `kind` is one of 'S', 'H', 'D', 'C'. (x, y) is the baseline.
 * `force` is an optional [r, g, b] color override (used when a section
 * title is colored red — all four suits should match the title color
 * rather than show in their suit-default colors). Returns the width
 * consumed.
 */
function drawSuit(doc, x, y, kind, size = 2.4, force = null) {
  // Wrap all fill/draw color changes in a graphics-state push/pop so
  // they stay scoped to this glyph. Without this, the suit color leaks
  // into subsequent text operations (jspdf's text-mode-0 rendering ties
  // text color to fill color, so a previously-red suit can make later
  // body suits render red even though setFillColor(0,0,0) was called).
  doc.saveGraphicsState()
  const cx = x + size / 2
  const cy = y - size / 2
  const red = kind === 'H' || kind === 'D'
  const color = force || (red ? COLOR_RED : COLOR_BLACK)
  doc.setFillColor(color[0], color[1], color[2])
  doc.setDrawColor(color[0], color[1], color[2])
  doc.setLineWidth(0.05)

  if (kind === 'D') {
    // Diamond: rhombus.
    doc.lines(
      [[size / 2, -size / 2], [size / 2, size / 2], [-size / 2, size / 2], [-size / 2, -size / 2]],
      x, cy, [1, 1], 'F', true
    )
  } else if (kind === 'H') {
    // Heart: two lobes + triangle. Approximate with a path.
    const r = size * 0.27
    doc.circle(cx - r, cy - r * 0.4, r, 'F')
    doc.circle(cx + r, cy - r * 0.4, r, 'F')
    doc.triangle(
      cx - size * 0.5, cy - r * 0.1,
      cx + size * 0.5, cy - r * 0.1,
      cx, cy + size * 0.5,
      'F'
    )
  } else if (kind === 'S') {
    // Spade: inverted heart + stem.
    const r = size * 0.27
    doc.circle(cx - r, cy + r * 0.4, r, 'F')
    doc.circle(cx + r, cy + r * 0.4, r, 'F')
    doc.triangle(
      cx - size * 0.5, cy + r * 0.1,
      cx + size * 0.5, cy + r * 0.1,
      cx, cy - size * 0.5,
      'F'
    )
    // Stem
    doc.triangle(
      cx - size * 0.18, cy + size * 0.5,
      cx + size * 0.18, cy + size * 0.5,
      cx, cy + size * 0.15,
      'F'
    )
  } else if (kind === 'C') {
    // Club: three lobes + stem.
    const r = size * 0.24
    doc.circle(cx, cy - r * 0.7, r, 'F')
    doc.circle(cx - r * 0.85, cy + r * 0.25, r, 'F')
    doc.circle(cx + r * 0.85, cy + r * 0.25, r, 'F')
    doc.triangle(
      cx - size * 0.22, cy + size * 0.5,
      cx + size * 0.22, cy + size * 0.5,
      cx, cy + size * 0.05,
      'F'
    )
  }
  doc.restoreGraphicsState()
  return size + 0.3
}

/**
 * Draw mixed text + suits at the current font/color. Replaces
 * ♠♥♦♣ chars in `str` with vector suit glyphs sized to roughly match
 * the surrounding text. Returns the right-edge x.
 *
 * `suitSize` is in mm; `suitColor` forces a color for the suit glyphs
 * (default null = each suit uses its native color).
 */
function drawText(doc, x, y, str, suitSize = 2.2, suitColor = null) {
  if (str == null || str === '') return x
  const tokens = tokenizeSuits(String(str))
  let cx = x
  for (const tok of tokens) {
    if (tok.suit) {
      cx += drawSuit(doc, cx, y, tok.suit, suitSize, suitColor)
    } else {
      doc.text(tok.text, cx, y)
      cx += doc.getTextWidth(tok.text)
    }
  }
  return cx
}

/**
 * Measure the rendered width of mixed text + suits, in mm. Mirrors
 * drawText: suits contribute `suitSize + 0.3`, text contributes
 * doc.getTextWidth at the current font size.
 */
function measureText(doc, str, suitSize = 2.2) {
  if (str == null || str === '') return 0
  const tokens = tokenizeSuits(String(str))
  let w = 0
  for (const tok of tokens) {
    if (tok.suit) w += suitSize + 0.3
    else w += doc.getTextWidth(tok.text)
  }
  return w
}

function tokenizeSuits(str) {
  const out = []
  let buf = ''
  for (const ch of str) {
    if (ch === '♠') { if (buf) out.push({ text: buf }); buf = ''; out.push({ suit: 'S' }) }
    else if (ch === '♥') { if (buf) out.push({ text: buf }); buf = ''; out.push({ suit: 'H' }) }
    else if (ch === '♦') { if (buf) out.push({ text: buf }); buf = ''; out.push({ suit: 'D' }) }
    else if (ch === '♣') { if (buf) out.push({ text: buf }); buf = ''; out.push({ suit: 'C' }) }
    else buf += ch
  }
  if (buf) out.push({ text: buf })
  return out
}

// ─── Card-data accessors ───────────────────────────────────────

function r(card, path) {
  return readPath(card?.card_data, path)
}

function range(card, fromPath, toPath) {
  const from = r(card, fromPath)
  const to = r(card, toPath)
  if (from == null && to == null) return ''
  if (from == null) return `?-${to}`
  if (to == null) return `${from}+`
  return `${from}-${to}`
}

// ─── Section renderers ────────────────────────────────────────
// Each renderer takes (doc, card, x, y, w) and returns the height it
// consumed. Sections are stacked vertically within their column.

function renderOverview(doc, card, x, y, w) {
  const h = 28
  drawBox(doc, x, y, w, h)
  drawSectionTitle(doc, x, y, 'General')
  let cy = y + 6
  drawLabelValue(doc, x + 1.2, cy, w - 2, 'Approach', r(card, 'general.system') || '')
  cy += 3.4
  drawLabelValue(doc, x + 1.2, cy, w - 2, 'Open HCP', r(card, 'general.min_hcp_open') || '')
  cy += 3.4
  drawLabelValue(doc, x + 1.2, cy, w - 2, 'Resp HCP', r(card, 'general.min_hcp_respond') || '')
  cy += 3.4
  drawCheckRow(doc, x + 1.2, cy, w - 2, 'Forcing', [
    { label: '1♣', checked: !!r(card, 'general.forcing_opening_1c') },
    { label: '2♣', checked: !!r(card, 'general.forcing_opening_2c') }
  ], 12)
  cy += 3.4
  const style = r(card, 'general.nt_open_style') || ''
  drawCheckRow(doc, x + 1.2, cy, w - 2, '1NT', [
    { label: 'Str', checked: style === 'strong' },
    { label: 'Wk',  checked: style === 'weak' },
    { label: 'Var', checked: style === 'variable' }
  ], 12)
  return h
}

function renderOneNt(doc, card, x, y, w) {
  const h = 24
  drawBox(doc, x, y, w, h)
  drawSectionTitle(doc, x, y, '1NT opening')
  let cy = y + 6
  drawLabelValue(doc, x + 1.2, cy, w - 2, 'Range', range(card, 'notrump.one_nt.range_min', 'notrump.one_nt.range_max'), 10)
  cy += 3.4
  const alt = range(card, 'notrump.one_nt_alt.range_min', 'notrump.one_nt_alt.range_max')
  if (alt) {
    drawLabelValue(doc, x + 1.2, cy, w - 2, 'Alt', alt, 10)
    cy += 3.4
  }
  // Conventions in use
  drawCheckRow(doc, x + 1.2, cy, w - 2, 'Conv', [
    { label: 'Stay', checked: !!r(card, 'notrump.stayman.forcing') },
    { label: 'Jac',  checked: !!r(card, 'notrump.transfers.jacoby') },
    { label: 'Tex',  checked: !!r(card, 'notrump.transfers.texas') }
  ], 10)
  cy += 3.4
  drawCheckRow(doc, x + 1.2, cy, w - 2, '', [
    { label: 'Smol', checked: !!r(card, 'notrump.smolen.play') },
    { label: 'Lebn', checked: !!r(card, 'notrump.lebensohl.over_interference') },
    { label: 'Pup',  checked: !!r(card, 'notrump.stayman.puppet') }
  ], 4)
  return h
}

function renderTwoNt(doc, card, x, y, w) {
  const h = 16
  drawBox(doc, x, y, w, h)
  drawSectionTitle(doc, x, y, '2NT opening')
  let cy = y + 6
  drawLabelValue(doc, x + 1.2, cy, w - 2, 'Range', range(card, 'notrump.two_nt.range_min', 'notrump.two_nt.range_max'), 10)
  cy += 3.4
  drawCheckRow(doc, x + 1.2, cy, w - 2, 'Conv', [
    { label: 'Pup',  checked: !!r(card, 'notrump.two_nt.puppet') },
    { label: 'Tfr3', checked: !!r(card, 'notrump.two_nt.transfers_3level') },
    { label: 'Tfr4', checked: !!r(card, 'notrump.two_nt.transfers_4level') }
  ], 10)
  return h
}

function renderThreeNt(doc, card, x, y, w) {
  const h = 12
  drawBox(doc, x, y, w, h)
  drawSectionTitle(doc, x, y, '3NT opening')
  let cy = y + 6
  drawLabelValue(doc, x + 1.2, cy, w - 2, 'Range', range(card, 'three_nt.range_min', 'three_nt.range_max'), 10)
  cy += 3.4
  drawCheckRow(doc, x + 1.2, cy, w - 2, '', [
    { label: 'Gambling', checked: !!r(card, 'three_nt.one_suit') }
  ], 2)
  return h
}

function renderMajorOpenings(doc, card, x, y, w) {
  const h = 22
  drawBox(doc, x, y, w, h)
  drawSectionTitle(doc, x, y, 'Major openings')
  let cy = y + 6
  const len12 = r(card, 'major_openings.min_length_1st_2nd') || ''
  const len34 = r(card, 'major_openings.min_length_3rd_4th') || ''
  drawLabelValue(doc, x + 1.2, cy, w - 2, 'Min len', `1st/2nd: ${len12}   3rd/4th: ${len34}`, 12)
  cy += 3.4
  drawCheckRow(doc, x + 1.2, cy, w - 2, '1NT', [
    { label: 'F',  checked: !!r(card, 'major_openings.one_nt_response.forcing') },
    { label: 'SF', checked: !!r(card, 'major_openings.one_nt_response.semi_forcing') }
  ], 8)
  cy += 3.4
  drawCheckRow(doc, x + 1.2, cy, w - 2, 'Jump', [
    { label: 'Wk',  checked: !!r(card, 'major_openings.jump_raise.weak') },
    { label: 'Mix', checked: !!r(card, 'major_openings.jump_raise.mixed') },
    { label: 'Inv', checked: !!r(card, 'major_openings.jump_raise.inv') }
  ], 8)
  cy += 3.4
  drawCheckRow(doc, x + 1.2, cy, w - 2, 'Conv', [
    { label: 'J2NT', checked: !!r(card, 'major_openings.jacoby_2nt.play') },
    { label: 'Spl',  checked: !!r(card, 'major_openings.splinters.play') },
    { label: 'Drury', checked: !!r(card, 'major_openings.drury.play') }
  ], 8)
  return h
}

function renderMinorOpenings(doc, card, x, y, w) {
  const h = 22
  drawBox(doc, x, y, w, h)
  drawSectionTitle(doc, x, y, 'Minor openings')
  let cy = y + 6
  const len1c = r(card, 'minor_openings.one_club.min_length') || ''
  const len1d = r(card, 'minor_openings.one_diamond.min_length') || ''
  drawLabelValue(doc, x + 1.2, cy, w - 2, '1♣ min', String(len1c), 8)
  drawLabelValue(doc, x + w / 2, cy, w / 2 - 2, '1♦ min', String(len1d), 8)
  cy += 3.4
  drawCheckRow(doc, x + 1.2, cy, w - 2, '1♣ raise', [
    { label: 'NF',  checked: !!r(card, 'minor_openings.one_club.single_raise.nf') },
    { label: 'Inv', checked: !!r(card, 'minor_openings.one_club.single_raise.inv') },
    { label: 'GF',  checked: !!r(card, 'minor_openings.one_club.single_raise.gf') }
  ], 12)
  cy += 3.4
  drawCheckRow(doc, x + 1.2, cy, w - 2, 'Conv', [
    { label: 'Inv',   checked: !!r(card, 'minor_openings.inverted_minors.play') },
    { label: 'Walsh', checked: !!r(card, 'minor_openings.walsh.play') },
    { label: 'XYZ',   checked: !!r(card, 'minor_openings.one_club.transfer_resp') }
  ], 8)
  return h
}

function renderTwoClubs(doc, card, x, y, w) {
  const h = 18
  drawBox(doc, x, y, w, h)
  drawSectionTitle(doc, x, y, '2♣ opening')
  let cy = y + 6
  drawLabelValue(doc, x + 1.2, cy, w - 2, 'Min HCP', r(card, 'two_level.two_clubs.min_hcp_str') || '', 12)
  cy += 3.4
  const meaning = r(card, 'two_level.two_clubs.meaning') || ''
  drawCheckRow(doc, x + 1.2, cy, w - 2, 'Meaning', [
    { label: 'V.Str', checked: meaning === 'very_strong' },
    { label: 'Str',   checked: meaning === 'strong' },
    { label: 'Nat',   checked: meaning === 'natural' },
    { label: 'Conv',  checked: meaning === 'conventional' }
  ], 12)
  cy += 3.4
  const resp2d = r(card, 'two_level.two_clubs.2d_response') || ''
  drawCheckRow(doc, x + 1.2, cy, w - 2, '2♦ resp', [
    { label: 'Neg',  checked: resp2d === 'negative' },
    { label: 'Wait', checked: resp2d === 'waiting' },
    { label: 'Step', checked: resp2d === 'steps' }
  ], 12)
  return h
}

function renderNtOvercalls(doc, card, x, y, w) {
  const h = 20
  drawBox(doc, x, y, w, h)
  drawSectionTitle(doc, x, y, 'Notrump overcalls')
  let cy = y + 6
  drawLabelValue(doc, x + 1.2, cy, w - 2, 'Direct',
    range(card, 'nt_overcalls.direct.range_min', 'nt_overcalls.direct.range_max'), 12)
  cy += 3.4
  drawLabelValue(doc, x + 1.2, cy, w - 2, 'Balance',
    range(card, 'nt_overcalls.balance.range_min', 'nt_overcalls.balance.range_max'), 12)
  cy += 3.4
  drawCheckRow(doc, x + 1.2, cy, w - 2, 'Sys on', [
    { label: 'Direct',  checked: !!r(card, 'nt_overcalls.direct.systems_on') },
    { label: 'Balance', checked: !!r(card, 'nt_overcalls.balance.systems_on') }
  ], 12)
  cy += 3.4
  drawCheckRow(doc, x + 1.2, cy, w - 2, 'Jump 2NT', [
    { label: '2 lowest unbid', checked: !!r(card, 'nt_overcalls.jump_2nt_lowest_unbid') }
  ], 14)
  return h
}

function renderOtherConv(doc, card, x, y, w) {
  const h = 18
  drawBox(doc, x, y, w, h)
  drawSectionTitle(doc, x, y, 'Other conv. calls')
  let cy = y + 6
  drawCheckRow(doc, x + 1.2, cy, w - 2, 'NMF', [
    { label: 'Std',     checked: !!r(card, 'other_conventions.new_minor_forcing.play') },
    { label: '2-Way',   checked: !!r(card, 'other_conventions.two_way_nmf') },
    { label: 'XYZ',     checked: !!r(card, 'other_conventions.xyz') }
  ], 10)
  cy += 3.4
  drawCheckRow(doc, x + 1.2, cy, w - 2, '4th SF', [
    { label: '1 Rd',  checked: !!r(card, 'other_conventions.fourth_suit_forcing.one_round') },
    { label: 'Game',  checked: !!r(card, 'other_conventions.fourth_suit_forcing.game_force') }
  ], 10)
  cy += 3.4
  drawLabelValue(doc, x + 1.2, cy, w - 2, 'Vs str open', r(card, 'other_conventions.vs_strong_open') || '', 16)
  return h
}

function renderOvercalls(doc, card, x, y, w) {
  const h = 22
  drawBox(doc, x, y, w, h)
  drawSectionTitle(doc, x, y, 'Overcalls')
  let cy = y + 6
  drawLabelValue(doc, x + 1.2, cy, w - 2, '1-lvl', range(card, 'overcalls.one_level_min', 'overcalls.one_level_max'), 10)
  cy += 3.4
  drawLabelValue(doc, x + 1.2, cy, w - 2, '2-lvl', range(card, 'overcalls.two_level_min', 'overcalls.two_level_max'), 10)
  cy += 3.4
  const jump = r(card, 'overcalls.jump') || ''
  drawCheckRow(doc, x + 1.2, cy, w - 2, 'Jump', [
    { label: 'Wk',  checked: jump === 'weak' },
    { label: 'Int', checked: jump === 'intermediate' },
    { label: 'Str', checked: jump === 'strong' }
  ], 10)
  cy += 3.4
  const ns = r(card, 'overcalls.responses.new_suit') || ''
  drawCheckRow(doc, x + 1.2, cy, w - 2, 'NS', [
    { label: 'F',    checked: ns === 'forcing' },
    { label: 'NFC',  checked: ns === 'nf_constructive' },
    { label: 'NF',   checked: ns === 'nf' },
    { label: 'Tfr',  checked: ns === 'transfer' }
  ], 10)
  return h
}

function renderDoubles(doc, card, x, y, w) {
  const h = 18
  drawBox(doc, x, y, w, h)
  drawSectionTitle(doc, x, y, 'Doubles')
  let cy = y + 6
  drawLabelValue(doc, x + 1.2, cy, w - 2, 'Neg thru', r(card, 'doubles.negative.through') || '', 14)
  cy += 3.4
  drawLabelValue(doc, x + 1.2, cy, w - 2, 'Resp thru', r(card, 'doubles.responsive.through') || '', 14)
  cy += 3.4
  drawCheckRow(doc, x + 1.2, cy, w - 2, '', [
    { label: 'Spt',  checked: !!r(card, 'doubles.support.play') },
    { label: 'SRdbl', checked: !!r(card, 'doubles.support.rdbl') },
    { label: 'Max',  checked: !!r(card, 'doubles.maximal') }
  ], 2)
  return h
}

function renderSlams(doc, card, x, y, w) {
  const h = 22
  drawBox(doc, x, y, w, h)
  drawSectionTitle(doc, x, y, 'Slams')
  let cy = y + 6
  drawCheckRow(doc, x + 1.2, cy, w - 2, '4NT', [
    { label: 'BW',   checked: !!r(card, 'other_conventions.blackwood.standard') },
    { label: '0314', checked: !!r(card, 'other_conventions.blackwood.rkcb_0314') },
    { label: '1430', checked: !!r(card, 'other_conventions.blackwood.rkcb_1430') }
  ], 10)
  cy += 3.4
  drawCheckRow(doc, x + 1.2, cy, w - 2, 'Gerber', [
    { label: 'NT',  checked: !!r(card, 'other_conventions.gerber.directly_over_nt') },
    { label: 'Seq', checked: !!r(card, 'other_conventions.gerber.over_nt_seq') },
    { label: 'Non', checked: !!r(card, 'other_conventions.gerber.non_nt_seq') }
  ], 10)
  cy += 3.4
  drawCheckRow(doc, x + 1.2, cy, w - 2, 'Intf', [
    { label: 'DOPI', checked: !!r(card, 'slam.dopi') },
    { label: 'DEPO', checked: !!r(card, 'slam.depo') },
    { label: 'ROPI', checked: !!r(card, 'slam.ropi') }
  ], 10)
  cy += 3.4
  drawLabelValue(doc, x + 1.2, cy, w - 2, 'Ctrl', r(card, 'slam.control_bids') || '', 8)
  return h
}

function renderVsNt(doc, card, x, y, w) {
  // Pre-count rows that will actually render so the box height matches.
  const bids = ['dbl', '2c', '2d', '2h', '2s', '2nt']
  const filled = bids.filter(b => r(card, `competitive.vs_1nt_strong.${b}`))
  // 2 system rows + 1 gap + N filled bid rows + footer padding
  const h = 6 + 3.4 + 3.4 + 4 + filled.length * 3 + 2
  drawBox(doc, x, y, w, h)
  drawSectionTitle(doc, x, y, 'Vs 1NT')
  let cy = y + 6
  drawLabelValue(doc, x + 1.2, cy, w - 2, 'Str',
    r(card, 'competitive.vs_1nt_strong.system') || '', 8)
  cy += 3.4
  drawLabelValue(doc, x + 1.2, cy, w - 2, 'Wk',
    r(card, 'competitive.vs_1nt_weak.system') || '', 8)
  cy += 4
  // Per-bid meanings (just for the strong-NT defense to keep this compact)
  for (const bid of filled) {
    const val = r(card, `competitive.vs_1nt_strong.${bid}`)
    const label = bid === 'dbl'
      ? 'Dbl'
      : bid.replace('c', '♣').replace('d', '♦').replace('h', '♥').replace('s', '♠').replace('nt', 'NT').toUpperCase()
    drawLabelValue(doc, x + 1.2, cy, w - 2, label, val, 8)
    cy += 3
  }
  return h
}

function renderVsTakeoutDbl(doc, card, x, y, w) {
  const h = 22
  drawBox(doc, x, y, w, h)
  drawSectionTitle(doc, x, y, 'Vs T/O Dbl')
  let cy = y + 6
  drawCheckRow(doc, x + 1.2, cy, w - 2, 'NSF', [
    { label: '2-lvl', checked: !!r(card, 'vs_to_double.new_suit_forcing_2lvl') },
    { label: 'Tfr',   checked: !!r(card, 'vs_to_double.new_suit_forcing_tfr') }
  ], 8)
  cy += 3.4
  const js = r(card, 'vs_to_double.jump_shift') || ''
  drawCheckRow(doc, x + 1.2, cy, w - 2, 'JS', [
    { label: 'Wk',  checked: js === 'weak' },
    { label: 'Inv', checked: js === 'inv' },
    { label: 'F',   checked: js === 'forcing' },
    { label: 'Fit', checked: js === 'fit' }
  ], 8)
  cy += 3.4
  drawCheckRow(doc, x + 1.2, cy, w - 2, 'Rdbl', [
    { label: '10+',  checked: !!r(card, 'vs_to_double.redouble.ten_plus') },
    { label: 'Conv', checked: !!r(card, 'vs_to_double.redouble.conv') },
    { label: 'NoFit', checked: !!r(card, 'vs_to_double.redouble.denies_fit') }
  ], 8)
  cy += 3.4
  drawCheckRow(doc, x + 1.2, cy, w - 2, '2NT', [
    { label: '♣/♦',   checked: !!r(card, 'vs_to_double.two_nt_raise_minors.play') },
    { label: '♥/♠',   checked: !!r(card, 'vs_to_double.two_nt_raise_majors.play') }
  ], 8)
  return h
}

function renderVsPreempts(doc, card, x, y, w) {
  const h = 18
  drawBox(doc, x, y, w, h)
  drawSectionTitle(doc, x, y, 'Vs Preempts')
  let cy = y + 6
  drawLabelValue(doc, x + 1.2, cy, w - 2, 'T/O thru', r(card, 'vs_preempts.takeout_double_thru') || '', 12)
  cy += 3.4
  drawLabelValue(doc, x + 1.2, cy, w - 2, '2NT', r(card, 'vs_preempts.two_nt_overcall') || '', 12)
  cy += 3.4
  drawCheckRow(doc, x + 1.2, cy, w - 2, '', [
    { label: 'Penalty', checked: !!r(card, 'vs_preempts.takeout_double_penalty') },
    { label: 'Lebensohl', checked: !!r(card, 'vs_preempts.lebensohl_response') }
  ], 2)
  return h
}

function renderDirectCuebids(doc, card, x, y, w) {
  const h = 26
  drawBox(doc, x, y, w, h)
  drawSectionTitle(doc, x, y, 'Direct cuebids')
  // Compact: list which columns have michaels checked
  let cy = y + 6
  const cols = [
    { key: 'art',        label: 'Art ♣/♦' },
    { key: 'quasi',      label: 'Quasi ♣/♦' },
    { key: 'nat_minors', label: 'Nat ♣/♦' },
    { key: 'nat_majors', label: 'Nat ♥/♠' }
  ]
  for (const col of cols) {
    const mich   = !!r(card, `direct_cuebids.${col.key}_michaels`)
    const nat    = !!r(card, `direct_cuebids.${col.key}_natural`)
    const other  = !!r(card, `direct_cuebids.${col.key}_other`)
    if (!mich && !nat && !other) continue
    drawCheckRow(doc, x + 1.2, cy, w - 2, col.label, [
      { label: 'Mich', checked: mich },
      { label: 'Nat',  checked: nat },
      { label: 'Other', checked: other }
    ], 18)
    cy += 3.2
  }
  return h
}

function renderPreempts(doc, card, x, y, w) {
  const h = 18
  drawBox(doc, x, y, w, h)
  drawSectionTitle(doc, x, y, 'Preempts')
  let cy = y + 6
  drawLabelValue(doc, x + 1.2, cy, w - 2, '3-lvl', r(card, 'preempts.three_level_style') || '', 10)
  cy += 3.4
  drawLabelValue(doc, x + 1.2, cy, w - 2, '4-lvl', r(card, 'preempts.four_level_style') || '', 10)
  cy += 3.4
  drawCheckRow(doc, x + 1.2, cy, w - 2, '', [
    { label: '4♣/4♦ tfr', checked: !!r(card, 'preempts.transfer_4_minor') }
  ], 2)
  return h
}

function renderCarding(doc, card, x, y, w) {
  const h = 22
  drawBox(doc, x, y, w, h)
  drawSectionTitle(doc, x, y, 'Carding')
  let cy = y + 6
  drawCheckRow(doc, x + 1.2, cy, w - 2, 'Suits', [
    { label: 'StdA',  checked: !!r(card, 'carding.suits.standard_attitude') },
    { label: 'StdC',  checked: !!r(card, 'carding.suits.standard_count') },
    { label: 'UDA',   checked: !!r(card, 'carding.suits.upside_down_attitude') },
    { label: 'UDC',   checked: !!r(card, 'carding.suits.upside_down_count') }
  ], 10)
  cy += 3.4
  drawCheckRow(doc, x + 1.2, cy, w - 2, 'NT', [
    { label: 'StdA',  checked: !!r(card, 'carding.nt.standard_attitude') },
    { label: 'StdC',  checked: !!r(card, 'carding.nt.standard_count') },
    { label: 'UDA',   checked: !!r(card, 'carding.nt.upside_down_attitude') },
    { label: 'UDC',   checked: !!r(card, 'carding.nt.upside_down_count') }
  ], 10)
  cy += 3.4
  drawCheckRow(doc, x + 1.2, cy, w - 2, 'Smith', [
    { label: 'Suit',  checked: !!r(card, 'carding.smith_echo_suits') },
    { label: 'NT',    checked: !!r(card, 'carding.smith_echo_nt') },
    { label: 'Rev',   checked: !!r(card, 'carding.smith_echo_reverse') }
  ], 10)
  cy += 3.4
  drawLabelValue(doc, x + 1.2, cy, w - 2, 'Trump', r(card, 'carding.trump_signals') || '', 10)
  return h
}

function renderSignals(doc, card, x, y, w) {
  const h = 16
  drawBox(doc, x, y, w, h)
  drawSectionTitle(doc, x, y, 'Signals')
  let cy = y + 6
  drawCheckRow(doc, x + 1.2, cy, w - 2, 'Decl', [
    { label: 'Att',  checked: !!r(card, 'carding.declarer_lead.attitude') },
    { label: 'Cnt',  checked: !!r(card, 'carding.declarer_lead.count') },
    { label: 'SP',   checked: !!r(card, 'carding.declarer_lead.suit_preference') }
  ], 10)
  cy += 3.4
  drawCheckRow(doc, x + 1.2, cy, w - 2, 'Ptr', [
    { label: 'Att',  checked: !!r(card, 'carding.partner_lead.attitude') },
    { label: 'Cnt',  checked: !!r(card, 'carding.partner_lead.count') },
    { label: 'SP',   checked: !!r(card, 'carding.partner_lead.suit_preference') }
  ], 10)
  cy += 3.4
  drawCheckRow(doc, x + 1.2, cy, w - 2, '1st disc', [
    { label: 'Std',  checked: !!r(card, 'carding.first_discard.standard') },
    { label: 'UD',   checked: !!r(card, 'carding.first_discard.upside_down') },
    { label: 'Lav',  checked: !!r(card, 'carding.first_discard.lavinthal') },
    { label: 'O/E',  checked: !!r(card, 'carding.first_discard.odd_even') }
  ], 10)
  return h
}

function renderLeadsBlock(doc, card, x, y, w, basePath, title) {
  const h = 16
  drawBox(doc, x, y, w, h)
  drawSectionTitle(doc, x, y, title)
  let cy = y + 6
  drawCheckRow(doc, x + 1.2, cy, w - 2, 'Length', [
    { label: '4th',   checked: !!r(card, `${basePath}.length.fourth_best`) },
    { label: '3rd/5', checked: !!r(card, `${basePath}.length.third_fifth`) },
    { label: '3rd/L', checked: !!r(card, `${basePath}.length.third_low`) },
    { label: 'Att',   checked: !!r(card, `${basePath}.length.attitude`) }
  ], 12)
  cy += 3.4
  drawLabelValue(doc, x + 1.2, cy, w - 2, 'After 1st', r(card, `${basePath}.after_first_trick`) || '', 12)
  cy += 3.4
  drawLabelValue(doc, x + 1.2, cy, w - 2, 'Excpt', r(card, `${basePath}.exceptions`) || '', 12)
  return h
}

function renderWeakTwo(doc, card, x, y, w, suit, suitChar) {
  const h = 14
  drawBox(doc, x, y, w, h)
  drawSectionTitle(doc, x, y, `2${suitChar} OPENING`)
  let cy = y + 6
  drawLabelValue(doc, x + 1.2, cy, w - 2, 'Range',
    range(card, `two_level.two_${suit}.min_hcp`, `two_level.two_${suit}.max_hcp`), 10)
  cy += 3.4
  drawCheckRow(doc, x + 1.2, cy, w - 2, '', [
    { label: '2-suit', checked: !!r(card, `two_level.two_${suit}.two_suited`) },
    { label: 'NSNF',   checked: !!r(card, `two_level.two_${suit}.new_suit_nf`) },
    { label: 'Ogust',  checked: !!r(card, 'two_level.ogust.play') }
  ], 2)
  return h
}

// ─── Layout pipeline ──────────────────────────────────────────
// Currently a simple per-column stack — sections are placed into
// columns by hand. A future pass can flow sections into columns
// automatically based on remaining space.

/**
 * Place a section at the top of the next available slot in `col`,
 * call its render function, and advance the column cursor by the
 * height the renderer actually consumed. Renderers must return their
 * own height in mm.
 */
function place(layout, col, render) {
  const x = colX(col)
  const y = layout.colY[col]
  const h = render(x, y)
  layout.colY[col] = y + h + 1.5
}

function renderHeader(doc, card) {
  setText(doc, 11, 'bold')
  const partnerNames = r(card, 'metadata.partner_names') || ''
  const title = partnerNames || card?.name || 'Convention card'
  doc.text(title, MARGIN, MARGIN + 4)
  setText(doc, 7, 'normal', COLOR_GREY)
  const date = new Date().toISOString().slice(0, 10)
  doc.text(`Printed ${date}`, PAGE_W - MARGIN - 28, MARGIN + 4)
  return 6
}

// ─── Public API ───────────────────────────────────────────────

/**
 * Build the PDF for `card` and return a jsPDF doc instance. Caller
 * decides what to do (`doc.save('filename.pdf')`, blob URL, etc.).
 */
export function buildAcblCardPdf(card) {
  const doc = new jsPDF({ unit: 'mm', format: 'letter', orientation: 'portrait' })
  const layout = makeLayout()

  // Header (full-width) consumes y-space at the top of all columns.
  const headerH = renderHeader(doc, card)
  layout.colY[0] = MARGIN + headerH + 1
  layout.colY[1] = MARGIN + headerH + 1
  layout.colY[2] = MARGIN + headerH + 1

  // Layout mirrors the ACBL Classic 2023 card column structure
  // (see documentation/convention-card-formats/acbl-classic-2023-blank.pdf):
  //   left   = defensive bidding + slams + leads
  //   middle = NT/competitive defenses + carding
  //   right  = our own opening bid structure

  // Column 0 (left): Doubles → Overcalls → Preempts → Direct Cuebid → Slams → Leads
  place(layout, 0, (x, y) => renderDoubles(doc, card, x, y, COL_W))
  place(layout, 0, (x, y) => renderOvercalls(doc, card, x, y, COL_W))
  place(layout, 0, (x, y) => renderPreempts(doc, card, x, y, COL_W))
  place(layout, 0, (x, y) => renderDirectCuebids(doc, card, x, y, COL_W))
  place(layout, 0, (x, y) => renderSlams(doc, card, x, y, COL_W))
  place(layout, 0, (x, y) => renderLeadsBlock(doc, card, x, y, COL_W, 'leads.vs_suits', 'Leads vs suits'))
  place(layout, 0, (x, y) => renderLeadsBlock(doc, card, x, y, COL_W, 'leads.vs_nt', 'Leads vs NT'))

  // Column 1 (middle): NT overcalls → Vs NT → Vs T/O Dbl → Vs Preempts → Carding/Signals
  place(layout, 1, (x, y) => renderNtOvercalls(doc, card, x, y, COL_W))
  place(layout, 1, (x, y) => renderVsNt(doc, card, x, y, COL_W))
  place(layout, 1, (x, y) => renderVsTakeoutDbl(doc, card, x, y, COL_W))
  place(layout, 1, (x, y) => renderVsPreempts(doc, card, x, y, COL_W))
  place(layout, 1, (x, y) => renderCarding(doc, card, x, y, COL_W))
  place(layout, 1, (x, y) => renderSignals(doc, card, x, y, COL_W))

  // Column 2 (right): Names/Approach → NT openings → Major + Minor → 2♣ → weak twos → Other
  place(layout, 2, (x, y) => renderOverview(doc, card, x, y, COL_W))
  place(layout, 2, (x, y) => renderOneNt(doc, card, x, y, COL_W))
  place(layout, 2, (x, y) => renderTwoNt(doc, card, x, y, COL_W))
  place(layout, 2, (x, y) => renderThreeNt(doc, card, x, y, COL_W))
  place(layout, 2, (x, y) => renderMajorOpenings(doc, card, x, y, COL_W))
  place(layout, 2, (x, y) => renderMinorOpenings(doc, card, x, y, COL_W))
  place(layout, 2, (x, y) => renderTwoClubs(doc, card, x, y, COL_W))
  place(layout, 2, (x, y) => renderWeakTwo(doc, card, x, y, COL_W, 'diamonds', '♦'))
  place(layout, 2, (x, y) => renderWeakTwo(doc, card, x, y, COL_W, 'hearts', '♥'))
  place(layout, 2, (x, y) => renderWeakTwo(doc, card, x, y, COL_W, 'spades', '♠'))
  place(layout, 2, (x, y) => renderOtherConv(doc, card, x, y, COL_W))

  // Footer
  setText(doc, 6, 'normal', COLOR_GREY)
  doc.text('Bridge Classroom — Old ACBL format', MARGIN, PAGE_H - 3)

  return doc
}

/**
 * Trigger a browser download of the card as a PDF. Filename derives
 * from the partner names + card name when available.
 */
export function downloadAcblCardPdf(card) {
  const doc = buildAcblCardPdf(card)
  const filename = pdfFilename(card)
  doc.save(filename)
}

function pdfFilename(card) {
  const partner = (card?.card_data?.metadata?.partner_names || '').trim()
  const name = (card?.name || 'convention-card').trim()
  const base = (partner || name).replace(/[^\w\s.-]+/g, '').replace(/\s+/g, '-')
  const date = new Date().toISOString().slice(0, 10)
  return `${base || 'convention-card'}-${date}.pdf`
}
