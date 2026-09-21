//! The field registry: every setting a card can hold, from `data/fields.toml`.

use std::collections::HashMap;
use std::fmt;
use std::sync::OnceLock;

use serde::{Deserialize, Serialize};

use crate::Error;

const FIELDS_TOML: &str = include_str!("../data/fields.toml");

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
                    Ok(Value::Text(s))
                } else {
                    Err(format!("{s:?} is not one of {:?}", self.options))
                }
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

/// The built-in registry from `data/fields.toml`.
pub fn registry() -> &'static Registry {
    static REGISTRY: OnceLock<Registry> = OnceLock::new();
    REGISTRY.get_or_init(|| Registry::parse(FIELDS_TOML).expect("data/fields.toml is invalid"))
}

impl Registry {
    /// Parse a registry in the `data/fields.toml` format.
    pub fn parse(text: &str) -> Result<Registry, Error> {
        let table: toml::Table = text
            .parse()
            .map_err(|e| Error::new(format!("fields.toml: {e}")))?;
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

    #[test]
    fn builtin_registry_loads() {
        let r = registry();
        assert!(r.fields().len() > 250);
        let f = r.get("notrump.one_nt.range_min").unwrap();
        assert_eq!(f.kind, FieldKind::Int);
        assert_eq!(f.default, Some(Value::Int(15)));
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
