<template>
  <div class="field-row generic" :data-field="path">
    <span class="field-label" :title="def?.desc || path" v-html="colorizeSuits(def?.label || path)"></span>
    <span class="field-value">
      <template v-if="!editable || isList">{{ shown }}</template>
      <label v-else-if="def?.kind === 'bool'" class="field-checkbox">
        <input type="checkbox" :checked="value === true" @change="write($event.target.checked)" />
        <span>{{ value === true ? 'Yes' : 'No' }}</span>
      </label>
      <select v-else-if="def?.kind === 'enum'" class="field-input" :value="value ?? ''" @change="write($event.target.value || null)">
        <option value="">—</option>
        <option v-if="offTheList" :value="value">{{ value }}</option>
        <option v-for="o in def.options" :key="o" :value="o">{{ humanise(o) }}</option>
      </select>
      <input
        v-else-if="def?.kind === 'int'"
        type="text"
        class="field-input number-input"
        :value="number"
        @input="onNumber($event.target.value)"
        @blur="$event.target.value = number"
      />
      <RichSuitField
        v-else
        :model-value="value ?? ''"
        editable
        block
        :multiline="path.startsWith('notes.')"
        @update:modelValue="write($event || null)"
      />
    </span>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { field } from '../../../../js/spec.js'
import { readPath } from '../../../../js/paths.js'
import { colorizeSuits } from '../suits.js'
import RichSuitField from './RichSuitField.vue'

// One field of the spec, by its kind: for a field no section's own row or
// panel shows, and for search results.
const props = defineProps({
  path: { type: String, required: true },
  card: { type: Object, default: null },
  editable: { type: Boolean, default: false },
  writeField: { type: Function, required: true },
})

const def = computed(() => field(props.path))
const read = path => readPath(props.card?.card_data, path)
const value = computed(() => read(props.path))
const isList = computed(() => Array.isArray(value.value))
const offTheList = computed(() => value.value != null && value.value !== '' && !def.value?.options?.includes(value.value))
const humanise = o => { const s = String(o).replace(/_/g, ' '); return s.charAt(0).toUpperCase() + s.slice(1) }

const canQualify = computed(() => !!field(`${props.path}_plus`))
const number = computed(() => {
  if (value.value == null || value.value === '') return ''
  if (!canQualify.value) return String(value.value)
  return `${value.value}${read(`${props.path}_plus`) ? '+' : read(`${props.path}_minus`) ? '-' : ''}`
})

const shown = computed(() => {
  const v = value.value
  if (v == null || v === '') return '—'
  if (def.value?.kind === 'bool') return v === true ? 'Yes' : 'No'
  if (isList.value) return v.join(', ')
  if (def.value?.kind === 'int') return number.value
  return def.value?.kind === 'enum' && !offTheList.value ? humanise(v) : String(v)
})

const write = v => props.writeField(props.path, v)

// "14+": a number, with the plus or minus where the spec has them. Anything
// else is half typed: the card is left alone, and the box shows it on blur.
function onNumber(raw) {
  const text = String(raw).trim()
  const m = /^(\d+)\s*([+-])?$/.exec(text)
  if (text && !m) return
  write(text ? Number(m[1]) : null)
  if (canQualify.value) {
    props.writeField(`${props.path}_plus`, m?.[2] === '+' ? true : null)
    props.writeField(`${props.path}_minus`, m?.[2] === '-' ? true : null)
  }
}
</script>

<style scoped>
.field-row.generic {
  display: grid;
  grid-template-columns: minmax(180px, 1fr) minmax(180px, 2fr);
  gap: 12px;
  align-items: center;
  padding: 6px 0;
  border-bottom: 1px solid var(--card-border, #e0ddd7);
}
.field-row.generic:last-child { border-bottom: none; }
.field-label { font-size: 13px; color: var(--text-secondary, #6b7280); }
.field-label :deep(.suit-red) { color: #d32f2f; }
.field-label :deep(.suit-black) { color: #1a1a1a; }
.field-value { font-size: 13px; min-width: 0; overflow-wrap: anywhere; }
.field-input { font: inherit; padding: 4px 8px; border: 1px solid var(--card-border, #e0ddd7); border-radius: 6px; max-width: 100%; }
.number-input { width: 5em; }
.field-checkbox { display: inline-flex; align-items: center; gap: 6px; }
@media (max-width: 560px) {
  .field-row.generic { grid-template-columns: 1fr; gap: 4px; }
}
</style>
