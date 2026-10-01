import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { FIELDS, field, CONVENTIONS, BBSA_MAP } from '../spec.js'

const JS = path.resolve(__dirname, '..')

// Every literal card path the converters and the PDF maps read or write:
// `card_data.a.b = …`, `card_data.a['b'] = …`, setPath/writePath/readPath
// with a quoted path, and the PDF maps' `card: 'a.b'`.
function literalPaths(file) {
  const src = fs.readFileSync(path.join(JS, file), 'utf8')
  const out = new Set()
  for (const m of src.matchAll(/card_data((?:\.[a-z_0-9]+|\['[a-z0-9_]+'\])+)\s*=[^=]/g)) {
    out.add(m[1].replace(/\['([^']+)'\]/g, '.$1').slice(1))
  }
  for (const m of src.matchAll(/(?:setPath|writePath|readPath|r)\([a-z_]+,\s*'([a-z_0-9.]+)'/gi)) out.add(m[1])
  for (const m of src.matchAll(/\bcard:\s*'([a-z_0-9.]+)'/g)) out.add(m[1])
  for (const m of src.matchAll(/:\s*\['([a-z_0-9]+\.[a-z_0-9.]+)',/g)) out.add(m[1])
  return [...out]
}

// A path names a field, or an object the importer fills (`notrump.responses`),
// or card metadata.
const isObject = p => Object.keys(FIELDS).some(f => f.startsWith(p + '.'))
const resolves = p => p.startsWith('metadata') || field(p) || isObject(p)

describe('the spec as the library reads it', () => {
  it('has the fields, the .bbsa map and the conventions', () => {
    expect(Object.keys(FIELDS).length).toBeGreaterThan(400)
    expect(BBSA_MAP['1N-2C Stayman'] ?? BBSA_MAP.implied).toBeDefined()
    expect(CONVENTIONS['bidding_conventions/stayman'].level).toBe(3)
  })

  it('resolves aliases to the canonical path', () => {
    expect(field('other_conventions.blackwood.rkcb_1430').path).toBe('slam.blackwood.rkcb_1430')
    expect(field('leads.vs_suits.honors.lead_choice_AKx').path).toBe('leads.vs_suits.honors.lead_choice_akx')
    // 1NT Puppet, as the editor, the PDFs and the importers write it; not 2NT Puppet.
    expect(field('notrump.stayman.puppet').path).toBe('notrump.stayman.puppet_1nt')
    expect(field('no.such.path')).toBeUndefined()
  })

  for (const file of ['bboImport.js', 'bridgeodexImport.js', 'acblClassicFillPdf.js', 'acblCardPdf.js']) {
    it(`every card path ${file} names is in the spec`, () => {
      const paths = literalPaths(file)
      expect(paths.length).toBeGreaterThan(10)
      expect(paths.filter(p => !resolves(p))).toEqual([])
    })
  }
})
