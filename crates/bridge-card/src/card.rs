//! A convention card: metadata plus `path = value` settings.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value as Json};

use crate::registry::{registry, Value};
use crate::Error;

pub(crate) const SCHEMA_VERSION: &str = "1.0";
const FORMAT: &str = "bridge_classroom";

/// Leaves the editor stores for its own use; kept, but not reported.
const EDITOR_METADATA_LEAVES: &[&str] = &["skill_path"];
const EDITOR_METADATA_TOP: &[&str] = &["conventions_list"];

/// Card name and description.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct CardMetadata {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tags: Vec<String>,
    /// Anything else the editor stores in `metadata`.
    #[serde(flatten)]
    pub other: Map<String, Json>,
}

/// A convention card.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct Card {
    pub metadata: CardMetadata,
    /// Settings, by canonical path.
    values: BTreeMap<String, Value>,
    /// `.bbsa` keys with no card field yet, kept so export is lossless.
    pub bba_passthrough: BTreeMap<String, i64>,
    /// Leaves not in the registry, kept so a load/save round trip loses
    /// nothing the editor wrote.
    extra: BTreeMap<String, Json>,
}

/// What happened while loading a card.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct LoadReport {
    /// `(old path, canonical path)` for each alias that was used.
    pub aliased: Vec<(String, String)>,
    /// Paths not in the registry (kept on the card as-is).
    pub unknown: Vec<String>,
    /// `(path, problem)` for values the registry rejected (kept as-is).
    pub invalid: Vec<(String, String)>,
}

impl LoadReport {
    pub fn is_clean(&self) -> bool {
        self.unknown.is_empty() && self.invalid.is_empty()
    }
}

impl Card {
    pub fn new() -> Card {
        Card::default()
    }

    /// The stored value at `path` (canonical or alias), if set.
    pub fn get(&self, path: &str) -> Option<&Value> {
        let field = registry().get(path)?;
        self.values.get(&field.path)
    }

    /// The stored value, or the registry default when unset.
    pub fn effective(&self, path: &str) -> Option<&Value> {
        let field = registry().get(path)?;
        self.values.get(&field.path).or(field.default.as_ref())
    }

    /// True when `path` is a bool field whose effective value is true.
    pub fn is_on(&self, path: &str) -> bool {
        matches!(self.effective(path), Some(Value::Bool(true)))
    }

    /// Set a value, checking it against the registry.
    pub fn set(&mut self, path: &str, value: Value) -> Result<(), Error> {
        let field = registry()
            .get(path)
            .ok_or_else(|| Error::new(format!("unknown card field {path}")))?;
        let value = field.normalize(value).map_err(|e| Error::new(format!("{path}: {e}")))?;
        self.values.insert(field.path.clone(), value);
        Ok(())
    }

    pub fn unset(&mut self, path: &str) {
        if let Some(field) = registry().get(path) {
            self.values.remove(&field.path);
        }
    }

    /// All set values, by canonical path.
    pub fn values(&self) -> impl Iterator<Item = (&str, &Value)> {
        self.values.iter().map(|(k, v)| (k.as_str(), v))
    }

    /// Load a card from Bridge-Classroom's nested `card_data` JSON.
    pub fn from_json(text: &str) -> Result<(Card, LoadReport), Error> {
        let json: Json = serde_json::from_str(text).map_err(|e| Error::new(e.to_string()))?;
        let Json::Object(top) = json else {
            return Err(Error::new("card JSON must be an object"));
        };
        let mut card = Card::new();
        let mut report = LoadReport::default();
        let mut leaves = Vec::new();
        for (key, value) in top {
            match key.as_str() {
                "schema_version" | "format" => {}
                "metadata" => {
                    card.metadata = serde_json::from_value(value)
                        .map_err(|e| Error::new(format!("metadata: {e}")))?;
                }
                "bba_passthrough" => {
                    card.bba_passthrough = serde_json::from_value(value)
                        .map_err(|e| Error::new(format!("bba_passthrough: {e}")))?;
                }
                k if EDITOR_METADATA_TOP.contains(&k) => {
                    card.extra.insert(key, value);
                }
                _ => flatten(&key, value, &mut leaves),
            }
        }
        for (path, value) in leaves {
            let last = path.rsplit('.').next().unwrap_or_default();
            if EDITOR_METADATA_LEAVES.contains(&last) || value.is_null() {
                card.extra.insert(path, value);
                continue;
            }
            let Some(field) = registry().get(&path) else {
                report.unknown.push(path.clone());
                card.extra.insert(path, value);
                continue;
            };
            let checked = Value::from_json(&value)
                .ok_or_else(|| format!("unsupported JSON value {value}"))
                .and_then(|v| field.normalize(v));
            match checked {
                Ok(v) => {
                    if field.path != path {
                        report.aliased.push((path, field.path.clone()));
                    }
                    card.values.insert(field.path.clone(), v);
                }
                Err(problem) => {
                    report.invalid.push((path.clone(), problem));
                    card.extra.insert(path, value);
                }
            }
        }
        Ok((card, report))
    }

    /// Write the card as nested `card_data` JSON.
    pub fn to_json(&self) -> Json {
        let mut top = Map::new();
        top.insert("schema_version".into(), SCHEMA_VERSION.into());
        top.insert("format".into(), FORMAT.into());
        top.insert(
            "metadata".into(),
            serde_json::to_value(&self.metadata).expect("metadata serializes"),
        );
        let mut root = Json::Object(top);
        for (path, value) in &self.extra {
            write_path(&mut root, path, value.clone());
        }
        for (path, value) in &self.values {
            write_path(&mut root, path, value.to_json());
        }
        if !self.bba_passthrough.is_empty() {
            root["bba_passthrough"] =
                serde_json::to_value(&self.bba_passthrough).expect("map serializes");
        }
        root
    }

    pub fn to_json_string(&self) -> String {
        serde_json::to_string_pretty(&self.to_json()).expect("card serializes")
    }
}

/// Collect `(dotted path, leaf)` pairs; objects are walked, everything else
/// (including arrays) is a leaf.
fn flatten(prefix: &str, value: Json, out: &mut Vec<(String, Json)>) {
    match value {
        Json::Object(map) => {
            for (k, v) in map {
                flatten(&format!("{prefix}.{k}"), v, out);
            }
        }
        leaf => out.push((prefix.to_string(), leaf)),
    }
}

fn write_path(root: &mut Json, path: &str, value: Json) {
    let mut cur = root;
    let mut parts = path.split('.').peekable();
    while let Some(part) = parts.next() {
        if !cur.is_object() {
            *cur = Json::Object(Map::new());
        }
        let map = cur.as_object_mut().expect("just made an object");
        if parts.peek().is_none() {
            map.insert(part.to_string(), value);
            return;
        }
        cur = map.entry(part).or_insert_with(|| Json::Object(Map::new()));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn set_validates_and_resolves_aliases() {
        let mut card = Card::new();
        card.set("other_conventions.blackwood.rkcb_1430", Value::Bool(true)).unwrap();
        assert!(card.is_on("slam.blackwood.rkcb_1430"));
        assert!(card.set("notrump.one_nt.range_min", Value::Text("x".into())).is_err());
        assert!(card.set("no.such.field", Value::Bool(true)).is_err());
    }

    #[test]
    fn effective_falls_back_to_default() {
        let card = Card::new();
        assert_eq!(card.get("notrump.one_nt.range_max"), None);
        assert_eq!(card.effective("notrump.one_nt.range_max"), Some(&Value::Int(17)));
    }

    #[test]
    fn json_round_trip_keeps_unknown_leaves() {
        let text = r#"{"notrump": {"stayman": {"play": true, "mystery": 3}},
                       "metadata": {"name": "Test"}}"#;
        let (card, report) = Card::from_json(text).unwrap();
        assert_eq!(report.unknown, vec!["notrump.stayman.mystery".to_string()]);
        let (again, _) = Card::from_json(&card.to_json_string()).unwrap();
        assert_eq!(card, again);
    }
}
