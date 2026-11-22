<template>
  <div class="catalog">
    <ChoiceDialog ref="dialog" />
    <PdfDialog ref="pdfDialog" />
    <p v-if="notice.message" class="notice" :class="{ error: notice.error }" role="status">
      {{ notice.message }}
    </p>

    <section class="intro">
      <h1 v-if="!embedded">Convention card</h1>
      <details class="about" :open="aboutOpen" @toggle="onToggle">
        <summary>
          <span class="about-title">About this editor</span>
          <span class="about-hint">card layouts, import and export, where your cards are kept, BBO</span>
        </summary>
        <p class="lede">
          Build and edit your partnerships' convention cards, print them, and move them between BBO,
          BridgeWinners, Bridgodex, BBA and Bridge Classroom.
        </p>
        <div class="facts">
          <div class="fact">
            <h2>Card layouts</h2>
            <p>ACBL Classic and ACBL New, to print or as PDFs, flat or fillable. Each PDF carries the card inside it, so it
              comes back complete, even after a box was changed by hand.</p>
            <p class="flag">WBF: planned.</p>
          </div>
          <div class="fact">
            <h2>Where your cards are kept</h2>
            <template v-if="storagePlace === 'account'">
              <p class="account">
                <span class="avatar" :title="userName">{{ userInitials }}</span>
                <span>Saved in <strong>{{ userName || 'your' }}</strong>'s Bridge Classroom account.</span>
              </p>
              <p>You can also keep a copy on your drive: <em>Export PDF</em> or <em>Export…</em>,
                and <em>Import</em> brings it back.</p>
            </template>
            <template v-else>
              <p><strong>In this browser</strong>, with no account. Clearing the browser's data deletes
                them.<template v-if="isSafari"> <strong>In Safari this is short-term</strong>: Safari may
                delete a site's stored data after a week or so without a visit.</template></p>
              <p>To keep a card safe:</p>
              <ol class="places">
                <li><em>Save to Bridge Classroom</em>, if you have an account there: on any device.</li>
                <li><em>Export PDF</em> or <em>Export…</em> to a file on your drive;
                  <em>Import</em> brings it back.</li>
              </ol>
            </template>
            <p class="flag">Coming to Bridge Classroom: cards shared between partners, which either of
              you can edit.</p>
          </div>
          <div class="fact">
            <h2>Import and export</h2>
            <table class="formats">
              <thead><tr><th></th><th>Import</th><th>Export</th></tr></thead>
              <tbody>
                <tr><td>Filled-in ACBL PDFs</td><td class="yes">✓</td><td class="yes">✓</td></tr>
                <tr><td><a href="https://www.bridgebase.com/" target="_blank" rel="noopener">BBO</a></td><td class="yes">✓</td><td class="yes">✓</td></tr>
                <tr><td><a href="https://bridgewinners.com/" target="_blank" rel="noopener">BridgeWinners</a> (Swan)</td><td class="yes">✓</td><td class="yes">✓</td></tr>
                <tr><td><a href="https://bridgodex.com/" target="_blank" rel="noopener">Bridgodex</a></td><td class="yes">✓</td><td class="yes">✓</td></tr>
                <tr><td><a href="https://sites.google.com/view/bbaenglish" target="_blank" rel="noopener">BBA</a> (<code>.bbsa</code>)</td><td class="yes">✓</td><td class="yes">✓</td></tr>
              </tbody>
            </table>
            <p class="flag">Our PDFs are flat, so they look the same in every PDF viewer, or fillable when you
              ask; either way the card travels inside, and Import reads it back. Import also reads a fillable ACBL Classic or New card filled in
              elsewhere. BBO cards go through the Better BBO extension, Bridgodex cards through its own import, and BridgeWinners cards through its card editor's Import from Swan.</p>
          </div>
          <div class="fact">
            <h2>On BBO</h2>
            <p>The <a href="https://github.com/bridge-craftwork/Better-BBO-Convention-Card" target="_blank" rel="noopener">Better BBO Convention Card</a>
              browser extension improves BBO's convention card pages.</p>
            <p class="flag">A button to open a BBO card here: on its way.</p>
          </div>
        </div>
        <p class="more">
          More in the <a href="https://bridge-craftwork.com/docs/card/" target="_blank" rel="noopener">guide</a>; for programs, the
          <a href="https://bridge-craftwork.com/card/reference.txt" target="_blank" rel="noopener">card reference</a>.
        </p>
      </details>
      <!-- Where the cards are, even with "About" closed. -->
      <p v-if="!aboutOpen" class="where-line">
        <template v-if="storagePlace === 'account'">
          <span class="avatar small" :title="userName">{{ userInitials }}</span>
          Saved in <strong>{{ userName || 'your' }}</strong>'s Bridge Classroom account.
        </template>
        <template v-else>
          Your cards are stored <strong>in this browser</strong>: use <em>Export all</em> to keep a copy.
        </template>
      </p>
    </section>

    <section class="cards">
      <div class="cards-head">
        <h2>Your cards</h2>
        <button v-if="sort.length" class="sort-reset" type="button" title="Primary card first, then your own cards by name" @click="setSort([])">Reset sort</button>
        <div class="cards-actions">
          <button v-if="canCreate" class="btn btn-primary" :disabled="busy" @click="onNew">New card</button>
          <button v-if="canCreate" class="btn" :disabled="busy" @click="fileInput?.click()" title="One card, or an Export all file">Import</button>
          <button v-if="canCreate" class="btn" :disabled="busy || !ownCards.length" @click="onExportAll" title="Every card in one file, which Import reads back">Export all</button>
          <button v-if="compare" class="btn" :disabled="selected.length < 2"
                  :title="selected.length < 2 ? 'Tick two or more cards to compare them' : 'See where the ticked cards differ'"
                  @click="$emit('compare', selected)">Compare<template v-if="selected.length"> ({{ selected.length }})</template></button>
          <!-- No accept filter: a file picker greys out a card whose file lacks the
               extension it expects. importCard tells the format from the bytes. -->
          <input
            ref="fileInput"
            type="file"
            style="display:none"
            @change="onFile"
          />
        </div>
      </div>
      <p v-if="error" class="error">{{ error }}</p>
      <p v-if="loading" class="muted">Loading your cards…</p>

      <table v-else class="card-table" :class="{ picking: compare }">
        <thead>
          <tr>
            <th v-if="compare" class="pick-col"><span class="sr-only">Compare</span></th>
            <th v-for="c in sortColumns" :key="c.key" :aria-sort="ariaSort(c)">
              <button class="sort-btn" type="button" :title="`Sort by ${c.label}`" @click="setSort(nextSort(sort, c))">
                {{ c.label }}<span v-if="sortMark(c)" class="sort-mark" :class="{ then: sort[0].key !== c.key }" aria-hidden="true">{{ sortMark(c) }}</span>
              </button>
            </th>
            <th class="pdf-col"><span class="sr-only">Print or PDF</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.id" class="card-row" tabindex="0"
              @click="$emit('open', row.id)" @keydown.enter="$emit('open', row.id)">
            <td v-if="compare" class="pick-col" @click.stop>
              <input type="checkbox" :checked="selected.includes(row.id)" :aria-label="`Compare ${row.name}`"
                     @change="togglePick(row.id)" />
            </td>
            <td class="name">
              <a :href="cardLink ? cardLink(row.id) : undefined" @click.prevent="$emit('open', row.id)">{{ row.name }}</a>
              <span v-if="row.primary" class="tag" title="Opens first">primary</span>
              <span v-if="row.role === 'editor'" class="tag share-tag" title="Shared with you; you can edit it">Editor<template v-if="row.ownerName"> · by {{ row.ownerName }}</template></span>
              <span v-else-if="row.role === 'viewer'" class="tag share-tag" title="Shared with you to read; duplicate it to make your own copy">Read only<template v-if="row.ownerName"> · by {{ row.ownerName }}</template></span>
              <span v-else-if="row.shared" class="tag share-tag" title="You share this card with a partner">Shared</span>
              <span v-if="row.readOnly" class="tag muted-tag" title="Duplicate it to make your own copy">sample</span>
              <span v-else-if="row.common" class="tag muted-tag"
                    title="Every player can use it; it isn't yours. Open it to take it off your list, or Duplicate it to make your own copy">{{ row.common }}</span>
            </td>
            <td>{{ row.names || '—' }}</td>
            <td>{{ row.system || '—' }}</td>
            <td class="card-level">
              <span v-if="row.cardLevel" :class="'lvl lvl-' + row.cardLevel.band" :title="row.cardLevel.why">
                {{ bandLabel(row.cardLevel.band).charAt(0) }}-{{ row.cardLevel.level }}
              </span>
              <span v-else class="muted">—</span>
            </td>
            <td>
              <div v-if="row.levels.total" class="levels" :title="`${row.levels.total} conventions; the highest is level ${row.levels.highest}`">
                <span class="total">{{ row.levels.total }}</span>
                <span v-for="b in BANDS" v-show="row.levels.bands[b.name]" :key="b.name"
                      :class="'lvl lvl-' + b.name" :title="`${row.levels.bands[b.name]} ${b.label.toLowerCase()}`">{{ row.levels.bands[b.name] }}</span>
              </div>
              <span v-else class="muted">none ticked</span>
            </td>
            <td v-for="d in columns" :key="d.key" class="nowrap" :title="d.title?.(row.data) || undefined">{{ d.value(row.data) || '—' }}</td>
            <td class="nowrap" :title="row.updated ? new Date(row.updated).toLocaleString() : undefined">{{ lastEdit(row.updated) || '—' }}</td>
            <td class="pdf-col" @click.stop>
              <span class="pdf-actions" role="group" :aria-label="`${row.name}: print or PDF`">
                <span v-if="exporting === row.id" class="muted">Preparing…</span>
                <template v-else>
                  <button v-for="a in PDF_ACTIONS" :key="a.id" class="pdf-btn" :title="a.title(row.name)" :aria-label="a.title(row.name)"
                          @click="pdfAction(row.id, a.id)">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" v-html="a.icon" />
                  </button>
                </template>
              </span>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-if="!loading && !rows.length" class="muted">
        No cards yet: start a <strong>New card</strong> or <strong>Import</strong> one.
      </p>
      <p v-if="!loading && rows.length === 1 && rows[0].readOnly" class="muted">
        Only the sample so far: open it and use <strong>Duplicate</strong> to make it yours, or start a
        <strong>New card</strong>.
      </p>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { summarize, distinguishing, lastEdit, SORT_BEFORE, SORT_AFTER, nextSort, sortRows } from './cardSummary.js'
import { bandLabel } from './levels.js'
import { useCardEditor } from './useCardEditor.js'
import { importCards } from '../../../js/importCard.js'
import { exportAll } from '../../../js/cardBundle.js'
import { mergeImported } from './importMerge.js'
import { schema3Storage } from './storedForm.js'
import { importReportNotes } from './importReport.js'
import { askInDialog, tellMatched } from './importDialogs.js'
import ChoiceDialog from './ChoiceDialog.vue'
import PdfDialog from './PdfDialog.vue'
import { renderPdf, downloadPdf, openPreviewTab, showInTab, printBytes, printsInFrame } from './pdfActions.js'
import { LEVEL_BANDS } from '../../../js/spec.js'

// The editor's home page: what it does, and a table of the person's cards.
// A host shows it in place of the editor until a card is chosen, and opens
// that card on `open` (the standalone app at #/card/<id>, Bridge Classroom
// at /convention-card?card=<id>). It reads and creates cards through the
// storage adapter and the shared editor state only (DESIGN.md, "The editor").
const props = defineProps({
  storage: { type: Object, required: true },
  overlays: { type: Object, default: null },
  // The read-only sample card's id, listed after the person's own cards.
  sampleId: { type: String, default: null },
  // Inside a host's own page: no page title.
  embedded: { type: Boolean, default: false },
  // Where the host keeps cards: 'browser' (the standalone app's IndexedDB)
  // or 'account' (a host with accounts, such as Bridge Classroom, whose
  // storage.user names the player).
  storagePlace: { type: String, default: 'browser' },
  // The address of a card, for its link (so it can open in a new tab).
  cardLink: { type: Function, default: null },
  // Tick cards and compare them: the host routes `compare` (the ids, in
  // the table's order) to its CardCompare.
  compare: { type: Boolean, default: false },
})
const emit = defineEmits(['open', 'compare'])

const cc = useCardEditor(props.storage, props.overlays || undefined)
const BANDS = LEVEL_BANDS
const cards = ref([])
const loading = ref(true)
const busy = ref(false)
const error = ref('')
const notice = reactive({ message: '', error: false })
const fileInput = ref(null)
const dialog = ref(null)
const canCreate = computed(() => !!props.storage.user?.value)

// "About this editor": open for someone with no cards of their own yet;
// after that, as they last left it (a per-browser convenience).
const ABOUT_KEY = 'convention-card.about-open'
function savedAbout() {
  try { const v = localStorage.getItem(ABOUT_KEY); return v == null ? null : v === '1' } catch { return null }
}
const aboutOpen = ref(savedAbout() ?? true)
function onToggle(event) {
  aboutOpen.value = event.target.open
  try { localStorage.setItem(ABOUT_KEY, aboutOpen.value ? '1' : '0') } catch { /* private mode */ }
}
// The signed-in player, for an account host: a circle with their initials,
// as Bridge Classroom shows its players.
const userName = computed(() => {
  const u = props.storage.user?.value
  return u ? `${u.firstName || ''} ${u.lastName || ''}`.trim() : ''
})
const userInitials = computed(() => {
  const u = props.storage.user?.value
  return `${(u?.firstName || '').charAt(0)}${(u?.lastName || '').charAt(0)}`.toUpperCase() || '?'
})

const hasOwnCards = computed(() => cards.value.some(c => !c.readOnly))
watch(hasOwnCards, own => { if (savedAbout() == null) aboutOpen.value = !own })

// Safari deletes a site's script-written storage after about a week without
// a visit, so its users get a warning about keeping cards in the browser.
const isSafari = typeof navigator !== 'undefined'
  && /^((?!chrome|chromium|crios|fxios|edg|android).)*safari/i.test(navigator.userAgent)

async function load() {
  loading.value = true
  error.value = ''
  try {
    const links = canCreate.value ? await props.storage.listLinks() : []
    const own = await Promise.all(links.map(async l => ({
      ...(await props.storage.load(l.card_id)),
      primary: !!l.is_primary,
      role: l.role || null,
      ownerName: l.owner_name || null,
      shared: !!l.shared,
    })))
    // The person's own cards first, then cards shared with them, then
    // built-in and public cards on their list.
    own.sort((a, b) => (b.primary - a.primary) || (group(a) - group(b))
      || String(a.name).localeCompare(String(b.name)))
    const sample = props.sampleId ? [{ ...(await props.storage.load(props.sampleId)), readOnly: true }] : []
    cards.value = [...own, ...sample]
  } catch (err) {
    error.value = err.message || 'Could not read your cards'
  } finally {
    loading.value = false
  }
}

// A card every player can use rather than one of the person's: 'built-in'
// (no owner) or 'public'.
const commonKind = c => (c.owner_id == null ? 'built-in' : c.visibility === 'public' ? 'public' : null)
const group = c => (commonKind(c) && c.role !== 'owner' ? 2 : c.role === 'editor' || c.role === 'viewer' ? 1 : 0)

const unsorted = computed(() => cards.value.map(c => ({
  ...summarize(c),
  primary: !!c.primary,
  role: c.role,
  ownerName: c.ownerName,
  shared: c.shared,
  readOnly: !!c.readOnly,
  common: commonKind(c),
})))

// The sort: clicking a column makes it the first key and keeps the earlier
// ones behind it. A per-browser convenience, kept because opening a card
// leaves this page.
const SORT_KEY = 'convention-card.list-sort'
function savedSort() {
  try {
    const saved = JSON.parse(localStorage.getItem(SORT_KEY))
    return Array.isArray(saved) ? saved.filter(s => s && typeof s.key === 'string') : []
  } catch { return [] }
}
const sort = ref(savedSort())
function setSort(next) {
  sort.value = next
  try { localStorage.setItem(SORT_KEY, JSON.stringify(next)) } catch { /* private mode */ }
}
const sortColumns = computed(() => [
  ...SORT_BEFORE,
  ...columns.value.map(d => ({ key: d.key, label: d.label, value: row => d.value(row.data) })),
  ...SORT_AFTER,
])
// The sample stays after the person's own cards, however they're sorted.
const rows = computed(() => [
  ...sortRows(unsorted.value.filter(r => !r.readOnly), sort.value, sortColumns.value),
  ...unsorted.value.filter(r => r.readOnly),
])
const showingSort = computed(() => sort.value.filter(s => sortColumns.value.some(c => c.key === s.key)))
const arrow = s => (s.dir === 'desc' ? '▼' : '▲')
// An arrow on the first two keys, the second one faint
function sortMark(column) {
  const at = showingSort.value.findIndex(s => s.key === column.key)
  return at === 0 || at === 1 ? arrow(showingSort.value[at]) : ''
}
function ariaSort(column) {
  const first = showingSort.value[0]
  if (first?.key !== column.key) return undefined
  return first.dir === 'desc' ? 'descending' : 'ascending'
}

// Print, preview or download a card from the table, asking what the
// editor's buttons ask (PdfDialog.vue). Needs the host to have told the
// library where its templates are (setAssetLoader).
// Icon paths, in the style of the old PDF button's (Lucide's shapes)
const PDF_ACTIONS = [
  { id: 'print', title: name => `Print ${name}`,
    icon: '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>' },
  { id: 'export', title: name => `Download ${name} as a PDF`,
    icon: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>' },
  { id: 'preview', title: name => `Preview ${name}'s PDF in a new tab`,
    icon: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>' },
]
const pdfDialog = ref(null)
const exporting = ref(null)
async function pdfAction(id, action) {
  const row = cards.value.find(c => c.id === id)
  if (!row) return
  const card = { id: row.id, name: row.name, description: row.description || null, updated_at: row.updated_at || null, card_data: row.card_data || {} }
  const options = await pdfDialog.value.ask({ action, card })
  if (!options) return
  // A tab for the preview (or for printing where a frame can't), opened in the click
  const tab = action === 'preview' || (action === 'print' && !printsInFrame()) ? openPreviewTab() : null
  if (action === 'preview' && !tab) {
    Object.assign(notice, { message: 'Your browser blocked the preview\'s new tab. Allow pop-ups for this site and try again.', error: true })
    return
  }
  exporting.value = id
  try {
    if (action === 'export') await downloadPdf(card, options)
    else if (action === 'preview') showInTab(tab, await renderPdf(card, options))
    else printBytes(await renderPdf(card, options), tab)
  } catch (err) {
    tab?.close()
    const stale = /dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(err?.message || '')
    Object.assign(notice, {
      message: stale ? 'This page is older than the site: reload it and try again.' : `Could not make ${card.name}'s PDF: ${err.message}`,
      error: true,
    })
  } finally {
    exporting.value = null
  }
}
const columns = computed(() => distinguishing(cards.value))

// Cards ticked for Compare, kept in the table's order.
const picked = ref(new Set())
const selected = computed(() => rows.value.map(r => r.id).filter(id => picked.value.has(id)))
function togglePick(id) {
  const next = new Set(picked.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  picked.value = next
}

async function onNew() {
  busy.value = true
  try {
    const id = await cc.createCard({ name: 'My convention card', cardData: { metadata: { name: 'My convention card' } } })
    cc.enterEditMode()
    emit('open', id)
  } catch (err) {
    Object.assign(notice, { message: err.message || 'Could not create a card', error: true })
  } finally {
    busy.value = false
  }
}

const ownCards = computed(() => cards.value.filter(c => !c.readOnly))

async function onFile(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  busy.value = true
  try {
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
    const input = isPdf ? await file.arrayBuffer() : await file.text()
    const records = await importCards(input, { name: file.name.replace(/\.[^.]*$/, '') })
    const merged = await mergeImported(records, schema3Storage(props.storage), askInDialog(dialog.value))
    // What the import ticked on its own, shown above the card it opens.
    cc.importNotes.value = importReportNotes(records)
    cc.importNotesFor.value = merged.lastId || null
    await cc.loadUserCardLinks()
    // One card: open it, as before. Several: stay on the table and say what happened.
    // A pop-up only when imported cards met ones already here without
    // asking (replaced by a newer copy, or the same): new cards, and ones
    // the person was asked about, need no message.
    await tellMatched(dialog.value, merged)
    if (records.length === 1 && merged.lastId) {
      emit('open', merged.lastId)
      return
    }
    await load()
  } catch (err) {
    Object.assign(notice, { message: `Could not import ${file.name}: ${err.message}`, error: true })
  } finally {
    busy.value = false
  }
}

// "Export all": the person's own cards (not the sample) in one file.
function onExportAll() {
  const bundle = exportAll(ownCards.value)
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `convention-cards-${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

onMounted(load)
defineExpose({ reload: load })
</script>

<style scoped>
.catalog { display: flex; flex-direction: column; gap: 20px; }
h1 { font-family: var(--font-heading); font-size: 32px; margin: 8px 0 6px; color: var(--green-dark); }
h2 { font-family: var(--font-heading); font-size: 18px; margin: 0 0 6px; }
.lede { font-size: 17px; color: var(--text-secondary); margin: 0 0 16px; max-width: 760px; line-height: 1.5; }
.facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; }
.fact { background: #fff; border: 1px solid var(--card-border); border-radius: var(--radius-card); padding: 14px 16px; }
.fact p { margin: 0; font-size: 14px; line-height: 1.55; color: var(--text-primary); }
.more { font-size: 14px; color: var(--text-secondary); margin: 10px 0 0; }
.about { background: transparent; }
.about summary { cursor: pointer; display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap; padding: 4px 0 10px; list-style: none; }
.about summary::-webkit-details-marker { display: none; }
.about summary::before { content: '▸'; color: var(--green-dark); width: 10px; }
.about[open] summary::before { content: '▾'; }
.about-title { font-family: var(--font-heading); font-weight: 600; font-size: 17px; color: var(--green-dark); }
.about-hint { font-size: 13px; color: var(--text-secondary); }
.flag { font-size: 13px; color: #8a4b00; margin-top: 6px !important; }
.formats { border-collapse: collapse; font-size: 13px; width: 100%; }
.formats th { text-align: left; font-weight: 600; color: var(--text-secondary); padding: 2px 6px; }
.formats td { padding: 3px 6px; border-top: 1px solid #efede8; }
.formats .yes { color: var(--green-dark); font-weight: 600; }
.places { margin: 0 0 6px; padding-left: 18px; font-size: 14px; line-height: 1.5; }
.fact p + p { margin-top: 6px; }
.account { display: flex; gap: 8px; align-items: center; }
.where-line { margin: -4px 0 0; font-size: 14px; color: var(--text-secondary); line-height: 24px; }
.avatar.small { width: 24px; height: 24px; font-size: 10px; vertical-align: middle; margin-right: 6px; }
.avatar { flex: none; width: 30px; height: 30px; border-radius: 50%; background: var(--green-dark); color: #fff; font-weight: 700; font-size: 12px; display: inline-flex; align-items: center; justify-content: center; }
.places li { margin-bottom: 4px; }
a { color: var(--green-dark); }
code { font-size: 13px; }

.cards { background: #fff; border: 1px solid var(--card-border); border-radius: var(--radius-card); padding: 16px; }
.cards-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 10px; }
.cards-actions { display: flex; gap: 8px; }
.btn { font: inherit; font-size: 14px; padding: 7px 14px; border: 1px solid var(--card-border); border-radius: var(--radius-button); background: #fff; cursor: pointer; }
.btn-primary { background: var(--green-dark); border-color: var(--green-dark); color: #fff; font-weight: 600; }

.card-table { width: 100%; border-collapse: collapse; font-size: 14px; }
.card-table th { text-align: left; font-weight: 600; color: var(--text-secondary); font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; padding: 8px 10px; border-bottom: 1px solid var(--card-border); }
.sort-btn { all: unset; cursor: pointer; white-space: nowrap; }
.sort-btn:hover { color: var(--green-dark); }
.sort-btn:focus-visible { outline: 2px solid var(--green-mid); outline-offset: 2px; }
.sort-mark { margin-left: 4px; font-size: 10px; color: var(--green-dark); }
.sort-mark.then { opacity: 0.45; }
.sort-reset { font: inherit; font-size: 13px; margin-right: auto; padding: 0; border: none; background: none; color: var(--green-dark); text-decoration: underline; cursor: pointer; }
.card-table td { padding: 10px; border-bottom: 1px solid #efede8; vertical-align: top; }
.card-row { cursor: pointer; }
.card-row:hover, .card-row:focus { background: #f6faf7; outline: none; }
.name a { font-weight: 600; text-decoration: none; }
.tag { margin-left: 6px; font-size: 11px; padding: 1px 7px; border-radius: 999px; background: var(--green-pale); color: var(--green-dark); }
.muted-tag { background: #eee; color: var(--text-secondary); }
.levels { display: flex; flex-wrap: nowrap; gap: 4px; align-items: baseline; }
.levels .lvl { min-width: 14px; text-align: center; }
.total { font-weight: 600; }
.bands { display: inline-flex; gap: 4px; flex-wrap: wrap; }
.lvl { font-size: 12px; padding: 0 6px; border-radius: 999px; background: #f1f1ef; white-space: nowrap; }
.card-level .lvl { font-weight: 600; }
.lvl-basic { background: #e8f5e9; } .lvl-intermediate { background: #e3f2fd; }
.lvl-advanced { background: #fff3e0; } .lvl-expert { background: #fce4ec; }
.highest { font-size: 12px; color: var(--text-secondary); }
.nowrap { white-space: nowrap; }
.share-tag { background: #ede7f6; color: #4527a0; }
.pick-col { width: 1%; padding-right: 0; }
.pick-col input { width: 16px; height: 16px; cursor: pointer; accent-color: var(--green-dark); }
.pdf-col { position: relative; width: 1%; white-space: nowrap; text-align: right; }
.pdf-actions { display: inline-flex; gap: 4px; }
.pdf-btn { font: inherit; font-size: 12px; display: inline-flex; gap: 4px; align-items: center; padding: 5px 6px; border: 1px solid var(--card-border); border-radius: var(--radius-button); background: #fff; color: var(--text-secondary); cursor: pointer; }
.pdf-btn:hover { color: var(--green-dark); border-color: var(--green-mid); }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
.muted { color: var(--text-secondary); font-size: 14px; }
.error { color: #b91c1c; }
.notice { margin: 0; padding: 8px 14px; border-radius: var(--radius-card); background: #fff; border: 1px solid var(--card-border); font-size: 14px; }
.notice.error { background: #fee2e2; color: #991b1b; }

@media (max-width: 720px) {
  .card-table th:nth-child(n+4), .card-table td:nth-child(n+4) { display: none; }
  .card-table.picking th:nth-child(4), .card-table.picking td:nth-child(4) { display: table-cell; }
}
</style>
