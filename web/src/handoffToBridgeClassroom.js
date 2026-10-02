// "Save to Bridge Classroom" (DECISIONS.md, 20): open Bridge Classroom with
// the card in the URL's fragment. Bridge Classroom asks the user to sign in
// if need be and saves the card under its own session; the standalone editor
// never sees an account.

import { encodeCardForUrl } from '../../js/handoff.js'

// The app, not the site's root: bridge-classroom.com/ is a static landing
// page, and the Vue app (with its #/convention-card route) is served at
// /solo-practice-app/ (Bridge-Classroom's scripts/build-site.sh).
export const BRIDGE_CLASSROOM = 'https://bridge-classroom.com/solo-practice-app/'

/** The URL that hands `card` ({ name, description, card_data }) to Bridge Classroom. */
export async function bridgeClassroomUrl(card, base = BRIDGE_CLASSROOM) {
  const payload = await encodeCardForUrl({
    name: card.name || null,
    description: card.description || null,
    card_data: card.card_data || {},
  })
  return `${base}#/convention-card?import=${payload}`
}
