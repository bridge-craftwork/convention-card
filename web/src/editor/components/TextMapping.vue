<template>
  <section class="text-mapping" aria-label="Text on this card">
    <header>
      <h3>Text on this card</h3>
      <p class="lede">
        A bidding bot reads the card's boxes, not its words. This sorts each piece of text by whether a tool
        can see what it says.
      </p>
      <p class="counts">
        <span v-for="s in ORDER" v-show="counts[s.id]" :key="s.id" :class="'pill ' + s.id">{{ counts[s.id] }} {{ s.short }}</span>
      </p>
    </header>

    <details v-for="s in ORDER" v-show="groups[s.id].length" :key="s.id" :class="'group ' + s.id" :open="s.open">
      <summary><span :class="'pill ' + s.id">{{ groups[s.id].length }}</span> {{ s.title }}</summary>
      <p class="hint">{{ s.hint }}</p>
      <ul>
        <li v-for="row in groups[s.id]" :key="row.path">
          <div class="where">{{ sectionLabel(row.path) }} · {{ row.label }}</div>
          <div class="text">{{ row.text }}</div>
          <div v-if="row.status === 'differs'" class="detail">
            {{ conventionName(row) }} itself: “{{ row.standard }}”
          </div>
          <div v-else-if="row.status === 'explained'" class="detail">
            Spelled out by {{ conventionName(row) }}<template v-if="row.standard"> (its own: “{{ row.standard }}”)</template>
          </div>
          <div v-else-if="row.status === 'pending'" class="detail">
            Names {{ row.conventions.filter(c => !c.played).map(c => c.name).join(', ') }}: add
            {{ row.conventions.filter(c => !c.played).length === 1 ? 'it' : 'them' }} above, under “Your notes name…”
          </div>
          <div v-else-if="row.status === 'mapped'" class="detail">
            {{ row.conventions.map(c => c.name).join(', ') }}
          </div>
        </li>
      </ul>
    </details>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import { textMapping, textMappingCounts } from '../../../../js/textMapping.js'
import { SECTION_META } from '../conventionCatalog.js'

// Every piece of text on the card, by whether a tool can read what it says
// (textMapping.js; DESIGN.md, "Text on the card"): for whoever wants to see
// what is clean. The editor shows it only when "Text mapping" is ticked.
const props = defineProps({
  cardData: { type: Object, default: null },
})

const ORDER = [
  { id: 'differs', short: 'differ', title: 'Differs from its convention', open: true,
    hint: 'The card names a convention, but spells a bid out differently. A tool reading the convention plays it the convention’s way.' },
  { id: 'pending', short: 'to add', title: 'Names conventions not yet ticked', open: true,
    hint: 'Ticking them (Add, under “Your notes name…”) lets tools see them.' },
  { id: 'unmapped', short: 'not mapped', title: 'Not mapped', open: true,
    hint: 'No box holds this, so only a person reading the card sees it.' },
  { id: 'explained', short: 'explained', title: 'Explained by a convention', open: false,
    hint: 'This spells out bids of a convention the card plays, and agrees with it.' },
  { id: 'mapped', short: 'mapped', title: 'Mapped', open: false,
    hint: 'Every convention it names is ticked.' },
  { id: 'play', short: 'cardplay', title: 'Cardplay', open: false,
    hint: 'Carding and leads: for a play bot, not a bidding one.' },
]

const mapping = computed(() => (props.cardData ? textMapping(props.cardData) : new Map()))
const counts = computed(() => textMappingCounts(mapping.value))
const groups = computed(() => {
  const out = Object.fromEntries(ORDER.map(s => [s.id, []]))
  for (const [path, m] of mapping.value) out[m.status].push({ path, ...m })
  return out
})

const SECTION_LABELS = Object.fromEntries(SECTION_META.map(s => [s.id, s.label]))
const sectionLabel = path => {
  const id = path.slice(0, path.indexOf('.'))
  return SECTION_LABELS[id] || id.charAt(0).toUpperCase() + id.slice(1).replace(/_/g, ' ')
}
const conventionName = row => {
  const v = row.explainedBy?.value
  return typeof v === 'string' ? v.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : row.explainedBy?.label || 'the convention'
}
</script>

<style scoped>
.text-mapping { margin: 0 0 14px; padding: 12px 14px; background: #fff; border: 1px solid var(--card-border, #e0ddd7); border-radius: 8px; font-size: 13px; }
h3 { margin: 0 0 2px; font-family: var(--font-heading, serif); font-size: 16px; }
.lede { margin: 0 0 8px; color: var(--text-secondary, #6b7280); }
.counts { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 6px; }
.pill { display: inline-block; padding: 1px 8px; border-radius: 999px; font-size: 12px; font-weight: 600; background: #eee; color: #444; }
.pill.differs { background: #fde2c8; color: #8a4b00; }
.pill.pending { background: #fff1d6; color: #8a5a00; }
.pill.unmapped { background: #f3d9d9; color: #8b1e1e; }
.pill.explained { background: #e2efff; color: #1e4d8b; }
.pill.mapped { background: var(--green-pale, #d8f3dc); color: var(--green-dark, #2d6a4f); }
.pill.play { background: #ece8f5; color: #4a3a75; }
.group { border-top: 1px solid #efede8; padding: 6px 0; }
summary { cursor: pointer; font-weight: 600; }
.hint { margin: 4px 0 6px; color: var(--text-secondary, #6b7280); }
ul { list-style: none; margin: 0; padding: 0; }
li { padding: 5px 0 5px 10px; border-left: 3px solid #ddd; margin: 4px 0; }
.differs li { border-color: #e8a33d; } .pending li { border-color: #f0c36d; } .unmapped li { border-color: #d9a0a0; }
.explained li { border-color: #8db4e6; } .mapped li { border-color: #7cc49a; } .play li { border-color: #b8a9dc; }
.where { font-size: 12px; color: var(--text-secondary, #6b7280); }
.text { white-space: pre-wrap; overflow-wrap: anywhere; }
.detail { font-size: 12px; color: var(--text-secondary, #6b7280); margin-top: 1px; }
@media print { .text-mapping { display: none; } }
</style>
