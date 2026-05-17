<template>
  <section class="detail">
    <header class="detail-header">
      <h3 class="detail-title">{{ sectionMeta?.label }}</h3>
      <span v-if="hiddenCount > 0" class="detail-hidden">
        {{ hiddenCount }} hidden by skill filter
      </span>
    </header>

    <!-- Section-specific custom widgets -->
    <template v-if="sectionId === 'competitive'">
      <VsNtDefense :card="card" :editable="editable" :write-field="writeField" />
      <DirectCuebidsMatrix :card="card" :editable="editable" :write-field="writeField" />
      <VsTakeoutDoublePanel :card="card" :editable="editable" :write-field="writeField" />
      <VsPreemptsPanel :card="card" :editable="editable" :write-field="writeField" />
    </template>
    <CardingSignalsPanel
      v-else-if="sectionId === 'carding'"
      :card="card"
      :editable="editable"
      :write-field="writeField"
    />
    <OpeningLeadsPanel
      v-else-if="sectionId === 'leads'"
      :card="card"
      :editable="editable"
      :write-field="writeField"
    />

    <!-- Structured fields -->
    <div
      v-if="visibleStructuredFields.length"
      class="fields"
      :class="{ twocol: useTwoColumn }"
    >
      <div
        v-for="f in visibleStructuredFields"
        :key="f.label"
        class="field-row"
        :style="useTwoColumn ? fieldGridStyle(f) : null"
      >
        <span class="field-label" v-html="colorizeSuits(f.label)"></span>
        <span class="field-value">
          <!-- Read-only display -->
          <template v-if="!editable">{{ renderField(f) }}</template>

          <!-- Range: from-to numeric inputs -->
          <template v-else-if="f.kind === 'range'">
            <input
              type="number"
              class="field-input range-input"
              :value="readField(f.from) ?? ''"
              @input="onFieldInput(f.from, $event.target.value, 'number')"
              placeholder="from"
            />
            <span class="range-dash">—</span>
            <input
              type="number"
              class="field-input range-input"
              :value="readField(f.to) ?? ''"
              @input="onFieldInput(f.to, $event.target.value, 'number')"
              placeholder="to"
            />
          </template>

          <!-- Number -->
          <template v-else-if="f.kind === 'number'">
            <input
              type="number"
              class="field-input number-input"
              :value="readField(f.cardPath) ?? ''"
              @input="onFieldInput(f.cardPath, $event.target.value, 'number')"
            />
          </template>

          <!-- Select -->
          <template v-else-if="f.kind === 'select'">
            <select
              class="field-input"
              :value="readField(f.cardPath) ?? ''"
              @change="onFieldInput(f.cardPath, $event.target.value, 'string')"
            >
              <option value="">—</option>
              <option v-for="opt in f.options" :key="opt" :value="opt">
                {{ opt.charAt(0).toUpperCase() + opt.slice(1) }}
              </option>
            </select>
          </template>

          <!-- Boolean -->
          <template v-else-if="f.kind === 'boolean'">
            <label class="field-checkbox">
              <input
                type="checkbox"
                :checked="!!readField(f.cardPath)"
                @change="onFieldInput(f.cardPath, $event.target.checked, 'boolean')"
              />
              <span>{{ readField(f.cardPath) ? 'Yes' : 'No' }}</span>
            </label>
          </template>

          <!-- Free text (e.g., seat/vul tag) -->
          <template v-else-if="f.kind === 'text' || f.kind === 'seat_vul'">
            <input
              type="text"
              class="field-input text-input"
              :value="readField(f.cardPath) ?? ''"
              :placeholder="f.placeholder || ''"
              @input="onFieldInput(f.cardPath, $event.target.value, 'string')"
            />
          </template>

          <!-- Inline checkbox group — multiple sibling booleans on one row -->
          <template v-else-if="f.kind === 'inline_checks'">
            <span class="inline-checks">
              <label v-for="p in f.paths" :key="p.cardPath" class="inline-check">
                <input
                  type="checkbox"
                  :checked="!!readField(p.cardPath)"
                  :disabled="!editable"
                  @change="onFieldInput(p.cardPath, $event.target.checked, 'boolean')"
                />
                <span v-html="colorizeSuits(p.label)"></span>
              </label>
            </span>
          </template>

          <!-- Inline radio group — single enum stored at one path -->
          <template v-else-if="f.kind === 'radio_inline'">
            <span class="inline-checks">
              <label v-for="opt in f.options" :key="opt.value" class="inline-check">
                <input
                  type="checkbox"
                  :checked="readField(f.cardPath) === opt.value"
                  :disabled="!editable"
                  @change="onRadioInline(f.cardPath, opt.value, $event.target.checked)"
                />
                <span v-html="colorizeSuits(opt.label)"></span>
              </label>
            </span>
          </template>

          <!-- Fallback -->
          <template v-else>{{ renderField(f) }}</template>
        </span>
      </div>
    </div>

    <!-- Conventions -->
    <div v-if="visibleEntries.length" class="conventions">
      <div class="conventions-label">Conventions</div>
      <div class="conventions-list">
        <ConventionRow
          v-for="e in visibleEntries"
          :key="e.id"
          :entry="e"
          :status="coverageByEntry.get(e.id)"
          :show-coverage="showCoverage"
          :show-prof="showProf"
          :editable="editable"
          @toggle="(id, checked) => $emit('toggle', id, checked)"
        />
      </div>
    </div>
    <div v-else-if="allEntries.length" class="empty-message">
      No conventions at this level. Try enabling Intermediate or Advanced.
    </div>
    <div v-else-if="!structuredFields.length && !hasCustomWidget" class="empty-message">
      No conventions catalogued for this section yet.
    </div>

    <!-- Notes -->
    <div v-if="sectionNotes.length" class="notes-section">
      <div class="notes-section-label">
        {{ sectionId === 'general' ? 'Partnership notes' : 'Section notes' }}
      </div>
      <div
        v-for="note in sectionNotes"
        :key="note.key"
        class="notes-block"
        :class="{ open: openNotes.has(note.key) }"
      >
        <button
          type="button"
          class="notes-header"
          @click="toggleNote(note.key)"
        >
          <span class="notes-chevron" aria-hidden="true">▸</span>
          <span class="notes-title">{{ note.label || 'Notes' }}</span>
          <span v-if="hasContent(note.key)" class="note-dot" title="Has content"></span>
          <span class="notes-status" :class="{ 'has-content': hasContent(note.key) }">
            {{ statusText(note.key) }}
          </span>
        </button>
        <div v-if="openNotes.has(note.key)" class="notes-body">
          <RichSuitField
            :model-value="getNote(note.key)"
            :editable="editable"
            :placeholder="note.hint || ''"
            multiline
            @update:modelValue="props.setNote(note.key, $event)"
          />
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { SECTION_META, STRUCTURED_FIELDS, getCatalogEntries } from '../../utils/conventionCatalog.js'
import { colorizeSuits } from '../../utils/cardFormatting.js'
import ConventionRow from './ConventionRow.vue'
import VsNtDefense from './VsNtDefense.vue'
import DirectCuebidsMatrix from './DirectCuebidsMatrix.vue'
import VsTakeoutDoublePanel from './VsTakeoutDoublePanel.vue'
import VsPreemptsPanel from './VsPreemptsPanel.vue'
import CardingSignalsPanel from './CardingSignalsPanel.vue'
import OpeningLeadsPanel from './OpeningLeadsPanel.vue'
import RichSuitField from './RichSuitField.vue'

const props = defineProps({
  sectionId: { type: String, required: true },
  card: { type: Object, default: null },
  visibleLevels: { type: Set, required: true },
  coverageByEntry: { type: Map, required: true },
  showCoverage: { type: Boolean, default: false },
  showProf: { type: Boolean, default: false },
  editable: { type: Boolean, default: false },
  getNote: { type: Function, required: true },
  setNote: { type: Function, required: true },
  writeField: { type: Function, required: true }
})

defineEmits(['toggle'])

function readField(path) {
  return readPath(props.card?.card_data, path)
}

function onFieldInput(path, raw, coerce) {
  let value = raw
  if (coerce === 'number') {
    if (raw === '' || raw == null) {
      value = null
    } else {
      const n = Number(raw)
      value = Number.isFinite(n) ? n : null
    }
  } else if (coerce === 'boolean') {
    value = !!raw
  } else {
    value = raw === '' ? null : raw
  }
  props.writeField(path, value)
}

function onRadioInline(path, value, checked) {
  // Radio-inline: ticking sets the enum; unticking the currently-selected
  // option clears it. Ticking a different option implicitly clears the
  // previous one because each <input> is :checked-bound to a comparison.
  props.writeField(path, checked ? value : null)
}

const sectionMeta = computed(() => SECTION_META.find(s => s.id === props.sectionId))
const sectionNotes = computed(() => sectionMeta.value?.notes || [])
const structuredFields = computed(() => STRUCTURED_FIELDS[props.sectionId] || [])

// Same rule as conventions: show a level-gated field if its level is
// in the active SHOW filter OR the field has a non-default value.
// Fields without a `level` property are always visible.
const visibleStructuredFields = computed(() => {
  return structuredFields.value.filter(f => {
    if (!f.level) return true
    if (props.visibleLevels.has(f.level)) return true
    return fieldHasValue(f)
  })
})

function fieldHasValue(f) {
  if (f.kind === 'range') {
    return readField(f.from) != null || readField(f.to) != null
  }
  if (f.kind === 'inline_checks') {
    return f.paths.some(p => !!readField(p.cardPath))
  }
  const v = readField(f.cardPath)
  if (f.kind === 'boolean') return !!v
  return v !== null && v !== undefined && v !== ''
}

const allEntries = computed(() => getCatalogEntries(props.sectionId))

const CUSTOM_WIDGET_SECTIONS = new Set(['competitive', 'carding', 'leads'])
const hasCustomWidget = computed(() => CUSTOM_WIDGET_SECTIONS.has(props.sectionId))

// Switch to a 2-column layout when any visible field in the section
// has been tagged with `column: 2`. Sections without column hints
// keep the single-column layout (preserves the current look for
// general / preempts / overcalls / etc.).
const useTwoColumn = computed(() => {
  return visibleStructuredFields.value.some(f => f.column === 2)
})

// Assign each field an explicit grid row within its column so both
// columns start at row 1. Without this, CSS grid auto-placement gives
// each column-1 field its own row in column 1 (leaving column 2 empty
// in that row) and then stacks column-2 fields in new rows below
// everything — making the right column visually start at the bottom.
const fieldLayout = computed(() => {
  if (!useTwoColumn.value) return null
  const out = new Map()
  let row1 = 0, row2 = 0
  for (const f of visibleStructuredFields.value) {
    if (f.column === 2) {
      row2 += 1
      out.set(f, { row: row2, col: 2 })
    } else {
      row1 += 1
      out.set(f, { row: row1, col: 1 })
    }
  }
  return out
})

function fieldGridStyle(f) {
  const entry = fieldLayout.value?.get(f)
  if (!entry) return null
  return { gridRow: String(entry.row), gridColumn: String(entry.col) }
}

// Auto-open notes blocks that already have content; otherwise collapse.
const openNotes = ref(new Set())
watch(
  () => [props.sectionId, sectionNotes.value, props.card],
  () => {
    const next = new Set()
    for (const n of sectionNotes.value) {
      if (props.getNote(n.key)?.trim()) next.add(n.key)
    }
    openNotes.value = next
  },
  { immediate: true, deep: true }
)

function toggleNote(key) {
  const next = new Set(openNotes.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  openNotes.value = next
}

function hasContent(key) {
  return !!props.getNote(key)?.trim()
}

function statusText(key) {
  const v = props.getNote(key) || ''
  return v.trim().length ? `${v.length} chars` : 'empty'
}

function onNoteInput(key, event) {
  props.setNote(key, event.target.value)
}

const LEVEL_ORDER = { basic: 0, intermediate: 1, advanced: 2, expert: 3 }

// Show a row when its level matches the SHOW filter — OR when it's
// already checked on the current card. We never let a selected
// convention become invisible: the SHOW pills are a "what's available
// to add" filter, not a way to mask state that ships in exports.
//
// Sort: by level (basic → expert), then alphabetically.
const visibleEntries = computed(() => {
  const filtered = allEntries.value.filter(e => {
    const status = props.coverageByEntry.get(e.id)
    if (!status) return false
    return props.visibleLevels.has(status.level) || status.checked
  })
  return filtered.slice().sort((a, b) => {
    const la = LEVEL_ORDER[props.coverageByEntry.get(a.id)?.level] ?? 99
    const lb = LEVEL_ORDER[props.coverageByEntry.get(b.id)?.level] ?? 99
    if (la !== lb) return la - lb
    return a.name.localeCompare(b.name)
  })
})

// Only count rows hidden *and* unchecked — checked rows are always
// shown, so they're not "hidden by filter".
const hiddenCount = computed(() => {
  return allEntries.value.reduce((n, e) => {
    const status = props.coverageByEntry.get(e.id)
    if (!status) return n
    const filtered = !props.visibleLevels.has(status.level)
    return n + (filtered && !status.checked ? 1 : 0)
  }, 0)
})

function readPath(obj, dotted) {
  if (!obj || !dotted) return undefined
  const parts = dotted.split('.')
  let cur = obj
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined
    cur = cur[p]
  }
  return cur
}

function renderField(field) {
  const data = props.card?.card_data
  if (!data) return '—'
  if (field.kind === 'range') {
    const from = readPath(data, field.from)
    const to = readPath(data, field.to)
    if (from == null || to == null) return '—'
    return `${from}-${to}`
  }
  if (field.kind === 'inline_checks') {
    const on = field.paths.filter(p => !!readPath(data, p.cardPath)).map(p => p.label)
    return on.length ? on.join(' · ') : '—'
  }
  const value = readPath(data, field.cardPath)
  if (value === undefined || value === null) return '—'
  if (field.kind === 'boolean') return value ? 'Yes' : 'No'
  if (field.kind === 'radio_inline') {
    const opt = field.options.find(o => o.value === value)
    return opt ? opt.label : String(value)
  }
  if (field.kind === 'select' && typeof value === 'string') {
    return value.charAt(0).toUpperCase() + value.slice(1)
  }
  return String(value)
}
</script>

<style scoped>
.detail {
  background: white;
  border: 1px solid var(--card-border, #e0ddd7);
  border-radius: var(--radius-card, 10px);
  padding: 20px;
  min-height: 480px;
}

.detail-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 16px;
}

.detail-title {
  font-family: var(--font-heading, 'Source Serif 4', serif);
  font-size: 20px;
  color: var(--green-dark, #2d6a4f);
  margin: 0;
}

.detail-hidden {
  font-size: 12px;
  color: var(--text-tertiary, #9ca3af);
}

.fields {
  border-top: 1px solid var(--card-border, #e0ddd7);
  margin-bottom: 16px;
}

/* Two-column layout: each field-row gets an inline grid-row +
   grid-column assignment from fieldGridStyle(), so both columns
   start at row 1 and stack independently in source order. */
.fields.twocol {
  display: grid;
  grid-template-columns: 1fr 1fr;
  column-gap: 24px;
}

.field-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid var(--card-border, #e0ddd7);
  font-size: 13px;
}

.field-row:last-child { border-bottom: none; }

.field-label {
  flex: 0 0 200px;
  color: var(--text-secondary, #6b7280);
}

/* In 2-column mode each column is roughly half-width, so the fixed
   label column would crowd the value side. Shrink it. */
.fields.twocol .field-label {
  flex: 0 0 150px;
}

.field-label :deep(.suit-red) { color: #d32f2f; }
.field-label :deep(.suit-black) { color: #1a1a1a; }

.field-value {
  flex: 1;
  color: var(--text-primary, #1a1a1a);
  font-weight: 500;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.field-input {
  font-family: inherit;
  font-size: 13px;
  padding: 4px 8px;
  border: 1px solid var(--card-border, #e0ddd7);
  border-radius: 6px;
  background: white;
  color: var(--text-primary, #1a1a1a);
}

.field-input:focus {
  outline: none;
  border-color: var(--green-mid, #40916c);
  box-shadow: 0 0 0 2px var(--green-pale, #d8f3dc);
}

.range-input { width: 60px; }
.number-input { width: 80px; }
.text-input { min-width: 200px; max-width: 320px; }
.range-dash { color: var(--text-tertiary, #9ca3af); }

.field-checkbox {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font-weight: 400;
  color: var(--text-secondary, #6b7280);
}

.field-checkbox input { accent-color: var(--green-mid, #40916c); cursor: pointer; }

.inline-checks {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 14px;
}

.inline-check {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: var(--text-primary, #1a1a1a);
  cursor: pointer;
}

.inline-check :deep(.suit-red)   { color: #d32f2f; }
.inline-check :deep(.suit-black) { color: #1a1a1a; }
.inline-check input { accent-color: var(--green-mid, #40916c); cursor: pointer; }
.inline-check input:disabled { cursor: not-allowed; }

.conventions-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-secondary, #6b7280);
  margin: 6px 0 8px;
}

.conventions-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.empty-message {
  padding: 20px;
  text-align: center;
  color: var(--text-tertiary, #9ca3af);
  font-size: 13px;
}

/* Notes blocks */
.notes-section {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--card-border, #e0ddd7);
}

.notes-section-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-secondary, #6b7280);
  margin: 0 0 8px;
}

.notes-block {
  border: 1px solid var(--card-border, #e0ddd7);
  border-radius: 6px;
  overflow: hidden;
  margin-bottom: 8px;
}

.notes-header {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 12px;
  background: #f9fafb;
  border: none;
  cursor: pointer;
  font-family: inherit;
  font-size: 13px;
  text-align: left;
  color: var(--text-primary, #1a1a1a);
}

.notes-header:hover {
  background: #f3f4f6;
}

.notes-chevron {
  display: inline-block;
  transition: transform 0.15s;
  font-size: 12px;
  color: var(--text-secondary, #6b7280);
}

.notes-block.open .notes-chevron {
  transform: rotate(90deg);
}

.notes-title {
  flex: 1;
  font-weight: 500;
}

.note-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #EF9F27;
}

.notes-status {
  font-size: 11px;
  color: var(--text-tertiary, #9ca3af);
}

.notes-status.has-content {
  color: #d97706;
}

.notes-body {
  padding: 10px 12px;
  background: white;
}

.notes-body textarea {
  width: 100%;
  min-height: 70px;
  resize: vertical;
  font-family: inherit;
  font-size: 13px;
  padding: 8px 10px;
  border: 1px solid var(--card-border, #e0ddd7);
  border-radius: 6px;
  background: white;
  color: var(--text-primary, #1a1a1a);
  line-height: 1.5;
  box-sizing: border-box;
}

.notes-body textarea:focus {
  outline: none;
  border-color: var(--green-mid, #40916c);
  box-shadow: 0 0 0 2px var(--green-pale, #d8f3dc);
}

.notes-body textarea[readonly] {
  background: #f9fafb;
  cursor: not-allowed;
}
</style>
