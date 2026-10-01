import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { importBbsa, exportBbsa, parseBbsa } from '../bbsa.js'

// The golden files the Rust crate writes (crates/bridge-card/tests/golden.rs):
// this converter must turn each test card into the same card JSON and write
// back the same .bbsa. If one fails after an intended change to the crate,
// make the same change here.
const ROOT = path.resolve(__dirname, '../..')
const CARDS = path.join(ROOT, 'crates/bridge-card/tests/fixtures/bbsa')
const GOLDEN = path.join(ROOT, 'tests/golden/bbsa')
const names = fs.readdirSync(CARDS).filter(f => f.endsWith('.bbsa')).map(f => f.slice(0, -5)).sort()

describe('.bbsa, against the crate', () => {
  it('has the test cards', () => expect(names.length).toBeGreaterThanOrEqual(18))

  for (const name of names) {
    const text = fs.readFileSync(path.join(CARDS, `${name}.bbsa`), 'utf8')
    it(`imports ${name} as the crate does`, () => {
      const golden = JSON.parse(fs.readFileSync(path.join(GOLDEN, `${name}.card.json`), 'utf8'))
      expect(importBbsa(text, name).card_data).toEqual(golden)
    })
    it(`exports ${name} as the crate does`, () => {
      const golden = fs.readFileSync(path.join(GOLDEN, `${name}.export.bbsa`), 'utf8')
      expect(exportBbsa(importBbsa(text, name).card_data).text).toBe(golden)
    })
  }

  it('parses lines and rejects what is not Key = value', () => {
    expect(parseBbsa('A = 1\r\n\r\nB C = 0\n')).toEqual([['A', 1], ['B C', 0]])
    expect(() => parseBbsa('No equals')).toThrow(/expected/)
    expect(() => parseBbsa('A = x')).toThrow(/integer/)
  })

  it('keeps keys with no card field and writes them back', () => {
    const { card_data, report } = importBbsa('Collante = 1\r\n')
    expect(card_data.bba_passthrough).toEqual({ Collante: 1 })
    expect(report.passthrough).toEqual([['Collante', 1]])
    expect(exportBbsa(card_data).text).toContain('Collante = 1\r\n')
  })
})
