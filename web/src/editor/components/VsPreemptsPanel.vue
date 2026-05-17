<template>
  <section class="vsp-panel">
    <h4 class="vsp-title">Vs Preempts</h4>

    <div class="vsp-row">
      <span class="vsp-label">Takeout double thru</span>
      <RichSuitField
        :model-value="r('vs_preempts.takeout_double_thru') || ''"
        :editable="editable"
        block
        placeholder="e.g. 4♥"
        @update:modelValue="writeText('vs_preempts.takeout_double_thru', $event)"
      />
      <label class="vsp-check">
        <input
          type="checkbox"
          :checked="!!r('vs_preempts.takeout_double_penalty')"
          :disabled="!editable"
          @change="t('vs_preempts.takeout_double_penalty', $event.target.checked)"
        />
        <span>Penalty</span>
      </label>
    </div>

    <div class="vsp-row">
      <span class="vsp-label">2NT overcall</span>
      <RichSuitField
        :model-value="r('vs_preempts.two_nt_overcall') || ''"
        :editable="editable"
        block
        placeholder="e.g. 15-18, takeout"
        @update:modelValue="writeText('vs_preempts.two_nt_overcall', $event)"
      />
    </div>

    <div class="vsp-row">
      <span class="vsp-label">2NT Lebensohl response</span>
      <label class="vsp-check">
        <input
          type="checkbox"
          :checked="!!r('vs_preempts.lebensohl_response')"
          :disabled="!editable"
          @change="t('vs_preempts.lebensohl_response', $event.target.checked)"
        />
        <span>Yes</span>
      </label>
    </div>

    <div class="vsp-row">
      <span class="vsp-label">Cuebid</span>
      <RichSuitField
        :model-value="r('vs_preempts.cuebid') || ''"
        :editable="editable"
        block
        placeholder="e.g. Michaels, asks stopper"
        @update:modelValue="writeText('vs_preempts.cuebid', $event)"
      />
    </div>

    <div class="vsp-row">
      <span class="vsp-label">Jump overcalls</span>
      <RichSuitField
        :model-value="r('vs_preempts.jump_overcalls') || ''"
        :editable="editable"
        block
        placeholder="e.g. natural, 2-suited"
        @update:modelValue="writeText('vs_preempts.jump_overcalls', $event)"
      />
    </div>
  </section>
</template>

<script setup>
import RichSuitField from './RichSuitField.vue'

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
.vsp-panel {
  margin-bottom: 20px;
  padding: 14px 16px;
  background: white;
  border: 1px solid var(--card-border, #e0ddd7);
  border-radius: var(--radius-card, 10px);
}

.vsp-title {
  font-family: var(--font-heading, 'Source Serif 4', serif);
  font-size: 15px;
  color: var(--green-dark, #2d6a4f);
  margin: 0 0 12px;
}

.vsp-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 0;
  border-bottom: 1px solid var(--card-border, #e0ddd7);
  font-size: 13px;
}

.vsp-row:last-of-type { border-bottom: none; }

.vsp-label {
  flex: 0 0 200px;
  color: var(--text-secondary, #6b7280);
}

.vsp-row > .rich-suit-field {
  flex: 1;
  min-width: 0;
}

.vsp-check {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  color: var(--text-primary, #1a1a1a);
}

.vsp-check input { accent-color: var(--green-mid, #40916c); cursor: pointer; }
.vsp-check input:disabled { cursor: not-allowed; }
</style>
