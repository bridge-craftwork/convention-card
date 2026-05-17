<template>
  <div class="row" :class="{ checked: status.checked }">
    <input
      type="checkbox"
      class="row-check"
      :checked="status.checked"
      :disabled="!editable"
      @change="$emit('toggle', entry.id, $event.target.checked)"
    />
    <div class="row-body">
      <div class="row-headline">
        <span class="row-name" :class="formClass">
          {{ entry.name }}
          <span v-if="showCoverage && status.covered" class="bar bar-coverage" title="Covered in solo practice"></span>
          <span v-if="showProf" class="bar" :class="profClass" :title="profLabel"></span>
        </span>
        <span v-if="entry.form" class="form-badge" :class="'form-' + entry.form">
          {{ entry.form === 'alert' ? 'Alert' : 'Announce' }}
        </span>
        <span class="level-badge" :class="'lvl-' + status.level">{{ status.level }}</span>
      </div>
      <div class="row-desc" v-html="colorizeSuits(entry.desc)"></div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { colorizeSuits } from '../../utils/cardFormatting.js'

const props = defineProps({
  entry: { type: Object, required: true },
  status: { type: Object, required: true },
  showCoverage: { type: Boolean, default: false },
  showProf: { type: Boolean, default: false },
  editable: { type: Boolean, default: false }
})

defineEmits(['toggle'])

const profClass = computed(() => `bar-prof-${props.status.profStatus}`)
const profLabel = computed(() => {
  switch (props.status.profStatus) {
    case 'good': return 'Proficient'
    case 'practice': return 'Practicing'
    case 'learn': return 'Learning'
    default: return 'Not started'
  }
})

const formClass = computed(() => {
  if (props.entry.form === 'alert') return 'form-name-alert'
  if (props.entry.form === 'announce') return 'form-name-announce'
  return ''
})
</script>

<style scoped>
.row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 6px;
  border: 1px solid transparent;
}

.row:hover { background: #f9fafb; }
.row.checked { background: #f9fafb; }

.row-check {
  margin-top: 3px;
  accent-color: var(--green-mid, #40916c);
  cursor: pointer;
}

.row-check:disabled {
  cursor: not-allowed;
}

.row-body { flex: 1; min-width: 0; }

.row-headline {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 6px;
}

.row-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary, #1a1a1a);
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.row-name.form-name-alert { color: #c62828; }
.row-name.form-name-announce { color: #1565c0; }

.form-badge {
  display: inline-block;
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 999px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.form-badge.form-alert {
  background: #fdecea;
  color: #c62828;
}

.form-badge.form-announce {
  background: #e3f2fd;
  color: #1565c0;
}

.bar {
  display: inline-block;
  width: 40px;
  height: 3px;
  border-radius: 2px;
}

.bar-coverage { background: #7F77DD; }
.bar-prof-none { background: #B4B2A9; }
.bar-prof-learn { background: #F0997B; }
.bar-prof-practice { background: #EF9F27; }
.bar-prof-good { background: #639922; }

.row-desc {
  font-size: 12px;
  color: var(--text-secondary, #6b7280);
  margin-top: 2px;
}

.row-desc :deep(.suit-red) { color: #d32f2f; }
.row-desc :deep(.suit-black) { color: #1a1a1a; }

.level-badge {
  display: inline-block;
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 999px;
  font-weight: 500;
  text-transform: capitalize;
}

.lvl-basic        { background: #E6F1FB; color: #0C447C; }
.lvl-intermediate { background: #E1F5EE; color: #085041; }
.lvl-advanced     { background: #FAEEDA; color: #633806; }
.lvl-expert       { background: #FBEAF0; color: #72243E; }
</style>
