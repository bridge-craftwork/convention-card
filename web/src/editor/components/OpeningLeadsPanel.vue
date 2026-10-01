<template>
  <section class="leads-panel">
    <div class="leads-grid">
      <div v-for="col in COLUMNS" :key="col.key" class="leads-block">
        <div class="leads-col-head">{{ col.label }}</div>

        <div class="leads-row">
          <span class="leads-row-label">Length leads</span>
          <span class="leads-row-options">
            <label class="inline-box">
              <input type="checkbox"
                :checked="r(`leads.${col.key}.length.fourth_best`)"
                :disabled="!editable"
                @change="t(`leads.${col.key}.length.fourth_best`, $event.target.checked)" />
              4th best
            </label>
            <label class="inline-box">
              <input type="checkbox"
                :checked="r(`leads.${col.key}.length.third_fifth`)"
                :disabled="!editable"
                @change="t(`leads.${col.key}.length.third_fifth`, $event.target.checked)" />
              3rd/5th
            </label>
            <label class="inline-box">
              <input type="checkbox"
                :checked="r(`leads.${col.key}.length.third_low`)"
                :disabled="!editable"
                @change="t(`leads.${col.key}.length.third_low`, $event.target.checked)" />
              3rd/low
            </label>
            <label v-if="col.key === 'vs_nt'" class="inline-box">
              <input type="checkbox"
                :checked="r(`leads.${col.key}.length.attitude`)"
                :disabled="!editable"
                @change="t(`leads.${col.key}.length.attitude`, $event.target.checked)" />
              Attitude
            </label>
            <label v-if="col.key === 'vs_nt'" class="inline-box">
              <input type="checkbox"
                :checked="r(`leads.${col.key}.length.second_from_4plus`)"
                :disabled="!editable"
                @change="t(`leads.${col.key}.length.second_from_4plus`, $event.target.checked)" />
              2nd from xxxx+
            </label>
            <label v-if="col.key === 'vs_suits'" class="inline-box">
              <input type="checkbox"
                :checked="r(`leads.${col.key}.length.small_from_xx`)"
                :disabled="!editable"
                @change="t(`leads.${col.key}.length.small_from_xx`, $event.target.checked)" />
              Small from xx
            </label>
          </span>
        </div>

        <div class="leads-row">
          <span class="leads-row-label">Length patterns</span>
          <span class="leads-row-options length-grid">
            <PatternSelector
              v-for="pat in lengthPatterns(col)"
              :key="pat.key"
              :pattern="pat.label"
              :selected="r(`leads.${col.key}.length.lead_choice_${pat.key}`)"
              :editable="editable"
              @pick="(idx) => onPickPosition(`leads.${col.key}.length.lead_choice_${pat.key}`, idx)"
            />
          </span>
        </div>

        <div class="leads-row">
          <span class="leads-row-label">Honor leads</span>
          <span class="leads-row-options length-grid">
            <PatternSelector
              v-for="pat in honorPatterns(col)"
              :key="pat.key"
              :pattern="pat.label"
              :selected="r(`leads.${col.key}.honors.lead_choice_${pat.key}`)"
              :editable="editable"
              @pick="(idx) => onPickPosition(`leads.${col.key}.honors.lead_choice_${pat.key}`, idx)"
            />
          </span>
        </div>

        <div class="leads-row">
          <span class="leads-row-label">After 1st trick</span>
          <RichSuitField
            :model-value="r(`leads.${col.key}.after_first_trick`) || ''"
            :editable="editable"
            block
            placeholder="e.g. attitude / count switch"
            @update:modelValue="writeField(`leads.${col.key}.after_first_trick`, $event)"
          />
        </div>

        <div class="leads-row">
          <span class="leads-row-label">Exceptions</span>
          <RichSuitField
            :model-value="r(`leads.${col.key}.exceptions`) || ''"
            :editable="editable"
            block
            placeholder="Exceptions to the patterns above"
            @update:modelValue="writeField(`leads.${col.key}.exceptions`, $event)"
          />
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import RichSuitField from './RichSuitField.vue'
import PatternSelector from './PatternSelector.vue'

const COLUMNS = [
  { key: 'vs_suits', label: 'vs Suit contracts' },
  { key: 'vs_nt',    label: 'vs NT contracts' }
]

const LENGTH_PATTERNS_SUITS = [
  { key: 'xx',     label: 'xx' },
  { key: 'xxx',    label: 'xxx' },
  { key: 'xxxx',   label: 'xxxx' },
  { key: 'xxxxx',  label: 'xxxxx' },
  { key: 'Hxx',    label: 'Hxx' },
  { key: 'Hxxx',   label: 'Hxxx' },
  { key: 'Hxxxx',  label: 'Hxxxx' }
]

const HONOR_PATTERNS_SUITS = [
  { key: 'AKx',    label: 'AKx(+)' },
  { key: 'KQx',    label: 'KQx' },
  { key: 'QJx',    label: 'QJx' },
  { key: 'JTx',    label: 'JTx' },
  { key: 'T9x',    label: 'T9x' },
  { key: 'KJTx',   label: 'KJTx' },
  { key: 'KT9x',   label: 'KT9x' },
  { key: 'QT9x',   label: 'QT9x' }
]

const LENGTH_PATTERNS_NT = LENGTH_PATTERNS_SUITS

const HONOR_PATTERNS_NT = [
  { key: 'AKxx',   label: 'AKxx(+)' },
  { key: 'KQJx',   label: 'KQJx' },
  { key: 'KQT9',   label: 'KQT9' },
  { key: 'QJTx',   label: 'QJTx' },
  { key: 'JT9x',   label: 'JT9x' },
  { key: 'AQJx',   label: 'AQJx' },
  { key: 'AJTx',   label: 'AJTx' },
  { key: 'KT9x',   label: 'KT9x' },
  { key: 'QT9x',   label: 'QT9x' }
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

function writeField(path, value) {
  if (!props.editable) return
  props.writeField(path, value || null)
}

function onPickPosition(path, idx) {
  if (!props.editable) return
  // Click an already-selected card to clear (toggle off)
  const current = r(path)
  props.writeField(path, current === idx ? null : idx)
}

function lengthPatterns(col) {
  return col.key === 'vs_suits' ? LENGTH_PATTERNS_SUITS : LENGTH_PATTERNS_NT
}

function honorPatterns(col) {
  return col.key === 'vs_suits' ? HONOR_PATTERNS_SUITS : HONOR_PATTERNS_NT
}
</script>

<style scoped>
.leads-panel {
  margin-bottom: 20px;
  padding: 14px 16px;
  background: white;
  border: 1px solid var(--card-border, #e0ddd7);
  border-radius: var(--radius-card, 10px);
}

.leads-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 18px;
}

.leads-col-head {
  font-family: var(--font-heading, 'Source Serif 4', serif);
  font-size: 15px;
  color: var(--green-dark, #2d6a4f);
  margin-bottom: 8px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--card-border, #e0ddd7);
}

.leads-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 8px 0;
}

.leads-row-label {
  flex: 0 0 130px;
  font-size: 12px;
  color: var(--text-secondary, #6b7280);
  padding-top: 4px;
}

.leads-row-options {
  flex: 1;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.inline-box {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  cursor: pointer;
  color: var(--text-primary, #1a1a1a);
}

.inline-box input { accent-color: var(--green-mid, #40916c); cursor: pointer; }
.inline-box input:disabled { cursor: not-allowed; }

.length-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
  gap: 6px;
  flex: 1;
}

@media (max-width: 900px) {
  .leads-grid { grid-template-columns: 1fr; }
}
</style>
