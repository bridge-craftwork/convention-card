// bridge-craftwork's mark on the PDFs the library makes: the site's wrench
// and its address, in small grey type. On the card page it sits at the
// right end of the NAMES line, where Bridge Winners puts theirs (the ACBL
// templates have no other room); on a notes page, at the foot.

import { rgb } from 'pdf-lib'

// The site's address alone: easier to remember, and the card editor is a
// click from its front page
export const MARK_TEXT = 'bridge-craftwork.com'

const SLATE = rgb(0.278, 0.333, 0.412) // the site's #475569
const TEXT_SIZE = 6.2

/** Width the mark takes at line height `height`, with `font` (Helvetica). */
export function markWidth(font, height) {
  return iconSize(height) + 3 + font.widthOfTextAtSize(MARK_TEXT, TEXT_SIZE)
}

const iconSize = height => Math.min(height - 2, 10)

/**
 * Draw the mark with its left edge at `x`, on a line whose box starts at
 * `y` and is `height` tall: the icon fills the box, the text sits on the
 * box's lower part like a filled-in value.
 */
export function drawMark(page, { x, y, height, font }) {
  const icon = iconSize(height)
  const top = y + (height + icon) / 2
  // favicon.svg (bridge-craftwork-site), a 32-unit box turned 180°: open
  // jaw top right, box end bottom left
  const s = icon / 32
  page.drawSvgPath('M21.1 10.9 10.9 21.1', { x, y: top, scale: s, borderColor: SLATE, borderWidth: 3.6 * s })
  page.drawSvgPath('M27.07 9.8A3.8 3.8 0 1 1 22.2 4.93', { x, y: top, scale: s, borderColor: SLATE, borderWidth: 2.4 * s })
  page.drawCircle({ x: x + 8.5 * s, y: top - 23.5 * s, size: 3.8 * s, borderColor: SLATE, borderWidth: 2.4 * s })
  page.drawText(MARK_TEXT, { x: x + icon + 3, y: y + (height - TEXT_SIZE * 0.7) / 2, size: TEXT_SIZE, font, color: SLATE })
}
