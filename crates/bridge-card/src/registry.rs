//! The field registry: every setting a card can hold, from the rules'
//! `card/fields.toml` (see [`crate::Vocabulary`]).

use std::collections::{BTreeMap, HashMap};
use std::fmt;

use serde::{Deserialize, Serialize};

use crate::Error;

/// The type of a card field.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum FieldKind {
    Bool,
    Int,
    Enum,
    Text,
}

/// A value stored on a card. Enum values are stored as `Text`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum Value {
    Bool(bool),
    Int(i64),
    Text(String),
}

impl fmt::Display for Value {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Value::Bool(b) => write!(f, "{b}"),
            Value::Int(i) => write!(f, "{i}"),
            Value::Text(s) => write!(f, "{s:?}"),
        }
    }
}

impl Value {
    pub(crate) fn from_json(v: &serde_json::Value) -> Option<Value> {
        match v {
            serde_json::Value::Bool(b) => Some(Value::Bool(*b)),
            serde_json::Value::Number(n) => n.as_i64().map(Value::Int),
            serde_json::Value::String(s) => Some(Value::Text(s.clone())),
            _ => None,
        }
    }

    pub(crate) fn to_json(&self) -> serde_json::Value {
        match self {
            Value::Bool(b) => (*b).into(),
            Value::Int(i) => (*i).into(),
            Value::Text(s) => s.clone().into(),
        }
    }

    pub(crate) fn from_toml(v: &toml::Value) -> Option<Value> {
        match v {
            toml::Value::Boolean(b) => Some(Value::Bool(*b)),
            toml::Value::Integer(i) => Some(Value::Int(*i)),
            toml::Value::String(s) => Some(Value::Text(s.clone())),
            _ => None,
        }
    }
}

/// One card field.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FieldDef {
    /// Full dotted path, e.g. `notrump.one_nt.range_min`.
    #[serde(skip_deserializing)]
    pub path: String,
    pub kind: FieldKind,
    pub label: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub options: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub min: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default: Option<Value>,
    /// Older paths that load into this field.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub aliases: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub desc: Option<String>,
    /// Free text written for people (a card's write-in lines: notes,
    /// descriptions), not an agreement a rule could read. `rbb card
    /// coverage` counts it with carding, leads and notes.
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub note: bool,
    /// Other spellings of an enum option, as another tool writes them
    /// (Bridge-Classroom's "Hamilton" for `cappelletti`). An enum value
    /// also matches an option or alias ignoring case, spaces and hyphens
    /// ("Multi-Landy" is `multi_landy`). Loading stores the option.
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub value_aliases: BTreeMap<String, String>,
    /// The teaching skills this field's convention is taught under
    /// (Bridge-Classroom's SkillPath, `bidding_conventions/stayman`):
    /// `skill = "..."` or a list in `fields.toml`. The first is the
    /// convention the field belongs to (ADR-0001). The known IDs are
    /// `conventions.toml` ([`crate::Skills`]).
    #[serde(
        default,
        deserialize_with = "one_or_many",
        skip_serializing_if = "Vec::is_empty"
    )]
    pub skill: Vec<String>,
    /// How hard the agreement is to learn, 1-10. An extension of a
    /// convention (Stayman's slam sequences) has a higher level than the
    /// convention's own, which is the lowest of its fields'.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub level: Option<u8>,
}

/// A string or a list of strings.
fn one_or_many<'de, D: serde::Deserializer<'de>>(d: D) -> Result<Vec<String>, D::Error> {
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum OneOrMany {
        One(String),
        Many(Vec<String>),
    }
    Ok(match OneOrMany::deserialize(d)? {
        OneOrMany::One(s) => vec![s],
        OneOrMany::Many(v) => v,
    })
}

/// An enum spelling folded for matching: lower case, with spaces and
/// hyphens as underscores.
fn fold(s: &str) -> String {
    s.trim()
        .chars()
        .map(|c| match c {
            ' ' | '-' => '_',
            c => c.to_ascii_lowercase(),
        })
        .collect()
}

impl FieldDef {
    /// Check `value` against this field, converting where the meaning is
    /// unambiguous (an integer for an enum whose options are digits, as the
    /// editor stores `min_length`).
    pub fn normalize(&self, value: Value) -> Result<Value, String> {
        match (self.kind, value) {
            (FieldKind::Bool, v @ Value::Bool(_)) => Ok(v),
            (FieldKind::Int, Value::Int(i)) => {
                if self.min.is_some_and(|m| i < m) || self.max.is_some_and(|m| i > m) {
                    Err(format!("{i} is outside {:?}..{:?}", self.min, self.max))
                } else {
                    Ok(Value::Int(i))
                }
            }
            (FieldKind::Enum, Value::Int(i)) => self.normalize(Value::Text(i.to_string())),
            (FieldKind::Enum, Value::Text(s)) => {
                if self.options.contains(&s) {
                    return Ok(Value::Text(s));
                }
                if let Some(o) = self.value_aliases.get(&s) {
                    return Ok(Value::Text(o.clone()));
                }
                let f = fold(&s);
                if let Some(o) = self.options.iter().find(|o| fold(o) == f) {
                    return Ok(Value::Text(o.clone()));
                }
                if let Some((_, o)) = self.value_aliases.iter().find(|(a, _)| fold(a) == f) {
                    return Ok(Value::Text(o.clone()));
                }
                Err(format!("{s:?} is not one of {:?}", self.options))
            }
            (FieldKind::Text, v @ Value::Text(_)) => Ok(v),
            (kind, v) => Err(format!("expected {kind:?}, found {v}")),
        }
    }
}

/// All card fields, in declaration order.
#[derive(Debug)]
pub struct Registry {
    fields: Vec<FieldDef>,
    /// Canonical paths and aliases, to an index into `fields`.
    index: HashMap<String, usize>,
}

impl Registry {
    /// Parse a registry in the `fields.toml` format.
    pub fn parse(text: &str) -> Result<Registry, Error> {
        let table: toml::Table = toml::from_str(text).map_err(|e| Error::toml(&e, text))?;
        let mut fields = Vec::new();
        let mut index = HashMap::new();
        for (section, entries) in table {
            let entries = entries
                .as_table()
                .ok_or_else(|| Error::new(format!("[{section}] is not a table")))?;
            for (key, def) in entries {
                let path = format!("{section}.{key}");
                let mut field: FieldDef = def
                    .clone()
                    .try_into()
                    .map_err(|e| Error::new(format!("{path}: {e}")))?;
                field.path = path.clone();
                if let Some(d) = field.default.take() {
                    field.default = Some(
                        field
                            .normalize(d)
                            .map_err(|e| Error::new(format!("{path} default: {e}")))?,
                    );
                }
                if field.kind == FieldKind::Enum && field.options.is_empty() {
                    return Err(Error::new(format!("{path}: enum without options")));
                }
                for (alias, option) in &field.value_aliases {
                    if field.kind != FieldKind::Enum || !field.options.contains(option) {
                        return Err(Error::new(format!(
                            "{path}: value alias {alias:?} names {option:?}, which is not an option"
                        )));
                    }
                }
                for skill in &field.skill {
                    if !crate::skills::is_skill_path(skill) {
                        return Err(Error::new(format!(
                            "{path}: skill {skill:?} is not a skill path (category/name, lower case)"
                        )));
                    }
                }
                if field.level.is_some_and(|l| !(1..=10).contains(&l)) {
                    return Err(Error::new(format!("{path}: level must be 1 to 10")));
                }
                for name in std::iter::once(&path).chain(&field.aliases) {
                    if index.insert(name.clone(), fields.len()).is_some() {
                        return Err(Error::new(format!("{name} is declared twice")));
                    }
                }
                fields.push(field);
            }
        }
        Ok(Registry { fields, index })
    }

    /// Look up a field by canonical path or alias.
    pub fn get(&self, path: &str) -> Option<&FieldDef> {
        self.index.get(path).map(|&i| &self.fields[i])
    }

    /// All fields, in declaration order.
    pub fn fields(&self) -> &[FieldDef] {
        &self.fields
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn registry() -> &'static Registry {
        crate::test_vocabulary().registry()
    }

    #[test]
    fn registry_loads() {
        let r = registry();
        assert!(r.fields().len() > 250);
        let f = r.get("notrump.one_nt.range_min").unwrap();
        assert_eq!(f.kind, FieldKind::Int);
        assert_eq!(f.default, Some(Value::Int(15)));
    }

    #[test]
    fn enum_values_match_aliases_and_other_spellings() {
        let f = registry().get("competitive.vs_1nt_strong.system").unwrap();
        let t = |s: &str| f.normalize(Value::Text(s.into()));
        let v = |s: &str| Ok(Value::Text(s.into()));
        assert_eq!(t("meckwell"), v("meckwell"));
        assert_eq!(t("Meckwell"), v("meckwell"));
        assert_eq!(t("Multi-Landy"), v("multi_landy"));
        assert_eq!(t("DONT"), v("dont"));
        assert_eq!(t("Modified Cappelletti"), v("modified_cappelletti"));
        assert_eq!(t("Hamilton"), v("cappelletti"));
        assert!(t("Suction").is_err());
        // The older path still loads into the field.
        let old = registry()
            .get("competitive.defense_vs_strong_nt.convention")
            .unwrap();
        assert_eq!(old.path, "competitive.vs_1nt_strong.system");
    }

    #[test]
    fn fields_name_their_teaching_skills() {
        let r = Registry::parse(concat!(
            "[notrump]\n",
            r#""stayman.play" = { kind = "bool", label = "Stayman", skill = "bidding_conventions/stayman" }"#,
            "\n",
            r#""smolen.play" = { kind = "bool", label = "Smolen", skill = ["bidding_conventions/smolen", "bidding_conventions/stayman"] }"#,
            "\n",
            r#""x" = { kind = "bool", label = "X" }"#,
            "\n",
        ))
        .unwrap();
        assert_eq!(
            r.get("notrump.stayman.play").unwrap().skill,
            ["bidding_conventions/stayman"]
        );
        assert_eq!(r.get("notrump.smolen.play").unwrap().skill.len(), 2);
        assert!(r.get("notrump.x").unwrap().skill.is_empty());
        let bad = Registry::parse(concat!(
            "[notrump]\n",
            r#""stayman.play" = { kind = "bool", label = "S", skill = "Stayman" }"#,
        ))
        .unwrap_err();
        assert!(bad.message.contains("not a skill path"), "{bad}");
        let bad = Registry::parse(concat!(
            "[notrump]\n",
            r#""stayman.play" = { kind = "bool", label = "S", skill = 3 }"#,
        ));
        assert!(bad.is_err());
        // This repository's fields carry them.
        assert_eq!(
            registry().get("notrump.stayman.play").unwrap().skill,
            ["bidding_conventions/stayman"]
        );
    }

    #[test]
    fn aliases_resolve_to_canonical_field() {
        let f = registry()
            .get("other_conventions.blackwood.rkcb_1430")
            .unwrap();
        assert_eq!(f.path, "slam.blackwood.rkcb_1430");
    }

    #[test]
    fn normalize_checks_kind_bounds_and_options() {
        let r = registry();
        let range = r.get("notrump.one_nt.range_min").unwrap();
        assert!(range.normalize(Value::Int(40)).is_err());
        assert!(range.normalize(Value::Bool(true)).is_err());
        let len = r.get("minor_openings.one_diamond.min_length").unwrap();
        assert_eq!(len.normalize(Value::Int(4)), Ok(Value::Text("4".into())));
        assert!(len.normalize(Value::Text("7".into())).is_err());
    }
}
