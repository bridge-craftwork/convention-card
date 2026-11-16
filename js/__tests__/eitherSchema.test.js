// A card may reach any reader as it was saved (schema 3) or in the working
// form the library uses inside. Every reader gives the same answer for both.
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { upgradeCardData } from '../migrate.js'
import { toSchema3 } from '../schema3.js'
import { exportBridgodexJson } from '../bridgodex.js'
import { exportBboCard } from '../bbo.js'
import { exportBbsa } from '../bbsa.js'
import { suggestConventions, playsConvention } from '../recogniseConventions.js'
import { textMapping } from '../textMapping.js'
import { notesPageContent } from '../notesPage.js'
import { cardValues } from '../checkCard.js'
import { compareCards } from '../compareCards.js'
import { summarize, DISTINGUISHING } from '../../web/src/editor/cardSummary.js'

const ROOT = path.resolve(__dirname, '../..')
const read = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'))
const CARDS = {
  seed: read('crates/bridge-card/tests/fixtures/21_intermediate_card.json'),
  dense: read('js/__tests__/fixtures/dense-convention-card.json'),
}
const plain = v => JSON.parse(JSON.stringify(v, (k, x) => (x instanceof Map ? [...x] : x instanceof Set ? [...x] : x)))

const READERS = {
  exportBridgodexJson: d => exportBridgodexJson(d),
  exportBboCard: d => exportBboCard(d),
  exportBbsa: d => exportBbsa(d).text,
  suggestConventions: d => suggestConventions(d),
  playsConvention: d => playsConvention(d, 'bidding_conventions/stayman'),
  textMapping: d => textMapping(d),
  notesPageContent: d => notesPageContent({ card_data: d }),
  cardValues: d => [...cardValues(d)].sort(),
  summarize: d => { const { data, ...row } = summarize({ id: 'a', card_data: d }); return row },
  distinguishing: d => DISTINGUISHING.map(x => x.value(summarize({ id: 'a', card_data: d }).data)),
}

describe('a card in schema 3 reads as it does in the working form', () => {
  for (const [name, card] of Object.entries(CARDS)) {
    const working = upgradeCardData(structuredClone(card.card_data || card))
    const saved = toSchema3(working)
    it(`${name}: is saved in schema 3`, () => {
      expect(saved.schema_version).toBe('3.0')
      expect(saved.conventions).toBeTruthy()
    })
    for (const [reader, read] of Object.entries(READERS)) {
      it(`${name}: ${reader}`, () => {
        expect(plain(read(structuredClone(saved)))).toEqual(plain(read(structuredClone(working))))
      })
    }
    it(`${name}: compares equal to itself`, () => {
      expect(compareCards([working, saved]).rows.filter(r => r.status === 'differs')).toEqual([])
    })
  }
  it('the distinguishing columns say something for the dense card', () => {
    const saved = toSchema3(upgradeCardData(structuredClone(CARDS.dense.card_data || CARDS.dense)))
    const row = summarize({ id: 'a', card_data: saved })
    expect(DISTINGUISHING.some(d => d.value(row.data))).toBe(true)
  })
})
