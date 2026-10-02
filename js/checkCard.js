// Check a card against the spec, as the Rust crate's `Card::from_json` does
// (crates/bridge-card/src/card.rs): which paths were read through an alias,
// which the spec does not know, which values it rejects, and which choice
// groups have more than one alternative on. Nothing is changed or dropped:
// saved cards keep loading, and fields a reader does not know are kept
// (CLAUDE.md). A change to what the crate reports belongs here too.

import { FIELDS, field } from './spec.js'

/** The `schema` of the editor's "Export content" file: `{schema, name, description, exportedAt, card_data}`. */
export const EXPORT_SCHEMA = 'bridge-classroom/card_data@v1'
const EXPORT_SCHEMA_FAMILY = 'bridge-classroom/card_data@'

// Top-level keys that are not settings, and leaves the editor keeps for itself.
const NOT_SETTINGS = new Set(['schema_version', 'format', 'metadata', 'bba_passthrough', 'conventions_list'])
const EDITOR_LEAVES = new Set(['skill_path'])

// Choice groups: yes/no fields that are alternatives to one another.
const CHOICES = new Map()
for (const [path, def] of Object.entries(FIELDS)) {
  if (!def.choice) continue
  if (!CHOICES.has(def.choice)) CHOICES.set(def.choice, [])
  CHOICES.get(def.choice).push(path)
}

const fold = s => s.trim().replace(/[ -]/g, '_').toLowerCase()

/** `value` checked against the field `def`: `{ value }` (normalised) or `{ problem }`. */
export function checkValue(def, value) {
  const found = typeof value === 'string' ? JSON.stringify(value) : String(value)
  switch (def.kind) {
    case 'bool':
      return typeof value === 'boolean' ? { value } : { problem: `expected yes/no (true or false), found ${found}` }
    case 'int':
      if (!Number.isInteger(value)) return { problem: `expected a whole number, found ${found}` }
      if ((def.min != null && value < def.min) || (def.max != null && value > def.max)) {
        return { problem: `${value} is outside ${def.min ?? ''}..${def.max ?? ''}` }
      }
      return { value }
    case 'enum': {
      const s = Number.isInteger(value) ? String(value) : value
      if (typeof s !== 'string') return { problem: `expected one of ${def.options.join(', ')}, found ${found}` }
      if (def.options.includes(s)) return { value: s }
      const aliases = def.value_aliases || {}
      if (Object.hasOwn(aliases, s)) return { value: aliases[s] }
      const f = fold(s)
      const option = def.options.find(o => fold(o) === f)
      if (option) return { value: option }
      const alias = Object.keys(aliases).find(a => fold(a) === f)
      if (alias) return { value: aliases[alias] }
      return { problem: `${found} is not one of ${def.options.join(', ')}` }
    }
    case 'text':
      return typeof value === 'string' ? { value } : { problem: `expected text, found ${found}` }
    default:
      return { problem: `unknown field kind ${def.kind}` }
  }
}

// `[dotted path, leaf]` pairs; arrays are leaves. A key starting with `_` is
// a raw import record (`_bbo_raw`), not a setting: it is not walked.
function leaves(prefix, value, out, ignored) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [k, v] of Object.entries(value)) {
      const path = `${prefix}.${k}`
      if (k.startsWith('_')) ignored.push(path)
      else leaves(path, v, out, ignored)
    }
  } else {
    out.push([prefix, value])
  }
}

/**
 * Check a card: bare `card_data`, or a record `{ name, description,
 * card_data }` (the editor's export, with or without its `schema`). Returns
 * `{ name, description, card_data, report, diagnostics }`; `report` has the
 * crate's lists (`aliased`, `unknown`, `invalid`, `ignored`, `conflicts`,
 * `wrapper`), and `diagnostics` says the same in sentences:
 * `{ severity: 'error' | 'warning' | 'info', message, path?, hint? }`.
 * A card is valid when no diagnostic is an error.
 */
export function checkCard(input) {
  const report = { aliased: [], unknown: [], invalid: [], ignored: [], conflicts: [], wrapper: null }
  const diagnostics = []
  const result = (extra = {}) => ({ name: null, description: null, card_data: null, report, diagnostics, ...extra })

  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    diagnostics.push({ severity: 'error', message: 'A card is a JSON object' })
    return result()
  }
  let card_data = input
  let name = null
  let description = null
  if (input.card_data && typeof input.card_data === 'object') {
    const schema = typeof input.schema === 'string' ? input.schema : ''
    if (schema && schema !== EXPORT_SCHEMA) {
      diagnostics.push({
        severity: 'error',
        message: schema.startsWith(EXPORT_SCHEMA_FAMILY)
          ? `${schema}: a newer card export than this reads (${EXPORT_SCHEMA})`
          : `schema ${JSON.stringify(schema)}: not a card export (${EXPORT_SCHEMA})`,
      })
      return result()
    }
    report.wrapper = EXPORT_SCHEMA
    card_data = input.card_data
    const text = v => (typeof v === 'string' && v.trim() ? v : null)
    name = text(input.name)
    description = text(input.description)
  }
  name ??= card_data.metadata?.name ?? null
  description ??= card_data.metadata?.description ?? null

  const found = []
  for (const [key, value] of Object.entries(card_data)) {
    if (key.startsWith('_')) report.ignored.push(key)
    else if (key === 'other_agreements') checkOtherAgreements(value, report)
    else if (!NOT_SETTINGS.has(key)) leaves(key, value, found, report.ignored)
  }

  const values = new Map()
  for (const [path, value] of found) {
    if (value == null || EDITOR_LEAVES.has(path.slice(path.lastIndexOf('.') + 1))) continue
    const f = field(path)
    if (!f) {
      report.unknown.push(path)
      continue
    }
    const checked = checkValue(f, value)
    if (checked.problem) {
      report.invalid.push([path, checked.problem])
      continue
    }
    if (f.path !== path) report.aliased.push([path, f.path])
    values.set(f.path, checked.value)
  }

  const isOn = path => (values.has(path) ? values.get(path) : FIELDS[path].default) === true
  for (const [group, members] of CHOICES) {
    const on = members.filter(isOn)
    if (on.length > 1) report.conflicts.push([group, on])
  }

  for (const [path, problem] of report.invalid) {
    const f = field(path)
    diagnostics.push({ severity: 'error', message: `${path}: ${problem}`, path, ...(f?.label && { hint: f.label }) })
  }
  for (const [group, on] of report.conflicts) {
    diagnostics.push({
      severity: 'warning',
      message: `${on.join(' and ')} are ${on.length === 2 ? 'both' : 'all'} on, but they are alternatives (${group}): which does the partnership play?`,
      path: on[0],
    })
  }
  for (const path of report.unknown) {
    diagnostics.push({
      severity: 'warning',
      message: `${path}: not a field of the card; kept as it is`,
      path,
    })
  }
  for (const [from, to] of report.aliased) {
    diagnostics.push({ severity: 'info', message: `${from}: an older name for ${to}`, path: from })
  }
  return result({ name, description, card_data })
}

// ADR-0001 D5: `[{ id?, section?, text }]`, extra keys kept.
function checkOtherAgreements(list, report) {
  const problem = !Array.isArray(list)
    ? 'expected a list'
    : list.map((a, i) => {
        if (!a || typeof a !== 'object' || Array.isArray(a)) return `entry ${i + 1}: expected an object`
        if (typeof a.text !== 'string') return `entry ${i + 1}: text is missing`
        for (const k of ['id', 'section']) {
          if (a[k] != null && typeof a[k] !== 'string') return `entry ${i + 1}: ${k} must be text`
        }
        return null
      }).find(Boolean)
  if (problem) report.invalid.push(['other_agreements', problem])
}
