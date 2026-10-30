<template>
  <div v-if="merge" class="choice-overlay" @keydown.esc="emit('done', null)">
    <div class="choice-dialog conflict-dialog" role="dialog" aria-modal="true" aria-labelledby="conflict-title">
      <p id="conflict-title" class="choice-title">Your partner saved this card while you were editing it</p>
      <p class="choice-line">
        Their other changes are in. {{ merge.conflicts.length === 1 ? 'One field' : `${merge.conflicts.length} fields` }}
        you both changed differently: choose which to keep.
      </p>
      <div class="conflict-list">
        <div v-for="c in merge.conflicts" :key="c.path" class="conflict">
          <div class="conflict-field">
            {{ labelOf(c.path) }}
            <span class="conflict-was">was {{ show(c.base) }}</span>
          </div>
          <label class="conflict-pick">
            <input type="radio" :name="c.path" value="mine" v-model="choices[c.path]" />
            Yours: <strong>{{ show(c.mine) }}</strong>
          </label>
          <label class="conflict-pick">
            <input type="radio" :name="c.path" value="theirs" v-model="choices[c.path]" />
            Theirs: <strong>{{ show(c.theirs) }}</strong>
          </label>
        </div>
      </div>
      <div class="choice-buttons">
        <button class="choice-btn primary" @click="emit('done', { ...choices })">Save</button>
        <button class="choice-btn" @click="emit('done', null)">Keep editing</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { reactive, watch } from 'vue'
import { field } from '../../../js/spec.js'

// The fields two partners changed differently (useCardEditor's
// pendingMerge, from mergeCards): for each, keep yours or theirs. Emits
// 'done' with { path: 'mine' | 'theirs' }, or null to keep editing.
const props = defineProps({ merge: { type: Object, default: null } })
const emit = defineEmits(['done'])

const choices = reactive({})
watch(() => props.merge, m => {
  for (const k of Object.keys(choices)) delete choices[k]
  for (const c of m?.conflicts || []) choices[c.path] = 'mine'
}, { immediate: true })

const labelOf = path => field(path)?.label || path

function show(v) {
  if (v === undefined || v === null || v === '') return 'not set'
  if (v === true) return 'yes'
  if (v === false) return 'no'
  if (Array.isArray(v)) return v.join(', ')
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}
</script>

<style scoped>
.choice-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(17, 24, 39, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.choice-dialog {
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.2);
  padding: 20px 22px;
  max-width: 560px;
  width: 100%;
  font-size: 15px;
  color: var(--text-primary, #1a1a1a);
}
.choice-title { font-weight: 600; margin: 0 0 12px; }
.choice-line { margin: 0 0 8px; line-height: 1.5; }
.conflict-list { max-height: 50vh; overflow: auto; margin: 8px 0; }
.conflict { padding: 10px 0; border-top: 1px solid var(--card-border, #e0ddd7); }
.conflict-field { font-weight: 600; margin-bottom: 4px; }
.conflict-was { font-weight: 400; color: var(--text-secondary, #6b7280); margin-left: 6px; }
.conflict-pick { display: block; padding: 2px 0; cursor: pointer; }
.conflict-pick input { accent-color: var(--green-mid, #40916c); margin-right: 6px; }
.choice-buttons { display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap; margin-top: 16px; }
.choice-btn {
  font: inherit;
  font-size: 14px;
  padding: 8px 14px;
  border-radius: 6px;
  border: 1px solid var(--card-border, #d1d5db);
  background: #fff;
  cursor: pointer;
}
.choice-btn.primary {
  background: var(--green-dark, #2d6a4f);
  border-color: var(--green-dark, #2d6a4f);
  color: #fff;
  font-weight: 600;
}
</style>
