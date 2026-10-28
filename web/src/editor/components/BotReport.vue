<template>
  <section class="bot-report" :aria-label="`${botName} report`">
    <header>
      <h3>{{ botName }} on this card</h3>
      <p class="version">
        <template v-if="info">{{ botName }} {{ info.version }}<template v-if="info.rules"> · rules {{ info.rules }}</template></template>
        <template v-else-if="error">{{ error }}</template>
        <template v-else>Loading {{ botName }}…</template>
        <a v-if="info?.statusUrl" :href="info.statusUrl" target="_blank" rel="noopener">{{ botName }}’s status</a>
      </p>
      <p v-if="report" class="summary">
        Reads <strong>{{ report.read }}</strong> of the {{ report.total }} bidding settings this card switches on
        (<strong>{{ Math.round(report.score * 100) }}%</strong>).
        <template v-if="report.other">{{ report.other }} more are cardplay and notes, for people.</template>
      </p>
      <div v-if="report" class="filters">
        <button v-for="f in FILTERS" :key="f.id" :class="{ on: filter === f.id }" @click="filter = f.id">
          {{ f.label }} <span class="n">{{ countOf(f.id) }}</span>
        </button>
        <span class="legend">
          <span v-for="s in STATUSES" :key="s.id" :class="'key ' + s.id"><span class="glyph">{{ s.glyph }}</span> {{ s.label }}</span>
        </span>
      </div>
    </header>

    <template v-if="report">
      <div v-for="band in bands" :key="band.id" class="band">
        <h4>{{ band.label }}</h4>
        <div class="tiles">
          <button v-for="t in band.tiles" :key="t.id" :class="['tile', t.status, { open: openId === t.id }]"
                  :title="tileTitle(t)" @click="openId = openId === t.id ? null : t.id">
            <span class="glyph">{{ glyphOf(t.status) }}</span>
            <span class="name">{{ nameOf(t) }}</span>
            <span v-if="t.fields.length > 1" class="count">{{ t.fields.filter(f => f.read).length }}/{{ t.fields.length }}</span>
          </button>
        </div>
        <div v-if="openTile && band.tiles.includes(openTile)" class="detail">
          <div class="detail-head">
            <strong>{{ nameOf(openTile) }}</strong>
            <span class="detail-status">{{ tileTitle(openTile) }}</span>
            <a v-if="openTile.convention && info?.statusUrl" :href="`${info.statusUrl}#tile=${encodeURIComponent(openTile.id)}`"
               target="_blank" rel="noopener">On {{ botName }}’s status page</a>
          </div>
          <ul v-if="openTile.fields.length">
            <li v-for="f in openTile.fields" :key="f.path" :class="{ read: f.read }">
              <span class="mark">{{ f.read ? '✓' : '✗' }}</span> {{ f.label }}
            </li>
          </ul>
          <p v-else class="hint">The card names it in other agreements; no setting says how it is played.</p>
        </div>
      </div>
      <p v-if="!bands.length" class="hint">Nothing to show.</p>
    </template>
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { botReport } from '../../../../js/botReport.js'
import { SECTION_META } from '../conventionCatalog.js'
import { LEVEL_BANDS } from '../../../../js/spec.js'

// A bidding bot's report on the card: which of its conventions the bot's
// rules read, one tile each, as Rusty's status page shows the system. The
// bot comes from the host (`overlays.bot`: useCardEditor.js); the editor
// never runs or fetches one itself.
const props = defineProps({
  cardData: { type: Object, default: null },
  bot: { type: Object, required: true },
})

const botName = computed(() => props.bot.name || 'The bot')
const info = ref(null)
const coverage = ref(null)
const error = ref('')
const filter = ref('attention')
const openId = ref(null)

props.bot.info().then(i => { info.value = i }).catch(e => { error.value = e.message || String(e) })

let timer = null
let asked = 0
watch(() => props.cardData, data => {
  clearTimeout(timer)
  if (!data) return
  timer = setTimeout(async () => {
    const mine = ++asked
    try {
      const c = await props.bot.coverage(data)
      if (mine === asked) { coverage.value = c; error.value = '' }
    } catch (e) {
      if (mine === asked) error.value = e.message || String(e)
    }
  }, coverage.value ? 400 : 0)
}, { immediate: true, deep: true })

const report = computed(() => (coverage.value ? botReport(props.cardData, coverage.value) : null))

const STATUSES = [
  { id: 'plays', glyph: '✓', label: 'plays it' },
  { id: 'partial', glyph: '◐', label: 'some settings' },
  { id: 'gap', glyph: '✗', label: 'not read' },
  { id: 'listed', glyph: '?', label: 'named only' },
]
const glyphOf = s => STATUSES.find(x => x.id === s)?.glyph || ''
const FILTERS = [
  { id: 'attention', label: 'Needs work', keep: t => t.status !== 'plays' },
  { id: 'all', label: 'Everything', keep: () => true },
]
const keep = id => FILTERS.find(f => f.id === id).keep
const countOf = id => report.value?.tiles.filter(t => t.convention).filter(keep(id)).length ?? 0

const SECTION_LABELS = Object.fromEntries(SECTION_META.map(s => [s.id, s.label]))
const nameOf = t => (t.convention ? t.name : `Other ${SECTION_LABELS[t.id.slice(8)] || t.name.replace(/^Other | settings$/g, '')}`)
function tileTitle(t) {
  const n = t.fields.filter(f => f.read).length
  if (t.status === 'listed') return `Named in other agreements: ${botName.value} has no setting to read`
  if (t.status === 'plays') return t.fields.length > 1 ? `Reads all ${t.fields.length} settings` : 'Reads it'
  if (t.status === 'gap') return t.fields.length > 1 ? `Reads none of its ${t.fields.length} settings` : 'Does not read it'
  return `Reads ${n} of ${t.fields.length} settings`
}

const bands = computed(() => {
  if (!report.value) return []
  const tiles = report.value.tiles.filter(keep(filter.value))
  const out = LEVEL_BANDS.map(b => ({ id: b.name, label: b.label, tiles: tiles.filter(t => t.convention && t.band === b.name) }))
  out.push({ id: 'other', label: 'Settings of no one convention', tiles: tiles.filter(t => !t.convention || t.band === 'other') })
  return out.filter(b => b.tiles.length)
})
const openTile = computed(() => report.value?.tiles.find(t => t.id === openId.value) || null)
</script>

<style scoped>
.bot-report { margin: 0 0 14px; padding: 12px 14px; background: #fff; border: 1px solid var(--card-border, #e0ddd7); border-radius: 8px; font-size: 13px; }
h3 { margin: 0 0 2px; font-family: var(--font-heading, serif); font-size: 16px; }
.version { margin: 0 0 6px; color: var(--text-secondary, #6b7280); display: flex; flex-wrap: wrap; gap: 4px 12px; }
.summary { margin: 0 0 8px; }
.filters { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-bottom: 4px; }
.filters button { font: inherit; font-size: 12px; padding: 2px 10px; border: 1px solid #ccc; border-radius: 999px; background: #fff; cursor: pointer; }
.filters button.on { background: #333; color: #fff; border-color: #333; }
.filters .n { opacity: .7; }
.legend { display: flex; flex-wrap: wrap; gap: 10px; margin-left: auto; font-size: 12px; color: var(--text-secondary, #6b7280); }
.band { border-top: 1px solid #efede8; padding: 6px 0 4px; }
h4 { margin: 0 0 5px; font-size: 12px; font-weight: 600; color: var(--text-secondary, #6b7280); text-transform: uppercase; letter-spacing: .04em; }
.tiles { display: flex; flex-wrap: wrap; gap: 5px; }
.tile { font: inherit; font-size: 12px; display: inline-flex; align-items: center; gap: 5px; padding: 3px 8px; border: 1px solid #e3e0da; border-left: 4px solid; border-radius: 6px; background: #fff; cursor: pointer; text-align: left; }
.tile.open { box-shadow: 0 0 0 2px #333 inset; }
.glyph { font-weight: 700; width: 1em; text-align: center; }
.count { font-size: 11px; color: var(--text-secondary, #6b7280); }
.plays { border-left-color: #2d9d64; } .plays .glyph, .key.plays .glyph { color: #2d9d64; }
.partial { border-left-color: #e2a336; } .partial .glyph, .key.partial .glyph { color: #c58612; }
.gap { border-left-color: #d0605e; } .gap .glyph, .key.gap .glyph { color: #c0403e; }
.listed { border-left-color: #9a9aa8; } .listed .glyph, .key.listed .glyph { color: #77778a; }
.detail { margin: 6px 0 2px; padding: 8px 10px; background: #f8f7f4; border-radius: 6px; }
.detail-head { display: flex; flex-wrap: wrap; gap: 4px 12px; align-items: baseline; margin-bottom: 4px; }
.detail-status { color: var(--text-secondary, #6b7280); }
.detail ul { list-style: none; margin: 0; padding: 0; columns: 2 260px; }
.detail li { padding: 1px 0; color: #8b1e1e; break-inside: avoid; }
.detail li.read { color: var(--green-dark, #2d6a4f); }
.mark { display: inline-block; width: 1.1em; font-weight: 700; }
.hint { margin: 4px 0; color: var(--text-secondary, #6b7280); }
@media print { .filters button, .detail a, .version a { display: none; } }
</style>
