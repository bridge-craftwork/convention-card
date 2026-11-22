<template>
  <details v-if="repeats.length" class="note-repeats" :open="open" @toggle="open = $event.target.open">
    <summary>
      {{ repeats.length }} {{ repeats.length === 1 ? 'line' : 'lines' }} of your notes
      {{ repeats.length === 1 ? 'repeats' : 'repeat' }} what the card already says
    </summary>
    <p class="why">
      An earlier import copied these into the notes as well as their boxes. The notes page leaves them out
      already; removing them tidies the notes you see here.
    </p>
    <ul>
      <li v-for="(r, i) in repeats" :key="i">
        <span class="where">{{ label(r.path) }}:</span> {{ r.line }}
      </li>
    </ul>
    <div class="footer">
      <button v-if="canEdit" class="btn btn-small btn-remove" @click="remove">
        Remove {{ repeats.length === 1 ? 'it' : `all ${repeats.length}` }}
      </button>
      <span v-else class="muted">Duplicate this card to tidy your own copy.</span>
    </div>
  </details>
</template>

<script setup>
import { computed, ref } from 'vue'
import { repeatedNoteLines, removeRepeatedNotes } from '../../../../js/noteRepeats.js'
import { field } from '../../../../js/spec.js'

// Note lines that repeat one of the card's fields (js/noteRepeats.js,
// #132), with an offer to remove them. As NoteSuggestions.vue, `change`
// hands the editor a function to apply to the card_data; the removal is
// saved like any other edit.
const props = defineProps({
  cardData: { type: Object, default: null },
  canEdit: { type: Boolean, default: false },
})
const emit = defineEmits(['change'])

const open = ref(false)
const repeats = computed(() => (props.cardData ? repeatedNoteLines(props.cardData) : []))
const label = path => field(path)?.heading || field(path)?.label || path

const remove = () => emit('change', data => removeRepeatedNotes(data))
</script>

<style scoped>
.note-repeats {
  margin: -4px 0 12px;
  padding: 8px 12px;
  background: #f7f5f0;
  border: 1px solid #e0ddd7;
  border-radius: 6px;
  font-size: 13px;
  color: var(--text-primary, #1a1a1a);
}
summary { cursor: pointer; font-weight: 600; color: var(--text-secondary, #4b5563); }
.why { margin: 6px 0 4px; color: var(--text-secondary, #6b7280); }
ul { list-style: none; margin: 6px 0 0; padding: 0; }
li { padding: 4px 0; border-top: 1px solid #ebe8e1; overflow-wrap: anywhere; }
.where { color: var(--text-secondary, #6b7280); }
.btn { font: inherit; font-size: 12px; padding: 3px 10px; border: 1px solid var(--card-border, #e0ddd7); border-radius: var(--radius-button, 6px); background: #fff; cursor: pointer; }
.btn-remove { border-color: var(--green-dark, #2d6a4f); color: var(--green-dark, #2d6a4f); font-weight: 600; }
.btn-remove:hover { background: var(--green-pale, #d8f3dc); }
.footer { margin-top: 8px; }
.muted { color: var(--text-secondary, #6b7280); }
@media print { .note-repeats { display: none; } }
</style>
