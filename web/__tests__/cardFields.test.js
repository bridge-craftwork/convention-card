import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { createServer } from 'vite'
import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { FIELDS } from '../../js/spec.js'
import { writePath } from '../../js/paths.js'
import { sectionOfPath, unshownFields, searchFields, searchAgreements } from '../src/editor/cardFields.js'
import { SECTION_META } from '../src/editor/conventionCatalog.js'

const WIDGETS = ['VsNtDefense', 'DirectCuebidsMatrix', 'VsTakeoutDoublePanel', 'VsPreemptsPanel', 'CardingSignalsPanel', 'OpeningLeadsPanel']
const LIST_FILE = path.resolve(import.meta.dirname, '../src/editor/widgetFields.json')

// A card with every field filled, which records each one a component reads.
function recordingCard(reads) {
  const data = {}
  for (const [p, def] of Object.entries(FIELDS)) {
    writePath(data, p, def.kind === 'bool' ? true : def.kind === 'int' ? (def.min ?? 1) : def.kind === 'enum' ? def.options[0] : 'x')
  }
  const watch = (obj, prefix) => new Proxy(obj, {
    get(target, key) {
      const v = target[key]
      if (typeof key !== 'string') return v
      const p = prefix ? `${prefix}.${key}` : key
      if (v && typeof v === 'object' && !Array.isArray(v)) return watch(v, p)
      if (FIELDS[p]) reads.add(p)
      return v
    },
  })
  return { card_data: watch(data, '') }
}

describe('every field of the spec has a place in the editor', () => {
  let vite
  beforeAll(async () => {
    vite = await createServer({
      configFile: path.resolve(import.meta.dirname, '../vite.config.js'),
      root: path.resolve(import.meta.dirname, '..'),
      server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent',
    })
  }, 60_000)
  afterAll(() => vite?.close())

  // widgetFields.json says which fields the section panels show, so the
  // generic rows leave them out. A stale list would hide a field: run with
  // UPDATE_WIDGET_FIELDS=1 after changing a panel.
  it('widgetFields.json is what the panels really read', async () => {
    const reads = new Set()
    const card = recordingCard(reads)
    for (const name of WIDGETS) {
      const { default: comp } = await vite.ssrLoadModule(`/src/editor/components/${name}.vue`)
      await renderToString(createSSRApp(comp, { card, editable: true, writeField: () => {} }))
    }
    const found = [...reads].sort()
    if (process.env.UPDATE_WIDGET_FIELDS) fs.writeFileSync(LIST_FILE, `${JSON.stringify(found, null, 1)}\n`)
    expect(JSON.parse(fs.readFileSync(LIST_FILE, 'utf8'))).toEqual(found)
  }, 60_000)

  it('every field belongs to a section', () => {
    const ids = new Set(SECTION_META.map(s => s.id))
    expect(Object.keys(FIELDS).filter(p => !ids.has(sectionOfPath(p)))).toEqual([])
  })

  it('the fields that had no display now do', () => {
    expect(unshownFields('other_conventions')).toEqual(expect.arrayContaining(['other_conventions.notes_line_1', 'other_conventions.notes_line_2']))
    expect(unshownFields('two_level')).toEqual(expect.arrayContaining(['two_level.two_clubs.continuation_describe']))
    expect(unshownFields('notrump')).not.toContain('notrump.one_nt.range_min_plus')
  })
})

describe('searching a card', () => {
  const data = { other_conventions: { notes_line_2: 'xyz, spiral, Schuler shift, McCabe' }, two_level: { two_clubs: { continuation_describe: 'Parrish Relay' } }, other_agreements: [{ text: 'Kokish game tries' }] }
  const paths = q => searchFields(q, data).map(r => r.path)

  it('finds a field by its label, its convention, or what the card holds', () => {
    expect(paths('stayman')).toContain('notrump.stayman.play')
    expect(paths('schuler')).toEqual(expect.arrayContaining(['other_conventions.notes_line_2', 'major_openings.two_over_one.rebid_style']))
    expect(paths('parrish relay')).toContain('two_level.two_clubs.continuation_describe')
    expect(paths('parrish relay')[0]).toBe('two_level.parrish_bust.relay')
  })

  it('reads 2h as 2♥, and needs every word', () => {
    expect(paths('vs strong 2h')).toContain('competitive.vs_1nt_strong.2h')
    expect(paths('stayman zzz')).toEqual([])
  })

  it('leaves out a range end\'s plus and minus', () => {
    expect(paths('1nt range').some(p => /_(plus|minus)$/.test(p))).toBe(false)
  })

  it('finds other agreements', () => {
    expect(searchAgreements('kokish', data)).toHaveLength(1)
    expect(searchAgreements('nothing', data)).toEqual([])
  })
})

// A host's tests load the editor through Node, which refuses a JSON import
// without this attribute, though Vite allows it.
describe('the editor loads in Node', () => {
  it('imports its JSON with the attribute Node needs', () => {
    const files = fs.readdirSync(path.resolve(import.meta.dirname, '../src/editor'), { recursive: true }).filter(f => /\.(js|vue)$/.test(f) && !f.includes('__tests__'))
    const bare = files.filter(f => /from '[^']+\.json'(?! with \{ type: 'json' \})/.test(fs.readFileSync(path.resolve(import.meta.dirname, '../src/editor', f), 'utf8')))
    expect(bare).toEqual([])
  })
})
