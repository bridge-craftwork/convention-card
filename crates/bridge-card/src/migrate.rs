//! Card schema upgrades (`spec/migrations/`, ADR-0002).
//!
//! A card records its `schema_version` at the top of `card_data`. One whose
//! version is missing or older than [`CARD_SCHEMA_VERSION`] is upgraded once,
//! when it is read, by the migration files in order: renamed fields move to
//! their new paths and the few value changes are made. [`crate::Card::from_json`]
//! does this for every card it loads (and says so in
//! [`crate::LoadReport::migrated`]); [`upgrade`] does it to bare JSON. The
//! rules and their order are the TOML file's header
//! (`spec/migrations/1-to-2.toml`); the JavaScript library's `js/migrate.js`
//! follows the same file.

use std::sync::OnceLock;

use serde::Deserialize;
use serde_json::{Map, Value as Json};

/// The schema version every card this crate writes records.
pub const CARD_SCHEMA_VERSION: &str = "2.0";

/// `spec/migrations/1-to-2.toml`: schema 1.x to 2.0.
pub const MIGRATION_1_TO_2: &str = include_str!("../../../spec/migrations/1-to-2.toml");

#[derive(Debug, Deserialize)]
struct Migration {
    to: String,
    #[serde(default)]
    rename: toml::Table,
    #[serde(default)]
    split: Vec<Split>,
    #[serde(default)]
    select: Vec<Select>,
    #[serde(default)]
    any: Vec<Any>,
}

#[derive(Debug, Deserialize)]
struct Split {
    from: String,
    play: String,
    style: String,
    off: String,
}

#[derive(Debug, Deserialize)]
struct Select {
    play: String,
    style: String,
    options: Vec<SelectOption>,
}

#[derive(Debug, Deserialize)]
struct SelectOption {
    #[serde(rename = "box")]
    path: String,
    value: String,
}

#[derive(Debug, Deserialize)]
struct Any {
    set: String,
    from: Vec<String>,
}

fn migrations() -> &'static [Migration] {
    static M: OnceLock<Vec<Migration>> = OnceLock::new();
    M.get_or_init(|| {
        vec![toml::from_str(MIGRATION_1_TO_2).expect("spec/migrations/1-to-2.toml is valid")]
    })
}

fn major(version: Option<&Json>) -> u64 {
    let text = match version {
        None | Some(Json::Null) => return 1,
        Some(Json::String(s)) => s.clone(),
        Some(other) => other.to_string(),
    };
    let digits: String = text.chars().take_while(char::is_ascii_digit).collect();
    digits.parse().unwrap_or(1)
}

/// Whether `card_data` (a JSON object) is older than [`CARD_SCHEMA_VERSION`].
pub fn needs_upgrade(card_data: &Json) -> bool {
    card_data.as_object().is_some_and(|top| {
        major(top.get("schema_version")) < major(Some(&Json::from(CARD_SCHEMA_VERSION)))
    })
}

/// Upgrade bare `card_data` in place to [`CARD_SCHEMA_VERSION`], recording
/// the new version. Returns the version the card was saved in when it was
/// upgraded (`"1.0"` when it recorded none), or `None` when it was already
/// current (or is not an object), in which case nothing changed.
pub fn upgrade(card_data: &mut Json) -> Option<String> {
    if !needs_upgrade(card_data) {
        return None;
    }
    let top = card_data.as_object_mut()?;
    let saved = match top.get("schema_version") {
        None | Some(Json::Null) => "1.0".to_string(),
        Some(Json::String(s)) => s.clone(),
        Some(other) => other.to_string(),
    };
    for m in migrations() {
        if major(top.get("schema_version")) >= major(Some(&Json::from(m.to.as_str()))) {
            continue;
        }
        let original = top.clone();
        apply(m, top, &original);
        top.insert("schema_version".into(), Json::from(m.to.as_str()));
    }
    Some(saved)
}

fn apply(m: &Migration, card: &mut Map<String, Json>, original: &Map<String, Json>) {
    let mut writes: Vec<(String, Json)> = Vec::new();
    let take = |card: &mut Map<String, Json>, path: &str| {
        let v = leaf(original, path).cloned();
        if v.is_some() {
            take_path(card, path);
        }
        v
    };
    for (from, to) in &m.rename {
        let Some(to) = to.as_str() else { continue };
        if let Some(v) = take(card, from) {
            writes.push((to.to_string(), v));
        }
    }
    for s in &m.split {
        let Some(Json::String(v)) = leaf(original, &s.from) else {
            continue;
        };
        take_path(card, &s.from);
        if *v == s.off {
            writes.push((s.play.clone(), Json::Bool(false)));
        } else {
            writes.push((s.play.clone(), Json::Bool(true)));
            writes.push((s.style.clone(), Json::String(v.clone())));
        }
    }
    for s in &m.select {
        let mut found = false;
        let mut style = None;
        for o in &s.options {
            let Some(v) = take(card, &o.path) else {
                continue;
            };
            found = true;
            if v == Json::Bool(true) && style.is_none() {
                style = Some(o.value.clone());
            }
        }
        match style {
            Some(style) => {
                writes.push((s.play.clone(), Json::Bool(true)));
                writes.push((s.style.clone(), Json::String(style)));
            }
            None if found => writes.push((s.play.clone(), Json::Bool(false))),
            None => {}
        }
    }
    for a in &m.any {
        if a.from
            .iter()
            .any(|p| leaf(original, p) == Some(&Json::Bool(true)))
        {
            writes.push((a.set.clone(), Json::Bool(true)));
        }
    }
    // The first writer wins; a value the card already has wins over them all.
    for (path, value) in writes {
        if lookup(card, &path).is_none() {
            write_new(card, &path, value);
        }
    }
}

fn lookup<'a>(top: &'a Map<String, Json>, path: &str) -> Option<&'a Json> {
    let mut parts = path.split('.');
    let mut cur = top.get(parts.next()?)?;
    for p in parts {
        cur = cur.as_object()?.get(p)?;
    }
    Some(cur)
}

/// The leaf at `path`: none for a missing path or an object.
fn leaf<'a>(top: &'a Map<String, Json>, path: &str) -> Option<&'a Json> {
    lookup(top, path).filter(|v| !v.is_object())
}

/// Take the leaf at `path` off the card, removing objects it leaves empty.
fn take_path(top: &mut Map<String, Json>, path: &str) {
    fn go(map: &mut Map<String, Json>, parts: &[&str]) {
        match parts {
            [] => {}
            [last] => {
                if map.get(*last).is_some_and(|v| !v.is_object()) {
                    map.remove(*last);
                }
            }
            [first, rest @ ..] => {
                if let Some(Json::Object(child)) = map.get_mut(*first) {
                    go(child, rest);
                    if child.is_empty() {
                        map.remove(*first);
                    }
                }
            }
        }
    }
    let parts: Vec<&str> = path.split('.').collect();
    go(top, &parts);
}

fn write_new(top: &mut Map<String, Json>, path: &str, value: Json) {
    let parts: Vec<&str> = path.split('.').collect();
    let (last, parents) = parts.split_last().expect("a path has a part");
    let mut cur = top;
    for p in parents {
        let entry = cur
            .entry(p.to_string())
            .or_insert_with(|| Json::Object(Map::new()));
        if !entry.is_object() {
            *entry = Json::Object(Map::new());
        }
        cur = entry.as_object_mut().expect("just made an object");
    }
    cur.insert(last.to_string(), value);
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn up(card: Json) -> (Json, Option<String>) {
        let mut card = card;
        let saved = upgrade(&mut card);
        (card, saved)
    }

    #[test]
    fn renames_move_and_aliases_fold_in() {
        let (card, saved) = up(json!({
            "schema_version": "1.0",
            "notrump": {"transfers": {"jacoby": true, "texas_4d": true, "skill_path": "x"},
                        "two_nt": {"puppet": true, "range_min": 20}},
            "three_nt": {"one_suit": true},
            "other_conventions": {"blackwood": {"standard": false, "notes": "n"}}
        }));
        assert_eq!(saved.as_deref(), Some("1.0"));
        assert_eq!(card["schema_version"], "2.0");
        assert_eq!(card["notrump"]["jacoby_transfers"]["play"], true);
        assert_eq!(card["notrump"]["texas"]["bid_4d"], true);
        assert_eq!(card["notrump"]["stayman"]["puppet_2nt"], true);
        assert_eq!(card["notrump"]["two_nt"], json!({"range_min": 20}));
        // Leaves no rule names stay where they were.
        assert_eq!(card["notrump"]["transfers"], json!({"skill_path": "x"}));
        assert_eq!(card["notrump"]["gambling_3nt"]["play"], true);
        assert!(card.get("three_nt").is_none(), "emptied objects go");
        assert_eq!(card["slam"]["blackwood"]["play"], false);
        assert_eq!(
            card["other_conventions"]["blackwood"],
            json!({"notes": "n"})
        );
    }

    #[test]
    fn value_changes() {
        // The enum becomes a switch and a style; `none` is the switch off.
        let (card, _) = up(json!({"notrump": {"minor_transfers": "four_way"}}));
        assert_eq!(
            card["notrump"]["minor_transfers"],
            json!({"play": true, "style": "four_way"})
        );
        let (card, _) =
            up(json!({"notrump": {"minor_transfers": "none", "transfers": {"two_s_clubs": true}}}));
        assert_eq!(
            card["notrump"]["minor_transfers"],
            json!({"play": false, "two_s_clubs": true})
        );
        // No enum: a box on turns the switch on.
        let (card, _) = up(json!({"notrump": {"two_nt": {"transfer_3s_clubs": true}}}));
        assert_eq!(
            card["notrump"]["minor_transfers"],
            json!({"over_2nt_3s_clubs": true, "play": true})
        );
        // RKCB: one switch and its style, from the box that is on.
        let (card, _) = up(
            json!({"slam": {"blackwood": {"rkcb_1430": false, "rkcb_0314": true,
                                                          "minor_0314": true}}}),
        );
        assert_eq!(
            card["slam"]["rkcb"],
            json!({"minor_0314": true, "play": true, "style": "0314"})
        );
        assert!(card["slam"].get("blackwood").is_none());
        let (card, _) = up(json!({"other_conventions": {"blackwood": {"rkcb_1430": true}}}));
        assert_eq!(card["slam"]["rkcb"], json!({"play": true, "style": "1430"}));
        let (card, _) = up(json!({"slam": {"blackwood": {"rkcb_1430": false}}}));
        assert_eq!(card["slam"]["rkcb"], json!({"play": false}));
        // Reverse Flannery: on when any of its openings is.
        let (card, _) = up(json!({"two_level": {"reverse_flannery": {"two_s": true}}}));
        assert_eq!(
            card["two_level"]["reverse_flannery"],
            json!({"two_s": true, "play": true})
        );
        let (card, _) = up(json!({"two_level": {"two_diamonds": {"reverse_flannery": true}}}));
        assert_eq!(
            card["two_level"]["reverse_flannery"],
            json!({"two_d": true, "play": true})
        );
    }

    #[test]
    fn a_current_card_is_left_alone() {
        let current = json!({"schema_version": "2.0",
                             "notrump": {"minor_transfers": {"play": true, "style": "relay"}},
                             "three_nt": {"one_suit": true}});
        let (card, saved) = up(current.clone());
        assert_eq!(saved, None);
        assert_eq!(card, current);
        // A 1.x card already in 2.0 paths is not disturbed either.
        let (card, _) = up(
            json!({"notrump": {"minor_transfers": {"play": true, "style": "relay"},
                                              "jacoby_transfers": {"play": true}}}),
        );
        assert_eq!(
            card,
            json!({"notrump": {"minor_transfers": {"play": true, "style": "relay"},
                               "jacoby_transfers": {"play": true}},
                   "schema_version": "2.0"})
        );
    }

    #[test]
    fn every_path_written_is_a_field_and_none_taken_still_is() {
        let vocab = crate::test_vocabulary();
        let registry = vocab.registry();
        for m in migrations() {
            let mut written: Vec<&str> = m.rename.values().filter_map(|v| v.as_str()).collect();
            let mut taken: Vec<&str> = m.rename.keys().map(String::as_str).collect();
            for s in &m.split {
                written.extend([s.play.as_str(), s.style.as_str()]);
                taken.push(&s.from);
            }
            for s in &m.select {
                written.extend([s.play.as_str(), s.style.as_str()]);
                taken.extend(s.options.iter().map(|o| o.path.as_str()));
            }
            written.extend(m.any.iter().map(|a| a.set.as_str()));
            for p in written {
                assert!(
                    registry.get(p).is_some_and(|f| f.path == p),
                    "writes {p}: not a field"
                );
            }
            for p in taken {
                assert!(registry.get(p).is_none(), "takes {p}: still a field");
            }
        }
    }
}
