<template>
  <section class="vs-nt-defense">
    <h4 class="vs-nt-title">Defense vs 1NT openings</h4>
    <div class="vs-nt-grid">
      <div
        v-for="col in COLUMNS"
        :key="col.key"
        class="vs-nt-block"
      >
        <div class="vs-nt-block-label">{{ col.label }}</div>
        <label class="vs-nt-field">
          <span class="vs-nt-field-label">System</span>
          <span class="vs-nt-system-wrap">
            <input
              type="text"
              class="vs-nt-system-input"
              :value="systemName(col.key)"
              :readonly="!editable"
              placeholder="e.g. Meckwell, Cappelletti"
              @input="onSystemInput(col.key, $event.target.value)"
              @blur="onSystemBlur(col.key, $event.target.value)"
            />
            <button
              v-if="editable"
              type="button"
              class="vs-nt-system-picker"
              :class="{ open: openMenu === col.key }"
              :aria-expanded="openMenu === col.key"
              :title="'Pick a known defense'"
              @click="toggleMenu(col.key, $event)"
            >▾</button>
            <ul
              v-if="openMenu === col.key"
              class="vs-nt-system-menu"
              role="listbox"
            >
              <li
                v-for="d in KNOWN_NT_DEFENSES"
                :key="d.name"
                class="vs-nt-system-menu-item"
                role="option"
                @mousedown.prevent="pickSystem(col.key, d.name)"
              >{{ d.name }}</li>
            </ul>
          </span>
        </label>
        <div
          v-for="bid in NT_DEFENSE_BIDS"
          :key="bid.key"
          class="vs-nt-bid"
        >
          <span class="vs-nt-bid-label" v-html="colorizeSuits(bid.label)"></span>
          <RichSuitField
            :model-value="bidValue(col.key, bid.key)"
            :editable="editable"
            block
            @update:modelValue="onBidInput(col.key, bid.key, $event)"
          />
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import {
  KNOWN_NT_DEFENSES,
  NT_DEFENSE_BIDS,
  findKnownDefense
} from '../../utils/ntDefenses.js'
import { colorizeSuits } from '../../utils/cardFormatting.js'
import RichSuitField from './RichSuitField.vue'

const openMenu = ref(null)

function toggleMenu(colKey, event) {
  event.stopPropagation()
  openMenu.value = openMenu.value === colKey ? null : colKey
}

function pickSystem(colKey, name) {
  const oldDef = findKnownDefense(systemName(colKey))
  props.writeField(`competitive.${colKey}.system`, name)
  maybeApplyDefaults(colKey, oldDef, name)
  openMenu.value = null
}

function onDocClick(event) {
  if (!openMenu.value) return
  // Close unless the click happened inside a system menu/picker
  if (event.target.closest('.vs-nt-system-menu, .vs-nt-system-picker')) return
  openMenu.value = null
}

onMounted(() => document.addEventListener('mousedown', onDocClick))
onBeforeUnmount(() => document.removeEventListener('mousedown', onDocClick))

const COLUMNS = [
  { key: 'vs_1nt_strong', label: 'Vs Strong NT' },
  { key: 'vs_1nt_weak',   label: 'Vs Weak NT' }
]

const props = defineProps({
  card: { type: Object, default: null },
  editable: { type: Boolean, default: false },
  writeField: { type: Function, required: true }
})

function readBlock(colKey) {
  return props.card?.card_data?.competitive?.[colKey] || {}
}
function systemName(colKey) { return readBlock(colKey).system || '' }
function bidValue(colKey, bidKey) { return readBlock(colKey)[bidKey] || '' }

function onSystemInput(colKey, value) {
  // Capture the previously-resolved system before writing the new
  // name; we use it to decide whether the user has switched to a
  // different system (and therefore wants the bid cells refreshed).
  const oldDef = findKnownDefense(systemName(colKey))
  props.writeField(`competitive.${colKey}.system`, value || null)
  maybeApplyDefaults(colKey, oldDef, value)
}

function onSystemBlur(colKey, value) {
  const oldDef = findKnownDefense(systemName(colKey))
  maybeApplyDefaults(colKey, oldDef, value)
}

/**
 * If the user's new system name resolves to a known defense AND it's
 * a *different* defense than the one currently in place, overwrite
 * the bid cells with the new system's standard meanings.
 *
 * This gives the dropdown the "switch system" semantics most users
 * expect, while preserving customizations when the user keeps the
 * same system name (e.g. "Meckwell" → "Meckwell modified" leaves
 * tweaked bid cells alone because both resolve to Meckwell).
 *
 * If the new name doesn't resolve to a known system (custom name or
 * mid-typing), nothing happens — we never wipe values without an
 * explicit system selection.
 */
function maybeApplyDefaults(colKey, oldDef, newValue) {
  if (!props.editable) return
  const newDef = findKnownDefense(newValue)
  if (!newDef) return
  if (oldDef && oldDef.name === newDef.name) return
  for (const b of NT_DEFENSE_BIDS) {
    if (newDef.bids[b.key]) {
      props.writeField(`competitive.${colKey}.${b.key}`, newDef.bids[b.key])
    }
  }
}

function onBidInput(colKey, bidKey, value) {
  props.writeField(`competitive.${colKey}.${bidKey}`, value || null)
}
</script>

<style scoped>
.vs-nt-defense {
  margin-bottom: 20px;
  padding: 12px 14px;
  background: white;
  border: 1px solid var(--card-border, #e0ddd7);
  border-radius: var(--radius-card, 10px);
}

.vs-nt-title {
  font-family: var(--font-heading, 'Source Serif 4', serif);
  font-size: 16px;
  color: var(--green-dark, #2d6a4f);
  margin: 0 0 12px;
}

.vs-nt-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

.vs-nt-block-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-secondary, #6b7280);
  margin-bottom: 6px;
}

.vs-nt-field {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0 10px;
  border-bottom: 1px solid var(--card-border, #e0ddd7);
  margin-bottom: 8px;
}

.vs-nt-field-label {
  flex: 0 0 60px;
  font-size: 12px;
  color: var(--text-secondary, #6b7280);
}

.vs-nt-bid {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
}

.vs-nt-bid-label {
  flex: 0 0 40px;
  font-size: 13px;
  color: var(--text-secondary, #6b7280);
  font-weight: 500;
}

.vs-nt-bid > .rich-suit-field {
  flex: 1;
  min-width: 0;
}

.vs-nt-system-wrap {
  flex: 1;
  position: relative;
}

.vs-nt-system-input {
  width: 100%;
  font-family: inherit;
  font-size: 13px;
  padding: 4px 30px 4px 8px;  /* room for the chevron button */
  border: 1px solid var(--card-border, #e0ddd7);
  border-radius: 6px;
  background: white;
  color: var(--text-primary, #1a1a1a);
  box-sizing: border-box;
}

.vs-nt-system-input:focus {
  outline: none;
  border-color: var(--green-mid, #40916c);
  box-shadow: 0 0 0 2px var(--green-pale, #d8f3dc);
}

.vs-nt-system-input[readonly] {
  background: #f9fafb;
  cursor: not-allowed;
}

.vs-nt-system-picker {
  position: absolute;
  right: 4px;
  top: 50%;
  transform: translateY(-50%);
  width: 22px;
  height: 22px;
  border: none;
  background: transparent;
  color: var(--text-secondary, #6b7280);
  font-size: 14px;
  cursor: pointer;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: background 0.15s;
}

.vs-nt-system-picker:hover { background: #f3f4f6; color: var(--text-primary, #1a1a1a); }
.vs-nt-system-picker.open  { background: var(--green-pale, #d8f3dc); color: var(--green-dark, #2d6a4f); }

.vs-nt-system-menu {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  z-index: 20;
  margin: 0;
  padding: 4px;
  list-style: none;
  background: white;
  border: 1px solid var(--card-border, #e0ddd7);
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  max-height: 240px;
  overflow-y: auto;
}

.vs-nt-system-menu-item {
  padding: 6px 10px;
  font-size: 13px;
  cursor: pointer;
  border-radius: 4px;
  color: var(--text-primary, #1a1a1a);
}

.vs-nt-system-menu-item:hover { background: var(--green-pale, #d8f3dc); color: var(--green-dark, #2d6a4f); }

.vs-nt-bid-label :deep(.suit-red) { color: #d32f2f; }
.vs-nt-bid-label :deep(.suit-black) { color: #1a1a1a; }

@media (max-width: 720px) {
  .vs-nt-grid { grid-template-columns: 1fr; }
}
</style>
