<template>
  <div class="convention-card" :class="{ embedded }">
    <ChoiceDialog ref="dialog" />
    <ConflictDialog :merge="cc.pendingMerge.value" @done="onMergeDone" />
    <ShareDialog v-if="cc.canShare" ref="shareDialog" :storage="storage" :card="currentCard" @left="onLeftCard" />
    <!-- Standalone-page header. Hidden inside the lobby tab. -->
    <header v-if="!embedded" class="page-header">
      <h1>Convention card</h1>
    </header>

    <PdfDialog ref="pdfDialog" />

    <!-- Title row -->
    <div class="card-header">
      <div class="card-title">
        <!-- The page heading says it already; embedded (no heading), this is the title. -->
        <div v-if="embedded" class="title-main">Convention card</div>
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
            <span
              v-if="cardLevelNow"
              class="card-level-pill"
              :class="'lvl-' + cardLevelNow.band"
              :title="cardLevelNow.why"
            >{{ bandLabel(cardLevelNow.band) }} · {{ cardLevelNow.level }}</span>
          </template>
        </div>
      </div>
    </div>

    <!-- Viewing or editing, across the card: a pill beside the name was easy
         to miss, and an Edit button alone read as "editing already" (Rick
         Wilson, 2026-11-21). The switch between them lives here. -->
    <div v-if="currentCard && !cardLoading" class="mode-banner" :class="'mode-' + mode" role="status">
      <span class="mode-label">{{ MODE_TEXT[mode].label }}</span>
      <span class="mode-text">{{ MODE_TEXT[mode].text }}</span>
      <span class="mode-actions">
        <button
          v-if="mode === 'view'"
          class="btn btn-primary"
          @click="cc.enterEditMode"
          :disabled="saving"
        >Edit card</button>
        <template v-if="mode === 'edit' || mode === 'unsaved'">
          <button
            class="btn"
            @click="onRevert"
            :disabled="saving"
            :title="isDirty ? 'Discard your changes' : 'Stop editing'"
          >{{ isDirty ? 'Revert' : 'Done' }}</button>
          <button
            class="btn btn-primary"
            :disabled="!isDirty || saving"
            :title="saveTitle"
            @click="onSave"
          >{{ saving ? 'Saving…' : 'Save' }}</button>
        </template>
      </span>
    </div>

    <!-- The toolbar: the cards themselves, then printing and files -->
    <div class="card-toolbar">
      <div class="tool-group" role="group" aria-label="Cards">
        <button
          v-if="isAuthed"
          class="btn"
          @click="onNewCard"
          :disabled="saving"
        >New</button>
        <button
          v-if="isAuthed && currentCard"
          class="btn"
          @click="onDuplicate"
          :disabled="saving"
        >Duplicate</button>
        <button
          v-if="canShareCard"
          class="btn"
          @click="shareDialog.show()"
          :disabled="saving || cardLoading"
          title="Invite your partner, see who has this card, or get a link to its PDF"
        >Share</button>
        <span v-if="moreActions.length" class="menu-wrap">
          <button
            class="btn"
            aria-haspopup="menu"
            :aria-expanded="openMenu === 'more'"
            :disabled="saving"
            @click="toggleMenu('more')"
            @keydown.esc="openMenu = null"
          >More ▾</button>
          <span v-if="openMenu === 'more'" class="menu-choices" role="menu" @keydown.esc="openMenu = null">
            <button
              v-for="a in moreActions"
              :key="a.id"
              role="menuitem"
              :class="{ danger: a.danger }"
              :title="a.title"
              @click="openMenu = null; a.run()"
            >{{ a.label }}</button>
          </span>
        </span>
      </div>
      <div class="tool-group" role="group" aria-label="Print and files">
        <button
          class="btn"
          :disabled="!currentCard || cardLoading"
          title="Print the card, unsaved edits included"
          @click="onPrint"
        >Print</button>
        <button
          class="btn"
          :disabled="!currentCard || cardLoading"
          title="Open the card as a PDF in a new tab, unsaved edits included"
          @click="onPreviewPdf"
        >Preview PDF</button>
        <button
          class="btn"
          :disabled="!canExport"
          :title="isDirty ? SAVE_FIRST : 'Download the card as a PDF. Alt+click: a PDF with each box\'s name in it, for template work.'"
          @click="onExportPdf"
        >Export PDF</button>
        <button
          class="btn"
          :disabled="!canExport"
          :title="isDirty ? SAVE_FIRST : 'Save the card for another app: BBO, Bridgodex, BBA, or this editor\'s own file'"
          @click="onExportContent"
        >Export…</button>
        <button
          v-if="isAuthed"
          class="btn"
          @click="onImportClick"
          :disabled="saving"
          title="Import a card: this editor's file, BBO or Bridgodex JSON, a BBA .bbsa file, or a PDF"
        >Import</button>
        <!-- No accept filter: a file picker greys out a card whose file lacks the
             extension it expects. importCard tells the format from the bytes. -->
        <input
          ref="importInput"
          type="file"
          style="display:none"
          @change="onImportFile"
        />
      </div>
    </div>
    <div v-if="saveError" class="save-error">
      {{ saveError }}
      <button v-if="pageIsStale" class="btn btn-small" @click="reloadPage">Reload</button>
    </div>

    <!-- What an import found: hand edits read from a PDF, and boxes it
         could not read (acblPdfImport.js). Cleared by the next import. -->
    <div v-if="shownImportNotes.length" class="import-notes" role="status">
      <button class="import-notes-close" title="Dismiss" @click="importNotes = []">×</button>
      <p v-for="(d, i) in shownImportNotes" :key="i" :class="d.severity">{{ d.message }}</p>
    </div>

    <!-- What checkCard finds on the open card: the same diagnostics
         window.card.validate returns (the tool contract). Older paths are
         not problems, so only errors and warnings are shown. -->
    <details v-if="cardProblems.length" class="card-problems">
      <summary>
        {{ cardProblems.length === 1 ? '1 thing' : `${cardProblems.length} things` }} on this card to look at
      </summary>
      <ul>
        <li v-for="(d, i) in cardProblems" :key="i" :class="d.severity">
          {{ d.message }}<span v-if="d.hint" class="hint"> ({{ d.hint }})</span>
        </li>
      </ul>
    </details>

    <!-- Conventions the notes name that the boxes don't (recogniseConventions.js). -->
    <NoteSuggestions :card-data="cc.editedCardData.value" :can-edit="canEdit" @change="changeCard" />
    <TextMapping v-if="showTextMapping" :card-data="cc.editedCardData.value" :can-edit="canEdit" @change="changeCard" />

    <!-- Export… for another app -->
    <div v-if="contentDialogOpen" class="modal-overlay" @click.self="contentDialogOpen = false">
      <div class="modal-content export-dialog">
        <h2>Export for another app</h2>
        <p class="dialog-desc">
          Save the card as a file another app reads, or as this editor's own file to keep a copy.
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
        <!-- Not inside the BBO button: a link can't sit in a button -->
        <p class="dialog-desc bbo-extension">
          A BBO file goes into BBO only through the
          <a href="https://github.com/bridge-craftwork/Better-BBO-Convention-Card" target="_blank" rel="noopener">Better BBO Convention Card</a>
          browser extension: BBO itself has no way to import a card.
        </p>
        <div class="dialog-actions">
          <button class="btn btn-secondary" @click="contentDialogOpen = false">Cancel</button>
        </div>
      </div>
    </div>

    <!-- Filter / overlay bar -->
    <div class="controls">
      <div class="control-group search-group">
        <input
          v-model="searchQuery"
          type="search"
          class="card-search-input"
          placeholder="Search this card's fields"
          aria-label="Search this card's fields"
        />
      </div>
      <div class="control-divider"></div>
      <div class="control-group">
        <span class="control-label">SHOW</span>
        <SkillPills v-model="visibleLevelsLocal" />
      </div>
      <div class="control-divider"></div>
      <div class="control-group">
        <label class="control-label" for="cc-regulator">ALERTS</label>
        <select id="cc-regulator" v-model="regulator" class="regulator-select" title="Whose alerting rules the badges show">
          <option v-for="(r, id) in REGULATORS" :key="id" :value="id">{{ r.name }}</option>
        </select>
      </div>
      <div class="control-divider"></div>
      <div class="control-group">
        <span class="control-label">TEXT</span>
        <label class="overlay-toggle" title="Sort the card's text by whether a tool can read what it says">
          <input type="checkbox" v-model="showTextMapping" />
          Text mapping
        </label>
      </div>
      <template v-if="hasPractice">
        <div class="control-divider"></div>
        <div class="control-group">
          <span class="control-label">PRACTICE</span>
          <label class="overlay-toggle" title="For each of this card's conventions: the deals to practise it, and whether the bot plays it">
            <input type="checkbox" v-model="showPracticeReport" />
            Solo practice
          </label>
        </div>
      </template>
      <div v-if="overlays" class="control-divider"></div>
      <div v-if="overlays" class="control-group">
        <span class="control-label">OVERLAYS</span>
        <label class="overlay-toggle">
          <input type="checkbox" v-model="showCoverage" />
          Practice deals
        </label>
        <label class="overlay-toggle" :class="{ disabled: !isAuthed }">
          <input type="checkbox" v-model="showProf" :disabled="!isAuthed" />
          My proficiency
          <span v-if="!isAuthed" class="hint">(sign in)</span>
        </label>
      </div>
    </div>

    <OverlayLegend v-if="overlays" :show-coverage="showCoverage" :show-prof="showProf" />

    <PracticeReport v-if="hasPractice && showPracticeReport" :card-data="cc.editedCardData.value"
                    :bot="props.overlays.bot || null" :practice="props.overlays.practice || []" />

    <CardSearch v-else-if="searchQuery.trim()" :query="searchQuery" :card="editorCard" :editable="isEditable"
                :write-field="cc.writeField" @open="openFromSearch" />

    <!-- Main grid -->
    <div v-else class="main-grid">
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
        :focus-path="focusPath"
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
import { computed, nextTick, onBeforeUnmount, onMounted, watch, ref } from 'vue'
import { useCardEditor } from './useCardEditor.js'
import { importCards } from '../../../js/importCard.js'
import { exportRecord } from '../../../js/cardBundle.js'
import { mergeImported } from './importMerge.js'
import { schema3Storage } from './storedForm.js'
import { askInDialog, tellMatched } from './importDialogs.js'
import ChoiceDialog from './ChoiceDialog.vue'
import { checkCard } from '../../../js/checkCard.js'
import { REGULATORS } from '../../../js/spec.js'
import { cardLevel } from './cardSummary.js'
import { bandLabel } from './levels.js'
import SkillPills from './components/SkillPills.vue'
import OverlayLegend from './components/OverlayLegend.vue'
import CardTree from './components/CardTree.vue'
import CardDetail from './components/CardDetail.vue'
import CardSearch from './components/CardSearch.vue'
import NoteSuggestions from './components/NoteSuggestions.vue'
import TextMapping from './components/TextMapping.vue'
import PracticeReport from './components/PracticeReport.vue'
import ConflictDialog from './ConflictDialog.vue'
import ShareDialog from './ShareDialog.vue'
import PdfDialog from './PdfDialog.vue'
import { renderPdf, downloadPdf, openPreviewTab, showInTab, printBytes, printsInFrame } from './pdfActions.js'
import { importReportNotes } from './importReport.js'

// The convention card editor. Where cards live, and who may edit them, is
// the host's: `storage` and `overlays` are the adapters useCardEditor.js
// describes. The PDF export needs its template and font: the host tells the
// library where they are (setAssetLoader) before the user exports.
const props = defineProps({
  embedded: { type: Boolean, default: false },
  storage: { type: Object, required: true },
  overlays: { type: Object, default: null }
})

// 'deleted' also when the card is only taken off the person's list.
const emit = defineEmits(['deleted'])
const cc = useCardEditor(props.storage, props.overlays || undefined)
const currentUser = computed(() => props.storage.user?.value || null)

/** The .bbsa converter, loaded only when it is needed (it brings the spec's JSON). */
const loadBbsa = () => import('../../../js/bbsa.js')
const loadBridgodex = () => import('../../../js/bridgodex.js')
const loadBbo = () => import('../../../js/bbo.js')

const currentCard = cc.currentCard
const editedCardData = cc.editedCardData
const userCardLinks = cc.userCardLinks
const cardLoading = cc.cardLoading
const cardError = cc.cardError
const saving = cc.saving
const saveError = cc.saveError
const regulator = cc.regulator

// The PDF and .bbsa code is loaded when first used, from files named by the
// build. A deploy replaces them, so a page opened before a deploy asks for
// files that are gone, and each browser words the failure differently.
const pageIsStale = ref(false)
const STALE = /dynamically imported module|Importing a module script failed|error loading dynamically imported module|Failed to load module script/i
function explain(err, fallback) {
  if (STALE.test(err?.message || '')) {
    pageIsStale.value = true
    return 'This page is older than the site: it was updated after you opened it. Reload the page and try again; your saved cards are kept.'
  }
  return err?.message || fallback
}
function reloadPage() { window.location.reload() }

// The card's level (cardSummary.js), unsaved edits included.
const cardLevelNow = computed(() => (cc.editedCardData.value ? cardLevel(cc.editedCardData.value) : null))

// The open card's problems, unsaved edits included, as checkCard reports them.
const cardProblems = computed(() => {
  const data = cc.editedCardData.value
  if (!data) return []
  return checkCard(data).diagnostics.filter(d => d.severity !== 'info')
})
const canEdit = cc.canEdit
const isEditable = cc.isEditable

// "Text mapping": off unless this browser turned it on (most people using
// the editor don't need it).
const TEXT_MAPPING_KEY = 'convention-card.text-mapping'
const showTextMapping = ref((() => { try { return localStorage.getItem(TEXT_MAPPING_KEY) === '1' } catch { return false } })())
watch(showTextMapping, on => { try { localStorage.setItem(TEXT_MAPPING_KEY, on ? '1' : '0') } catch { /* private mode */ } })

// The host's ways to practise alone, when it has any (`overlays.practice`,
// deal collections, and `overlays.bot`): their report takes the place of the
// card's sections while it is shown.
const hasPractice = computed(() => !!(props.overlays?.bot || props.overlays?.practice?.length))
const PRACTICE_REPORT_KEY = 'convention-card.practice-report'
const showPracticeReport = ref((() => { try { return localStorage.getItem(PRACTICE_REPORT_KEY) === '1' } catch { return false } })())
watch(showPracticeReport, on => { try { localStorage.setItem(PRACTICE_REPORT_KEY, on ? '1' : '0') } catch { /* private mode */ } })

// A change made outside the card's own boxes (a suggestion accepted or
// turned down): into edit mode if need be, then applied as an edit.
function changeCard(apply) {
  if (!isEditable.value) cc.enterEditMode()
  if (!isEditable.value || !cc.editedCardData.value) return
  apply(cc.editedCardData.value)
  cc.editedCardData.value = { ...cc.editedCardData.value }
}
const isDirty = cc.isDirty
const viewMode = cc.viewMode
const activeSection = cc.activeSection

// Search: its results stand in for the section until it's cleared, and "Go
// to" opens the field in its section
const searchQuery = ref('')
const focusPath = ref(null)
function openFromSearch(section, path) {
  activeSection.value = section
  searchQuery.value = ''
  focusPath.value = null
  nextTick(() => { focusPath.value = path })
}
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
// A card everyone can use (built-in or public), rather than a player's own.
const isSharedResource = computed(() => !!currentCard.value &&
  (isSystemCard.value || currentCard.value.visibility === 'public'))
// The picker lists the person's own cards; a card that isn't one of them (a
// sample or system card) shows its name instead of a blank picker.
const hasMultipleCards = computed(() =>
  userCardLinks.value.length > 1 && userCardLinks.value.some(l => l.card_id === currentCard.value?.id))

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

// A partner saved while this card was being edited, and some fields both
// changed: the conflict dialog's choices are saved, or editing goes on.
async function onMergeDone(choices) {
  await cc.finishMerge(choices)
}

const shareDialog = ref(null)
// A saved card of the user's, when the host shares cards
const canShareCard = computed(() =>
  cc.canShare && !!currentUser.value && !!currentCard.value && !isSystemCard.value &&
  userCardLinks.value.some(l => l.card_id === currentCard.value.id))

async function onLeftCard(cardId) {
  await cc.loadCardForCurrentUser()
  emit('deleted', cardId)
}

async function onSwitchCard(event) {
  const id = event.target.value
  if (id && id !== currentCard.value?.id) {
    await cc.switchCard(id)
  }
}

// An export is of the saved card, so unsaved edits would be left out of it
// without a word (Tomasz Pawlowski, 2026-11-03). Editing with nothing changed
// doesn't stop an export: the saved card is the card on screen.
const SAVE_FIRST = 'Save first: an export is of the saved card'
const canExport = computed(() => !!currentCard.value && !cardLoading.value && !isDirty.value)

// Print, Preview PDF and Export PDF ask the same questions (PdfDialog.vue:
// which card, the second page, fillable or flat) and remember the answers.
// Print and preview show the card on screen, unsaved edits included
// (Tomasz Pawlowski, 2026-11-03); Export PDF is of the saved card.
const pdfDialog = ref(null)
const cardOnScreen = () => (isDirty.value ? { ...editorCard.value, updated_at: new Date().toISOString() } : editorCard.value)

async function onPrint() {
  saveError.value = null
  const options = await pdfDialog.value.ask({ action: 'print', card: editorCard.value })
  if (!options) return
  // Where a frame can't print a PDF, it opens in a tab, which must open now
  const tab = printsInFrame() ? null : openPreviewTab()
  try {
    printBytes(await renderPdf(cardOnScreen(), options), tab)
  } catch (err) {
    tab?.close()
    console.error('Print failed:', err)
    saveError.value = explain(err, 'Failed to make the card to print')
  }
}

async function onPreviewPdf() {
  saveError.value = null
  const options = await pdfDialog.value.ask({ action: 'preview', card: editorCard.value })
  if (!options) return
  const tab = openPreviewTab()
  if (!tab) {
    saveError.value = 'Your browser blocked the preview\'s new tab. Allow pop-ups for this site and try again.'
    return
  }
  try {
    showInTab(tab, await renderPdf(cardOnScreen(), options))
  } catch (err) {
    tab.close()
    console.error('PDF preview failed:', err)
    saveError.value = explain(err, 'Failed to make the preview')
  }
}

async function onExportPdf(event) {
  saveError.value = null
  const debug = !!event?.altKey
  const options = await pdfDialog.value.ask({
    action: 'export',
    card: currentCard.value,
    note: debug ? 'Template work: every box is filled with its own name, not the card.' : '',
  })
  if (!options) return
  try {
    if (debug) {
      const mod = await import('../../../js/acblClassicFillPdf.js')
      await mod.downloadAcblFieldDebugPdf(options.template)
    } else {
      await downloadPdf(currentCard.value, options)
    }
  } catch (err) {
    console.error('PDF export failed:', err)
    saveError.value = explain(err, 'Failed to export PDF')
  }
}

// The toolbar's menu (More ▾). A click anywhere outside it closes it.
const openMenu = ref(null)
function toggleMenu(name) { openMenu.value = openMenu.value === name ? null : name }
function closeMenus(event) {
  if (openMenu.value && !event.target.closest?.('.menu-wrap')) openMenu.value = null
}
onMounted(() => document.addEventListener('click', closeMenus))
onBeforeUnmount(() => document.removeEventListener('click', closeMenus))

const CONTENT_FORMATS = [
  {
    id: 'bridge-classroom',
    name: 'This editor\'s file (JSON)',
    desc: 'The whole card, to keep a copy or move it to another browser. Import reads it back exactly.',
    ready: true,
    ext: 'json',
    mime: 'application/json'
  },
  // The file the Better BBO Convention Card extension writes and reads, with
  // BBO in the file's name, so a person finds it by name (Rick Wilson,
  // 2026-10-05). BBO itself reads no card files: the extension is needed.
  {
    id: 'bbo',
    name: 'BBO',
    desc: 'For Bridge Base Online, through the Better BBO Convention Card browser extension, which loads this file into BBO. BBO can\'t import it without the extension.',
    ready: true,
    ext: 'BBO.json',
    mime: 'application/json'
  },
  {
    id: 'bridgeodex',
    name: 'Bridgodex',
    desc: 'For Bridgodex.com: its import reads this file. A card imported from Bridgodex goes back with every box it came with.',
    ready: true,
    ext: 'bridgodex.json',
    mime: 'application/json'
  },
  {
    id: 'swan',
    name: 'BridgeWinners (Swan)',
    desc: 'For BridgeWinners: its card import reads Swan files.',
    ready: false,
    ext: 'json',
    mime: 'application/json'
  },
  {
    id: 'bbsa',
    name: 'BBA (.bbsa)',
    desc: 'Bridge Bidding Analyser’s convention file. Settings the card has no field for are kept from an imported .bbsa.',
    ready: true,
    ext: 'bbsa',
    mime: 'text/plain'
  },
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

async function doContentExport(formatId) {
  const fmt = CONTENT_FORMATS.find(f => f.id === formatId)
  if (!fmt || !fmt.ready) return
  contentDialogOpen.value = false
  const card = currentCard.value
  if (!card) return
  try {
    let payload
    if (formatId === 'bridge-classroom') {
      payload = JSON.stringify(exportRecord(card), null, 2)
    } else if (formatId === 'bbo') {
      const { exportBboFile } = await loadBbo()
      payload = JSON.stringify(exportBboFile(card), null, 2)
    } else if (formatId === 'bbsa') {
      const { exportBbsa } = await loadBbsa()
      payload = exportBbsa(card.card_data || {}).text
    } else if (formatId === 'bridgeodex') {
      const { exportBridgodexJson } = await loadBridgodex()
      payload = JSON.stringify(exportBridgodexJson(card.card_data || {}), null, 2)
    } else {
      throw new Error(`No exporter wired up for "${fmt.name}" yet`)
    }
    const stem = sanitizeFilename(card.name)
    downloadBlob(payload, `${stem}.${fmt.ext}`, fmt.mime)
  } catch (err) {
    console.error('Content export failed:', err)
    saveError.value = explain(err, 'Failed to export content')
  }
}

async function onNewCard() {
  try {
    await cc.createCard({ name: 'My convention card', cardData: { metadata: { name: 'My convention card' } } })
    cc.enterEditMode()
  } catch (err) {
    saveError.value = explain(err, 'Failed to create card')
  }
}

const importInput = ref(null)
const dialog = ref(null)
const importNotes = cc.importNotes
// Only on the card the import opened (the notes stay in the shared state).
const shownImportNotes = computed(() =>
  (cc.importNotesFor.value && cc.importNotesFor.value !== cc.currentCard.value?.id ? [] : importNotes.value))

function onImportClick() {
  saveError.value = null
  importNotes.value = []
  importInput.value?.click()
}

async function onImportFile(event) {
  const file = event.target.files?.[0]
  event.target.value = ''  // allow re-importing the same filename later
  if (!file) return
  try {
    // importCards tells the formats apart by their content: the editor's
    // own JSON (one card, or an "Export all" file), BBO's, Bridgodex's,
    // .bbsa and our PDFs. The cards are merged with those kept
    // (importMerge.js): added, skipped, replaced by a newer copy, or, for an
    // older one, the person chooses.
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
    const bytes = isPdf ? await file.arrayBuffer() : await file.text()
    const records = await importCards(bytes, { name: file.name.replace(/\.[^.]*$/, '') })
    const pdfNotes = records[0]?.format === 'pdf'
      ? (await import('../../../js/acblPdfImport.js')).pdfReportDiagnostics(records[0].report)
      : []
    const merged = await mergeImported(records, schema3Storage(props.storage), askInDialog(dialog.value))
    await cc.loadUserCardLinks()
    if (merged.lastId) await cc.switchCard(merged.lastId)
    importNotes.value = [...pdfNotes, ...importReportNotes(records)]
    cc.importNotesFor.value = merged.lastId || null
    await tellMatched(dialog.value, merged)
  } catch (err) {
    console.error('Import failed:', err)
    saveError.value = explain(err, 'Import failed')
  }
}

async function onDuplicate() {
  try {
    await cc.duplicateCurrentCard()
    cc.enterEditMode()
  } catch (err) {
    saveError.value = explain(err, 'Failed to duplicate card')
  }
}

function onRevert() {
  if (isDirty.value && !window.confirm('Discard your unsaved changes?')) return
  cc.revertEdits()
}

// One of the person's own cards that isn't already the one that opens first.
const canMakePrimary = computed(() => {
  const card = currentCard.value
  if (!cc.canSetPrimary || !card) return false
  const link = userCardLinks.value.find(l => l.card_id === card.id)
  return !!link && !link.is_primary
})

// A card on the person's list that isn't theirs (built-in, public, or shared
// with them), when the host can take it off the list.
const canRemoveFromList = computed(() => {
  const card = currentCard.value
  if (!cc.canUnlink || !card || !currentUser.value) return false
  return card.owner_id !== currentUser.value.id && userCardLinks.value.some(l => l.card_id === card.id)
})

async function onMakePrimary() {
  saveError.value = null
  try {
    await cc.makePrimary()
  } catch (err) {
    saveError.value = explain(err, 'Failed to make this card primary')
  }
}

async function onRename() {
  const card = currentCard.value
  if (!card) return
  const name = window.prompt('New name for this card:', card.name || '')
  if (name == null || !name.trim() || name.trim() === card.name) return
  saveError.value = null
  try {
    await cc.renameCard(name)
  } catch (err) {
    saveError.value = explain(err, 'Failed to rename card')
  }
}

async function onDelete() {
  const card = currentCard.value
  const name = card?.name || 'this card'
  if (isSharedResource.value) {
    // Easy to mistake for one's own card in the table (Rick, 2026-10-05), so
    // the name has to be typed.
    const typed = window.prompt(
      `"${name}" is a ${isSystemCard.value ? 'built-in' : 'public'} card that every player can use, ` +
      `not one of yours. Deleting it removes it for everyone, from every player's list, ` +
      `and cannot be undone.` +
      (cc.canUnlink ? `\n\nTo take it off your own list only, cancel and use "Remove from my list".` : '') +
      `\n\nType the card's name to delete it for everyone:`)
    if (typed == null) return
    if (typed.trim() !== String(card?.name || '').trim()) {
      saveError.value = 'Not deleted: the name typed did not match'
      return
    }
  } else if (!confirm(`Delete "${name}"? This cannot be undone.`)) return
  await cc.deleteCurrentCard()
  // A host with a table of cards goes back to it (rather than showing
  // whichever card the editor opens next).
  emit('deleted', card?.id)
}

async function onRemoveFromList() {
  const card = currentCard.value
  if (!card) return
  if (!confirm(`Take "${card.name}" off your list? The card itself is not deleted.`)) return
  if (!(await cc.unlinkCurrentCard())) return
  emit('deleted', card.id)
}

// Which mode the banner shows: a card this person can't change, one they
// can, being looked at, or being edited (with or without unsaved changes).
const mode = computed(() => {
  if (!canEdit.value) return 'readonly'
  if (viewMode.value) return 'view'
  return isDirty.value ? 'unsaved' : 'edit'
})
const MODE_TEXT = {
  readonly: { label: 'View only', text: 'You can look at this card but not change it. Duplicate it to make a copy of your own.' },
  view: { label: 'Viewing', text: 'Nothing on the card can change until you edit it.' },
  edit: { label: 'Editing', text: 'Change anything on the card, then Save.' },
  unsaved: { label: 'Editing · unsaved changes', text: 'Save to keep your changes, or Revert to drop them.' },
}

// What the More menu holds: the card's less common actions
const moreActions = computed(() => [
  canMakePrimary.value && { id: 'primary', label: 'Make primary', title: 'Open this card first from now on', run: onMakePrimary },
  canEdit.value && !isSystemCard.value && { id: 'rename', label: 'Rename', title: 'Give this card a new name', run: onRename },
  canRemoveFromList.value && { id: 'unlist', label: 'Remove from my list', title: 'Take this card off your list; it isn\'t deleted', run: onRemoveFromList },
  // A built-in or public card shows Delete only to an admin (canEdit),
  // behind a stronger warning (onDelete).
  cc.canDelete.value && { id: 'delete', label: 'Delete', danger: true, run: onDelete },
].filter(Boolean))

// Local ref bridging the composable's Set with v-model on SkillPills
const visibleLevelsLocal = ref(visibleLevels.value)
watch(visibleLevelsLocal, (next) => { visibleLevels.value = next })

const isAuthed = computed(() => !!currentUser.value?.id)

const subtitle = computed(() => {
  const card = currentCard.value
  if (!card) return ''
  const user = currentUser.value
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
  // The host may already be opening a card (from its table of cards): then
  // don't load the default over it.
  if (!currentCard.value && !cc.cardLoading.value) {
    await cc.loadCardForCurrentUser()
  }
  if (isAuthed.value && Object.keys(cc.lessonMasteryMap.value).length === 0) {
    await cc.loadMasteryForCurrentUser()
  }
})

// When the user signs in mid-session, refresh
watch(() => currentUser.value?.id, async (uid) => {
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

.card-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 20px;
  margin-bottom: 14px;
}
.tool-group {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
/* The second group sets itself apart: a rule before it */
.tool-group + .tool-group {
  padding-left: 20px;
  border-left: 1px solid var(--card-border, #e0ddd7);
}
@media (max-width: 720px) {
  .tool-group + .tool-group { padding-left: 0; border-left: none; }
}

.menu-wrap {
  position: relative;
  display: inline-flex;
}
.menu-choices {
  position: absolute;
  left: 0;
  top: calc(100% + 2px);
  z-index: 5;
  display: flex;
  flex-direction: column;
  min-width: 170px;
  background: white;
  border: 1px solid var(--card-border, #e0ddd7);
  border-radius: 6px;
  box-shadow: 0 4px 14px rgba(0, 0, 0, .12);
}
.menu-choices button {
  font: inherit;
  font-size: 13px;
  text-align: left;
  padding: 8px 12px;
  border: none;
  background: none;
  cursor: pointer;
}
.menu-choices button:hover { background: #f6faf7; }
.menu-choices button.danger { color: #b91c1c; }
.menu-choices button.danger:hover { background: #fef2f2; }

/* Viewing or editing, across the card (see the template) */
.mode-banner {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 12px;
  padding: 8px 12px;
  margin: 0 0 12px;
  border-radius: 8px;
  border: 1px solid;
  border-left-width: 6px;
  font-size: 13px;
  /* Stays in sight while the card scrolls */
  position: sticky;
  top: 0;
  z-index: 20;
}
.mode-label {
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.mode-text { flex: 1; min-width: 200px; }
.mode-actions { display: flex; gap: 6px; }
.mode-readonly { background: #f3f4f6; border-color: #d1d5db; color: #374151; }
.mode-view { background: #eff6ff; border-color: #93c5fd; color: #1e3a8a; }
.mode-edit { background: var(--green-pale, #d8f3dc); border-color: var(--green-mid, #40916c); color: var(--green-dark, #2d6a4f); }
.mode-unsaved { background: #fef3c7; border-color: #f59e0b; color: #78350f; }

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
.editing-pill,
.dirty-pill {
  display: inline-block;
  font-size: 12px;
  font-weight: 600;
  padding: 2px 10px;
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

.editing-pill {
  background: var(--green-pale, #d8f3dc);
  color: var(--green-dark, #2d6a4f);
}

.dirty-pill {
  background: #fef3c7;
  color: #92400e;
}

.import-notes {
  position: relative;
  margin: -4px 0 12px;
  padding: 8px 32px 8px 12px;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 6px;
  color: #1e3a8a;
  font-size: 13px;
}
.import-notes p { margin: 2px 0; }
.import-notes p.warning { color: #92400e; }
.import-notes-close {
  position: absolute; top: 4px; right: 8px;
  border: none; background: none; font-size: 16px; color: inherit; cursor: pointer;
}
.card-level-pill {
  margin-left: 8px;
  font-size: 12px;
  font-weight: 600;
  padding: 2px 9px;
  border-radius: 999px;
  background: #f1f1ef;
  vertical-align: middle;
}
.card-level-pill.lvl-basic { background: #e8f5e9; color: #1b5e20; }
.card-level-pill.lvl-intermediate { background: #e3f2fd; color: #0d47a1; }
.card-level-pill.lvl-advanced { background: #fff3e0; color: #8a4b00; }
.card-level-pill.lvl-expert { background: #fce4ec; color: #880e4f; }
.regulator-select {
  font: inherit;
  font-size: 13px;
  padding: 3px 6px;
  border: 1px solid var(--card-border, #d1d5db);
  border-radius: 6px;
  background: #fff;
}
.card-problems {
  margin: -4px 0 12px;
  padding: 8px 12px;
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 6px;
  color: #92400e;
  font-size: 13px;
}
.card-problems summary { cursor: pointer; font-weight: 600; }
.card-problems ul { margin: 6px 0 0 18px; }
.card-problems li.error { color: #b91c1c; }
.card-problems .hint { color: #a16207; }
.save-error .btn { margin-left: 8px; }
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

.card-search-input {
  font: inherit;
  font-size: 13px;
  padding: 5px 10px;
  width: 220px;
  max-width: 100%;
  border: 1px solid var(--card-border, #e0ddd7);
  border-radius: 6px;
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
  align-items: flex-start;
  justify-content: center;
  overflow-y: auto;
  z-index: 2000;
  padding: 20px;
}

.modal-content.export-dialog {
  background: white;
  border-radius: var(--radius-card, 10px);
  max-width: 460px;
  width: 100%;
  margin: auto;
  max-height: 90dvh;
  overflow-y: auto;
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
