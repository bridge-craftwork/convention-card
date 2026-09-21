//! JSON Schema for card JSON, generated from the registry, for the editor.

use serde_json::{json, Map, Value as Json};

use crate::registry::{registry, FieldDef, FieldKind};

/// A JSON Schema (draft 2020-12) describing nested card JSON.
///
/// `additionalProperties` stays open: the editor stores its own leaves
/// (`skill_path`) and older cards may hold fields not yet in the registry.
pub fn json_schema() -> Json {
    let mut settings = Json::Object(Map::new());
    for field in registry().fields() {
        insert(&mut settings, &field.path, leaf(field));
    }
    let mut properties = match settings {
        Json::Object(m) => m,
        _ => unreachable!(),
    };
    properties.insert(
        "schema_version".into(),
        json!({ "const": crate::card::SCHEMA_VERSION }),
    );
    properties.insert("format".into(), json!({ "const": "bridge_classroom" }));
    properties.insert(
        "metadata".into(),
        json!({
            "type": "object",
            "properties": {
                "name": { "type": "string" },
                "description": { "type": "string" },
                "tags": { "type": "array", "items": { "type": "string" } }
            }
        }),
    );
    properties.insert(
        "bba_passthrough".into(),
        json!({
            "type": "object",
            "description": "BBA .bbsa keys with no card field yet, kept for lossless export",
            "additionalProperties": { "type": "integer" }
        }),
    );
    json!({
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "title": "Bridge convention card",
        "type": "object",
        "properties": properties,
    })
}

fn leaf(field: &FieldDef) -> Json {
    let mut s = Map::new();
    s.insert("title".into(), field.label.clone().into());
    if let Some(desc) = &field.desc {
        s.insert("description".into(), desc.clone().into());
    }
    match field.kind {
        FieldKind::Bool => {
            s.insert("type".into(), "boolean".into());
        }
        FieldKind::Int => {
            s.insert("type".into(), "integer".into());
            if let Some(min) = field.min {
                s.insert("minimum".into(), min.into());
            }
            if let Some(max) = field.max {
                s.insert("maximum".into(), max.into());
            }
        }
        FieldKind::Enum => {
            s.insert("enum".into(), field.options.clone().into());
        }
        FieldKind::Text => {
            s.insert("type".into(), "string".into());
        }
    }
    if let Some(d) = &field.default {
        s.insert("default".into(), d.to_json());
    }
    Json::Object(s)
}

/// Insert `leaf` at `path`, creating `{"type": "object", "properties": ...}`
/// levels on the way.
fn insert(properties: &mut Json, path: &str, leaf: Json) {
    let parts: Vec<&str> = path.split('.').collect();
    let mut cur = properties;
    for part in &parts[..parts.len() - 1] {
        let map = cur.as_object_mut().expect("properties is an object");
        let node = map
            .entry(*part)
            .or_insert_with(|| json!({ "type": "object", "properties": {} }));
        cur = &mut node["properties"];
    }
    cur.as_object_mut()
        .expect("properties is an object")
        .insert(parts[parts.len() - 1].to_string(), leaf);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn schema_nests_fields_by_path() {
        let s = json_schema();
        let range = &s["properties"]["notrump"]["properties"]["one_nt"]["properties"]["range_min"];
        assert_eq!(range["type"], "integer");
        assert_eq!(range["default"], 15);
    }
}
