import { describe, it, expect } from 'vitest'
import { outlineEdit } from '../outlineKeys.js'

// Outline keys in a notes box: `|` marks the caret, `[`…`]` a selection.
const at = s => {
  const start = s.indexOf('[') >= 0 ? s.indexOf('[') : s.indexOf('|')
  const text = s.replace(/[|[\]]/g, '')
  const end = s.indexOf(']') >= 0 ? s.indexOf(']') - 1 : start
  return [text, start, end]
}
const show = r => r && (r.start === r.end
  ? r.value.slice(0, r.start) + '|' + r.value.slice(r.start)
  : r.value.slice(0, r.start) + '[' + r.value.slice(r.start, r.end) + ']' + r.value.slice(r.end))
const press = (s, key, shift) => show(outlineEdit(...at(s), key, shift))

describe('outline keys', () => {
  it('Tab indents an item a level, Shift-Tab takes it out', () => {
    expect(press('- one\n- tw|o', 'Tab')).toBe('- one\n  - tw|o')
    expect(press('- one\n  - tw|o', 'Tab', true)).toBe('- one\n- tw|o')
  })

  it('Tab indents every line of a selection', () => {
    expect(press('- a\n[- b\n- c]', 'Tab')).toBe('- a\n[  - b\n  - c]')
  })

  it('leaves Tab to the browser on a line that is not an item', () => {
    expect(press('plain te|xt', 'Tab')).toBe(null)
    expect(press('- item at the margin|', 'Tab', true)).toBe(null)
  })

  it('Enter starts the next item at the same level', () => {
    expect(press('  - 3♠ puppet|', 'Enter')).toBe('  - 3♠ puppet\n  - |')
    expect(press('1. first|', 'Enter')).toBe('1. first\n2. |')
    expect(press('a) first|', 'Enter')).toBe('a) first\nb) |')
    expect(press('    ◦ 3NT|', 'Enter')).toBe('    ◦ 3NT\n    ◦ |')
  })

  it('Enter on an empty item ends the list', () => {
    expect(press('- one\n  - |', 'Enter')).toBe('- one\n|')
  })

  it('leaves Enter alone off an item, or before its text', () => {
    expect(press('plain|', 'Enter')).toBe(null)
    expect(press('|- one', 'Enter')).toBe(null)
  })
})
