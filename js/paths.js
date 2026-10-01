// Dotted card paths (`notrump.stayman.play`) on Bridge Classroom's nested
// card_data. Copied from Bridge-Classroom's src/utils/conventionCatalog.js
// (2026-09-30), which keeps its own copy for the editor until Phase 3.

/**
 * Read a dotted path out of an object. Returns undefined if any
 * intermediate step is missing.
 */
export function readPath(obj, dotted) {
  if (!obj || !dotted) return undefined
  const parts = dotted.split('.')
  let cur = obj
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined
    cur = cur[p]
  }
  return cur
}

/**
 * Write a value at a dotted path, creating intermediate objects as
 * needed. Mutates the target object.
 */
export function writePath(obj, dotted, value) {
  if (!obj || !dotted) return
  const parts = dotted.split('.')
  let cur = obj
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i]
    if (cur[key] == null || typeof cur[key] !== 'object') {
      cur[key] = {}
    }
    cur = cur[key]
  }
  cur[parts[parts.length - 1]] = value
}
