// The bridge-craftwork tool contract (bridge-craftwork-site issue #3) for the
// standalone editor: `window.card`. No DOM here. The page (main.js) hands it
// the editor's open card and a way to open a new one; Node runs it as it
// is (web/__tests__/tool.test.js). Reading goes through the library's
// importCard and checking through its checkCard, the same code the editor's
// Import uses, so a program and the page cannot disagree.
//
// INPUT, PARAMS and OUTPUTS are the vocabulary: reference.txt is written
// from them (scripts/emit-reference.mjs).

import { importCard, IMPORT_FORMATS } from '../../js/importCard.js'
import { checkCard, EXPORT_SCHEMA } from '../../js/checkCard.js'
import { encodeCardForUrl } from '../../js/handoff.js'
import { bridgeClassroomUrl } from './handoffToBridgeClassroom.js'
import PACKAGE from '../../package.json' with { type: 'json' }

export const GLOBAL = 'card'
export const HOME = 'https://bridge-craftwork.com/card/'

/** What `input` may be. */
export const INPUT = [
  { form: 'object', about: `A card as JSON: the editor's export ({ schema: "${EXPORT_SCHEMA}", name, description, card_data }), a record { name, description, card_data }, bare card_data, BBO's export or bridgeodex's.` },
  { form: 'string', about: 'The same JSON as text, a .bbsa file\'s text, or a hand-off (v1.<data>, or a URL ending #import=v1.<data>).' },
  { form: 'ArrayBuffer | Uint8Array', about: 'A file\'s bytes: a PDF this editor exported (the card travels inside it), or any of the text forms.' },
  { form: 'null or omitted', about: 'run, validate: the card open in the editor, unsaved edits included.' },
]

/** What `run` can produce, by `params.to`. */
export const OUTPUTS = {
  card: `The editor's export, as an object: { schema: "${EXPORT_SCHEMA}", name, description, exportedAt, card_data }. What Export Content saves, and what Import reads back.`,
  card_data: 'card_data alone, the nested settings object.',
  bbsa: "BBA's .bbsa convention file, as text.",
  'pdf-classic': 'The ACBL Classic card, filled in, as PDF bytes (Uint8Array). The card travels inside it, so Import reads it back.',
  'pdf-new': 'The ACBL New card, filled in, as PDF bytes (Uint8Array). The card travels inside it too.',
  'pdf-drawn': 'A card drawn from scratch in the ACBL layout, as PDF bytes (Uint8Array).',
  link: `A URL that opens this editor with the card added to that browser's cards (${HOME}#import=v1.<data>).`,
  'bridge-classroom': 'A URL that opens Bridge Classroom with the card, to save to an account there.',
}

/** What `params` may carry. */
export const PARAMS = [
  { name: 'from', values: Object.keys(IMPORT_FORMATS), default: 'guessed from the input', about: 'The input\'s format, when it should not be guessed.' },
  { name: 'to', values: Object.keys(OUTPUTS), default: 'card', about: 'run, getOutput: what to produce (see OUTPUTS).' },
  { name: 'name', form: 'text', default: 'the card\'s own name', about: 'The card\'s name: for a .bbsa file, which carries none, or to rename it.' },
]

const PARAM_NAMES = new Set(PARAMS.map(p => p.name))

function diag(severity, message, extra = {}) {
  return { severity, message, ...extra }
}

function paramDiagnostics(params) {
  const d = []
  for (const k of Object.keys(params || {})) {
    if (!PARAM_NAMES.has(k)) d.push(diag('warning', `params.${k}: not a parameter (ignored)`, { hint: `parameters: ${[...PARAM_NAMES].join(', ')}` }))
  }
  if (params?.to != null && !Object.hasOwn(OUTPUTS, params.to)) {
    d.push(diag('error', `params.to: "${params.to}" is not an output`, { hint: `one of ${Object.keys(OUTPUTS).join(', ')}` }))
  }
  if (params?.from != null && !Object.hasOwn(IMPORT_FORMATS, params.from)) {
    d.push(diag('error', `params.from: "${params.from}" is not a format`, { hint: `one of ${Object.keys(IMPORT_FORMATS).join(', ')}` }))
  }
  return d
}

const hasError = d => d.some(x => x.severity === 'error')

/** The PDF module, loaded only when a PDF is asked for (it brings pdf-lib and jsPDF). */
async function pdfBytes(record, to) {
  if (to === 'pdf-drawn') {
    const { buildAcblCardPdf } = await import('../../js/acblCardPdf.js')
    return new Uint8Array(buildAcblCardPdf(record).output('arraybuffer'))
  }
  const { renderAcblPdfBytes } = await import('../../js/acblClassicFillPdf.js')
  return renderAcblPdfBytes(record, to === 'pdf-new' ? 'new' : 'classic')
}

async function produce(record, to) {
  switch (to) {
    case 'card':
      return { schema: EXPORT_SCHEMA, name: record.name, description: record.description, exportedAt: new Date().toISOString(), card_data: record.card_data }
    case 'card_data':
      return record.card_data
    case 'bbsa': {
      const { exportBbsa } = await import('../../js/bbsa.js')
      return exportBbsa(record.card_data).text
    }
    case 'pdf-classic':
    case 'pdf-new':
    case 'pdf-drawn':
      return pdfBytes(record, to)
    case 'link':
      return `${HOME}#import=${await encodeCardForUrl(record)}`
    case 'bridge-classroom':
      return bridgeClassroomUrl(record)
  }
}

/**
 * The tool. `current()` returns the card open in the editor
 * ({ name, description, card_data }, unsaved edits included) or null;
 * `open(record)` adds a card to the browser's cards and opens it.
 */
export function createTool({ current = () => null, open = null } = {}) {
  /** Read `input` (or the open card) and check it: { record, format, diagnostics }. */
  async function read(input, params = {}) {
    const diagnostics = paramDiagnostics(params)
    let record
    let format = 'card'
    if (input == null) {
      record = current()
      if (!record) return { record: null, diagnostics: [...diagnostics, diag('error', 'No card is open, and no input was given')] }
    } else {
      try {
        const read = await importCard(input, { from: params.from || null, name: params.name || null })
        format = read.format
        record = { name: read.name, description: read.description, card_data: read.card_data }
        for (const w of read.report?.warnings || []) diagnostics.push(diag('warning', `.bbsa: ${w}`))
        if (read.format === 'pdf') {
          const { pdfReportDiagnostics } = await import('../../js/acblPdfImport.js')
          diagnostics.push(...pdfReportDiagnostics(read.report))
        }
      } catch (err) {
        return { record: null, diagnostics: [...diagnostics, diag('error', err.message)] }
      }
    }
    if (params.name) record = { ...record, name: params.name }
    const checked = checkCard(record)
    return { record, format, diagnostics: [...diagnostics, ...checked.diagnostics] }
  }

  const tool = {
    /**
     * Read `input` (null: the open card) and produce `params.to`:
     * { ok, from, name, output, diagnostics }. A card with problems is
     * still converted, as the editor does; `ok` is false when any
     * diagnostic is an error.
     */
    async run(input = null, params = {}) {
      const { record, format, diagnostics } = await read(input, params)
      if (!record || hasError(paramDiagnostics(params))) return { ok: false, output: null, diagnostics }
      try {
        const output = await produce(record, params.to || 'card')
        return { ok: !hasError(diagnostics), from: format, name: record.name, output, diagnostics }
      } catch (err) {
        return { ok: false, from: format, name: record.name, output: null, diagnostics: [...diagnostics, diag('error', err.message)] }
      }
    },

    /** Read and check `input` (null: the open card) without converting it: { ok, from, name, diagnostics }. */
    async validate(input = null, params = {}) {
      const { record, format, diagnostics } = await read(input, params)
      return { ok: !!record && !hasError(diagnostics), from: record ? format : null, name: record?.name ?? null, diagnostics }
    },

    /** The card open in the editor, as the editor's export (unsaved edits included), or null. */
    getInput() {
      const record = current()
      return record && { schema: EXPORT_SCHEMA, name: record.name, description: record.description, card_data: record.card_data }
    },

    /** Add `input` to this browser's cards and open it: { ok, name, diagnostics }. */
    async setInput(input, params = {}) {
      if (!open) return { ok: false, diagnostics: [diag('error', 'This page cannot open cards')] }
      const { record, diagnostics } = await read(input, params)
      if (!record) return { ok: false, name: null, diagnostics }
      const name = record.name || 'Imported convention card'
      try {
        await open({ ...record, name })
      } catch (err) {
        return { ok: false, name, diagnostics: [...diagnostics, diag('error', err.message)] }
      }
      return { ok: !hasError(diagnostics), name, diagnostics }
    },

    /** The open card, produced as `params.to`: run(null, params). */
    getOutput(params = {}) {
      return tool.run(null, params)
    },

    info: { tool: 'convention-card', version: PACKAGE.version, formats: IMPORT_FORMATS, outputs: OUTPUTS, reference: 'reference.txt' },
  }
  return tool
}
