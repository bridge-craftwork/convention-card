// A card is stored in card schema 3 (conventions keyed by ID, and settings),
// wherever the editor writes one: its host's storage here, a PDF's embedded
// card and the hand-off link in the library. Inside, the editor still works
// in schema 2's paths (js/migrate.js, upgradeCardData), so the storage
// adapter is wrapped: what it is given to keep is schema 3, and what it
// hands back for a merge is the working form.

import { upgradeCardData } from '../../../js/migrate.js'
import { toSchema3 } from '../../../js/schema3.js'

/** `cardData`, in any schema, as it is stored. */
export const toStored = cardData => toSchema3(upgradeCardData(cardData || {}))

const WRAPPED = new WeakMap()

/** `storage` (a host's adapter, useCardEditor.js), keeping cards in schema 3. */
export function schema3Storage(storage) {
  if (!storage || typeof storage !== 'object') return storage
  if (WRAPPED.has(storage)) return WRAPPED.get(storage)
  const stored = fields => (fields && 'cardData' in fields ? { ...fields, cardData: toStored(fields.cardData) } : fields)
  const wrapped = Object.create(storage, {
    save: {
      value: async (card, cardData, ...rest) => {
        try {
          return await storage.save(card, toStored(cardData), ...rest)
        } catch (err) {
          // A partner's save since: their card, in the form the merge works in.
          if (err?.conflict?.card_data) err.conflict = { ...err.conflict, card_data: upgradeCardData(err.conflict.card_data) }
          throw err
        }
      },
    },
    overwrite: { value: (cardId, fields, ...rest) => storage.overwrite(cardId, stored(fields), ...rest) },
    create: { value: (fields, ...rest) => storage.create(stored(fields), ...rest) },
  })
  if (typeof storage.loadVersion === 'function') {
    Object.defineProperty(wrapped, 'loadVersion', {
      value: async (...args) => {
        const data = await storage.loadVersion(...args)
        return data && typeof data === 'object' ? upgradeCardData(data) : data
      },
    })
  }
  WRAPPED.set(storage, wrapped)
  return wrapped
}
