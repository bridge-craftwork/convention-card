<template>
  <div v-if="open" class="choice-overlay" @keydown.esc="answer(cancelValue)">
    <div class="choice-dialog" role="dialog" aria-modal="true" :aria-labelledby="titleId">
      <p :id="titleId" class="choice-title">{{ content.title }}</p>
      <!-- Dated lines: the dates in one column, so they line up to compare. -->
      <div v-if="content.dated?.length" class="choice-dated">
        <template v-for="(d, i) in content.dated" :key="i">
          <span class="choice-when">{{ d.when }}</span>
          <span class="choice-what">— {{ d.what }}</span>
        </template>
      </div>
      <p v-for="(line, i) in content.lines || []" :key="'l' + i" class="choice-line">{{ line }}</p>
      <div v-for="(g, i) in content.groups || []" :key="'g' + i" class="choice-group">
        <p class="choice-line">{{ g.heading }}</p>
        <ul><li v-for="(item, j) in g.items" :key="j">{{ item }}</li></ul>
      </div>
      <div class="choice-buttons">
        <button
          v-for="(b, i) in content.buttons"
          :key="i"
          :ref="el => { if (i === 0) firstButton = el }"
          class="choice-btn"
          :class="{ primary: b.primary }"
          @click="answer(b.value)"
        >{{ b.label }}</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { nextTick, ref } from 'vue'

// A question or a notice drawn in the page, instead of the browser's own
// confirm/alert (which add "<site> says" and can't line up dates). One
// instance per host component; `show(content)` resolves with the value of
// the button chosen. content: { title, dated?: [{ when, what }], lines?,
// groups?: [{ heading, items }], buttons: [{ label, value, primary? }] }.
const open = ref(false)
const content = ref({ title: '', buttons: [] })
const firstButton = ref(null)
const cancelValue = ref(null)
const titleId = `choice-${Math.random().toString(36).slice(2)}`
let resolve = null

async function show(c) {
  content.value = c
  cancelValue.value = c.buttons.at(-1)?.value ?? null
  open.value = true
  await nextTick()
  firstButton.value?.focus()
  return new Promise(r => { resolve = r })
}

function answer(value) {
  open.value = false
  resolve?.(value)
  resolve = null
}

defineExpose({ show })
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
  max-width: 480px;
  width: 100%;
  font-size: 15px;
  color: var(--text-primary, #1a1a1a);
}
.choice-title { font-weight: 600; margin: 0 0 12px; }
.choice-dated {
  display: grid;
  grid-template-columns: max-content 1fr;
  column-gap: 8px;
  row-gap: 4px;
  margin: 0 0 12px;
}
.choice-when { font-variant-numeric: tabular-nums; white-space: nowrap; }
.choice-what { color: var(--text-secondary, #6b7280); }
.choice-line { margin: 0 0 8px; line-height: 1.5; }
.choice-group ul { margin: 0 0 10px; padding-left: 20px; max-height: 40vh; overflow: auto; }
.choice-group li { line-height: 1.5; }
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
