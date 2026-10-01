<template>
  <div class="app">
    <div class="local-note" role="note">
      <span>
        Your cards are kept in this browser, with no account. Clearing the browser's data removes
        them, so use <strong>Export Content</strong> to keep a copy.
      </span>
      <button
        class="handoff"
        :disabled="!currentCard"
        title="Open Bridge Classroom with this card, to save it to your account there"
        @click="onSaveToBridgeClassroom"
      >Save to Bridge Classroom</button>
    </div>
    <ConventionCardEditor :storage="browserStorage" />
  </div>
</template>

<script setup>
import { computed } from 'vue'
import ConventionCardEditor from './editor/ConventionCardEditor.vue'
import { useCardEditor } from './editor/useCardEditor.js'
import { browserStorage } from './browserStorage.js'
import { bridgeClassroomUrl } from './handoffToBridgeClassroom.js'

const editor = useCardEditor(browserStorage)
// The card as it stands, unsaved edits included.
const currentCard = computed(() => {
  const card = editor.currentCard.value
  return card && { ...card, card_data: editor.editedCardData.value || card.card_data }
})

async function onSaveToBridgeClassroom() {
  if (!currentCard.value) return
  window.open(await bridgeClassroomUrl(currentCard.value), '_blank', 'noopener')
}
</script>

<style scoped>
.app {
  max-width: var(--max-width);
  margin: 0 auto;
  padding: 12px 16px 32px;
}
.local-note {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  padding: 10px 14px;
  margin-bottom: 8px;
  border: 1px solid var(--card-border);
  border-radius: var(--radius-card);
  background: var(--green-pale);
  color: var(--text-primary);
  font-size: 14px;
}
.handoff {
  font: inherit;
  font-weight: 600;
  padding: 6px 12px;
  border: 1px solid var(--green-dark);
  border-radius: var(--radius-button);
  background: var(--green-dark);
  color: #fff;
  cursor: pointer;
}
.handoff:disabled { opacity: 0.5; cursor: default; }
</style>
