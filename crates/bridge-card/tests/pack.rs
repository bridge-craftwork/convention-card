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
        "bidding_conventions/texas:over_1nt"
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
fn a_listed_agreement_yields_to_the_cards_own_choice() {
    // The card names its defence to 1NT; Suction is only listed (recognised
    // from a note). The named defence wins and Suction stays listed.
    let Some(v) = vocab() else { return };
    let (card, report) = Card::from_json(
        &v,
        r#"{"schema_version":"2.0",
            "competitive":{"vs_1nt_strong":{"system":"Meckwell"}},
            "other_agreements":[{"id":"competitive_bidding/suction","text":"Suction"}]}"#,
    )
    .unwrap();
    assert_eq!(
        card.effective("defence_to_1nt.strong"),
        Some(&Value::Text("competitive_bidding/meckwell".into()))
    );
    assert!(report.conflicts.is_empty());
    assert_eq!(card.other_agreements.len(), 1);
    // With no defence chosen, the note is all the card says: it plays it.
    let card = load(
        &v,
        r#"{"schema_version":"2.0",
            "other_agreements":[{"id":"competitive_bidding/suction","text":"Suction"}]}"#,
    );
    assert_eq!(
        card.effective("defence_to_1nt.strong"),
        Some(&Value::Text("competitive_bidding/suction".into()))
    );
}

#[test]
fn a_tick_beats_a_convention_inferred_from_its_note() {
    // Strong jump shifts are ticked; a note sits under weak jump shifts.
    // The note is kept, and does not turn weak jump shifts on against them.
    let Some(v) = vocab() else { return };
    let (card, report) = Card::from_json(
        &v,
        r#"{"schema_version":"2.0",
            "general":{"jump_shifts":{"strong_2":true}},
            "other_conventions":{"weak_jump_shifts_notes":"only by a passed hand"}}"#,
    )
    .unwrap();
    assert!(card.is_on("bidding_conventions/strong_jump_shifts"));
    assert!(!card.is_on("bidding_conventions/weak_jump_shifts"));
    assert!(report.conflicts.is_empty());
    // The note is kept; a reader of what the card plays does not see it
    // while weak jump shifts are off.
    assert_eq!(
        card.get("bidding_conventions/weak_jump_shifts:notes"),
        Some(&Value::Text("only by a passed hand".into()))
    );
    assert_eq!(
        card.effective("bidding_conventions/weak_jump_shifts:notes"),
        None
    );
    // With nothing ticked against it, the note alone still plays it.
    let card = load(
        &v,
        r#"{"schema_version":"2.0",
            "other_conventions":{"weak_jump_shifts_notes":"only by a passed hand"}}"#,
    );
    assert!(card.is_on("bidding_conventions/weak_jump_shifts"));
    // The card's 4NT line is a setting: it switches nothing on.
    let card = load(
        &v,
        r#"{"schema_version":"2.0","slam":{"blackwood":{"notes":"0314 in the minors"}}}"#,
    );
    assert!(!card.is_on("bidding_conventions/blackwood"));
    assert_eq!(
        card.effective("other_conventions.blackwood.notes"),
        Some(&Value::Text("0314 in the minors".into()))
    );
}

#[test]
fn the_cards_own_wording_for_a_defence_is_kept() {
    let Some(v) = vocab() else { return };
    let (card, report) = Card::from_json(
        &v,
        r#"{"schema_version":"2.0","competitive":{
            "vs_1nt_strong":{"system":"Strong - Suction"},
            "vs_1nt_weak":{"system":"Weak - Suction"}}}"#,
    )
    .unwrap();
    assert!(report.conflicts.is_empty());
    for part in ["defence_to_1nt.strong", "defence_to_1nt.weak"] {
        assert_eq!(
            card.effective(part),
            Some(&Value::Text("competitive_bidding/suction".into())),
            "{part}"
        );
    }
    let json = card.to_json();
    assert_eq!(
        json["conventions"]["competitive_bidding/suction"]["text"],
        "Strong - Suction"
    );
    // A name no option covers chooses no convention and stays the setting.
    let (card, _) = Card::from_json(
        &v,
        r#"{"schema_version":"2.0","competitive":{"vs_1nt_strong":{"system":"(Our own)"}}}"#,
    )
    .unwrap();
    assert_eq!(card.effective("defence_to_1nt.strong"), None);
    assert_eq!(
        card.to_json()["settings"]["competitive"]["vs_1nt_strong"]["system"],
        "(Our own)"
    );
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
    assert!(card.is_on("bidding_conventions/puppet_stayman:over_1nt"));
    assert!(card.is_on("notrump.stayman.puppet_1nt"));
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
    // Card schema 2's field list, frozen (`tests/fixtures/schema2/`).
    let fields =
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/schema2/fields.toml");
    let old = Vocabulary::parse(
        &std::fs::read_to_string(fields).unwrap(),
        bridge_card::standard::BBSA_MAP,
    )
    .unwrap();
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

#[test]
fn a_two_level_opening_is_the_convention_that_claims_it() {
    let Some(v) = vocab() else { return };
    // `weak` for all three is Weak Twos; a ticked convention beside it for
    // the same bid is a conflict, which a rule reads as its own default.
    let (card, report) = Card::from_json(
        &v,
        r#"{"schema_version":"2.0","two_level":{
            "two_diamonds":{"meaning":"weak"},"two_hearts":{"meaning":"weak"},
            "two_spades":{"meaning":"intermediate"},
            "mini_roman":{"play":true}}}"#,
    )
    .unwrap();
    let weak = Value::Text("bidding_conventions/weak_2s".into());
    assert_eq!(card.effective("opening.2h"), Some(&weak));
    assert_eq!(
        card.effective("opening.2s"),
        Some(&Value::Text("bidding_conventions/intermediate_twos".into()))
    );
    assert_eq!(card.effective("opening.2d"), None);
    assert_eq!(report.conflicts.len(), 1);
    // The old setting still reads, for the tools that print it.
    assert_eq!(
        card.effective("two_level.two_hearts.meaning"),
        Some(&Value::Text("weak".into()))
    );
    let json = card.to_json();
    assert_eq!(
        json["conventions"]["bidding_conventions/weak_2s"]["for"],
        serde_json::json!(["opening.2d", "opening.2h"])
    );
    // `conventional` leaves the bid to the card's entries; with none, the
    // card has still spoken: `none`, not a rule's default of weak.
    let card = load(
        &v,
        r#"{"schema_version":"2.0","two_level":{"two_diamonds":{"meaning":"conventional"}}}"#,
    );
    assert_eq!(
        card.effective("opening.2d"),
        Some(&Value::Text("none".into()))
    );
    let card = load(
        &v,
        r#"{"schema_version":"2.0","two_level":{
            "two_diamonds":{"meaning":"conventional"},"flannery":{"play":true}}}"#,
    );
    assert_eq!(
        card.effective("opening.2d"),
        Some(&Value::Text("bidding_conventions/flannery".into()))
    );
    // Minorwood and Kickback both claim the ask below 4NT in the minors.
    let (card, report) = Card::from_json(
        &v,
        r#"{"schema_version":"2.0","slam":{"rkcb":{"play":true},
            "minorwood":{"play":true},"kickback":{"play":true}}}"#,
    )
    .unwrap();
    assert_eq!(
        card.effective("low_keycard_ask.hearts"),
        Some(&Value::Text("bidding_conventions/kickback".into()))
    );
    assert_eq!(card.effective("low_keycard_ask.clubs"), None);
    assert!(!report.conflicts.is_empty());
    assert_eq!(
        card.effective("ace_ask.minor"),
        Some(&Value::Text("bidding_conventions/roman_keycard".into()))
    );
}

#[test]
fn a_jump_shift_style_is_an_entry_and_fills_the_jump_over_a_minor() {
    let Some(v) = vocab() else { return };
    let strong = Value::Text("bidding_conventions/strong_jump_shifts".into());
    let weak = Value::Text("bidding_conventions/weak_jump_shifts".into());
    // The boxes are treatments of their convention, read by either name.
    let (card, report) = Card::from_json(
        &v,
        r#"{"schema_version":"2.0","general":{"jump_shifts":{
            "strong_2":true,"strong_3":false,"weak_2":false,"weak_3":true,"invitational":true}}}"#,
    )
    .unwrap();
    assert!(card.is_on("general.jump_shifts.strong_2"));
    assert!(card.is_on("bidding_conventions/strong_jump_shifts:two_level"));
    assert!(card.is_on("bidding_conventions/strong_jump_shifts:invitational"));
    assert!(card.is_on("bidding_conventions/weak_jump_shifts:three_level"));
    assert!(!card.is_on("general.jump_shifts.weak_2"));
    // Weak jump shifts are played, but not at the two level: only the
    // strong ones fill the jump to a major over a minor.
    assert!(card.is_on("bidding_conventions/weak_jump_shifts"));
    assert_eq!(card.effective("jump_to_major_over_minor.2h"), Some(&strong));
    assert!(report.conflicts.is_empty());

    // Both at the two level: a conflict. Reverse Flannery fills only the
    // jump its treatment names.
    let (card, report) = Card::from_json(
        &v,
        r#"{"schema_version":"2.0","general":{"jump_shifts":{"strong_2":true,"weak_2":true}}}"#,
    )
    .unwrap();
    assert_eq!(card.effective("jump_to_major_over_minor.2s"), None);
    assert_eq!(report.conflicts.len(), 2);
    let (card, report) = Card::from_json(
        &v,
        r#"{"schema_version":"2.0","general":{"jump_shifts":{"weak_2":true}},
            "two_level":{"reverse_flannery":{"play":true,"two_h":true}}}"#,
    )
    .unwrap();
    assert_eq!(card.effective("jump_to_major_over_minor.2s"), Some(&weak));
    assert_eq!(card.effective("jump_to_major_over_minor.2h"), None);
    assert_eq!(report.conflicts.len(), 1);

    // An explicit "no strong jump shifts" survives: not played, and the box
    // still reads off, where a silent card would take a rule's default.
    let card = load(
        &v,
        r#"{"schema_version":"2.0","general":{"jump_shifts":{"strong_2":false}}}"#,
    );
    assert_eq!(
        card.effective("general.jump_shifts.strong_2"),
        Some(&Value::Bool(false))
    );
    let silent = load(&v, r#"{"schema_version":"2.0"}"#);
    assert_eq!(silent.effective("general.jump_shifts.strong_2"), None);
}

/// The published snapshot (`pack.json`) reads as the source tree does: the
/// vendored copy in `spec/`, held to the shared cases, and, where a
/// checkout of the pack is beside this one at the same commit, to the same
/// addresses.
#[test]
fn the_snapshot_reads_as_the_source_tree_does() {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
    let text = std::fs::read_to_string(root.join("spec/pack.json")).unwrap();
    let pack = bridge_card::Pack::from_snapshot(&text).expect("the snapshot loads");
    let doc: serde_json::Value = serde_json::from_str(
        &std::fs::read_to_string(root.join("tests/migrations/2-to-3.cases.json")).unwrap(),
    )
    .unwrap();
    for case in doc["cases"].as_array().unwrap() {
        let serde_json::Value::Object(mut card) = case["before"].clone() else {
            panic!("a case's card is an object")
        };
        pack.upgrade_to_3(&mut card, &bridge_card::pack::Unset::Played);
        assert_eq!(
            serde_json::Value::Object(card),
            case["after"],
            "{}",
            case["name"]
        );
    }
    let v = Vocabulary::from_snapshot(&text, bridge_card::standard::BBSA_MAP).unwrap();
    assert!(v.registry().get("notrump.stayman.play").is_some());
    if let Some(dir) = pack_dir() {
        // Only where the checkout is at the commit the snapshot was built
        // from: every field, with the same kind and default.
        let tree = bridge_card::Pack::load(&dir).expect("the pack loads");
        let fields = |p: &bridge_card::Pack| -> Vec<String> {
            p.registry()
                .fields()
                .iter()
                .map(|f| format!("{} {:?} {:?}", f.path, f.kind, f.default))
                .collect()
        };
        if fields(&pack).len() == fields(&tree).len() {
            assert_eq!(fields(&pack), fields(&tree));
        }
    }
}

/// The cases the JavaScript library is held to as well
/// (js/__tests__/schema3.test.js), so the two readers of the pack's
/// migrations/2-to-3.toml agree.
#[test]
fn the_shared_schema_3_cases() {
    let Some(dir) = pack_dir() else { return };
    let pack = bridge_card::Pack::load(&dir).expect("the pack loads");
    let file =
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../tests/migrations/2-to-3.cases.json");
    let doc: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(file).unwrap()).unwrap();
    for case in doc["cases"].as_array().unwrap() {
        let serde_json::Value::Object(mut card) = case["before"].clone() else {
            panic!("a case's card is an object")
        };
        pack.upgrade_to_3(&mut card, &bridge_card::pack::Unset::Played);
        assert_eq!(
            serde_json::Value::Object(card),
            case["after"],
            "{}",
            case["name"]
        );
    }
}
