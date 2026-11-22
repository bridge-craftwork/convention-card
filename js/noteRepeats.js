// Note lines that repeat what the card already says (#132). Older imports
// wrote a box's text twice: in the field it fills, and as a line of the
// section's notes ("2NT: 2-under Texas" beside the 2NT notes box saying
// "2-under Texas"). A line repeats when it is a field's text, or is one
// after its label ("1♣: XYZ" where the 1♣ notes say "XYZ").
//
// The notes page leaves these lines out, and the editor offers to remove
// them from the card. Nothing is removed without asking.

import { FIELDS } from './spec.js'
import { readPath, writePath } from './paths.js'
import { cardSettings } from './boxMap.js'

// The section notes, which imports wrote; not the general notes, the
// partnership's own words.
const NOTE_FIELDS = Object.keys(FIELDS).filter(p => /^notes\.\w+_notes$/.test(p))

const afterLabel = line => {
  const i = line.indexOf(': ')
  return i > 0 ? line.slice(i + 2).trim() : null
}

/** The text of every field outside the notes section, trimmed. */
function fieldTexts(cardData) {
  const texts = new Set()
  for (const [path, v] of cardSettings(cardData).values) {
    if (path.startsWith('notes.') || typeof v !== 'string') continue
    for (const t of [v, ...v.split('\n')]) if (t.trim()) texts.add(t.trim())
  }
  return texts
}

/**
 * The note lines that repeat a field: `[{ path, line }]`, `path` the notes
 * field (`notes.notrump_notes`) and `line` as written.
 */
export function repeatedNoteLines(cardData) {
  const texts = fieldTexts(cardData)
  const repeats = t => texts.has(t.trim()) || texts.has(afterLabel(t) ?? '\0')
  const out = []
  for (const path of NOTE_FIELDS) {
    const value = readPath(cardData, path)
    if (typeof value !== 'string') continue
    for (const line of value.split('\n')) if (line.trim() && repeats(line)) out.push({ path, line })
  }
  return out
}

/** A notes field's text without its repeated lines (`null`: nothing left). */
export function withoutRepeats(value, repeated) {
  const drop = new Set(repeated)
  const kept = String(value).split('\n').filter(l => !drop.has(l))
  return kept.some(l => l.trim()) ? kept.join('\n').trim() : null
}

/**
 * Remove the repeated note lines from `cardData`, in place. Returns how
 * many lines went. A notes field left empty is removed.
 */
export function removeRepeatedNotes(cardData) {
  const repeated = repeatedNoteLines(cardData)
  const byPath = new Map()
  for (const { path, line } of repeated) byPath.set(path, [...(byPath.get(path) || []), line])
  for (const [path, lines] of byPath) {
    const left = withoutRepeats(readPath(cardData, path), lines)
    if (left == null) {
      const [, key] = path.split('.')
      delete cardData.notes[key]
    } else {
      writePath(cardData, path, left)
    }
  }
  if (cardData.notes && !Object.keys(cardData.notes).length) delete cardData.notes
  return repeated.length
}
