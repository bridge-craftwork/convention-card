// The standalone editor's storage adapter (useCardEditor.js describes the
// shape): cards live in this browser's IndexedDB, with no account (DESIGN.md,
// "Accounts and storage: local first"). Nothing leaves the browser unless the
// user exports a file or hands a card to Bridge Classroom.
//
// The starter card ("2/1 Intermediate", Bridge Classroom's system card) is
// read-only, as it is there: Duplicate makes an editable copy.

import { ref } from 'vue'
import STARTER_DATA from './cards/2-1-intermediate.json'

const DB_NAME = 'convention-card'
const STORE = 'cards'
const LOCAL_USER = { id: 'local', role: 'owner', firstName: null }

const STARTER = {
  id: 'starter',
  name: STARTER_DATA.metadata?.name || '2/1 Intermediate',
  description: STARTER_DATA.metadata?.description || null,
  owner_id: null,
  visibility: 'public',
  card_data: STARTER_DATA,
  updated_at: null,
}

let dbPromise = null
function db() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' })
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

async function tx(mode, run) {
  const store = (await db()).transaction(STORE, mode).objectStore(STORE)
  return new Promise((resolve, reject) => {
    const req = run(store)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

const all = () => tx('readonly', s => s.getAll())
const get = id => tx('readonly', s => s.get(id))
// IndexedDB stores structured clones, which a Vue reactive proxy (the
// editor's card_data) is not: store a plain copy.
const put = card => tx('readwrite', s => s.put(JSON.parse(JSON.stringify(card))))
const del = id => tx('readwrite', s => s.delete(id))
const clone = card => JSON.parse(JSON.stringify(card))
const now = () => new Date().toISOString()

export const browserStorage = {
  user: ref(LOCAL_USER),

  async loadDefault() {
    const cards = await all()
    const primary = cards.find(c => c.is_primary) || cards[0]
    return primary ? clone(primary) : clone(STARTER)
  },

  async load(id) {
    if (id === STARTER.id) return clone(STARTER)
    const card = await get(id)
    if (!card) throw new Error('That card is no longer in this browser')
    return clone(card)
  },

  async listLinks() {
    return (await all()).map(c => ({ card_id: c.id, card_name: c.name, is_primary: !!c.is_primary, label: null }))
  },

  async save(card, cardData) {
    const stored = await get(card.id)
    if (!stored) throw new Error('That card is no longer in this browser')
    await put({ ...stored, card_data: cardData, updated_at: now() })
  },

  async overwrite(id, { name, description, cardData }) {
    const stored = await get(id)
    if (!stored) throw new Error('That card is no longer in this browser')
    await put({
      ...stored,
      name: name ?? stored.name,
      description: description ?? stored.description,
      card_data: cardData,
      updated_at: now(),
    })
  },

  /** Make `id` the card that opens first. */
  async setPrimary(id) {
    const cards = await all()
    if (!cards.some(c => c.id === id)) throw new Error('That card is no longer in this browser')
    for (const c of cards) {
      if (c.is_primary !== (c.id === id)) await put({ ...c, is_primary: c.id === id })
    }
  },

  async create({ name, description = null, cardData = {}, visibility = 'private', primary = true }) {
    // `primary`: open this card first from now on (the editor asks for it
    // only for a person's first card; Make primary does it later).
    if (primary) for (const c of await all()) if (c.is_primary) await put({ ...c, is_primary: false })
    const id = crypto.randomUUID()
    await put({
      id, name, description, visibility,
      owner_id: LOCAL_USER.id,
      is_primary: !!primary,
      card_data: cardData,
      created_at: now(),
      updated_at: now(),
    })
    return id
  },

  async remove(id) {
    await del(id)
  },

  canEdit(card) {
    return card.owner_id === LOCAL_USER.id
  },
}
