// Copy a convention pack's published snapshot into spec/pack.json, which is
// what the library reads (js/spec.js).
//
//   node scripts/sync_pack.mjs <directory holding pack.json and manifest.json>
//
// The snapshot comes from bridge-common-conventions: its `published` branch,
// or `python3 scripts/build_snapshot.py --out DIR` in a checkout. The copy
// leaves out the rule, test and notes files, which a card tool does not read,
// and records the commit the snapshot was built from.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = process.argv[2]
if (!dir) {
  console.error('usage: sync_pack.mjs <directory holding pack.json and manifest.json>')
  process.exit(2)
}
const { files, ...pack } = JSON.parse(fs.readFileSync(path.join(dir, 'pack.json'), 'utf8'))
const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'))
if (manifest.uncommitted_changes) console.warn('warning: this snapshot was built from uncommitted changes')
const out = {
  generated_from: `bridge-common-conventions pack.json (do not edit: node scripts/sync_pack.mjs)`,
  source_commit: manifest.source_commit,
  ...pack,
}
const target = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'spec', 'pack.json')
fs.writeFileSync(target, JSON.stringify(out, null, 1) + '\n')
console.log(`spec/pack.json: ${Object.keys(pack.conventions).length} definitions from ${manifest.source_commit}`)
