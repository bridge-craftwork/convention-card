// reference.txt and llms.txt for bridge-craftwork.com/card/ (bridge-craftwork-site
// issue #3; DECISIONS.md, open question 6): every card field and every
// convention, written from the same spec the editor and the library read,
// and the window.card interface, from the same vocabulary the page runs.
// So the text cannot list a field the editor lacks, or leave one out.
// scripts/emit-reference.mjs writes the files before each build.

import { FIELDS, CONVENTIONS } from '../../js/spec.js'
import { EXPORT_SCHEMA } from '../../js/checkCard.js'
import { IMPORT_FORMATS } from '../../js/importCard.js'
import { HOME, INPUT, OUTPUTS, PARAMS } from './tool.js'

const SOURCE = 'https://github.com/bridge-craftwork/convention-card'
const WIDTH = 78

/** `text` wrapped to WIDTH, every line indented by `indent`; the first after `lead`. */
function wrap(text, indent = '', lead = indent) {
  const lines = []
  for (const para of String(text).trim().split(/\n\s*\n/)) {
    let line = lines.length ? indent : lead
    let empty = true
    for (const word of para.split(/\s+/)) {
      if (!empty && line.length + 1 + word.length > WIDTH) {
        lines.push(line)
        line = indent + word
      } else {
        line += (empty ? '' : ' ') + word
      }
      empty = false
    }
    lines.push(line)
  }
  return lines.join('\n')
}

function heading(text) {
  return `${text}\n${'-'.repeat(text.length)}`
}

/** One field: its path, then what it holds, aligned as in dealer3's reference. */
function fieldEntry(path, def) {
  const kind = {
    bool: 'yes/no (true or false)',
    int: `whole number${def.min != null || def.max != null ? `, ${def.min ?? ''}..${def.max ?? ''}` : ''}`,
    enum: `one of: ${(def.options || []).join(', ')}`,
    text: 'text',
  }[def.kind] || def.kind
  const rows = [['Label', def.label], ['Value', kind]]
  if (def.default !== undefined) rows.push(['Default', JSON.stringify(def.default)])
  if (def.desc) rows.push(['About', def.desc])
  if (def.note) rows.push(['Note', def.note])
  const skills = [def.skill || []].flat()
  if (skills.length) rows.push(['Convention', skills.join(', ') + (def.level ? ` (field level ${def.level})` : '')])
  else if (def.level) rows.push(['Level', String(def.level)])
  if (def.choice) rows.push(['Choice', `${def.choice}: one of these fields at most is on`])
  if (def.aliases?.length) rows.push(['Older paths', def.aliases.join(', ')])
  if (def.value_aliases) rows.push(['Also reads', Object.entries(def.value_aliases).map(([from, to]) => `"${from}" as ${to}`).join('; ')])
  return [`  ${path}`, ...rows.map(([k, v]) => wrap(v, ' '.repeat(18), `    ${(k + ':').padEnd(14)}`))].join('\n')
}

function conventionEntry(c) {
  const lines = [`  ${c.id}`, wrap(`${c.name}${c.level ? `, level ${c.level}` : ''}`, '    ')]
  if (c.names?.length) lines.push(wrap(`Written as: ${c.names.join('; ')}`, '      ', '    '))
  if (c.summary) lines.push(wrap(c.summary, '    '))
  for (const s of c.see || []) {
    const where = [s.by, s.site, s.kind === 'book' ? 'book' : null, s.chapter ? `chapter ${s.chapter}` : null].filter(Boolean).join(', ')
    lines.push(wrap(`See: ${s.title}${where ? ` (${where})` : ''}${s.url ? ` ${s.url}` : ''}`, '      ', '    '))
  }
  return lines.join('\n')
}

const sections = () => {
  const out = new Map()
  for (const [path, def] of Object.entries(FIELDS)) {
    const section = path.slice(0, path.indexOf('.'))
    if (!out.has(section)) out.set(section, [])
    out.get(section).push([path, def])
  }
  return out
}

/** reference.txt: the whole of it. */
export function renderReferenceText(version) {
  const fields = Object.entries(FIELDS)
  const conventions = Object.values(CONVENTIONS)
  const parts = []
  const title = `Bridge convention card reference, version ${version}`
  parts.push(`${title}\n${'='.repeat(title.length)}`)
  parts.push(wrap(
    'Every setting a convention card can hold, every convention it can name, ' +
    'and the program interface of the editor at ' + HOME + '. Generated from ' +
    'the spec the editor itself reads (spec/ in the source), so it lists ' +
    'exactly the fields the editor knows: a path not listed here is not a ' +
    'card field.'))
  parts.push([
    `  Edit a card:  ${HOME}`,
    `  Source:       ${SOURCE}`,
    `  The spec:     ${SOURCE}/tree/v${version}/spec`,
  ].join('\n'))

  parts.push(heading('THE CARD FORMAT'))
  parts.push(wrap(
    'A card is nested JSON, `card_data`. Each setting sits at a dotted path: ' +
    '`notrump.one_nt.range_min` is `{"notrump": {"one_nt": {"range_min": 15}}}`. ' +
    'A setting left out is unset; where the field has a default, that applies.'))
  parts.push(wrap(
    `A saved or exported card wraps it: {"schema": "${EXPORT_SCHEMA}", "name", ` +
    '"description", "exportedAt", "card_data"}. That is what the editor\'s ' +
    'Export Content writes and Import reads.'))
  parts.push(wrap(
    'Readers keep what they do not know. A path that is not a field, or a key ' +
    'starting with `_` (a raw import record), is kept and written back as it ' +
    'is. An older path still loads: each field lists its older paths.'))
  parts.push(wrap(
    'A convention with no field of its own goes in `other_agreements`: a list ' +
    'of {"id", "section", "text"}. `id` is a convention ID from CONVENTIONS ' +
    'below, or a namespaced one under a domain its author owns ' +
    '(github.com/alice/bridge-ideas/relay-stayman); `text` is what a person ' +
    'reads, and plain free text has no `id`.'))
  parts.push(wrap(
    'A field\'s Convention is the ID of the convention it belongs to. Levels run ' +
    'from 1 to 10: how hard a thing is to learn, which is also when a ' +
    'partnership might put it on its card. A convention\'s level is the lowest ' +
    'at which it is taught; a field that extends it (slam tries after Stayman, ' +
    'say) has its own, higher level. Fields in the same Choice group are ' +
    'alternatives: at most one of them is on.'))

  parts.push(heading('THE PROGRAM INTERFACE: window.card'))
  parts.push(wrap(
    'The editor page defines `window.card`, the interface every bridge-craftwork ' +
    'tool shares. Every method returns a promise except getInput.'))
  parts.push([
    '  run(input, params)       Read input and produce params.to:',
    '                           { ok, from, name, output, diagnostics }',
    '  validate(input, params)  Read and check input without converting it:',
    '                           { ok, from, name, diagnostics }',
    '  getInput()               The card open in the editor, as the export',
    '                           (unsaved edits included), or null',
    '  setInput(input, params)  Add input to this browser\'s cards and open it:',
    '                           { ok, name, diagnostics }',
    '  getOutput(params)        The open card, produced as params.to',
    '  info                     { tool, version, formats, outputs, reference }',
  ].join('\n'))
  parts.push(wrap(
    'A diagnostic is { severity: "error" | "warning" | "info", message, path?, ' +
    'hint? }; `path` is the field it is about. `ok` is false when any ' +
    'diagnostic is an error. A card with problems still converts, as in the ' +
    'editor: unknown paths and values are kept.'))
  parts.push('  input may be:\n' + INPUT.map(i => wrap(i.about, ' '.repeat(6), `    ${i.form}: `)).join('\n'))
  parts.push('  Formats read (params.from):\n' + Object.entries(IMPORT_FORMATS).map(([k, v]) => wrap(v, ' '.repeat(18), `    ${k.padEnd(14)}`)).join('\n'))
  parts.push('  Outputs (params.to):\n' + Object.entries(OUTPUTS).map(([k, v]) => wrap(v, ' '.repeat(22), `    ${k.padEnd(18)}`)).join('\n'))
  parts.push('  params:\n' + PARAMS.map(p => wrap(
    `${p.about} ${p.values ? `One of: ${p.values.join(', ')}.` : `Form: ${p.form}.`} Default: ${p.default}.`,
    ' '.repeat(10), `    ${p.name.padEnd(6)}`)).join('\n'))
  parts.push([
    '  Example:',
    '    const r = await window.card.run(bbsaText, { name: "Our card", to: "pdf-classic" })',
    '    if (!r.ok) console.log(r.diagnostics)',
  ].join('\n'))

  parts.push(heading('OPENING A CARD BY LINK'))
  parts.push(wrap(
    `${HOME}#import=v1.<data> adds a card to the visitor's cards and opens it. ` +
    '<data> is the JSON {"name", "description", "card_data"}, compressed with ' +
    'raw deflate (no zlib header) and written as base64url without padding. ' +
    'It travels in the fragment, so it never reaches a server. run(card, ' +
    '{ to: "link" }) makes one.'))

  parts.push(heading(`FIELDS (${fields.length})`))
  for (const [section, entries] of sections()) {
    parts.push(`[${section}]`)
    for (const [path, def] of entries) parts.push(fieldEntry(path, def))
  }

  parts.push(heading(`CONVENTIONS (${conventions.length})`))
  parts.push(wrap(
    'The standard list: every convention and skill the tools share, by ID. ' +
    'Summaries are our own; "See" lists where to read more.'))
  for (const c of conventions) parts.push(conventionEntry(c))

  return parts.join('\n\n') + '\n'
}

/** Every name reference.txt must contain: each field path and each convention ID. */
export function expectedNames() {
  return [...Object.keys(FIELDS), ...Object.keys(CONVENTIONS)]
}

/** llms.txt: the index (https://llmstxt.org), with figures true of this build. */
export function renderLlmsText(version, referenceBytes) {
  const kb = Math.round(referenceBytes / 1024)
  return `# Convention card

> Build and edit a bridge convention card in the browser, with no account.
> Import BBO, bridgeodex and BBA (.bbsa) cards; export the ACBL cards as PDF,
> .bbsa and JSON. Cards stay in the browser.

**If you are reading or writing a card, read the plain-text reference first.**
It is generated from the spec the editor reads, so it lists exactly the fields
a card can hold, and the page's program interface, window.card.

## Reference

- [Card reference, plain text](${HOME}reference.txt): every field (path, kind,
  values, default, older paths), every convention (ID, level, summary) and
  window.card. About ${kb} KB, ${Object.keys(FIELDS).length} fields and ${Object.keys(CONVENTIONS).length} conventions,
  version ${version}.

## Editing a card

- [The convention card editor](${HOME}): build a card, import one, print the
  ACBL card. A card can also be opened by link: ${HOME}#import=v1.<data>.

## Source

- [convention-card on GitHub](${SOURCE}): the spec, the JavaScript library,
  the editor and the Rust crate.
`
}
