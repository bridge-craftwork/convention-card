<template>
  <nav class="card-tree">
    <button
      v-for="sec in SECTION_META"
      :key="sec.id"
      class="tree-row"
      :class="{ active: sec.id === activeSection }"
      @click="$emit('select', sec.id)"
    >
      <span class="tree-row-label">
        <span class="tree-icon" v-html="ICON_SVG[sec.icon] || ''"></span>
        {{ sec.label }}
      </span>
      <span class="tree-row-count">
        <span v-if="hasNotes(sec.id)" class="note-dot" title="Has notes"></span>
        {{ sectionCounts[sec.id]?.selected ?? 0 }}/{{ sectionCounts[sec.id]?.total ?? 0 }}
      </span>
    </button>
  </nav>
</template>

<script setup>
import { SECTION_META, ICON_SVG } from '../../utils/conventionCatalog.js'

const props = defineProps({
  activeSection: { type: String, required: true },
  sectionCounts: { type: Object, required: true },
  hasNotesFn: { type: Function, default: () => () => false }
})

defineEmits(['select'])

function hasNotes(id) {
  return props.hasNotesFn(id)
}
</script>

<style scoped>
.card-tree {
  background: white;
  border: 1px solid var(--card-border, #e0ddd7);
  border-radius: var(--radius-card, 10px);
  padding: 6px;
  font-size: 13px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  align-self: start;
}

.tree-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 8px 10px;
  border: none;
  background: transparent;
  border-radius: 6px;
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  font-size: inherit;
  color: var(--text-primary, #1a1a1a);
  transition: background 0.15s, color 0.15s;
}

.tree-row:hover {
  background: #f3f4f6;
}

.tree-row.active {
  background: var(--green-pale, #d8f3dc);
  color: var(--green-dark, #2d6a4f);
  font-weight: 500;
}

.tree-row-label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.tree-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  color: inherit;
  opacity: 0.85;
}

.tree-row-count {
  font-size: 11px;
  color: var(--text-tertiary, #9ca3af);
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.note-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #EF9F27;
}

.tree-row.active .tree-row-count {
  color: var(--green-dark, #2d6a4f);
  opacity: 0.75;
}
</style>
