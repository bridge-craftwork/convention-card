import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { toSchema3, fromSchema3, normalise, STORED_SCHEMA_VERSION } from '../schema3.js'
import { upgradeCardData, migrateCardData, CARD_SCHEMA_VERSION } from '../migrate.js'
import { importCard, detectFormat } from '../importCard.js'
import { exportRecord } from '../cardBundle.js'
import { cardValues } from '../checkCard.js'

// The same cases the crate checks (crates/bridge-card/tests/pack.rs), so the
// two readers of the pack's migrations/2-to-3.toml agree.
const ROOT = path.resolve(__dirname, '../..')
const CASES = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/migrations/2-to-3.cases.json'), 'utf8')).cases
const GOLDEN = path.join(ROOT, 'tests/golden/bbsa')
const sorted = v =>
  Array.isArray(v) ? v.map(sorted)
  : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sorted(v[k])]))
  : v

describe('a schema 2 card as schema 3', () => {
  for (const c of CASES) {
    it(c.name, () => {
      const before = JSON.stringify(c.before)
      expect(sorted(toSchema3(c.before))).toEqual(sorted(c.after))
      // The card given is not changed.
      expect(JSON.stringify(c.before)).toBe(before)
    })
  }

  it('reads back from schema 3 to the same schema 3', () => {
    for (const c of CASES) {
      const working = fromSchema3(c.after)
      expect(working.schema_version).toBe(CARD_SCHEMA_VERSION)
      expect([c.name, sorted(toSchema3(working))]).toEqual([c.name, sorted(c.after)])
    }
  })
})

describe('the working form', () => {
  const card = name => CASES.find(c => c.name.startsWith(name)).before

  it('shows a convention the card only implies as played', () => {
    const w = upgradeCardData(card('an unset switch with a treatment on'))
    // Puppet's box sits under Stayman in the working form; in schema 3 it
    // is Puppet Stayman's own entry, and Stayman is read as played beside it.
    expect(w.notrump.stayman).toEqual({ play: true, forcing: true, puppet_2nt: true })
    expect(cardValues(w).get('notrump.stayman.play')).toBe(true)
  })

  it('keeps a note under a convention the card ticked another against, unplayed', () => {
    const w = upgradeCardData(card('a tick beats a note'))
    expect(w.general.jump_shifts.strong_2).toBe(true)
    expect(w.other_conventions.weak_jump_shifts_notes).toBe('only by a passed hand')
    // Nothing in the working form says weak jump shifts are played.
    expect(w.general.jump_shifts.weak_2).toBeUndefined()
  })

  it('reads the 4NT line as a setting, whatever ace ask the card plays', () => {
    const w = upgradeCardData(card('the 4NT notes line is a setting'))
    expect(w.slam.rkcb).toEqual({ play: true, style: '1430' })
    expect(w.slam.blackwood).toBeUndefined()
    expect(w.other_conventions.blackwood.notes).toBe('0314 if used for minor suit')
  })

  it('keeps the wording of the defence a card names', () => {
    expect(upgradeCardData(card('the defence a card names')).competitive.vs_1nt_strong.system).toBe('Meckwell')
    const both = upgradeCardData(card('two parts worded differently')).competitive
    expect([both.vs_1nt_strong.system, both.vs_1nt_weak.system]).toEqual(['Strong - Suction', 'Weak - Suction'])
    expect(upgradeCardData(card('a name no option covers')).competitive.vs_1nt_strong.system).toBe('(Our own)')
  })

  it('lists what it has no switch for', () => {
    const w = upgradeCardData(card('listed agreements'))
    expect(w.other_agreements.map(a => a.id ?? null).sort()).toEqual(['bidding_conventions/kokish_game_tries', null].sort())
  })

  it('is stable: a card in the working form comes back as it is', () => {
    for (const c of CASES) {
      const once = upgradeCardData(c.before)
      expect([c.name, upgradeCardData(once)]).toEqual([c.name, once])
      expect(upgradeCardData(once)).toBe(once)
      expect(sorted(normalise(once))).toEqual(sorted(once))
    }
  })

  it('leaves a card as written when asked only to migrate it', () => {
    const before = card('an unset switch with a treatment on')
    expect(migrateCardData(before)).toBe(before)
  })
})

describe('reading and writing schema 3', () => {
  it('knows a schema 3 card for a card, not a Bridgodex file', () => {
    expect(detectFormat(CASES[0].after)).toBe('card')
    expect(detectFormat({ settings: {}, notes: {} })).toBe('bridgeodex')
  })

  it('imports a schema 3 card into the working form', async () => {
    const read = await importCard(CASES[0].after, { name: 'x' })
    expect(read.card_data.notrump.stayman).toEqual({ play: true, forcing: true })
    expect(read.card_data.notrump.one_nt.range_min).toBe(15)
  })

  it('exports a card as schema 3, and reads its own export back', async () => {
    const names = fs.readdirSync(GOLDEN).filter(n => n.endsWith('.bbsa'))
    expect(names.length).toBeGreaterThan(0)
    for (const name of names) {
      const text = fs.readFileSync(path.join(GOLDEN, name), 'utf8')
      const working = (await importCard(text, { name, from: 'bbsa' })).card_data
      const out = exportRecord({ name, card_data: working })
      expect(out.card_data.schema_version).toBe(STORED_SCHEMA_VERSION)
      const back = await importCard(out)
      expect([name, sorted(back.card_data)]).toEqual([name, sorted(working)])
    }
  })
})
