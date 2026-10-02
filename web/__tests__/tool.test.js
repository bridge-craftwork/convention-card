import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import { createTool, OUTPUTS } from '../src/tool.js'
import { decodeCardFromUrl } from '../../js/handoff.js'
import { setAssetLoader, TEMPLATE_FILES, FONT_FILE } from '../../js/assets.js'

// window.card, the bridge-craftwork tool contract, driven as the page drives
// it but with a stand-in editor: `current` is the open card, `open` records
// what setInput opened.
const ROOT = path.resolve(__dirname, '../..')
const SEED = JSON.parse(fs.readFileSync(path.join(ROOT, 'crates/bridge-card/tests/fixtures/21_intermediate_card.json'), 'utf8'))
const BBSA = fs.readFileSync(path.join(ROOT, 'crates/bridge-card/tests/fixtures/bbsa/21GF-DEFAULT.bbsa'), 'utf8')
const OPEN = { name: 'Open card', description: null, card_data: SEED }

function tool(current = OPEN) {
  const opened = []
  const t = createTool({ current: () => current, open: async record => { opened.push(record) } })
  return { t, opened }
}

beforeAll(() => {
  setAssetLoader({
    template: name => fs.readFileSync(path.join(ROOT, 'assets/templates', TEMPLATE_FILES[name])),
    font: () => fs.readFileSync(path.join(ROOT, 'assets/fonts', FONT_FILE)),
  })
})

describe('window.card', () => {
  it('getInput is the open card as the export', () => {
    const { t } = tool()
    expect(t.getInput()).toEqual({ schema: 'bridge-classroom/card_data@v1', name: 'Open card', description: null, card_data: SEED })
    expect(tool(null).t.getInput()).toBe(null)
  })

  it('validates the open card, and finds a bad value with its path', async () => {
    const { t } = tool()
    expect(await t.validate()).toMatchObject({ ok: true, from: 'card', name: 'Open card' })
    const bad = await t.validate({ notrump: { one_nt: { range_min: 40 } } })
    expect(bad.ok).toBe(false)
    expect(bad.diagnostics).toContainEqual(expect.objectContaining({ severity: 'error', path: 'notrump.one_nt.range_min' }))
  })

  it('says what is wrong with input it cannot read, and with parameters', async () => {
    const { t } = tool(null)
    expect((await t.validate()).diagnostics[0].message).toMatch(/No card is open/)
    expect((await t.validate('hello')).diagnostics[0].severity).toBe('error')
    const r = await t.run(SEED, { to: 'word', colour: 'red' })
    expect(r.ok).toBe(false)
    expect(r.diagnostics.map(d => d.severity)).toEqual(expect.arrayContaining(['warning', 'error']))
  })

  it('converts .bbsa to the export and back', async () => {
    const { t } = tool(null)
    const card = await t.run(BBSA, { name: '21GF-DEFAULT' })
    expect(card).toMatchObject({ ok: true, from: 'bbsa', name: '21GF-DEFAULT' })
    expect(card.output.schema).toBe('bridge-classroom/card_data@v1')
    const back = await t.run(card.output, { to: 'bbsa' })
    expect(back.output).toBe(fs.readFileSync(path.join(ROOT, 'tests/golden/bbsa/21GF-DEFAULT.export.bbsa'), 'utf8'))
  })

  it('makes a PDF that reads back to the same card', async () => {
    const { t } = tool()
    const pdf = await t.getOutput({ to: 'pdf-classic' })
    expect(pdf.ok).toBe(true)
    expect(pdf.output).toBeInstanceOf(Uint8Array)
    const back = await t.run(pdf.output, { to: 'card_data' })
    expect(back).toMatchObject({ ok: true, from: 'pdf', name: 'Open card' })
    expect(back.output).toEqual(SEED)
  })

  it('makes the drawn PDF', async () => {
    const r = await tool().t.getOutput({ to: 'pdf-drawn' })
    expect(r.ok).toBe(true)
    expect(new TextDecoder().decode(r.output.slice(0, 4))).toBe('%PDF')
  })

  it('makes links that carry the card', async () => {
    const { t } = tool()
    const link = await t.getOutput({ to: 'link' })
    expect(link.output).toMatch(/^https:\/\/bridge-craftwork\.com\/card\/#import=v1\./)
    expect((await decodeCardFromUrl(link.output.split('#import=')[1])).card_data).toEqual(SEED)
    const bc = await t.getOutput({ to: 'bridge-classroom' })
    expect(bc.output).toMatch(/^https:\/\/bridge-classroom\.com\/#\/convention-card\?import=v1\./)
    // A link reads straight back in.
    expect((await t.run(link.output, { to: 'card_data' })).output).toEqual(SEED)
  })

  it('setInput opens the card it read', async () => {
    const { t, opened } = tool(null)
    const r = await t.setInput(BBSA, { name: 'From BBA' })
    expect(r).toMatchObject({ ok: true, name: 'From BBA' })
    expect(opened).toHaveLength(1)
    expect(opened[0].name).toBe('From BBA')
    expect((await t.setInput('nonsense')).ok).toBe(false)
    expect(opened).toHaveLength(1)
  })

  it('every output is produced', async () => {
    const { t } = tool()
    for (const to of Object.keys(OUTPUTS)) {
      const r = await t.getOutput({ to })
      expect([to, r.ok, r.output != null]).toEqual([to, true, true])
    }
  })
})
