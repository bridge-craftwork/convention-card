<template>
  <details v-if="result.suggestions.length || result.dismissed.length" class="note-suggestions" :open="open"
           @toggle="open = $event.target.open">
    <summary>
      <template v-if="result.suggestions.length">
        Your notes name {{ result.suggestions.length }}
        {{ result.suggestions.length === 1 ? 'convention' : 'conventions' }} the card doesn't play yet
      </template>
      <template v-else>No new conventions named in your notes</template>
    </summary>
    <p class="why">
      Adding one ticks its box, so tools that read the card (a bidding bot, practice deals) know you play it.
      Your notes stay as you wrote them.
    </p>

    <ul v-if="result.suggestions.length">
      <li v-for="s in result.suggestions" :key="s.id">
        <div class="what">
          <strong>{{ s.name }}</strong>
          <span class="where" :title="s.found.map(f => `${f.label}: ${f.excerpt}`).join('\n')">
            in {{ s.found[0].label }}: “{{ s.found[0].excerpt }}”<template v-if="s.found.length > 1"> and {{ s.found.length - 1 }} more</template>
          </span>
        </div>
        <div v-if="canEdit" class="actions">
          <button class="btn btn-small btn-add" :title="addTitle(s)" @click="accept(s)">Add</button>
          <button class="btn btn-small" title="Not a convention we play: don't suggest it again" @click="dismiss(s)">Not this</button>
        </div>
      </li>
    </ul>

    <div class="footer">
      <button v-if="canEdit && result.suggestions.length > 1" class="btn btn-small btn-add" @click="acceptAll">
        Add all {{ result.suggestions.length }}
      </button>
      <span v-if="!canEdit" class="muted">Duplicate this card to add them to your own copy.</span>
      <span v-if="result.dismissed.length" class="dismissed">
        {{ result.dismissed.length }} turned down before
        <span class="dismissed-names">({{ result.dismissed.map(s => s.name).join(', ') }})</span>
        <button v-if="canEdit" class="link" title="Suggest them again" @click="reask">Ask again</button>
      </span>
    </div>
  </details>
</template>

<script setup>
import { computed, ref } from 'vue'
import { suggestConventions, acceptSuggestion, dismissSuggestion, askAgain } from '../../../../js/recogniseConventions.js'
import { field } from '../../../../js/spec.js'

// Conventions the card's notes name but its boxes don't (DESIGN.md,
// "Conventions named in text"), for a person to confirm one by one. The
// editor owns the card: `change` hands it a function to apply to the
// card_data (it switches to edit mode first, and the change is saved like
// any other edit).
const props = defineProps({
  cardData: { type: Object, default: null },
  canEdit: { type: Boolean, default: false },
})
const emit = defineEmits(['change'])

const open = ref(false)
const result = computed(() => (props.cardData ? suggestConventions(props.cardData) : { suggestions: [], dismissed: [] }))

const addTitle = s => (s.set.field
  ? `Tick “${field(s.set.field)?.label || s.set.field}”`
  : 'Add it to the card’s other agreements (it has no box of its own)')

const accept = s => emit('change', data => acceptSuggestion(data, s))
const dismiss = s => emit('change', data => dismissSuggestion(data, s.id))
const reask = () => emit('change', data => askAgain(data))
function acceptAll() {
  const all = result.value.suggestions
  emit('change', data => { for (const s of all) acceptSuggestion(data, s) })
}
</script>

<style scoped>
.note-suggestions {
  margin: -4px 0 12px;
  padding: 8px 12px;
  background: #f0f7f2;
  border: 1px solid #b7dcc3;
  border-radius: 6px;
  font-size: 13px;
  color: var(--text-primary, #1a1a1a);
}
summary { cursor: pointer; font-weight: 600; color: var(--green-dark, #2d6a4f); }
.why { margin: 6px 0 4px; color: var(--text-secondary, #6b7280); }
ul { list-style: none; margin: 6px 0 0; padding: 0; }
li { display: flex; gap: 10px; align-items: center; justify-content: space-between; padding: 5px 0; border-top: 1px solid #dcebe1; }
.what { min-width: 0; }
.where { display: block; color: var(--text-secondary, #6b7280); overflow-wrap: anywhere; }
.actions { display: flex; gap: 6px; flex-shrink: 0; }
.btn { font: inherit; font-size: 12px; padding: 3px 10px; border: 1px solid var(--card-border, #e0ddd7); border-radius: var(--radius-button, 6px); background: #fff; cursor: pointer; }
.btn-add { border-color: var(--green-dark, #2d6a4f); color: var(--green-dark, #2d6a4f); font-weight: 600; }
.btn-add:hover { background: var(--green-pale, #d8f3dc); }
.footer { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin-top: 8px; }
.dismissed { color: var(--text-secondary, #6b7280); }
.dismissed-names { color: var(--text-muted, #9ca3af); }
.link { font: inherit; border: none; background: none; padding: 0; margin-left: 4px; color: var(--green-dark, #2d6a4f); text-decoration: underline; cursor: pointer; }
.muted { color: var(--text-secondary, #6b7280); }
@media print { .note-suggestions { display: none; } }
</style>
