<template>
  <section class="dcb-panel">
    <h4 class="dcb-title">Direct cuebids of opponent's opening</h4>
    <div class="dcb-grid">
      <div class="dcb-corner"></div>
      <div v-for="col in COLUMNS" :key="col.key" class="dcb-col-head">
        <div class="dcb-col-label">{{ col.label }}</div>
        <div class="dcb-col-suits" v-html="colorizeSuits(col.suits)"></div>
      </div>

      <template v-for="row in ROWS" :key="row.key">
        <div class="dcb-row-label">{{ row.label }}</div>
        <label v-for="col in COLUMNS" :key="col.key + ':' + row.key" class="dcb-cell">
          <input
            type="checkbox"
            :checked="r(`direct_cuebids.${col.key}_${row.key}`)"
            :disabled="!editable"
            @change="t(`direct_cuebids.${col.key}_${row.key}`, $event.target.checked)"
          />
        </label>
      </template>
    </div>

    <div class="dcb-describe">
      <span class="dcb-describe-label">Describe</span>
      <RichSuitField
        :model-value="r('direct_cuebids.description') || ''"
        :editable="editable"
        block
        placeholder="e.g. Michaels minimax; suction over strong 1♣/1♦"
        @update:modelValue="writeText('direct_cuebids.description', $event)"
      />
    </div>
  </section>
</template>

<script setup>
import RichSuitField from './RichSuitField.vue'
import { colorizeSuits } from '../../utils/cardFormatting.js'

// Each column corresponds to a category of opponent opening + a
// suit pair, matching the ACBL card layout.
const COLUMNS = [
  { key: 'art',         label: 'Artificial', suits: '♣ ♦' },
  { key: 'quasi',       label: 'Quasi',      suits: '♣ ♦' },
  { key: 'nat_minors',  label: 'Natural',    suits: '♣ ♦' },
  { key: 'nat_majors',  label: 'Natural',    suits: '♥ ♠' }
]

const ROWS = [
  { key: 'michaels', label: 'Michaels' },
  { key: 'natural',  label: 'Natural' },
  { key: 'other',    label: 'Other' }
]

const props = defineProps({
  card: { type: Object, default: null },
  editable: { type: Boolean, default: false },
  writeField: { type: Function, required: true }
})

function r(path) {
  const parts = path.split('.')
  let cur = props.card?.card_data
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined
    cur = cur[p]
  }
  return cur
}

function t(path, checked) {
  if (!props.editable) return
  props.writeField(path, checked ? true : null)
}

function writeText(path, value) {
  if (!props.editable) return
  props.writeField(path, value || null)
}
</script>

<style scoped>
.dcb-panel {
  margin-bottom: 20px;
  padding: 14px 16px;
  background: white;
  border: 1px solid var(--card-border, #e0ddd7);
  border-radius: var(--radius-card, 10px);
}

.dcb-title {
  font-family: var(--font-heading, 'Source Serif 4', serif);
  font-size: 15px;
  color: var(--green-dark, #2d6a4f);
  margin: 0 0 12px;
}

.dcb-grid {
  display: grid;
  grid-template-columns: 100px repeat(4, 1fr);
  gap: 6px 14px;
  align-items: center;
  margin-bottom: 14px;
}

.dcb-corner { /* empty top-left cell */ }

.dcb-col-head {
  text-align: center;
  font-size: 12px;
}

.dcb-col-label {
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-secondary, #6b7280);
}

.dcb-col-suits {
  margin-top: 2px;
  font-size: 14px;
  font-weight: 600;
}

.dcb-col-suits :deep(.suit-red)   { color: #d32f2f; }
.dcb-col-suits :deep(.suit-black) { color: #1a1a1a; }

.dcb-row-label {
  font-size: 13px;
  color: var(--text-primary, #1a1a1a);
}

.dcb-cell {
  display: inline-flex;
  justify-content: center;
  align-items: center;
}

.dcb-cell input { accent-color: var(--green-mid, #40916c); cursor: pointer; }
.dcb-cell input:disabled { cursor: not-allowed; }

.dcb-describe {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 6px 0;
}

.dcb-describe-label {
  flex: 0 0 100px;
  font-size: 13px;
  color: var(--text-secondary, #6b7280);
  padding-top: 4px;
}
</style>
