// Suit symbols in the editor's text. colorizeSuits is copied from
// Bridge-Classroom's src/utils/cardFormatting.js (2026-10-01); the
// shorthand normalizer is the library's.

export { normalizeSuitShorthand } from '../../../js/suits.js'

/** Wrap each suit symbol in a span the editor's CSS colours. */
export function colorizeSuits(text) {
  if (!text) return ''
  return text
    .replace(/♠/g, '<span class="suit-black">♠</span>')
    .replace(/♣/g, '<span class="suit-black">♣</span>')
    .replace(/♥/g, '<span class="suit-red">♥</span>')
    .replace(/♦/g, '<span class="suit-red">♦</span>')
}
