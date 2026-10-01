// Handing a card from one app to another in a URL (DECISIONS.md, 20): the
// standalone editor opens Bridge Classroom with the card in the URL's
// fragment, and Bridge Classroom saves it under its own signed-in session.
// A fragment never reaches a server. The card is compressed (deflate) and
// written as base64url behind a version prefix: `v1.<data>`.

const PREFIX = 'v1.'

function toBase64Url(bytes) {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(text) {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/')
  const s = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
  return Uint8Array.from(s, c => c.charCodeAt(0))
}

async function pipe(bytes, stream) {
  const out = new Blob([bytes]).stream().pipeThrough(stream)
  return new Uint8Array(await new Response(out).arrayBuffer())
}

/** A card record ({ name, description, card_data }) as a URL-safe string. */
export async function encodeCardForUrl({ name = null, description = null, card_data }) {
  const json = JSON.stringify({ name, description, card_data })
  const packed = await pipe(new TextEncoder().encode(json), new CompressionStream('deflate-raw'))
  return PREFIX + toBase64Url(packed)
}

/** The card record a string from encodeCardForUrl holds. Throws on anything else. */
export async function decodeCardFromUrl(text) {
  if (typeof text !== 'string' || !text.startsWith(PREFIX)) {
    throw new Error('Not a convention card hand-off (expected v1.…)')
  }
  const bytes = await pipe(fromBase64Url(text.slice(PREFIX.length)), new DecompressionStream('deflate-raw'))
  const record = JSON.parse(new TextDecoder().decode(bytes))
  if (!record || typeof record.card_data !== 'object') throw new Error('The hand-off holds no card_data')
  return record
}
