// Writes web/public/reference.txt and web/public/llms.txt from the spec
// (web/src/referenceText.js). Runs before `vite build` (the `prebuild`
// script), so Vite copies both out of public/ to the root of the deploy:
// /reference.txt on convention-card.pages.dev, /card/reference.txt through
// the site. Generated, not committed: a hand-kept copy would be true of
// whichever build someone last remembered.

import { readFile, writeFile } from 'node:fs/promises'
import { renderReferenceText, renderLlmsText, expectedNames } from '../web/src/referenceText.js'

const PACKAGE = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const OUT = new URL('../web/public/reference.txt', import.meta.url)
const LLMS = new URL('../web/public/llms.txt', import.meta.url)

const text = renderReferenceText(PACKAGE.version)

// A dropped section would still look like a reference; check every name is in it.
const missing = expectedNames().filter(name => !text.includes(name))
if (missing.length) {
  console.error(`reference.txt is missing ${missing.length} of the spec's names: ${missing.slice(0, 12).join(', ')}${missing.length > 12 ? ' …' : ''}`)
  process.exit(1)
}

await writeFile(OUT, text)
const bytes = Buffer.byteLength(text)
await writeFile(LLMS, renderLlmsText(PACKAGE.version, bytes))
console.log(`reference.txt: ${(bytes / 1024).toFixed(1)} KB, ${expectedNames().length} names; llms.txt`)
