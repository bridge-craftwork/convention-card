// What an import ticked on its own, for the open card's notes: boxes its
// text names (textMapping.js, `implies`) and conventions its text names by a
// specific name (recogniseConventions.js). Shared by the editor's Import and
// the table of cards' Import, through the editor state's `importNotes`.

import { field } from '../../../js/spec.js'

const label = path => field(path)?.label || path

/** Notes (`{ severity, message }`) saying what importing `records` ticked. */
export function importReportNotes(records) {
  const notes = []
  for (const r of records) {
    for (const s of r.implied || []) {
      notes.push({ severity: 'info', message: `Ticked “${s.label}”: the card's ${label(s.from)} says “${s.written}”.` })
    }
    const recognised = r.recognised || []
    if (recognised.length) {
      notes.push({
        severity: 'info',
        message: `Ticked ${recognised.length} ${recognised.length === 1 ? 'convention' : 'conventions'} the card's notes name: ${recognised.map(s => s.name).join(', ')}. Your notes are kept as written.`,
      })
    }
  }
  return notes
}
