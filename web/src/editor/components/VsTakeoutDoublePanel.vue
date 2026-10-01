<template>
  <section class="vstd-panel">
    <h4 class="vstd-title">Vs Takeout Double</h4>

    <div class="vstd-row">
      <span class="vstd-label">New suit forcing</span>
      <span class="vstd-checks">
        <label class="vstd-check">
          <input
            type="checkbox"
            :checked="!!r('vs_to_double.new_suit_forcing_2lvl')"
            :disabled="!editable"
            @change="t('vs_to_double.new_suit_forcing_2lvl', $event.target.checked)"
          />
          <span>2-Level</span>
        </label>
        <label class="vstd-check">
          <input
            type="checkbox"
            :checked="!!r('vs_to_double.new_suit_forcing_tfr')"
            :disabled="!editable"
            @change="t('vs_to_double.new_suit_forcing_tfr', $event.target.checked)"
          />
          <span>Transfer</span>
        </label>
      </span>
    </div>

    <div class="vstd-row">
      <span class="vstd-label">Jump shift</span>
      <span class="vstd-checks">
        <label
          v-for="opt in JUMP_SHIFT_OPTIONS"
          :key="opt.value"
          class="vstd-check"
        >
          <input
            type="checkbox"
            :checked="r('vs_to_double.jump_shift') === opt.value"
            :disabled="!editable"
            @change="pickJumpShift(opt.value, $event.target.checked)"
          />
          <span>{{ opt.label }}</span>
        </label>
      </span>
    </div>

    <div class="vstd-row">
      <span class="vstd-label">Redouble</span>
      <span class="vstd-checks">
        <label class="vstd-check">
          <input
            type="checkbox"
            :checked="!!r('vs_to_double.redouble.ten_plus')"
            :disabled="!editable"
            @change="t('vs_to_double.redouble.ten_plus', $event.target.checked)"
          />
          <span>10+</span>
        </label>
        <label class="vstd-check">
          <input
            type="checkbox"
            :checked="!!r('vs_to_double.redouble.conv')"
            :disabled="!editable"
            @change="t('vs_to_double.redouble.conv', $event.target.checked)"
          />
          <span>Conv</span>
        </label>
        <label class="vstd-check">
          <input
            type="checkbox"
            :checked="!!r('vs_to_double.redouble.denies_fit')"
            :disabled="!editable"
            @change="t('vs_to_double.redouble.denies_fit', $event.target.checked)"
          />
          <span>Denies fit</span>
        </label>
      </span>
    </div>

    <div class="vstd-row">
      <span class="vstd-label">Redouble notes</span>
      <RichSuitField
        :model-value="r('vs_to_double.redouble.conv_desc') || ''"
        :editable="editable"
        block
        placeholder="e.g. 10+ with no fit, lead-directing, etc."
        @update:modelValue="writeText('vs_to_double.redouble.conv_desc', $event)"
      />
    </div>

    <div class="vstd-2nt">
      <div class="vstd-2nt-head">2NT over takeout double</div>
      <div
        v-for="row in TWO_NT_ROWS"
        :key="row.key"
        class="vstd-2nt-row"
      >
        <span class="vstd-2nt-suit" v-html="colorizeSuits(row.label)"></span>
        <label class="vstd-check">
          <input
            type="checkbox"
            :checked="!!r(`vs_to_double.${row.key}.play`)"
            :disabled="!editable"
            @change="t(`vs_to_double.${row.key}.play`, $event.target.checked)"
          />
          <span>Raise</span>
        </label>
        <span class="vstd-2nt-range">
          <span class="vstd-range-label">Range</span>
          <input
            type="number"
            class="vstd-num-input"
            :value="r(`vs_to_double.${row.key}.range_min`) ?? ''"
            :disabled="!editable"
            placeholder="from"
            @input="onNumInput(`vs_to_double.${row.key}.range_min`, $event.target.value)"
          />
          <span class="vstd-range-dash">—</span>
          <input
            type="number"
            class="vstd-num-input"
            :value="r(`vs_to_double.${row.key}.range_max`) ?? ''"
            :disabled="!editable"
            placeholder="to"
            @input="onNumInput(`vs_to_double.${row.key}.range_max`, $event.target.value)"
          />
        </span>
        <label class="vstd-check">
          <input
            type="checkbox"
            :checked="!!r(`vs_to_double.${row.key}.third_fourth_seat`)"
            :disabled="!editable"
            @change="t(`vs_to_double.${row.key}.third_fourth_seat`, $event.target.checked)"
          />
          <span>3rd/4th seat</span>
        </label>
      </div>
    </div>
  </section>
</template>

<script setup>
import RichSuitField from './RichSuitField.vue'
import { colorizeSuits } from '../../utils/cardFormatting.js'

const JUMP_SHIFT_OPTIONS = [
  { value: 'weak',    label: 'Weak' },
  { value: 'inv',     label: 'Invitational' },
  { value: 'forcing', label: 'Forcing' },
  { value: 'fit',     label: 'Fit' }
]

const TWO_NT_ROWS = [
  { key: 'two_nt_raise_minors', label: '♣/♦' },
  { key: 'two_nt_raise_majors', label: '♥/♠' }
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

function pickJumpShift(value, checked) {
  if (!props.editable) return
  props.writeField('vs_to_double.jump_shift', checked ? value : null)
}

function onNumInput(path, raw) {
  if (!props.editable) return
  if (raw === '' || raw == null) {
    props.writeField(path, null)
    return
  }
  const n = Number(raw)
  props.writeField(path, Number.isFinite(n) ? n : null)
}
</script>

<style scoped>
.vstd-panel {
  margin-bottom: 20px;
  padding: 14px 16px;
  background: white;
  border: 1px solid var(--card-border, #e0ddd7);
  border-radius: var(--radius-card, 10px);
}

.vstd-title {
  font-family: var(--font-heading, 'Source Serif 4', serif);
  font-size: 15px;
  color: var(--green-dark, #2d6a4f);
  margin: 0 0 12px;
}

.vstd-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 0;
  border-bottom: 1px solid var(--card-border, #e0ddd7);
  font-size: 13px;
}

.vstd-row:last-of-type { border-bottom: none; }

.vstd-label {
  flex: 0 0 130px;
  color: var(--text-secondary, #6b7280);
}

.vstd-checks {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 14px;
}

.vstd-check {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  color: var(--text-primary, #1a1a1a);
}

.vstd-check input { accent-color: var(--green-mid, #40916c); cursor: pointer; }
.vstd-check input:disabled { cursor: not-allowed; }

.vstd-2nt {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--card-border, #e0ddd7);
}

.vstd-2nt-head {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-secondary, #6b7280);
  margin-bottom: 6px;
}

.vstd-2nt-row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 4px 0;
  font-size: 13px;
}

.vstd-2nt-suit {
  flex: 0 0 60px;
  font-weight: 600;
  color: var(--text-primary, #1a1a1a);
}

.vstd-2nt-suit :deep(.suit-red)   { color: #d32f2f; }
.vstd-2nt-suit :deep(.suit-black) { color: #1a1a1a; }

.vstd-2nt-range {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.vstd-range-label {
  font-size: 12px;
  color: var(--text-secondary, #6b7280);
  margin-right: 4px;
}

.vstd-num-input {
  width: 56px;
  font-family: inherit;
  font-size: 13px;
  padding: 3px 6px;
  border: 1px solid var(--card-border, #e0ddd7);
  border-radius: 6px;
  background: white;
}

.vstd-num-input:focus {
  outline: none;
  border-color: var(--green-mid, #40916c);
  box-shadow: 0 0 0 2px var(--green-pale, #d8f3dc);
}

.vstd-num-input:disabled { background: #f9fafb; cursor: not-allowed; }

.vstd-range-dash { color: var(--text-tertiary, #9ca3af); }
</style>
