<template>
  <div v-if="showCoverage || showProf" class="legend">
    <span class="legend-label">Legend:</span>
    <span v-if="showCoverage" class="legend-item">
      <span class="bar bar-coverage"></span>
      Covered in solo practice
    </span>
    <template v-if="showProf">
      <span class="legend-item"><span class="bar bar-prof-none"></span>Not started</span>
      <span class="legend-item"><span class="bar bar-prof-learn"></span>Learning</span>
      <span class="legend-item"><span class="bar bar-prof-practice"></span>Practicing</span>
      <span class="legend-item"><span class="bar bar-prof-good"></span>Proficient</span>
    </template>
  </div>
</template>

<script setup>
defineProps({
  showCoverage: { type: Boolean, required: true },
  showProf: { type: Boolean, required: true }
})
</script>

<style scoped>
.legend {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 14px;
  padding: 8px 14px;
  margin-bottom: 16px;
  font-size: 12px;
  color: var(--text-secondary, #6b7280);
}

.legend-label { font-weight: 500; }

.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.bar {
  display: inline-block;
  width: 14px;
  height: 3px;
  border-radius: 2px;
}

.bar-coverage { background: #7F77DD; }
.bar-prof-none { background: #B4B2A9; }
.bar-prof-learn { background: #F0997B; }
.bar-prof-practice { background: #EF9F27; }
.bar-prof-good { background: #639922; }
</style>
