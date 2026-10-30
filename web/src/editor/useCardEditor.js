import { ref, computed, watch } from 'vue'
import { alertSummary, alertsFor } from '../../../js/spec.js'
import { upgradeCard, upgradeCardData } from '../../../js/migrate.js'
import { mergeCards, resolveConflicts } from '../../../js/mergeCards.js'
import {
  CONVENTION_CATALOG,
  SECTION_META,
  getCatalogEntries,
  isEntryChecked,
  getLevelForEntry,
  getLevelNumberForEntry,
  setEntryChecked,
  alertPathOf,
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
//   save(card, cardData)                       write a card's card_data. A
//                 shared card (Bridge Classroom #436) saves against the version
//                 it was loaded at, card.version: if a partner saved since,
//                 save throws an error whose `conflict` is the card as it is
//                 now, { version, card_data }, and the editor merges
//   loadVersion(id, version) → card_data   optional: a saved version, the
//                 base of that merge; without it a conflict is only reported
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
//                 A card's role ('owner' | 'editor' | 'viewer', from load) says
//                 more: only an owner deletes it.
//
// Sharing (optional; the editor offers Share only when members is given).
// All for one card, by id; role is 'owner', 'editor' or 'viewer':
//   members(id) → [{ user_id, name, role }]
//   setRole(id, userId, role)              owner only; a card keeps an owner
//   removeMember(id, userId)               owner, or the member themself
//   invitations(id) → [{ token, url, role, expires_at }]   owner only
//   invite(id, role) → { token, url, expires_at }   role 'editor' | 'viewer'
//   revokeInvitation(id, token)
//   printLink(id, template) → { url }      template 'classic' | 'new': a
//                 permanent read-only link to the card's PDF, as it is now
//
// overlays (optional) — extra information beside each convention:
//   covered(skillPath) → boolean       whether practice deals exist for it
//   mastery(user) → { skillPath: tier } the user's lesson mastery
//                                       ('Exploring' | 'Learning' | 'Mastering' | 'Retaining')
//   practice (optional) — deal collections to practise with, for the Solo
//                    practice report (components/PracticeReport.vue):
//     [{ id, name, short, unit?,        'pbs', 'Practice Bidding Scenarios', 'PBS', 'scenarios'
//        load() → { skills: { skillPath: [{ name, href? }] }, version?, url? } }]
//                                       the deals it has for each skill, loaded once
//   bot (optional) — a bidding bot that can play the card, for the same report:
//     name, short?                      'Rusty', 'R'
//     info() → { version, rules?, statusUrl? }   which bot this is
//     coverage(card_data) → { read: [path], ignored: [path], other: [path] }
//                                       the card's bidding settings its rules
//                                       read and ignore (Rusty's WASM `coverage`)
//     skills() → [skillPath]            optional: the conventions it implements
//                                       (Rusty's `conventions` modules), so the
//                                       report says what it plays, not only reads

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
  // A save a partner's save got in before: { conflicts, card, version } for
  // the conflict view, until it is settled (finishMerge) or dropped
  const pendingMerge = ref(null)

  const activeSection = ref('notrump')
  const visibleLevels = ref(new Set(['basic']))
  // Whose alerting rules the badges show (spec/alerts.toml): ACBL by
  // default, since the cards the editor prints are the ACBL's.
  const regulator = ref('acbl')
  const showCoverage = ref(false)
  const showProf = ref(false)
  // What the last import found or did, for the card it opens: set by the
  // editor's Import or the table of cards', shown above the card.
  const importNotes = ref([])
  // The card those notes are about (the one the import opened).
  const importNotesFor = ref(null)

  const user = () => storage.user?.value || null

  // ─── Card loading ─────────────────────────────────────────────
  function cloneCardData(card) {
    if (!card?.card_data) return {}
    try { return JSON.parse(JSON.stringify(card.card_data)) } catch { return {} }
  }

  // A card saved in an older schema is shown, and saved again, in the
  // current one (js/migrate.js). The upgrade alone is not an unsaved edit.
  function setCurrentCard(card) {
    card = upgradeCard(card)
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

  // A shared card's editors and viewers don't delete it; its owners do
  const canDelete = computed(() => canEdit.value && !['editor', 'viewer'].includes(currentCard.value?.role))
  const canShare = typeof storage.members === 'function'

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
        alert: alertSummary(alertPathOf(entry), regulator.value),
        alertCalls: alertsFor(alertPathOf(entry), regulator.value),
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

  // Save `cardData` as the next version after `version`. A partner's save
  // since then is merged in: by itself where the two touched different
  // fields, else kept in pendingMerge for a person to settle.
  async function saveAgainst(card, version, cardData) {
    try {
      await storage.save({ ...card, version }, cardData)
    } catch (err) {
      const now = err?.conflict
      if (!now || typeof storage.loadVersion !== 'function') throw err
      const base = await storage.loadVersion(card.id, version)
      const merged = mergeCards(base, cardData, now.card_data)
      if (merged.conflicts.length) {
        pendingMerge.value = { ...merged, version: now.version }
        return 'conflict'
      }
      return saveAgainst(card, now.version, merged.card)
    }
    // Reload so timestamps + persisted state match (also resets to
    // view mode via setCurrentCard).
    setCurrentCard(await storage.load(card.id))
    lastSavedAt.value = new Date().toISOString()
    return true
  }

  /** Save the edits. True when saved; 'conflict' when a partner's edits need settling (pendingMerge). */
  async function saveCard() {
    const card = currentCard.value
    if (!card || !user() || !canEdit.value) return false
    saving.value = true
    saveError.value = null
    try {
      return await saveAgainst(card, card.version, editedCardData.value)
    } catch (err) {
      console.error('Save card failed:', err)
      saveError.value = err.message || 'Failed to save card'
      return false
    } finally {
      saving.value = false
    }
  }

  /**
   * Settle pendingMerge: `choices` is { path: 'mine' | 'theirs' } (mine
   * where not given), and the result is saved. Null drops the merge and
   * keeps the edits unsaved.
   */
  async function finishMerge(choices) {
    const merge = pendingMerge.value
    pendingMerge.value = null
    if (!merge || !choices) return false
    const cardData = resolveConflicts(merge.card, merge.conflicts, c => choices[c.path] || 'mine')
    editedCardData.value = cardData
    saving.value = true
    saveError.value = null
    try {
      return await saveAgainst(currentCard.value, merge.version, cardData)
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
    await storage.overwrite(cardId, { name, description, cardData: upgradeCardData(cardData) })
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
    const cardId = await storage.create({ name: name || 'My convention card', description, cardData: upgradeCardData(cardData), visibility, primary })
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
    if (!card || !user() || !canDelete.value) return false
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
    importNotes,
    importNotesFor,
    pendingMerge,
    // derived
    canEdit,
    canDelete,
    canShare,
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
    finishMerge,
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
