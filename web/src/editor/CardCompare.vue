<template>
  <div class="compare">
    <div class="compare-head">
      <h1 v-if="!embedded">Compare cards</h1>
      <div class="controls">
        <div class="show" role="radiogroup" aria-label="Rows to show">
          <button v-for="s in SHOW" :key="s.id" role="radio" :aria-checked="show === s.id"
                  :class="{ on: show === s.id }" :title="s.title" @click="show = s.id">{{ s.label }}</button>
        </div>
        <button class="btn" :disabled="!result" @click="print">Print</button>
      </div>
    </div>

    <p v-if="error" class="error">{{ error }}</p>
    <p v-else-if="loading" class="muted">Loading the cards…</p>
    <p v-else-if="cards.length < 2" class="muted">Choose two or more cards in the table of cards to compare them.</p>

    <template v-else>
      <p class="summary muted">
        {{ summaryText }}
        <span class="key"><span class="unrec">not recorded</span>: the card says nothing about it.
          <template v-if="result.cards.length >= 3"><span class="shade-key shade-1">Colours</span><span class="shade-key shade-2">mark</span>
            values that differ from the most common one; cells with the same colour agree.</template></span>
      </p>

      <div class="scroll">
        <table class="grid">
          <thead>
            <tr>
              <th class="label-col">Agreement</th>
              <th v-for="c in result.cards" :key="c.id">
                <a :href="cardLink ? cardLink(c.id) : undefined" @click.prevent="$emit('open', c.id)">{{ c.name }}</a>
                <span v-if="c.names && c.names !== c.name" class="names">{{ c.names }}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr class="level-row">
              <th class="label-col" scope="row">Card level</th>
              <td v-for="(lvl, i) in levels" :key="i">
                <span v-if="lvl" :class="'lvl lvl-' + lvl.band" :title="lvl.why">{{ bandLabel(lvl.band) }} · {{ lvl.level }}</span>
                <span v-else class="unrec">—</span>
              </td>
            </tr>
            <template v-for="section in sections" :key="section.id">
              <tr class="section-row">
                <th :colspan="result.cards.length + 1" scope="rowgroup">{{ section.label }}</th>
              </tr>
              <tr v-for="row in section.rows" :key="row.key" :class="'status-' + row.status">
                <th class="label-col" scope="row" :title="row.paths.join(', ')">{{ row.label }}</th>
                <td v-for="(cell, i) in row.cells" :key="i"
                    :class="[{ long: (cell.text || '').length > 60 }, cell.shade && 'shade-' + ((cell.shade - 1) % SHADES + 1)]"
                    :title="cell.shade ? 'Differs from the most common value; cells with the same colour agree' : undefined">
                  <span v-if="!cell.recorded" class="unrec" title="Not recorded on this card">not recorded</span>
                  <span v-else-if="cell.text == null" class="off" aria-label="No">–</span>
                  <template v-else>{{ cell.text }}</template>
                </td>
              </tr>
            </template>
            <tr v-if="!sections.length">
              <td :colspan="result.cards.length + 1" class="muted">The cards agree on everything they record.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { compareCards } from '../../../js/compareCards.js'
import { cardLevel } from './cardSummary.js'
import { bandLabel } from './levels.js'
import { SECTION_META } from './conventionCatalog.js'

// Cards side by side: one column per card, one row per agreement
// (DESIGN.md, "Comparing cards"). The host routes here with the cards'
// ids (the standalone app at #/compare/<id>,<id>…) and opens a card on
// `open`. Cards are read through the storage adapter only.
const props = defineProps({
  storage: { type: Object, required: true },
  ids: { type: Array, required: true },
  // Inside a host's own page: no page title.
  embedded: { type: Boolean, default: false },
  // The address of a card, for its link.
  cardLink: { type: Function, default: null },
})
defineEmits(['open'])

// How many shade colours the stylesheet has; more values reuse them.
const SHADES = 4

const SHOW = [
  { id: 'differs', label: 'Differences', title: 'Agreements the cards record differently, or some record and others leave blank' },
  { id: 'all', label: 'Everything', title: 'Every agreement any of the cards sets' },
]
const SHOW_KEY = 'convention-card.compare-show'
function savedShow() {
  try { return SHOW.some(s => s.id === localStorage.getItem(SHOW_KEY)) ? localStorage.getItem(SHOW_KEY) : null } catch { return null }
}
const show = ref(savedShow() || 'differs')
watch(show, v => { try { localStorage.setItem(SHOW_KEY, v) } catch { /* private mode */ } })

const cards = ref([])
const loading = ref(true)
const error = ref('')

async function load() {
  loading.value = true
  error.value = ''
  try {
    cards.value = await Promise.all(props.ids.map(id => props.storage.load(id)))
  } catch (err) {
    error.value = err.message || 'Could not read the cards'
  } finally {
    loading.value = false
  }
}
watch(() => props.ids.join(','), load, { immediate: true })

const result = computed(() => (cards.value.length >= 2 ? compareCards(cards.value) : null))
const levels = computed(() => cards.value.map(c => cardLevel(c.card_data || {})))

const counts = computed(() => {
  const rows = result.value?.rows || []
  return {
    differs: rows.filter(r => r.status === 'differs').length,
    blank: rows.filter(r => r.status === 'differs' && r.blanks).length,
  }
})

const summaryText = computed(() => {
  const { differs, blank } = counts.value
  let text = `${differs} ${differs === 1 ? 'agreement differs' : 'agreements differ'}`
  if (blank) text += `; on ${blank} of them, some cards record nothing`
  return `${text}.`
})

const SECTION_LABELS = Object.fromEntries(SECTION_META.map(s => [s.id, s.label]))
const sectionLabel = id => SECTION_LABELS[id] || (id.charAt(0).toUpperCase() + id.slice(1).replace(/_/g, ' '))

const sections = computed(() => {
  const visible = (result.value?.rows || []).filter(r =>
    show.value === 'all' || r.status === 'differs')
  const out = []
  for (const row of visible) {
    let section = out[out.length - 1]
    if (!section || section.id !== row.section) {
      section = { id: row.section, label: sectionLabel(row.section), rows: [] }
      out.push(section)
    }
    section.rows.push(row)
  }
  return out
})

const print = () => window.print()
</script>

<style scoped>
.compare-head { display: flex; gap: 12px; align-items: center; justify-content: space-between; flex-wrap: wrap; margin-bottom: 8px; }
.compare-head h1 { font-family: var(--font-heading); font-size: 24px; margin: 0; }
.controls { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.show { display: inline-flex; border: 1px solid var(--card-border); border-radius: var(--radius-button); overflow: hidden; background: #fff; }
.show button { font: inherit; font-size: 13px; padding: 6px 10px; border: none; background: none; cursor: pointer; color: var(--text-secondary); }
.show button + button { border-left: 1px solid var(--card-border); }
.show button.on { background: var(--green-pale); color: var(--green-dark); font-weight: 600; }
.btn { font: inherit; font-size: 14px; padding: 6px 14px; border: 1px solid var(--card-border); border-radius: var(--radius-button); background: #fff; cursor: pointer; }
.btn:disabled { opacity: 0.5; cursor: default; }
.summary { margin: 0 0 10px; }
.key { display: block; font-size: 13px; margin-top: 2px; }

.scroll { overflow-x: auto; background: #fff; border: 1px solid var(--card-border); border-radius: var(--radius-card); }
.grid { border-collapse: collapse; font-size: 14px; min-width: 100%; }
.grid th, .grid td { padding: 7px 10px; border-bottom: 1px solid #efede8; text-align: left; vertical-align: top; }
.grid thead th { position: sticky; top: 0; background: #fff; font-weight: 600; border-bottom: 1px solid var(--card-border); }
.grid thead th, .grid td { min-width: 140px; max-width: 230px; overflow-wrap: anywhere; }
.grid thead th a { color: var(--green-dark); text-decoration: none; }
.grid thead th a:hover { text-decoration: underline; }
.names { display: block; font-weight: 400; font-size: 12px; color: var(--text-secondary); }
.label-col { position: sticky; left: 0; z-index: 1; background: #fff; font-weight: 500; min-width: 200px; max-width: 280px; }
thead .label-col { z-index: 2; color: var(--text-secondary); font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; }
.section-row th { background: var(--bg-warm); font-family: var(--font-heading); font-size: 15px; font-weight: 600; padding-top: 12px; }
.status-same .label-col { color: var(--text-secondary); }
td.long { font-size: 13px; }
.shade-1 { background: #fff1d6; box-shadow: inset 3px 0 0 #e8a33d; }
.shade-2 { background: #e2efff; box-shadow: inset 3px 0 0 #4a86d8; }
.shade-3 { background: #f1e6fb; box-shadow: inset 3px 0 0 #9b6bd1; }
.shade-4 { background: #dff5ee; box-shadow: inset 3px 0 0 #3aa37f; }
.shade-key { padding: 0 5px; border-radius: 3px; margin-right: 3px; }
.unrec { color: var(--text-muted); font-style: italic; font-size: 13px; }
.off { color: var(--text-muted); }
.lvl { font-size: 12px; padding: 0 6px; border-radius: 999px; background: #f1f1ef; white-space: nowrap; font-weight: 600; }
.lvl-basic { background: #e8f5e9; } .lvl-intermediate { background: #e3f2fd; }
.lvl-advanced { background: #fff3e0; } .lvl-expert { background: #fce4ec; }
.muted { color: var(--text-secondary); font-size: 14px; }
.error { color: #b91c1c; }

@media (max-width: 600px) {
  .label-col { min-width: 120px; max-width: 150px; }
  .grid thead th, .grid td { min-width: 120px; }
}

@media print {
  .controls { display: none; }
  .scroll { overflow: visible; border: none; }
  .grid { font-size: 11px; }
  .grid thead th, .label-col { position: static; }
  .grid tr { break-inside: avoid; }
  td[class*="shade-"] { font-weight: 700; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
</style>
