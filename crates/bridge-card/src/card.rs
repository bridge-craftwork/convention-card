//! A convention card: metadata plus `path = value` settings.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value as Json};

use crate::registry::Value;
use crate::{Error, Vocabulary};

pub(crate) const SCHEMA_VERSION: &str = "1.0";
const FORMAT: &str = "bridge_classroom";

/// The `schema` of Bridge-Classroom's card export: `{schema, name,
/// description, exportedAt, card_data}`, with the card in `card_data`.
pub const EXPORT_SCHEMA: &str = "bridge-classroom/card_data@v1";
const EXPORT_SCHEMA_FAMILY: &str = "bridge-classroom/card_data@";

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

/// A convention card, in the vocabulary it was made with: every read and
/// write resolves paths, aliases and defaults in that vocabulary.
#[derive(Debug, Clone, PartialEq)]
pub struct Card {
    vocab: Vocabulary,
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
    /// Keys starting with `_` (Bridge-Classroom's raw import records, such
    /// as `_bbo_raw`): not card settings. Kept as-is so a round trip loses
    /// nothing, never read, and not counted as unknown.
    pub ignored: Vec<String>,
    /// The export wrapper the card came in (its `schema`,
    /// [`EXPORT_SCHEMA`]), when it was not bare `card_data`.
    pub wrapper: Option<String>,
}

impl LoadReport {
    pub fn is_clean(&self) -> bool {
        self.unknown.is_empty() && self.invalid.is_empty()
    }
}

impl Card {
    /// An empty card in `vocab`.
    pub fn new(vocab: &Vocabulary) -> Card {
        Card {
            vocab: vocab.clone(),
            metadata: CardMetadata::default(),
            values: BTreeMap::new(),
            bba_passthrough: BTreeMap::new(),
            extra: BTreeMap::new(),
        }
    }

    /// The vocabulary this card was made with.
    pub fn vocabulary(&self) -> &Vocabulary {
        &self.vocab
    }

    /// The stored value at `path` (canonical or alias), if set.
    pub fn get(&self, path: &str) -> Option<&Value> {
        let field = self.vocab.registry().get(path)?;
        self.values.get(&field.path)
    }

    /// The stored value, or the registry default when unset.
    pub fn effective(&self, path: &str) -> Option<&Value> {
        let field = self.vocab.registry().get(path)?;
        self.values.get(&field.path).or(field.default.as_ref())
    }

    /// True when `path` is a bool field whose effective value is true.
    pub fn is_on(&self, path: &str) -> bool {
        matches!(self.effective(path), Some(Value::Bool(true)))
    }

    /// Set a value, checking it against the registry.
    pub fn set(&mut self, path: &str, value: Value) -> Result<(), Error> {
        let field = self
            .vocab
            .registry()
            .get(path)
            .ok_or_else(|| Error::new(format!("unknown card field {path}")))?;
        let value = field
            .normalize(value)
            .map_err(|e| Error::new(format!("{path}: {e}")))?;
        self.values.insert(field.path.clone(), value);
        Ok(())
    }

    /// Apply a change written `path=value` (`general.style=bba`,
    /// `notrump.stayman.play=false`): `true`/`false` are booleans, whole
    /// numbers integers, anything else text.
    pub fn apply_change(&mut self, change: &str) -> Result<(), Error> {
        let (path, value) = change
            .split_once('=')
            .ok_or_else(|| Error::new(format!("card change {change:?}: expected path=value")))?;
        let value = match value {
            "true" => Value::Bool(true),
            "false" => Value::Bool(false),
            v => v
                .parse::<i64>()
                .map(Value::Int)
                .unwrap_or_else(|_| Value::Text(v.to_string())),
        };
        self.set(path, value)
            .map_err(|e| Error::new(format!("card change {change:?}: {e}")))
    }

    pub fn unset(&mut self, path: &str) {
        if let Some(field) = self.vocab.registry().get(path) {
            self.values.remove(&field.path);
        }
    }

    /// All set values, by canonical path.
    pub fn values(&self) -> impl Iterator<Item = (&str, &Value)> {
        self.values.iter().map(|(k, v)| (k.as_str(), v))
    }

    /// What the JSON the card was loaded from held at `path` when that path
    /// is not a field of the vocabulary (an unknown leaf, kept as-is).
    pub fn unknown_value(&self, path: &str) -> Option<&Json> {
        self.extra.get(path)
    }

    /// Load a card in `vocab` from Bridge-Classroom's nested `card_data`
    /// JSON, bare or in the editor's export wrapper ([`EXPORT_SCHEMA`]:
    /// `{schema, name, description, exportedAt, card_data}`), whose `name`
    /// and `description` then become the card's. Keys starting with `_`
    /// (`_bbo_raw`, the raw record of a BBO import) are not settings: they
    /// are kept for the round trip and listed in [`LoadReport::ignored`].
    pub fn from_json(vocab: &Vocabulary, text: &str) -> Result<(Card, LoadReport), Error> {
        let json: Json = serde_json::from_str(text).map_err(|e| Error::new(e.to_string()))?;
        let Json::Object(mut top) = json else {
            return Err(Error::new("card JSON must be an object"));
        };
        let mut card = Card::new(vocab);
        let mut report = LoadReport::default();
        let mut wrapper_meta = (None, None);
        if top.get("card_data").is_some_and(Json::is_object) {
            let schema = top.get("schema").and_then(Json::as_str).unwrap_or_default();
            if !schema.is_empty() && schema != EXPORT_SCHEMA {
                return Err(Error::new(if schema.starts_with(EXPORT_SCHEMA_FAMILY) {
                    format!("{schema}: a newer Bridge-Classroom export than this reads ({EXPORT_SCHEMA})")
                } else {
                    format!(
                        "schema {schema:?}: not a Bridge-Classroom card export ({EXPORT_SCHEMA})"
                    )
                }));
            }
            report.wrapper = Some(EXPORT_SCHEMA.to_string());
            let text_of = |v: Option<&Json>| {
                v.and_then(Json::as_str)
                    .filter(|s| !s.trim().is_empty())
                    .map(str::to_string)
            };
            wrapper_meta = (text_of(top.get("name")), text_of(top.get("description")));
            let Some(Json::Object(inner)) = top.remove("card_data") else {
                unreachable!("checked above");
            };
            top = inner;
        }
        let mut leaves = Vec::new();
        for (key, value) in top {
            if key.starts_with('_') {
                report.ignored.push(key.clone());
                card.extra.insert(key, value);
                continue;
            }
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
                _ => flatten(&key, value, &mut leaves, &mut report.ignored),
            }
        }
        // The wrapper's name is the one the editor shows (its card list);
        // `metadata.name` inside may be older.
        let (name, description) = wrapper_meta;
        if name.is_some() {
            card.metadata.name = name;
        }
        if description.is_some() {
            card.metadata.description = description;
        }
        for (path, value) in leaves {
            if report.ignored.contains(&path) {
                card.extra.insert(path, value);
                continue;
            }
            let last = path.rsplit('.').next().unwrap_or_default();
            if EDITOR_METADATA_LEAVES.contains(&last) || value.is_null() {
                card.extra.insert(path, value);
                continue;
            }
            let Some(field) = vocab.registry().get(&path) else {
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

    /// Write the card in Bridge-Classroom's export wrapper
    /// ([`EXPORT_SCHEMA`]), as the editor's "Export content" writes it:
    /// `{schema, name, description, exportedAt, card_data}`. `exportedAt`
    /// (an ISO 8601 time) is written only when given.
    pub fn to_export_json(&self, exported_at: Option<&str>) -> Json {
        let mut top = Map::new();
        top.insert("schema".into(), EXPORT_SCHEMA.into());
        top.insert("name".into(), self.metadata.name.clone().into());
        top.insert(
            "description".into(),
            self.metadata.description.clone().into(),
        );
        if let Some(at) = exported_at {
            top.insert("exportedAt".into(), at.into());
        }
        top.insert("card_data".into(), self.to_json());
        Json::Object(top)
    }

    pub fn to_export_json_string(&self, exported_at: Option<&str>) -> String {
        serde_json::to_string_pretty(&self.to_export_json(exported_at)).expect("card serializes")
    }
}

/// Collect `(dotted path, leaf)` pairs; objects are walked, everything else
/// (including arrays) is a leaf. A key starting with `_` is not walked: it
/// comes out whole, and its path goes in `ignored`.
fn flatten(prefix: &str, value: Json, out: &mut Vec<(String, Json)>, ignored: &mut Vec<String>) {
    match value {
        Json::Object(map) => {
            for (k, v) in map {
                let path = format!("{prefix}.{k}");
                if k.starts_with('_') {
                    ignored.push(path.clone());
                    out.push((path, v));
                } else {
                    flatten(&path, v, out, ignored);
                }
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
        let mut card = Card::new(crate::test_vocabulary());
        card.set("other_conventions.blackwood.rkcb_1430", Value::Bool(true))
            .unwrap();
        assert!(card.is_on("slam.blackwood.rkcb_1430"));
        assert!(card
            .set("notrump.one_nt.range_min", Value::Text("x".into()))
            .is_err());
        assert!(card.set("no.such.field", Value::Bool(true)).is_err());
    }

    #[test]
    fn effective_falls_back_to_default() {
        let card = Card::new(crate::test_vocabulary());
        assert_eq!(card.get("notrump.one_nt.range_max"), None);
        assert_eq!(
            card.effective("notrump.one_nt.range_max"),
            Some(&Value::Int(17))
        );
    }

    #[test]
    fn export_wrapper_is_unwrapped_and_underscore_keys_ignored() {
        let text = r#"{"schema": "bridge-classroom/card_data@v1", "name": "Pat and Sam",
                       "description": "Imported from BBO", "exportedAt": "2026-09-28T20:04:58.311Z",
                       "card_data": {"metadata": {"name": "old name"},
                                     "_bbo_raw": {"conventions": {"1NStayman": "y"}},
                                     "notrump": {"stayman": {"play": true, "_note": {"x": 1}}}}}"#;
        let (card, report) = Card::from_json(crate::test_vocabulary(), text).unwrap();
        assert_eq!(report.wrapper.as_deref(), Some(EXPORT_SCHEMA));
        assert_eq!(report.ignored, vec!["_bbo_raw", "notrump.stayman._note"]);
        assert!(report.is_clean(), "{report:?}");
        assert!(card.is_on("notrump.stayman.play"));
        assert_eq!(card.metadata.name.as_deref(), Some("Pat and Sam"));
        assert_eq!(
            card.metadata.description.as_deref(),
            Some("Imported from BBO")
        );
        // Written back out, the raw record is still there, and the wrapper
        // reads back as the same card.
        let bare = card.to_json();
        assert_eq!(bare["_bbo_raw"]["conventions"]["1NStayman"], "y");
        assert_eq!(bare["notrump"]["stayman"]["_note"]["x"], 1);
        let wrapped = card.to_export_json_string(Some("2026-09-28T00:00:00Z"));
        let (again, report) = Card::from_json(card.vocabulary(), &wrapped).unwrap();
        assert_eq!(card, again);
        assert_eq!(report.wrapper.as_deref(), Some(EXPORT_SCHEMA));
    }

    #[test]
    fn other_export_schemas_are_refused() {
        let v2 = r#"{"schema": "bridge-classroom/card_data@v2", "card_data": {}}"#;
        let e = Card::from_json(crate::test_vocabulary(), v2).unwrap_err();
        assert!(e.message.contains("newer"), "{e}");
        let other = r#"{"schema": "something/else", "card_data": {}}"#;
        assert!(Card::from_json(crate::test_vocabulary(), other).is_err());
    }

    #[test]
    fn json_round_trip_keeps_unknown_leaves() {
        let text = r#"{"notrump": {"stayman": {"play": true, "mystery": 3}},
                       "metadata": {"name": "Test"}}"#;
        let (card, report) = Card::from_json(crate::test_vocabulary(), text).unwrap();
        assert_eq!(report.unknown, vec!["notrump.stayman.mystery".to_string()]);
        let (again, _) = Card::from_json(card.vocabulary(), &card.to_json_string()).unwrap();
        assert_eq!(card, again);
    }
}
