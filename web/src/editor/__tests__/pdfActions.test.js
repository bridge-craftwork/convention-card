import { describe, it, expect, beforeEach, vi } from 'vitest'
import { savedPdfOptions, savePdfOptions } from '../pdfActions.js'

// The PDF dialog's answers, remembered in this browser (Rick Wilson,
// 2026-11-21: the template especially).
describe('the remembered PDF choices', () => {
  let store
  beforeEach(() => {
    store = {}
    vi.stubGlobal('localStorage', {
      getItem: k => store[k] ?? null,
      setItem: (k, v) => { store[k] = String(v) },
    })
  })

  it('start as a flat Classic card alone', () => {
    expect(savedPdfOptions()).toEqual({ template: 'classic', secondPage: 'none', fillable: false })
  })

  it('come back as saved', () => {
    savePdfOptions({ template: 'new', secondPage: 'notes', fillable: true })
    expect(savedPdfOptions()).toEqual({ template: 'new', secondPage: 'notes', fillable: true })
  })

  it('drop what is not a choice, and survive storage that throws', () => {
    store['convention-card.pdf-options'] = JSON.stringify({ template: 'wbf', secondPage: 'x', fillable: 'yes' })
    expect(savedPdfOptions()).toEqual({ template: 'classic', secondPage: 'none', fillable: false })
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('private') }, setItem: () => { throw new Error('private') } })
    expect(savedPdfOptions().template).toBe('classic')
    expect(() => savePdfOptions({ template: 'new' })).not.toThrow()
  })
})
