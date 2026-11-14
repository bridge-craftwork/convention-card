// A convention pack (bridge-common-conventions), as the library reads it.
//
// The pack names things by address: a convention by its ID
// (`bidding_conventions/stayman`), a treatment as `<id>:<treatment>`, a
// setting by its dotted path, a function by its name and part. Card schema 2
// named every one of them by a dotted path (`notrump.stayman.play`). Until
// cards are stored in schema 3 the library still works in those paths, so
// this module turns the pack back into schema 2's field list, using the
// pack's own record of the move (migrations/2-to-3.toml).
//
// `pack` is the published snapshot's pack.json (or the copy of it in
// spec/pack.json, which leaves out the rule files).

const asList = v => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v])

/**
 * Every address in the pack and the schema 2 path that named it:
 * `{ path: Map(address → path), address: Map(path → address) }`.
 */
export function addressMaps(pack) {
  const mig = pack.migrations['2-to-3']
  const path = new Map()
  for (const [p, id] of Object.entries(mig.convention || {})) path.set(id, p)
  for (const [p, a] of Object.entries(mig.treatment || {})) path.set(a, p)
  for (const place of mig.place || []) {
    for (const [p, t] of Object.entries(place.switches)) path.set(`${place.convention}:${t}`, p)
  }
  for (const [name, fn] of Object.entries(pack.functions)) {
    for (const [part, was] of Object.entries(fn.was || {})) path.set(`${name}.${part}`, was.setting)
  }
  for (const [section, fields] of Object.entries(pack.settings)) {
    for (const key of Object.keys(fields)) path.set(`${section}.${key}`, `${section}.${key}`)
  }
  const address = new Map([...path].map(([a, p]) => [p, a]))
  return { path, address }
}

/**
 * Card schema 2's fields, rebuilt from the pack: `{ path: definition }` with
 * the attributes spec/fields.toml gave each (kind, label, options, bounds,
 * default, aliases, skill, level, choice...).
 */
export function schema2Fields(pack) {
  const mig = pack.migrations['2-to-3']
  const defs = pack.conventions
  const { path: back } = addressMaps(pack)
  const isNew = new Set(mig.new_ids || [])
  const pathOf = (id, a) => back.get(a) ?? back.get(`${id}:${a}`) ?? a
  const repoint = (def, of) => {
    for (const k of ['explains', 'requires']) if (k in def) def[k] = of(def[k])
    if (def.implies) {
      def.implies = Object.fromEntries(Object.entries(def.implies).map(([i, p]) => [i, of(p)]))
    }
    return def
  }
  const out = {}

  for (const [section, fields] of Object.entries(pack.settings)) {
    for (const [key, def] of Object.entries(fields)) {
      out[`${section}.${key}`] = repoint({ ...def }, a => back.get(a) ?? a)
    }
  }
  // A setting whose value named a convention: now a function.
  for (const fn of Object.values(pack.functions)) {
    for (const was of Object.values(fn.was || {})) {
      const def = { kind: 'enum', label: was.label, options: was.options }
      for (const k of ['value_aliases', 'desc', 'level', 'skill']) if (k in was) def[k] = was[k]
      out[was.setting] = def
    }
  }
  // A convention's switch.
  const switchSkill = id => [...(isNew.has(id) ? [] : [id]), ...asList(defs[id].taught_under)]
  const switched = new Set()
  for (const [p, id] of Object.entries(mig.convention || {})) {
    const d = defs[id]
    switched.add(id)
    const def = { kind: 'bool', label: d.label ?? d.name, level: d.level }
    if ('desc' in d) def.desc = d.desc
    const skill = switchSkill(id)
    if (skill.length) def.skill = skill
    out[p] = def
  }
  // Its treatments, the places it is played among them.
  const places = new Set((mig.place || []).flatMap(pl => Object.keys(pl.switches)))
  for (const [id, d] of Object.entries(defs)) {
    const base = switched.has(id) ? switchSkill(id) : [id]
    for (const [t, attrs] of Object.entries(d.treatments || {})) {
      const p = back.get(`${id}:${t}`)
      const { skill, taught_under: also, ...def } = attrs
      if (places.has(p)) {
        if (def.default === true) delete def.default
        delete def.context
      }
      const own = skill === undefined ? [...base, ...asList(also)] : skill === false ? [] : asList(skill)
      if (own.length) def.skill = own
      out[p] = repoint(def, a => pathOf(id, a))
    }
  }
  for (const [old, target] of Object.entries(mig.alias || {})) {
    const def = out[back.get(target) ?? target]
    def.aliases = [...(def.aliases || []), old].sort()
  }
  // What schema 3 holds another way (a choice group that became a function).
  for (const [p, attrs] of Object.entries(mig.was || {})) Object.assign(out[p], attrs)
  // Schema 2's own order, then anything the pack has added since.
  const ordered = {}
  for (const p of mig.order || []) if (p in out) ordered[p] = out[p]
  return Object.assign(ordered, out)
}

/** The alert entries with each field named by its schema 2 path. */
export function schema2Alerts(pack) {
  const { path } = addressMaps(pack)
  return {
    regulators: pack.alerts.regulators,
    alert: (pack.alerts.alert || []).map(a => ({ ...a, fields: a.fields.map(f => path.get(f) ?? f) })),
  }
}
