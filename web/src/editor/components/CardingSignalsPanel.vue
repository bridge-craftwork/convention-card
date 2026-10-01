<template>
  <section class="carding-panel">
    <h4 class="panel-title">Primary signals</h4>
    <div class="signal-grid">
      <div></div>
      <div class="signal-col-head">Standard</div>
      <div class="signal-col-head">Upside-down</div>

      <template v-for="row in PRIMARY_ROWS" :key="row.key">
        <div class="signal-row-head">{{ row.label }}</div>
        <label class="grid-box">
          <input type="checkbox"
            :checked="r(`carding.${row.path}.standard_${row.kind}`)"
            :disabled="!editable"
            @change="t(`carding.${row.path}.standard_${row.kind}`, $event.target.checked)" />
        </label>
        <label class="grid-box">
          <input type="checkbox"
            :checked="r(`carding.${row.path}.upside_down_${row.kind}`)"
            :disabled="!editable"
            @change="t(`carding.${row.path}.upside_down_${row.kind}`, $event.target.checked)" />
        </label>
      </template>
    </div>

    <h4 class="panel-title">Signals to declarer's lead vs partner's lead</h4>
    <div class="signal-grid signal-grid-3">
      <div></div>
      <div class="signal-col-head">Declarer's lead</div>
      <div class="signal-col-head">Partner's lead</div>

      <template v-for="sig in SIGNAL_ROWS" :key="sig.key">
        <div class="signal-row-head">{{ sig.label }}</div>
        <label class="grid-box">
          <input type="checkbox"
            :checked="r(`carding.declarer_lead.${sig.key}`)"
            :disabled="!editable"
            @change="t(`carding.declarer_lead.${sig.key}`, $event.target.checked)" />
        </label>
        <label class="grid-box">
          <input type="checkbox"
            :checked="r(`carding.partner_lead.${sig.key}`)"
            :disabled="!editable"
            @change="t(`carding.partner_lead.${sig.key}`, $event.target.checked)" />
        </label>
      </template>
    </div>

    <h4 class="panel-title">Smith echo + first discard</h4>
    <div class="smith-row">
      <span class="smith-label">Smith echo:</span>
      <label class="inline-box"><input type="checkbox" :checked="r('carding.smith_echo_suits')" :disabled="!editable" @change="t('carding.smith_echo_suits', $event.target.checked)" /> Suits</label>
      <label class="inline-box"><input type="checkbox" :checked="r('carding.smith_echo_nt')" :disabled="!editable" @change="t('carding.smith_echo_nt', $event.target.checked)" /> NT</label>
      <label class="inline-box"><input type="checkbox" :checked="r('carding.smith_echo_reverse')" :disabled="!editable" @change="t('carding.smith_echo_reverse', $event.target.checked)" /> Reverse</label>
    </div>
    <div class="first-discard-row">
      <span class="smith-label">First discard:</span>
      <label v-for="opt in FIRST_DISCARD_OPTIONS" :key="opt.key" class="inline-box">
        <input
          type="radio"
          :checked="r(`carding.first_discard.${opt.key}`)"
          :disabled="!editable"
          @change="onPickFirstDiscard(opt.key)"
        />
        {{ opt.label }}
      </label>
    </div>

    <div class="trump-row">
      <span class="smith-label">Trump signals</span>
      <RichSuitField
        :model-value="r('carding.trump_signals') || ''"
        :editable="editable"
        block
        placeholder="e.g. Lavinthal, trump echo, suit preference"
        @update:modelValue="writeFieldExternal('carding.trump_signals', $event)"
      />
    </div>
    <div class="trump-row">
      <span class="smith-label">Exceptions</span>
      <RichSuitField
        :model-value="r('carding.exceptions') || ''"
        :editable="editable"
        block
        placeholder="Anything that doesn't follow the matrix above"
        @update:modelValue="writeFieldExternal('carding.exceptions', $event)"
      />
    </div>
  </section>
</template>

<script setup>
import RichSuitField from './RichSuitField.vue'

const PRIMARY_ROWS = [
  { key: 'sa', label: 'Suit contracts — attitude', path: 'suits', kind: 'attitude' },
  { key: 'sc', label: 'Suit contracts — count',    path: 'suits', kind: 'count' },
  { key: 'na', label: 'NT contracts — attitude',   path: 'nt',    kind: 'attitude' },
  { key: 'nc', label: 'NT contracts — count',      path: 'nt',    kind: 'count' }
]

const SIGNAL_ROWS = [
  { key: 'attitude',         label: 'Attitude' },
  { key: 'count',            label: 'Count' },
  { key: 'suit_preference',  label: 'Suit preference' }
]

const FIRST_DISCARD_OPTIONS = [
  { key: 'standard',    label: 'Standard' },
  { key: 'upside_down', label: 'Upside-down' },
  { key: 'lavinthal',   label: 'Lavinthal' },
  { key: 'odd_even',    label: 'Odd-even' }
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

function writeFieldExternal(path, value) {
  props.writeField(path, value || null)
}

function onPickFirstDiscard(key) {
  if (!props.editable) return
  for (const opt of FIRST_DISCARD_OPTIONS) {
    props.writeField(`carding.first_discard.${opt.key}`, opt.key === key ? true : null)
  }
}
</script>

<style scoped>
.carding-panel {
  margin-bottom: 20px;
  padding: 14px 16px;
  background: white;
  border: 1px solid var(--card-border, #e0ddd7);
  border-radius: var(--radius-card, 10px);
}

.panel-title {
  font-family: var(--font-heading, 'Source Serif 4', serif);
  font-size: 15px;
  color: var(--green-dark, #2d6a4f);
  margin: 6px 0 10px;
}

.panel-title:first-child { margin-top: 0; }

.signal-grid {
  display: grid;
  grid-template-columns: minmax(200px, 1.6fr) auto auto;
  gap: 6px 16px;
  align-items: center;
  margin-bottom: 16px;
}

.signal-grid.signal-grid-3 {
  grid-template-columns: minmax(180px, 1.6fr) auto auto;
}

.signal-col-head {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-secondary, #6b7280);
  text-align: center;
}

.signal-row-head {
  font-size: 13px;
  color: var(--text-primary, #1a1a1a);
}

.grid-box {
  display: inline-flex;
  justify-content: center;
  align-items: center;
}

.grid-box input { accent-color: var(--green-mid, #40916c); cursor: pointer; }
.grid-box input:disabled { cursor: not-allowed; }

.smith-row,
.first-discard-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 14px;
  padding: 6px 0;
}

.smith-label {
  font-size: 13px;
  color: var(--text-secondary, #6b7280);
  min-width: 120px;
}

.inline-box {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  cursor: pointer;
  color: var(--text-primary, #1a1a1a);
}

.inline-box input { accent-color: var(--green-mid, #40916c); cursor: pointer; }
.inline-box input:disabled { cursor: not-allowed; }

.trump-row {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 8px 0;
}

.trump-row .smith-label { padding-top: 6px; }
</style>
