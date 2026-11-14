//! A convention pack (`bridge-common-conventions`' `docs/CONTRACT.md`):
//! convention definitions, card settings and functions, read at run time
//! from a directory or from files already in memory.
//!
//! A pack gives a [`Vocabulary`](crate::Vocabulary) whose fields are named by
//! *address*: a convention by its ID (`bidding_conventions/stayman`, a yes/no
//! field that is on when the card plays it), a treatment by
//! `<id>:<treatment>`, a setting by its dotted path, and a function, or one
//! part of it, by its name (`defence_to_1nt.strong`, read only: the ID of
//! the convention the card plays for it).
//!
//! Card schema 2's paths stay readable: each is an alias of the address it
//! became (`notrump.texas.play` is `bidding_conventions/texas`), taken from
//! the pack's `migrations/2-to-3.toml`, so rule files and format maps written
//! against schema 2 keep working until they are converted.

use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::path::Path;

use serde::Deserialize;
use serde_json::{Map, Value as Json};

use crate::registry::{FieldDef, FieldKind, Registry, Value};
use crate::Error;

/// The card schema a pack's cards are written in.
pub const CARD_SCHEMA_VERSION: &str = "3.0";

/// Keys of a card entry that are not treatments.
pub const RESERVED: &[&str] = &["play", "text", "from", "for"];

/// How a field's value is worked out from the rest of the card.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Derived {
    /// The ID of the convention the card plays for a function's part.
    FunctionId { function: String, part: String },
    /// The same, as the option word of the schema 2 setting that chose it.
    FunctionOption { function: String, part: String },
}

/// One function: a job one convention at a time can do.
#[derive(Debug, Clone, Default)]
pub struct Function {
    pub name: String,
    pub label: String,
    /// Empty for a function with no parts.
    pub parts: Vec<String>,
    /// Each convention that implements it, with the parts it fills.
    pub implementers: Vec<(String, Vec<String>)>,
    /// Schema 2's option words: word to ID.
    pub option: BTreeMap<String, String>,
}

impl Function {
    /// The addresses of this function's parts (`defence_to_1nt.strong`), or
    /// its own name when it has none.
    pub fn addresses(&self) -> Vec<String> {
        if self.parts.is_empty() {
            vec![self.name.clone()]
        } else {
            self.parts
                .iter()
                .map(|p| format!("{}.{p}", self.name))
                .collect()
        }
    }
}

/// `migrations/2-to-3.toml`.
#[derive(Debug, Clone, Default, Deserialize)]
pub struct Migration3 {
    #[serde(default)]
    pub convention: BTreeMap<String, String>,
    #[serde(default)]
    pub treatment: BTreeMap<String, String>,
    #[serde(default)]
    pub place: Vec<PlaceMove>,
    #[serde(default)]
    pub function: Vec<FunctionMove>,
    #[serde(default)]
    pub alias: BTreeMap<String, String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct PlaceMove {
    pub convention: String,
    pub switches: BTreeMap<String, String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct FunctionMove {
    pub function: String,
    /// part to the schema 2 setting's path.
    pub settings: BTreeMap<String, String>,
    pub options: BTreeMap<String, String>,
    #[serde(default)]
    pub no_entry: Vec<String>,
    /// A switch that turned its convention on for a part only while that
    /// part's setting was unset or `other`: switch path to part.
    #[serde(default)]
    pub unless_chosen: BTreeMap<String, String>,
}

/// Where a schema 2 path went.
#[derive(Debug, Clone, PartialEq, Eq)]
enum Target {
    Switch(String),
    Treatment(String, String),
    Place(String, String),
    FunctionSetting(String, String),
}

/// A parsed pack.
#[derive(Debug, Clone)]
pub struct Pack {
    pub name: String,
    pub(crate) registry: Registry,
    pub functions: Vec<Function>,
    pub migration: Migration3,
    targets: HashMap<String, Target>,
    /// Spellings of the schema 2 function settings' options, folded.
    option_words: HashMap<(String, String), HashMap<String, String>>,
}

fn fold(s: &str) -> String {
    s.trim()
        .chars()
        .map(|c| match c {
            ' ' | '-' => '_',
            c => c.to_ascii_lowercase(),
        })
        .collect()
}

fn strings(v: Option<&toml::Value>) -> Vec<String> {
    match v {
        Some(toml::Value::String(s)) => vec![s.clone()],
        Some(toml::Value::Array(a)) => a
            .iter()
            .filter_map(|x| x.as_str().map(str::to_string))
            .collect(),
        _ => Vec::new(),
    }
}

impl Pack {
    /// Read the pack in `dir`.
    pub fn load(dir: &Path) -> Result<Pack, Error> {
        fn walk(dir: &Path, root: &Path, out: &mut Vec<(String, String)>) -> Result<(), Error> {
            let entries = std::fs::read_dir(dir)
                .map_err(|e| Error::new(e.to_string()).in_file(&dir.display().to_string()))?;
            for e in entries.flatten() {
                let p = e.path();
                if p.is_dir() {
                    walk(&p, root, out)?;
                } else if p.extension().is_some_and(|x| x == "toml") {
                    let text = std::fs::read_to_string(&p)
                        .map_err(|e| Error::new(e.to_string()).in_file(&p.display().to_string()))?;
                    let rel = p.strip_prefix(root).unwrap_or(&p);
                    out.push((rel.to_string_lossy().replace('\\', "/"), text));
                }
            }
            Ok(())
        }
        let mut files = Vec::new();
        for top in ["bridge-pack.toml", "functions.toml"] {
            let p = dir.join(top);
            let text = std::fs::read_to_string(&p)
                .map_err(|e| Error::new(e.to_string()).in_file(&p.display().to_string()))?;
            files.push((top.to_string(), text));
        }
        for sub in ["conventions", "settings", "migrations"] {
            if dir.join(sub).is_dir() {
                walk(&dir.join(sub), dir, &mut files)?;
            }
        }
        files.sort();
        Pack::from_files(files.iter().map(|(n, t)| (n.as_str(), t.as_str())))
    }

    /// Whether `dir` holds a pack.
    pub fn is_pack(dir: &Path) -> bool {
        dir.join("bridge-pack.toml").is_file()
    }

    /// Build a pack from its files, each `(path relative to the pack, text)`.
    pub fn from_files<'a>(
        files: impl IntoIterator<Item = (&'a str, &'a str)>,
    ) -> Result<Pack, Error> {
        let parse = |name: &str, text: &str| -> Result<toml::Table, Error> {
            toml::from_str(text).map_err(|e| Error::toml(&e, text).in_file(name))
        };
        let mut manifest = toml::Table::new();
        let mut functions_doc = toml::Table::new();
        let mut migration = Migration3::default();
        let mut defs: Vec<(String, toml::Table)> = Vec::new();
        let mut settings: Vec<(String, toml::Table)> = Vec::new();
        for (name, text) in files {
            if name == "bridge-pack.toml" {
                manifest = parse(name, text)?;
            } else if name == "functions.toml" {
                functions_doc = parse(name, text)?;
            } else if name == "migrations/2-to-3.toml" {
                migration =
                    toml::from_str(text).map_err(|e| Error::toml(&e, text).in_file(name))?;
            } else if let Some(rest) = name.strip_prefix("conventions/") {
                if let Some(id) = rest.strip_suffix("/convention.toml") {
                    let t = parse(name, text)?;
                    if t.get("id").and_then(toml::Value::as_str) != Some(id) {
                        return Err(
                            Error::new(format!("id must be {id:?}, the file's path")).in_file(name)
                        );
                    }
                    defs.push((id.to_string(), t));
                }
            } else if let Some(rest) = name.strip_prefix("settings/") {
                if let Some(section) = rest.strip_suffix(".toml") {
                    if !section.contains('/') {
                        settings.push((section.to_string(), parse(name, text)?));
                    }
                }
            }
        }
        let schema = manifest
            .get("card_schema_version")
            .and_then(toml::Value::as_integer);
        if schema.is_some_and(|v| v != 3) {
            return Err(Error::new(format!(
                "card_schema_version {} is not one this reads (3)",
                schema.unwrap_or_default()
            ))
            .in_file("bridge-pack.toml"));
        }
        defs.sort_by(|a, b| a.0.cmp(&b.0));

        // Where each schema 2 path went, and the older spellings.
        let mut targets: HashMap<String, Target> = HashMap::new();
        let mut places: BTreeSet<(String, String)> = BTreeSet::new();
        for (path, id) in &migration.convention {
            targets.insert(path.clone(), Target::Switch(id.clone()));
        }
        for (path, address) in &migration.treatment {
            let (id, t) = address
                .split_once(':')
                .ok_or_else(|| Error::new(format!("{address}: not <id>:<treatment>")))?;
            targets.insert(path.clone(), Target::Treatment(id.into(), t.into()));
        }
        for p in &migration.place {
            for (path, t) in &p.switches {
                places.insert((p.convention.clone(), t.clone()));
                targets.insert(path.clone(), Target::Place(p.convention.clone(), t.clone()));
            }
        }
        for f in &migration.function {
            for (part, path) in &f.settings {
                targets.insert(
                    path.clone(),
                    Target::FunctionSetting(f.function.clone(), part.clone()),
                );
            }
        }
        for (old, address) in &migration.alias {
            let target = if let Some((id, t)) = address.split_once(':') {
                if places.contains(&(id.to_string(), t.to_string())) {
                    Target::Place(id.into(), t.into())
                } else {
                    Target::Treatment(id.into(), t.into())
                }
            } else if address.contains('/') {
                Target::Switch(address.clone())
            } else if let Some((f, part)) = address.split_once('.') {
                Target::FunctionSetting(f.into(), part.into())
            } else {
                continue;
            };
            targets.insert(old.clone(), target);
        }
        let mut aliases: HashMap<String, Vec<String>> = HashMap::new();
        for (old, target) in &targets {
            let address = match target {
                Target::Switch(id) => id.clone(),
                Target::Treatment(id, t) | Target::Place(id, t) => format!("{id}:{t}"),
                Target::FunctionSetting(..) => continue,
            };
            aliases.entry(address).or_default().push(old.clone());
        }
        for v in aliases.values_mut() {
            v.sort();
        }

        let mut fields: Vec<FieldDef> = Vec::new();
        let mut implementers: BTreeMap<String, Vec<(String, Vec<String>)>> = BTreeMap::new();
        for (id, def) in &defs {
            let name = def
                .get("name")
                .and_then(toml::Value::as_str)
                .ok_or_else(|| Error::new(format!("{id}: name is required")))?;
            let label = def
                .get("label")
                .and_then(toml::Value::as_str)
                .unwrap_or(name);
            let level = def
                .get("level")
                .and_then(toml::Value::as_integer)
                .map(|l| l as u8);
            let mut skill = vec![id.clone()];
            skill.extend(strings(def.get("taught_under")));
            for f in strings(def.get("implements")) {
                let (function, part) = match f.split_once('.') {
                    Some((a, b)) => (a.to_string(), vec![b.to_string()]),
                    None => (f.clone(), Vec::new()),
                };
                let list = implementers.entry(function).or_default();
                match list.iter_mut().find(|(i, _)| i == id) {
                    Some((_, parts)) => parts.extend(part),
                    None => list.push((id.clone(), part)),
                }
            }
            let has_treatments = def.get("treatments").is_some_and(|t| t.is_table());
            // A skill with no contexts and no treatments is still a yes/no
            // field: a card may list any ID.
            fields.push(FieldDef {
                path: id.clone(),
                kind: FieldKind::Bool,
                label: label.to_string(),
                options: Vec::new(),
                min: None,
                max: None,
                many: false,
                default: None,
                aliases: aliases.remove(id).unwrap_or_default(),
                desc: def
                    .get("desc")
                    .and_then(toml::Value::as_str)
                    .map(str::to_string),
                note: false,
                value_aliases: BTreeMap::new(),
                skill: skill.clone(),
                level,
                choice: None,
                plays: BTreeMap::new(),
                bid: false,
                convention: None,
                derived: None,
            });
            if !has_treatments {
                continue;
            }
            let Some(toml::Value::Table(treatments)) = def.get("treatments") else {
                continue;
            };
            for (t, attrs) in treatments {
                let address = format!("{id}:{t}");
                let mut attrs = attrs
                    .as_table()
                    .cloned()
                    .ok_or_else(|| Error::new(format!("{address}: not a table")))?;
                let own = match attrs.remove("skill") {
                    Some(toml::Value::Boolean(false)) => Vec::new(),
                    Some(v) => strings(Some(&v)),
                    None => {
                        let mut s = vec![id.clone()];
                        s.extend(strings(attrs.get("taught_under")));
                        s
                    }
                };
                attrs.remove("taught_under");
                let mut field: FieldDef = toml::Value::Table(attrs)
                    .try_into()
                    .map_err(|e| Error::new(format!("{address}: {e}")))?;
                field.path = address.clone();
                field.skill = own;
                field.convention = Some(id.clone());
                field.aliases = aliases.remove(&address).unwrap_or_default();
                fields.push(field);
            }
        }
        for (section, table) in &settings {
            for (key, def) in table {
                let path = format!("{section}.{key}");
                let mut field: FieldDef = def
                    .clone()
                    .try_into()
                    .map_err(|e| Error::new(format!("{path}: {e}")))?;
                field.path = path;
                fields.push(field);
            }
        }

        let mut functions = Vec::new();
        let mut option_words = HashMap::new();
        for (fname, doc) in &functions_doc {
            let Some(doc) = doc.as_table() else { continue };
            let f = Function {
                name: fname.clone(),
                label: doc
                    .get("name")
                    .and_then(toml::Value::as_str)
                    .unwrap_or(fname)
                    .to_string(),
                parts: strings(doc.get("parts")),
                implementers: implementers.remove(fname).unwrap_or_default(),
                option: doc
                    .get("option")
                    .and_then(toml::Value::as_table)
                    .map(|t| {
                        t.iter()
                            .filter_map(|(k, v)| Some((k.clone(), v.as_str()?.to_string())))
                            .collect()
                    })
                    .unwrap_or_default(),
            };
            let parts: Vec<String> = if f.parts.is_empty() {
                vec![String::new()]
            } else {
                f.parts.clone()
            };
            for part in &parts {
                let address = if part.is_empty() {
                    fname.clone()
                } else {
                    format!("{fname}.{part}")
                };
                fields.push(FieldDef {
                    path: address.clone(),
                    kind: FieldKind::Text,
                    label: f.label.clone(),
                    options: Vec::new(),
                    min: None,
                    max: None,
                    many: false,
                    default: None,
                    aliases: Vec::new(),
                    desc: None,
                    note: false,
                    value_aliases: BTreeMap::new(),
                    skill: Vec::new(),
                    level: None,
                    choice: None,
                    plays: BTreeMap::new(),
                    bid: false,
                    convention: None,
                    derived: Some(Derived::FunctionId {
                        function: fname.clone(),
                        part: part.clone(),
                    }),
                });
                // The schema 2 setting that chose the convention, read only.
                let Some(was) = doc
                    .get("was")
                    .and_then(|w| w.get(part))
                    .and_then(toml::Value::as_table)
                else {
                    continue;
                };
                let Some(setting) = was.get("setting").and_then(toml::Value::as_str) else {
                    continue;
                };
                let options = strings(was.get("options"));
                let mut words: HashMap<String, String> =
                    options.iter().map(|o| (fold(o), o.clone())).collect();
                let mut value_aliases = BTreeMap::new();
                if let Some(va) = was.get("value_aliases").and_then(toml::Value::as_table) {
                    for (k, v) in va {
                        if let Some(v) = v.as_str() {
                            words.insert(fold(k), v.to_string());
                            value_aliases.insert(k.clone(), v.to_string());
                        }
                    }
                }
                option_words.insert((fname.clone(), part.clone()), words);
                let old: Vec<String> = targets
                    .iter()
                    .filter(|(p, t)| {
                        p.as_str() != setting
                            && **t == Target::FunctionSetting(fname.clone(), part.clone())
                    })
                    .map(|(p, _)| p.clone())
                    .collect();
                fields.push(FieldDef {
                    path: setting.to_string(),
                    kind: FieldKind::Enum,
                    label: was
                        .get("label")
                        .and_then(toml::Value::as_str)
                        .unwrap_or(setting)
                        .to_string(),
                    options,
                    min: None,
                    max: None,
                    many: false,
                    default: None,
                    aliases: old,
                    desc: None,
                    note: false,
                    value_aliases,
                    skill: Vec::new(),
                    level: None,
                    choice: None,
                    plays: BTreeMap::new(),
                    bid: false,
                    convention: None,
                    derived: Some(Derived::FunctionOption {
                        function: fname.clone(),
                        part: part.clone(),
                    }),
                });
            }
            functions.push(f);
        }

        Ok(Pack {
            name: manifest
                .get("name")
                .and_then(toml::Value::as_str)
                .unwrap_or_default()
                .to_string(),
            registry: Registry::from_fields(fields)?,
            functions,
            migration,
            targets,
            option_words,
        })
    }

    /// The fields, by address.
    pub fn registry(&self) -> &Registry {
        &self.registry
    }

    /// For a treatment that says where its convention is played
    /// (`competitive_bidding/lebensohl:after_weak_two_double`): the
    /// convention, and the addresses of all its places.
    pub fn place_of(&self, address: &str) -> Option<(String, Vec<String>)> {
        let (id, t) = address.split_once(':')?;
        let p = self
            .migration
            .place
            .iter()
            .find(|p| p.convention == id && p.switches.values().any(|x| x == t))?;
        Some((
            id.to_string(),
            p.switches.values().map(|x| format!("{id}:{x}")).collect(),
        ))
    }

    pub fn function(&self, name: &str) -> Option<&Function> {
        self.functions.iter().find(|f| f.name == name)
    }

    /// Upgrade schema 2 `card_data` to schema 3, by `migrations/2-to-3.toml`
    /// (whose header says what each table does). `unset` decides what a
    /// switch the card never set becomes when the card holds treatments of
    /// its convention.
    pub fn upgrade_to_3(&self, top: &mut Map<String, Json>, unset: &Unset) {
        let old = std::mem::take(top);
        let mut settings = Json::Object(Map::new());
        let mut entries: BTreeMap<String, Entry> = BTreeMap::new();
        let mut chosen: BTreeMap<(String, String), String> = BTreeMap::new();
        let mut leaves = Vec::new();
        let mut ignored = Vec::new();
        for (key, value) in old {
            match key.as_str() {
                "schema_version" => {}
                "format" | "metadata" | "bba_passthrough" => {
                    top.insert(key, value);
                }
                "other_agreements" => {
                    let mut rest = Vec::new();
                    for a in value.as_array().cloned().unwrap_or_default() {
                        let id = a.get("id").and_then(Json::as_str).map(str::to_string);
                        match (id, a.as_object()) {
                            (Some(id), Some(obj)) => {
                                let e = entries.entry(id).or_default();
                                e.listed = true;
                                for (k, v) in obj {
                                    if k != "id" {
                                        e.extra.insert(k.clone(), v.clone());
                                    }
                                }
                            }
                            _ => rest.push(a),
                        }
                    }
                    if !rest.is_empty() {
                        top.insert(key, Json::Array(rest));
                    }
                }
                k if k.starts_with('_') || k == "conventions_list" => {
                    top.insert(key, value);
                }
                _ => crate::card::flatten(&key, value, &mut leaves, &mut ignored),
            }
        }
        for (path, value) in leaves {
            match self.targets.get(&path) {
                _ if value.is_null() => crate::card::write_path(&mut settings, &path, value),
                Some(Target::Switch(id)) => {
                    let e = entries.entry(id.clone()).or_default();
                    if e.play.is_none() {
                        e.play = value.as_bool();
                    }
                }
                Some(Target::Treatment(id, t)) => {
                    let e = entries.entry(id.clone()).or_default();
                    if !e.treatments.contains_key(t) {
                        e.treatments.insert(t.clone(), value);
                    }
                }
                Some(Target::Place(id, t)) => {
                    let e = entries.entry(id.clone()).or_default();
                    if let Some(b) = value.as_bool() {
                        e.places.entry(t.clone()).or_insert(b);
                    }
                }
                Some(Target::FunctionSetting(f, part)) => {
                    if let Some(word) = value.as_str() {
                        let word = self
                            .option_words
                            .get(&(f.clone(), part.clone()))
                            .and_then(|w| w.get(&fold(word)))
                            .cloned()
                            .unwrap_or_else(|| word.to_string());
                        chosen.entry((f.clone(), part.clone())).or_insert(word);
                    }
                }
                None => crate::card::write_path(&mut settings, &path, value),
            }
        }

        // A setting's value becomes its convention's entry.
        for m in &self.migration.function {
            let all_parts: Vec<String> = self
                .function(&m.function)
                .map(|f| f.parts.clone())
                .unwrap_or_default();
            let mut fills: BTreeMap<String, Vec<String>> = BTreeMap::new();
            for part in m.settings.keys() {
                if let Some(id) = chosen
                    .get(&(m.function.clone(), part.clone()))
                    .and_then(|w| m.options.get(w))
                {
                    fills.entry(id.clone()).or_default().push(part.clone());
                }
            }
            for (switch, part) in &m.unless_chosen {
                let Some(id) = self.migration.convention.get(switch) else {
                    continue;
                };
                let on = entries.get(id).and_then(|e| e.play) == Some(true);
                let word = chosen.get(&(m.function.clone(), part.clone()));
                let free = word.is_none_or(|w| w == "other");
                if on && free {
                    fills.entry(id.clone()).or_default().push(part.clone());
                } else if on && !fills.contains_key(id) {
                    // Another defence, or `natural`, was chosen: in schema 2
                    // the switch then did nothing.
                    entries.remove(id);
                }
            }
            for (id, mut parts) in fills {
                parts.sort();
                parts.dedup();
                let e = entries.entry(id).or_default();
                e.play = Some(true);
                if !all_parts.is_empty() && all_parts.iter().any(|p| !parts.contains(p)) {
                    e.extra.insert(
                        "for".into(),
                        Json::Array(
                            parts
                                .iter()
                                .map(|p| Json::String(format!("{}.{p}", m.function)))
                                .collect(),
                        ),
                    );
                }
            }
        }

        let mut conventions = Map::new();
        for (id, e) in entries {
            let filled = e.treatments.values().any(is_filled);
            let mut out = Map::new();
            let play = if e.places.is_empty() {
                match (e.play, unset) {
                    (Some(p), _) => Some(p),
                    (None, _) if e.listed => Some(true),
                    (None, Unset::Played) if filled => Some(true),
                    (None, Unset::Played) => None,
                    // As schema 2 read it: the bidder's default for the
                    // switch, with every treatment kept.
                    (None, Unset::AsRead { default_on }) if !e.treatments.is_empty() => {
                        Some(default_on.contains(&id))
                    }
                    (None, Unset::AsRead { .. }) => None,
                }
            } else if e.places.values().any(|on| *on) {
                Some(true)
            } else if e.places.values().any(|on| !*on) || filled {
                Some(false)
            } else {
                None
            };
            let Some(play) = play else { continue };
            if !play {
                out.insert("play".into(), Json::Bool(false));
            }
            if !e.places.is_empty() {
                // Every place is written, so none falls back on a default.
                for p in &self.migration.place {
                    if p.convention == id {
                        for t in p.switches.values() {
                            let on = e.places.get(t).copied().unwrap_or(false);
                            out.insert(t.clone(), Json::Bool(on));
                        }
                    }
                }
            }
            for (t, v) in e.treatments {
                out.insert(t, v);
            }
            for (k, v) in e.extra {
                out.insert(k, v);
            }
            conventions.insert(id, Json::Object(out));
        }
        top.insert("schema_version".into(), Json::from(CARD_SCHEMA_VERSION));
        top.insert("conventions".into(), Json::Object(conventions));
        top.insert("settings".into(), settings);
    }
}

/// What an unset switch becomes when the card holds its treatments.
#[derive(Debug, Clone, Default)]
pub enum Unset {
    /// An entry, played, when a treatment is on or filled in; otherwise no
    /// entry (Rick Wilson, 2026-11-13). The rule for real cards.
    #[default]
    Played,
    /// For checking a reader against schema 2: the entry is written with
    /// every treatment, and `play` as that reader assumes when the card is
    /// silent (`default_on` lists the IDs it assumes on).
    AsRead { default_on: BTreeSet<String> },
}

impl Unset {
    /// From `BRIDGE_CARD_UNSET_AS_READ`: unset is [`Unset::Played`]; set, it
    /// is the comma-separated IDs a reader assumes on.
    pub fn from_env() -> Unset {
        match std::env::var("BRIDGE_CARD_UNSET_AS_READ") {
            Ok(v) => Unset::AsRead {
                default_on: v
                    .split(',')
                    .map(str::trim)
                    .filter(|s| !s.is_empty())
                    .map(str::to_string)
                    .collect(),
            },
            Err(_) => Unset::Played,
        }
    }
}

#[derive(Debug, Default)]
struct Entry {
    play: Option<bool>,
    treatments: Map<String, Json>,
    places: BTreeMap<String, bool>,
    extra: Map<String, Json>,
    /// Came from `other_agreements`: the card lists it, so it plays it.
    listed: bool,
}

/// A treatment that is on or filled in.
fn is_filled(v: &Json) -> bool {
    match v {
        Json::Bool(b) => *b,
        Json::String(s) => !s.trim().is_empty(),
        Json::Array(a) => !a.is_empty(),
        Json::Null => false,
        _ => true,
    }
}

/// The value a derived field has on a card, given which conventions it
/// plays (`on`) and the parts each entry is limited to (`limited`).
pub(crate) fn derive(
    pack: &Pack,
    derived: &Derived,
    on: &dyn Fn(&str) -> bool,
    limited: &dyn Fn(&str) -> Option<Vec<String>>,
) -> Option<Value> {
    let (function, part, as_option) = match derived {
        Derived::FunctionId { function, part } => (function, part, false),
        Derived::FunctionOption { function, part } => (function, part, true),
    };
    let f = pack.function(function)?;
    let address = if part.is_empty() {
        function.clone()
    } else {
        format!("{function}.{part}")
    };
    let mut playing = f.implementers.iter().filter(|(id, parts)| {
        (parts.is_empty() || part.is_empty() || parts.contains(part))
            && on(id)
            && limited(id).is_none_or(|l| l.contains(&address) || l.contains(function))
    });
    let (id, _) = playing.next()?;
    if playing.next().is_some() {
        return None; // a conflict: nothing fills the part
    }
    if as_option {
        let word = f.option.iter().find(|(_, v)| *v == id)?.0;
        Some(Value::Text(word.clone()))
    } else {
        Some(Value::Text(id.clone()))
    }
}
