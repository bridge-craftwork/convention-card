<template>
  <section class="card-search" aria-live="polite">
    <p class="search-count">
      {{ total === 1 ? '1 match' : `${total} matches` }} for “{{ query.trim() }}”, at every level
    </p>
    <p v-if="!total" class="search-none">Nothing on this card or in its fields matches.</p>
    <div v-for="group in groups" :key="group.section" class="search-group">
      <button type="button" class="search-section" title="Open this section" @click="$emit('open', group.section, null)">
        {{ group.label }} ›
      </button>
      <div v-for="r in group.rows" :key="r.path" class="search-row">
        <FieldRow :path="r.path" :card="card" :editable="editable" :write-field="writeField" />
        <button type="button" class="search-go" title="See it in its section" @click="$emit('open', r.section, r.path)">Go to</button>
      </div>
    </div>
    <div v-if="agreements.length" class="search-group">
      <button type="button" class="search-section" @click="$emit('open', 'other_conventions', null)">Other agreements ›</button>
      <p v-for="(a, i) in agreements" :key="i" class="search-agreement">{{ a.text }}</p>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import { searchFields, searchAgreements } from '../cardFields.js'
import FieldRow from './FieldRow.vue'

// Every field the query matches, editable where it stands, whatever section
// it's in and whatever the level filter shows.
const props = defineProps({
  query: { type: String, required: true },
  card: { type: Object, default: null },
  editable: { type: Boolean, default: false },
  writeField: { type: Function, required: true },
})
defineEmits(['open'])

const rows = computed(() => searchFields(props.query, props.card?.card_data))
const agreements = computed(() => searchAgreements(props.query, props.card?.card_data))
const total = computed(() => rows.value.length + agreements.value.length)

// In sections, in the order the best match of each came
const groups = computed(() => {
  const out = new Map()
  for (const r of rows.value) {
    if (!out.has(r.section)) out.set(r.section, { section: r.section, label: r.sectionLabel, rows: [] })
    out.get(r.section).rows.push(r)
  }
  return [...out.values()]
})
</script>

<style scoped>
.card-search {
  background: white;
  border: 1px solid var(--card-border, #e0ddd7);
  border-radius: var(--radius-card, 10px);
  padding: 14px 16px;
  margin-bottom: 16px;
}
.search-count, .search-none { margin: 0 0 10px; font-size: 13px; color: var(--text-secondary, #6b7280); }
.search-group { margin-bottom: 14px; }
.search-section {
  background: none; border: none; padding: 0; cursor: pointer;
  font: inherit; font-weight: 600; font-size: 13px; color: var(--green-dark, #2d6a4f);
}
.search-row { display: grid; grid-template-columns: 1fr auto; gap: 10px; align-items: center; }
.search-go {
  background: none; border: 1px solid var(--card-border, #e0ddd7); border-radius: 6px;
  padding: 2px 8px; cursor: pointer; font: inherit; font-size: 12px; color: var(--text-secondary, #6b7280);
}
.search-agreement { margin: 6px 0; font-size: 13px; }
</style>
