<template>
  <div class="convention-card" :class="{ embedded }">
    <!-- Standalone-page header. Hidden inside the lobby tab. -->
    <header v-if="!embedded" class="page-header">
      <h1>Convention card</h1>
    </header>

    <!-- Title row + actions -->
    <div class="card-header">
      <div class="card-title">
        <div class="title-main">Convention card</div>
        <div class="title-sub">
          <template v-if="cardLoading">Loading…</template>
          <template v-else-if="cardError">{{ cardError }}</template>
          <template v-else-if="currentCard">
            <select
              v-if="hasMultipleCards"
              class="card-picker"
              :value="currentCard.id"
              @change="onSwitchCard($event)"
            >
              <option v-for="link in userCardLinks" :key="link.card_id" :value="link.card_id">
                {{ link.card_name }}{{ link.is_primary ? ' · primary' : '' }}
              </option>
            </select>
            <span v-else>{{ subtitle }}</span>
            <span v-if="!canEdit" class="read-only-pill">read-only</span>
            <span v-else-if="viewMode" class="view-pill">view</span>
            <span v-if="isDirty" class="dirty-pill">unsaved</span>
          </template>
        </div>
      </div>
      <div class="card-actions">
        <!-- View-mode actions -->
        <button
          v-if="canEdit && viewMode"
          class="btn btn-primary"
          @click="cc.enterEditMode"
          :disabled="saving"
          title="Switch to edit mode"
        >Edit</button>

        <!-- Edit-mode actions -->
        <button
          v-if="!viewMode"
          class="btn"
          @click="onRevert"
          :disabled="saving"
          :title="isDirty ? 'Discard changes' : 'Exit edit mode'"
        >{{ isDirty ? 'Revert' : 'Cancel' }}</button>
        <button
          v-if="!viewMode"
          class="btn btn-primary"
          :disabled="!isDirty || saving"
          :title="saveTitle"
          @click="onSave"
        >{{ saving ? 'Saving…' : 'Save' }}</button>

        <!-- Always-visible -->
        <button
          v-if="isAuthed"
          class="btn"
          @click="onNewCard"
          :disabled="saving"
        >New</button>
        <button
          v-if="isAuthed"
          class="btn"
          @click="onImportClick"
          :disabled="saving"
          title="Import from bridgeodex.com JSON, or a PDF previously exported from this app"
        >Import</button>
        <input
          ref="importInput"
          type="file"
          accept="application/json,.json,application/pdf,.pdf"
          style="display:none"
          @change="onImportFile"
        />
        <button
          v-if="isAuthed && currentCard"
          class="btn"
          @click="onDuplicate"
          :disabled="saving"
        >Duplicate</button>
        <button
          v-if="canEdit && !isSystemCard"
          class="btn btn-danger"
          @click="onDelete"
          :disabled="saving"
        >Delete</button>
        <button
          class="btn"
          :disabled="!currentCard || cardLoading"
          title="Download as a fillable convention-card PDF. Alt+click: debug variants (field-name overlay)."
          @click="onExportPdf"
        >Export PDF</button>
        <button
          class="btn"
          :disabled="!currentCard || cardLoading"
          title="Export the card's structured data as JSON or XML"
          @click="onExportContent"
        >Export Content</button>
      </div>
    </div>
    <div v-if="saveError" class="save-error">{{ saveError }}</div>

    <!-- Export PDF format picker -->
    <div v-if="exportDialogOpen" class="modal-overlay" @click.self="exportDialogOpen = false">
      <div class="modal-content export-dialog">
        <h2>Export PDF</h2>
        <p class="dialog-desc">
          {{ exportDebug
            ? 'Debug mode — every field will be filled with its own name (overrides card data). Useful for identifying which field is which when authoring or debugging a template.'
            : 'Pick which fillable PDF format to generate.' }}
        </p>
        <div class="format-list">
          <button
            v-for="fmt in availableFormats"
            :key="fmt.id"
            class="format-row"
            @click="doExport(fmt.id)"
          >
            <span class="format-name">{{ fmt.name }}</span>
            <span class="format-desc">{{ fmt.desc }}</span>
          </button>
        </div>
        <div class="dialog-actions">
          <button class="btn btn-secondary" @click="exportDialogOpen = false">Cancel</button>
        </div>
      </div>
    </div>

    <!-- Export Content (structured data) picker -->
    <div v-if="contentDialogOpen" class="modal-overlay" @click.self="contentDialogOpen = false">
      <div class="modal-content export-dialog">
        <h2>Export Content</h2>
        <p class="dialog-desc">
          Download the card's structured data. Use this to share between apps or back up your card outside this site.
        </p>
        <div class="format-list">
          <button
            v-for="fmt in CONTENT_FORMATS"
            :key="fmt.id"
            class="format-row"
            :class="{ disabled: !fmt.ready }"
            :disabled="!fmt.ready"
            @click="doContentExport(fmt.id)"
          >
            <span class="format-name">
              {{ fmt.name }}
              <span v-if="!fmt.ready" class="coming-soon">coming soon</span>
            </span>
            <span class="format-desc">{{ fmt.desc }}</span>
          </button>
        </div>
        <div class="dialog-actions">
          <button class="btn btn-secondary" @click="contentDialogOpen = false">Cancel</button>
        </div>
      </div>
    </div>

    <!-- Filter / overlay bar -->
    <div class="controls">
      <div class="control-group">
        <span class="control-label">SHOW</span>
        <SkillPills v-model="visibleLevelsLocal" />
      </div>
      <div class="control-divider"></div>
      <div class="control-group">
        <span class="control-label">OVERLAYS</span>
        <label class="overlay-toggle">
          <input type="checkbox" v-model="showCoverage" />
          Solo practice coverage
        </label>
        <label class="overlay-toggle" :class="{ disabled: !isAuthed }">
          <input type="checkbox" v-model="showProf" :disabled="!isAuthed" />
          My proficiency
          <span v-if="!isAuthed" class="hint">(sign in)</span>
        </label>
      </div>
    </div>

    <OverlayLegend :show-coverage="showCoverage" :show-prof="showProf" />

    <!-- Main grid -->
    <div class="main-grid">
      <CardTree
        :active-section="activeSection"
        :section-counts="sectionCounts"
        :has-notes-fn="cc.sectionHasNotes"
        @select="activeSection = $event"
      />
      <CardDetail
        :section-id="activeSection"
        :card="editorCard"
        :visible-levels="visibleLevelsLocal"
        :coverage-by-entry="coverageByEntry"
        :show-coverage="showCoverage"
        :show-prof="showProf && isAuthed"
        :editable="isEditable"
        :get-note="cc.getNote"
        :set-note="cc.setNote"
        :write-field="cc.writeField"
        @toggle="onToggle"
      />
    </div>

    <!-- Footer -->
    <footer class="card-footer">
      <span>{{ totalSelected }} conventions selected</span>
      <span v-if="currentCard?.updated_at">Saved {{ relativeTime(currentCard.updated_at) }}</span>
    </footer>
  </div>
</template>

<script setup>
import { computed, onMounted, watch, ref } from 'vue'
import { useUserStore } from '../composables/useUserStore.js'
import { useConventionCard } from '../composables/useConventionCard.js'
import { importBridgeodexJson } from '../utils/bridgeodexImport.js'
import SkillPills from '../components/conventionCard/SkillPills.vue'
import OverlayLegend from '../components/conventionCard/OverlayLegend.vue'
import CardTree from '../components/conventionCard/CardTree.vue'
import CardDetail from '../components/conventionCard/CardDetail.vue'

defineProps({
  embedded: { type: Boolean, default: false }
})

const userStore = useUserStore()
const cc = useConventionCard()

const currentCard = cc.currentCard
const editedCardData = cc.editedCardData
const userCardLinks = cc.userCardLinks
const cardLoading = cc.cardLoading
const cardError = cc.cardError
const saving = cc.saving
const saveError = cc.saveError
const canEdit = cc.canEdit
const isEditable = cc.isEditable
const isDirty = cc.isDirty
const viewMode = cc.viewMode
const activeSection = cc.activeSection
const visibleLevels = cc.visibleLevels
const showCoverage = cc.showCoverage
const showProf = cc.showProf
const coverageByEntry = cc.coverageByEntry
const sectionCounts = cc.sectionCounts
const totalSelected = cc.totalSelected

// The detail panel reads card_data; in edit mode that source is the
// in-flight `editedCardData`, not the persisted `currentCard.card_data`.
const editorCard = computed(() => {
  const c = currentCard.value
  if (!c) return null
  return { ...c, card_data: editedCardData.value || c.card_data }
})

const isSystemCard = computed(() => currentCard.value && currentCard.value.owner_id == null)
const hasMultipleCards = computed(() => userCardLinks.value.length > 1)

const saveTitle = computed(() => {
  if (!canEdit.value) return 'You can only edit private cards you own (admins can edit any)'
  if (!isDirty.value) return 'No changes to save'
  return 'Save changes'
})

function onToggle(entryId, checked) {
  cc.toggleEntry(entryId, checked)
}

async function onSave() {
  await cc.saveCard()
}

async function onSwitchCard(event) {
  const id = event.target.value
  if (id && id !== currentCard.value?.id) {
    await cc.switchCard(id)
  }
}

const EXPORT_FORMATS = [
  { id: 'classic', name: 'ACBL Classic', desc: 'The familiar SS1 Rev. 4-12 card — what most clubs use.' },
  { id: 'new',     name: 'ACBL New',     desc: 'The redesigned ACBL card (released a few years ago).' }
]

const exportDialogOpen = ref(false)
const exportDebug = ref(false)

const availableFormats = computed(() => EXPORT_FORMATS)

function onExportPdf(event) {
  saveError.value = null
  exportDebug.value = !!event?.altKey
  exportDialogOpen.value = true
}

async function doExport(formatId) {
  const debug = exportDebug.value
  exportDialogOpen.value = false
  try {
    const mod = await import('../utils/acblClassicFillPdf.js')
    if (debug) {
      await mod.downloadAcblFieldDebugPdf(formatId)
    } else {
      await mod.downloadAcblPdf(currentCard.value, formatId)
    }
  } catch (err) {
    console.error('PDF export failed:', err)
    saveError.value = err.message || 'Failed to export PDF'
  }
}

const CONTENT_FORMATS = [
  {
    id: 'bridge-classroom',
    name: 'Bridge Classroom JSON',
    desc: 'Our native schema. Round-trips cleanly with Import.',
    ready: true,
    ext: 'json',
    mime: 'application/json'
  },
  {
    id: 'bridgeodex',
    name: 'Bridgeodex JSON',
    desc: 'Compatible with bridgeodex.com. Useful for sharing with partners who use that site.',
    ready: false,
    ext: 'json',
    mime: 'application/json'
  },
  {
    id: 'swan',
    name: 'Swan',
    desc: 'The Swan convention-card text format.',
    ready: false,
    ext: 'swn',
    mime: 'text/plain'
  },
  {
    id: 'bbo-xml',
    name: 'BBO XML',
    desc: 'BBO’s convention-card XML, importable into Bridge Base Online.',
    ready: false,
    ext: 'xml',
    mime: 'application/xml'
  }
]

const contentDialogOpen = ref(false)

function onExportContent() {
  saveError.value = null
  contentDialogOpen.value = true
}

function sanitizeFilename(name) {
  return (name || 'convention-card').replace(/[^a-z0-9._-]+/gi, '_').slice(0, 80)
}

function downloadBlob(content, filename, mime) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function doContentExport(formatId) {
  const fmt = CONTENT_FORMATS.find(f => f.id === formatId)
  if (!fmt || !fmt.ready) return
  contentDialogOpen.value = false
  const card = currentCard.value
  if (!card) return
  try {
    let payload
    if (formatId === 'bridge-classroom') {
      payload = JSON.stringify({
        schema: 'bridge-classroom/card_data@v1',
        name: card.name || null,
        description: card.description || null,
        exportedAt: new Date().toISOString(),
        card_data: card.card_data || {}
      }, null, 2)
    } else {
      throw new Error(`No exporter wired up for "${fmt.name}" yet`)
    }
    const stem = sanitizeFilename(card.name)
    downloadBlob(payload, `${stem}.${fmt.ext}`, fmt.mime)
  } catch (err) {
    console.error('Content export failed:', err)
    saveError.value = err.message || 'Failed to export content'
  }
}

async function onNewCard() {
  try {
    await cc.createCard({ name: 'My convention card', cardData: { metadata: { name: 'My convention card' } } })
    cc.enterEditMode()
  } catch (err) {
    saveError.value = err.message || 'Failed to create card'
  }
}

const importInput = ref(null)

function onImportClick() {
  saveError.value = null
  importInput.value?.click()
}

async function onImportFile(event) {
  const file = event.target.files?.[0]
  event.target.value = ''  // allow re-importing the same filename later
  if (!file) return
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
  try {
    let name, description, card_data
    if (isPdf) {
      const mod = await import('../utils/acblClassicFillPdf.js')
      const bytes = await file.arrayBuffer()
      const extracted = await mod.extractCardDataFromPdf(bytes)
      if (!extracted) {
        throw new Error('This PDF has no embedded Bridge Classroom card data. Only PDFs previously exported from this app can be re-imported.')
      }
      ;({ name, description, card_data } = extracted)
    } else {
      const text = await file.text()
      const json = JSON.parse(text)
      ;({ name, description, card_data } = importBridgeodexJson(json))
    }

    // Duplicate-name check: a user often re-imports the same partnership
    // card after updating it on bridgeodex. Offer to overwrite the
    // existing card rather than piling up "My Card", "My Card (2)" etc.
    const existing = userCardLinks.value.find(link => link.card_name === name)
    if (existing) {
      const overwrite = window.confirm(
        `You already have a card named "${name}".\n\nClick OK to overwrite the existing card with the imported data.\nClick Cancel to import as a new card with a date suffix.`
      )
      if (overwrite) {
        await cc.overwriteCard(existing.card_id, { name, description, cardData: card_data })
        return
      }
      const stamp = new Date().toISOString().slice(0, 10)
      await cc.createCard({ name: `${name} (imported ${stamp})`, description, cardData: card_data })
      return
    }

    await cc.createCard({ name, description, cardData: card_data })
  } catch (err) {
    console.error('Import failed:', err)
    saveError.value = err.message || 'Import failed'
  }
}

async function onDuplicate() {
  try {
    await cc.duplicateCurrentCard()
    cc.enterEditMode()
  } catch (err) {
    saveError.value = err.message || 'Failed to duplicate card'
  }
}

function onRevert() {
  if (isDirty.value && !window.confirm('Discard your unsaved changes?')) return
  cc.revertEdits()
}

async function onDelete() {
  const name = currentCard.value?.name || 'this card'
  if (!confirm(`Delete "${name}"? This cannot be undone.`)) return
  await cc.deleteCurrentCard()
}

// Local ref bridging the composable's Set with v-model on SkillPills
const visibleLevelsLocal = ref(visibleLevels.value)
watch(visibleLevelsLocal, (next) => { visibleLevels.value = next })

const isAuthed = computed(() => !!userStore.currentUser.value?.id)

const subtitle = computed(() => {
  const card = currentCard.value
  if (!card) return ''
  const user = userStore.currentUser.value
  if (user?.firstName) {
    return `${user.firstName} · ${card.name}`
  }
  return card.name
})

function relativeTime(iso) {
  if (!iso) return ''
  const ts = new Date(iso).getTime()
  if (!ts) return ''
  const diff = Date.now() - ts
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.floor(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

onMounted(async () => {
  // The standalone /convention-card route doesn't go through
  // MainLayout, so the user store may not have been hydrated yet.
  // initialize() is idempotent.
  userStore.initialize()
  if (!currentCard.value) {
    await cc.loadCardForCurrentUser()
  }
  if (isAuthed.value && Object.keys(cc.lessonMasteryMap.value).length === 0) {
    await cc.loadMasteryForCurrentUser()
  }
})

// When the user signs in mid-session, refresh
watch(() => userStore.currentUser.value?.id, async (uid) => {
  await cc.loadCardForCurrentUser()
  if (uid) await cc.loadMasteryForCurrentUser()
})
</script>

<style scoped>
.convention-card {
  padding: 8px 0;
  font-family: var(--font-body, 'DM Sans', sans-serif);
}

.convention-card:not(.embedded) {
  max-width: var(--max-width, 1200px);
  margin: 0 auto;
  padding: 24px 16px;
}

.page-header h1 {
  font-family: var(--font-heading, 'Source Serif 4', serif);
  font-size: 28px;
  color: var(--green-dark, #2d6a4f);
  margin: 0 0 16px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 16px;
}

.title-main {
  font-family: var(--font-heading, 'Source Serif 4', serif);
  font-size: 20px;
  font-weight: 600;
  color: var(--green-dark, #2d6a4f);
}

.title-sub {
  font-size: 13px;
  color: var(--text-secondary, #6b7280);
  margin-top: 2px;
}

.card-actions {
  display: flex;
  gap: 8px;
}

.btn {
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid var(--card-border, #e0ddd7);
  background: white;
  color: var(--text-secondary, #6b7280);
  cursor: pointer;
}

.btn:hover:not(:disabled) {
  background: #f3f4f6;
}

.btn:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.btn-primary {
  background: var(--green-mid, #40916c);
  color: white;
  border-color: transparent;
}

.btn-primary:hover:not(:disabled) {
  background: var(--green-dark, #2d6a4f);
}

.btn-danger {
  color: #b91c1c;
  border-color: #fecaca;
}

.btn-danger:hover:not(:disabled) {
  background: #fef2f2;
}

.card-picker {
  font-family: inherit;
  font-size: 13px;
  padding: 4px 8px;
  border: 1px solid var(--card-border, #e0ddd7);
  border-radius: 6px;
  background: white;
  color: var(--text-primary, #1a1a1a);
  margin-right: 8px;
}

.read-only-pill,
.view-pill,
.dirty-pill {
  display: inline-block;
  font-size: 11px;
  font-weight: 600;
  padding: 1px 8px;
  border-radius: 999px;
  margin-left: 6px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.read-only-pill {
  background: #f3f4f6;
  color: var(--text-secondary, #6b7280);
}

.view-pill {
  background: #e0f2fe;
  color: #075985;
}

.dirty-pill {
  background: #fef3c7;
  color: #92400e;
}

.save-error {
  margin: -4px 0 12px;
  padding: 8px 12px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 6px;
  color: #b91c1c;
  font-size: 13px;
}

.controls {
  background: #f9fafb;
  border-radius: var(--radius-card, 10px);
  padding: 12px 14px;
  margin-bottom: 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: center;
}

.control-group {
  display: flex;
  align-items: center;
  gap: 10px;
}

.control-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary, #6b7280);
  letter-spacing: 0.04em;
}

.control-divider {
  width: 1px;
  height: 28px;
  background: var(--card-border, #e0ddd7);
}

.overlay-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  cursor: pointer;
  color: var(--text-primary, #1a1a1a);
}

.overlay-toggle.disabled { cursor: not-allowed; color: var(--text-tertiary, #9ca3af); }
.overlay-toggle .hint { font-size: 11px; color: var(--text-tertiary, #9ca3af); }

.overlay-toggle input { accent-color: var(--green-mid, #40916c); }

.main-grid {
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
  gap: 16px;
}

.card-footer {
  margin-top: 16px;
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--text-secondary, #6b7280);
}

@media (max-width: 720px) {
  .main-grid { grid-template-columns: 1fr; }
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  padding: 20px;
}

.modal-content.export-dialog {
  background: white;
  border-radius: var(--radius-card, 10px);
  max-width: 460px;
  width: 100%;
  padding: 28px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.2);
}

.export-dialog h2 {
  font-family: var(--font-heading, 'Source Serif 4', serif);
  font-size: 22px;
  color: var(--green-dark, #2d6a4f);
  margin: 0 0 8px;
}

.dialog-desc {
  color: var(--text-secondary, #6b7280);
  font-size: 14px;
  margin: 0 0 20px;
}

.format-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 20px;
}

.format-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  text-align: left;
  padding: 12px 14px;
  background: white;
  border: 1px solid var(--card-border, #e0ddd7);
  border-radius: var(--radius-button, 6px);
  cursor: pointer;
  font-family: inherit;
  transition: border-color 0.2s, background 0.2s;
}

.format-row:hover:not(:disabled) {
  border-color: var(--green-mid, #40916c);
  background: var(--green-pale, #d8f3dc);
}

.format-row.disabled,
.format-row:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.coming-soon {
  display: inline-block;
  margin-left: 8px;
  font-size: 11px;
  font-weight: 500;
  color: var(--text-muted, #9ca3af);
  background: #f3f4f6;
  padding: 2px 6px;
  border-radius: 4px;
  vertical-align: middle;
}

.format-name {
  font-weight: 600;
  font-size: 15px;
  color: var(--text-primary, #1a1a1a);
}

.format-desc {
  font-size: 13px;
  color: var(--text-secondary, #6b7280);
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
}

.btn-secondary {
  background: #f3f4f6;
  color: var(--text-primary, #1a1a1a);
  border: none;
}

.btn-secondary:hover {
  background: #e5e7eb;
}
</style>
