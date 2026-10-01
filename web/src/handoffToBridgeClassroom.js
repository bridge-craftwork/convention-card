// "Save to Bridge Classroom" (DECISIONS.md, 20): open Bridge Classroom with
// the card in the URL's fragment. Bridge Classroom asks the user to sign in
// if need be and saves the card under its own session; the standalone editor
// never sees an account.

import { encodeCardForUrl } from '../../js/handoff.js'

export const BRIDGE_CLASSROOM = 'https://bridge-classroom.com/'

/** The URL that hands `card` ({ name, description, card_data }) to Bridge Classroom. */
export async function bridgeClassroomUrl(card, base = BRIDGE_CLASSROOM) {
  const payload = await encodeCardForUrl({
    name: card.name || null,
    description: card.description || null,
    card_data: card.card_data || {},
  })
  return `${base}#/convention-card?import=${payload}`
}
