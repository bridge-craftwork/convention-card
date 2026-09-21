//! Import and export of BBA `.bbsa` convention files.
//!
//! A `.bbsa` file is a list of `Key = value` lines: a `System type` integer
//! and on/off toggles, padded with `Not defined` lines. The mapping to card
//! fields lives in `data/bbsa-map.toml`; keys it does not cover are kept on
//! the card in [`Card::bba_passthrough`] so that export reproduces them.

use std::collections::HashMap;
use std::sync::OnceLock;

use crate::registry::{registry, Value};
use crate::{Card, Error};

const MAP_TOML: &str = include_str!("../data/bbsa-map.toml");
const LAYOUT: &str = include_str!("../data/bbsa-layout.txt");
const PADDING: &str = "Not defined";

/// How one `.bbsa` key maps onto the card.
#[derive(Debug, Clone, PartialEq)]
pub enum Mapping {
    /// On/off toggle for a bool field.
    Toggle(String),
    /// One member of a one-of group: when on, set these values.
    Set(Vec<(String, Value)>),
    /// Integer selecting an enum value by position.
    Index { path: String, values: Vec<String> },
}

struct Map {
    keys: HashMap<String, Mapping>,
    implied: Vec<(String, Value)>,
}

fn map() -> &'static Map {
    static MAP: OnceLock<Map> = OnceLock::new();
    MAP.get_or_init(|| parse_mapping(MAP_TOML).expect("data/bbsa-map.toml is invalid"))
}

/// The built-in mapping from `data/bbsa-map.toml`, by `.bbsa` key.
pub fn mapping() -> &'static HashMap<String, Mapping> {
    &map().keys
}

/// Settings every imported card gets: conventions BBA always plays, which
/// have no `.bbsa` key.
pub fn implied() -> &'static [(String, Value)] {
    &map().implied
}

fn parse_mapping(text: &str) -> Result<Map, Error> {
    let mut table: toml::Table = text
        .parse()
        .map_err(|e| Error::new(format!("bbsa-map.toml: {e}")))?;
    let mut implied = Vec::new();
    if let Some(toml::Value::Table(t)) = table.remove("implied") {
        for (path, v) in t {
            let v = Value::from_toml(&v)
                .ok_or_else(|| Error::new(format!("[implied] {path}: unsupported value")))?;
            validate(&path, &Mapping::Set(vec![(path.clone(), v.clone())]))?;
            implied.push((path, v));
        }
    }
    let mut out = HashMap::new();
    for (key, spec) in table {
        let bad = |msg: &str| Error::new(format!("bbsa-map.toml, {key:?}: {msg}"));
        let mapping = match &spec {
            toml::Value::String(path) => Mapping::Toggle(path.clone()),
            toml::Value::Table(t) if t.contains_key("set") => {
                let set = t["set"]
                    .as_table()
                    .ok_or_else(|| bad("`set` must be a table"))?;
                let mut pairs = Vec::new();
                for (path, v) in set {
                    let v = Value::from_toml(v).ok_or_else(|| bad("unsupported value"))?;
                    pairs.push((path.clone(), v));
                }
                Mapping::Set(pairs)
            }
            toml::Value::Table(t) if t.contains_key("index") => {
                let path = t["index"]
                    .as_str()
                    .ok_or_else(|| bad("`index` must be a path"))?;
                let values = t
                    .get("values")
                    .and_then(|v| v.as_array())
                    .ok_or_else(|| bad("`values` must be a list"))?
                    .iter()
                    .map(|v| {
                        v.as_str()
                            .map(str::to_string)
                            .ok_or_else(|| bad("values must be strings"))
                    })
                    .collect::<Result<_, _>>()?;
                Mapping::Index {
                    path: path.to_string(),
                    values,
                }
            }
            _ => return Err(bad("expected a path, {set = ...} or {index = ...}")),
        };
        validate(&key, &mapping)?;
        out.insert(key, mapping);
    }
    Ok(Map { keys: out, implied })
}

/// Every mapped path must exist and every value must fit its field.
fn validate(key: &str, mapping: &Mapping) -> Result<(), Error> {
    let check = |path: &str, v: Value| {
        let field = registry()
            .get(path)
            .ok_or_else(|| Error::new(format!("bbsa-map.toml, {key:?}: unknown field {path}")))?;
        field
            .normalize(v)
            .map(|_| ())
            .map_err(|e| Error::new(format!("bbsa-map.toml, {key:?}: {path}: {e}")))
    };
    match mapping {
        Mapping::Toggle(path) => check(path, Value::Bool(true)),
        Mapping::Set(pairs) => pairs.iter().try_for_each(|(p, v)| check(p, v.clone())),
        Mapping::Index { path, values } => values
            .iter()
            .try_for_each(|v| check(path, Value::Text(v.clone()))),
    }
}

/// Parse `.bbsa` text into `(key, value)` pairs, in file order.
pub fn parse(text: &str) -> Result<Vec<(String, i64)>, Error> {
    let mut entries = Vec::new();
    for (n, line) in text.lines().enumerate() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let (key, value) = line
            .rsplit_once('=')
            .ok_or_else(|| Error::new(format!("line {}: expected `Key = value`", n + 1)))?;
        let value = value.trim().parse().map_err(|_| {
            Error::new(format!(
                "line {}: {:?} is not an integer",
                n + 1,
                value.trim()
            ))
        })?;
        entries.push((key.trim().to_string(), value));
    }
    Ok(entries)
}

/// What an import did.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct ImportReport {
    /// Keys applied to card fields.
    pub mapped: usize,
    /// Keys with no card field, kept in `bba_passthrough`, with their values.
    pub passthrough: Vec<(String, i64)>,
    /// Problems (unexpected values, conflicting one-of keys).
    pub warnings: Vec<String>,
}

/// Convert `.bbsa` text to a card.
pub fn import(text: &str, name: Option<&str>) -> Result<(Card, ImportReport), Error> {
    let mut card = Card::new();
    card.metadata.name = name.map(str::to_string);
    for (path, v) in implied() {
        card.set(path, v.clone())?;
    }
    let mut report = ImportReport::default();
    for (key, value) in parse(text)? {
        if key == PADDING {
            continue;
        }
        let Some(mapping) = mapping().get(&key) else {
            report.passthrough.push((key.clone(), value));
            card.bba_passthrough.insert(key, value);
            continue;
        };
        report.mapped += 1;
        match mapping {
            Mapping::Toggle(path) => {
                if value != 0 && value != 1 {
                    report
                        .warnings
                        .push(format!("{key} = {value}: expected 0 or 1"));
                }
                card.set(path, Value::Bool(value != 0))?;
            }
            Mapping::Set(pairs) => {
                if value == 0 {
                    continue;
                }
                for (path, v) in pairs {
                    if let Some(old) = card.get(path).filter(|old| *old != v) {
                        report
                            .warnings
                            .push(format!("{key} overrides {path} = {old}"));
                    }
                    card.set(path, v.clone())?;
                }
            }
            Mapping::Index { path, values } => {
                match usize::try_from(value).ok().and_then(|i| values.get(i)) {
                    Some(v) => card.set(path, Value::Text(v.clone()))?,
                    None => report
                        .warnings
                        .push(format!("{key} = {value}: no such option")),
                }
            }
        }
    }
    Ok((card, report))
}

/// What an export did.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct ExportReport {
    /// Passthrough keys that are not in the current `.bbsa` layout (older
    /// files) and so were not written.
    pub dropped: Vec<String>,
}

/// Convert a card to `.bbsa` text in BBA's current 258-line layout (CRLF).
pub fn export(card: &Card) -> (String, ExportReport) {
    let mut report = ExportReport::default();
    let layout: Vec<&str> = LAYOUT.lines().collect();
    let mut out = String::new();
    for key in &layout {
        let value = if *key == PADDING {
            0
        } else if let Some(mapping) = mapping().get(*key) {
            export_value(card, mapping)
        } else {
            card.bba_passthrough.get(*key).copied().unwrap_or(0)
        };
        out.push_str(&format!("{key} = {value}\r\n"));
    }
    for key in card.bba_passthrough.keys() {
        if !layout.contains(&key.as_str()) {
            report.dropped.push(key.clone());
        }
    }
    (out, report)
}

fn export_value(card: &Card, mapping: &Mapping) -> i64 {
    match mapping {
        Mapping::Toggle(path) => card.is_on(path) as i64,
        Mapping::Set(pairs) => pairs.iter().all(|(p, v)| card.get(p) == Some(v)) as i64,
        Mapping::Index { path, values } => match card.effective(path) {
            Some(Value::Text(v)) => values.iter().position(|o| o == v).unwrap_or(0) as i64,
            _ => 0,
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builtin_mapping_is_valid() {
        assert!(mapping().len() > 130);
    }

    #[test]
    fn layout_keys_are_mapped_or_passed_through() {
        // Every layout key is either mapped or padding; the rest round-trip
        // through passthrough. This guards against typos in the map file.
        let layout: Vec<&str> = LAYOUT.lines().collect();
        for key in mapping().keys() {
            assert!(
                layout.contains(&key.as_str()),
                "mapped key {key:?} is not in the layout"
            );
        }
    }

    #[test]
    fn one_of_group_sets_range() {
        let (card, _) = import("1NT opening range 12-14 = 1\r\n", None).unwrap();
        assert_eq!(card.get("notrump.one_nt.range_min"), Some(&Value::Int(12)));
        assert_eq!(card.get("notrump.one_nt.range_max"), Some(&Value::Int(14)));
    }
}
