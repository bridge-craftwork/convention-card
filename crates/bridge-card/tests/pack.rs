//! Reading a pack (`bridge-common-conventions`) and schema 3 cards.
//!
//! The pack is content, not part of this repository: these tests read it
//! from `BRIDGE_PACK_DIR`, or from a checkout beside this one, and pass
//! without doing anything when neither is there.

use std::path::PathBuf;

use bridge_card::{bbsa, Card, Value, Vocabulary};

fn pack_dir() -> Option<PathBuf> {
    let dir = std::env::var_os("BRIDGE_PACK_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../bridge-common-conventions")
        });
    dir.join("bridge-pack.toml").is_file().then_some(dir)
}

fn vocab() -> Option<Vocabulary> {
    let dir = pack_dir()?;
    Some(Vocabulary::load_pack(&dir, bridge_card::standard::BBSA_MAP).expect("the pack loads"))
}

fn load(v: &Vocabulary, json: &str) -> Card {
    Card::from_json(v, json).expect("the card loads").0
}

#[test]
fn addresses_and_schema_2_paths_name_the_same_fields() {
    let Some(v) = vocab() else { return };
    let r = v.registry();
    assert_eq!(
        r.get("notrump.texas.play").unwrap().path,
        "bidding_conventions/texas"
    );
    assert_eq!(
        r.get("notrump.texas.two_under").unwrap().path,
        "bidding_conventions/texas:two_under"
    );
    assert_eq!(
        r.get("competitive.lebensohl_weak_twos.play").unwrap().path,
        "competitive_bidding/lebensohl:after_weak_two_double"
    );
    assert!(r.get("notrump.one_nt.range_min").is_some());
    assert!(r.get("defence_to_1nt.strong").is_some());
}

#[test]
fn a_bare_entry_plays_the_convention_with_its_defaults() {
    let Some(v) = vocab() else { return };
    let card = load(
        &v,
        r#"{"schema_version":"3.0","conventions":{
            "bidding_conventions/smolen":{},
            "competitive_bidding/lebensohl":{},
            "bidding_conventions/gerber":{"play":false}},
          "settings":{"notrump":{"one_nt":{"range_min":14}}}}"#,
    );
    assert!(card.is_on("bidding_conventions/smolen"));
    assert!(card.is_on("notrump.smolen.play"));
    assert!(!card.is_on("bidding_conventions/gerber"));
    assert!(!card.is_on("bidding_conventions/stayman"));
    // The main place is on for a bare entry, and only for a played one.
    assert!(card.is_on("competitive_bidding/lebensohl:over_1nt_interference"));
    assert!(!card.is_on("competitive_bidding/lebensohl:after_weak_two_double"));
    assert!(!card.is_on("competitive_bidding/rubensohl:over_1nt_interference"));
    assert_eq!(
        card.effective("notrump.one_nt.range_min"),
        Some(&Value::Int(14))
    );
}

#[test]
fn a_function_reads_the_convention_that_fills_it() {
    let Some(v) = vocab() else { return };
    let card = load(
        &v,
        r#"{"schema_version":"3.0","conventions":{
            "competitive_bidding/dont":{"for":["defence_to_1nt.strong"]},
            "competitive_bidding/cappelletti":{"for":["defence_to_1nt.weak"]}}}"#,
    );
    assert_eq!(
        card.effective("defence_to_1nt.strong"),
        Some(&Value::Text("competitive_bidding/dont".into()))
    );
    assert_eq!(
        card.effective("defence_to_1nt.weak"),
        Some(&Value::Text("competitive_bidding/cappelletti".into()))
    );
    // Schema 2's setting still reads, as its option word.
    assert_eq!(
        card.effective("competitive.vs_1nt_strong.system"),
        Some(&Value::Text("dont".into()))
    );
    // Two conventions for one part: a conflict, and nothing fills it.
    let (card, report) = Card::from_json(
        &v,
        r#"{"schema_version":"3.0","conventions":{
            "competitive_bidding/dont":{},"competitive_bidding/meckwell":{}}}"#,
    )
    .unwrap();
    assert_eq!(card.effective("defence_to_1nt.strong"), None);
    assert_eq!(report.conflicts.len(), 2);
}

#[test]
fn a_schema_2_card_migrates() {
    let Some(v) = vocab() else { return };
    let (card, report) = Card::from_json(
        &v,
        r#"{"schema_version":"2.0",
          "notrump":{"texas":{"play":true,"two_under":true},
                     "one_nt":{"range_min":15},
                     "stayman":{"play":false,"puppet_1nt":true}},
          "major_openings":{"bergen_raises":{"reverse":true}},
          "competitive":{"vs_1nt_strong":{"system":"meckwell","dbl":"minor or majors"},
                         "dont":{"play":true},
                         "lebensohl_weak_twos":{"play":true},
                         "unusual_2nt":{"play":false}},
          "other_agreements":[{"id":"bidding_conventions/mccabe","section":"two_level","text":"McCabe"},
                              {"text":"Something of our own"}]}"#,
    )
    .unwrap();
    assert_eq!(report.migrated.as_deref(), Some("2.0"));
    assert!(card.is_on("bidding_conventions/texas"));
    assert!(card.is_on("bidding_conventions/texas:two_under"));
    assert!(!card.is_on("bidding_conventions/stayman"));
    assert!(card.is_on("bidding_conventions/stayman:puppet_1nt"));
    // A treatment on with the switch never set: the entry is played.
    assert!(card.is_on("bidding_conventions/bergen_raises"));
    // The setting's convention; DONT's switch did nothing beside it.
    assert_eq!(
        card.effective("defence_to_1nt.strong"),
        Some(&Value::Text("competitive_bidding/meckwell".into()))
    );
    assert_eq!(card.get("competitive_bidding/dont"), None);
    assert_eq!(
        card.limited_to("competitive_bidding/meckwell"),
        Some(vec!["defence_to_1nt.strong".to_string()])
    );
    // One place on: the entry is played and the other place is off.
    assert!(card.is_on("competitive_bidding/lebensohl"));
    assert!(card.is_on("competitive_bidding/lebensohl:after_weak_two_double"));
    assert!(!card.is_on("competitive_bidding/lebensohl:over_1nt_interference"));
    // Every place off: agreed not to play.
    assert_eq!(
        card.get("competitive_bidding/unusual_notrump"),
        Some(&Value::Bool(false))
    );
    assert!(card.is_on("bidding_conventions/mccabe"));
    assert_eq!(card.other_agreements.len(), 1);
    assert_eq!(
        card.effective("competitive.vs_1nt_strong.dbl"),
        Some(&Value::Text("minor or majors".into()))
    );

    // Written as schema 3, and read back the same.
    let json = card.to_json();
    assert_eq!(json["schema_version"], "3.0");
    assert_eq!(
        json["conventions"]["bidding_conventions/texas"]["two_under"],
        true
    );
    assert_eq!(
        json["conventions"]["bidding_conventions/stayman"]["play"],
        false
    );
    assert_eq!(
        json["conventions"]["bidding_conventions/mccabe"]["text"],
        "McCabe"
    );
    assert_eq!(json["settings"]["notrump"]["one_nt"]["range_min"], 15);
    let again = load(&v, &json.to_string());
    assert_eq!(again.to_json(), json);
}

#[test]
fn every_stock_card_migrates_and_reads_as_schema_2_did() {
    let Some(v) = vocab() else { return };
    let old = bridge_card::standard::vocabulary().unwrap();
    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/bbsa");
    let mut seen = 0;
    for entry in std::fs::read_dir(dir).into_iter().flatten().flatten() {
        let path = entry.path();
        if path.extension().is_none_or(|x| x != "bbsa") {
            continue;
        }
        let text = std::fs::read_to_string(&path).unwrap();
        let (card2, _) = bbsa::import(&old, &text, None).unwrap();
        let card3 = load(&v, &card2.to_json_string());
        seen += 1;
        // Every value the schema 2 card stored reads the same by its old path.
        for (p, value) in card2.values() {
            let field = v
                .registry()
                .get(p)
                .unwrap_or_else(|| panic!("{p} is not in the pack"));
            if field.derived.is_some() {
                continue;
            }
            if let Some(got) = card3.get(p) {
                assert_eq!(got, value, "{}: {p}", path.display());
            }
        }
    }
    assert!(seen > 0);
}
