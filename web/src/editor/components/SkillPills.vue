<template>
  <div class="pill-group" role="radiogroup" aria-label="Skill level threshold">
    <button
      v-for="lvl in SKILL_LEVELS"
      :key="lvl"
      type="button"
      class="pill"
      :class="{ active: isAtOrBelow(lvl), threshold: lvl === thresholdLevel }"
      :aria-checked="lvl === thresholdLevel"
      role="radio"
      @click="setThreshold(lvl)"
    >
      {{ label(lvl) }}
    </button>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { SKILL_LEVELS } from '../../utils/bakerBridgeTaxonomy.js'

const props = defineProps({
  // Set of all levels at-or-below the threshold (kept as a Set so
  // downstream `.has(level)` checks keep working without changes).
  modelValue: { type: Set, required: true }
})
const emit = defineEmits(['update:modelValue'])

// Derive the threshold = the highest level present in the set. If the
// set is empty for some reason, fall back to the lowest level so at
// least basic stays visible.
const thresholdLevel = computed(() => {
  let highestIdx = -1
  for (const lvl of props.modelValue) {
    const idx = SKILL_LEVELS.indexOf(lvl)
    if (idx > highestIdx) highestIdx = idx
  }
  return highestIdx >= 0 ? SKILL_LEVELS[highestIdx] : SKILL_LEVELS[0]
})

function label(lvl) {
  return lvl.charAt(0).toUpperCase() + lvl.slice(1)
}

function isAtOrBelow(lvl) {
  return SKILL_LEVELS.indexOf(lvl) <= SKILL_LEVELS.indexOf(thresholdLevel.value)
}

function setThreshold(lvl) {
  const cap = SKILL_LEVELS.indexOf(lvl)
  if (cap < 0) return
  const next = new Set()
  for (let i = 0; i <= cap; i++) next.add(SKILL_LEVELS[i])
  emit('update:modelValue', next)
}
</script>

<style scoped>
.pill-group {
  display: inline-flex;
  gap: 4px;
  background: white;
  border: 1px solid var(--card-border, #e0ddd7);
  border-radius: 8px;
  padding: 3px;
}

.pill {
  padding: 4px 12px;
  border: none;
  background: transparent;
  color: var(--text-secondary, #6b7280);
  font-size: 12px;
  font-weight: 500;
  border-radius: 6px;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.15s, color 0.15s;
}

.pill:hover:not(.active) {
  background: #f3f4f6;
}

.pill.active {
  background: var(--green-pale, #d8f3dc);
  color: var(--green-dark, #2d6a4f);
}

/* The threshold pill — rightmost active — gets a slightly stronger
   accent to mark it as "this is the cap, not just one of several on". */
.pill.active.threshold {
  background: var(--green-mid, #40916c);
  color: white;
}
</style>
