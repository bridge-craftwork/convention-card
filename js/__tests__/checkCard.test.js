import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { checkCard, checkValue } from '../checkCard.js'
import { field, FIELDS } from '../spec.js'

const ROOT = path.resolve(__dirname, '../..')
const read = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'))
const SEED = read('crates/bridge-card/tests/fixtures/21_intermediate_card.json')
const DENSE = read('js/__tests__/fixtures/dense-convention-card.json')
const GOLDEN = path.join(ROOT, 'tests/golden/bbsa')

const errors = r => r.diagnostics.filter(d => d.severity === 'error')

describe('checkCard', () => {
  it('finds nothing wrong with the test cards', () => {
    for (const card of [SEED, DENSE]) {
      const r = checkCard(card)
      expect(r.report.unknown).toEqual([])
      expect(r.report.invalid).toEqual([])
    }
  })

  // The crate wrote these cards, so it reads them clean: so must this.
  it("agrees with the crate on the crate's own cards", () => {
    const names = fs.readdirSync(GOLDEN).filter(f => f.endsWith('.card.json'))
    expect(names.length).toBeGreaterThanOrEqual(18)
    for (const name of names) {
      const r = checkCard(JSON.parse(fs.readFileSync(path.join(GOLDEN, name), 'utf8')))
      expect([name, r.report.unknown, r.report.invalid]).toEqual([name, [], []])
    }
  })

  it('reads the export wrapper and its name', () => {
    const r = checkCard({ schema: 'bridge-classroom/card_data@v1', name: 'Ours', card_data: SEED })
    expect(r.report.wrapper).toBe('bridge-classroom/card_data@v1')
    expect(r.name).toBe('Ours')
    expect(r.card_data).toBe(SEED)
  })

  it('refuses a newer export', () => {
    const r = checkCard({ schema: 'bridge-classroom/card_data@v2', card_data: {} })
    expect(errors(r)[0].message).toMatch(/newer/)
  })

  it('reports unknown paths, bad values, aliases and conflicts, and changes nothing', () => {
    const card = {
      notrump: { one_nt: { range_min: 40 }, mystery: true },
      other_conventions: { blackwood: { rkcb_1430: true } },
      _bbo_raw: { anything: 1 },
      metadata: { name: 'x' },
    }
    const before = JSON.stringify(card)
    const r = checkCard(card)
    expect(JSON.stringify(card)).toBe(before)
    expect(r.report.unknown).toEqual(['notrump.mystery'])
    expect(r.report.invalid.map(([p]) => p)).toEqual(['notrump.one_nt.range_min'])
    expect(r.report.ignored).toEqual(['_bbo_raw'])
    expect(r.report.aliased.map(([from]) => from)).toContain('other_conventions.blackwood.rkcb_1430')
    expect(errors(r).map(d => d.path)).toEqual(['notrump.one_nt.range_min'])
    expect(r.diagnostics.find(d => d.path === 'notrump.mystery').severity).toBe('warning')
  })

  it('reports two alternatives of a choice group that are both on', () => {
    const [group, members] = choiceGroup()
    const card = {}
    for (const p of members.slice(0, 2)) {
      const [section, ...rest] = p.split('.')
      let o = (card[section] ??= {})
      for (const k of rest.slice(0, -1)) o = o[k] ??= {}
      o[rest.at(-1)] = true
    }
    const r = checkCard(card)
    expect(r.report.conflicts.map(([g]) => g)).toContain(group)
  })

  it('checks other_agreements', () => {
    expect(checkCard({ other_agreements: [{ id: 'bidding_conventions/gerber', text: 'Gerber' }] }).report.invalid).toEqual([])
    expect(checkCard({ other_agreements: [{ id: 3 }] }).report.invalid[0][0]).toBe('other_agreements')
  })
})

describe('checkValue', () => {
  it("normalises as the crate's FieldDef::normalize does", () => {
    const len = field('minor_openings.one_diamond.min_length')
    expect(checkValue(len, 4)).toEqual({ value: '4' })
    expect(checkValue(len, '7').problem).toBeTruthy()
    const vs1nt = field('competitive.vs_1nt_strong.system')
    expect(checkValue(vs1nt, 'Strong - Suction')).toEqual({ value: 'suction' })
    expect(checkValue(vs1nt, 'STRONG - SUCTION')).toEqual({ value: 'suction' })
    expect(checkValue(field('notrump.one_nt.range_min'), 15.5).problem).toBeTruthy()
  })
})

function choiceGroup() {
  const groups = {}
  for (const [p, def] of Object.entries(FIELDS)) if (def.choice) (groups[def.choice] ??= []).push(p)
  return Object.entries(groups).find(([, m]) => m.length >= 2)
}
