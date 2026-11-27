<template>
  <div v-if="open" class="choice-overlay" @click.self="answer(null)" @keydown.esc="answer(null)">
    <div class="choice-dialog pdf-dialog" role="dialog" aria-modal="true" :aria-labelledby="titleId">
      <p :id="titleId" class="choice-title">{{ ACTIONS[action].title }}<template v-if="cardName">: {{ cardName }}</template></p>

      <fieldset class="pdf-choice">
        <legend>Card</legend>
        <label v-for="t in TEMPLATES" :key="t.id" class="template-option" :class="{ chosen: options.template === t.id }">
          <input v-model="options.template" type="radio" name="pdf-template" :value="t.id" />
          <span>
            <span class="option-name">{{ t.name }}</span>
            <span class="option-desc">{{ t.desc }}</span>
          </span>
        </label>
      </fieldset>

      <label class="pdf-choice second-page">
        <span class="legend">Second page <span class="hint">(for printing on both sides)</span></span>
        <select v-model="options.secondPage">
          <option v-for="s in SECOND_PAGES" :key="s.id" :value="s.id">{{ s.name }}</option>
        </select>
        <span v-if="hasNotes != null" class="notes-hint" :class="{ some: hasNotes }">
          {{ hasNotes ? 'This card has notes for a notes page.' : 'This card has no notes yet: a notes page would be empty.' }}
        </span>
      </label>

      <!-- Green by default, as BBO's card shows a partnership's entries
           against the black and red form (#140). -->
      <label class="pdf-choice fillable">
        <input v-model="options.green" type="checkbox" />
        <span>
          What the card says in green
          <span class="option-desc">As BBO's card shows it: your entries stand out from the printed form. Untick for black.</span>
        </span>
      </label>

      <!-- Flat unless asked: it looks as designed in every viewer. A fillable
           card keeps its font in Acrobat and Chrome, but Preview and Safari
           draw its boxes in Helvetica (Rick Wilson, 2026-11-21; #129). -->
      <label v-if="action !== 'print'" class="pdf-choice fillable">
        <input v-model="options.fillable" type="checkbox" />
        <span>
          Fillable, to edit in a PDF app
          <span class="option-desc">Edit it in Acrobat or Chrome. On a Mac, Preview and Safari show its boxes in a plain font, and shrink long entries.</span>
        </span>
      </label>

      <p v-if="note" class="pdf-note">{{ note }}</p>

      <div class="choice-buttons">
        <button class="choice-btn" @click="answer(null)">Cancel</button>
        <button ref="goButton" class="choice-btn primary" @click="answer(options)">{{ ACTIONS[action].go }}</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { nextTick, reactive, ref } from 'vue'
import { TEMPLATES, SECOND_PAGES, savedPdfOptions, savePdfOptions, cardHasNotes } from './pdfActions.js'

// The questions every PDF asks before it is made (Rick Wilson, 2026-11-21):
// which card, what goes on the second page, green or black entries, and,
// for one to keep, whether it is fillable. `ask({ action, card, note })`
// resolves with { template, secondPage, green, fillable }, or null when cancelled; the answers
// are remembered in this browser (pdfActions.js).
const ACTIONS = {
  print: { title: 'Print', go: 'Print' },
  preview: { title: 'Preview PDF', go: 'Preview' },
  export: { title: 'Export PDF', go: 'Download' },
}

const open = ref(false)
const action = ref('export')
const cardName = ref('')
const note = ref('')
const hasNotes = ref(null)
const options = reactive(savedPdfOptions())
const goButton = ref(null)
const titleId = `pdf-${Math.random().toString(36).slice(2)}`
let resolve = null

async function ask({ action: what = 'export', card = null, note: extra = '' } = {}) {
  action.value = what
  cardName.value = card?.name || ''
  note.value = extra
  Object.assign(options, savedPdfOptions())
  hasNotes.value = null
  if (card) cardHasNotes(card).then(v => { hasNotes.value = v }).catch(() => {})
  open.value = true
  await nextTick()
  goButton.value?.focus()
  return new Promise(r => { resolve = r })
}

function answer(value) {
  open.value = false
  const chosen = value && { ...value, fillable: action.value === 'print' ? false : value.fillable }
  if (chosen) savePdfOptions({ ...savedPdfOptions(), template: chosen.template, secondPage: chosen.secondPage, green: chosen.green, ...(action.value !== 'print' && { fillable: chosen.fillable }) })
  resolve?.(chosen)
  resolve = null
}

defineExpose({ ask })
</script>

<style scoped>
.choice-overlay {
  position: fixed;
  inset: 0;
  z-index: 2100;
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
  max-width: 500px;
  width: 100%;
  font-size: 14px;
  color: var(--text-primary, #1a1a1a);
}
.choice-title { font-weight: 600; font-size: 16px; margin: 0 0 14px; }
.pdf-choice { display: block; margin: 0 0 14px; border: none; padding: 0; }
.pdf-choice legend, .legend { display: block; font-weight: 600; font-size: 13px; margin-bottom: 6px; }
.hint { font-weight: 400; color: var(--text-secondary, #6b7280); }
.template-option {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 8px 10px;
  border: 1px solid var(--card-border, #e0ddd7);
  border-radius: 8px;
  margin-bottom: 6px;
  cursor: pointer;
}
.template-option.chosen { border-color: var(--green-mid, #40916c); background: #f6faf7; }
.template-option input { margin-top: 3px; }
.option-name { display: block; font-weight: 600; }
.option-desc { display: block; font-size: 12px; color: var(--text-secondary, #6b7280); margin-top: 2px; }
.second-page select { font: inherit; font-size: 13px; padding: 5px 8px; width: 100%; }
.notes-hint { display: block; font-size: 12px; color: var(--text-secondary, #6b7280); margin-top: 4px; }
.notes-hint.some { color: var(--green-dark, #2d6a4f); }
.fillable { display: flex; gap: 10px; align-items: flex-start; cursor: pointer; }
.fillable input { margin-top: 3px; }
.pdf-note { font-size: 12px; color: #92400e; background: #fef3c7; border-radius: 6px; padding: 6px 10px; margin: 0 0 8px; }
.choice-buttons { display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px; }
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
