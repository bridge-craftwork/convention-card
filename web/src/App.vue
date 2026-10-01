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
    <div v-if="arrival.message" class="arrival" :class="{ error: arrival.error }" role="status">
      {{ arrival.message }}
    </div>
    <ConventionCardEditor :storage="browserStorage" />
  </div>
</template>

<script setup>
import { computed, onMounted, onBeforeUnmount, reactive, watch } from 'vue'
import ConventionCardEditor from './editor/ConventionCardEditor.vue'
import { useCardEditor } from './editor/useCardEditor.js'
import { browserStorage } from './browserStorage.js'
import { bridgeClassroomUrl } from './handoffToBridgeClassroom.js'
import { decodeCardFromUrl } from '../../js/handoff.js'

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

// ─── A card handed over in the URL ─────────────────────────────
// Another tool (the Better BBO Convention Card extension, say) opens
// …/card/#import=v1.<data> (js/handoff.js; DECISIONS.md, 20). The card is
// added to this browser's cards and opened; the address bar is cleared.
const arrival = reactive({ message: '', error: false })
let receiving = false

function editorIdle() {
  if (!editor.cardLoading.value) return Promise.resolve()
  return new Promise(resolve => {
    const stop = watch(editor.cardLoading, loading => { if (!loading) { stop(); resolve() } })
  })
}

async function receiveFromUrl() {
  const match = /^#import=(v1\.[A-Za-z0-9_-]+)$/.exec(window.location.hash)
  if (!match || receiving) return
  receiving = true
  history.replaceState(null, '', window.location.pathname + window.location.search)
  try {
    const record = await decodeCardFromUrl(match[1])
    // Let the editor's first load finish, so it cannot replace the new card.
    await editorIdle()
    const name = record.name || 'Imported convention card'
    await editor.createCard({ name, description: record.description || null, cardData: record.card_data })
    Object.assign(arrival, { message: `Added “${name}” to the cards in this browser.`, error: false })
  } catch (err) {
    Object.assign(arrival, { message: `Could not open the card you sent: ${err.message}`, error: true })
  } finally {
    receiving = false
  }
}

onMounted(() => {
  receiveFromUrl()
  window.addEventListener('hashchange', receiveFromUrl)
})
onBeforeUnmount(() => window.removeEventListener('hashchange', receiveFromUrl))
</script>

<style scoped>
.app {
  max-width: var(--max-width);
  margin: 0 auto;
  padding: 12px 16px 32px;
}
.local-note,
.arrival {
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
.arrival { background: #fff; }
.arrival.error { background: #fee2e2; }
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
