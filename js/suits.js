// Suit shorthand in text a person typed. Copied from Bridge-Classroom's
// src/utils/cardFormatting.js (2026-09-30), which Bridge Classroom keeps
// for its own use (MIGRATION.md: "copied, not moved").

const SUIT_CHAR = { S: '♠', H: '♥', D: '♦', C: '♣' }

/**
 * Normalize user-typed suit shorthand to actual suit characters.
 * Supported inputs:
 *   - "!S" / "!H" / "!D" / "!C" (case-insensitive) → ♠♥♦♣
 *   - Digit + suit letter at a word boundary ("2C", "3D", "1c")
 *     → digit + suit char ("2♣", "3♦", "1♣"). "2NT" is left alone
 *     because N is not in the suit-letter set.
 *   - Standalone uppercase S / H / D / C surrounded by word boundaries
 *     (so "S" or "S, H" converts, but "Spades" or "ASH" do not).
 *
 * Always safe to call on already-normalized text — it's idempotent.
 */
export function normalizeSuitShorthand(text) {
  if (!text) return text
  return String(text)
    .replace(/!\s*([SHDC])/gi, (_, l) => SUIT_CHAR[l.toUpperCase()])
    .replace(/([1-7])([SHDC])\b/gi, (_, n, l) => n + SUIT_CHAR[l.toUpperCase()])
    .replace(/\bS\b/g, '♠')
    .replace(/\bH\b/g, '♥')
    .replace(/\bD\b/g, '♦')
    .replace(/\bC\b/g, '♣')
}

const STRAIN = { C: '♣', D: '♦', H: '♥', S: '♠', N: 'NT', NT: 'NT', '♣': '♣', '♦': '♦', '♥': '♥', '♠': '♠', '♢': '♦', '♡': '♥' }

/**
 * `text` as a bid, written the card's way ("4♥", "3NT"), or null when it is
 * not one bid: "4♥", "4h", "4H", "4 ♥", "!4H" and "3nt" are all bids; "4♥
 * unless vulnerable" is not. For fields the spec marks `bid` (negative
 * doubles through 4♥).
 */
export function bidOf(text) {
  if (typeof text !== 'string') return null
  const m = /^([1-7])(NT|[CDHSN♣♦♥♠♢♡])$/iu.exec(text.replace(/[\s!]/g, ''))
  return m ? m[1] + STRAIN[m[2].toUpperCase()] : null
}
