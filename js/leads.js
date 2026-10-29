// A lead choice (`leads.vs_suits.honors.lead_choice_akx`) is the card led
// from a holding, by its place in it (1 the top card), or a list of them
// when a partnership leads either (the A or the K from AKx: [1, 2]; the
// field's `many` in spec/fields.toml).

/** The positions a lead choice holds, lowest first: `2` is [2], `[2, 1]` is [1, 2], unset is []. */
export function ledCards(value) {
  const all = [value].flat().map(Number).filter(n => Number.isInteger(n) && n >= 1)
  return [...new Set(all)].sort((a, b) => a - b)
}

/** A lead choice holding `positions`: one is a number, several a list, none null. */
export function ledValue(positions) {
  const cards = ledCards(positions)
  return cards.length === 0 ? null : cards.length === 1 ? cards[0] : cards
}

/** Whether two lead choices name the same cards (`2` and `[2]` do). */
export function sameLead(a, b) {
  return ledCards(a).join() === ledCards(b).join()
}
