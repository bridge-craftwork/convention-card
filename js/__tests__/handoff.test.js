import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { encodeCardForUrl, decodeCardFromUrl } from '../handoff.js'
import { upgradeCardData } from '../migrate.js'
import { toSchema3 } from '../schema3.js'

const DENSE = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/dense-convention-card.json'), 'utf8'))

describe('handing a card over in a URL', () => {
  it('round-trips a card, URL-safe and compact', async () => {
    const record = { name: DENSE.name, description: 'A full card', card_data: DENSE.card_data }
    const text = await encodeCardForUrl(record)
    expect(text).toMatch(/^v1\.[A-Za-z0-9_-]+$/)
    // A dense real card stays well inside what browsers accept in a URL.
    expect(text.length).toBeLessThan(8000)
    // The card travels as it is stored: card schema 3.
    expect(await decodeCardFromUrl(text)).toEqual({ ...record, card_data: toSchema3(upgradeCardData(record.card_data)) })
  })

  it('refuses what is not a hand-off', async () => {
    await expect(decodeCardFromUrl('hello')).rejects.toThrow(/v1/)
    await expect(decodeCardFromUrl('v1.AAAA')).rejects.toThrow()
  })
})
