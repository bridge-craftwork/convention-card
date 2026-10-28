<template>
  <section class="practice-report" aria-label="Solo practice">
    <header>
      <h3>Solo practice</h3>
      <ul class="about">
        <li v-for="s in sourceRows" :key="s.id">
          <span :class="['chip', 'on', s.id]">{{ s.short }}</span>
          <strong>{{ s.name }}</strong>
          <span v-if="s.error">· {{ s.error }}</span>
          <span v-else-if="!s.loaded">· loading…</span>
          <template v-else>
            <span v-if="s.version">{{ s.version }}</span>
            <span v-if="s.note">· {{ s.note }}</span>
            <a v-if="s.url" :href="s.url" target="_blank" rel="noopener">{{ s.urlLabel || 'about' }}</a>
          </template>
        </li>
      </ul>
      <div v-if="report" class="filters">
        <button v-for="f in FILTERS.filter(f => !f.bot || report.bot)" :key="f.id" :class="{ on: filter === f.id }" @click="filter = f.id">
          {{ unref(f.label) }} <span class="n">{{ countOf(f.id) }}</span>
        </button>
      </div>
    </header>

    <template v-if="report">
      <div v-for="band in bands" :key="band.id" class="band">
        <h4>{{ band.label }}</h4>
        <div class="tiles">
          <button v-for="t in band.tiles" :key="t.id" :class="['tile', reach(t), { open: openId === t.id }]"
                  :title="tileTitle(t)" @click="openId = openId === t.id ? null : t.id">
            <span class="name">{{ nameOf(t) }}</span>
            <span class="marks">
              <span v-for="s in report.sources" :key="s.id" v-show="t.convention"
                    :class="['chip', s.id, { on: t.practice[s.id].length }]">{{ shortOf(s.id) }}</span>
              <span v-if="report.bot && t.bot" :class="['chip', 'bot', t.bot]">{{ glyphOf(t.bot) }}{{ botShort }}</span>
            </span>
          </button>
        </div>
        <div v-if="openTile && band.tiles.includes(openTile)" class="detail">
          <div class="detail-head"><strong>{{ nameOf(openTile) }}</strong></div>
          <div v-for="s in openTile.convention ? report.sources : []" :key="s.id" class="detail-source">
            <span :class="['chip', s.id, { on: openTile.practice[s.id].length }]">{{ shortOf(s.id) }}</span>
            <template v-if="openTile.practice[s.id].length">
              <template v-for="(d, i) in openTile.practice[s.id]" :key="d.name">
                <template v-if="i">, </template>
                <a v-if="d.href" :href="d.href" target="_blank" rel="noopener">{{ d.name }}</a><template v-else>{{ d.name }}</template>
              </template>
            </template>
            <span v-else class="hint">No deals in {{ s.name }}</span>
          </div>
          <div v-if="report.bot && openTile.bot" class="detail-source">
            <span :class="['chip', 'bot', openTile.bot]">{{ glyphOf(openTile.bot) }}{{ botShort }}</span>
            {{ botTitle(openTile) }}
            <a v-if="openTile.convention && botInfo?.statusUrl" :href="`${botInfo.statusUrl}#tile=${encodeURIComponent(openTile.id)}`"
               target="_blank" rel="noopener">On {{ botName }}’s status page</a>
            <ul v-if="openTile.fields.length">
              <li v-for="f in openTile.fields" :key="f.path" :class="{ read: f.read }">
                <span class="mark">{{ f.read ? '✓' : '✗' }}</span> {{ f.label }}
              </li>
            </ul>
          </div>
        </div>
      </div>
      <p v-if="!bands.length" class="hint">Nothing to show.</p>
    </template>
  </section>
</template>

<script setup>
import { computed, reactive, ref, unref, watch } from 'vue'
import { practiceReport } from '../../../../js/practiceReport.js'
import { SECTION_META } from '../conventionCatalog.js'
import { LEVEL_BANDS } from '../../../../js/spec.js'

// Ways to practise the card alone: for each convention it plays, the deal
// collections with deals for it and whether the bidding bot plays it
// (practiceReport.js), one tile each. The collections and the bot come from
// the host (`overlays.practice`, `overlays.bot`: useCardEditor.js); the
// editor never fetches or runs one itself.
const props = defineProps({
  cardData: { type: Object, default: null },
  bot: { type: Object, default: null },
  practice: { type: Array, default: () => [] },
})

const filter = ref('all')
const openId = ref(null)

// The deal collections: each loads once.
const loaded = reactive({})
for (const s of props.practice) {
  loaded[s.id] = { loaded: false }
  s.load()
    .then(r => { loaded[s.id] = { loaded: true, ...r } })
    .catch(e => { loaded[s.id] = { loaded: true, error: e.message || String(e) } })
}

// The bot: which it is, once, and its coverage of the card as it changes.
const botName = computed(() => props.bot?.name || 'The bot')
const botShort = computed(() => props.bot?.short || botName.value)
const botInfo = ref(null)
const botError = ref('')
const coverage = ref(null)
const botSkills = ref(null)
props.bot?.info().then(i => { botInfo.value = i }).catch(e => { botError.value = e.message || String(e) })
// The conventions it implements, if it says: what it plays, beside what it reads
if (props.bot?.skills) props.bot.skills().then(s => { botSkills.value = s }).catch(() => { botSkills.value = [] })
let timer = null
let asked = 0
watch(() => props.cardData, data => {
  clearTimeout(timer)
  if (!data || !props.bot) return
  timer = setTimeout(async () => {
    const mine = ++asked
    try {
      const c = await props.bot.coverage(data)
      if (mine === asked) { coverage.value = c; botError.value = '' }
    } catch (e) {
      if (mine === asked) botError.value = e.message || String(e)
    }
  }, coverage.value ? 400 : 0)
}, { immediate: true, deep: true })

const sourceRows = computed(() => [
  ...props.practice.map(s => {
    const l = loaded[s.id]
    const n = l.skills ? Object.values(l.skills).reduce((a, d) => a + d.length, 0) : 0
    return { id: s.id, name: s.name, short: s.short || s.name, loaded: l.loaded, error: l.error, version: l.version,
             note: l.skills ? `${n} ${s.unit || 'sets of deals'}` : '', url: l.url }
  }),
  ...(props.bot ? [{
    id: 'bot', name: botName.value, short: botShort.value, loaded: !!botInfo.value || !!botError.value, error: botError.value,
    version: [botInfo.value?.version, botInfo.value?.rules && `rules ${botInfo.value.rules}`].filter(Boolean).join(' · '),
    note: report.value?.bot ? `reads ${report.value.bot.read} of the ${report.value.bot.total} bidding settings this card switches on (${Math.round(report.value.bot.score * 100)}%)` : '',
    url: botInfo.value?.statusUrl, urlLabel: 'status',
  }] : []),
])

const ready = computed(() => props.practice.every(s => loaded[s.id].loaded)
  && (!props.bot || ((coverage.value || botError.value) && (!props.bot.skills || botSkills.value))))
const report = computed(() => {
  if (!props.cardData || !ready.value) return null
  const sources = props.practice.filter(s => loaded[s.id].skills).map(s => ({ id: s.id, name: s.name, skills: loaded[s.id].skills }))
  const c = coverage.value && (botSkills.value?.length ? { ...coverage.value, skills: botSkills.value } : coverage.value)
  return practiceReport(props.cardData, { coverage: c, sources })
})
const shortOf = id => props.practice.find(s => s.id === id)?.short || id

// Whether a tile can be practised alone: deals for it, and the bot plays it
// (a convention the bot has no setting of, as in cardplay, needs only
// deals): 'all', 'some' or 'none'.
const hasDeals = t => Object.values(t.practice).some(d => d.length)
const botMisses = t => !!report.value?.bot && t.bot !== null && t.bot !== 'plays'
const botLacks = t => !!report.value?.bot && (t.bot === 'gap' || t.bot === 'listed' || (t.bot === 'partial' && t.module === undefined))
function reach(t) {
  if (!t.convention) return t.bot === 'plays' ? 'all' : t.bot === 'partial' ? 'some' : 'none'
  if (hasDeals(t)) return botMisses(t) ? 'some' : 'all'
  return t.bot === 'plays' || t.bot === 'partial' ? 'some' : 'none'
}
const FILTERS = [
  { id: 'all', label: 'Everything', keep: () => true },
  { id: 'nodeals', label: 'No deals', keep: t => t.convention && !hasDeals(t) },
  { id: 'nobot', label: computed(() => `${botName.value} doesn’t play`), keep: t => botLacks(t), bot: true },
  { id: 'ignores', label: computed(() => `${botName.value} ignores settings`), keep: t => t.bot === 'partial' && t.module, bot: true },
  { id: 'none', label: 'No way to practise', keep: t => t.convention && reach(t) === 'none' },
]
const keep = id => FILTERS.find(f => f.id === id).keep
const countOf = id => report.value?.tiles.filter(keep(id)).length ?? 0

const BOT_STATUS = { plays: '✓', partial: '◐', gap: '✗', listed: '?' }
const glyphOf = s => (s ? `${BOT_STATUS[s]} ` : '')
const SECTION_LABELS = Object.fromEntries(SECTION_META.map(s => [s.id, s.label]))
function nameOf(t) {
  if (t.convention) return t.name
  const section = SECTION_LABELS[t.id.slice('section:'.length)] || t.name.replace(/^Other | settings$/g, '')
  return /^other\b/i.test(section) ? section : `Other ${section}`
}
function botTitle(t) {
  const n = t.fields.filter(f => f.read).length
  if (t.module === true) {
    if (t.bot === 'plays') return t.fields.length ? `Plays it, and reads ${t.fields.length > 1 ? `all ${t.fields.length} settings` : 'its setting'}` : 'Plays it'
    return `Plays it, but ignores ${t.fields.length - n} of the card’s ${t.fields.length} settings of it`
  }
  if (t.module === false && !n) return t.fields.length ? `Doesn’t play it (no rules for it; ignores ${t.fields.length > 1 ? `its ${t.fields.length} settings` : 'its setting'})` : 'Doesn’t play it (no rules for it)'
  if (t.bot === 'listed') return `Named in other agreements: ${botName.value} has no setting to read`
  if (t.bot === 'plays') return t.fields.length > 1 ? `Reads all ${t.fields.length} settings` : 'Reads it'
  if (t.bot === 'gap') return t.fields.length > 1 ? `Reads none of its ${t.fields.length} settings` : 'Does not read it'
  if (t.bot === 'partial') return `Reads ${n} of ${t.fields.length} settings`
  return `${botName.value} has no setting of it to read`
}
function tileTitle(t) {
  const parts = t.convention ? report.value.sources.map(s => `${s.name}: ${t.practice[s.id].length ? t.practice[s.id].map(d => d.name).join(', ') : 'none'}`) : []
  if (report.value.bot) parts.push(`${botName.value}: ${botTitle(t)}`)
  return parts.join('\n')
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
.practice-report { margin: 0 0 14px; padding: 12px 14px; background: #fff; border: 1px solid var(--card-border, #e0ddd7); border-radius: 8px; font-size: 13px; }
h3 { margin: 0 0 4px; font-family: var(--font-heading, serif); font-size: 16px; }
.about { list-style: none; margin: 0 0 8px; padding: 0; color: var(--text-secondary, #6b7280); }
.about li { margin: 2px 0; }
.about strong { color: var(--text-primary, #222); font-weight: 600; }
.about li > * + * { margin-left: 5px; }
.filters { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-bottom: 4px; }
.filters button { font: inherit; font-size: 12px; padding: 2px 10px; border: 1px solid #ccc; border-radius: 999px; background: #fff; cursor: pointer; }
.filters button.on { background: #333; color: #fff; border-color: #333; }
.filters .n { opacity: .7; }
.band { border-top: 1px solid #efede8; padding: 6px 0 4px; }
h4 { margin: 0 0 5px; font-size: 12px; font-weight: 600; color: var(--text-secondary, #6b7280); text-transform: uppercase; letter-spacing: .04em; }
.tiles { display: flex; flex-wrap: wrap; gap: 5px; }
.tile { font: inherit; font-size: 12px; display: inline-flex; align-items: center; gap: 6px; padding: 3px 6px 3px 8px; border: 1px solid #e3e0da; border-left: 4px solid; border-radius: 6px; background: #fff; cursor: pointer; text-align: left; }
.tile.open { box-shadow: 0 0 0 2px #333 inset; }
.tile.all { border-left-color: #2d9d64; } .tile.some { border-left-color: #e2a336; } .tile.none { border-left-color: #d0605e; }
.marks { display: inline-flex; gap: 2px; }
.chip { display: inline-block; font-size: 10px; font-weight: 600; line-height: 1; padding: 2px 4px; border-radius: 3px; border: 1px dashed #ccc; color: #aaa; background: #fff; white-space: nowrap; }
.chip.on { border: 1px solid transparent; color: #fff; background: #4a6fa5; }
.chip.on.pbs { background: #7b5ea7; }
.chip.on.bot, .chip.bot.plays { border: 1px solid transparent; color: #fff; background: #2d9d64; }
.chip.bot.partial { border: 1px solid #e2a336; color: #9a6a0c; background: #fff6e3; }
.chip.bot.gap { border: 1px solid #e3b1b0; color: #b03a38; background: #fff; }
.chip.bot.listed { border: 1px solid #ccc; color: #77778a; background: #fff; }
.detail { margin: 6px 0 2px; padding: 8px 10px; background: #f8f7f4; border-radius: 6px; }
.detail-head { margin-bottom: 4px; }
.detail-source { margin: 4px 0; }
.detail-source > .chip { margin-right: 6px; }
.detail-source a { margin-left: 4px; }
.detail ul { list-style: none; margin: 4px 0 0; padding: 0; columns: 2 260px; }
.detail li { padding: 1px 0; color: #8b1e1e; break-inside: avoid; }
.detail li.read { color: var(--green-dark, #2d6a4f); }
.mark { display: inline-block; width: 1.1em; font-weight: 700; }
.hint { margin: 4px 0; color: var(--text-secondary, #6b7280); }
@media print { .filters button, .detail a, .about a { display: none; } }
</style>
