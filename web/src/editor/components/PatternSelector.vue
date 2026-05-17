<template>
  <span class="pattern-selector" :title="pattern">
    <button
      v-for="(token, idx) in tokens"
      :key="idx"
      type="button"
      class="pattern-token"
      :class="{ selected: selected === idx + 1, readonly: !editable }"
      :disabled="!editable"
      @click="$emit('pick', idx + 1)"
    >{{ token }}</button>
  </span>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  pattern: { type: String, required: true },
  selected: { type: Number, default: null },
  editable: { type: Boolean, default: false }
})

defineEmits(['pick'])

// "Hxxx(+)" → ["H","x","x","x","(+)"]
// "AKxx(+)" → ["A","K","x","x","(+)"]
// Tokens are 1-based for the "circle which one" index.
const tokens = computed(() => {
  const s = props.pattern
  const out = []
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c === '(') {
      // capture parenthetical (e.g. "(+)") into a single token
      const close = s.indexOf(')', i)
      if (close > i) {
        out.push(s.slice(i, close + 1))
        i = close
        continue
      }
    }
    out.push(c)
  }
  return out
})
</script>

<style scoped>
.pattern-selector {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px 4px;
  background: #fafaf9;
  border: 1px solid var(--card-border, #e0ddd7);
  border-radius: 6px;
}

.pattern-token {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 22px;
  padding: 0 4px;
  border: none;
  background: transparent;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 13px;
  color: var(--text-primary, #1a1a1a);
  cursor: pointer;
  border-radius: 50%;
  transition: background 0.15s;
}

.pattern-token:hover:not(:disabled) { background: var(--green-pale, #d8f3dc); }

.pattern-token.selected {
  background: var(--green-mid, #40916c);
  color: white;
  font-weight: 600;
}

.pattern-token.readonly { cursor: default; }
.pattern-token:disabled { cursor: not-allowed; }
</style>
