<template>
  <div class="catalog">
    <p v-if="notice.message" class="notice" :class="{ error: notice.error }" role="status">
      {{ notice.message }}
    </p>

    <section class="intro">
      <h1 v-if="!embedded">Convention card</h1>
      <p class="lede">
        Build and edit your partnerships' convention cards, print the ACBL card, and move cards
        between BBO, bridgeodex, BBA and Bridge Classroom. No account needed.
      </p>

      <div class="facts">
        <div class="fact">
          <h2>Cards it prints</h2>
          <p>
            The <strong>ACBL Classic</strong> card most clubs use and the <strong>ACBL New</strong> card,
            as fillable PDFs. Each PDF carries the card inside it, so you can import it again, even after
            changing a box by hand.
          </p>
        </div>
        <div class="fact">
          <h2>Import and export</h2>
          <p>
            <strong>Import</strong> reads this editor's own file, BBO's and bridgeodex's card exports, a
            BBA <code>.bbsa</code> file, and filled-in ACBL PDFs. <strong>Export Content</strong> writes this
            editor's file or a <code>.bbsa</code>.
          </p>
        </div>
        <div v-if="showStorage" class="fact">
          <h2>Where your cards are kept</h2>
          <p>
            <strong>In this browser</strong>, on this computer: clearing the browser's data deletes them.
            <strong>Export Content</strong> saves a copy you keep yourself, and
            <strong>Save to Bridge Classroom</strong> keeps a card in your account there.
          </p>
        </div>
        <div class="fact">
          <h2>On BBO</h2>
          <p>
            The <a href="https://github.com/bridge-craftwork/Better-BBO-Convention-Card" target="_blank" rel="noopener">Better BBO Convention Card</a>
            browser extension improves BBO's convention card pages; a button to open a BBO card here is on
            its way.
          </p>
        </div>
      </div>
      <p class="more">
        More in the <a href="https://bridge-craftwork.com/docs/card/" target="_blank" rel="noopener">guide</a>; for programs, the
        <a href="https://bridge-craftwork.com/card/reference.txt" target="_blank" rel="noopener">card reference</a>.
      </p>
    </section>

    <section class="cards">
      <div class="cards-head">
        <h2>Your cards</h2>
        <div class="cards-actions">
          <button v-if="canCreate" class="btn btn-primary" :disabled="busy" @click="onNew">New card</button>
          <button v-if="canCreate" class="btn" :disabled="busy" @click="fileInput?.click()">Import a card</button>
          <input
            ref="fileInput"
            type="file"
            accept="application/json,.json,application/pdf,.pdf,.bbsa"
            style="display:none"
            @change="onFile"
          />
        </div>
      </div>
      <p v-if="error" class="error">{{ error }}</p>
      <p v-if="loading" class="muted">Loading your cards…</p>

      <table v-else class="card-table">
        <thead>
          <tr>
            <th>Card</th>
            <th>Names on the card</th>
            <th>System</th>
            <th>Level</th>
            <th>Conventions</th>
            <th v-for="d in columns" :key="d.key">{{ d.label }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.id" class="card-row" tabindex="0"
              @click="$emit('open', row.id)" @keydown.enter="$emit('open', row.id)">
            <td class="name">
              <a :href="cardLink ? cardLink(row.id) : undefined" @click.prevent="$emit('open', row.id)">{{ row.name }}</a>
              <span v-if="row.primary" class="tag" title="Opens first">primary</span>
              <span v-if="row.readOnly" class="tag muted-tag" title="Duplicate it to make your own copy">sample</span>
            </td>
            <td>{{ row.names || '—' }}</td>
            <td>{{ row.system || '—' }}</td>
            <td class="card-level">
              <span v-if="row.cardLevel" :class="'lvl lvl-' + row.cardLevel.band" :title="row.cardLevel.why">
                {{ bandLabel(row.cardLevel.band) }} · {{ row.cardLevel.level }}
              </span>
              <span v-else class="muted">—</span>
            </td>
            <td>
              <div v-if="row.levels.total" class="levels">
                <span class="total">{{ row.levels.total }}</span>
                <span class="bands">
                  <span v-for="b in BANDS" v-show="row.levels.bands[b.name]" :key="b.name"
                        :class="'lvl lvl-' + b.name" :title="b.label">{{ row.levels.bands[b.name] }} {{ b.label.toLowerCase() }}</span>
                </span>
                <span class="highest" title="The highest level among its conventions, of 10">highest {{ row.levels.highest }}</span>
              </div>
              <span v-else class="muted">none ticked</span>
            </td>
            <td v-for="d in columns" :key="d.key">{{ d.value(row.data) || '—' }}</td>
          </tr>
        </tbody>
      </table>
      <p v-if="!loading && !rows.length" class="muted">
        No cards yet: start a <strong>New card</strong> or <strong>Import a card</strong>.
      </p>
      <p v-if="!loading && rows.length === 1 && rows[0].readOnly" class="muted">
        Only the sample so far: open it and use <strong>Duplicate</strong> to make it yours, or start a
        <strong>New card</strong>.
      </p>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { summarize, distinguishing } from './cardSummary.js'
import { bandLabel } from './levels.js'
import { useCardEditor } from './useCardEditor.js'
import { importCard } from '../../../js/importCard.js'
import { LEVEL_BANDS } from '../../../js/spec.js'

// The editor's home page: what it does, and a table of the person's cards.
// A host shows it in place of the editor until a card is chosen, and opens
// that card on `open` (the standalone app at #/card/<id>, Bridge Classroom
// at /convention-card?card=<id>). It reads and creates cards through the
// storage adapter and the shared editor state only (DESIGN.md, "The editor").
const props = defineProps({
  storage: { type: Object, required: true },
  overlays: { type: Object, default: null },
  // The read-only sample card's id, listed after the person's own cards.
  sampleId: { type: String, default: null },
  // Inside a host's own page: no page title.
  embedded: { type: Boolean, default: false },
  // Explain where cards are kept (the standalone app keeps them in the
  // browser; a host with accounts needs no such note).
  showStorage: { type: Boolean, default: true },
  // The address of a card, for its link (so it can open in a new tab).
  cardLink: { type: Function, default: null },
})
const emit = defineEmits(['open'])

const cc = useCardEditor(props.storage, props.overlays || undefined)
const BANDS = LEVEL_BANDS
const cards = ref([])
const loading = ref(true)
const busy = ref(false)
const error = ref('')
const notice = reactive({ message: '', error: false })
const fileInput = ref(null)
const canCreate = computed(() => !!props.storage.user?.value)

async function load() {
  loading.value = true
  error.value = ''
  try {
    const links = canCreate.value ? await props.storage.listLinks() : []
    const own = await Promise.all(links.map(async l => ({ ...(await props.storage.load(l.card_id)), primary: !!l.is_primary })))
    own.sort((a, b) => (b.primary - a.primary) || String(a.name).localeCompare(String(b.name)))
    const sample = props.sampleId ? [{ ...(await props.storage.load(props.sampleId)), readOnly: true }] : []
    cards.value = [...own, ...sample]
  } catch (err) {
    error.value = err.message || 'Could not read your cards'
  } finally {
    loading.value = false
  }
}

const rows = computed(() => cards.value.map(c => ({ ...summarize(c), primary: !!c.primary, readOnly: !!c.readOnly, data: c.card_data || {} })))
const columns = computed(() => distinguishing(cards.value))

async function create(record) {
  const name = record.name || 'Imported convention card'
  return cc.createCard({ name, description: record.description || null, cardData: record.card_data })
}

async function onNew() {
  busy.value = true
  try {
    const id = await cc.createCard({ name: 'My convention card', cardData: { metadata: { name: 'My convention card' } } })
    cc.enterEditMode()
    emit('open', id)
  } catch (err) {
    Object.assign(notice, { message: err.message || 'Could not create a card', error: true })
  } finally {
    busy.value = false
  }
}

async function onFile(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  busy.value = true
  try {
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
    const input = isPdf ? await file.arrayBuffer() : await file.text()
    const read = await importCard(input, { name: file.name.replace(/\.[^.]*$/, '') })
    emit('open', await create(read))
  } catch (err) {
    Object.assign(notice, { message: `Could not import ${file.name}: ${err.message}`, error: true })
  } finally {
    busy.value = false
  }
}

onMounted(load)
defineExpose({ reload: load })
</script>

<style scoped>
.catalog { display: flex; flex-direction: column; gap: 20px; }
h1 { font-family: var(--font-heading); font-size: 32px; margin: 8px 0 6px; color: var(--green-dark); }
h2 { font-family: var(--font-heading); font-size: 18px; margin: 0 0 6px; }
.lede { font-size: 17px; color: var(--text-secondary); margin: 0 0 16px; max-width: 760px; line-height: 1.5; }
.facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; }
.fact { background: #fff; border: 1px solid var(--card-border); border-radius: var(--radius-card); padding: 14px 16px; }
.fact p { margin: 0; font-size: 14px; line-height: 1.55; color: var(--text-primary); }
.more { font-size: 14px; color: var(--text-secondary); margin: 10px 0 0; }
a { color: var(--green-dark); }
code { font-size: 13px; }

.cards { background: #fff; border: 1px solid var(--card-border); border-radius: var(--radius-card); padding: 16px; }
.cards-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 10px; }
.cards-actions { display: flex; gap: 8px; }
.btn { font: inherit; font-size: 14px; padding: 7px 14px; border: 1px solid var(--card-border); border-radius: var(--radius-button); background: #fff; cursor: pointer; }
.btn-primary { background: var(--green-dark); border-color: var(--green-dark); color: #fff; font-weight: 600; }

.card-table { width: 100%; border-collapse: collapse; font-size: 14px; }
.card-table th { text-align: left; font-weight: 600; color: var(--text-secondary); font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; padding: 8px 10px; border-bottom: 1px solid var(--card-border); }
.card-table td { padding: 10px; border-bottom: 1px solid #efede8; vertical-align: top; }
.card-row { cursor: pointer; }
.card-row:hover, .card-row:focus { background: #f6faf7; outline: none; }
.name a { font-weight: 600; text-decoration: none; }
.tag { margin-left: 6px; font-size: 11px; padding: 1px 7px; border-radius: 999px; background: var(--green-pale); color: var(--green-dark); }
.muted-tag { background: #eee; color: var(--text-secondary); }
.levels { display: flex; flex-wrap: wrap; gap: 6px; align-items: baseline; }
.total { font-weight: 600; }
.bands { display: inline-flex; gap: 4px; flex-wrap: wrap; }
.lvl { font-size: 12px; padding: 0 6px; border-radius: 999px; background: #f1f1ef; white-space: nowrap; }
.card-level .lvl { font-weight: 600; }
.lvl-basic { background: #e8f5e9; } .lvl-intermediate { background: #e3f2fd; }
.lvl-advanced { background: #fff3e0; } .lvl-expert { background: #fce4ec; }
.highest { font-size: 12px; color: var(--text-secondary); }
.muted { color: var(--text-secondary); font-size: 14px; }
.error { color: #b91c1c; }
.notice { margin: 0; padding: 8px 14px; border-radius: var(--radius-card); background: #fff; border: 1px solid var(--card-border); font-size: 14px; }
.notice.error { background: #fee2e2; color: #991b1b; }

@media (max-width: 720px) {
  .card-table th:nth-child(n+4), .card-table td:nth-child(n+4) { display: none; }
}
</style>
