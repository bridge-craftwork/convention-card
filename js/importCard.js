// Read a card from any format the library knows, telling them apart by
// their content: the editor's own JSON (its export, or bare card_data),
// BBO's and bridgeodex's JSON, BBA's .bbsa text, a PDF this library wrote,
// and the URL hand-off (js/handoff.js). The editor's Import button and the
// standalone page's window.card both read through here, so they agree.
//
// The .bbsa and PDF code is loaded only when a file needs it, so a page that
// imports this module does not pull in pdf-lib.

import { isBboCard, importBboJson } from './bboImport.js'
import { importBridgeodexJson } from './bridgeodexImport.js'
import { decodeCardFromUrl } from './handoff.js'

/** What `importCard` reads, by the name its `from` option takes. */
export const IMPORT_FORMATS = {
  card: "the editor's own JSON: its export ({ schema, name, description, card_data }) or bare card_data",
  bbo: "BBO's ACBL card export (JSON)",
  bridgeodex: "bridgeodex's card export (JSON, with a settings block)",
  bbsa: "BBA's .bbsa convention file (Key = value lines)",
  pdf: 'an ACBL PDF this editor exported (the card travels inside it)',
  handoff: 'a hand-off string, v1.<data>, or a URL ending #import=v1.<data>',
}

// Top-level keys only card_data has. Bridgeodex's settings share several
// section names with card_data (carding, doubles, two_level, …), so
// those prove nothing.
const CARD_DATA_ONLY = ['format', 'schema_version', 'metadata', 'notrump', 'major_openings', 'minor_openings', 'slam', 'other_conventions', 'other_agreements', 'leads']

const HANDOFF = /(?:^|#import=)(v1\.[A-Za-z0-9_-]+)$/

function isBytes(input) {
  return input instanceof ArrayBuffer || ArrayBuffer.isView(input)
}

function bytesOf(input) {
  return input instanceof ArrayBuffer ? new Uint8Array(input) : new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
}

function looksLikeCardData(obj) {
  return CARD_DATA_ONLY.some(k => Object.hasOwn(obj, k))
}

/**
 * Which format `input` is in: a key of IMPORT_FORMATS, or null. `input` is
 * a parsed JSON object, text (JSON, .bbsa or a hand-off), or bytes
 * (ArrayBuffer or a typed array: a PDF, or any of the text forms).
 */
export function detectFormat(input) {
  if (isBytes(input)) {
    const b = bytesOf(input)
    if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return 'pdf' // %PDF
    return detectFormat(new TextDecoder().decode(b))
  }
  if (typeof input === 'string') {
    const text = input.trim()
    if (HANDOFF.test(text)) return 'handoff'
    if (text.startsWith('{')) {
      try { return detectFormat(JSON.parse(text)) } catch { return null }
    }
    return /^[^=\n]+=\s*[+-]?\d+\s*$/m.test(text) ? 'bbsa' : null
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  if (input.card_data && typeof input.card_data === 'object') return 'card'
  if (isBboCard(input)) return 'bbo'
  if (input.settings && typeof input.settings === 'object') return 'bridgeodex'
  if (looksLikeCardData(input)) return 'card'
  return null
}

/**
 * Read a card. `input` as for detectFormat; `from` names the format when it
 * should not be guessed; `name` is the name for a format that carries none
 * (a .bbsa file's name, say). Returns `{ format, name, description,
 * card_data }`, plus `report` for a .bbsa file (`{ mapped, passthrough,
 * warnings }`). Throws, with a sentence a person can act on, when the input
 * is not a card.
 */
export async function importCard(input, { from = null, name = null } = {}) {
  const format = from || detectFormat(input)
  if (!format) {
    throw new Error(`Not a card this editor reads. It reads ${Object.values(IMPORT_FORMATS).join('; ')}.`)
  }
  if (!Object.hasOwn(IMPORT_FORMATS, format)) {
    throw new Error(`Unknown format "${format}"; one of ${Object.keys(IMPORT_FORMATS).join(', ')}`)
  }
  const text = () => (isBytes(input) ? new TextDecoder().decode(bytesOf(input)) : String(input))
  const json = () => (typeof input === 'object' && !isBytes(input) ? input : JSON.parse(text()))
  const card = (record, extra = {}) => ({
    format,
    name: record.name || name || null,
    description: record.description || null,
    card_data: record.card_data,
    ...extra,
  })

  switch (format) {
    case 'card': {
      const obj = json()
      if (obj.card_data && typeof obj.card_data === 'object') return card(obj)
      return card({ name: obj.metadata?.name, description: obj.metadata?.description, card_data: obj })
    }
    case 'bbo':
      return card(importBboJson(json()))
    case 'bridgeodex':
      return card(importBridgeodexJson(json()))
    case 'bbsa': {
      const { importBbsa } = await import('./bbsa.js')
      const { card_data, report } = importBbsa(text(), name || undefined)
      return card({ name, description: 'Imported from BBA (.bbsa)', card_data }, { report })
    }
    case 'pdf': {
      if (!isBytes(input)) throw new Error('A PDF is read from its bytes (an ArrayBuffer or Uint8Array)')
      const { extractCardDataFromPdf } = await import('./acblClassicFillPdf.js')
      const record = await extractCardDataFromPdf(bytesOf(input))
      if (!record) {
        throw new Error('This PDF has no card inside it. Only PDFs exported from this editor or Bridge Classroom can be read back.')
      }
      return card(record)
    }
    case 'handoff': {
      const match = HANDOFF.exec(text().trim())
      if (!match) throw new Error('Not a card hand-off (expected v1.… or a URL ending #import=v1.…)')
      return card(await decodeCardFromUrl(match[1]))
    }
  }
}
