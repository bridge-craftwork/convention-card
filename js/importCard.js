// Read a card from any format the library knows, telling them apart by
// their content: the editor's own JSON (its export, or bare card_data),
// BBO's and Bridgodex's JSON, BBA's .bbsa text, a PDF this library wrote,
// and the URL hand-off (js/handoff.js). The editor's Import button and the
// standalone page's window.card both read through here, so they agree.
//
// The .bbsa and PDF code is loaded only when a file needs it, so a page that
// imports this module does not pull in pdf-lib.

import { isBboCard, importBboJson } from './bboImport.js'
import { importBridgeodexJson } from './bridgeodexImport.js'
import { decodeCardFromUrl } from './handoff.js'
import { isBundle } from './cardBundle.js'

/** What `importCard` reads, by the name its `from` option takes. */
export const IMPORT_FORMATS = {
  card: "the editor's own JSON: its export ({ schema, name, description, card_data }) or bare card_data",
  bbo: "BBO's ACBL card export (JSON)",
  bridgeodex: "Bridgodex's card export (JSON, with a settings block)",
  bbsa: "BBA's .bbsa convention file (Key = value lines)",
  pdf: 'an ACBL PDF: one this editor exported (the card travels inside it, and boxes changed since are read too), or any filled-in ACBL Classic or New card',
  handoff: 'a hand-off string, v1.<data>, or a URL ending #import=v1.<data>',
}

// Top-level keys only card_data has. Bridgodex's settings share several
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
  if (isBundle(input)) return 'card'
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
  // 'bridgodex' is the site's own spelling; 'bridgeodex' is the format's
  // name here, kept for saved cards and callers.
  const format = (from === 'bridgodex' ? 'bridgeodex' : from) || detectFormat(input)
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
    // The editor's own exports carry the card's id and last change, for
    // merging (cardBundle.js); other formats have neither.
    ...(record.id != null && { id: record.id }),
    ...(record.updatedAt && { updatedAt: record.updatedAt }),
    ...extra,
  })

  switch (format) {
    case 'card': {
      const obj = json()
      if (isBundle(obj)) throw new Error('This is an "Export all" file of several cards: read it with importCards')
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
      const { readCardFromPdf } = await import('./acblPdfImport.js')
      const read = await readCardFromPdf(bytesOf(input))
      if (!read) {
        throw new Error('This PDF has no card inside it, and it is not a filled-in ACBL card.')
      }
      return card(read, { report: read.report })
    }
    case 'handoff': {
      const match = HANDOFF.exec(text().trim())
      if (!match) throw new Error('Not a card hand-off (expected v1.… or a URL ending #import=v1.…)')
      return card(await decodeCardFromUrl(match[1]))
    }
  }
}

/**
 * Read one card or many: an "Export all" file (cardBundle.js) gives every
 * card in it, anything importCard reads gives one. Returns an array of
 * what importCard returns.
 */
export async function importCards(input, options = {}) {
  let obj = null
  if (typeof input === 'string' && input.trim().startsWith('{')) {
    try { obj = JSON.parse(input) } catch { /* not JSON: importCard says what it is */ }
  } else if (input && typeof input === 'object' && !isBytes(input)) {
    obj = input
  }
  if (isBundle(obj)) return Promise.all(obj.cards.map(c => importCard(c, { from: 'card' })))
  return [await importCard(input, options)]
}
