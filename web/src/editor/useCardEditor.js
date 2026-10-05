import { ref, computed, watch } from 'vue'
import { alertSummary, alertsFor } from '../../../js/spec.js'
import {
  CONVENTION_CATALOG,
  SECTION_META,
  getCatalogEntries,
  isEntryChecked,
  getLevelForEntry,
  getLevelNumberForEntry,
  setEntryChecked,
  writePath
} from './conventionCatalog.js'

// The editor's state: the card, its in-flight edits, the view filters and
// the overlays. Everything outside the card goes through two adapters
// (DESIGN.md, "The editor"), so the same editor runs inside Bridge
// Classroom and standalone:
//
// storage — where cards live, and who may edit them:
//   user          a ref: the signed-in user ({ id, role, firstName }) or null
//   loadDefault() the card to open first (the user's primary, else a system card)
//   load(id)      one card: { id, name, description, owner_id, visibility, card_data, updated_at }
//   listLinks()   the user's cards: [{ card_id, card_name, is_primary, label,
//                 role?, owner_name?, shared? }]. For shared cards (Bridge
//                 Classroom #436): role is 'owner', 'editor' or 'viewer';
//                 owner_name names the owner of a card shared with you; shared
//                 says an owned card is shared. The table of cards shows them
//                 as Bridgodex does ("Editor · by …", "Read only · by …",
//                 "Shared")
//   save(card, cardData)                       write a card's card_data
//   overwrite(id, { name, description, cardData })   (also how a card is renamed)
//   create({ name, description, cardData, visibility, primary }) → the new card's id
//                 primary: whether it becomes the card that opens first
//   setPrimary(id)  optional: make a card the one that opens first (the
//                   editor offers "Make primary" only when this is given)
//   remove(id)
//   unlink(id)      optional: take a card off the user's list without deleting
//                   it (a built-in or public card, or one shared with them);
//                   the editor offers "Remove from my list" only when given
//   canEdit(card, user) → boolean
//
// overlays (optional) — extra information beside each convention:
//   covered(skillPath) → boolean       whether practice deals exist for it
//   mastery(user) → { skillPath: tier } the user's lesson mastery
//                                       ('Exploring' | 'Learning' | 'Mastering' | 'Retaining')

const NO_OVERLAYS = { covered: () => false, mastery: async () => ({}) }

// One state per storage adapter, so a host that unmounts and remounts the
// editor (a lobby tab) finds the card it left.
const STATES = new WeakMap()

/** The editor state for `storage` (and `overlays`), shared by every editor using that storage. */
export function useCardEditor(storage, overlays = NO_OVERLAYS) {
  if (!STATES.has(storage)) STATES.set(storage, createState(storage, overlays || NO_OVERLAYS))
  return STATES.get(storage)
}

// ─── Tier → prototype "prof" status ─────────────────────────────
export function tierToProf(tier) {
  if (tier === 'Mastering' || tier === 'Retaining') return 'good'
  if (tier === 'Learning') return 'practice'
  if (tier === 'Exploring') return 'learn'
  return 'none'
}

function createState(storage, overlays) {
  const currentCard = ref(null)        // { id, name, description, owner_id, card_data, ... }
  const editedCardData = ref(null)     // Mutable clone of currentCard.card_data
  const cardLoading = ref(false)
  const cardError = ref(null)
  const saving = ref(false)
  const saveError = ref(null)
  const lastSavedAt = ref(null)
  const viewMode = ref(true)           // Cards open in view mode; click Edit to modify
  const lessonMasteryMap = ref({})     // { skillPath → tier }
  const userCardLinks = ref([])        // [{ card_id, card_name, is_primary, label, ... }]

  const activeSection = ref('notrump')
  const visibleLevels = ref(new Set(['basic']))
  // Whose alerting rules the badges show (spec/alerts.toml): ACBL by
  // default, since the cards the editor prints are the ACBL's.
  const regulator = ref('acbl')
  const showCoverage = ref(false)
  const showProf = ref(false)

  const user = () => storage.user?.value || null

  // ─── Card loading ─────────────────────────────────────────────
  function cloneCardData(card) {
    if (!card?.card_data) return {}
    try { return JSON.parse(JSON.stringify(card.card_data)) } catch { return {} }
  }

  function setCurrentCard(card) {
    currentCard.value = card
    editedCardData.value = cloneCardData(card)
    activeSection.value = pickInitialSection(card)
    saveError.value = null
    viewMode.value = true
  }

  async function loadUserCardLinks() {
    try {
      userCardLinks.value = user()?.id ? await storage.listLinks() : []
    } catch {
      userCardLinks.value = []
    }
  }

  async function loadCardForCurrentUser() {
    cardLoading.value = true
    cardError.value = null
    try {
      await loadUserCardLinks()
      setCurrentCard(await storage.loadDefault())
    } catch (err) {
      console.error('Convention card load failed:', err)
      cardError.value = err.message || 'Failed to load convention card'
    } finally {
      cardLoading.value = false
    }
  }

  async function switchCard(cardId) {
    cardLoading.value = true
    cardError.value = null
    try {
      setCurrentCard(await storage.load(cardId))
    } catch (err) {
      console.error('Switch card failed:', err)
      cardError.value = err.message || 'Failed to load card'
    } finally {
      cardLoading.value = false
    }
  }

  function pickInitialSection(_card) {
    // Prefer the first section with catalogued conventions — General often
    // has only structured fields and would otherwise show a misleading
    // "no conventions yet" panel.
    for (const sec of SECTION_META) {
      if (getCatalogEntries(sec.id).length > 0) return sec.id
    }
    return SECTION_META[0]?.id || 'general'
  }

  async function loadMasteryForCurrentUser() {
    const u = user()
    if (!u?.id) {
      lessonMasteryMap.value = {}
      return
    }
    try {
      lessonMasteryMap.value = (await overlays.mastery(u)) || {}
    } catch (err) {
      console.error('Lesson mastery fetch failed:', err)
      lessonMasteryMap.value = {}
    }
  }

  // ─── Permissions ──────────────────────────────────────────────
  const canEdit = computed(() => {
    const card = currentCard.value
    return !!card && storage.canEdit(card, user())
  })

  // Fields and toggles only accept input when the user has edit
  // permissions *and* has explicitly entered Edit mode (clicked the
  // "Edit" button). New / Duplicate / Import flows opt-in by clearing
  // viewMode before returning.
  const isEditable = computed(() => canEdit.value && !viewMode.value)

  const isDirty = computed(() => {
    if (!currentCard.value || !editedCardData.value) return false
    try {
      return JSON.stringify(editedCardData.value) !== JSON.stringify(currentCard.value.card_data)
    } catch {
      return false
    }
  })

  // ─── Coverage / per-row status ────────────────────────────────
  const coverageByEntry = computed(() => {
    const map = new Map()
    // Coverage reflects in-flight edits so checking a box updates the
    // section counts and overlay state immediately.
    const cardData = editedCardData.value || currentCard.value?.card_data
    for (const entry of CONVENTION_CATALOG) {
      const skill = entry.skillPath
      const tier = skill ? lessonMasteryMap.value[skill] : null
      map.set(entry.id, {
        covered: skill ? !!overlays.covered(skill) : false,
        tier: tier || null,
        profStatus: tierToProf(tier),
        checked: cardData ? isEntryChecked(entry, cardData) : false,
        level: getLevelForEntry(entry),
        alert: alertSummary(entry.cardPath, regulator.value),
        alertCalls: alertsFor(entry.cardPath, regulator.value),
        levelNumber: getLevelNumberForEntry(entry) ?? null
      })
    }
    return map
  })

  const sectionCounts = computed(() => {
    const out = {}
    for (const sec of SECTION_META) {
      const entries = getCatalogEntries(sec.id)
      const selected = entries.filter(e => coverageByEntry.value.get(e.id)?.checked).length
      out[sec.id] = { selected, total: entries.length }
    }
    return out
  })

  const totalSelected = computed(() => {
    let n = 0
    for (const { selected } of Object.values(sectionCounts.value)) n += selected
    return n
  })

  const summary = computed(() => {
    let mastered = 0, needsLearning = 0, untested = 0, unavailable = 0
    let total = 0
    for (const entry of CONVENTION_CATALOG) {
      const c = coverageByEntry.value.get(entry.id)
      if (!c?.checked) continue        // only count conventions the user actually plays
      total++
      if (!c.covered) unavailable++
      else if (c.profStatus === 'good') mastered++
      else if (c.profStatus === 'none') untested++
      else needsLearning++
    }
    return { mastered, needsLearning, untested, unavailable, total }
  })

  // ─── Mutations + persistence ─────────────────────────────────
  function toggleEntry(entryId, checked) {
    if (!isEditable.value || !editedCardData.value) return
    const entry = CONVENTION_CATALOG.find(e => e.id === entryId)
    if (!entry) return
    setEntryChecked(entry, editedCardData.value, checked)
    // Trigger reactivity (in-place mutation isn't always seen by Vue
    // when deep paths change). Re-assign top-level reference.
    editedCardData.value = { ...editedCardData.value }
  }

  function writeField(cardPath, value) {
    if (!isEditable.value || !editedCardData.value || !cardPath) return
    writePath(editedCardData.value, cardPath, value)
    // Trigger reactivity for the deep-path write.
    editedCardData.value = { ...editedCardData.value }
  }

  function getNote(key) {
    if (!key) return ''
    return editedCardData.value?.notes?.[key] || ''
  }

  function setNote(key, value) {
    if (!isEditable.value || !editedCardData.value || !key) return
    const notes = { ...(editedCardData.value.notes || {}) }
    if (value && value.trim().length) {
      notes[key] = value
    } else {
      delete notes[key]
    }
    editedCardData.value = { ...editedCardData.value, notes }
  }

  function sectionHasNotes(sectionId) {
    const section = CONVENTION_CATALOG.length && SECTION_META.find(s => s.id === sectionId)
    if (!section?.notes?.length) return false
    return section.notes.some(n => !!getNote(n.key)?.trim())
  }

  async function saveCard() {
    const card = currentCard.value
    if (!card || !user() || !canEdit.value) return false
    saving.value = true
    saveError.value = null
    try {
      await storage.save(card, editedCardData.value)
      // Reload so timestamps + persisted state match (also resets to
      // view mode via setCurrentCard).
      setCurrentCard(await storage.load(card.id))
      lastSavedAt.value = new Date().toISOString()
      return true
    } catch (err) {
      console.error('Save card failed:', err)
      saveError.value = err.message || 'Failed to save card'
      return false
    } finally {
      saving.value = false
    }
  }

  function enterEditMode() {
    if (canEdit.value) viewMode.value = false
  }

  function revertEdits() {
    editedCardData.value = cloneCardData(currentCard.value)
    saveError.value = null
    viewMode.value = true
  }

  /**
   * Overwrite the card_data + name/description of an existing card
   * (typically one the current user already owns). Used by the import
   * flow when the user chooses to overwrite a same-named card instead
   * of creating a new one. After overwrite, the updated card is loaded
   * and view mode is restored.
   */
  async function overwriteCard(cardId, { name, description, cardData }) {
    if (!user()) throw new Error('Must be signed in')
    await storage.overwrite(cardId, { name, description, cardData })
    await loadUserCardLinks()
    await switchCard(cardId)
  }

  /** Rename the open card. Unsaved edits stay unsaved, and edit mode stays on. */
  async function renameCard(name) {
    const card = currentCard.value
    const newName = String(name ?? '').trim()
    if (!card || !newName || newName === card.name) return
    if (!user()) throw new Error('Must be signed in')
    const edits = isDirty.value ? editedCardData.value : null
    const editing = !viewMode.value
    // The card's own metadata.name follows, where the card keeps one.
    const cardData = JSON.parse(JSON.stringify(card.card_data || {}))
    if (cardData.metadata?.name != null) cardData.metadata.name = newName
    await storage.overwrite(card.id, { name: newName, description: card.description, cardData })
    await loadUserCardLinks()
    await switchCard(card.id)
    if (edits) {
      if (edits.metadata?.name != null) edits.metadata.name = newName
      editedCardData.value = edits
    }
    if (editing) viewMode.value = false
  }

  async function createCard({ name, description = null, cardData = {}, visibility = 'private' } = {}) {
    if (!user()) throw new Error('Must be signed in to create a card')
    // A new card opens first only when it is the person's first card; after
    // that, which card is primary is their choice (makePrimary).
    const primary = !userCardLinks.value.length
    const cardId = await storage.create({ name: name || 'My convention card', description, cardData, visibility, primary })
    await loadUserCardLinks()
    await switchCard(cardId)
    return cardId
  }

  const canSetPrimary = typeof storage.setPrimary === 'function'

  /** Make the open card the one that opens first. */
  async function makePrimary() {
    const card = currentCard.value
    if (!card || !canSetPrimary) return
    await storage.setPrimary(card.id)
    await loadUserCardLinks()
  }

  const canUnlink = typeof storage.unlink === 'function'

  /** Take the open card off the user's list; the card itself stays. */
  async function unlinkCurrentCard() {
    const card = currentCard.value
    if (!card || !user() || !canUnlink) return false
    try {
      await storage.unlink(card.id)
    } catch (err) {
      saveError.value = err.message || 'Remove failed'
      return false
    }
    await loadCardForCurrentUser()
    return true
  }

  async function duplicateCurrentCard() {
    const card = currentCard.value
    if (!card) return null
    const base = editedCardData.value || card.card_data || {}
    return createCard({
      name: `Copy of ${card.name}`,
      description: card.description || null,
      cardData: JSON.parse(JSON.stringify(base)),
      visibility: 'private'
    })
  }

  async function deleteCurrentCard() {
    const card = currentCard.value
    if (!card || !user() || !canEdit.value) return false
    try {
      await storage.remove(card.id)
    } catch (err) {
      saveError.value = err.message || 'Delete failed'
      return false
    }
    // Reload — the default falls back to the system card (or first remaining link).
    await loadCardForCurrentUser()
    return true
  }

  // ─── Refresh mastery when the user changes ────────────────────
  if (storage.user) {
    watch(() => storage.user.value?.id, (uid, prev) => {
      if (uid === prev) return
      if (uid) loadMasteryForCurrentUser()
      else lessonMasteryMap.value = {}
    })
  }

  return {
    // state
    currentCard,
    editedCardData,
    userCardLinks,
    cardLoading,
    cardError,
    saving,
    saveError,
    lastSavedAt,
    viewMode,
    lessonMasteryMap,
    activeSection,
    visibleLevels,
    regulator,
    showCoverage,
    showProf,
    // derived
    canEdit,
    isEditable,
    isDirty,
    coverageByEntry,
    sectionCounts,
    totalSelected,
    summary,
    // methods
    loadCardForCurrentUser,
    loadMasteryForCurrentUser,
    loadUserCardLinks,
    switchCard,
    toggleEntry,
    writeField,
    getNote,
    setNote,
    sectionHasNotes,
    saveCard,
    enterEditMode,
    revertEdits,
    overwriteCard,
    renameCard,
    canSetPrimary,
    makePrimary,
    createCard,
    duplicateCurrentCard,
    deleteCurrentCard,
    canUnlink,
    unlinkCurrentCard,
    // helpers re-exported for convenience
    tierToProf
  }
}
