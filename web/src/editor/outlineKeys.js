// Outline keys in a notes box (Rick Wilson, 2026-11-25). Notes stay plain
// text; an outline is a Markdown list, as the notes page prints it
// (js/notesPage.js): "- " (or "* ", "• ", "1. ", "a) ") starts an item and
// each two spaces before it is a level. These keys save counting spaces:
//
//   Tab        indent the line, or every line of the selection, one level
//   Shift-Tab  take them back out a level
//   Enter      on an item, start the next item at the same level ("2."
//              after "1."); on an item with nothing typed, end the list
//
// Tab and Shift-Tab act only on an outline line or a selection of several
// lines; elsewhere Tab moves to the next field, as it always has.

import { BULLET } from '../../../js/outlineBullets.js'

const STEP = '  '
const ITEM = new RegExp(`^( *)(${BULLET}|\\d{1,3}[.)]|[a-z][.)])( +)(.*)$`)

const lineStart = (text, i) => text.lastIndexOf('\n', i - 1) + 1
const lineEnd = (text, i) => { const e = text.indexOf('\n', i); return e < 0 ? text.length : e }

function nextMarker(marker) {
  const n = /^(\d+)([.)])$/.exec(marker)
  if (n) return `${Number(n[1]) + 1}${n[2]}`
  const a = /^([a-y])([.)])$/.exec(marker)
  if (a) return `${String.fromCharCode(a[1].charCodeAt(0) + 1)}${a[2]}`
  return marker
}

/**
 * The edit a key makes: `{ value, start, end }` (the text and selection
 * after it), or null to leave the key to the browser. `key` is 'Tab' or
 * 'Enter'; `start`/`end` the selection.
 */
export function outlineEdit(value, start, end, key, shift = false) {
  if (key === 'Tab') return indentEdit(value, start, end, shift)
  if (key === 'Enter' && !shift && start === end) return enterEdit(value, start)
  return null
}

function indentEdit(value, start, end, out) {
  const from = lineStart(value, start)
  const to = lineEnd(value, end > start && value[end - 1] === '\n' ? end - 1 : end)
  const lines = value.slice(from, to).split('\n')
  if (lines.length === 1 && !ITEM.test(lines[0])) return null
  let firstShift = 0, total = 0
  const changed = lines.map((line, i) => {
    if (!line.trim()) return line
    let d
    if (!out) d = STEP.length
    else d = -Math.min(STEP.length, line.match(/^ */)[0].length)
    if (i === 0) firstShift = d
    total += d
    return d > 0 ? STEP + line : line.slice(-d)
  })
  if (!total) return null
  const block = changed.join('\n')
  // A selection from a line's start keeps the whole line
  const s = start === from && start !== end ? from : Math.max(from, start + firstShift)
  return { value: value.slice(0, from) + block + value.slice(to), start: s, end: start === end ? s : end + total }
}

function enterEdit(value, at) {
  const from = lineStart(value, at)
  const m = ITEM.exec(value.slice(from, lineEnd(value, at)))
  if (!m || at < from + m[1].length + m[2].length + m[3].length) return null
  const [, indent, marker, gap, rest] = m
  if (!rest.trim()) {
    // An empty item ends the list: the line is left blank
    const to = lineEnd(value, at)
    return { value: value.slice(0, from) + value.slice(to), start: from, end: from }
  }
  const insert = `\n${indent}${nextMarker(marker)}${gap}`
  return { value: value.slice(0, at) + insert + value.slice(at), start: at + insert.length, end: at + insert.length }
}
