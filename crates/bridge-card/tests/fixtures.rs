//! Round trips over real cards: the Practice-Bidding-Scenarios `.bbsa` set
//! (current and older layouts) and the Bridge-Classroom seed card.

use std::fs;
use std::path::{Path, PathBuf};

use bridge_card::{bbsa, Card, Value};

fn bbsa_fixtures() -> Vec<PathBuf> {
    let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/bbsa");
    let mut files: Vec<_> = fs::read_dir(dir)
        .unwrap()
        .map(|e| e.unwrap().path())
        .filter(|p| p.extension().is_some_and(|e| e == "bbsa"))
        .collect();
    files.sort();
    assert!(files.len() >= 18);
    files
}

fn layout_of(text: &str) -> Vec<String> {
    bbsa::parse(text)
        .unwrap()
        .into_iter()
        .map(|(k, _)| k)
        .collect()
}

#[test]
fn every_bbsa_fixture_round_trips() {
    let current_layout = layout_of(&bbsa::export(&Card::new()).0);
    for path in bbsa_fixtures() {
        let text = fs::read_to_string(&path).unwrap();
        let name = path.file_stem().unwrap().to_str().unwrap();
        let (card, report) = bbsa::import(&text, Some(name)).unwrap();
        assert!(report.warnings.is_empty(), "{name}: {:?}", report.warnings);
        let (exported, _) = bbsa::export(&card);

        if layout_of(&text) == current_layout {
            // Same layout: export must reproduce the file exactly.
            assert_eq!(exported, text, "{name}: export differs from the original");
        } else {
            // Older layout: every setting must survive. Keys the old layout
            // lacked are written as 0, so they come back as explicit "off".
            let (again, _) = bbsa::import(&exported, Some(name)).unwrap();
            for (path, value) in card.values() {
                assert_eq!(
                    again.get(path),
                    Some(value),
                    "{name}: {path} changed on re-import"
                );
            }
            for (path, value) in again.values() {
                if card.get(path).is_none() {
                    assert_eq!(
                        value,
                        &Value::Bool(false),
                        "{name}: {path} appeared on re-import"
                    );
                }
            }
        }

        // Card JSON round trip.
        let (from_json, load) = Card::from_json(&card.to_json_string()).unwrap();
        assert!(load.is_clean(), "{name}: {load:?}");
        assert_eq!(from_json, card, "{name}: JSON round trip changed the card");
    }
}

#[test]
fn default_card_imports_expected_settings() {
    let text = fs::read_to_string(
        Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/bbsa/21GF-DEFAULT.bbsa"),
    )
    .unwrap();
    let (card, report) = bbsa::import(&text, None).unwrap();
    assert_eq!(
        card.get("general.system_category"),
        Some(&Value::Text("two_over_one".into()))
    );
    assert_eq!(card.get("notrump.one_nt.range_min"), Some(&Value::Int(15)));
    // The system preset expands into the structural fields (`[[derived]]`).
    assert!(card.is_on("major_openings.five_card_majors"));
    assert_eq!(
        card.get("major_openings.min_length_1st_2nd"),
        Some(&Value::Text("5".into()))
    );
    assert!(card.is_on("major_openings.two_over_one.game_force"));
    assert!(card.is_on("general.forcing_opening_2c"));
    assert!(!card.is_on("general.forcing_opening_1c"));
    assert!(!card.is_on("minor_openings.one_club.art_forcing"));
    assert!(card.is_on("notrump.smolen.play"));
    assert!(card.is_on("slam.blackwood.rkcb_1430"));
    assert!(!card.is_on("major_openings.drury.play"));
    // Passthrough keys are exactly the unmapped ones.
    for (key, _) in &report.passthrough {
        assert!(bbsa::mapping().get(key).is_none());
    }
}

#[test]
fn sayc_card_opens_five_card_majors() {
    let text = fs::read_to_string(
        Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/bbsa/Basic-Bridge.bbsa"),
    )
    .unwrap();
    let (card, _) = bbsa::import(&text, None).unwrap();
    assert_eq!(
        card.get("general.system_category"),
        Some(&Value::Text("sayc".into()))
    );
    assert!(card.is_on("major_openings.five_card_majors"));
    assert_eq!(
        card.get("major_openings.min_length_1st_2nd"),
        Some(&Value::Text("5".into()))
    );
    // A 2/1 in SAYC is forcing for one round, not to game.
    assert_eq!(
        card.get("major_openings.two_over_one.game_force"),
        Some(&Value::Bool(false))
    );
}

#[test]
fn precision_card_selects_precision() {
    let text = fs::read_to_string(
        Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/bbsa/Precision.bbsa"),
    )
    .unwrap();
    let (card, _) = bbsa::import(&text, None).unwrap();
    assert_eq!(
        card.get("general.system_category"),
        Some(&Value::Text("precision".into()))
    );
    // ... and the card says in its own fields that the 1C is the strong,
    // artificial and forcing opening, so 2C is natural.
    assert!(card.is_on("general.forcing_opening_1c"));
    assert!(card.is_on("minor_openings.one_club.art_forcing"));
    assert_eq!(
        card.get("general.forcing_opening_2c"),
        Some(&Value::Bool(false))
    );
    assert!(card.is_on("major_openings.five_card_majors"));
}

#[test]
fn seed_card_loads_through_aliases() {
    let text = fs::read_to_string(
        Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/21_intermediate_card.json"),
    )
    .unwrap();
    let (card, report) = Card::from_json(&text).unwrap();
    assert!(report.invalid.is_empty(), "{:?}", report.invalid);
    assert_eq!(card.metadata.name.as_deref(), Some("2/1 Intermediate"));
    assert!(card.is_on("notrump.transfers.jacoby"));
    assert!(card.is_on("slam.blackwood.rkcb_1430"));
    // `game_forcing` in the seed is `game_force` in the catalog.
    assert!(card.is_on("other_conventions.fourth_suit_forcing.game_force"));
    assert!(report
        .aliased
        .iter()
        .any(|(from, _)| from == "competitive.takeout_doubles.style"));

    // Saving and reloading keeps everything, including unknown leaves.
    let (again, _) = Card::from_json(&card.to_json_string()).unwrap();
    assert_eq!(again, card);
}

#[test]
fn minor_transfer_treatment_is_derived_from_bba_switches() {
    let style = |name: &str| {
        let text = fs::read_to_string(
            Path::new(env!("CARGO_MANIFEST_DIR")).join(format!("tests/fixtures/bbsa/{name}.bbsa")),
        )
        .unwrap();
        let (card, _) = bbsa::import(&text, None).unwrap();
        card.get("notrump.minor_transfers").cloned()
    };
    // 2S clubs and 3C diamonds: BBA's own treatment.
    assert_eq!(style("21GF-DEFAULT"), Some(Value::Text("bba".into())));
    // Minor Suit Stayman over 1NT, or 3C Puppet Stayman: not modelled.
    assert_eq!(style("21GF-MSS"), Some(Value::Text("none".into())));
    assert_eq!(style("21GF-Puppet"), Some(Value::Text("none".into())));
    // A card that never names it plays the default relay.
    assert_eq!(
        Card::new().effective("notrump.minor_transfers"),
        Some(&Value::Text("relay".into()))
    );
}
