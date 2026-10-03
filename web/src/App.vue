<template>
  <div class="app">
    <div v-if="arrival.message" class="arrival" :class="{ error: arrival.error }" role="status">
      {{ arrival.message }}
      <button class="dismiss" title="Dismiss" @click="arrival.message = ''">×</button>
    </div>

    <!-- Home: what the editor does, and the cards in this browser. -->
    <CardCatalog
      v-if="route.view === 'home'"
      ref="catalog"
      :storage="browserStorage"
      sample-id="starter"
      :card-link="id => `#/card/${encodeURIComponent(id)}`"
      @open="openCard"
    />

    <!-- One card, in the editor. -->
    <template v-else>
      <div class="card-bar">
        <a class="back" href="#/" @click.prevent="goHome">← All cards</a>
        <div class="local-note" role="note">
          <span>Kept in this browser. Use <strong>Export Content</strong> to keep a copy.</span>
          <button
            class="handoff"
            :disabled="!currentCard"
            title="Open Bridge Classroom with this card, to save it to your account there"
            @click="onSaveToBridgeClassroom"
          >Save to Bridge Classroom</button>
        </div>
      </div>
      <ConventionCardEditor :storage="browserStorage" />
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, onBeforeUnmount, reactive, ref, watch } from 'vue'
import ConventionCardEditor from './editor/ConventionCardEditor.vue'
import CardCatalog from './editor/CardCatalog.vue'
import { useCardEditor } from './editor/useCardEditor.js'
import { browserStorage } from './browserStorage.js'
import { bridgeClassroomUrl } from './handoffToBridgeClassroom.js'
import { decodeCardFromUrl } from '../../js/handoff.js'
import { createTool, GLOBAL } from './tool.js'

const editor = useCardEditor(browserStorage)
const catalog = ref(null)
// The card as it stands, unsaved edits included.
const currentCard = computed(() => {
  const card = editor.currentCard.value
  return card && { ...card, card_data: editor.editedCardData.value || card.card_data }
})

async function onSaveToBridgeClassroom() {
  if (!currentCard.value) return
  window.open(await bridgeClassroomUrl(currentCard.value), '_blank', 'noopener')
}

// ─── Two views, by the URL's fragment ──────────────────────────
//   #/ (or nothing)    home: the table of cards
//   #/card/<id>        that card in the editor
//   #import=v1.<data>  a card handed over (below), then opened
const route = reactive({ view: 'home', id: null })

function readRoute() {
  const m = /^#\/card\/(.+)$/.exec(window.location.hash)
  if (m) Object.assign(route, { view: 'card', id: decodeURIComponent(m[1]) })
  else if (!/^#import=/.test(window.location.hash)) Object.assign(route, { view: 'home', id: null })
}

function editorIdle() {
  if (!editor.cardLoading.value) return Promise.resolve()
  return new Promise(resolve => {
    const stop = watch(editor.cardLoading, loading => { if (!loading) { stop(); resolve() } })
  })
}

// Load the routed card. Called before the editor mounts where it can be, so
// the editor finds a card loading and does not load the primary over it.
let routeLoading = false
async function showRouteCard() {
  if (route.view !== 'card' || editor.currentCard.value?.id === route.id) return
  routeLoading = true
  try {
    // The default load also lists the cards for the editor's picker; a
    // routed open does the same.
    if (!editor.userCardLinks.value.length) editor.loadUserCardLinks()
    await editor.switchCard(route.id)
  } finally {
    routeLoading = false
  }
}

function openCard(id) {
  window.location.hash = `#/card/${encodeURIComponent(id)}`
}

function goHome() {
  window.location.hash = '#/'
}

// The editor's own card picker switches cards: keep the address in step
// (but not while the address itself is loading a card).
watch(() => editor.currentCard.value?.id, id => {
  if (route.view === 'card' && id && id !== route.id && !routeLoading) {
    history.replaceState(null, '', `#/card/${encodeURIComponent(id)}`)
    route.id = id
  }
})

async function addAndOpen(record, how) {
  await editorIdle()
  const name = record.name || 'Imported convention card'
  const id = await editor.createCard({ name, description: record.description || null, cardData: record.card_data })
  Object.assign(arrival, { message: `${how} “${name}”.`, error: false })
  openCard(id)
  return id
}

// ─── A card handed over in the URL ─────────────────────────────
// Another tool (the Better BBO Convention Card extension, say) opens
// …/card/#import=v1.<data> (js/handoff.js; DECISIONS.md, 20). The card is
// added to this browser's cards and opened.
const arrival = reactive({ message: '', error: false })
let receiving = false

async function receiveFromUrl() {
  const match = /^#import=(v1\.[A-Za-z0-9_-]+)$/.exec(window.location.hash)
  if (!match || receiving) return
  receiving = true
  history.replaceState(null, '', window.location.pathname + window.location.search)
  try {
    const record = await decodeCardFromUrl(match[1])
    await addAndOpen(record, 'Added to the cards in this browser:')
  } catch (err) {
    Object.assign(arrival, { message: `Could not open the card you sent: ${err.message}`, error: true })
  } finally {
    receiving = false
  }
}

async function onHashChange() {
  if (/^#import=/.test(window.location.hash)) return receiveFromUrl()
  readRoute()
  await showRouteCard()
}

// ─── The tool contract: window.card ────────────────────────────
// The same reading and checking as the Import button (src/tool.js;
// reference.txt describes it). setInput adds the card to this browser's
// cards and opens it, as a hand-off does.
window[GLOBAL] = createTool({
  current: () => currentCard.value,
  async open(record) {
    await addAndOpen(record, 'Added')
  },
})

readRoute()
showRouteCard()

onMounted(async () => {
  window.addEventListener('hashchange', onHashChange)
  if (/^#import=/.test(window.location.hash)) await receiveFromUrl()
})
onBeforeUnmount(() => window.removeEventListener('hashchange', onHashChange))
</script>

<style scoped>
.app {
  max-width: var(--max-width);
  margin: 0 auto;
  padding: 12px 16px 32px;
}
.card-bar {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  margin-bottom: 8px;
}
.back {
  font-weight: 600;
  color: var(--green-dark);
  text-decoration: none;
  white-space: nowrap;
}
.back:hover { text-decoration: underline; }
.local-note,
.arrival {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  padding: 8px 14px;
  border: 1px solid var(--card-border);
  border-radius: var(--radius-card);
  background: var(--green-pale);
  color: var(--text-primary);
  font-size: 14px;
}
.local-note { flex: 1; }
.arrival { background: #fff; margin-bottom: 8px; }
.arrival.error { background: #fee2e2; }
.dismiss { border: none; background: none; font-size: 18px; cursor: pointer; color: inherit; }
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
