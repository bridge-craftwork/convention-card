//! The card-schema migration against the cases the JS library checks too
//! (`tests/migrations/1-to-2.cases.json`, js/__tests__/migrate.test.js), so
//! the two readers of `spec/migrations/` agree.

use std::fs;
use std::path::Path;

use bridge_card::{migrate, standard, Card};
use serde_json::Value as Json;

fn cases() -> Vec<Json> {
    let path =
        Path::new(env!("CARGO_MANIFEST_DIR")).join("../../tests/migrations/1-to-2.cases.json");
    let doc: Json = serde_json::from_str(&fs::read_to_string(path).unwrap()).unwrap();
    doc["cases"].as_array().unwrap().clone()
}

#[test]
fn every_case_upgrades_as_written() {
    let cases = cases();
    assert!(cases.len() >= 10);
    for c in cases {
        let mut card = c["before"].clone();
        let saved = migrate::upgrade(&mut card);
        assert_eq!(card, c["after"], "{}", c["name"]);
        let was_current = c["before"]["schema_version"] == "2.0";
        assert_eq!(saved.is_none(), was_current, "{}", c["name"]);
    }
}

#[test]
fn a_loaded_card_is_upgraded_and_saved_current() {
    let vocab = standard::vocabulary().unwrap();
    for c in cases() {
        let (card, report) = Card::from_json(&vocab, &c["before"].to_string()).unwrap();
        // Everything the migration writes is a field, read as such.
        assert!(
            report.invalid.is_empty(),
            "{}: {:?}",
            c["name"],
            report.invalid
        );
        let (expected, _) = Card::from_json(&vocab, &c["after"].to_string()).unwrap();
        assert_eq!(card, expected, "{}", c["name"]);
        assert_eq!(
            card.to_json()["schema_version"],
            migrate::CARD_SCHEMA_VERSION
        );
    }
}
