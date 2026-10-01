import { describe, it, expect } from 'vitest'
import { renderReferenceText, renderLlmsText, expectedNames } from '../src/referenceText.js'
import { OUTPUTS, PARAMS } from '../src/tool.js'
import { IMPORT_FORMATS } from '../../js/importCard.js'

describe('reference.txt', () => {
  const text = renderReferenceText('9.9.9')

  it('names every field and every convention', () => {
    expect(expectedNames().filter(n => !text.includes(n))).toEqual([])
  })

  it('describes all of window.card', () => {
    for (const name of ['run(', 'validate(', 'getInput(', 'setInput(', 'getOutput(']) expect(text).toContain(name)
    for (const name of [...Object.keys(OUTPUTS), ...Object.keys(IMPORT_FORMATS), ...PARAMS.map(p => p.name)]) {
      expect(text).toContain(name)
    }
  })

  it('is the same text every time', () => {
    expect(renderReferenceText('9.9.9')).toBe(text)
  })
})

describe('llms.txt', () => {
  it('links the reference and the editor', () => {
    const llms = renderLlmsText('9.9.9', 1024)
    expect(llms).toContain('https://bridge-craftwork.com/card/reference.txt')
    expect(llms).toMatch(/^# Convention card\n/)
  })
})
