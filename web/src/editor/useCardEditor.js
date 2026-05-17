import { ref, computed, watch } from 'vue'
import { API_URL } from '@/utils/apiUrl.js'
import { useUserStore } from './useUserStore.js'
import { useBoardStatus } from './useBoardStatus.js'
import {
  CONVENTION_CATALOG,
  SECTION_META,
  STRUCTURED_FIELDS,
  getCatalogEntries,
  isEntryChecked,
  getLevelForEntry,
  setEntryChecked,
  writePath
} from '../utils/conventionCatalog.js'
import { getTaxonomyEntry, getSubfolderForSkill } from '../utils/bakerBridgeTaxonomy.js'

const API_KEY = import.meta.env.VITE_API_KEY || ''

// ─── Singleton state ────────────────────────────────────────────
const currentCard = ref(null)        // { id, name, description, owner_id, card_data, ... }
const editedCardData = ref(null)     // Mutable clone of currentCard.card_data
const cardLoading = ref(false)
const cardError = ref(null)
const saving = ref(false)
const saveError = ref(null)
const lastSavedAt = ref(null)
const viewMode = ref(true)           // Cards open in view mode; click Edit to modify
const lessonMasteryMap = ref({})     // { subfolder → tier }
const userCardLinks = ref([])        // [{ link_id, card_id, card_name, is_primary, label, linked_at }]

const activeSection = ref('notrump')
const visibleLevels = ref(new Set(['basic']))
const showCoverage = ref(false)
const showProf = ref(false)

// ─── Tier → prototype "prof" status ─────────────────────────────
function tierToProf(tier) {
  if (tier === 'Mastering' || tier === 'Retaining') return 'good'
  if (tier === 'Learning') return 'practice'
  if (tier === 'Exploring') return 'learn'
  return 'none'
}

// ─── Card loading ───────────────────────────────────────────────
async function fetchPublicSystemCard() {
  const res = await fetch(`${API_URL}/cards?visibility=public`, {
    headers: { 'x-api-key': API_KEY }
  })
  if (!res.ok) throw new Error(`Failed to list public cards: ${res.status}`)
  const data = await res.json()
  const list = data.cards || data || []
  const card = list.find(c => c.owner_id === null) || list[0]
  if (!card) throw new Error('No public convention card available')
  return fetchCardById(card.id)
}

async function fetchCardById(cardId) {
  const userStore = useUserStore()
  const viewerId = userStore.currentUser.value?.id
  const url = viewerId
    ? `${API_URL}/cards/${encodeURIComponent(cardId)}?viewer_id=${encodeURIComponent(viewerId)}`
    : `${API_URL}/cards/${encodeURIComponent(cardId)}`
  const res = await fetch(url, { headers: { 'x-api-key': API_KEY } })
  if (!res.ok) throw new Error(`Failed to load card ${cardId}: ${res.status}`)
  const data = await res.json()
  const card = data.card || data
  if (typeof card.card_data === 'string') {
    try { card.card_data = JSON.parse(card.card_data) } catch { /* leave as-is */ }
  }
  return card
}

async function fetchUsersPrimaryCard(userId) {
  const res = await fetch(`${API_URL}/users/${encodeURIComponent(userId)}/cards`, {
    headers: { 'x-api-key': API_KEY }
  })
  if (!res.ok) return null
  const data = await res.json()
  const list = data.cards || data || []
  const primary = list.find(c => c.is_primary) || list[0]
  return primary ? fetchCardById(primary.card_id || primary.id) : null
}

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

async function loadCardForCurrentUser() {
  cardLoading.value = true
  cardError.value = null
  try {
    const userStore = useUserStore()
    const user = userStore.currentUser.value
    let card = null
    if (user?.id) {
      try {
        await loadUserCardLinks(user.id)
        card = await fetchUsersPrimaryCard(user.id)
      } catch { /* fall through */ }
    }
    if (!card) {
      card = await fetchPublicSystemCard()
    }
    setCurrentCard(card)
  } catch (err) {
    console.error('Convention card load failed:', err)
    cardError.value = err.message || 'Failed to load convention card'
  } finally {
    cardLoading.value = false
  }
}

async function loadUserCardLinks(userId) {
  const res = await fetch(`${API_URL}/users/${encodeURIComponent(userId)}/cards`, {
    headers: { 'x-api-key': API_KEY }
  })
  if (!res.ok) {
    userCardLinks.value = []
    return
  }
  const data = await res.json()
  userCardLinks.value = data.cards || data || []
}

async function switchCard(cardId) {
  cardLoading.value = true
  cardError.value = null
  try {
    const card = await fetchCardById(cardId)
    setCurrentCard(card)
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
  const userStore = useUserStore()
  const user = userStore.currentUser.value
  if (!user?.id) {
    lessonMasteryMap.value = {}
    return
  }
  try {
    const boardStatus = useBoardStatus()
    lessonMasteryMap.value = await boardStatus.fetchLessonMastery(user.id)
  } catch (err) {
    console.error('Lesson mastery fetch failed:', err)
    lessonMasteryMap.value = {}
  }
}

// ─── Permissions ────────────────────────────────────────────────
const canEdit = computed(() => {
  const userStore = useUserStore()
  const user = userStore.currentUser.value
  const card = currentCard.value
  if (!user || !card) return false
  if (user.role === 'admin') return true
  // Owner of a private card may edit; public cards locked to admins
  return card.visibility !== 'public' && card.owner_id === user.id
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

// ─── Coverage / per-row status ──────────────────────────────────
const coverageByEntry = computed(() => {
  const map = new Map()
  // Coverage reflects in-flight edits so checking a box updates the
  // section counts and overlay state immediately.
  const cardData = editedCardData.value || currentCard.value?.card_data
  for (const entry of CONVENTION_CATALOG) {
    const skill = entry.skillPath
    const taxonomy = skill ? getTaxonomyEntry(skill) : null
    const subfolder = skill ? getSubfolderForSkill(skill) : null
    const tier = subfolder ? lessonMasteryMap.value[subfolder] : null
    map.set(entry.id, {
      covered: !!taxonomy,
      tier: tier || null,
      profStatus: tierToProf(tier),
      checked: cardData ? isEntryChecked(entry, cardData) : false,
      level: getLevelForEntry(entry)
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

// ─── Mutations + persistence ───────────────────────────────────
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
  const userStore = useUserStore()
  const user = userStore.currentUser.value
  if (!card || !user || !canEdit.value) return false
  saving.value = true
  saveError.value = null
  try {
    const res = await fetch(`${API_URL}/cards/${encodeURIComponent(card.id)}`, {
      method: 'PUT',
      headers: { 'x-api-key': API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        acting_user_id: user.id,
        card_data: editedCardData.value
      })
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(text || `Save failed (${res.status})`)
    }
    // Reload so timestamps + persisted state match (also resets to
    // view mode via setCurrentCard).
    const fresh = await fetchCardById(card.id)
    setCurrentCard(fresh)
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
  const userStore = useUserStore()
  const user = userStore.currentUser.value
  if (!user) throw new Error('Must be signed in')
  const res = await fetch(`${API_URL}/cards/${encodeURIComponent(cardId)}`, {
    method: 'PUT',
    headers: { 'x-api-key': API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      acting_user_id: user.id,
      name: name ?? undefined,
      description: description ?? undefined,
      card_data: cardData
    })
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `Overwrite failed (${res.status})`)
  }
  await loadUserCardLinks(user.id)
  await switchCard(cardId)
}

async function createCard({ name, description = null, cardData = {}, visibility = 'private' } = {}) {
  const userStore = useUserStore()
  const user = userStore.currentUser.value
  if (!user) throw new Error('Must be signed in to create a card')
  const res = await fetch(`${API_URL}/cards`, {
    method: 'POST',
    headers: { 'x-api-key': API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      acting_user_id: user.id,
      name: name || 'My convention card',
      description,
      card_data: cardData,
      visibility
    })
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `Create failed (${res.status})`)
  }
  const { card_id } = await res.json()
  // Link as primary, then switch to it
  await fetch(`${API_URL}/users/${encodeURIComponent(user.id)}/cards`, {
    method: 'POST',
    headers: { 'x-api-key': API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      card_id,
      is_primary: true,
      acting_user_id: user.id
    })
  })
  await loadUserCardLinks(user.id)
  await switchCard(card_id)
  return card_id
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
  const userStore = useUserStore()
  const user = userStore.currentUser.value
  if (!card || !user || !canEdit.value) return false
  const url = `${API_URL}/cards/${encodeURIComponent(card.id)}?acting_user_id=${encodeURIComponent(user.id)}`
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { 'x-api-key': API_KEY }
  })
  if (!res.ok) {
    const text = await res.text()
    saveError.value = text || `Delete failed (${res.status})`
    return false
  }
  // Reload — primary falls back to system card (or first remaining link).
  await loadUserCardLinks(user.id)
  await loadCardForCurrentUser()
  return true
}

// ─── Public API ─────────────────────────────────────────────────
export function useConventionCard() {
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
    createCard,
    duplicateCurrentCard,
    deleteCurrentCard,
    // helpers re-exported for convenience
    tierToProf
  }
}

// ─── Auto-refresh mastery when user changes ─────────────────────
const userStore = useUserStore()
watch(() => userStore.currentUser.value?.id, (uid, prev) => {
  if (uid === prev) return
  if (uid) loadMasteryForCurrentUser()
  else lessonMasteryMap.value = {}
})
