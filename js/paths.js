// Dotted card paths (`notrump.stayman.play`) on a card's nested card_data.
//
// A field can have older spellings (its aliases: `other_conventions.gerber.play`
// for `slam.gerber.play`). The format maps and the editor ask by either, and
// a card may hold either. So a read that finds nothing at the path asked for
// looks under the field's other spellings, and a write clears them: a field
// is held once, wherever it was last written.

import { spellings } from './spec.js'

function readLiteral(obj, dotted) {
  let cur = obj
  for (const p of dotted.split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined
    cur = cur[p]
  }
  return cur
}

/**
 * Read a dotted path out of an object. Returns undefined if any
 * intermediate step is missing, at this path and at every other spelling
 * of the field it names.
 */
export function readPath(obj, dotted) {
  if (!obj || !dotted) return undefined
  const found = readLiteral(obj, dotted)
  if (found !== undefined) return found
  for (const other of spellings(dotted) || []) {
    if (other === dotted) continue
    const v = readLiteral(obj, other)
    if (v !== undefined) return v
  }
  return undefined
}

function removeLiteral(obj, dotted) {
  const parts = dotted.split('.')
  const chain = [obj]
  for (const p of parts.slice(0, -1)) {
    const next = chain[chain.length - 1]?.[p]
    if (next == null || typeof next !== 'object') return
    chain.push(next)
  }
  const last = parts[parts.length - 1]
  if (!Object.hasOwn(chain[chain.length - 1], last)) return
  delete chain[chain.length - 1][last]
  for (let i = chain.length - 1; i > 0; i--) {
    if (Object.keys(chain[i]).length) break
    delete chain[i - 1][parts[i - 1]]
  }
}

/**
 * Write a value at a dotted path, creating intermediate objects as
 * needed, and take the field's other spellings off the object. Mutates the
 * target object.
 */
export function writePath(obj, dotted, value) {
  if (!obj || !dotted) return
  for (const other of spellings(dotted) || []) {
    if (other !== dotted) removeLiteral(obj, other)
  }
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
