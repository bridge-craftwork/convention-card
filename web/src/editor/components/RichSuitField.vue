<template>
  <span class="rich-suit-field" :class="{ block: block || multiline, multiline: multiline }">
    <template v-if="editing && editable">
      <textarea
        v-if="multiline"
        ref="inputEl"
        class="rich-suit-input rich-suit-textarea"
        :value="modelValue || ''"
        :placeholder="placeholder"
        @input="onInput"
        @blur="onBlur"
      ></textarea>
      <input
        v-else
        ref="inputEl"
        type="text"
        class="rich-suit-input"
        :value="modelValue || ''"
        :placeholder="placeholder"
        @input="onInput"
        @blur="onBlur"
        @keydown.enter.prevent="finishEdit"
      />
    </template>
    <span
      v-else
      class="rich-suit-display"
      :class="{ readonly: !editable, empty: !modelValue, multiline: multiline }"
      :title="editable ? 'Click to edit' : (modelValue || '')"
      tabindex="0"
      @click="onClickEdit"
      @focus="onClickEdit"
      v-html="modelValue ? colorizeSuits(modelValue) : (placeholder || '—')"
    ></span>
  </span>
</template>

<script setup>
import { ref, nextTick } from 'vue'
import { colorizeSuits, normalizeSuitShorthand } from '../../utils/cardFormatting.js'

const props = defineProps({
  modelValue: { type: String, default: '' },
  editable: { type: Boolean, default: false },
  placeholder: { type: String, default: '' },
  block: { type: Boolean, default: false },
  multiline: { type: Boolean, default: false }
})

const emit = defineEmits(['update:modelValue'])

const editing = ref(false)
const inputEl = ref(null)

async function onClickEdit() {
  if (!props.editable) return
  editing.value = true
  await nextTick()
  inputEl.value?.focus()
  inputEl.value?.select?.()
}

function onInput(event) {
  // Emit raw text on each keystroke so isDirty + autosave can react.
  // Normalization is deferred to blur so the user can finish typing
  // a word (e.g. "Spades") without it being mangled mid-word.
  emit('update:modelValue', event.target.value)
}

function onBlur(event) {
  finishEdit(event)
}

function finishEdit(event) {
  const raw = event?.target?.value ?? props.modelValue ?? ''
  const normalized = normalizeSuitShorthand(raw)
  if (normalized !== raw) emit('update:modelValue', normalized)
  editing.value = false
}
</script>

<style scoped>
.rich-suit-field {
  display: inline-block;
  width: 100%;
}

.rich-suit-field.block { display: block; }

.rich-suit-input {
  width: 100%;
  font-family: inherit;
  font-size: 13px;
  padding: 4px 8px;
  border: 1px solid var(--card-border, #e0ddd7);
  border-radius: 6px;
  background: white;
  color: var(--text-primary, #1a1a1a);
  box-sizing: border-box;
}

.rich-suit-input:focus {
  outline: none;
  border-color: var(--green-mid, #40916c);
  box-shadow: 0 0 0 2px var(--green-pale, #d8f3dc);
}

.rich-suit-display {
  display: inline-block;
  width: 100%;
  font-family: inherit;
  font-size: 13px;
  padding: 4px 8px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: white;
  color: var(--text-primary, #1a1a1a);
  cursor: text;
  box-sizing: border-box;
  min-height: 26px;
  line-height: 18px;
  white-space: pre-wrap;
  word-break: break-word;
}

.rich-suit-display.multiline {
  min-height: 80px;
  line-height: 1.5;
}

.rich-suit-textarea {
  min-height: 80px;
  resize: vertical;
  font-family: inherit;
  line-height: 1.5;
}

.rich-suit-display:not(.readonly):hover {
  border-color: var(--card-border, #e0ddd7);
}

.rich-suit-display.readonly {
  cursor: not-allowed;
  background: #f9fafb;
}

.rich-suit-display.empty {
  color: var(--text-tertiary, #9ca3af);
  font-style: italic;
}

.rich-suit-display :deep(.suit-red) { color: #d32f2f; }
.rich-suit-display :deep(.suit-black) { color: #1a1a1a; }
</style>
